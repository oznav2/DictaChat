// Added regression test to ensure Mongo stores succeed when embeddings fail.

import { describe, it, expect } from "vitest";
import { StoreServiceImpl } from "$lib/server/memory/services/StoreServiceImpl";

describe("StoreServiceImpl (embedding fallback)", () => {
	it("stores to Mongo even when embedding returns null", async () => {
		const mongoStore = {
			store: async () => ({ memory_id: "mem_123" }),
			getCollections: () => ({}),
		} as any;
		const qdrantAdapter = {
			upsert: async () => {},
		} as any;
		const embeddingClient = {
			embed: async () => null,
		} as any;

		const service = new StoreServiceImpl({
			mongoStore,
			qdrantAdapter,
			embeddingClient,
			config: {
				dedup: { enabled: true },
			} as any,
		});

		const res = await service.store({
			userId: "admin",
			tier: "books",
			text: "some extracted document text",
			metadata: { book_id: "doc1", chunk_index: 0, title: "T" },
		});

		expect(res.memory_id).toBe("mem_123");
	});
});
