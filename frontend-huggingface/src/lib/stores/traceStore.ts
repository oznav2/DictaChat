/**
 * Trace Store - Svelte Store for RAG Trace Panel
 *
 * Manages run state and step updates for real-time UI.
 */

import { writable, derived, get } from "svelte/store";
import type { TraceStep, RunState, StepStatus, RunSummary } from "$lib/types/Trace";
import {
  type MessageTraceUpdate,
  MessageTraceUpdateType
} from "$lib/types/MessageUpdate";
import { isMessageTraceUpdate } from "$lib/utils/messageUpdates";

// ============================================
// Main Store
// ============================================

/**
 * Store: Map of runId -> RunState
 */
export const runs = writable<Map<string, RunState>>(new Map());

// ============================================
// Actions
// ============================================

/**
 * Create a new run
 */
export function createRun(runId: string, language: "he" | "en" = "en"): void {
  runs.update((map) => {
    map.set(runId, {
      runId,
      steps: new Map(),
      stepOrder: [],
      childrenByParent: new Map(),
      completed: false,
      expanded: true,
      language
    });
    return new Map(map);
  });
}

/**
 * Add a step to a run
 */
export function addStep(runId: string, step: TraceStep): void {
  runs.update((map) => {
    const run = map.get(runId);
    if (!run) return map;

    run.steps.set(step.id, step);
    run.stepOrder.push(step.id);

    // Track parent-child relationship
    const parentId = step.parentId || "__root__";
    const children = run.childrenByParent.get(parentId) || [];
    children.push(step.id);
    run.childrenByParent.set(parentId, children);

    return new Map(map);
  });
}

/**
 * Update step status
 */
export function updateStepStatus(
  runId: string,
  stepId: string,
  status: StepStatus
): void {
  runs.update((map) => {
    const run = map.get(runId);
    if (!run) return map;

    // Find step by ID or prefix
    const step = run.steps.get(stepId) || findStepByPrefix(run, stepId);
    if (step) {
      step.status = status;
    }

    return new Map(map);
  });
}

/**
 * Update step detail
 */
export function updateStepDetail(
  runId: string,
  stepId: string,
  detail: string
): void {
  runs.update((map) => {
    const run = map.get(runId);
    if (!run) return map;

    const step = run.steps.get(stepId) || findStepByPrefix(run, stepId);
    if (step) {
      step.detail = detail;
    }

    return new Map(map);
  });
}

/**
 * Complete a run
 */
export function completeRun(runId: string): void {
  runs.update((map) => {
    const run = map.get(runId);
    if (!run) return map;

    run.completed = true;

    return new Map(map);
  });

  // Auto-collapse after 2 seconds
  setTimeout(() => {
    runs.update((map) => {
      const run = map.get(runId);
      if (run) {
        run.expanded = false;
      }
      return new Map(map);
    });
  }, 2000);
}

/**
 * Toggle run expanded state
 */
export function toggleExpanded(runId: string): void {
  runs.update((map) => {
    const run = map.get(runId);
    if (run) {
      run.expanded = !run.expanded;
    }
    return new Map(map);
  });
}

/**
 * Clear all runs
 */
export function clearRuns(): void {
  runs.set(new Map());
}

/**
 * Remove a specific run
 */
export function removeRun(runId: string): void {
  runs.update((map) => {
    map.delete(runId);
    return new Map(map);
  });
}

// ============================================
// Derived Stores
// ============================================

/**
 * Get run store for specific runId
 */
export function getRunStore(runId: string) {
  return derived(runs, ($runs) => $runs.get(runId));
}

/**
 * Get run summary (done/total counts)
 */
export function getRunSummary(runId: string) {
  return derived(runs, ($runs): RunSummary => {
    const run = $runs.get(runId);
    if (!run) return { done: 0, total: 0 };

    const total = run.steps.size;
    const done = Array.from(run.steps.values()).filter(
      (s) => s.status === "done"
    ).length;

    return { done, total };
  });
}

/**
 * Get root steps (no parent)
 */
export function getRootSteps(runId: string) {
  return derived(runs, ($runs): TraceStep[] => {
    const run = $runs.get(runId);
    if (!run) return [];

    const rootIds = run.childrenByParent.get("__root__") || [];
    return rootIds
      .map((id) => run.steps.get(id))
      .filter((s): s is TraceStep => s !== undefined);
  });
}

/**
 * Get child steps of a parent
 */
export function getChildSteps(runId: string, parentId: string) {
  return derived(runs, ($runs): TraceStep[] => {
    const run = $runs.get(runId);
    if (!run) return [];

    const childIds = run.childrenByParent.get(parentId) || [];
    return childIds
      .map((id) => run.steps.get(id))
      .filter((s): s is TraceStep => s !== undefined);
  });
}

// ============================================
// Helpers
// ============================================

/**
 * Find step by ID prefix
 */
function findStepByPrefix(run: RunState, prefix: string): TraceStep | undefined {
  if (run.steps.has(prefix)) {
    return run.steps.get(prefix);
  }

  for (const [id, step] of run.steps) {
    if (id.startsWith(prefix)) {
      return step;
    }
  }

  return undefined;
}

/**
 * Get localized label
 */
export function getLocalizedLabel(
  step: TraceStep,
  language: "he" | "en"
): string {
  return step.label[language] || step.label.en;
}

/**
 * Dispatch trace event to store
 */
export function dispatchTraceEvent(event: {
  type: string;
  runId?: string;
  step?: TraceStep;
  stepId?: string;
  status?: StepStatus;
  detail?: string;
  conversationId?: string;
}): void {
  switch (event.type) {
    case "run.created":
      if (event.runId) {
        createRun(event.runId, "en");
      }
      break;

    case "step.created":
      if (event.runId && event.step) {
        addStep(event.runId, event.step);
      }
      break;

    case "step.status":
      if (event.runId && event.stepId && event.status) {
        updateStepStatus(event.runId, event.stepId, event.status);
      }
      break;

    case "step.detail":
      if (event.runId && event.stepId && event.detail) {
        updateStepDetail(event.runId, event.stepId, event.detail);
      }
      break;

    case "run.completed":
      if (event.runId) {
        completeRun(event.runId);
      }
      break;
  }
}

/**
 * Handle MessageTraceUpdate from SSE stream
 */
export function handleMessageTraceUpdate(update: MessageTraceUpdate): void {
  switch (update.subtype) {
    case MessageTraceUpdateType.RunCreated:
      createRun(update.runId, "en");
      break;

    case MessageTraceUpdateType.StepCreated:
      addStep(update.runId, {
        id: update.step.id,
        parentId: update.step.parentId,
        label: update.step.label,
        status: update.step.status,
        detail: update.step.detail,
        timestamp: update.step.timestamp,
        meta: update.step.meta
      });
      break;

    case MessageTraceUpdateType.StepStatus:
      updateStepStatus(update.runId, update.stepId, update.status);
      break;

    case MessageTraceUpdateType.StepDetail:
      updateStepDetail(update.runId, update.stepId, update.detail);
      break;

    case MessageTraceUpdateType.RunCompleted:
      completeRun(update.runId);
      break;
  }
}

/**
 * Get current active run ID (most recent incomplete run)
 */
export function getActiveRunId(): string | null {
  const currentRuns = get(runs);
  for (const [runId, run] of currentRuns) {
    if (!run.completed) {
      return runId;
    }
  }
  return null;
}

/**
 * Check if there are any active (non-completed) runs
 */
export const hasActiveRuns = derived(runs, ($runs) => {
  for (const run of $runs.values()) {
    if (!run.completed) return true;
  }
  return false;
});
