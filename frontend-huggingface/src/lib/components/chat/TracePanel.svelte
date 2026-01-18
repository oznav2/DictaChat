<script lang="ts">
	import { fade, slide, scale } from "svelte/transition";
	import { cubicOut, elasticOut, backOut } from "svelte/easing";
	import type { TraceStep } from "$lib/types/Trace";
	import { getRunStore, getLocalizedLabel } from "$lib/stores/traceStore";
	import IconLoading from "../icons/IconLoading.svelte";
	import CarbonCheckmark from "~icons/carbon/checkmark";
	import CarbonClose from "~icons/carbon/close";
	import CarbonDocument from "~icons/carbon/document";
	import CarbonDataBase from "~icons/carbon/data-base";
	import CarbonCheckmarkFilled from "~icons/carbon/checkmark-filled";

	// Props
	export let runId: string;
	export let language: "he" | "en" = "en";

	// Reactive stores for this run
	$: runStore = getRunStore(runId);

	// Reactive state
	$: run = $runStore;

	// Track which steps have been collapsed (after fade delay)
	let collapsedSteps: Set<string> = new Set();

	// Track animated steps to stagger animations
	let animatedSteps: Set<string> = new Set();

	// Root steps (no parent)
	$: rootSteps = run
		? (run.childrenByParent.get("__root__") || [])
				.map((id) => run.steps.get(id))
				.filter((s): s is TraceStep => s !== undefined)
		: [];

	// Auto-collapse completed steps after a delay
	// User specified: spinner while running → green check when done → wait 2 sec → collapse/fade
	$: {
		for (const step of rootSteps) {
			if (step.status === "done" && !collapsedSteps.has(step.id)) {
				// Schedule collapse after 2000ms (2 seconds) as requested
				setTimeout(() => {
					collapsedSteps = new Set([...collapsedSteps, step.id]);
				}, 2000);
			}
			// Track new steps for staggered animation
			if (!animatedSteps.has(step.id)) {
				animatedSteps = new Set([...animatedSteps, step.id]);
			}
		}
	}

	// Get display label based on language
	function getLabel(step: TraceStep): string {
		return getLocalizedLabel(step, language);
	}

	// Localized strings based on run type
	// CRITICAL FIX: TracePanel must display appropriate messages based on runType
	// - memory_prefetch: Memory search messages
	// - document_rag: Document processing messages
	$: isMemoryRun = run?.runType === "memory_prefetch";

	$: heading = isMemoryRun
		? language === "he"
			? "מחפש בזיכרון..."
			: "Searching memory..."
		: language === "he"
			? "מעבד את המסמך המצורף"
			: "Processing the attached document";

	$: successMessage = isMemoryRun
		? language === "he"
			? "חיפוש זיכרון הושלם"
			: "Memory search complete"
		: language === "he"
			? "המסמך עובד בהצלחה"
			: "Document processed successfully";

	// Check if step should be visible
	function isStepVisible(step: TraceStep, _index: number): boolean {
		// Always show running steps
		if (step.status === "running") return true;

		// Always show error steps
		if (step.status === "error") return true;

		// For completed runs, don't show individual steps (only success message)
		if (run?.completed) return false;

		// For done steps, show until they're collapsed
		if (step.status === "done") {
			return !collapsedSteps.has(step.id);
		}

		return false;
	}

	// Get animation delay for staggered effect
	function getStaggerDelay(index: number): number {
		return Math.min(index * 50, 300);
	}
</script>

{#if run && rootSteps.length > 0}
	<div
		class={run.completed
			? "trace-panel-complete mb-3 overflow-hidden rounded-lg border border-transparent bg-transparent transition-all duration-500 dark:border-transparent dark:bg-transparent"
			: "trace-panel mb-3 overflow-hidden rounded-xl border border-gray-200/80 bg-gradient-to-br from-gray-50/90 to-white/50 shadow-sm transition-all duration-500 dark:border-gray-700/60 dark:from-gray-800/60 dark:to-gray-900/30 dark:shadow-none"}
		dir={language === "he" ? "rtl" : "ltr"}
		in:slide={{ duration: 350, easing: cubicOut }}
		out:fade={{ duration: 200 }}
	>
		<!-- Header with document icon - hidden when completed -->
		{#if !run.completed}
			<div
				class="trace-header flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300"
				in:slide={{ duration: 300, easing: cubicOut, delay: 50 }}
				out:slide={{ duration: 200, easing: cubicOut }}
			>
				<div
					class="trace-icon flex h-6 w-6 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-all duration-300 dark:bg-gray-700/70 dark:text-gray-400"
				>
					{#if isMemoryRun}
						<CarbonDataBase class="h-4 w-4 transition-transform duration-200" />
					{:else}
						<CarbonDocument class="h-4 w-4 transition-transform duration-200" />
					{/if}
				</div>
				<span class="flex-grow {language === 'he' ? 'text-right' : ''}">
					{heading}
				</span>
				<!-- Subtle processing indicator -->
				<div class="typing-indicator opacity-60">
					<span class="bg-gray-400 dark:bg-gray-500"></span>
					<span class="bg-gray-400 dark:bg-gray-500"></span>
					<span class="bg-gray-400 dark:bg-gray-500"></span>
				</div>
			</div>
		{/if}

		<!-- Steps container -->
		<div class={run.completed ? "px-0 pb-0" : "space-y-1 px-3 pb-3"}>
			{#each rootSteps as step, index (step.id)}
				{@const isActive = step.status === "running"}
				{@const isDone = step.status === "done"}
				{@const isError = step.status === "error"}
				{@const isCollapsing = isDone && !collapsedSteps.has(step.id)}
				{@const shouldShow = isStepVisible(step, index)}
				{@const stepClass =
					`trace-step flex items-center gap-2.5 rounded-lg transition-all duration-300 ${
						run.completed ? "px-0 py-1" : "px-2.5 py-2"
					} ${language === "he" ? "flex-row-reverse" : ""} ${
						isActive ? "bg-blue-50/80 dark:bg-blue-900/20 shadow-sm" : ""
					} ${isDone ? "opacity-80" : ""} ${isError ? "bg-red-50/80 dark:bg-red-900/20 shadow-sm" : ""} ${
						isCollapsing ? "trace-step-completing" : ""
					}`.trim()}

				{#if shouldShow}
					<div
						class={stepClass}
						in:slide={{ duration: 300, easing: backOut, delay: getStaggerDelay(index) }}
						out:slide={{ duration: 250, easing: cubicOut }}
					>
						<!-- Status Icon with animation -->
						<div
							class="trace-step-icon flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-all duration-300 {isDone
								? 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400'
								: isError
									? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
									: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'}"
						>
							{#if isActive}
								<div class="animate-spin">
									<IconLoading classNames="h-3.5 w-3.5" />
								</div>
							{:else if isDone}
								<div in:scale={{ duration: 300, easing: backOut }}>
									<CarbonCheckmark class="h-3.5 w-3.5" />
								</div>
							{:else if isError}
								<div in:scale={{ duration: 300, easing: backOut }} class="animate-shake">
									<CarbonClose class="h-3.5 w-3.5" />
								</div>
							{/if}
						</div>

						<!-- Step Content -->
						<div class="flex min-w-0 flex-grow flex-col gap-0.5">
							<span class="text-sm font-medium leading-tight text-gray-700 dark:text-gray-200"
								>{getLabel(step)}</span
							>
							{#if step.detail}
								<span
									class="text-xs leading-tight text-gray-500 dark:text-gray-400"
									in:fade={{ duration: 200, delay: 100 }}
									out:fade={{ duration: 100 }}
								>
									{step.detail}
								</span>
							{/if}
						</div>

						<!-- Progress indicator for active steps -->
						{#if isActive}
							<div
								class="trace-progress h-1 w-12 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600"
							>
								<div
									class="trace-progress-bar h-full w-full rounded-full bg-blue-500 dark:bg-blue-400"
								></div>
							</div>
						{/if}
					</div>
				{/if}
			{/each}

			<!-- Final success message - only shown when completed -->
			{#if run.completed}
				<div
					class="trace-success flex items-center gap-2.5 rounded-xl bg-green-50 px-3 py-2.5 shadow-sm transition-all duration-500 dark:bg-green-900/30 dark:shadow-none {language ===
					'he'
						? 'flex-row-reverse'
						: ''}"
					in:scale={{ duration: 400, easing: backOut, start: 0.9 }}
				>
					<div
						class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 transition-all duration-300 dark:bg-green-800/50 dark:text-green-400"
					>
						<div in:scale={{ duration: 350, easing: elasticOut, delay: 150 }}>
							<CarbonCheckmarkFilled class="h-4 w-4" />
						</div>
					</div>
					<div class="flex min-w-0 flex-grow flex-col">
						<span class="text-sm font-semibold leading-tight text-green-700 dark:text-green-300"
							>{successMessage}</span
						>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Panel entrance animation */
	.trace-panel {
		animation: tracePanelEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes tracePanelEnter {
		from {
			opacity: 0;
			transform: translateY(-8px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	/* Header icon subtle pulse while processing */
	.trace-icon {
		animation: iconPulse 2s ease-in-out infinite;
	}

	@keyframes iconPulse {
		0%,
		100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.05);
			opacity: 0.8;
		}
	}

	/* Step completing animation */
	.trace-step-completing {
		animation: stepComplete 0.6s ease-out forwards;
	}

	@keyframes stepComplete {
		0% {
			opacity: 0.8;
			transform: translateX(0);
		}
		50% {
			opacity: 0.4;
		}
		100% {
			opacity: 0.2;
			transform: translateX(0);
		}
	}

	/* RTL-aware step completion */
	[dir="rtl"] .trace-step-completing {
		animation-name: stepCompleteRTL;
	}

	@keyframes stepCompleteRTL {
		0% {
			opacity: 0.8;
			transform: translateX(0);
		}
		50% {
			opacity: 0.4;
		}
		100% {
			opacity: 0.2;
			transform: translateX(0);
		}
	}

	/* Progress bar animation */
	.trace-progress-bar {
		animation: progressIndeterminate 1.5s ease-in-out infinite;
		transform-origin: left;
	}

	[dir="rtl"] .trace-progress-bar {
		transform-origin: right;
		animation-name: progressIndeterminateRTL;
	}

	@keyframes progressIndeterminate {
		0% {
			transform: translateX(-100%) scaleX(0.3);
		}
		50% {
			transform: translateX(0%) scaleX(0.5);
		}
		100% {
			transform: translateX(100%) scaleX(0.3);
		}
	}

	@keyframes progressIndeterminateRTL {
		0% {
			transform: translateX(100%) scaleX(0.3);
		}
		50% {
			transform: translateX(0%) scaleX(0.5);
		}
		100% {
			transform: translateX(-100%) scaleX(0.3);
		}
	}

	/* Success message pop animation */
	.trace-success {
		animation: successPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes successPop {
		0% {
			opacity: 0;
			transform: scale(0.8);
		}
		60% {
			transform: scale(1.02);
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* Step icon animations */
	.trace-step-icon {
		transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
	}

	/* Hover effect for steps */
	.trace-step:hover .trace-step-icon {
		transform: scale(1.1);
	}

	/* Mobile-friendly touch feedback */
	@media (hover: none) {
		.trace-step:active {
			transform: scale(0.98);
			transition: transform 0.1s ease;
		}
	}

	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		.trace-panel,
		.trace-icon,
		.trace-step-completing,
		.trace-progress-bar,
		.trace-success,
		.trace-step-icon {
			animation: none !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
