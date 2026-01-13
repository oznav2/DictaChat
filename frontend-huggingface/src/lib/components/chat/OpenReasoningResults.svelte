<script lang="ts">
	import { slide } from "svelte/transition";
	import { cubicOut, backOut } from "svelte/easing";
	import { browser } from "$app/environment";
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
	
	// Respect user's motion preferences
	const prefersReducedMotion = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	$effect(() => {
		void hasNext;
	});

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
	class="reasoning-block mb-2 flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50 transition-shadow duration-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800"
	dir={isRTL ? "rtl" : "ltr"}
>
	<button
		type="button"
		class="reasoning-header group flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-500 transition-colors duration-200 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/50"
		onclick={() => (isOpen = !isOpen)}
		aria-expanded={isOpen}
		aria-label={isOpen ? "Collapse thought process" : "Expand thought process"}
	>
		{#if isRTL}
			<div class="chevron-wrapper ml-2 flex-none">
				<CarbonChevronDown
					class="size-4 transition-transform duration-300 ease-out {isOpen ? 'rotate-180' : ''}"
				/>
			</div>
			<span class="line-clamp-1 flex-1 text-right font-medium transition-colors duration-200 group-hover:text-gray-700 dark:group-hover:text-gray-200">
				{isOpen
					? "Thought process"
					: content
							.replace(/[#*_`~[\]]/g, "")
							.replace(/\n+/g, " ")
							.trim()}
			</span>
			<!-- Thinking indicator when loading -->
			{#if loading}
				<div class="thinking-indicator mr-2 flex items-center gap-1">
					<span class="thinking-dot h-1.5 w-1.5 rounded-full bg-blue-400"></span>
					<span class="thinking-dot h-1.5 w-1.5 rounded-full bg-blue-400"></span>
					<span class="thinking-dot h-1.5 w-1.5 rounded-full bg-blue-400"></span>
				</div>
			{/if}
		{:else}
			<!-- Thinking indicator when loading -->
			{#if loading}
				<div class="thinking-indicator ml-0 mr-2 flex items-center gap-1">
					<span class="thinking-dot h-1.5 w-1.5 rounded-full bg-blue-400"></span>
					<span class="thinking-dot h-1.5 w-1.5 rounded-full bg-blue-400"></span>
					<span class="thinking-dot h-1.5 w-1.5 rounded-full bg-blue-400"></span>
				</div>
			{/if}
			<span class="line-clamp-1 flex-1 font-medium transition-colors duration-200 group-hover:text-gray-700 dark:group-hover:text-gray-200">
				{isOpen
					? "Thought process"
					: content
							.replace(/[#*_`~[\]]/g, "")
							.replace(/\n+/g, " ")
							.trim()}
			</span>
			<div class="chevron-wrapper ml-2 flex-none">
				<CarbonChevronDown
					class="size-4 transition-transform duration-300 ease-out {isOpen ? 'rotate-180' : ''}"
				/>
			</div>
		{/if}
	</button>

	{#if isOpen}
		<div
			class="reasoning-content prose prose-sm max-w-none border-t border-gray-200 px-3 py-2 text-sm leading-relaxed text-gray-600 dark:prose-invert dark:border-gray-700 dark:text-gray-300"
			transition:slide={{ duration: prefersReducedMotion ? 0 : 250, easing: cubicOut }}
		>
			<MarkdownRenderer {content} {loading} />
		</div>
	{/if}
</div>

<style>
	/* Block entrance animation */
	.reasoning-block {
		animation: blockEnter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes blockEnter {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Thinking dots animation */
	.thinking-dot {
		animation: thinkingPulse 1.4s ease-in-out infinite;
	}

	.thinking-dot:nth-child(2) {
		animation-delay: 0.2s;
	}

	.thinking-dot:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes thinkingPulse {
		0%, 80%, 100% {
			opacity: 0.3;
			transform: scale(0.8);
		}
		40% {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* Chevron rotation enhancement */
	.chevron-wrapper {
		transition: transform 0.2s ease;
	}

	.reasoning-header:hover .chevron-wrapper {
		transform: translateY(1px);
	}

	.reasoning-header:active .chevron-wrapper {
		transform: translateY(2px);
	}

	/* Content fade-in within slide */
	.reasoning-content {
		animation: contentFadeIn 0.25s ease-out 0.1s both;
	}

	@keyframes contentFadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		.reasoning-block,
		.thinking-dot,
		.chevron-wrapper,
		.reasoning-content {
			animation: none !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
