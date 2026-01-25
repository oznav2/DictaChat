<script lang="ts">
	import type { ParsedCitation } from "$lib/utils/citationParser";
	import {
		getTierIcon,
		getTierLabel,
		getConfidenceColor,
		formatConfidence,
	} from "$lib/utils/citationParser";

	interface Props {
		citation: ParsedCitation;
		isRTL?: boolean;
		onClickDetail?: (memoryId: string) => void;
	}

	let { citation, isRTL = false, onClickDetail }: Props = $props();

	function handleDetailClick() {
		onClickDetail?.(citation.memoryId);
	}

	/**
	 * Check if excerpt content is problematic (unknown, gibberish, too short)
	 * Returns true if content should be replaced with fallback
	 */
	function isPoorQualityContent(excerpt: string): boolean {
		if (!excerpt || excerpt.length < 10) return true;
		// Detect common bad patterns
		const badPatterns = [
			/^<unknown>$/i,
			/^unknown$/i,
			/^null$/i,
			/^undefined$/i,
			/^[\[\]\{\}\(\)]+$/, // Just brackets
			/^[^\w\u0590-\u05FF]+$/, // No alphanumeric or Hebrew chars
		];
		return badPatterns.some((pattern) => pattern.test(excerpt.trim()));
	}

	/**
	 * Get a meaningful fallback description based on tier
	 */
	function getTierFallbackDescription(tier: string, isRTL: boolean): string {
		const fallbacks: Record<string, { en: string; he: string }> = {
			documents: { en: "Retrieved document content", he: "תוכן מסמך שאוחזר" },
			working: { en: "Recent conversation context", he: "הקשר שיחה עדכני" },
			history: { en: "Past conversation reference", he: "הפניה לשיחה קודמת" },
			patterns: { en: "Learned behavior pattern", he: "דפוס התנהגות שנלמד" },
			memory_bank: { en: "Stored fact or preference", he: "עובדה או העדפה שמורה" },
		};
		const fallback = fallbacks[tier] || { en: "Retrieved memory", he: "זיכרון שאוחזר" };
		return isRTL ? fallback.he : fallback.en;
	}

	// Compute display excerpt with fallback
	const displayExcerpt = $derived(
		isPoorQualityContent(citation.excerpt)
			? getTierFallbackDescription(citation.tier, isRTL)
			: citation.excerpt
	);

	const isPoorQuality = $derived(isPoorQualityContent(citation.excerpt));
</script>

<div
	class="citation-tooltip rounded-lg bg-gray-800 p-3 shadow-lg"
	class:rtl={isRTL}
	style="max-width: 280px; z-index: 50;"
	dir={isRTL ? "rtl" : "ltr"}
>
	<!-- Header with tier icon, label, and confidence -->
	<div class="mb-2 flex items-center gap-2">
		<span class="text-lg">{getTierIcon(citation.tier)}</span>
		<span class="font-medium capitalize">{getTierLabel(citation.tier)}</span>
		<span class="{getConfidenceColor(citation.confidence)} text-sm">
			{formatConfidence(citation.confidence)}
		</span>
	</div>

	<!-- Excerpt with fallback for poor quality content -->
	<p class="mb-2 line-clamp-3 text-sm" class:text-gray-300={!isPoorQuality} class:text-gray-400={isPoorQuality} class:italic={isPoorQuality}>
		{#if isPoorQuality}
			{displayExcerpt}
		{:else}
			"{displayExcerpt}"
		{/if}
	</p>

	<!-- Footer with citation number and detail link -->
	<div class="flex items-center justify-between text-xs text-gray-500">
		<span class="font-mono">[{citation.index}]</span>
		{#if onClickDetail}
			<button
				type="button"
				class="text-blue-400 hover:text-blue-300 hover:underline"
				onclick={handleDetailClick}
			>
				{isRTL ? "פרטים נוספים" : "View details"}
			</button>
		{/if}
	</div>
</div>

<style>
	.citation-tooltip {
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.line-clamp-3 {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.rtl {
		text-align: right;
	}
</style>
