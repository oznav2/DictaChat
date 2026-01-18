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

export function dispatchMemoryEvent(event: Omit<MemoryEvent, "at"> & { at?: number }) {
	const fullEvent: MemoryEvent = { ...event, at: event.at ?? Date.now() };
	memoryEvents.set(fullEvent);

	if (browser) {
		window.dispatchEvent(new CustomEvent("memoryUpdated", { detail: fullEvent }));
	}
}
