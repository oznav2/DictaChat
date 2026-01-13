import { browser } from "$app/environment";
import { writable, type Writable, get } from "svelte/store";
import type { MemoryMetaV1 } from "$lib/types/MemoryMeta";

export type RightDockTab = "search" | "memory" | "knowledge" | "health" | "latency";

export type MemoryUiEvents =
	| "memoryui:toggleRightDock"
	| "memoryui:openPersonality"
	| "memoryui:openBooksProcessor"
	| "memoryui:openMemoryBank"
	| "memoryui:openMemoryEducation"
	| "memoryui:setConversation"
	| "memoryui:assistantStreamStarted"
	| "memoryui:assistantStreamFinished"
	| "memoryui:memoryMetaUpdated"
	| "memoryui:setBlockingScoring"
	| "memoryui:clearBlockingScoring"
	| "memoryui:documentProcessing";

export interface MemoryUiState {
	enabled: boolean;
	rightDock: {
		isOpen: boolean;
		widthPx: number;
		activeTab: RightDockTab;
	};
	modals: {
		personalityOpen: boolean;
		booksProcessorOpen: boolean;
		memoryBankOpen: boolean;
		memoryEducationOpen: boolean;
	};
	session: {
		activeConversationId: string | null;
		activeAssistantMessageId: string | null;
		lastCompletedAssistantMessageId: string | null;
		blockingScoringRequired: boolean;
		lastUnscoredMessageId: string | null;
	};
	data: {
		activeConcepts: string[];
		lastContextInsights: Record<string, unknown> | null;
		lastRetrievalDebug: Record<string, unknown> | null;
		lastKnownContextTextByMessageId: Record<string, string>;
		lastCitationsByMessageId: Record<
			string,
			Array<{
				tier: string;
				memory_id: string;
				doc_id?: string | null;
				content?: string;
				wilson_score?: number;
				confidence?: number;
			}>
		>;
		lastMemoryMetaByMessageId: Record<string, MemoryMetaV1>;
	};
	ui: {
		expandedKnownContextByMessageId: Record<string, boolean>;
		expandedCitationsByMessageId: Record<string, boolean>;
		feedbackEligibleByMessageId: Record<string, boolean>;
		selectedMemoryId: string | null;
	};
	processing: {
		status: "idle" | "searching" | "found" | "storing" | "learning" | "degraded" | "ingesting";
		foundCount: number;
		lastQuery: string | null;
		documentName: string | null;
		documentStage: "reading" | "extracting" | "chunking" | "embedding" | "storing" | "completed" | "recognized" | null;
		chunksProcessed: number;
		totalChunks: number;
	};
}

const RIGHT_DOCK_WIDTH_STORAGE_KEY = "rightDockWidth";
const RIGHT_DOCK_OPEN_STORAGE_KEY = "rightDockOpen";
const MEMORY_EDUCATION_SEEN_STORAGE_KEY = "memoryEducationSeen";

function readNumberFromStorage(key: string, fallback: number) {
	if (!browser) return fallback;
	const raw = window.localStorage.getItem(key);
	if (!raw) return fallback;
	const num = Number.parseInt(raw, 10);
	return Number.isFinite(num) ? num : fallback;
}

function readBooleanFromStorage(key: string, fallback: boolean) {
	if (!browser) return fallback;
	const raw = window.localStorage.getItem(key);
	if (raw === null) return fallback;
	return raw === "true";
}

function clampRightDockWidth(widthPx: number) {
	return Math.min(520, Math.max(240, widthPx));
}

const initialState: MemoryUiState = {
	enabled: false,
	rightDock: {
		isOpen: readBooleanFromStorage(RIGHT_DOCK_OPEN_STORAGE_KEY, false),
		widthPx: clampRightDockWidth(readNumberFromStorage(RIGHT_DOCK_WIDTH_STORAGE_KEY, 360)),
		activeTab: "search",
	},
	modals: {
		personalityOpen: false,
		booksProcessorOpen: false,
		memoryBankOpen: false,
		memoryEducationOpen: false,
	},
	session: {
		activeConversationId: null,
		activeAssistantMessageId: null,
		lastCompletedAssistantMessageId: null,
		blockingScoringRequired: false,
		lastUnscoredMessageId: null,
	},
	data: {
		activeConcepts: [],
		lastContextInsights: null,
		lastRetrievalDebug: null,
		lastKnownContextTextByMessageId: {},
		lastCitationsByMessageId: {},
		lastMemoryMetaByMessageId: {},
	},
	ui: {
		expandedKnownContextByMessageId: {},
		expandedCitationsByMessageId: {},
		feedbackEligibleByMessageId: {},
		selectedMemoryId: null,
	},
	processing: {
		status: "idle",
		foundCount: 0,
		lastQuery: null,
		documentName: null,
		documentStage: null,
		chunksProcessed: 0,
		totalChunks: 0,
	},
};

function createMemoryUiStore() {
	const store: Writable<MemoryUiState> = writable(initialState);

	function setEnabled(enabled: boolean) {
		store.update((s) => ({ ...s, enabled }));
	}

	function setConversation(conversationId: string) {
		store.update((s) => ({
			...s,
			session: {
				...s.session,
				activeConversationId: conversationId,
				activeAssistantMessageId: null,
			},
		}));
	}

	function toggleRightDock(tab?: RightDockTab) {
		store.update((s) => {
			const nextOpen = !s.rightDock.isOpen;
			const nextTab = tab ?? s.rightDock.activeTab;
			if (browser) {
				window.localStorage.setItem(RIGHT_DOCK_OPEN_STORAGE_KEY, String(nextOpen));
			}
			return {
				...s,
				rightDock: {
					...s.rightDock,
					isOpen: nextOpen,
					activeTab: nextTab,
				},
			};
		});
	}

	function openRightDock(tab?: RightDockTab) {
		store.update((s) => {
			if (browser) {
				window.localStorage.setItem(RIGHT_DOCK_OPEN_STORAGE_KEY, "true");
			}
			return {
				...s,
				rightDock: {
					...s.rightDock,
					isOpen: true,
					activeTab: tab ?? s.rightDock.activeTab,
				},
			};
		});
	}

	function closeRightDock() {
		store.update((s) => {
			if (browser) {
				window.localStorage.setItem(RIGHT_DOCK_OPEN_STORAGE_KEY, "false");
			}
			return {
				...s,
				rightDock: {
					...s.rightDock,
					isOpen: false,
				},
			};
		});
	}

	function setRightDockWidth(widthPx: number) {
		const clamped = clampRightDockWidth(widthPx);
		store.update((s) => ({
			...s,
			rightDock: {
				...s.rightDock,
				widthPx: clamped,
			},
		}));
		if (browser) {
			window.localStorage.setItem(RIGHT_DOCK_WIDTH_STORAGE_KEY, String(clamped));
		}
	}

	function setActiveDockTab(tab: RightDockTab) {
		store.update((s) => ({
			...s,
			rightDock: {
				...s.rightDock,
				activeTab: tab,
			},
		}));
	}

	function openPersonality() {
		store.update((s) => ({ ...s, modals: { ...s.modals, personalityOpen: true } }));
	}

	function closePersonality() {
		store.update((s) => ({ ...s, modals: { ...s.modals, personalityOpen: false } }));
	}

	function openBooksProcessor() {
		store.update((s) => ({ ...s, modals: { ...s.modals, booksProcessorOpen: true } }));
	}

	function closeBooksProcessor() {
		store.update((s) => ({ ...s, modals: { ...s.modals, booksProcessorOpen: false } }));
	}

	function openMemoryBank() {
		store.update((s) => ({ ...s, modals: { ...s.modals, memoryBankOpen: true } }));
	}

	function closeMemoryBank() {
		store.update((s) => ({ ...s, modals: { ...s.modals, memoryBankOpen: false } }));
	}

	function openMemoryEducation() {
		store.update((s) => ({ ...s, modals: { ...s.modals, memoryEducationOpen: true } }));
	}

	function closeMemoryEducation(params?: { markSeen?: boolean }) {
		store.update((s) => ({ ...s, modals: { ...s.modals, memoryEducationOpen: false } }));
		if (browser && params?.markSeen) {
			window.localStorage.setItem(MEMORY_EDUCATION_SEEN_STORAGE_KEY, "true");
		}
	}

	function openMemoryEducationIfNeeded() {
		if (!browser) return;
		const seen = readBooleanFromStorage(MEMORY_EDUCATION_SEEN_STORAGE_KEY, false);
		if (!seen) openMemoryEducation();
	}

	function assistantStreamStarted(params: { conversationId: string; messageId: string }) {
		store.update((s) => ({
			...s,
			session: {
				...s.session,
				activeConversationId: params.conversationId,
				activeAssistantMessageId: params.messageId,
			},
			ui: {
				...s.ui,
				feedbackEligibleByMessageId: {
					...s.ui.feedbackEligibleByMessageId,
					[params.messageId]: false,
				},
			},
		}));
	}

	function assistantStreamFinished(params: { conversationId: string; messageId: string }) {
		store.update((s) => ({
			...s,
			session: {
				...s.session,
				activeConversationId: params.conversationId,
				activeAssistantMessageId: null,
				lastCompletedAssistantMessageId: params.messageId,
			},
		}));
	}

	function setBlockingScoring(params: { messageId: string; required: boolean }) {
		store.update((s) => ({
			...s,
			session: {
				...s.session,
				blockingScoringRequired: params.required,
				lastUnscoredMessageId: params.required ? params.messageId : null,
			},
		}));
	}

	function clearBlockingScoring() {
		store.update((s) => ({
			...s,
			session: {
				...s.session,
				blockingScoringRequired: false,
				lastUnscoredMessageId: null,
			},
		}));
	}

	function memoryMetaUpdated(params: {
		conversationId: string;
		messageId: string;
		meta: MemoryMetaV1;
	}) {
		store.update((s) => ({
			...s,
			session: {
				...s.session,
				activeConversationId: params.conversationId,
			},
			data: {
				...s.data,
				activeConcepts: (params.meta.context_insights?.matched_concepts ?? []).slice(0, 8),
				lastContextInsights:
					(params.meta.context_insights as unknown as Record<string, unknown>) ?? null,
				lastRetrievalDebug: (params.meta.debug as unknown as Record<string, unknown>) ?? null,
				lastKnownContextTextByMessageId: {
					...s.data.lastKnownContextTextByMessageId,
					[params.messageId]: params.meta.known_context?.known_context_text ?? "",
				},
				lastCitationsByMessageId: {
					...s.data.lastCitationsByMessageId,
					[params.messageId]: (params.meta.citations ?? []).map((c) => ({
						tier: c.tier,
						memory_id: c.memory_id,
						doc_id: c.doc_id ?? null,
						content: c.content ?? c.text ?? undefined,
						wilson_score: c.wilson_score ?? undefined,
						confidence: c.confidence ?? c.score ?? undefined,
					})),
				},
				lastMemoryMetaByMessageId: {
					...s.data.lastMemoryMetaByMessageId,
					[params.messageId]: params.meta,
				},
			},
			ui: {
				...s.ui,
				feedbackEligibleByMessageId: {
					...s.ui.feedbackEligibleByMessageId,
					[params.messageId]: params.meta.feedback?.eligible === true,
				},
			},
		}));
	}

	function toggleKnownContextExpanded(messageId: string) {
		store.update((s) => ({
			...s,
			ui: {
				...s.ui,
				expandedKnownContextByMessageId: {
					...s.ui.expandedKnownContextByMessageId,
					[messageId]: !s.ui.expandedKnownContextByMessageId[messageId],
				},
			},
		}));
	}

	function toggleCitationsExpanded(messageId: string) {
		store.update((s) => ({
			...s,
			ui: {
				...s.ui,
				expandedCitationsByMessageId: {
					...s.ui.expandedCitationsByMessageId,
					[messageId]: !s.ui.expandedCitationsByMessageId[messageId],
				},
			},
		}));
	}

	function setSelectedMemoryId(memoryId: string | null) {
		store.update((s) => ({
			...s,
			ui: {
				...s.ui,
				selectedMemoryId: memoryId,
			},
		}));
	}

	function setProcessingStatus(status: MemoryUiState["processing"]["status"]) {
		store.update((s) => ({
			...s,
			processing: {
				...s.processing,
				status,
			},
		}));
	}

	function setProcessingFound(count: number) {
		store.update((s) => ({
			...s,
			processing: {
				...s.processing,
				status: "found",
				foundCount: count,
			},
		}));
	}

	function setProcessingSearching(query: string) {
		store.update((s) => ({
			...s,
			processing: {
				...s.processing,
				status: "searching",
				lastQuery: query,
			},
		}));
	}

	function resetProcessing() {
		store.update((s) => ({
			...s,
			processing: {
				status: "idle",
				foundCount: 0,
				lastQuery: null,
				documentName: null,
				documentStage: null,
				chunksProcessed: 0,
				totalChunks: 0,
			},
		}));
	}

	function setDocumentProcessing(params: {
		documentName: string;
		stage: MemoryUiState["processing"]["documentStage"];
		chunksProcessed?: number;
		totalChunks?: number;
		recognized?: boolean;
	}) {
		store.update((s) => ({
			...s,
			processing: {
				...s.processing,
				status: params.recognized ? "found" : "ingesting",
				documentName: params.documentName,
				documentStage: params.stage,
				chunksProcessed: params.chunksProcessed ?? s.processing.chunksProcessed,
				totalChunks: params.totalChunks ?? s.processing.totalChunks,
				foundCount: params.recognized ? params.totalChunks ?? 0 : s.processing.foundCount,
			},
		}));
	}

	function dispatch<K extends MemoryUiEvents>(type: K, detail?: unknown) {
		if (!browser) return;
		window.dispatchEvent(new CustomEvent(type, { detail }));
	}

	function installEventListeners() {
		if (!browser) return () => {};

		const handlers: Array<[MemoryUiEvents, (e: Event) => void]> = [
			[
				"memoryui:toggleRightDock",
				(e) => {
					const d = (e as CustomEvent).detail as { tab?: RightDockTab } | undefined;
					toggleRightDock(d?.tab);
				},
			],
			["memoryui:openPersonality", () => openPersonality()],
			["memoryui:openBooksProcessor", () => openBooksProcessor()],
			["memoryui:openMemoryBank", () => openMemoryBank()],
			["memoryui:openMemoryEducation", () => openMemoryEducation()],
			[
				"memoryui:setConversation",
				(e) => {
					const d = (e as CustomEvent).detail as { conversationId: string };
					if (d?.conversationId) setConversation(d.conversationId);
				},
			],
			[
				"memoryui:assistantStreamStarted",
				(e) => {
					const d = (e as CustomEvent).detail as { conversationId: string; messageId: string };
					if (d?.conversationId && d?.messageId) assistantStreamStarted(d);
				},
			],
			[
				"memoryui:assistantStreamFinished",
				(e) => {
					const d = (e as CustomEvent).detail as { conversationId: string; messageId: string };
					if (d?.conversationId && d?.messageId) assistantStreamFinished(d);
				},
			],
			[
				"memoryui:memoryMetaUpdated",
				(e) => {
					const d = (e as CustomEvent).detail as {
						conversationId: string;
						messageId: string;
						meta: MemoryMetaV1;
					};
					if (d?.conversationId && d?.messageId && d?.meta) memoryMetaUpdated(d);
				},
			],
			[
				"memoryui:setBlockingScoring",
				(e) => {
					const d = (e as CustomEvent).detail as { messageId: string; required: boolean };
					if (d?.messageId !== undefined) setBlockingScoring(d);
				},
			],
			["memoryui:clearBlockingScoring", () => clearBlockingScoring()],
			[
				"memoryui:documentProcessing",
				(e) => {
					const d = (e as CustomEvent).detail as {
						documentName: string;
						stage: MemoryUiState["processing"]["documentStage"];
						chunksProcessed?: number;
						totalChunks?: number;
						recognized?: boolean;
					};
					if (d?.documentName && d?.stage) setDocumentProcessing(d);
				},
			],
		];

		for (const [name, handler] of handlers) {
			window.addEventListener(name, handler as EventListener);
		}

		return () => {
			for (const [name, handler] of handlers) {
				window.removeEventListener(name, handler as EventListener);
			}
		};
	}

	return {
		subscribe: store.subscribe,
		setEnabled,
		setConversation,
		openRightDock,
		closeRightDock,
		toggleRightDock,
		setRightDockWidth,
		setActiveDockTab,
		openPersonality,
		closePersonality,
		openBooksProcessor,
		closeBooksProcessor,
		openMemoryBank,
		closeMemoryBank,
		openMemoryEducation,
		closeMemoryEducation,
		openMemoryEducationIfNeeded,
		assistantStreamStarted,
		assistantStreamFinished,
		setBlockingScoring,
		clearBlockingScoring,
		memoryMetaUpdated,
		toggleKnownContextExpanded,
		toggleCitationsExpanded,
		setSelectedMemoryId,
		setProcessingStatus,
		setProcessingFound,
		setProcessingSearching,
		resetProcessing,
		setDocumentProcessing,
		dispatch,
		installEventListeners,
		getState: () => get(store),
	};
}

export const memoryUi = createMemoryUiStore();
