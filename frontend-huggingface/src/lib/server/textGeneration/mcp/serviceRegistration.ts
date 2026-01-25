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
 * Track if services have been registered to avoid re-registration
 * Gemini Finding 2: Prevent performance overhead and log spam from re-registering on every request
 */
let servicesRegistered = false;

/**
 * Register all MCP services with the container
 * This should be called at application startup or module initialization
 * Safe to call multiple times - will only register once
 */
export function registerMcpServices(): void {
	// Gemini Finding 2: Guard against re-registration on every request
	if (servicesRegistered) {
		return;
	}

	// Register ToolFilterService
	container.register(SERVICE_KEYS.TOOL_FILTER, () => new ToolFilterServiceAdapter());

	// Register LoopDetectorService (transient - new instance per request)
	container.register(SERVICE_KEYS.LOOP_DETECTOR, () => new LoopDetector(), false);

	// Register ArgumentSanitizerService
	container.register(SERVICE_KEYS.ARGUMENT_SANITIZER, () => new ToolArgumentSanitizer());

	servicesRegistered = true;
	console.log("[MCP] Services registered successfully");
}
