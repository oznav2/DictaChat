import type { SearchServiceImplConfig } from "./services/SearchServiceImpl";

import { logger } from "$lib/server/logger";

import { SearchServiceImpl } from "./services/SearchServiceImpl";

export class ServiceFactory {
	private static searchService: SearchServiceImpl | null = null;

	static getSearchService(params: SearchServiceImplConfig): SearchServiceImpl {
		if (this.searchService) {
			return this.searchService;
		}

		this.searchService = new SearchServiceImpl(params);
		logger.info({ service: "SearchServiceImpl" }, "[ServiceFactory] Created singleton");
		return this.searchService;
	}

	static resetForTests(): void {
		this.searchService = null;
	}
}
