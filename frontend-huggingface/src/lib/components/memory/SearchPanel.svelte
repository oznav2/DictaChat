<script lang="ts">
	import { onMount } from "svelte";
	import { base } from "$app/paths";
	import type { MemoryTier, SortBy } from "$lib/types/MemoryMeta";

	interface SearchResult {
		memory_id: string;
		content: string;
		tier: MemoryTier;
		score: number;
		created_at: string;
		tags?: string[];
		wilson_score?: number;
	}

	let searchQuery = $state("");
	let selectedTier = $state<MemoryTier | "all">("all");
	let sortBy = $state<SortBy>("relevance");
	let results = $state<SearchResult[]>([]);
	let isLoading = $state(false);
	let expandedId = $state<string | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	const tiers: Array<{ value: MemoryTier | "all"; label: string }> = [
		{ value: "all", label: "הכל" },
		{ value: "working", label: "עבודה" },
		{ value: "history", label: "היסטוריה" },
		{ value: "patterns", label: "דפוסים" },
		{ value: "documents", label: "מסמכים" },
		{ value: "memory_bank", label: "בנק זיכרון" },
		{ value: "datagov_schema", label: "DataGov סכמות" },
		{ value: "datagov_expansion", label: "DataGov הרחבות" },
	];

	const sortOptions: Array<{ value: SortBy; label: string }> = [
		{ value: "relevance", label: "רלוונטיות" },
		{ value: "recency", label: "עדכניות" },
		{ value: "score", label: "ציון" },
	];

	function getTierColor(tier: MemoryTier): string {
		const colors: Record<MemoryTier, string> = {
			working: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
			history: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
			patterns: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
			documents: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
			memory_bank: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
			datagov_schema: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
			datagov_expansion: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
		};
		return colors[tier] ?? "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
	}

	function getTierLabel(tier: MemoryTier): string {
		const labels: Record<MemoryTier, string> = {
			working: "עבודה",
			history: "היסטוריה",
			patterns: "דפוסים",
			documents: "מסמכים",
			memory_bank: "בנק",
			datagov_schema: "DataGov סכמות",
			datagov_expansion: "DataGov הרחבות",
		};
		return labels[tier] ?? tier;
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffHours = diffMs / (1000 * 60 * 60);

		if (diffHours < 1) {
			return "לפני דקות";
		} else if (diffHours < 24) {
			return `לפני ${Math.floor(diffHours)} שעות`;
		} else if (diffHours < 168) {
			return `לפני ${Math.floor(diffHours / 24)} ימים`;
		}
		return date.toLocaleDateString("he-IL");
	}

	async function performSearch() {
		if (!searchQuery.trim()) {
			results = [];
			return;
		}

		isLoading = true;
		try {
			const response = await fetch(`${base}/api/memory/search`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: searchQuery.trim(),
					tier: selectedTier === "all" ? undefined : selectedTier,
					sort_by: sortBy,
					limit: 50,
				}),
			});
			if (!response.ok) throw new Error(`Search failed: ${response.status}`);
			const data = await response.json();

			results = data.results ?? [];
		} catch (err) {
			console.error("Memory search failed:", err);
			results = [];
		} finally {
			isLoading = false;
		}
	}

	function handleSearchInput() {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}
		debounceTimer = setTimeout(() => {
			performSearch();
		}, 300);
	}

	function toggleExpanded(id: string) {
		expandedId = expandedId === id ? null : id;
	}

	async function pinToMemoryBank(memory: SearchResult) {
		try {
			const response = await fetch(`${base}/api/memory/memory-bank`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					memory_id: memory.memory_id,
					content: memory.content,
					tags: memory.tags ?? [],
				}),
			});
			if (!response.ok) throw new Error(`Pin failed: ${response.status}`);
			// Show success feedback
		} catch (err) {
			console.error("Failed to pin to memory bank:", err);
		}
	}

	onMount(() => {
		return () => {
			if (debounceTimer) {
				clearTimeout(debounceTimer);
			}
		};
	});
</script>

<div class="flex h-full flex-col gap-3 p-3" dir="rtl">
	<!-- Search Input -->
	<div class="flex flex-col gap-2">
		<input
			type="text"
			bind:value={searchQuery}
			oninput={handleSearchInput}
			placeholder="חיפוש בזיכרון..."
			class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
		/>

		<!-- Filters Row -->
		<div class="flex gap-2">
			<select
				bind:value={selectedTier}
				onchange={performSearch}
				class="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
			>
				{#each tiers as tier}
					<option value={tier.value}>{tier.label}</option>
				{/each}
			</select>

			<select
				bind:value={sortBy}
				onchange={performSearch}
				class="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
			>
				{#each sortOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- Results -->
	<div class="flex-1 overflow-y-auto">
		{#if isLoading}
			<div class="flex items-center justify-center py-8">
				<div
					class="size-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"
				></div>
			</div>
		{:else if results.length === 0}
			{#if searchQuery.trim()}
				<div class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">לא נמצאו תוצאות</div>
			{:else}
				<div class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
					הקלד לחיפוש בזיכרון
				</div>
			{/if}
		{:else}
			<div class="flex flex-col gap-2">
				{#each results as result, index}
					<div
						role="button"
						tabindex="0"
						onclick={() => toggleExpanded(result.memory_id)}
						onkeydown={(e) =>
							(e.key === "Enter" || e.key === " ") && toggleExpanded(result.memory_id)}
						class="w-full cursor-pointer rounded-lg border border-gray-200 bg-white p-3 text-right transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
					>
						<!-- Header Row -->
						<div class="mb-2 flex items-center gap-2">
							<span
								class="flex size-5 items-center justify-center rounded bg-gray-100 text-xs font-medium text-gray-600 dark:bg-gray-600 dark:text-gray-300"
							>
								{index + 1}
							</span>
							<span class={["rounded px-1.5 py-0.5 text-xs font-medium", getTierColor(result.tier)]}
								>{getTierLabel(result.tier)}</span
							>
							{#if result.wilson_score !== undefined}
								<span
									class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-600 dark:text-gray-300"
								>
									{(result.wilson_score * 100).toFixed(0)}%
								</span>
							{/if}
							<span class="mr-auto text-xs text-gray-400 dark:text-gray-500">
								{formatDate(result.created_at)}
							</span>
						</div>

						<!-- Content Preview -->
						<p
							class="line-clamp-2 text-sm text-gray-700 dark:text-gray-200"
							class:line-clamp-none={expandedId === result.memory_id}
						>
							{result.content}
						</p>

						<!-- Expanded Actions -->
						{#if expandedId === result.memory_id}
							<div
								class="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-600"
							>
								{#if result.tags && result.tags.length > 0}
									<div class="flex flex-wrap gap-1">
										{#each result.tags as tag}
											<span
												class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-600 dark:text-gray-300"
											>
												{tag}
											</span>
										{/each}
									</div>
								{/if}
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										pinToMemoryBank(result);
									}}
									class="mr-auto rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600"
								>
									הצמד לבנק זיכרון
								</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
