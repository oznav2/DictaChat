import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0.5;
	return Math.max(0, Math.min(1, value));
}

// GET /api/memory/memory-bank - List memory bank items
export const GET: RequestHandler = async ({ url }) => {
	try {
		const status = url.searchParams.get("status") || "active";
		const tag = url.searchParams.get("tag");
		const limit = parseInt(url.searchParams.get("limit") || "100", 10);
		const offset = parseInt(url.searchParams.get("offset") || "0", 10);

		const query: Record<string, unknown> = {
			userId: ADMIN_USER_ID,
			status: status === "archived" ? "archived" : "active",
		};

		if (tag) {
			query.tags = tag;
		}

		const memories = await collections.memoryBank
			.find(query)
			.sort({ createdAt: -1 })
			.skip(offset)
			.limit(limit)
			.toArray();

		const total = await collections.memoryBank.countDocuments(query);

		return json({
			success: true,
			memories: memories.map((m) => ({
				...(() => {
					const importance = Number(m.importance);
					const confidence = Number(m.confidence);
					let derivedScore = 0.5;
					if (Number.isFinite(importance) && Number.isFinite(confidence)) {
						derivedScore = (importance + confidence) / 2;
					} else if (Number.isFinite(importance)) {
						derivedScore = importance;
					} else if (Number.isFinite(confidence)) {
						derivedScore = confidence;
					}
					return { score: clamp01(derivedScore) };
				})(),
				id: m._id.toString(),
				text: m.text,
				tags: m.tags || [],
				status: m.status,
				created_at: m.createdAt?.toISOString(),
				archived_at: m.archivedAt?.toISOString(),
				archived_reason: m.archivedReason,
				source: {
					toolName:
						typeof m.source === "string" && m.source
							? m.source.startsWith("http://") || m.source.startsWith("https://")
								? "fetch"
								: m.source
							: "conversation",
					url:
						typeof m.source === "string" &&
						(m.source.startsWith("http://") || m.source.startsWith("https://"))
							? m.source
							: null,
					description: m.contextType ?? null,
					descriptionHe: null,
					conversationTitle: null,
					collectedAt: m.createdAt?.toISOString(),
				},
			})),
			total,
		});
	} catch (err) {
		console.error("[API] Failed to list memory bank:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to list memories" },
			{ status: 500 }
		);
	}
};

// POST /api/memory/memory-bank - Add to memory bank
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { text, tags, importance } = await request.json();

		if (!text || typeof text !== "string") {
			return error(400, "text is required");
		}

		const facade = UnifiedMemoryFacade.getInstance();
		const result = await facade.store({
			userId: ADMIN_USER_ID,
			tier: "memory_bank",
			text,
			tags: tags || [],
			importance: importance || 0.8,
		});

		return json({
			success: true,
			id: result.memory_id,
			message: "Added to memory bank",
		});
	} catch (err) {
		console.error("[API] Failed to add to memory bank:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Failed to add to memory bank",
			},
			{ status: 500 }
		);
	}
};
