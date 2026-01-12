import { describe, it, expect, vi } from "vitest";

vi.mock("$lib/server/config", () => ({
	config: { MONGODB_DB_NAME: "test_db" },
}));

vi.mock("$lib/server/constants", () => ({
	ADMIN_USER_ID: "admin",
}));

const findCalls: Record<string, number> = {};

function cursorWith(items: any[], chain: Array<"sort" | "limit">) {
	const cursor: any = {
		toArray: vi.fn().mockResolvedValue(items),
	};
	for (const m of chain) {
		cursor[m] = vi.fn().mockReturnValue(cursor);
	}
	return cursor;
}

function collectionMock(name: string) {
	return {
		find: vi.fn((..._args: any[]) => {
			findCalls[name] = (findCalls[name] ?? 0) + 1;
			if (name === "kg_routing_concepts") {
				return cursorWith(
					Array.from({ length: 30 }).map((_, i) => ({ concept_id: `c${i}`, label: `Concept${i}` })),
					["sort", "limit"]
				);
			}
			if (name === "kg_routing_stats") {
				return cursorWith(
					Array.from({ length: 30 }).map((_, i) => ({
						concept_id: `c${i}`,
						best_tiers_cached: ["working"],
						tier_success_rates: { working: { uses: 1, wilson_score: 0.8 } },
					})),
					[]
				);
			}
			if (name === "kg_nodes") {
				return cursorWith(
					Array.from({ length: 200 }).map((_, i) => ({
						node_id: `n${i}`,
						label: `Node${i}`,
						aliases: [],
						avg_quality: 0.6,
						hit_count: 2,
					})),
					["sort", "limit"]
				);
			}
			if (name === "kg_edges") {
				return cursorWith(
					Array.from({ length: 2000 }).map((_, i) => ({
						source_id: `n${i % 200}`,
						target_id: `n${(i + 1) % 200}`,
						weight: 1,
					})),
					["limit"]
				);
			}
			if (name === "kg_action_effectiveness") {
				return cursorWith(
					Array.from({ length: 25 }).map((_, i) => ({
						action: `act${i}`,
						context_type: "general",
						wilson_score: 0.7,
						uses: 3,
					})),
					["sort", "limit"]
				);
			}
			return cursorWith([], ["sort", "limit"]);
		}),
	};
}

vi.mock("$lib/server/database", () => ({
	Database: {
		getInstance: vi.fn().mockResolvedValue({
			getClient: () => ({
				db: () => ({
					collection: (name: string) => collectionMock(name),
				}),
			}),
		}),
	},
}));

describe("Graph endpoint regression", () => {
	it("avoids per-node relationship queries and returns timing meta", async () => {
		const { GET } = await import("../../../../../routes/api/memory/graph/+server");
		const res = await GET({
			url: new URL("http://localhost/api/memory/graph?mode=both"),
		} as any);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(typeof body.meta?.built_ms).toBe("number");

		const totalFinds = Object.values(findCalls).reduce((a, v) => a + v, 0);
		expect(totalFinds).toBeLessThanOrEqual(5);
		expect(findCalls.kg_nodes ?? 0).toBe(1);
		expect(findCalls.kg_edges ?? 0).toBe(1);
		expect(findCalls.kg_routing_concepts ?? 0).toBe(1);
		expect(findCalls.kg_routing_stats ?? 0).toBe(1);
		expect(findCalls.kg_action_effectiveness ?? 0).toBe(1);
	});
});

