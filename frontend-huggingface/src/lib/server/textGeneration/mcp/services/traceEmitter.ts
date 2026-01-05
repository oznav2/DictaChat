/**
 * TraceEmitter - SSE Event Streaming for RAG Trace Panel
 *
 * Emits structured trace events during document processing and retrieval.
 * Events are streamed via SSE to the frontend for real-time UI updates.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  TraceStep,
  TraceEvent,
  TraceStepDefinition,
  StepStatus
} from "../types/trace";
import {
  MessageUpdateType,
  MessageTraceUpdateType,
  type MessageTraceUpdate
} from "$lib/types/MessageUpdate";

/**
 * TraceEmitter manages a single run's trace events
 */
export class TraceEmitter {
  private runId: string | null = null;
  private conversationId: string | null = null;
  private steps: Map<string, TraceStep> = new Map();
  private eventQueue: TraceEvent[] = [];
  private subscribers: Set<(event: TraceEvent) => void> = new Set();
  private language: "he" | "en" = "en";
  private isCompleted = false;

  /**
   * Start a new trace run
   */
  startRun(conversationId: string): string {
    this.runId = uuidv4();
    this.conversationId = conversationId;
    this.steps.clear();
    this.eventQueue = [];
    this.isCompleted = false;

    this.emit({
      type: "run.created",
      runId: this.runId,
      conversationId,
      timestamp: Date.now()
    });

    return this.runId;
  }

  /**
   * Get current run ID
   */
  getRunId(): string | null {
    return this.runId;
  }

  /**
   * Set language for step labels
   */
  setLanguage(lang: "he" | "en"): void {
    this.language = lang;
  }

  /**
   * Get current language
   */
  getLanguage(): "he" | "en" {
    return this.language;
  }

  /**
   * Start a new step
   * @returns The full step ID (with timestamp suffix)
   */
  stepStart(
    runId: string,
    stepDef: TraceStepDefinition,
    language?: "he" | "en",
    parentId?: string
  ): string {
    if (this.isCompleted) {
      console.warn("TraceEmitter: Cannot add step to completed run");
      return "";
    }

    const lang = language || this.language;
    const fullId = `${stepDef.id}-${Date.now()}`;

    const step: TraceStep = {
      id: fullId,
      parentId: parentId || null,
      label: stepDef.label,
      status: "running",
      timestamp: Date.now()
    };

    this.steps.set(fullId, step);

    this.emit({
      type: "step.created",
      runId,
      step
    });

    return fullId;
  }

  /**
   * Mark step as done
   */
  stepDone(runId: string, stepId: string): void {
    this.updateStepStatus(runId, stepId, "done");
  }

  /**
   * Mark step as error
   */
  stepError(runId: string, stepId: string): void {
    this.updateStepStatus(runId, stepId, "error");
  }

  /**
   * Update step status
   */
  private updateStepStatus(
    runId: string,
    stepId: string,
    status: StepStatus
  ): void {
    // Find step by prefix (since we append timestamp)
    const fullStepId = this.findStepByPrefix(stepId);

    if (fullStepId) {
      const step = this.steps.get(fullStepId);
      if (step) {
        step.status = status;

        this.emit({
          type: "step.status",
          runId,
          stepId: fullStepId,
          status,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Add detail text to a step
   */
  stepDetail(runId: string, stepId: string, detail: string): void {
    const fullStepId = this.findStepByPrefix(stepId);

    if (fullStepId) {
      const step = this.steps.get(fullStepId);
      if (step) {
        step.detail = detail;

        this.emit({
          type: "step.detail",
          runId,
          stepId: fullStepId,
          detail
        });
      }
    }
  }

  /**
   * Stream assistant token chunk
   */
  assistantDelta(runId: string, content: string): void {
    this.emit({
      type: "assistant.delta",
      runId,
      content
    });
  }

  /**
   * Complete the run
   */
  completeRun(runId: string): void {
    if (this.isCompleted) return;

    this.isCompleted = true;

    this.emit({
      type: "run.completed",
      runId,
      timestamp: Date.now()
    });
  }

  /**
   * Subscribe to trace events
   * @returns Unsubscribe function
   */
  subscribe(callback: (event: TraceEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Emit event to all subscribers
   */
  private emit(event: TraceEvent): void {
    this.eventQueue.push(event);
    for (const callback of this.subscribers) {
      try {
        callback(event);
      } catch (error) {
        console.error("TraceEmitter: Subscriber error:", error);
      }
    }
  }

  /**
   * Find step ID by prefix
   */
  private findStepByPrefix(prefix: string): string | undefined {
    // If it's already a full ID (contains timestamp), return as-is if found
    if (this.steps.has(prefix)) {
      return prefix;
    }

    // Otherwise, search by prefix
    return Array.from(this.steps.keys()).find((k) => k.startsWith(prefix));
  }

  /**
   * Get all steps
   */
  getSteps(): TraceStep[] {
    return Array.from(this.steps.values());
  }

  /**
   * Get step by ID
   */
  getStep(stepId: string): TraceStep | undefined {
    return this.steps.get(stepId) || this.steps.get(this.findStepByPrefix(stepId) || "");
  }

  /**
   * Create async iterator for SSE streaming
   */
  async *stream(): AsyncGenerator<TraceEvent> {
    // Yield any queued events first
    for (const event of this.eventQueue) {
      yield event;
    }

    // If already completed, stop here
    if (this.isCompleted) {
      return;
    }

    // Then yield new events as they come
    const queue: TraceEvent[] = [];
    let resolve: (() => void) | null = null;
    let completed = false;

    const unsubscribe = this.subscribe((event) => {
      if (event.type === "run.completed") {
        completed = true;
      }
      queue.push(event);
      if (resolve) {
        resolve();
        resolve = null;
      }
    });

    try {
      while (!completed) {
        if (queue.length > 0) {
          const event = queue.shift()!;
          yield event;
          if (event.type === "run.completed") {
            break;
          }
        } else {
          await new Promise<void>((r) => {
            resolve = r;
          });
        }
      }
    } finally {
      unsubscribe();
    }
  }

  /**
   * Reset the emitter for reuse
   */
  reset(): void {
    this.runId = null;
    this.conversationId = null;
    this.steps.clear();
    this.eventQueue = [];
    this.subscribers.clear();
    this.isCompleted = false;
  }

  /**
   * Convert TraceEvent to MessageTraceUpdate for SSE streaming
   */
  toMessageUpdate(event: TraceEvent): MessageTraceUpdate | null {
    switch (event.type) {
      case "run.created":
        return {
          type: MessageUpdateType.Trace,
          subtype: MessageTraceUpdateType.RunCreated,
          runId: event.runId,
          conversationId: event.conversationId,
          timestamp: event.timestamp
        };

      case "run.completed":
        return {
          type: MessageUpdateType.Trace,
          subtype: MessageTraceUpdateType.RunCompleted,
          runId: event.runId,
          timestamp: event.timestamp
        };

      case "step.created":
        return {
          type: MessageUpdateType.Trace,
          subtype: MessageTraceUpdateType.StepCreated,
          runId: event.runId,
          step: {
            id: event.step.id,
            parentId: event.step.parentId,
            label: event.step.label,
            status: event.step.status,
            detail: event.step.detail,
            timestamp: event.step.timestamp,
            meta: event.step.meta
          }
        };

      case "step.status":
        return {
          type: MessageUpdateType.Trace,
          subtype: MessageTraceUpdateType.StepStatus,
          runId: event.runId,
          stepId: event.stepId,
          status: event.status,
          timestamp: event.timestamp
        };

      case "step.detail":
        return {
          type: MessageUpdateType.Trace,
          subtype: MessageTraceUpdateType.StepDetail,
          runId: event.runId,
          stepId: event.stepId,
          detail: event.detail
        };

      default:
        // Ignore assistant.delta events for trace panel (handled separately)
        return null;
    }
  }

  /**
   * Create async iterator for MessageUpdate streaming
   */
  async *streamAsMessageUpdates(): AsyncGenerator<MessageTraceUpdate> {
    for await (const event of this.stream()) {
      const update = this.toMessageUpdate(event);
      if (update) {
        yield update;
      }
    }
  }
}

/**
 * Factory function to create a new TraceEmitter
 */
export function createTraceEmitter(): TraceEmitter {
  return new TraceEmitter();
}
