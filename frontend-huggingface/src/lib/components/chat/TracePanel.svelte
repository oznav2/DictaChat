<script lang="ts">
  import { fade, slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { onMount } from "svelte";
  import type { TraceStep, StepStatus } from "$lib/types/Trace";
  import {
    runs,
    getRunStore,
    getRunSummary,
    getLocalizedLabel
  } from "$lib/stores/traceStore";
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
  $: summaryStore = getRunSummary(runId);

  // Reactive state
  $: run = $runStore;
  $: summary = $summaryStore;

  // Track which steps have been collapsed (after fade delay)
  let collapsedSteps: Set<string> = new Set();

  // Root steps (no parent)
  $: rootSteps = run
    ? (run.childrenByParent.get("__root__") || [])
        .map((id) => run.steps.get(id))
        .filter((s): s is TraceStep => s !== undefined)
    : [];

  // Find the currently active (running) step
  $: activeStepIndex = rootSteps.findIndex((s) => s.status === "running");
  $: hasActiveStep = activeStepIndex >= 0;

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
  $: heading = language === "he"
    ? "מעבד את המסמך המצורף"
    : "Processing the attached document";

  $: successMessage = language === "he"
    ? "המסמך עובד בהצלחה"
    : "Document processed successfully";

  // Check if step should be visible
  function isStepVisible(step: TraceStep, index: number): boolean {
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
    class="trace-panel"
    class:rtl={language === "he"}
    class:completed={run.completed}
    class:collapsed-mode={run.completed}
    transition:slide={{ duration: 300, easing: cubicOut }}
  >
    <!-- Header with document icon - hidden when completed -->
    {#if !run.completed}
      <div class="trace-header" transition:slide={{ duration: 300, easing: cubicOut }}>
        <div class="header-icon">
          <CarbonDocument class="h-4 w-4" />
        </div>
        <span class="header-text">
          {heading}
        </span>
      </div>
    {/if}

    <!-- Steps container -->
    <div class="trace-steps" class:minimal={run.completed}>
      {#each rootSteps as step, index (step.id)}
        {@const isActive = step.status === "running"}
        {@const isDone = step.status === "done"}
        {@const isError = step.status === "error"}
        {@const isCollapsing = isDone && !collapsedSteps.has(step.id)}
        {@const shouldShow = isStepVisible(step, index)}

        {#if shouldShow}
          <div
            class="trace-step"
            class:active={isActive}
            class:done={isDone}
            class:error={isError}
            class:fading={isCollapsing}
            transition:slide={{ duration: 400, easing: cubicOut }}
          >
            <!-- Status Icon -->
            <div class="step-icon" data-status={step.status}>
              {#if isActive}
                <IconLoading classNames="h-3.5 w-3.5" />
              {:else if isDone}
                <CarbonCheckmark class="h-3.5 w-3.5" />
              {:else if isError}
                <CarbonClose class="h-3.5 w-3.5" />
              {/if}
            </div>

            <!-- Step Content -->
            <div class="step-content">
              <span class="step-label">{getLabel(step)}</span>
              {#if step.detail}
                <span class="step-detail" transition:fade={{ duration: 150 }}>
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
          class="trace-step success-step minimal-success"
          in:fade={{ duration: 400, easing: cubicOut }}
        >
          <div class="step-icon success">
            <CarbonCheckmarkFilled class="h-3.5 w-3.5" />
          </div>
          <div class="step-content">
            <span class="step-label success">{successMessage}</span>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Base panel styling - matches chat UI theme */
  .trace-panel {
    @apply mb-3 overflow-hidden rounded-xl border transition-all duration-500;
    @apply border-gray-200/80 bg-gradient-to-br from-gray-50/90 to-white/50;
    @apply dark:border-gray-700/60 dark:from-gray-800/60 dark:to-gray-900/30;
  }

  .trace-panel.rtl {
    direction: rtl;
  }

  /* Collapsed mode - minimal appearance when completed */
  .trace-panel.collapsed-mode {
    @apply border-transparent bg-transparent rounded-lg;
    @apply dark:border-transparent dark:bg-transparent;
  }

  /* Header */
  .trace-header {
    @apply flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium;
    @apply text-gray-700 dark:text-gray-300;
  }

  .header-icon {
    @apply flex h-6 w-6 items-center justify-center rounded-lg;
    @apply bg-gray-100 text-gray-600;
    @apply dark:bg-gray-700/70 dark:text-gray-400;
  }

  .header-text {
    @apply flex-grow;
  }

  .rtl .header-text {
    @apply text-right;
  }

  /* Step list container */
  .trace-steps {
    @apply space-y-0.5 px-3 pb-3;
  }

  .trace-steps.minimal {
    @apply px-0 pb-0;
  }

  /* Individual step */
  .trace-step {
    @apply flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-all duration-500;
  }

  .trace-step.active {
    @apply bg-gray-100/70 dark:bg-gray-700/40;
  }

  .trace-step.done {
    @apply opacity-70;
  }

  /* Fading state - slow fade before collapse */
  .trace-step.fading {
    @apply opacity-40;
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

  .trace-step.error {
    @apply bg-red-100/50 dark:bg-red-900/30;
  }

  .trace-step.success-step {
    @apply bg-green-100/50 dark:bg-green-900/30;
  }

  /* Minimal success step - no background when completed */
  .trace-step.minimal-success {
    @apply bg-transparent px-0 py-1;
    @apply dark:bg-transparent;
  }

  /* Step status icon container */
  .step-icon {
    @apply flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-all duration-200;
  }

  .step-icon[data-status="done"] {
    @apply text-green-500 dark:text-green-400;
  }

  .step-icon[data-status="error"] {
    @apply text-red-500 dark:text-red-400;
  }

  .step-icon[data-status="running"] {
    @apply text-gray-500 dark:text-gray-400;
  }

  .step-icon.success {
    @apply text-green-500 dark:text-green-400;
  }

  /* Step content (label + detail) */
  .step-content {
    @apply flex min-w-0 flex-grow flex-col;
  }

  .step-label {
    @apply text-sm leading-tight text-gray-700 dark:text-gray-300;
  }

  .step-label.success {
    @apply font-medium text-green-700 dark:text-green-300;
  }

  .step-detail {
    @apply text-xs leading-tight text-gray-500 dark:text-gray-400;
  }

  /* RTL adjustments */
  .rtl .trace-step {
    @apply flex-row-reverse;
  }
</style>
