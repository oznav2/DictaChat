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

	<!-- Excerpt -->
	<p class="mb-2 line-clamp-3 text-sm text-gray-300">
		"{citation.excerpt}"
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
