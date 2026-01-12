import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";

type ProgressPayload = {
	type: "progress";
	taskId: string;
	bookId: string;
	status: string;
	processingStage?: string;
	processingMessage?: string;
	doclingStatus?: string;
	doclingTaskId?: string | null;
	error?: string;
	processing_stats: { total_chunks: number; chunks_processed: number };
};

function toSse(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const GET: RequestHandler = async ({ params }) => {
	const taskId = params.taskId;
	const encoder = new TextEncoder();

	let closed = false;
	let pollInterval: NodeJS.Timeout | null = null;
	let keepaliveInterval: NodeJS.Timeout | null = null;
	let timeoutTimer: NodeJS.Timeout | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (event: string, payload: unknown) => {
				if (closed) return;
				controller.enqueue(encoder.encode(toSse(event, payload)));
			};

			const shutdown = () => {
				if (closed) return;
				closed = true;
				if (pollInterval) clearInterval(pollInterval);
				if (keepaliveInterval) clearInterval(keepaliveInterval);
				if (timeoutTimer) clearTimeout(timeoutTimer);
				controller.close();
			};

			const pollOnce = async () => {
				try {
					const book = await collections.books.findOne({ taskId });
					if (!book) {
						send("error", { type: "error", message: "Task not found" });
						shutdown();
						return;
					}

					const payload: ProgressPayload = {
						type: "progress",
						taskId,
						bookId: book._id.toString(),
						status: book.status,
						processingStage: book.processingStage,
						processingMessage: book.processingMessage,
						doclingStatus: book.doclingStatus,
						doclingTaskId: book.doclingTaskId,
						error: book.error,
						processing_stats: {
							total_chunks: book.totalChunks || 0,
							chunks_processed: book.chunksProcessed || 0,
						},
					};

					send("progress", payload);

					if (book.status === "completed" || book.status === "failed") {
						shutdown();
					}
				} catch (err) {
					send("error", {
						type: "error",
						message: err instanceof Error ? err.message : "Unknown error",
					});
					shutdown();
				}
			};

			pollOnce();

			pollInterval = setInterval(pollOnce, 1000);
			keepaliveInterval = setInterval(() => {
				if (closed) return;
				controller.enqueue(encoder.encode(`: ping\n\n`));
			}, 15000);

			timeoutTimer = setTimeout(
				() => {
					send("error", { type: "error", message: "Timeout" });
					shutdown();
				},
				5 * 60 * 1000
			);
		},
		cancel() {
			closed = true;
			if (pollInterval) clearInterval(pollInterval);
			if (keepaliveInterval) clearInterval(keepaliveInterval);
			if (timeoutTimer) clearTimeout(timeoutTimer);
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
		},
	});
};
