import { describe, it, expect, vi } from "vitest";

vi.mock("$lib/server/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

import { KgWriteBuffer } from "../../kg/KgWriteBuffer";

describe("KgWriteBuffer", () => {
	it("serializes concurrent flush calls without losing deltas", async () => {
		let inFlight = false;
		let releaseFirstBulkWrite: (() => void) | undefined;
		const firstBulkWriteGate = new Promise<void>((resolve) => {
			releaseFirstBulkWrite = () => resolve();
		});

		const nodeBulkWriteCalls: unknown[] = [];

		const kgNodes = {
			bulkWrite: vi.fn(async (ops: unknown) => {
				nodeBulkWriteCalls.push(ops);
				expect(inFlight).toBe(false);
				inFlight = true;
				await firstBulkWriteGate;
				inFlight = false;
			}),
		} as any;

		const kgEdges = { bulkWrite: vi.fn(async () => {}) } as any;
		const actionEffectiveness = { bulkWrite: vi.fn(async () => {}) } as any;

		const buffer = new KgWriteBuffer({
			kgNodes,
			kgEdges,
			actionEffectiveness,
			contextActionEffectiveness: null,
			flushIntervalMs: 999_999,
			autoFlush: false,
			maxActionExamples: 5,
		});

		const now = new Date();

		buffer.enqueueNode({
			userId: "u",
			nodeId: "n1",
			label: "Node 1",
			nodeType: "concept",
			memoryId: "m1",
			quality: 1,
			now,
		});

		const firstFlush = buffer.flush();

		await vi.waitFor(() => {
			expect(kgNodes.bulkWrite).toHaveBeenCalledTimes(1);
		});

		buffer.enqueueNode({
			userId: "u",
			nodeId: "n2",
			label: "Node 2",
			nodeType: "concept",
			memoryId: "m2",
			quality: 1,
			now: new Date(now.getTime() + 1),
		});

		const secondFlush = buffer.flush();

		if (releaseFirstBulkWrite) releaseFirstBulkWrite();
		await Promise.all([firstFlush, secondFlush]);

		expect(kgNodes.bulkWrite).toHaveBeenCalledTimes(2);

		const firstOps = nodeBulkWriteCalls[0] as any[];
		const secondOps = nodeBulkWriteCalls[1] as any[];

		expect(firstOps[0].updateOne.filter.node_id).toBe("n1");
		expect(secondOps[0].updateOne.filter.node_id).toBe("n2");
	});
});
