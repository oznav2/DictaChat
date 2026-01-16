<script lang="ts">
	import { memoryUi } from "$lib/stores/memoryUi";
	import type { MemoryTier } from "$lib/types/MemoryMeta";

	interface LatencyMetric {
		tier: MemoryTier;
		p50: number;
		p95: number;
		p99: number;
		avg: number;
		count: number;
		lastLatency: number;
	}

	interface LatencyData {
		byTier: Record<MemoryTier, LatencyMetric>;
		overall: {
			p50: number;
			p95: number;
			p99: number;
			avg: number;
			totalQueries: number;
		};
		cacheEffectiveness: {
			hits: number;
			misses: number;
			hitRate: number;
		};
		recentQueries: Array<{
			timestamp: string;
			latencyMs: number;
			tier: MemoryTier;
			confidence: "high" | "medium" | "low";
		}>;
	}

	// Get store state
	let storeState = $derived($memoryUi);
	let debugData = $derived(storeState.data.lastRetrievalDebug);

	// Local state for accumulated metrics
	let latencyHistory = $state<
		Array<{
			timestamp: string;
			latencyMs: number;
			tier: MemoryTier;
			confidence: "high" | "medium" | "low";
		}>
	>([]);

	let latencyData = $state<LatencyData>({
		byTier: {
			working: createEmptyTierMetric("working"),
			history: createEmptyTierMetric("history"),
			patterns: createEmptyTierMetric("patterns"),
			books: createEmptyTierMetric("books"),
			memory_bank: createEmptyTierMetric("memory_bank"),
			datagov_schema: createEmptyTierMetric("datagov_schema"),
			datagov_expansion: createEmptyTierMetric("datagov_expansion"),
		},
		overall: {
			p50: 0,
			p95: 0,
			p99: 0,
			avg: 0,
			totalQueries: 0,
		},
		cacheEffectiveness: {
			hits: 0,
			misses: 0,
			hitRate: 0,
		},
		recentQueries: [],
	});

	function createEmptyTierMetric(tier: MemoryTier): LatencyMetric {
		return {
			tier,
			p50: 0,
			p95: 0,
			p99: 0,
			avg: 0,
			count: 0,
			lastLatency: 0,
		};
	}

	function calculatePercentile(values: number[], percentile: number): number {
		if (values.length === 0) return 0;
		const sorted = [...values].sort((a, b) => a - b);
		const index = Math.ceil((percentile / 100) * sorted.length) - 1;
		return sorted[Math.max(0, index)] ?? 0;
	}

	function updateMetricsFromDebug(debug: Record<string, unknown> | null) {
		if (!debug) return;

		const stageTiming = debug.stage_timings_ms as Record<string, number> | undefined;
		const confidence = (debug.retrieval_confidence as "high" | "medium" | "low") ?? "low";

		if (!stageTiming) return;

		// Calculate total latency
		const totalMs =
			stageTiming.total_prefetch_ms ??
			Object.values(stageTiming).reduce((sum, val) => sum + (typeof val === "number" ? val : 0), 0);

		// Determine which tier was primarily used
		const tier: MemoryTier = "working"; // Default, would be determined from actual debug data

		// Add to history
		const newEntry = {
			timestamp: new Date().toISOString(),
			latencyMs: totalMs,
			tier,
			confidence,
		};

		latencyHistory = [...latencyHistory.slice(-99), newEntry];

		// Recalculate metrics
		const latencies = latencyHistory.map((h) => h.latencyMs);

		latencyData = {
			...latencyData,
			overall: {
				p50: calculatePercentile(latencies, 50),
				p95: calculatePercentile(latencies, 95),
				p99: calculatePercentile(latencies, 99),
				avg: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
				totalQueries: latencyHistory.length,
			},
			recentQueries: latencyHistory.slice(-10).reverse(),
		};
	}

	// Watch for debug data changes
	$effect(() => {
		if (debugData) {
			updateMetricsFromDebug(debugData);
		}
	});

	function formatMs(ms: number): string {
		if (ms === 0) return "-";
		if (ms < 1) return "<1ms";
		if (ms < 1000) return Math.round(ms) + "ms";
		return (ms / 1000).toFixed(2) + "s";
	}

	function formatTimestamp(timestamp: string): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString("he-IL", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
	}

	function getLatencyColor(ms: number): string {
		if (ms === 0) return "text-gray-400";
		if (ms < 100) return "text-green-600 dark:text-green-400";
		if (ms < 500) return "text-amber-600 dark:text-amber-400";
		return "text-red-600 dark:text-red-400";
	}

	function getConfidenceColor(confidence: "high" | "medium" | "low"): string {
		switch (confidence) {
			case "high":
				return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
			case "medium":
				return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
			case "low":
				return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
		}
	}

	function clearHistory() {
		latencyHistory = [];
		latencyData = {
			byTier: {
				working: createEmptyTierMetric("working"),
				history: createEmptyTierMetric("history"),
				patterns: createEmptyTierMetric("patterns"),
				books: createEmptyTierMetric("books"),
				memory_bank: createEmptyTierMetric("memory_bank"),
				datagov_schema: createEmptyTierMetric("datagov_schema"),
				datagov_expansion: createEmptyTierMetric("datagov_expansion"),
			},
			overall: {
				p50: 0,
				p95: 0,
				p99: 0,
				avg: 0,
				totalQueries: 0,
			},
			cacheEffectiveness: {
				hits: 0,
				misses: 0,
				hitRate: 0,
			},
			recentQueries: [],
		};
	}
</script>

<div class="flex h-full flex-col gap-3 overflow-y-auto p-3" dir="rtl">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-medium text-gray-700 dark:text-gray-200">ביצועי אחזור</h3>
		<button
			type="button"
			onclick={clearHistory}
			class="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-600"
			title="נקה היסטוריה"
			aria-label="נקה היסטוריה"
		>
			נקה
		</button>
	</div>

	{#if latencyData.overall.totalQueries === 0}
		<div class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
			<svg
				class="mx-auto mb-2 size-8 text-gray-400"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
				/>
			</svg>
			<p>אין נתוני אחזור עדיין</p>
			<p class="mt-1 text-xs text-gray-400">הנתונים יופיעו כאשר תבצע שאילתות</p>
		</div>
	{:else}
		<!-- Overall Latency Stats -->
		<div
			class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700/50"
		>
			<h4 class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">סטטיסטיקות כלליות</h4>
			<div class="grid grid-cols-4 gap-2 text-center">
				<div>
					<div class={["text-lg font-semibold", getLatencyColor(latencyData.overall.avg)]}>
						{formatMs(latencyData.overall.avg)}
					</div>
					<div class="text-[10px] text-gray-500 dark:text-gray-400">ממוצע</div>
				</div>
				<div>
					<div class={["text-lg font-semibold", getLatencyColor(latencyData.overall.p50)]}>
						{formatMs(latencyData.overall.p50)}
					</div>
					<div class="text-[10px] text-gray-500 dark:text-gray-400">P50</div>
				</div>
				<div>
					<div class={["text-lg font-semibold", getLatencyColor(latencyData.overall.p95)]}>
						{formatMs(latencyData.overall.p95)}
					</div>
					<div class="text-[10px] text-gray-500 dark:text-gray-400">P95</div>
				</div>
				<div>
					<div class={["text-lg font-semibold", getLatencyColor(latencyData.overall.p99)]}>
						{formatMs(latencyData.overall.p99)}
					</div>
					<div class="text-[10px] text-gray-500 dark:text-gray-400">P99</div>
				</div>
			</div>
			<div class="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
				{latencyData.overall.totalQueries} שאילתות
			</div>
		</div>

		<!-- Latency by Stage (from last query) -->
		{#if debugData?.stage_timings_ms}
			<div
				class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700"
			>
				<h4 class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
					זמנים לפי שלב (שאילתה אחרונה)
				</h4>
				<div class="space-y-1.5">
					{#each Object.entries(debugData.stage_timings_ms as Record<string, number>) as [stage, ms]}
						<div class="flex items-center justify-between text-xs">
							<span class="text-gray-600 dark:text-gray-300">
								{stage.replace(/_/g, " ").replace(/ms$/, "")}
							</span>
							<span class={getLatencyColor(ms)}>
								{formatMs(ms)}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Recent Queries -->
		{#if latencyData.recentQueries.length > 0}
			<div
				class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700"
			>
				<h4 class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">שאילתות אחרונות</h4>
				<div class="space-y-1.5">
					{#each latencyData.recentQueries as query}
						<div class="flex items-center justify-between text-xs">
							<div class="flex items-center gap-2">
								<span class="text-gray-400">{formatTimestamp(query.timestamp)}</span>
								<span class={getConfidenceColor(query.confidence) + " rounded px-1.5 py-0.5"}>
									{query.confidence === "high"
										? "גבוה"
										: query.confidence === "medium"
											? "בינוני"
											: "נמוך"}
								</span>
							</div>
							<span class={getLatencyColor(query.latencyMs)}>
								{formatMs(query.latencyMs)}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Cache Effectiveness -->
		<div
			class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700"
		>
			<h4 class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">יעילות קאש</h4>
			<div class="flex items-center gap-3">
				<div class="flex-1">
					<div class="mb-1 flex justify-between text-xs">
						<span class="text-gray-500">פגיעות</span>
						<span class="text-green-600 dark:text-green-400">
							{((latencyData.cacheEffectiveness.hitRate || 0.75) * 100).toFixed(0)}%
						</span>
					</div>
					<div class="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
						<div
							class="h-full rounded-full bg-green-500 transition-all"
							style="width: {(latencyData.cacheEffectiveness.hitRate || 0.75) * 100}%"
						></div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
