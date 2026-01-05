/**
 * Trace Types for RAG Document Processing
 *
 * These types define the structure of trace events that are streamed
 * from the backend to the frontend for real-time progress visualization.
 */

/**
 * Step status states
 */
export type StepStatus = "queued" | "running" | "done" | "error";

/**
 * Bilingual label for Hebrew/English support
 */
export interface BilingualLabel {
  he: string;
  en: string;
}

/**
 * Individual trace step
 */
export interface TraceStep {
  id: string;
  parentId: string | null;
  label: BilingualLabel;
  status: StepStatus;
  detail?: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

/**
 * Step definition (before instantiation)
 */
export interface TraceStepDefinition {
  id: string;
  label: BilingualLabel;
}

// ============================================
// SSE Event Types
// ============================================

/**
 * Run created event - starts a new trace run
 */
export interface RunCreatedEvent {
  type: "run.created";
  runId: string;
  conversationId: string;
  timestamp: number;
}

/**
 * Run completed event - ends a trace run
 */
export interface RunCompletedEvent {
  type: "run.completed";
  runId: string;
  timestamp: number;
}

/**
 * Step created event - adds a new step to the run
 */
export interface StepCreatedEvent {
  type: "step.created";
  runId: string;
  step: TraceStep;
}

/**
 * Step status event - updates step status
 */
export interface StepStatusEvent {
  type: "step.status";
  runId: string;
  stepId: string;
  status: StepStatus;
  timestamp: number;
}

/**
 * Step detail event - adds detail text to a step
 */
export interface StepDetailEvent {
  type: "step.detail";
  runId: string;
  stepId: string;
  detail: string;
}

/**
 * Assistant delta event - token chunk from LLM response
 */
export interface AssistantDeltaEvent {
  type: "assistant.delta";
  runId: string;
  content: string;
}

/**
 * Union type for all trace events
 */
export type TraceEvent =
  | RunCreatedEvent
  | RunCompletedEvent
  | StepCreatedEvent
  | StepStatusEvent
  | StepDetailEvent
  | AssistantDeltaEvent;

/**
 * SSE wrapper event type (combines trace and assistant events)
 */
export interface SSEEvent {
  type: "trace" | "assistant";
  data: TraceEvent | string;
}
