import { config } from "$lib/server/config";
import type { EndpointMessage } from "../../endpoints/endpoints";
import type { ProcessedModel } from "../../models";
import { logger } from "../../logger";

export interface RouterResolutionInput {
	model: ProcessedModel;
	messages: EndpointMessage[];
	conversationId: string;
	hasImageInput: boolean;
	locals: App.Locals | undefined;
}

export interface RouterResolutionResult {
	runMcp: boolean;
	targetModel: ProcessedModel;
	candidateModelId?: string;
	resolvedRoute?: string;
}

export async function resolveRouterTarget({
	model,
	messages,
	conversationId,
	hasImageInput,
	locals,
}: RouterResolutionInput): Promise<RouterResolutionResult> {
	// Single Model Architecture Optimization
	// We assume the model passed in is ALWAYS the correct one (DictaLM-3.0-24B-Thinking-i1-GGUF).
	// We bypass all complex routing, fallback logic, and tool capability checks.
	// We enable MCP by default as this is a "Thinking" model with tool capabilities.

	const runMcp = true;
	const targetModel = model;
	const candidateModelId = model.id ?? model.name;
	const resolvedRoute = "direct-single-model";

	logger.debug({ modelId: candidateModelId }, "[mcp] single-model router bypass active");

	return { runMcp, targetModel, candidateModelId, resolvedRoute };
}
