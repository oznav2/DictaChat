import type { MessageFile } from "$lib/types/Message";
import {
	type MessageUpdate,
	type MessageStreamUpdate,
	type MessageToolUpdate,
	type MessageToolCallUpdate,
	type MessageToolResultUpdate,
	type MessageToolErrorUpdate,
	type MessageTraceUpdate,
	type MessageTraceRunCreatedUpdate,
	type MessageTraceRunCompletedUpdate,
	type MessageTraceStepCreatedUpdate,
	type MessageTraceStepStatusUpdate,
	type MessageTraceStepDetailUpdate,
	type MessageMemoryUpdate,
	type MessageMemorySearchingUpdate,
	type MessageMemoryFoundUpdate,
	type MessageMemoryStoringUpdate,
	type MessageMemoryOutcomeUpdate,
	MessageUpdateType,
	MessageToolUpdateType,
	MessageTraceUpdateType,
	MessageMemoryUpdateType,
} from "$lib/types/MessageUpdate";

import { page } from "$app/state";
import type { KeyValuePair } from "$lib/types/Tool";

type MessageUpdateRequestOptions = {
	base: string;
	inputs?: string;
	messageId?: string;
	isRetry: boolean;
	isContinue?: boolean;
	files?: MessageFile[];
	// Optional: pass selected MCP server names (client-side selection)
	selectedMcpServerNames?: string[];
	// Optional: pass selected MCP server configs (for custom client-defined servers)
	selectedMcpServers?: Array<{ name: string; url: string; headers?: KeyValuePair[] }>;
};
export async function fetchMessageUpdates(
	conversationId: string,
	opts: MessageUpdateRequestOptions,
	abortSignal: AbortSignal
): Promise<AsyncGenerator<MessageUpdate>> {
	const abortController = new AbortController();
	abortSignal.addEventListener("abort", () => abortController.abort());

	const form = new FormData();

	const optsJSON = JSON.stringify({
		inputs: opts.inputs,
		id: opts.messageId,
		is_retry: opts.isRetry,
		is_continue: Boolean(opts.isContinue),
		// Will be ignored server-side if unsupported
		selectedMcpServerNames: opts.selectedMcpServerNames,
		selectedMcpServers: opts.selectedMcpServers,
	});

	opts.files?.forEach((file) => {
		const name = file.type + ";" + file.name;

		form.append("files", new File([file.value], name, { type: file.mime }));
	});

	form.append("data", optsJSON);

	const response = await fetch(`${opts.base}/conversation/${conversationId}`, {
		method: "POST",
		body: form,
		signal: abortController.signal,
	});

	if (!response.ok) {
		const errorMessage = await response
			.json()
			.then((obj) => obj.message)
			.catch(() => `Request failed with status code ${response.status}: ${response.statusText}`);
		throw Error(errorMessage);
	}
	if (!response.body) {
		throw Error("Body not defined");
	}

	if (!(page.data.publicConfig.PUBLIC_SMOOTH_UPDATES === "true")) {
		return endpointStreamToIterator(response, abortController);
	}

	return smoothAsyncIterator(
		streamMessageUpdatesToFullWords(endpointStreamToIterator(response, abortController))
	);
}

async function* endpointStreamToIterator(
	response: Response,
	abortController: AbortController
): AsyncGenerator<MessageUpdate> {
	const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
	if (!reader) throw Error("Response for endpoint had no body");

	// Handle any cases where we must abort
	reader.closed.then(() => abortController.abort());

	// Handle logic for aborting - use { once: true } for auto-cleanup
	abortController.signal.addEventListener("abort", () => reader.cancel(), { once: true });

	// ex) If the last response is => {"type": "stream", "token":
	// It should be => {"type": "stream", "token": "Hello"} = prev_input_chunk + "Hello"}
	let prevChunk = "";

	// ENTERPRISE: Error boundary with proper cleanup to prevent silent crashes
	try {
		while (!abortController.signal.aborted) {
			const { done, value } = await reader.read();
			if (done) {
				abortController.abort();
				break;
			}
			// DEFENSIVE: Check for undefined/null values explicitly
			if (value === undefined || value === null) continue;

			const { messageUpdates, remainingText } = parseMessageUpdates(prevChunk + value);
			prevChunk = remainingText;
			for (const messageUpdate of messageUpdates) yield messageUpdate;
		}
	} catch (error) {
		// Log error with context for debugging but don't crash
		console.error("[endpointStreamToIterator] Stream error:", {
			error: error instanceof Error ? error.message : String(error),
			aborted: abortController.signal.aborted,
			chunkPreview: prevChunk.slice(0, 100),
		});
		// Ensure cleanup on error
		abortController.abort();
	} finally {
		// ENTERPRISE: Ensure reader is always released
		try {
			reader.releaseLock();
		} catch {
			// Reader may already be released - ignore
		}
	}
}

function parseMessageUpdates(value: string): {
	messageUpdates: MessageUpdate[];
	remainingText: string;
} {
	const inputs = value.split("\n");
	const messageUpdates: MessageUpdate[] = [];
	for (const input of inputs) {
		try {
			messageUpdates.push(JSON.parse(input) as MessageUpdate);
		} catch (error) {
			// in case of parsing error, we return what we were able to parse
			// Handle ALL error types to prevent silent failures
			console.error("[parseMessageUpdates] Error parsing:", {
				error: error instanceof Error ? error.message : String(error),
				inputPreview: input.slice(0, 100),
			});
			return {
				messageUpdates,
				remainingText: inputs.at(-1) ?? "",
			};
		}
	}
	return { messageUpdates, remainingText: "" };
}

/**
 * Emits all the message updates immediately that aren't "stream" type
 * Emits a concatenated "stream" type message update once it detects a full word
 * Example: "what" " don" "'t" => "what" " don't"
 * Supports Latin and Hebrew languages
 */
async function* streamMessageUpdatesToFullWords(
	iterator: AsyncGenerator<MessageUpdate>
): AsyncGenerator<MessageUpdate> {
	let bufferedStreamUpdates: MessageStreamUpdate[] = [];

	// Include Hebrew unicode range (U+0590-U+05FF) for RTL language support
	const endAlphanumeric = /[a-zA-Z0-9À-ž\u0590-\u05FF'`]+$/;
	const beginnningAlphanumeric = /^[a-zA-Z0-9À-ž\u0590-\u05FF'`]+/;

	for await (const messageUpdate of iterator) {
		if (messageUpdate.type !== "stream") {
			// When a non-stream update (e.g. tool/status/final answer) arrives,
			// flush any buffered stream tokens so the UI does not appear to
			// "cut" mid-sentence while tools are running.
			if (bufferedStreamUpdates.length > 0) {
				yield {
					type: MessageUpdateType.Stream,
					token: bufferedStreamUpdates.map((u) => u.token).join(""),
				};
				bufferedStreamUpdates = [];
			}
			yield messageUpdate;
			continue;
		}
		bufferedStreamUpdates.push(messageUpdate);

		let lastIndexEmitted = 0;
		for (let i = 1; i < bufferedStreamUpdates.length; i++) {
			const prevEndsAlphanumeric = endAlphanumeric.test(bufferedStreamUpdates[i - 1].token);
			const currBeginsAlphanumeric = beginnningAlphanumeric.test(bufferedStreamUpdates[i].token);
			const shouldCombine = prevEndsAlphanumeric && currBeginsAlphanumeric;
			const combinedTooMany = i - lastIndexEmitted >= 5;
			if (shouldCombine && !combinedTooMany) continue;

			// Combine tokens together and emit
			yield {
				type: MessageUpdateType.Stream,
				token: bufferedStreamUpdates
					.slice(lastIndexEmitted, i)
					.map((_) => _.token)
					.join(""),
			};
			lastIndexEmitted = i;
		}
		bufferedStreamUpdates = bufferedStreamUpdates.slice(lastIndexEmitted);
	}
	for (const messageUpdate of bufferedStreamUpdates) yield messageUpdate;
}

/**
 * Attempts to smooth out the time between values emitted by an async iterator
 * by waiting for the average time between values to emit the next value
 *
 * ENTERPRISE: Fixed recursive promise chain (stack overflow) and added buffer limits
 */
async function* smoothAsyncIterator<T>(iterator: AsyncGenerator<T>): AsyncGenerator<T> {
	const eventTarget = new EventTarget();
	let done = false;
	let iteratorError: Error | null = null;
	const valuesBuffer: T[] = [];
	const valueTimesMS: number[] = [];

	// ENTERPRISE: High-water marks to prevent unbounded memory growth
	const MAX_BUFFER_SIZE = 1000;
	const MAX_TIMES_SIZE = 100;

	// ENTERPRISE: Convert recursive call to iterative loop to prevent stack overflow
	const consumeIterator = async () => {
		try {
			while (!done) {
				const obj = await iterator.next();
				if (obj.done) {
					done = true;
				} else {
					valuesBuffer.push(obj.value);
					valueTimesMS.push(performance.now());

					// ENTERPRISE: Enforce high-water mark - trim old entries
					if (valueTimesMS.length > MAX_TIMES_SIZE) {
						valueTimesMS.splice(0, valueTimesMS.length - MAX_TIMES_SIZE);
					}

					// ENTERPRISE: If buffer exceeds limit, log warning (indicates slow consumer)
					if (valuesBuffer.length > MAX_BUFFER_SIZE) {
						console.warn("[smoothAsyncIterator] Buffer overflow - consumer too slow");
					}
				}
				eventTarget.dispatchEvent(new Event("next"));
			}
		} catch (error) {
			// ENTERPRISE: Capture error for re-throwing in consumer
			iteratorError = error instanceof Error ? error : new Error(String(error));
			done = true;
			eventTarget.dispatchEvent(new Event("next"));
		}
	};

	// Start consuming in background (non-blocking)
	consumeIterator();

	let timeOfLastEmitMS = performance.now();
	while (!done || valuesBuffer.length > 0) {
		// ENTERPRISE: Check for upstream errors
		if (iteratorError && valuesBuffer.length === 0) {
			throw iteratorError;
		}

		// Only consider the last X times between tokens
		const sampledTimesMS = valueTimesMS.slice(-30);

		// Guard against empty samples
		if (sampledTimesMS.length < 2) {
			await waitForEvent(eventTarget, "next");
			continue;
		}

		// Get the total time spent in abnormal periods
		const anomalyThresholdMS = 2000;
		const anomalyDurationMS = sampledTimesMS
			.map((time, i, times) => time - times[i - 1])
			.slice(1)
			.filter((time) => time > anomalyThresholdMS)
			.reduce((a, b) => a + b, 0);

		const totalTimeMSBetweenValues = (sampledTimesMS.at(-1) ?? 0) - (sampledTimesMS[0] ?? 0);
		const timeMSBetweenValues = totalTimeMSBetweenValues - anomalyDurationMS;

		const averageTimeMSBetweenValues = Math.min(
			200,
			timeMSBetweenValues / Math.max(1, sampledTimesMS.length - 1)
		);
		const timeSinceLastEmitMS = performance.now() - timeOfLastEmitMS;

		// Emit after waiting duration or cancel if "next" event is emitted
		const gotNext = await Promise.race([
			sleep(Math.max(5, averageTimeMSBetweenValues - timeSinceLastEmitMS)),
			waitForEvent(eventTarget, "next"),
		]);

		// Go to next iteration so we can re-calculate when to emit
		if (gotNext) continue;

		// Nothing in buffer to emit
		if (valuesBuffer.length === 0) continue;

		// Emit
		timeOfLastEmitMS = performance.now();
		const value = valuesBuffer.shift();
		if (value !== undefined) {
			yield value;
		}
	}

	// ENTERPRISE: Re-throw any captured error after draining buffer
	if (iteratorError) {
		throw iteratorError;
	}
}

// Tool update type guards for UI rendering
export const isMessageToolUpdate = (update: MessageUpdate): update is MessageToolUpdate =>
	update.type === MessageUpdateType.Tool;

export const isMessageToolCallUpdate = (update: MessageUpdate): update is MessageToolCallUpdate =>
	isMessageToolUpdate(update) && update.subtype === MessageToolUpdateType.Call;

export const isMessageToolResultUpdate = (
	update: MessageUpdate
): update is MessageToolResultUpdate =>
	isMessageToolUpdate(update) && update.subtype === MessageToolUpdateType.Result;

export const isMessageToolErrorUpdate = (update: MessageUpdate): update is MessageToolErrorUpdate =>
	isMessageToolUpdate(update) && update.subtype === MessageToolUpdateType.Error;

// Trace update type guards for UI rendering
export const isMessageTraceUpdate = (update: MessageUpdate): update is MessageTraceUpdate =>
	update.type === MessageUpdateType.Trace;

export const isMessageTraceRunCreatedUpdate = (
	update: MessageUpdate
): update is MessageTraceRunCreatedUpdate =>
	isMessageTraceUpdate(update) && update.subtype === MessageTraceUpdateType.RunCreated;

export const isMessageTraceRunCompletedUpdate = (
	update: MessageUpdate
): update is MessageTraceRunCompletedUpdate =>
	isMessageTraceUpdate(update) && update.subtype === MessageTraceUpdateType.RunCompleted;

export const isMessageTraceStepCreatedUpdate = (
	update: MessageUpdate
): update is MessageTraceStepCreatedUpdate =>
	isMessageTraceUpdate(update) && update.subtype === MessageTraceUpdateType.StepCreated;

export const isMessageTraceStepStatusUpdate = (
	update: MessageUpdate
): update is MessageTraceStepStatusUpdate =>
	isMessageTraceUpdate(update) && update.subtype === MessageTraceUpdateType.StepStatus;

export const isMessageTraceStepDetailUpdate = (
	update: MessageUpdate
): update is MessageTraceStepDetailUpdate =>
	isMessageTraceUpdate(update) && update.subtype === MessageTraceUpdateType.StepDetail;

// Memory update type guards for UI rendering
export const isMessageMemoryUpdate = (update: MessageUpdate): update is MessageMemoryUpdate =>
	update.type === MessageUpdateType.Memory;

export const isMessageMemorySearchingUpdate = (
	update: MessageUpdate
): update is MessageMemorySearchingUpdate =>
	isMessageMemoryUpdate(update) && update.subtype === MessageMemoryUpdateType.Searching;

export const isMessageMemoryFoundUpdate = (
	update: MessageUpdate
): update is MessageMemoryFoundUpdate =>
	isMessageMemoryUpdate(update) && update.subtype === MessageMemoryUpdateType.Found;

export const isMessageMemoryStoringUpdate = (
	update: MessageUpdate
): update is MessageMemoryStoringUpdate =>
	isMessageMemoryUpdate(update) && update.subtype === MessageMemoryUpdateType.Storing;

export const isMessageMemoryOutcomeUpdate = (
	update: MessageUpdate
): update is MessageMemoryOutcomeUpdate =>
	isMessageMemoryUpdate(update) && update.subtype === MessageMemoryUpdateType.Outcome;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitForEvent = (eventTarget: EventTarget, eventName: string) =>
	new Promise<boolean>((resolve) =>
		eventTarget.addEventListener(eventName, () => resolve(true), { once: true })
	);
