import { container, SERVICE_KEYS, type IToolFilterService } from "./serviceContainer";
import { LoopDetector } from "./loopDetector";
import { ToolArgumentSanitizer } from "./toolArgumentSanitizer";
import { filterToolsByIntent, clearToolFilterCache, type ToolFilterOptions } from "./toolFilter";
import type { OpenAiTool } from "$lib/server/mcp/tools";

/**
 * Adapter to expose functional tool filter as a service
 */
class ToolFilterServiceAdapter implements IToolFilterService {
	filterToolsByIntent(allTools: OpenAiTool[], userQuery: string, options?: ToolFilterOptions) {
		return filterToolsByIntent(allTools, userQuery, options);
	}
	clearCache() {
		clearToolFilterCache();
	}
}

/**
 * Register all MCP services with the container
 * This should be called at application startup or module initialization
 */
export function registerMcpServices(): void {
	// Register ToolFilterService
	container.register(SERVICE_KEYS.TOOL_FILTER, () => new ToolFilterServiceAdapter());

	// Register LoopDetectorService
	container.register(SERVICE_KEYS.LOOP_DETECTOR, () => new LoopDetector(), false);

	// Register ArgumentSanitizerService
	container.register(SERVICE_KEYS.ARGUMENT_SANITIZER, () => new ToolArgumentSanitizer());

	console.log("[MCP] Services registered successfully");
}
