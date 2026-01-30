import type { SearchParams } from "../UnifiedMemoryFacade";
import type { SearchResponse } from "../types";

export interface ISearchService {
	search(params: SearchParams): Promise<SearchResponse>;
	healthCheck(): Promise<boolean>;
}
