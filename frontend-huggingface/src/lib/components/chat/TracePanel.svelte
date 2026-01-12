<script lang="ts">
	import { fade, slide } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import type { TraceStep } from "$lib/types/Trace";
	import { getRunStore, getLocalizedLabel } from "$lib/stores/traceStore";
	import IconLoading from "../icons/IconLoading.svelte";
	import CarbonCheckmark from "~icons/carbon/checkmark";
	import CarbonClose from "~icons/carbon/close";
	import CarbonDocument from "~icons/carbon/document";
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
		}
	}

	// Get display label based on language
	function getLabel(step: TraceStep): string {
		return getLocalizedLabel(step, language);
	}

	// Localized strings
	$: heading = language === "he" ? "מעבד את המסמך המצורף" : "Processing the attached document";

	$: successMessage = language === "he" ? "המסמך עובד בהצלחה" : "Document processed successfully";

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
</script>

{#if run && rootSteps.length > 0}
	<div
		class={run.completed
			? "mb-3 overflow-hidden rounded-lg border border-transparent bg-transparent transition-all duration-500 dark:border-transparent dark:bg-transparent"
			: "mb-3 overflow-hidden rounded-xl border border-gray-200/80 bg-gradient-to-br from-gray-50/90 to-white/50 transition-all duration-500 dark:border-gray-700/60 dark:from-gray-800/60 dark:to-gray-900/30"}
		dir={language === "he" ? "rtl" : "ltr"}
		transition:slide={{ duration: 300, easing: cubicOut }}
	>
		<!-- Header with document icon - hidden when completed -->
		{#if !run.completed}
			<div
				class="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300"
				transition:slide={{ duration: 300, easing: cubicOut }}
			>
				<div
					class="flex h-6 w-6 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-700/70 dark:text-gray-400"
				>
					<CarbonDocument class="h-4 w-4" />
				</div>
				<span class="flex-grow {language === 'he' ? 'text-right' : ''}">
					{heading}
				</span>
			</div>
		{/if}

		<!-- Steps container -->
		<div class={run.completed ? "px-0 pb-0" : "space-y-0.5 px-3 pb-3"}>
			{#each rootSteps as step, index (step.id)}
				{@const isActive = step.status === "running"}
				{@const isDone = step.status === "done"}
				{@const isError = step.status === "error"}
				{@const isCollapsing = isDone && !collapsedSteps.has(step.id)}
				{@const shouldShow = isStepVisible(step, index)}
				{@const stepClass = `flex items-center gap-2.5 rounded-lg transition-all duration-500 ${
					run.completed ? "px-0 py-1" : "px-2 py-1.5"
				} ${language === "he" ? "flex-row-reverse" : ""} ${
					isActive ? "bg-gray-100/70 dark:bg-gray-700/40" : ""
				} ${isDone ? "opacity-70" : ""} ${isError ? "bg-red-100/50 dark:bg-red-900/30" : ""} ${
					isCollapsing ? "opacity-40 fade-out-step" : ""
				}`.trim()}

				{#if shouldShow}
					<div class={stepClass} transition:slide={{ duration: 400, easing: cubicOut }}>
						<!-- Status Icon -->
						<div
							class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-all duration-200 {isDone
								? 'text-green-500 dark:text-green-400'
								: isError
									? 'text-red-500 dark:text-red-400'
									: 'text-gray-500 dark:text-gray-400'}"
						>
							{#if isActive}
								<IconLoading classNames="h-3.5 w-3.5" />
							{:else if isDone}
								<CarbonCheckmark class="h-3.5 w-3.5" />
							{:else if isError}
								<CarbonClose class="h-3.5 w-3.5" />
							{/if}
						</div>

						<!-- Step Content -->
						<div class="flex min-w-0 flex-grow flex-col">
							<span class="text-sm leading-tight text-gray-700 dark:text-gray-300"
								>{getLabel(step)}</span
							>
							{#if step.detail}
								<span
									class="text-xs leading-tight text-gray-500 dark:text-gray-400"
									transition:fade={{ duration: 150 }}
								>
									{step.detail}
								</span>
							{/if}
						</div>
					</div>
				{/if}
			{/each}

			<!-- Final success message - only shown when completed -->
			{#if run.completed}
				<div
					class="flex items-center gap-2.5 rounded-lg bg-green-100/50 px-0 py-1 transition-all duration-500 dark:bg-green-900/30 {language ===
					'he'
						? 'flex-row-reverse'
						: ''}"
					in:fade={{ duration: 400, easing: cubicOut }}
				>
					<div
						class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-green-500 transition-all duration-200 dark:text-green-400"
					>
						<CarbonCheckmarkFilled class="h-3.5 w-3.5" />
					</div>
					<div class="flex min-w-0 flex-grow flex-col">
						<span class="text-sm font-medium leading-tight text-green-700 dark:text-green-300"
							>{successMessage}</span
						>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.fade-out-step {
		animation: fadeOutStep 600ms ease-out forwards;
	}

	@keyframes fadeOutStep {
		0% {
			opacity: 0.7;
		}
		100% {
			opacity: 0.2;
		}
	}
</style>
