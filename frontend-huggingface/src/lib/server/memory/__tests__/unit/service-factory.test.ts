import { describe, it, expect, vi } from "vitest";

vi.mock("$lib/server/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

import { ServiceFactory } from "../../ServiceFactory";

describe("ServiceFactory", () => {
	it("returns a singleton instance for getSearchService", () => {
		ServiceFactory.resetForTests();

		const hybridSearch = { search: vi.fn() } as any;
		const mongoStore = {} as any;
		const kgService = {} as any;

		const s1 = ServiceFactory.getSearchService({ hybridSearch, mongoStore, kgService });
		const s2 = ServiceFactory.getSearchService({ hybridSearch, mongoStore, kgService });

		expect(s1).toBe(s2);
	});

	it("can reset singletons for tests", () => {
		ServiceFactory.resetForTests();

		const hybridSearch = { search: vi.fn() } as any;
		const mongoStore = {} as any;
		const kgService = {} as any;

		const s1 = ServiceFactory.getSearchService({ hybridSearch, mongoStore, kgService });
		ServiceFactory.resetForTests();
		const s2 = ServiceFactory.getSearchService({ hybridSearch, mongoStore, kgService });

		expect(s1).not.toBe(s2);
	});
});
