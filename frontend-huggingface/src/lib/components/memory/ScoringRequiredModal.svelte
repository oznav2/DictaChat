<script lang="ts">
	import { fade, scale } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { memoryUi } from "$lib/stores/memoryUi";
	import CarbonThumbsUp from "~icons/carbon/thumbs-up";
	import CarbonThumbsDown from "~icons/carbon/thumbs-down";
	import CarbonClose from "~icons/carbon/close";

	interface Props {
		isRTL?: boolean;
	}

	let { isRTL = false }: Props = $props();

	let isOpen = $derived($memoryUi.session.blockingScoringRequired);
	let messageId = $derived($memoryUi.session.lastUnscoredMessageId);

	let feedbackLoading = $state(false);
	let feedbackError = $state<string | null>(null);

	async function submitFeedback(value: "positive" | "negative" | "skip") {
		if (feedbackLoading || !messageId) return;

		feedbackLoading = true;
		feedbackError = null;

		try {
			if (value !== "skip") {
				const score = value === "positive" ? 1 : -1;
				const conversationId = $memoryUi.session.activeConversationId;
				const citations = $memoryUi.data.lastCitationsByMessageId[messageId] ?? [];

				const response = await fetch("/api/memory/feedback", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						messageId,
						conversationId,
						score,
						citations: citations.map((c) => c.memory_id),
					}),
				});

				if (!response.ok) {
					throw new Error("Failed to submit feedback");
				}
			}

			// Clear the blocking state
			memoryUi.clearBlockingScoring();
		} catch (err) {
			console.error("[ScoringRequiredModal] Feedback submission failed:", err);
			feedbackError = isRTL ? "שגיאה בשליחת משוב" : "Failed to submit feedback";
		} finally {
			feedbackLoading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === "Escape") {
			submitFeedback("skip");
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		transition:fade={{ duration: 200 }}
		role="dialog"
		aria-modal="true"
		aria-labelledby="scoring-modal-title"
	>
		<!-- Modal -->
		<div
			class="relative mx-4 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
			dir={isRTL ? "rtl" : "ltr"}
			transition:scale={{ duration: 200, easing: cubicOut, start: 0.95 }}
		>
			<!-- Close button -->
			<button
				type="button"
				class="absolute top-4 {isRTL
					? 'left-4'
					: 'right-4'} rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
				onclick={() => submitFeedback("skip")}
				title={isRTL ? "דלג" : "Skip"}
			>
				<CarbonClose class="h-5 w-5" />
			</button>

			<!-- Header -->
			<div class="mb-6 text-center">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30"
				>
					<span class="text-3xl">💭</span>
				</div>
				<h2 id="scoring-modal-title" class="text-xl font-semibold text-gray-900 dark:text-white">
					{isRTL ? "איך הייתה התשובה?" : "How was the response?"}
				</h2>
				<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
					{isRTL
						? "המשוב שלך עוזר לשפר את זיכרון המערכת"
						: "Your feedback helps improve the memory system"}
				</p>
			</div>

			<!-- Error message -->
			{#if feedbackError}
				<div
					class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700 dark:border-red-800/30 dark:bg-red-900/20 dark:text-red-300"
					transition:fade={{ duration: 150 }}
				>
					{feedbackError}
				</div>
			{/if}

			<!-- Feedback buttons -->
			<div class="flex gap-4">
				<button
					type="button"
					class="flex flex-1 flex-col items-center gap-2 rounded-xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-white p-4 transition-all hover:border-green-400 hover:from-green-100 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 dark:border-green-800/50 dark:from-green-950/30 dark:to-gray-900/50 dark:hover:border-green-600 dark:hover:from-green-900/40"
					disabled={feedbackLoading}
					onclick={() => submitFeedback("positive")}
				>
					<div
						class="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30"
					>
						<CarbonThumbsUp class="h-6 w-6 text-green-600 dark:text-green-400" />
					</div>
					<span class="font-medium text-green-700 dark:text-green-300">
						{isRTL ? "מועיל" : "Helpful"}
					</span>
				</button>

				<button
					type="button"
					class="flex flex-1 flex-col items-center gap-2 rounded-xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-white p-4 transition-all hover:border-red-400 hover:from-red-100 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800/50 dark:from-red-950/30 dark:to-gray-900/50 dark:hover:border-red-600 dark:hover:from-red-900/40"
					disabled={feedbackLoading}
					onclick={() => submitFeedback("negative")}
				>
					<div
						class="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
					>
						<CarbonThumbsDown class="h-6 w-6 text-red-600 dark:text-red-400" />
					</div>
					<span class="font-medium text-red-700 dark:text-red-300">
						{isRTL ? "לא מועיל" : "Not helpful"}
					</span>
				</button>
			</div>

			<!-- Skip link -->
			<div class="mt-4 text-center">
				<button
					type="button"
					class="text-sm text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
					disabled={feedbackLoading}
					onclick={() => submitFeedback("skip")}
				>
					{isRTL ? "דלג הפעם" : "Skip this time"}
				</button>
			</div>

			<!-- Loading overlay -->
			{#if feedbackLoading}
				<div
					class="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80 dark:bg-gray-900/80"
					transition:fade={{ duration: 150 }}
				>
					<div
						class="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"
					></div>
				</div>
			{/if}
		</div>
	</div>
{/if}
