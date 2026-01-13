<script lang="ts">
	import { slide, fade, scale } from "svelte/transition";
	import { cubicOut, backOut } from "svelte/easing";
	import { memoryUi } from "$lib/stores/memoryUi";
	import {
		getTierIcon,
		getConfidenceColor,
		getConfidenceBgColor,
		formatConfidence,
	} from "$lib/utils/citationParser";
	import CarbonChevronDown from "~icons/carbon/chevron-down";
	import CarbonChevronUp from "~icons/carbon/chevron-up";
	import CarbonBook from "~icons/carbon/book";
	import CarbonDocument from "~icons/carbon/document";
	import CarbonThumbsUp from "~icons/carbon/thumbs-up";
	import CarbonThumbsDown from "~icons/carbon/thumbs-down";
	import CarbonCheckmarkOutline from "~icons/carbon/checkmark-outline";

	interface Props {
		messageId: string;
		isRTL?: boolean;
		isStreaming?: boolean;
	}

	let { messageId, isRTL = false, isStreaming = false }: Props = $props();

	// Get memory metadata from store
	let memoryMeta = $derived($memoryUi.data.lastMemoryMetaByMessageId[messageId]);
	let knownContextText = $derived($memoryUi.data.lastKnownContextTextByMessageId[messageId] ?? "");
	let citations = $derived($memoryUi.data.lastCitationsByMessageId[messageId] ?? []);
	let isKnownContextExpanded = $derived(
		$memoryUi.ui.expandedKnownContextByMessageId[messageId] ?? false
	);
	let isCitationsExpanded = $derived($memoryUi.ui.expandedCitationsByMessageId[messageId] ?? false);
	let isFeedbackEligible = $derived($memoryUi.ui.feedbackEligibleByMessageId[messageId] ?? false);

	// Derived values
	let hasKnownContext = $derived(knownContextText.length > 0);
	let hasCitations = $derived(citations.length > 0);
	let knownContextItems = $derived(memoryMeta?.known_context?.known_context_items ?? []);
	let retrievalConfidence = $derived(memoryMeta?.debug?.retrieval_confidence ?? "low");
	let tiersUsed = $derived(memoryMeta?.retrieval?.tiers_used ?? []);

	// Feedback state
	let feedbackSubmitted = $state(false);
	let feedbackValue = $state<"positive" | "negative" | null>(null);
	let feedbackLoading = $state(false);

	function toggleKnownContext() {
		memoryUi.toggleKnownContextExpanded(messageId);
	}

	function toggleCitations() {
		memoryUi.toggleCitationsExpanded(messageId);
	}

	async function submitFeedback(value: "positive" | "negative") {
		if (feedbackSubmitted || feedbackLoading) return;

		feedbackLoading = true;
		feedbackValue = value;

		try {
			const score = value === "positive" ? 1 : -1;
			const response = await fetch("/api/memory/feedback", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					messageId,
					conversationId: memoryMeta?.conversation_id,
					score,
					citations: citations.map((c) => c.memory_id),
				}),
			});

			if (response.ok) {
				feedbackSubmitted = true;
			}
		} catch (err) {
			console.error("[MemoryContextIndicator] Feedback submission failed:", err);
			feedbackValue = null;
		} finally {
			feedbackLoading = false;
		}
	}

	function getTierLabel(tier: string): string {
		const labels: Record<string, string> = {
			working: isRTL ? "זיכרון עבודה" : "Working Memory",
			history: isRTL ? "היסטוריה" : "History",
			patterns: isRTL ? "תבניות" : "Patterns",
			books: isRTL ? "ספרים" : "Books",
			memory_bank: isRTL ? "בנק זיכרון" : "Memory Bank",
		};
		return labels[tier] ?? tier;
	}

	function getConfidenceBadgeClass(confidence: string): string {
		switch (confidence) {
			case "high":
				return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
			case "medium":
				return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
			default:
				return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
		}
	}

	function truncateText(text: string, maxLen: number): string {
		if (text.length <= maxLen) return text;
		return text.slice(0, maxLen) + "...";
	}
</script>

{#if (hasKnownContext || hasCitations) && !isStreaming}
	<div
		class="memory-context-indicator mt-3 space-y-2"
		dir={isRTL ? "rtl" : "ltr"}
		in:fade={{ duration: 300 }}
		out:fade={{ duration: 150 }}
	>
		<!-- Known Context Badge -->
		{#if hasKnownContext}
			<div class="known-context-section">
				<button
					type="button"
					class="flex w-full items-center gap-2 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50/80 to-white/60 px-3 py-2 text-sm transition-colors hover:from-blue-100/80 dark:border-blue-800/50 dark:from-blue-950/40 dark:to-gray-900/40 dark:hover:from-blue-900/50"
					onclick={toggleKnownContext}
				>
					<CarbonBook class="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
					<span class="flex-grow text-start font-medium text-blue-700 dark:text-blue-300">
						{isRTL ? "הקשר ידוע" : "Known Context"}
					</span>
					<span
						class="rounded-full px-2 py-0.5 text-xs {getConfidenceBadgeClass(retrievalConfidence)}"
					>
						{retrievalConfidence}
					</span>
					{#if tiersUsed.length > 0}
						<span
							class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
						>
							{tiersUsed.length}
							{isRTL ? "שכבות" : "tiers"}
						</span>
					{/if}
					{#if isKnownContextExpanded}
						<CarbonChevronUp class="h-4 w-4 text-gray-500" />
					{:else}
						<CarbonChevronDown class="h-4 w-4 text-gray-500" />
					{/if}
				</button>

				{#if isKnownContextExpanded}
					<div
						class="mt-2 space-y-2 rounded-lg border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/50"
						transition:slide={{ duration: 200, easing: cubicOut }}
					>
						{#if knownContextItems.length > 0}
							{#each knownContextItems as item (item.memory_id)}
								{@const itemConfidence = item.wilson_score ?? item.confidence ?? 0.5}
								<div
									class="flex items-start gap-2 rounded border-l-2 bg-white/60 p-2 dark:bg-gray-900/40 {item.tier ===
									'books'
										? 'border-purple-400'
										: item.tier === 'patterns'
											? 'border-green-400'
											: item.tier === 'memory_bank'
												? 'border-orange-400'
												: 'border-blue-400'}"
								>
									<!-- Tier icon -->
									<span class="mt-0.5 flex-shrink-0 text-lg" title={getTierLabel(item.tier)}>
										{getTierIcon(item.tier)}
									</span>
									<div class="flex-grow">
										<div class="mb-1 flex items-center gap-2">
											<span
												class="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
											>
												{getTierLabel(item.tier)}
											</span>
											<!-- Confidence indicator -->
											<span class="{getConfidenceColor(itemConfidence)} text-[10px] font-medium">
												{formatConfidence(itemConfidence)}
											</span>
											{#if item.doc_id}
												<span class="text-[10px] text-gray-400">
													{truncateText(item.doc_id, 20)}
												</span>
											{/if}
										</div>
										<p class="text-xs leading-relaxed text-gray-700 dark:text-gray-300">
											{truncateText(item.content, 200)}
										</p>
									</div>
								</div>
							{/each}
						{:else}
							<p class="text-xs italic text-gray-500">
								{truncateText(knownContextText, 300)}
							</p>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Citations Section -->
		{#if hasCitations}
			<div class="citations-section">
				<button
					type="button"
					class="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-gradient-to-br from-gray-50/80 to-white/60 px-3 py-2 text-sm transition-colors hover:from-gray-100/80 dark:border-gray-700/50 dark:from-gray-800/40 dark:to-gray-900/40 dark:hover:from-gray-700/50"
					onclick={toggleCitations}
				>
					<CarbonDocument class="h-4 w-4 flex-shrink-0 text-gray-600 dark:text-gray-400" />
					<span class="flex-grow text-start font-medium text-gray-700 dark:text-gray-300">
						{citations.length}
						{isRTL
							? citations.length === 1
								? "ציטוט"
								: "ציטוטים"
							: citations.length === 1
								? "Citation"
								: "Citations"}
					</span>
					{#if isCitationsExpanded}
						<CarbonChevronUp class="h-4 w-4 text-gray-500" />
					{:else}
						<CarbonChevronDown class="h-4 w-4 text-gray-500" />
					{/if}
				</button>

				{#if isCitationsExpanded}
					<div
						class="mt-2 space-y-1.5 rounded-lg border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/50"
						transition:slide={{ duration: 200, easing: cubicOut }}
					>
						{#each citations as citation, index (citation.memory_id)}
							{@const confidence = citation.wilson_score ?? citation.confidence ?? 0.5}
							<div
								class="flex items-center gap-2 rounded bg-white/60 px-2 py-1.5 text-xs dark:bg-gray-900/40"
							>
								<!-- Citation index with confidence color -->
								<span
									class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium {getConfidenceBgColor(
										confidence
									)} {getConfidenceColor(confidence)}"
								>
									{index + 1}
								</span>
								<!-- Tier icon -->
								<span class="text-base" title={getTierLabel(citation.tier)}>
									{getTierIcon(citation.tier)}
								</span>
								<!-- Tier label -->
								<span
									class="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400"
								>
									{getTierLabel(citation.tier)}
								</span>
								<!-- Content excerpt -->
								<span class="flex-grow truncate text-gray-600 dark:text-gray-400">
									{truncateText(citation.content ?? citation.memory_id, 40)}
								</span>
								<!-- Confidence percentage -->
								<span class="{getConfidenceColor(confidence)} text-[10px] font-medium">
									{formatConfidence(confidence)}
								</span>
								{#if citation.doc_id}
									<span class="text-[10px] text-gray-400">
										{truncateText(citation.doc_id, 16)}
									</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Feedback Buttons -->
		{#if isFeedbackEligible && !feedbackSubmitted}
			<div
				class="feedback-section flex items-center gap-2 rounded-lg border border-gray-200 bg-gradient-to-br from-gray-50/80 to-white/60 px-3 py-2 dark:border-gray-700/50 dark:from-gray-800/40 dark:to-gray-900/40"
				transition:fade={{ duration: 200 }}
			>
				<span class="flex-grow text-xs text-gray-500 dark:text-gray-400">
					{isRTL ? "האם התשובה עזרה?" : "Was this helpful?"}
				</span>
				<button
					type="button"
					class="rounded-lg p-1.5 transition-colors {feedbackValue === 'positive'
						? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
						: 'text-gray-400 hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/20 dark:hover:text-green-400'}"
					disabled={feedbackLoading}
					onclick={() => submitFeedback("positive")}
					title={isRTL ? "מועיל" : "Helpful"}
				>
					<CarbonThumbsUp class="h-4 w-4" />
				</button>
				<button
					type="button"
					class="rounded-lg p-1.5 transition-colors {feedbackValue === 'negative'
						? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
						: 'text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400'}"
					disabled={feedbackLoading}
					onclick={() => submitFeedback("negative")}
					title={isRTL ? "לא מועיל" : "Not helpful"}
				>
					<CarbonThumbsDown class="h-4 w-4" />
				</button>
			</div>
		{/if}

		{#if feedbackSubmitted}
			<div
				class="feedback-success flex items-center gap-2 rounded-lg border border-green-200 bg-green-50/80 px-3 py-2 dark:border-green-800/30 dark:bg-green-900/20"
				in:scale={{ duration: 300, start: 0.9, easing: backOut }}
				out:fade={{ duration: 150, easing: cubicOut }}
			>
				<div class="success-icon">
					<CarbonCheckmarkOutline class="h-4 w-4 text-green-600 dark:text-green-400" />
				</div>
				<span class="text-xs text-green-700 dark:text-green-300">
					{isRTL ? "תודה על המשוב!" : "Thanks for your feedback!"}
				</span>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Section entrance animations */
	.known-context-section,
	.citations-section,
	.feedback-section {
		animation: sectionEnter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes sectionEnter {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Button hover lift effect */
	.known-context-section button,
	.citations-section button {
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}

	.known-context-section button:hover,
	.citations-section button:hover {
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
	}

	:global(.dark) .known-context-section button:hover,
	:global(.dark) .citations-section button:hover {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	.known-context-section button:active,
	.citations-section button:active {
		transform: translateY(0);
	}

	/* Success feedback animation */
	.feedback-success {
		animation: feedbackPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes feedbackPop {
		0% {
			opacity: 0;
			transform: scale(0.9);
		}
		70% {
			transform: scale(1.02);
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}

	.success-icon {
		animation: iconPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
	}

	@keyframes iconPop {
		0% {
			transform: scale(0);
		}
		70% {
			transform: scale(1.2);
		}
		100% {
			transform: scale(1);
		}
	}

	/* Feedback button hover states */
	.feedback-section button {
		transition: transform 0.15s ease, background-color 0.2s ease;
	}

	.feedback-section button:hover {
		transform: scale(1.1);
	}

	.feedback-section button:active {
		transform: scale(0.95);
	}

	/* Mobile touch feedback */
	@media (hover: none) {
		.known-context-section button:active,
		.citations-section button:active {
			transform: scale(0.98);
		}
	}

	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		.known-context-section,
		.citations-section,
		.feedback-section,
		.feedback-success,
		.success-icon,
		.known-context-section button,
		.citations-section button,
		.feedback-section button {
			animation: none !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
