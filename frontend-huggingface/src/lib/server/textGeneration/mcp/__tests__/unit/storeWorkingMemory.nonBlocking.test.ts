import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/memory/featureFlags", () => ({
	getMemoryFeatureFlags: () => ({ systemEnabled: true }),
	isMemorySystemOperational: () => true,
	getMemoryEnvConfig: () => ({}),
}));

describe("storeWorkingMemory", () => {
	it("should not await post-store work", async () => {
		const { UnifiedMemoryFacade } = await import("$lib/server/memory/UnifiedMemoryFacade");
		const { storeWorkingMemory } = await import("$lib/server/textGeneration/mcp/memoryIntegration");

		const extractAndStoreEntities = vi.fn().mockReturnValue(new Promise(() => {}));
		const incrementMessageCount = vi.fn().mockReturnValue(new Promise(() => {}));
		const store = vi.fn().mockResolvedValue({ memory_id: "mem_123" });

		vi.spyOn(UnifiedMemoryFacade, "getInstance").mockReturnValue({
			store,
			extractAndStoreEntities,
			incrementMessageCount,
		} as any);

		const result = await storeWorkingMemory({
			userId: "user_1",
			conversationId: "conv_1",
			userQuery: "Tell me something useful",
			assistantResponse: "Here is a response that is long enough to be stored as memory.",
			toolsUsed: [],
			memoriesUsed: [],
			language: "en",
		});

		expect(result).toBe("mem_123");
		expect(store).toHaveBeenCalledOnce();
		expect(extractAndStoreEntities).toHaveBeenCalledOnce();
		expect(incrementMessageCount).toHaveBeenCalledOnce();
	});
});
