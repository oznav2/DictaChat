import type { OpenAiTool } from "$lib/server/mcp/tools";
import type { ToolCallDecodeOptions, ToolCallDecodeResult } from "./ToolCallCodec";

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import { logger } from "$lib/server/logger";

export interface ToolParseWorkerPayload {
	id: string;
	text: string;
	options: Omit<ToolCallDecodeOptions, "logger">;
	toolDefinitions?: OpenAiTool[];
}

interface PendingJob {
	id: string;
	resolve: (result: ToolCallDecodeResult | null) => void;
	reject: (error: Error) => void;
	startedAt: number;
	timeoutMs: number;
	workerId: number;
	timeoutId: NodeJS.Timeout;
}

interface WorkerSlot {
	id: number;
	worker: Worker;
	busy: boolean;
	currentJobId?: string;
}

const DEFAULT_POOL_SIZE = 2;
const MAX_POOL_SIZE = 4;

let poolInstance: ToolParseWorkerPool | null = null;
let poolDisabledReason: string | null = null;
let workerFileCheck: "unknown" | "present" | "missing" = "unknown";

const defaultWorkerUrl = new URL("./toolParseWorker.js", import.meta.url);
const defaultWorkerPath = fileURLToPath(defaultWorkerUrl);
const fallbackWorkerPath = path.resolve(
	process.env.MCP_TOOL_PARSE_WORKER_PATH ??
		path.resolve(process.cwd(), "build", "toolParseWorker.js")
);
const fallbackWorkerUrl = pathToFileURL(fallbackWorkerPath);
let workerUrl = defaultWorkerUrl;
let workerPath = defaultWorkerPath;

function getPoolSize(): number {
	const raw = process.env.MCP_TOOL_PARSE_WORKERS;
	if (raw === undefined || raw === null || raw === "") return DEFAULT_POOL_SIZE;
	const parsed = Number.parseInt(String(raw), 10);
	if (Number.isNaN(parsed)) return DEFAULT_POOL_SIZE;
	return Math.max(0, Math.min(parsed, MAX_POOL_SIZE));
}

function ensureWorkerFileAvailable(): void {
	if (workerFileCheck !== "unknown") return;
	if (existsSync(workerPath)) {
		workerFileCheck = "present";
		return;
	}
	if (existsSync(fallbackWorkerPath)) {
		workerFileCheck = "present";
		workerUrl = fallbackWorkerUrl;
		workerPath = fallbackWorkerPath;
		logger.info("[worker-pool] using fallback worker bundle", { workerPath });
		return;
	}
	workerFileCheck = "missing";
	if (!poolDisabledReason) {
		poolDisabledReason = "tool parse worker bundle missing";
	}
	logger.warn("[worker-pool] disabled: worker bundle missing", { workerPath });
}

function buildWorker(): Worker {
	ensureWorkerFileAvailable();
	if (workerFileCheck !== "present") {
		throw new Error(poolDisabledReason ?? "tool parse worker bundle missing");
	}
	return new Worker(workerUrl, { type: "module" });
}

class ToolParseWorkerPool {
	private slots: WorkerSlot[] = [];
	private pending = new Map<string, PendingJob>();
	private metrics = { success: 0, fail: 0, timeout: 0 };
	private queue: Array<{
		payload: ToolParseWorkerPayload;
		timeoutMs: number;
		resolve: (result: ToolCallDecodeResult | null) => void;
		reject: (error: Error) => void;
	}> = [];

	constructor(size: number) {
		for (let i = 0; i < size; i += 1) {
			this.slots.push(this.createSlot(i));
		}
	}

	async run(payload: ToolParseWorkerPayload, timeoutMs: number): Promise<ToolCallDecodeResult | null> {
		return new Promise((resolve, reject) => {
			this.queue.push({ payload, timeoutMs, resolve, reject });
			logger.debug("[worker-pool] queue length", { length: this.queue.length });
			this.dispatch();
		});
	}

	private createSlot(id: number): WorkerSlot {
		const worker = buildWorker();
		const slot: WorkerSlot = { id, worker, busy: false };

		worker.on("message", (message: { id?: string; result?: ToolCallDecodeResult | null; error?: string }) => {
			const jobId = message?.id;
			if (!jobId) return;
			const pendingJob = this.pending.get(jobId);
			if (!pendingJob) return;

			clearTimeout(pendingJob.timeoutId);
			this.pending.delete(jobId);
			slot.busy = false;
			slot.currentJobId = undefined;

			const durationMs = Date.now() - pendingJob.startedAt;
			logger.debug("[worker] job completed", { id: jobId, durationMs, workerId: slot.id });

			if (message.error) {
				this.recordMetrics("error");
				pendingJob.reject(new Error(message.error));
			} else {
				this.recordMetrics("success");
				pendingJob.resolve(message.result ?? null);
			}

			this.dispatch();
		});

		worker.on("error", (err) => {
			logger.warn({ err: String(err), workerId: slot.id }, "[worker-pool] worker error");
			this.failJob(slot, err instanceof Error ? err : new Error(String(err)));
			this.replaceWorker(slot);
		});

		worker.on("exit", (code) => {
			if (code === 0) return;
			logger.warn({ workerId: slot.id, code }, "[worker-pool] worker exited unexpectedly");
			this.failJob(slot, new Error(`worker exited with code ${code}`));
			this.replaceWorker(slot);
		});

		return slot;
	}

	private dispatch(): void {
		const available = this.slots.find((slot) => !slot.busy);
		if (!available) return;
		const next = this.queue.shift();
		if (!next) return;

		available.busy = true;
		available.currentJobId = next.payload.id;

		const startedAt = Date.now();
		logger.debug("[worker] job started", {
			id: next.payload.id,
			workerId: available.id,
		});

		const timeoutId = setTimeout(() => {
			logger.warn("[worker] timeout", {
				id: next.payload.id,
				durationMs: Date.now() - startedAt,
				workerId: available.id,
			});
			logger.warn("[worker-pool] timeout", { id: next.payload.id });
			this.failJob(available, new Error("worker timeout"), "timeout");
			this.replaceWorker(available);
		}, next.timeoutMs);

		this.pending.set(next.payload.id, {
			id: next.payload.id,
			resolve: next.resolve,
			reject: next.reject,
			startedAt,
			timeoutMs: next.timeoutMs,
			workerId: available.id,
			timeoutId,
		});

		available.worker.postMessage(next.payload);
	}

	private failJob(slot: WorkerSlot, error: Error, reason: "error" | "timeout" = "error"): void {
		const jobId = slot.currentJobId;
		if (!jobId) return;
		const pendingJob = this.pending.get(jobId);
		if (!pendingJob) return;
		clearTimeout(pendingJob.timeoutId);
		this.pending.delete(jobId);
		slot.busy = false;
		slot.currentJobId = undefined;
		this.recordMetrics(reason);
		pendingJob.reject(error);
		this.dispatch();
	}

	private recordMetrics(reason: "success" | "error" | "timeout"): void {
		if (reason === "success") this.metrics.success += 1;
		if (reason === "error") this.metrics.fail += 1;
		if (reason === "timeout") this.metrics.timeout += 1;
		logger.debug("[codec-metrics]", {
			success: this.metrics.success,
			fail: this.metrics.fail,
			timeout: this.metrics.timeout,
		});
	}

	private replaceWorker(slot: WorkerSlot): void {
		try {
			slot.worker.terminate();
		} catch {
			// ignore
		}
		try {
			const replacement = buildWorker();
			slot.worker = replacement;
			slot.busy = false;
			slot.currentJobId = undefined;
		} catch (err) {
			poolDisabledReason = "worker spawn failed";
			logger.warn({ err: String(err) }, "[worker-pool] disabled after spawn failure");
		}
	}
}

export async function runToolParseJob(
	payload: Omit<ToolParseWorkerPayload, "id">,
	timeoutMs: number
): Promise<ToolCallDecodeResult | null> {
	if (poolDisabledReason) {
		throw new Error(poolDisabledReason);
	}
	const size = getPoolSize();
	if (size <= 0) {
		poolDisabledReason = "worker pool disabled by config";
		throw new Error(poolDisabledReason);
	}
	ensureWorkerFileAvailable();
	if (poolDisabledReason) {
		throw new Error(poolDisabledReason);
	}
	if (!poolInstance) {
		try {
			poolInstance = new ToolParseWorkerPool(size);
		} catch (err) {
			poolDisabledReason = "worker pool init failed";
			logger.warn({ err: String(err) }, "[worker-pool] disabled after init failure");
			throw err instanceof Error ? err : new Error(String(err));
		}
	}

const jobId = randomUUID();
	return poolInstance.run({ ...payload, id: jobId }, timeoutMs);
}
