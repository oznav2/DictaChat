<script lang="ts">
	import { onMount } from "svelte";
	import { base } from "$app/paths";
	import type { MemoryTier } from "$lib/types/MemoryMeta";

	interface TierStats {
		active_count: number;
		archived_count: number;
		deleted_count: number;
		uses_total: number;
		success_rate: number;
	}

	interface StatsSnapshot {
		user_id: string;
		as_of: string;
		tiers: Record<MemoryTier, TierStats>;
	}

	interface HealthMetrics {
		stats: StatsSnapshot | null;
		qdrantHealthy: boolean;
		qdrantPointCount: number;
		lastSyncTimestamp: string | null;
		cacheHitRate: number;
		promotionRate: number;
		demotionRate: number;
	}

	let metrics = $state<HealthMetrics>({
		stats: null,
		qdrantHealthy: false,
		qdrantPointCount: 0,
		lastSyncTimestamp: null,
		cacheHitRate: 0,
		promotionRate: 0,
		demotionRate: 0,
	});
	let isLoading = $state(true);
	let lastError = $state<string | null>(null);
	let autoRefreshInterval: ReturnType<typeof setInterval> | null = null;

	const tierLabels: Record<MemoryTier, { name: string; color: string }> = {
		working: { name: "זיכרון עבודה", color: "bg-blue-500" },
		history: { name: "היסטוריה", color: "bg-purple-500" },
		patterns: { name: "דפוסים", color: "bg-green-500" },
		books: { name: "ספרים", color: "bg-amber-500" },
		memory_bank: { name: "בנק זיכרון", color: "bg-pink-500" },
	};

	async function loadHealth() {
		isLoading = true;
		lastError = null;

		try {
			// Fetch memory stats from SvelteKit API route
			const response = await fetch(`${base}/api/memory/stats`);
			if (!response.ok) {
				throw new Error(`Failed to fetch stats: ${response.status}`);
			}
			const statsResponse = await response.json();

			metrics = {
				stats: statsResponse?.stats ?? null,
				qdrantHealthy: statsResponse?.stats?.tiers ? true : false,
				qdrantPointCount: calculateTotalPoints(statsResponse?.stats?.tiers),
				lastSyncTimestamp: statsResponse?.stats?.as_of ?? null,
				cacheHitRate: calculateCacheHitRate(statsResponse),
				promotionRate: calculatePromotionRate(statsResponse),
				demotionRate: calculateDemotionRate(statsResponse),
			};
		} catch (err) {
			lastError = err instanceof Error ? err.message : "Failed to load health metrics";
		} finally {
			isLoading = false;
		}
	}

	function calculateTotalPoints(tiers: Record<MemoryTier, TierStats> | undefined): number {
		if (!tiers) return 0;
		return Object.values(tiers).reduce((sum, t) => sum + t.active_count, 0);
	}

	function calculateCacheHitRate(response: unknown): number {
		// Placeholder - would come from actual cache metrics
		return 0.75;
	}

	function calculatePromotionRate(response: unknown): number {
		// Placeholder - would come from promotion service metrics
		return 0.12;
	}

	function calculateDemotionRate(response: unknown): number {
		// Placeholder - would come from demotion service metrics
		return 0.05;
	}

	function getTotalActiveMemories(): number {
		if (!metrics.stats?.tiers) return 0;
		return Object.values(metrics.stats.tiers).reduce((sum, t) => sum + t.active_count, 0);
	}

	function getTotalArchivedMemories(): number {
		if (!metrics.stats?.tiers) return 0;
		return Object.values(metrics.stats.tiers).reduce((sum, t) => sum + t.archived_count, 0);
	}

	function getOverallSuccessRate(): number {
		if (!metrics.stats?.tiers) return 0;
		const tiers = Object.values(metrics.stats.tiers);
		if (tiers.length === 0) return 0;
		const totalUses = tiers.reduce((sum, t) => sum + t.uses_total, 0);
		if (totalUses === 0) return 0;
		const weightedSum = tiers.reduce((sum, t) => sum + t.success_rate * t.uses_total, 0);
		return weightedSum / totalUses;
	}

	function formatTimestamp(timestamp: string | null): string {
		if (!timestamp) return "לא ידוע";
		const date = new Date(timestamp);
		return date.toLocaleString("he-IL", {
			dateStyle: "short",
			timeStyle: "short",
		});
	}

	function formatPercent(value: number): string {
		return (value * 100).toFixed(1) + "%";
	}

	onMount(() => {
		loadHealth();
		// Auto-refresh every 30 seconds
		autoRefreshInterval = setInterval(loadHealth, 30000);

		return () => {
			if (autoRefreshInterval) {
				clearInterval(autoRefreshInterval);
			}
		};
	});
</script>

<div class="flex h-full flex-col gap-3 overflow-y-auto p-3" dir="rtl">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-medium text-gray-700 dark:text-gray-200">בריאות מערכת הזיכרון</h3>
		<button
			type="button"
			onclick={loadHealth}
			disabled={isLoading}
			class="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-600"
			title="רענן"
			aria-label="רענן"
		>
			<svg
				class={["size-4", isLoading && "animate-spin"]}
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
				/>
			</svg>
		</button>
	</div>

	{#if lastError}
		<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
			{lastError}
		</div>
	{/if}

	{#if isLoading && !metrics.stats}
		<div class="flex items-center justify-center py-8">
			<div class="size-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"></div>
		</div>
	{:else}
		<!-- System Status -->
		<div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700/50">
			<div class="mb-2 flex items-center gap-2">
				<span
					class={[
						"size-2.5 rounded-full",
						metrics.qdrantHealthy ? "bg-green-500" : "bg-red-500",
					]}
				></span>
				<span class="text-sm font-medium text-gray-700 dark:text-gray-200">
					{metrics.qdrantHealthy ? "מערכת תקינה" : "בעיית חיבור"}
				</span>
			</div>
			<div class="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
				<div>
					<span class="text-gray-500 dark:text-gray-400">סה"כ פעילים:</span>
					<span class="mr-1 font-medium">{getTotalActiveMemories()}</span>
				</div>
				<div>
					<span class="text-gray-500 dark:text-gray-400">מאורכבים:</span>
					<span class="mr-1 font-medium">{getTotalArchivedMemories()}</span>
				</div>
				<div>
					<span class="text-gray-500 dark:text-gray-400">נקודות Qdrant:</span>
					<span class="mr-1 font-medium">{metrics.qdrantPointCount}</span>
				</div>
				<div>
					<span class="text-gray-500 dark:text-gray-400">עדכון אחרון:</span>
					<span class="mr-1 font-medium">{formatTimestamp(metrics.lastSyncTimestamp)}</span>
				</div>
			</div>
		</div>

		<!-- Tier Breakdown -->
		<div class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700">
			<h4 class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">זיכרונות לפי סוג</h4>
			<div class="space-y-2">
				{#each Object.entries(metrics.stats?.tiers ?? {}) as [tier, data]}
					<div class="flex items-center gap-2">
						<span class={["size-2.5 rounded-full", tierLabels[tier as MemoryTier]?.color ?? "bg-gray-500"]}></span>
						<span class="w-20 text-xs text-gray-600 dark:text-gray-300">
							{tierLabels[tier as MemoryTier]?.name ?? tier}
						</span>
						<div class="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
							<div
								class={[
									"h-full rounded-full transition-all",
									tierLabels[tier as MemoryTier]?.color ?? "bg-gray-500",
								]}
								style="width: {Math.min(100, (data.active_count / Math.max(1, getTotalActiveMemories())) * 100)}%"
							></div>
						</div>
						<span class="w-10 text-left text-xs text-gray-500 dark:text-gray-400">
							{data.active_count}
						</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Performance Metrics -->
		<div class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700">
			<h4 class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">מדדי ביצועים</h4>
			<div class="grid grid-cols-2 gap-3">
				<div class="text-center">
					<div class="text-lg font-semibold text-blue-600 dark:text-blue-400">
						{formatPercent(getOverallSuccessRate())}
					</div>
					<div class="text-[10px] text-gray-500 dark:text-gray-400">הצלחת אחזור</div>
				</div>
				<div class="text-center">
					<div class="text-lg font-semibold text-green-600 dark:text-green-400">
						{formatPercent(metrics.cacheHitRate)}
					</div>
					<div class="text-[10px] text-gray-500 dark:text-gray-400">פגיעות קאש</div>
				</div>
				<div class="text-center">
					<div class="text-lg font-semibold text-purple-600 dark:text-purple-400">
						{formatPercent(metrics.promotionRate)}
					</div>
					<div class="text-[10px] text-gray-500 dark:text-gray-400">קידום</div>
				</div>
				<div class="text-center">
					<div class="text-lg font-semibold text-amber-600 dark:text-amber-400">
						{formatPercent(metrics.demotionRate)}
					</div>
					<div class="text-[10px] text-gray-500 dark:text-gray-400">הורדה</div>
				</div>
			</div>
		</div>

		<!-- Tier Success Rates -->
		{#if metrics.stats?.tiers}
			<div class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700">
				<h4 class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">אחוזי הצלחה לפי סוג</h4>
				<div class="space-y-1.5">
					{#each Object.entries(metrics.stats.tiers) as [tier, data]}
						{#if data.uses_total > 0}
							<div class="flex items-center justify-between text-xs">
								<span class="text-gray-600 dark:text-gray-300">
									{tierLabels[tier as MemoryTier]?.name ?? tier}
								</span>
								<span
									class={[
										"font-medium",
										data.success_rate >= 0.7
											? "text-green-600 dark:text-green-400"
											: data.success_rate >= 0.4
												? "text-amber-600 dark:text-amber-400"
												: "text-red-600 dark:text-red-400",
									]}
								>
									{formatPercent(data.success_rate)}
								</span>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
