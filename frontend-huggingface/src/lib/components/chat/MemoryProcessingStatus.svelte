<script lang="ts">
	import { fade } from "svelte/transition";
	import IconLoading from "../icons/IconLoading.svelte";
	import CarbonCheckmark from "~icons/carbon/checkmark";
	import CarbonSearch from "~icons/carbon/search";
	import CarbonDataBase from "~icons/carbon/data-base";
	import CarbonMachineLearning from "~icons/carbon/machine-learning";

	export type MemoryProcessingState =
		| "idle"
		| "searching"
		| "found"
		| "storing"
		| "learning"
		| "degraded"
		| "ingesting";

	interface Props {
		status: MemoryProcessingState;
		count?: number;
		isRTL?: boolean;
	}

	let { status = "idle", count = 0, isRTL = false }: Props = $props();

	const statusConfig: Record<
		MemoryProcessingState,
		{ icon: "spinner" | "check" | "search" | "database" | "brain"; color: string }
	> = {
		idle: { icon: "check", color: "text-gray-400" },
		searching: { icon: "spinner", color: "text-blue-400" },
		found: { icon: "check", color: "text-green-400" },
		storing: { icon: "database", color: "text-purple-400" },
		learning: { icon: "brain", color: "text-amber-400" },
		degraded: { icon: "database", color: "text-red-400" },
		ingesting: { icon: "spinner", color: "text-indigo-400" },
	};

	let config = $derived(statusConfig[status]);

	function getMessage(s: MemoryProcessingState, n: number, rtl: boolean): string {
		if (rtl) {
			switch (s) {
				case "searching":
					return "מחפש בזיכרונות...";
				case "found":
					return n === 1 ? "נמצא זיכרון אחד" : `נמצאו ${n} זיכרונות`;
				case "storing":
					return "שומר בזיכרון...";
				case "learning":
					return "לומד מהתשובה...";
				case "degraded":
					return "מערכת הזיכרון במצב ירוד";
				case "ingesting":
					return "מעבד מסמך...";
				default:
					return "";
			}
		}

		switch (s) {
			case "searching":
				return "Searching memories...";
			case "found":
				return n === 1 ? "Found 1 memory" : `Found ${n} memories`;
			case "storing":
				return "Storing to memory...";
			case "learning":
				return "Learning from response...";
			case "degraded":
				return "Memory system degraded";
			case "ingesting":
				return "Processing document...";
			default:
				return "";
		}
	}

	let message = $derived(getMessage(status, count, isRTL));
</script>

{#if status !== "idle" && message}
	<div
		class="memory-processing-status flex items-center gap-2 text-sm {config.color}"
		dir={isRTL ? "rtl" : "ltr"}
		transition:fade={{ duration: 150 }}
	>
		{#if config.icon === "spinner"}
			<IconLoading classNames="h-4 w-4" />
		{:else if config.icon === "check"}
			<CarbonCheckmark class="h-4 w-4" />
		{:else if config.icon === "search"}
			<CarbonSearch class="h-4 w-4" />
		{:else if config.icon === "database"}
			<CarbonDataBase class="h-4 w-4" />
		{:else if config.icon === "brain"}
			<CarbonMachineLearning class="h-4 w-4" />
		{/if}
		<span class="opacity-80">{message}</span>
	</div>
{/if}

<style>
	.memory-processing-status {
		animation: fadeSlideIn 0.2s ease-out;
	}

	@keyframes fadeSlideIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
