import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QdrantAdapter } from "../../adapters/QdrantAdapter";

vi.mock("$lib/server/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("QdrantAdapter ID normalization", () => {
	const vector = new Array(1024).fill(0.01);

	beforeEach(() => {
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			const bodyText =
				typeof init?.body === "string" ? init.body : init?.body?.toString() ?? "{}";
			const body = JSON.parse(bodyText);
			const point = body?.points?.[0];

			return new Response(
				JSON.stringify({
					result: {
						status: "acknowledged",
						echoPointId: point?.id ?? null,
						echoMemoryId: point?.payload?.memory_id ?? null,
					},
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				}
			);
		});

		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("maps non-UUID memory IDs to UUIDv5 and preserves memory_id in payload", async () => {
		const adapter = new QdrantAdapter({
			host: "127.0.0.1",
			port: 6333,
		});

		const memoryId = "system_datagov_welfare";
		const success = await adapter.upsertBatch([
			{
				id: memoryId,
				vector,
				payload: {
					user_id: "admin",
					tier: "working",
					status: "active",
					tags: [],
					entities: [],
					content: "debug",
					timestamp: 0,
					composite_score: 0.5,
					uses: 0,
					always_inject: false,
				},
			},
		]);

		expect(success).toBe(true);

		const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
		const body = JSON.parse(String(init?.body ?? "{}"));
		const point = body.points?.[0];

		expect(point?.payload?.memory_id).toBe(memoryId);
		expect(point?.id).not.toBe(memoryId);
		expect(point?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
	});
});

