<script lang="ts">
	import { slide } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { browser } from "$app/environment";
	import CarbonChevronDown from "~icons/carbon/chevron-down";
	import CarbonCheckmark from "~icons/carbon/checkmark";
	import CarbonSearch from "~icons/carbon/search";
	import CarbonDataBase from "~icons/carbon/data-base";
	import CarbonMachineLearning from "~icons/carbon/machine-learning";
	import IconLoading from "../icons/IconLoading.svelte";

	interface ProcessingStep {
		status:
			| "idle"
			| "searching"
			| "found"
			| "storing"
			| "learning"
			| "degraded"
			| "ingesting"
			| "tool_ingesting";
		count?: number;
		query?: string;
		timestamp: number;
	}

	interface Props {
		steps: ProcessingStep[];
		isRTL?: boolean;
		loading?: boolean;
	}

	let { steps, isRTL = false, loading = false }: Props = $props();
	let isOpen = $state(false);

	// Respect user's motion preferences
	const prefersReducedMotion =
		browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	// Get summary for collapsed state
	let summary = $derived.by(() => {
		if (steps.length === 0) return "";
		const lastStep = steps[steps.length - 1];
		const foundStep = steps.find((s) => s.status === "found");
		if (foundStep?.count) {
			return isRTL ? `נמצאו ${foundStep.count} זיכרונות` : `Found ${foundStep.count} memories`;
		}
		return getMessage(lastStep.status, lastStep.count ?? 0, isRTL);
	});

	function getMessage(status: ProcessingStep["status"], count: number, rtl: boolean): string {
		if (rtl) {
			switch (status) {
				case "searching":
					return "מחפש בזיכרונות...";
				case "found":
					return count === 1 ? "נמצא זיכרון אחד" : `נמצאו ${count} זיכרונות`;
				case "storing":
					return "שומר בזיכרון...";
				case "learning":
					return "לומד מהתשובה...";
				case "degraded":
					return "מערכת הזיכרון במצב ירוד";
				case "ingesting":
					return "מעבד מסמך...";
				case "tool_ingesting":
					return "מעבד תוצאות כלי...";
				default:
					return "";
			}
		}

		switch (status) {
			case "searching":
				return "Searching memories...";
			case "found":
				return count === 1 ? "Found 1 memory" : `Found ${count} memories`;
			case "storing":
				return "Storing to memory...";
			case "learning":
				return "Learning from response...";
			case "degraded":
				return "Memory system degraded";
			case "ingesting":
				return "Processing document...";
			case "tool_ingesting":
				return "Ingesting tool result...";
			default:
				return "";
		}
	}

	function getIcon(status: ProcessingStep["status"]) {
		switch (status) {
			case "searching":
				return "search";
			case "found":
				return "check";
			case "storing":
				return "database";
			case "learning":
				return "brain";
			case "degraded":
				return "database";
			case "ingesting":
				return "spinner";
			case "tool_ingesting":
				return "spinner";
			default:
				return "check";
		}
	}

	function getColor(status: ProcessingStep["status"]) {
		switch (status) {
			case "searching":
				return "text-blue-400";
			case "found":
				return "text-green-400";
			case "storing":
				return "text-purple-400";
			case "learning":
				return "text-amber-400";
			case "degraded":
				return "text-red-400";
			case "ingesting":
				return "text-indigo-400";
			case "tool_ingesting":
				return "text-indigo-400";
			default:
				return "text-gray-400";
		}
	}
</script>

{#if steps.length > 0}
	<div
		class="memory-processing-block mb-2 flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50 transition-shadow duration-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800"
		dir={isRTL ? "rtl" : "ltr"}
	>
		<button
			type="button"
			class="memory-header group flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-500 transition-colors duration-200 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/50"
			onclick={() => (isOpen = !isOpen)}
			aria-expanded={isOpen}
			aria-label={isOpen ? "Collapse memory steps" : "Expand memory steps"}
		>
			{#if isRTL}
				<div class="chevron-wrapper ml-2 flex-none">
					<CarbonChevronDown
						class="size-4 transition-transform duration-300 ease-out {isOpen ? 'rotate-180' : ''}"
					/>
				</div>
				<span
					class="line-clamp-1 flex-1 text-right font-medium transition-colors duration-200 group-hover:text-gray-700 dark:group-hover:text-gray-200"
				>
					{isOpen ? "שלבי זיכרון" : summary}
				</span>
				{#if loading}
					<div class="processing-indicator mr-2 flex items-center gap-1">
						<span class="processing-dot h-1.5 w-1.5 rounded-full bg-blue-400"></span>
						<span class="processing-dot h-1.5 w-1.5 rounded-full bg-blue-400"></span>
						<span class="processing-dot h-1.5 w-1.5 rounded-full bg-blue-400"></span>
					</div>
				{/if}
			{:else}
				{#if loading}
					<div class="processing-indicator ml-0 mr-2 flex items-center gap-1">
						<span class="processing-dot h-1.5 w-1.5 rounded-full bg-blue-400"></span>
						<span class="processing-dot h-1.5 w-1.5 rounded-full bg-blue-400"></span>
						<span class="processing-dot h-1.5 w-1.5 rounded-full bg-blue-400"></span>
					</div>
				{/if}
				<span
					class="line-clamp-1 flex-1 font-medium transition-colors duration-200 group-hover:text-gray-700 dark:group-hover:text-gray-200"
				>
					{isOpen ? "Memory Steps" : summary}
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
				class="memory-content border-t border-gray-200 px-3 py-2 dark:border-gray-700"
				transition:slide={{ duration: prefersReducedMotion ? 0 : 250, easing: cubicOut }}
			>
				<ul class="space-y-1">
					{#each steps as step}
						{@const icon = getIcon(step.status)}
						{@const color = getColor(step.status)}
						<li class="flex items-center gap-2 text-sm {color}">
							{#if icon === "spinner"}
								<IconLoading classNames="h-3.5 w-3.5" />
							{:else if icon === "check"}
								<CarbonCheckmark class="h-3.5 w-3.5" />
							{:else if icon === "search"}
								<CarbonSearch class="h-3.5 w-3.5" />
							{:else if icon === "database"}
								<CarbonDataBase class="h-3.5 w-3.5" />
							{:else if icon === "brain"}
								<CarbonMachineLearning class="h-3.5 w-3.5" />
							{/if}
							<span class="opacity-80">{getMessage(step.status, step.count ?? 0, isRTL)}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Block entrance animation */
	.memory-processing-block {
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

	/* Processing dots animation */
	.processing-dot {
		animation: processingPulse 1.4s ease-in-out infinite;
	}

	.processing-dot:nth-child(2) {
		animation-delay: 0.2s;
	}

	.processing-dot:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes processingPulse {
		0%,
		80%,
		100% {
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

	.memory-header:hover .chevron-wrapper {
		transform: translateY(1px);
	}

	.memory-header:active .chevron-wrapper {
		transform: translateY(2px);
	}

	/* Content fade-in within slide */
	.memory-content {
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
		.memory-processing-block,
		.processing-dot,
		.chevron-wrapper,
		.memory-content {
			animation: none !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
