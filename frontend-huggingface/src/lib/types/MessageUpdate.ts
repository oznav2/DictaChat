import type { InferenceProvider } from "@huggingface/inference";
import type { ToolCall, ToolResult } from "$lib/types/Tool";
import type { MemoryMetaV1 } from "$lib/types/MemoryMeta";

export type MessageUpdate =
	| MessageStatusUpdate
	| MessageTitleUpdate
	| MessageToolUpdate
	| MessageStreamUpdate
	| MessageFileUpdate
	| MessageFinalAnswerUpdate
	| MessageReasoningUpdate
	| MessageRouterMetadataUpdate
	| MessageTraceUpdate
	| MessageMemoryUpdate;

export enum MessageUpdateType {
	Status = "status",
	Title = "title",
	Tool = "tool",
	Stream = "stream",
	File = "file",
	FinalAnswer = "finalAnswer",
	Reasoning = "reasoning",
	RouterMetadata = "routerMetadata",
	Trace = "trace",
	Memory = "memory",
}

// Status
export enum MessageUpdateStatus {
	Started = "started",
	Error = "error",
	Finished = "finished",
	KeepAlive = "keepAlive",
}
export interface MessageStatusUpdate {
	type: MessageUpdateType.Status;
	status: MessageUpdateStatus;
	message?: string;
	statusCode?: number;
}

// Everything else
export interface MessageTitleUpdate {
	type: MessageUpdateType.Title;
	title: string;
}
export interface MessageStreamUpdate {
	type: MessageUpdateType.Stream;
	token: string;
	/** Length of the original token. Used for compressed/persisted stream markers where token is empty. */
	len?: number;
}

// Tool updates (for MCP and function calling)
export enum MessageToolUpdateType {
	Call = "call",
	Result = "result",
	Error = "error",
	ETA = "eta",
}

interface MessageToolUpdateBase<TSubtype extends MessageToolUpdateType> {
	type: MessageUpdateType.Tool;
	subtype: TSubtype;
	uuid: string;
}

export interface MessageToolCallUpdate extends MessageToolUpdateBase<MessageToolUpdateType.Call> {
	call: ToolCall;
}

export interface MessageToolResultUpdate
	extends MessageToolUpdateBase<MessageToolUpdateType.Result> {
	result: ToolResult;
}

export interface MessageToolErrorUpdate extends MessageToolUpdateBase<MessageToolUpdateType.Error> {
	message: string;
}

export interface MessageToolEtaUpdate extends MessageToolUpdateBase<MessageToolUpdateType.ETA> {
	eta: number;
}

export type MessageToolUpdate =
	| MessageToolCallUpdate
	| MessageToolResultUpdate
	| MessageToolErrorUpdate
	| MessageToolEtaUpdate;

export enum MessageReasoningUpdateType {
	Stream = "stream",
	Status = "status",
}

export type MessageReasoningUpdate = MessageReasoningStreamUpdate | MessageReasoningStatusUpdate;

export interface MessageReasoningStreamUpdate {
	type: MessageUpdateType.Reasoning;
	subtype: MessageReasoningUpdateType.Stream;
	token: string;
}
export interface MessageReasoningStatusUpdate {
	type: MessageUpdateType.Reasoning;
	subtype: MessageReasoningUpdateType.Status;
	status: string;
}

export interface MessageFileUpdate {
	type: MessageUpdateType.File;
	name: string;
	sha: string;
	mime: string;
}
export interface MessageFinalAnswerUpdate {
	type: MessageUpdateType.FinalAnswer;
	text: string;
	interrupted: boolean;
	memoryMeta?: MemoryMetaV1;
}
export interface MessageRouterMetadataUpdate {
	type: MessageUpdateType.RouterMetadata;
	route: string;
	model: string;
	provider?: InferenceProvider;
}

// Trace updates (for RAG pipeline progress)
export enum MessageTraceUpdateType {
	RunCreated = "run.created",
	RunCompleted = "run.completed",
	StepCreated = "step.created",
	StepStatus = "step.status",
	StepDetail = "step.detail",
}

export interface TraceStepLabel {
	he: string;
	en: string;
}

export interface TraceStep {
	id: string;
	parentId: string | null;
	label: TraceStepLabel;
	status: "queued" | "running" | "done" | "error";
	detail?: string;
	timestamp: number;
	meta?: Record<string, unknown>;
}

interface MessageTraceUpdateBase<TSubtype extends MessageTraceUpdateType> {
	type: MessageUpdateType.Trace;
	subtype: TSubtype;
	runId: string;
	runType?: "memory_prefetch" | "tool_execution";
}

export interface MessageTraceRunCreatedUpdate
	extends MessageTraceUpdateBase<MessageTraceUpdateType.RunCreated> {
	conversationId: string;
	timestamp: number;
}

export interface MessageTraceRunCompletedUpdate
	extends MessageTraceUpdateBase<MessageTraceUpdateType.RunCompleted> {
	timestamp: number;
}

export interface MessageTraceStepCreatedUpdate
	extends MessageTraceUpdateBase<MessageTraceUpdateType.StepCreated> {
	step: TraceStep;
}

export interface MessageTraceStepStatusUpdate
	extends MessageTraceUpdateBase<MessageTraceUpdateType.StepStatus> {
	stepId: string;
	status: TraceStep["status"];
	timestamp: number;
}

export interface MessageTraceStepDetailUpdate
	extends MessageTraceUpdateBase<MessageTraceUpdateType.StepDetail> {
	stepId: string;
	detail: string;
}

export type MessageTraceUpdate =
	| MessageTraceRunCreatedUpdate
	| MessageTraceRunCompletedUpdate
	| MessageTraceStepCreatedUpdate
	| MessageTraceStepStatusUpdate
	| MessageTraceStepDetailUpdate;

// Memory updates (for memory system progress)
export enum MessageMemoryUpdateType {
	Searching = "searching",
	Found = "found",
	Storing = "storing",
	Stored = "stored",
	Outcome = "outcome",
	Degraded = "degraded", // Circuit breaker open - memory system temporarily unavailable
	DocumentIngesting = "document_ingesting", // Document upload progress
	ToolIngesting = "tool_ingesting", // Tool result ingestion progress
}

interface MessageMemoryUpdateBase<TSubtype extends MessageMemoryUpdateType> {
	type: MessageUpdateType.Memory;
	subtype: TSubtype;
}

export interface MessageMemorySearchingUpdate
	extends MessageMemoryUpdateBase<MessageMemoryUpdateType.Searching> {
	query: string;
}

export interface MessageMemoryFoundUpdate
	extends MessageMemoryUpdateBase<MessageMemoryUpdateType.Found> {
	count: number;
	confidence?: number;
	/** Early memoryMeta for immediate UI feedback (Phase 4 - Latency Fix) */
	memoryMeta?: import("./MemoryMeta").MemoryMetaV1;
}

export interface MessageMemoryStoringUpdate
	extends MessageMemoryUpdateBase<MessageMemoryUpdateType.Storing> {
	tier: string;
}

export interface MessageMemoryStoredUpdate
	extends MessageMemoryUpdateBase<MessageMemoryUpdateType.Stored> {
	tier: string;
	memoryId: string;
	preview: string;
	createdAt?: string;
}

export interface MessageMemoryOutcomeUpdate
	extends MessageMemoryUpdateBase<MessageMemoryUpdateType.Outcome> {
	outcome: "positive" | "negative" | "neutral";
	memoryIds?: string[];
}

export interface MessageMemoryDegradedUpdate
	extends MessageMemoryUpdateBase<MessageMemoryUpdateType.Degraded> {
	reason: "circuit_breaker_open" | "service_unavailable" | "timeout";
	message?: string;
}

export interface MessageMemoryDocumentIngestingUpdate
	extends MessageMemoryUpdateBase<MessageMemoryUpdateType.DocumentIngesting> {
	documentName: string;
	stage:
		| "reading"
		| "extracting"
		| "chunking"
		| "embedding"
		| "storing"
		| "completed"
		| "recognized";
	chunksProcessed?: number;
	totalChunks?: number;
	recognized?: boolean;
	message?: string;
}

export interface MessageMemoryToolIngestingUpdate
	extends MessageMemoryUpdateBase<MessageMemoryUpdateType.ToolIngesting> {
	toolName: string;
	stage: "summarizing" | "extracting" | "linking" | "storing" | "completed";
	entitiesExtracted?: number;
	linkedDocuments?: number;
}

export type MessageMemoryUpdate =
	| MessageMemorySearchingUpdate
	| MessageMemoryFoundUpdate
	| MessageMemoryStoringUpdate
	| MessageMemoryStoredUpdate
	| MessageMemoryOutcomeUpdate
	| MessageMemoryDegradedUpdate
	| MessageMemoryDocumentIngestingUpdate
	| MessageMemoryToolIngestingUpdate;
