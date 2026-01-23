import { browser } from "$app/environment";
import { writable } from "svelte/store";

export type MemoryEventType =
	| "memory_updated"
	| "document_ingested"
	| "document_deleted"
	| "kg_updated"
	| "action_completed";

export interface MemoryEvent {
	type: MemoryEventType;
	userId?: string;
	detail?: Record<string, unknown>;
	at: number;
}

export const memoryEvents = writable<MemoryEvent | null>(null);

// Phase 4.3: Debounced event dispatch to prevent rapid-fire UI refreshes
// Coalesces multiple events within 150ms window into single dispatch
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingEvent: MemoryEvent | null = null;
const DEBOUNCE_MS = 150;

export function dispatchMemoryEvent(event: Omit<MemoryEvent, "at"> & { at?: number }) {
	const fullEvent: MemoryEvent = { ...event, at: event.at ?? Date.now() };

	// Store the latest event (newer events overwrite older ones in same window)
	pendingEvent = fullEvent;

	// Clear existing timer if any
	if (debounceTimer) {
		clearTimeout(debounceTimer);
	}

	// Schedule dispatch after debounce window
	debounceTimer = setTimeout(() => {
		if (pendingEvent) {
			memoryEvents.set(pendingEvent);

			// Phase 4.3: Also dispatch CustomEvent for backwards compatibility
			// (MemoryPanel still uses window listener)
			if (browser) {
				window.dispatchEvent(new CustomEvent("memoryUpdated", { detail: pendingEvent }));
			}

			pendingEvent = null;
		}
		debounceTimer = null;
	}, DEBOUNCE_MS);
}

/**
 * Force immediate dispatch without debouncing (for critical events)
 */
export function dispatchMemoryEventImmediate(event: Omit<MemoryEvent, "at"> & { at?: number }) {
	const fullEvent: MemoryEvent = { ...event, at: event.at ?? Date.now() };

	// Clear any pending debounced event
	if (debounceTimer) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}
	pendingEvent = null;

	// Dispatch immediately
	memoryEvents.set(fullEvent);
	if (browser) {
		window.dispatchEvent(new CustomEvent("memoryUpdated", { detail: fullEvent }));
	}
}
