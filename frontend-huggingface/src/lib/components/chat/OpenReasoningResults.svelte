<script lang="ts">
	import MarkdownRenderer from "./MarkdownRenderer.svelte";
	import { detectRTLLanguage } from "$lib/utils/marked";
	import CarbonChevronDown from "~icons/carbon/chevron-down";

	interface Props {
		content: string;
		loading?: boolean;
		hasNext?: boolean;
	}

	let { content, loading = false, hasNext = false }: Props = $props();
	let isOpen = $state(false);
	let wasLoading = $state(false);
	let initialized = $state(false);
	let isRTL = $derived(detectRTLLanguage(content));

	// Track loading transitions to auto-expand/collapse
	$effect(() => {
		// Auto-expand on first render if already loading
		if (!initialized) {
			initialized = true;
			if (loading) {
				isOpen = true;
				wasLoading = true;
				return;
			}
		}

		if (loading && !wasLoading) {
			// Loading started - auto-expand
			isOpen = true;
		} else if (!loading && wasLoading) {
			// Loading finished - auto-collapse
			isOpen = false;
		}
		wasLoading = loading;
	});
</script>

<div
	class="mb-2 flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
	dir={isRTL ? "rtl" : "ltr"}
>
	<button
		type="button"
		class="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/50"
		onclick={() => (isOpen = !isOpen)}
	>
		{#if isRTL}
			<CarbonChevronDown
				class="ml-2 size-4 flex-none transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
			/>
			<span class="line-clamp-1 flex-1 font-medium text-right">
				{isOpen ? "Thought process" : content.replace(/[#*_`~[\]]/g, "").replace(/\n+/g, " ").trim()}
			</span>
		{:else}
			<span class="line-clamp-1 flex-1 font-medium">
				{isOpen ? "Thought process" : content.replace(/[#*_`~[\]]/g, "").replace(/\n+/g, " ").trim()}
			</span>
			<CarbonChevronDown
				class="ml-2 size-4 flex-none transition-transform duration-200 {isOpen
					? 'rotate-180'
					: ''}"
			/>
		{/if}
	</button>

	{#if isOpen}
		<div
			class="prose prose-sm max-w-none border-t border-gray-200 px-3 py-2 text-sm leading-relaxed text-gray-600 dark:border-gray-700 dark:prose-invert dark:text-gray-300"
		>
			<MarkdownRenderer {content} {loading} />
		</div>
	{/if}
</div>
