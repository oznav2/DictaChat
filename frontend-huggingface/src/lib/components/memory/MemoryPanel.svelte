<script lang="ts">
	import { onMount } from "svelte";
	import { browser } from "$app/environment";
	import { base } from "$app/paths";
	import { memoryUi } from "$lib/stores/memoryUi";
	import type { MemoryTier } from "$lib/types/MemoryMeta";
	import MemoryDetailModal from "./MemoryDetailModal.svelte";
	import VirtualList from "$lib/components/common/VirtualList.svelte";
	import { scoreToBgColor } from "$lib/utils/memoryScore";

	interface StatsSnapshot {
		user_id: string;
		as_of: string;
		tiers: Record<
			MemoryTier,
			{
				active_count: number;
				archived_count: number;
				deleted_count: number;
				uses_total: number;
				success_rate: number;
			}
		>;
	}

	interface MemoryItem {
		memory_id: string;
		content: string;
		tier: MemoryTier;
		wilson_score: number;
		created_at: string;
		tags?: string[];
		outcomes?: { worked: number; failed: number; partial: number };
		last_used?: string;
	}

	let selectedTier = $state<MemoryTier | "all">("all");
	let selectedMemory = $state<MemoryItem | null>(null);
	let sortBy = $state<"recent" | "score">("recent");
	let stats = $state<StatsSnapshot | null>(null);
	let memories = $state<MemoryItem[]>([]);
	let isLoading = $state(false);
	let showHelp = $state(false);

	// Virtual list settings
	const MEMORY_ITEM_HEIGHT = 90; // Approximate height of each memory item
	let listContainerHeight = $state(300);

	const tierDescriptions: Record<MemoryTier, { name: string; desc: string }> = {
		working: {
			name: "זיכרון עבודה",
			desc: "מידע מהשיחה הנוכחית, נשמר לטווח קצר",
		},
		history: {
			name: "היסטוריה",
			desc: "שיחות קודמות ואינטראקציות עבר",
		},
		patterns: {
			name: "דפוסים",
			desc: "תבניות שלמדתי מהשימוש שלך",
		},
		books: {
			name: "ספרים",
			desc: "מסמכים וקבצים שהעלית",
		},
		memory_bank: {
			name: "בנק זיכרון",
			desc: "מידע שהצמדת באופן ידני",
		},
	};

	function getTierColor(tier: MemoryTier): string {
		const colors: Record<MemoryTier, string> = {
			working: "bg-blue-500",
			history: "bg-purple-500",
			patterns: "bg-green-500",
			books: "bg-amber-500",
			memory_bank: "bg-pink-500",
		};
		return colors[tier] ?? "bg-gray-500";
	}

	function getTotalActiveCount(snapshot: StatsSnapshot | null): number {
		if (!snapshot?.tiers) return 0;
		return Object.values(snapshot.tiers).reduce((sum, t) => sum + t.active_count, 0);
	}

	function formatTimestamp(timestamp: string | null | undefined): string {
		if (!timestamp) return "לא ידוע";
		const date = new Date(timestamp);
		return date.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
	}

	async function loadStats() {
		try {
			const response = await fetch(`${base}/api/memory/stats`);
			if (!response.ok) throw new Error(`Failed to fetch stats: ${response.status}`);
			const data = await response.json();
			stats = data?.stats ?? null;
		} catch (err) {
			console.error("Failed to load memory stats:", err);
		}
	}

	async function loadMemories() {
		isLoading = true;
		try {
			const params = new URLSearchParams();
			if (selectedTier !== "all") params.set("tier", selectedTier);
			params.set("sort_by", sortBy);
			params.set("limit", "100");

			const response = await fetch(`${base}/api/memory/search?${params}`);
			if (!response.ok) throw new Error(`Failed to fetch memories: ${response.status}`);
			const data = await response.json();

			memories = data.memories ?? [];
		} catch (err) {
			console.error("Failed to load memories:", err);
			memories = [];
		} finally {
			isLoading = false;
		}
	}

	async function refresh() {
		await Promise.all([loadStats(), loadMemories()]);
	}

	function openMemoryBank() {
		memoryUi.openMemoryBank();
	}

	function openMemoryEducation() {
		memoryUi.openMemoryEducation();
	}

	function openMemoryDetail(memory: MemoryItem) {
		selectedMemory = memory;
	}

	function closeMemoryDetail() {
		selectedMemory = null;
	}

	function handleMemoryArchived(id: string) {
		memories = memories.filter((m) => m.memory_id !== id);
		loadStats();
	}

	function handleMemoryGhosted(id: string) {
		memories = memories.filter((m) => m.memory_id !== id);
		loadStats();
	}

	/**
	 * Phase 5: Trigger reindex when user clicks button in 0-results state
	 */
	async function triggerReindex() {
		try {
			isLoading = true;
			const response = await fetch(`${base}/api/memory/ops/reindex/deferred`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});
			
			if (!response.ok) {
				console.error("Reindex trigger failed:", response.status);
				return;
			}
			
			const result = await response.json();
			console.log("Reindex triggered:", result);
			
			// Wait a moment then refresh
			await new Promise((resolve) => setTimeout(resolve, 2000));
			await refresh();
		} catch (err) {
			console.error("Failed to trigger reindex:", err);
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		refresh();
		memoryUi.openMemoryEducationIfNeeded();

		if (!browser) return;
		const handler = () => {
			refresh();
		};
		window.addEventListener("memoryUpdated", handler);
		return () => window.removeEventListener("memoryUpdated", handler);
	});

	$effect(() => {
		// Re-fetch when tier or sort changes
		if (selectedTier || sortBy) {
			loadMemories();
		}
	});
</script>

<div class="flex h-full flex-col gap-3 p-3" dir="rtl">
	<!-- Stats Overview -->
	{#if stats}
		<div
			class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700/50"
		>
			<div class="mb-2 flex items-center justify-between">
				<h3 class="text-sm font-medium text-gray-700 dark:text-gray-200">סטטיסטיקות</h3>
				<button
					type="button"
					onclick={refresh}
					class="rounded p-1 text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-600"
					title="רענן"
					aria-label="רענן"
				>
					<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						/>
					</svg>
				</button>
			</div>

			<!-- Tier Bars -->
			<div class="space-y-2">
				{#each Object.entries(stats.tiers) as [tier, data]}
					<div class="flex items-center gap-2">
						<span class="w-16 text-xs text-gray-600 dark:text-gray-300">
							{tierDescriptions[tier as MemoryTier]?.name ?? tier}
						</span>
						<div class="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
							<div
								class={["h-full rounded-full transition-all", getTierColor(tier as MemoryTier)]}
								style="width: {Math.min(
									100,
									(data.active_count / Math.max(1, getTotalActiveCount(stats))) * 100
								)}%"
							></div>
						</div>
						<span class="w-8 text-left text-xs text-gray-500 dark:text-gray-400">
							{data.active_count}
						</span>
					</div>
				{/each}
			</div>

			<div
				class="mt-3 flex items-center justify-between border-t border-gray-200 pt-2 dark:border-gray-600"
			>
				<span class="text-xs text-gray-600 dark:text-gray-300">
					{getTotalActiveCount(stats)} פעילים
				</span>
				<span class="text-xs text-gray-400">עודכן: {formatTimestamp(stats.as_of)}</span>
			</div>
		</div>
	{/if}

	<!-- Filter Controls -->
	<div class="flex items-center gap-2">
		<select
			bind:value={selectedTier}
			class="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
		>
			<option value="all">כל הסוגים</option>
			{#each Object.entries(tierDescriptions) as [tier, info]}
				<option value={tier}>{info.name}</option>
			{/each}
		</select>

		<select
			bind:value={sortBy}
			class="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
		>
			<option value="recent">עדכניות</option>
			<option value="score">ציון</option>
		</select>

		<button
			type="button"
			onclick={() => (showHelp = !showHelp)}
			class="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-600"
			title="עזרה"
			aria-label="עזרה"
		>
			<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		</button>
	</div>

	<!-- Help Panel -->
	{#if showHelp}
		<div
			class="relative rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/30"
		>
			<!-- Close Button -->
			<button
				type="button"
				onclick={() => (showHelp = false)}
				class="absolute left-2 top-2 rounded-full p-1 text-blue-600 hover:bg-blue-200 dark:text-blue-300 dark:hover:bg-blue-800"
				aria-label="סגור עזרה"
			>
				<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
			
			<h4 class="mb-2 text-sm font-medium text-blue-800 dark:text-blue-200">סוגי זיכרון</h4>
			<div class="space-y-1.5">
				{#each Object.entries(tierDescriptions) as [tier, info]}
					<div class="flex items-start gap-2">
						<span class={["mt-1 size-2 rounded-full", getTierColor(tier as MemoryTier)]}></span>
						<div>
							<span class="text-xs font-medium text-blue-700 dark:text-blue-300">{info.name}</span>
							<span class="text-xs text-blue-600 dark:text-blue-400"> - {info.desc}</span>
						</div>
					</div>
				{/each}
			</div>
			<div class="mt-3 flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (showHelp = false)}
					class="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-800"
				>
					סגור
				</button>
				<button
					type="button"
					onclick={openMemoryEducation}
					class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
				>
					למידע נוסף
				</button>
			</div>
		</div>
	{/if}

	<!-- Memory List -->
	<div class="flex-1 overflow-y-auto">
		{#if isLoading}
			<div class="flex items-center justify-center py-8">
				<div
					class="size-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"
				></div>
			</div>
		{:else if memories.length === 0}
			<!-- Phase 5: Enhanced 0-results feedback with diagnostics -->
			<div class="py-4 text-center">
				<div class="mb-3 text-sm text-gray-500 dark:text-gray-400">
					אין זיכרונות להצגה
				</div>
				<!-- Debug panel for 0 results -->
				<div class="mx-auto max-w-xs rounded-lg border border-amber-200 bg-amber-50 p-3 text-right dark:border-amber-800 dark:bg-amber-900/30">
					<p class="mb-2 text-xs font-medium text-amber-800 dark:text-amber-200">
						סיבות אפשריות:
					</p>
					<ul class="mb-3 space-y-1 text-xs text-amber-700 dark:text-amber-300">
						<li class="flex items-start gap-1">
							<span class="mt-1">•</span>
							<span>פריטים ממתינים לאינדוקס</span>
						</li>
						<li class="flex items-start gap-1">
							<span class="mt-1">•</span>
							<span>שירות האמבדינג לא זמין</span>
						</li>
						<li class="flex items-start gap-1">
							<span class="mt-1">•</span>
							<span>שאילתת החיפוש ספציפית מדי</span>
						</li>
					</ul>
					<button
						type="button"
						onclick={triggerReindex}
						class="w-full rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600"
					>
						הפעל אינדוקס מחדש
					</button>
				</div>
			</div>
		{:else}
			<VirtualList
				items={memories}
				itemHeight={MEMORY_ITEM_HEIGHT}
				containerHeight={listContainerHeight}
				overscan={3}
			>
				{#snippet children({ item: memory })}
					{@const mem = memory as MemoryItem}
					<button
						type="button"
						onclick={() => openMemoryDetail(mem)}
						class="mb-2 w-full cursor-pointer rounded-lg border border-gray-200 bg-white p-2.5 text-right transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:border-blue-500 dark:hover:bg-gray-600"
					>
						<div class="mb-1.5 flex items-center gap-1.5">
							<span class={["size-2 rounded-full", getTierColor(mem.tier)]}></span>
							<span class="text-xs text-gray-500 dark:text-gray-400">
								{tierDescriptions[mem.tier]?.name ?? mem.tier}
							</span>
							<span class="mr-auto text-xs text-gray-400">
								{(mem.wilson_score * 100).toFixed(0)}%
							</span>
						</div>
						<div
							class="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600"
						>
							<div
								class={["h-full rounded-full transition-all", scoreToBgColor(mem.wilson_score)]}
								style="width: {Math.max(0, Math.min(100, mem.wilson_score * 100))}%"
							></div>
						</div>
						<p class="line-clamp-2 text-sm text-gray-700 dark:text-gray-200">
							{mem.content}
						</p>
						{#if mem.tags && mem.tags.length > 0}
							<div class="mt-1.5 flex flex-wrap gap-1">
								{#each mem.tags.slice(0, 3) as tag}
									<span
										class="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500 dark:bg-gray-600 dark:text-gray-400"
									>
										{tag}
									</span>
								{/each}
								{#if mem.tags.length > 3}
									<span class="text-[10px] text-gray-400">+{mem.tags.length - 3}</span>
								{/if}
							</div>
						{/if}
					</button>
				{/snippet}
			</VirtualList>
		{/if}
	</div>

	<!-- Memory Bank Button -->
	<button
		type="button"
		onclick={openMemoryBank}
		class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
	>
		פתח את בנק הזיכרון...
	</button>
</div>

<!-- Memory Detail Modal -->
<MemoryDetailModal
	memory={selectedMemory}
	onclose={closeMemoryDetail}
	onarchived={handleMemoryArchived}
	onghosted={handleMemoryGhosted}
/>
