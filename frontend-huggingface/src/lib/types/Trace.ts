/**
 * Frontend Trace Types
 *
 * Types for the RAG trace panel UI.
 * These mirror the backend types but are used in Svelte stores.
 */

/**
 * Step status states
 */
export type StepStatus = "queued" | "running" | "done" | "error";

/**
 * Bilingual label
 */
export interface BilingualLabel {
  he: string;
  en: string;
}

/**
 * Trace step for UI
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
 * Run state for a single message
 */
export interface RunState {
  runId: string;
  steps: Map<string, TraceStep>;
  stepOrder: string[];
  childrenByParent: Map<string, string[]>;
  completed: boolean;
  expanded: boolean;
  language: "he" | "en";
}

/**
 * SSE Event Types (received from backend)
 */
export type TraceEvent =
  | { type: "run.created"; runId: string; conversationId: string; timestamp: number }
  | { type: "run.completed"; runId: string; timestamp: number }
  | { type: "step.created"; runId: string; step: TraceStep }
  | { type: "step.status"; runId: string; stepId: string; status: StepStatus; timestamp: number }
  | { type: "step.detail"; runId: string; stepId: string; detail: string }
  | { type: "assistant.delta"; runId: string; content: string };

/**
 * SSE wrapper event
 */
export interface SSEEvent {
  type: "trace" | "assistant";
  data: TraceEvent | string;
}

/**
 * Run summary for display
 */
export interface RunSummary {
  done: number;
  total: number;
}
