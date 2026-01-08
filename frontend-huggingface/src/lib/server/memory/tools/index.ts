// Import tool definitions for use in arrays
import { SEARCH_MEMORY_TOOL_DEFINITION as SearchMemoryDef, executeSearchMemory, formatSearchResultsForLLM } from "./searchMemoryTool";
import { ADD_TO_MEMORY_BANK_TOOL_DEFINITION as AddToMemoryBankDef, executeAddToMemoryBank, formatAddToMemoryBankForLLM } from "./addToMemoryBankTool";
import { RECORD_RESPONSE_TOOL_DEFINITION as RecordResponseDef, executeRecordResponse, formatRecordResponseForLLM } from "./recordResponseTool";

// Re-export all tool definitions and functions
export { SEARCH_MEMORY_TOOL_DEFINITION, executeSearchMemory, formatSearchResultsForLLM } from "./searchMemoryTool";
export type { SearchMemoryInput, SearchMemoryOutput } from "./searchMemoryTool";

export { ADD_TO_MEMORY_BANK_TOOL_DEFINITION, executeAddToMemoryBank, formatAddToMemoryBankForLLM } from "./addToMemoryBankTool";
export type { AddToMemoryBankInput, AddToMemoryBankOutput } from "./addToMemoryBankTool";

export { RECORD_RESPONSE_TOOL_DEFINITION, executeRecordResponse, formatRecordResponseForLLM } from "./recordResponseTool";
export type { RecordResponseInput, RecordResponseOutput } from "./recordResponseTool";

/**
 * All memory tool definitions for registration
 */
export const MEMORY_TOOL_DEFINITIONS = [
	{ name: "search_memory", ...SearchMemoryDef },
	{ name: "add_to_memory_bank", ...AddToMemoryBankDef },
	{ name: "record_response", ...RecordResponseDef },
];

/**
 * Memory tool names for easy checking
 */
export const MEMORY_TOOL_NAMES = new Set([
	"search_memory",
	"add_to_memory_bank",
	"record_response",
]);

/**
 * Check if a tool name is a memory tool
 */
export function isMemoryTool(toolName: string): boolean {
	return MEMORY_TOOL_NAMES.has(toolName);
}
