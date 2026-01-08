<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { browser } from "$app/environment";
	import { memoryUi, type RightDockTab } from "$lib/stores/memoryUi";
	import SearchPanel from "./SearchPanel.svelte";
	import MemoryPanel from "./MemoryPanel.svelte";
	import KnowledgeGraphPanel from "./KnowledgeGraphPanel.svelte";
	import MemoryHealthPanel from "./MemoryHealthPanel.svelte";
	import RetrievalLatencyPanel from "./RetrievalLatencyPanel.svelte";

	interface Props {
		isMobile?: boolean;
	}

	let { isMobile = false }: Props = $props();

	let isOpen = $derived($memoryUi.rightDock.isOpen);
	let widthPx = $derived($memoryUi.rightDock.widthPx);
	let activeTab = $derived($memoryUi.rightDock.activeTab);
	let activeConcepts = $derived($memoryUi.data.activeConcepts);

	let isResizing = $state(false);
	let resizeStartX = 0;
	let resizeStartWidth = 0;

	const tabs: Array<{ id: RightDockTab; label: string; icon: string }> = [
		{ id: "search", label: "חיפוש", icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
		{
			id: "memory",
			label: "זיכרון",
			icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
		},
		{
			id: "knowledge",
			label: "ידע",
			icon: "M13 10V3L4 14h7v7l9-11h-7z",
		},
		{
			id: "health",
			label: "בריאות",
			icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
		},
		{
			id: "latency",
			label: "ביצועים",
			icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
		},
	];

	function handleTabClick(tabId: RightDockTab) {
		memoryUi.setActiveDockTab(tabId);
	}

	function handleClose() {
		memoryUi.closeRightDock();
	}

	function handleResizeStart(event: PointerEvent) {
		if (!browser || isMobile) return;

		event.preventDefault();
		isResizing = true;
		resizeStartX = event.clientX;
		resizeStartWidth = widthPx;

		window.addEventListener("pointermove", handleResizeMove);
		window.addEventListener("pointerup", handleResizeEnd);
	}

	function handleResizeMove(event: PointerEvent) {
		if (!isResizing) return;

		// Resize from left edge, so delta is inverted
		const deltaX = resizeStartX - event.clientX;
		const nextWidth = resizeStartWidth + deltaX;
		memoryUi.setRightDockWidth(nextWidth);
	}

	function handleResizeEnd() {
		isResizing = false;
		if (!browser) return;

		window.removeEventListener("pointermove", handleResizeMove);
		window.removeEventListener("pointerup", handleResizeEnd);
	}

	function handleResizeKeydown(event: KeyboardEvent) {
		const step = 16;
		let handled = true;

		if (event.key === "ArrowLeft") {
			memoryUi.setRightDockWidth(widthPx + step);
		} else if (event.key === "ArrowRight") {
			memoryUi.setRightDockWidth(widthPx - step);
		} else if (event.key === "Home") {
			memoryUi.setRightDockWidth(520);
		} else if (event.key === "End") {
			memoryUi.setRightDockWidth(240);
		} else {
			handled = false;
		}

		if (handled) {
			event.preventDefault();
		}
	}

	// Install global event listeners for keyboard shortcuts
	function handleGlobalKeydown(event: KeyboardEvent) {
		// Ctrl/Cmd + Shift + M to toggle dock
		if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "M") {
			event.preventDefault();
			memoryUi.toggleRightDock();
		}
	}

	onMount(() => {
		if (browser) {
			window.addEventListener("keydown", handleGlobalKeydown);
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener("keydown", handleGlobalKeydown);
			window.removeEventListener("pointermove", handleResizeMove);
			window.removeEventListener("pointerup", handleResizeEnd);
		}
	});
</script>

{#if isMobile}
	<!-- Mobile: Modal-like drawer -->
	{#if isOpen}
		<div class="fixed inset-0 z-50 flex justify-end">
			<!-- Backdrop -->
			<button
				type="button"
				class="absolute inset-0 bg-black/50"
				onclick={handleClose}
				aria-label="Close memory dock"
			></button>

			<!-- Drawer -->
			<div
				class="relative flex h-full w-[85vw] max-w-md flex-col bg-white shadow-xl dark:bg-gray-800"
				dir="rtl"
			>
				<!-- Header -->
				<div class="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
					<h2 class="text-sm font-medium text-gray-800 dark:text-gray-100">זיכרון ומידע</h2>
					<button
						type="button"
						onclick={handleClose}
						class="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
						aria-label="סגור"
					>
						<svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<!-- Tabs -->
				<div class="flex border-b border-gray-200 dark:border-gray-700">
					{#each tabs as tab}
						<button
							type="button"
							onclick={() => handleTabClick(tab.id)}
							class={[
								"flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs transition-colors",
								activeTab === tab.id
									? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
									: "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
							]}
						>
							<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={tab.icon} />
							</svg>
							{tab.label}
						</button>
					{/each}
				</div>

				<!-- Content -->
				<div class="min-h-0 flex-1 overflow-hidden">
					{#if activeTab === "search"}
						<SearchPanel />
					{:else if activeTab === "memory"}
						<MemoryPanel />
					{:else if activeTab === "knowledge"}
						<KnowledgeGraphPanel />
					{:else if activeTab === "health"}
						<MemoryHealthPanel />
					{:else if activeTab === "latency"}
						<RetrievalLatencyPanel />
					{/if}
				</div>
			</div>
		</div>
	{/if}
{:else}
	<!-- Desktop: Third column -->
	{#if isOpen}
		<aside
			class="relative flex h-full flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
			style="width: {widthPx}px"
			dir="rtl"
		>
			<!-- Resize Handle -->
			<button
				type="button"
				class="group absolute inset-y-0 left-0 w-[6px] cursor-col-resize bg-transparent p-0"
				onpointerdown={handleResizeStart}
				onkeydown={handleResizeKeydown}
				aria-label="Resize memory dock"
			>
				<span
					class={[
						"pointer-events-none mx-auto block h-full w-px transition-colors duration-150",
						isResizing
							? "bg-blue-500"
							: "bg-gray-200 opacity-0 group-hover:bg-gray-400 group-hover:opacity-100 dark:bg-gray-700 dark:group-hover:bg-gray-500",
					]}
				></span>
			</button>

			<!-- Header with Active Concepts -->
			<div class="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
				<h2 class="text-sm font-medium text-gray-800 dark:text-gray-100">זיכרון ומידע</h2>
				<button
					type="button"
					onclick={handleClose}
					class="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
					title="סגור (Ctrl+Shift+M)"
					aria-label="סגור"
				>
					<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Active Concepts Strip (compact) -->
			{#if activeConcepts.length > 0}
				<div class="flex flex-wrap gap-1 border-b border-gray-100 px-3 py-1.5 dark:border-gray-700">
					{#each activeConcepts.slice(0, 5) as concept}
						<span
							class="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
						>
							{concept}
						</span>
					{/each}
					{#if activeConcepts.length > 5}
						<span class="text-[10px] text-gray-400">+{activeConcepts.length - 5}</span>
					{/if}
				</div>
			{/if}

			<!-- Tabs -->
			<div class="flex border-b border-gray-200 dark:border-gray-700">
				{#each tabs as tab}
					<button
						type="button"
						onclick={() => handleTabClick(tab.id)}
						class={[
							"flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs transition-colors",
							activeTab === tab.id
								? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
								: "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
						]}
					>
						<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={tab.icon} />
						</svg>
						{tab.label}
					</button>
				{/each}
			</div>

			<!-- Tab Content (never unmount, use visibility) -->
			<div class="min-h-0 flex-1 overflow-hidden">
				<div class={activeTab === "search" ? "h-full" : "hidden"}>
					<SearchPanel />
				</div>
				<div class={activeTab === "memory" ? "h-full" : "hidden"}>
					<MemoryPanel />
				</div>
				<div class={activeTab === "knowledge" ? "h-full" : "hidden"}>
					<KnowledgeGraphPanel />
				</div>
				<div class={activeTab === "health" ? "h-full" : "hidden"}>
					<MemoryHealthPanel />
				</div>
				<div class={activeTab === "latency" ? "h-full" : "hidden"}>
					<RetrievalLatencyPanel />
				</div>
			</div>
		</aside>
	{/if}
{/if}
