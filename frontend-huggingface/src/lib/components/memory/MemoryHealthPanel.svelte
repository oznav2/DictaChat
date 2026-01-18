<script lang="ts">
	import { onMount } from "svelte";
	import { base } from "$app/paths";
	import { browser } from "$app/environment";
	import type { MemoryTier } from "$lib/types/MemoryMeta";
	import { apiRequest } from "$lib/utils/apiClient";

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
		cache_hit_rate?: number | null;
		promotion_rate?: number | null;
		demotion_rate?: number | null;
		derived_window_ms?: number | null;
	}

	type StatsApiResponse = {
		stats?: StatsSnapshot;
	};

	type PatternsPerformanceResponse = {
		patterns?: PatternPerformanceItem[];
	};
	type DecayScheduleResponse = {
		schedule?: unknown;
	};
	type ContentGraphStatsResponse = {
		stats?: unknown;
	};
	type SystemHealthResponse = {
		health?: unknown;
	};
	type DiskSpaceResponse = {
		disk?: unknown;
	};

	function isRecord(v: unknown): v is Record<string, unknown> {
		return Boolean(v) && typeof v === "object" && !Array.isArray(v);
	}

	function asDecaySchedule(v: unknown): DecaySchedule | null {
		if (!isRecord(v)) return null;
		if (typeof v.kind !== "string") return null;
		if (typeof v.interval_ms !== "number") return null;
		if (typeof v.running !== "boolean") return null;
		if (!(v.last_run_at === null || typeof v.last_run_at === "string")) return null;
		return v as unknown as DecaySchedule;
	}

	function asContentGraphStats(v: unknown): ContentGraphStats | null {
		if (!isRecord(v)) return null;
		if (typeof v.nodes !== "number") return null;
		if (typeof v.edges !== "number") return null;
		if (!(v.last_updated_at === null || typeof v.last_updated_at === "string")) return null;
		return v as unknown as ContentGraphStats;
	}

	function asSystemHealth(v: unknown): SystemHealth | null {
		if (!isRecord(v)) return null;
		if (typeof v.ok !== "boolean") return null;
		if (!Array.isArray(v.warnings)) return null;
		if (!isRecord(v.services)) return null;
		return v as unknown as SystemHealth;
	}

	function asDiskSpace(v: unknown): DiskSpace | null {
		if (!isRecord(v)) return null;
		if (typeof v.total_bytes !== "number") return null;
		if (typeof v.free_bytes !== "number") return null;
		if (typeof v.used_bytes !== "number") return null;
		if (!(v.used_ratio === null || typeof v.used_ratio === "number")) return null;
		return v as unknown as DiskSpace;
	}

	interface PatternPerformanceItem {
		memory_id: string;
		summary: string | null;
		text_preview: string;
		uses: number;
		success_rate: number;
		wilson_score: number;
	}

	interface DecaySchedule {
		kind: string;
		interval_ms: number;
		running: boolean;
		last_run_at: string | null;
	}

	interface ContentGraphStats {
		nodes: number;
		edges: number;
		last_updated_at: string | null;
	}

	interface SystemHealth {
		ok: boolean;
		warnings: string[];
		services: { qdrant?: { ok: boolean } };
	}

	interface DiskSpace {
		total_bytes: number;
		free_bytes: number;
		used_bytes: number;
		used_ratio: number | null;
	}

	interface HealthMetrics {
		stats: StatsSnapshot | null;
		qdrantHealthy: boolean;
		qdrantPointCount: number;
		lastSyncTimestamp: string | null;
		cacheHitRate: number | null;
		promotionRate: number | null;
		demotionRate: number | null;
		patterns: PatternPerformanceItem[];
		decaySchedule: DecaySchedule | null;
		contentGraph: ContentGraphStats | null;
		systemHealth: SystemHealth | null;
		disk: DiskSpace | null;
	}

	let metrics = $state<HealthMetrics>({
		stats: null,
		qdrantHealthy: false,
		qdrantPointCount: 0,
		lastSyncTimestamp: null,
		cacheHitRate: null,
		promotionRate: null,
		demotionRate: null,
		patterns: [],
		decaySchedule: null,
		contentGraph: null,
		systemHealth: null,
		disk: null,
	});
	let isLoading = $state(true);
	let lastError = $state<string | null>(null);
	let autoRefreshInterval: ReturnType<typeof setInterval> | null = null;
	let extendedRefreshAt = $state<number>(0);
	let systemRefreshAt = $state<number>(0);
	let isVisible = $state(false);
	let panelRef: HTMLDivElement | null = null;
	let observer: IntersectionObserver | null = null;
	let decayForceStatus = $state<string | null>(null);
	let backfillStatus = $state<string | null>(null);

	const tierLabels: Record<MemoryTier, { name: string; color: string }> = {
		working: { name: "זיכרון עבודה", color: "bg-blue-500" },
		history: { name: "היסטוריה", color: "bg-purple-500" },
		patterns: { name: "דפוסים", color: "bg-green-500" },
		documents: { name: "מסמכים", color: "bg-amber-500" },
		memory_bank: { name: "בנק זיכרון", color: "bg-pink-500" },
		datagov_schema: { name: "DataGov סכמות", color: "bg-slate-500" },
		datagov_expansion: { name: "DataGov הרחבות", color: "bg-slate-500" },
	};

	async function fetchJson(url: string): Promise<{ ok: boolean; data: unknown | null }> {
		try {
			const data = await apiRequest<unknown>(url, { retries: 1, timeoutMs: 6000 });
			return { ok: true, data };
		} catch {
			return { ok: false, data: null };
		}
	}

	async function loadHealth(forceExtended = false) {
		isLoading = metrics.stats === null;
		lastError = null;

		try {
			// Fetch memory stats from SvelteKit API route
			const { ok, data: statsResponse } = await fetchJson(`${base}/api/memory/stats`);
			if (!ok) throw new Error(`Failed to fetch stats`);

			const statsData = statsResponse as StatsApiResponse;

			metrics = {
				stats: statsData?.stats ?? null,
				qdrantHealthy: statsData?.stats?.tiers ? true : false,
				qdrantPointCount: calculateTotalPoints(statsData?.stats?.tiers),
				lastSyncTimestamp: statsData?.stats?.as_of ?? null,
				cacheHitRate: statsData?.stats?.cache_hit_rate ?? null,
				promotionRate: statsData?.stats?.promotion_rate ?? null,
				demotionRate: statsData?.stats?.demotion_rate ?? null,
				patterns: metrics.patterns,
				decaySchedule: metrics.decaySchedule,
				contentGraph: metrics.contentGraph,
				systemHealth: metrics.systemHealth,
				disk: metrics.disk,
			};

			const now = Date.now();
			const shouldLoadExtended = forceExtended || now - extendedRefreshAt > 30_000;
			const shouldLoadSystem = forceExtended || now - systemRefreshAt > 60_000;

			if (shouldLoadExtended) {
				const [patternsRes, decayRes, contentGraphRes] = await Promise.all([
					fetchJson(`${base}/api/memory/patterns/performance`),
					fetchJson(`${base}/api/memory/decay/schedule`),
					fetchJson(`${base}/api/memory/content-graph/stats`),
				]);

				const patternsData = patternsRes.data as PatternsPerformanceResponse | null;
				metrics.patterns = Array.isArray(patternsData?.patterns)
					? (patternsData.patterns as PatternPerformanceItem[])
					: [];
				const decayData = decayRes.data as DecayScheduleResponse | null;
				const contentGraphData = contentGraphRes.data as ContentGraphStatsResponse | null;
				metrics.decaySchedule = decayRes.ok ? asDecaySchedule(decayData?.schedule) : null;
				metrics.contentGraph = contentGraphRes.ok
					? asContentGraphStats(contentGraphData?.stats)
					: null;
			}

			if (shouldLoadSystem) {
				const [healthRes, diskRes] = await Promise.all([
					fetchJson(`${base}/api/system/health`),
					fetchJson(`${base}/api/system/disk-space`),
				]);
				const healthData = healthRes.data as SystemHealthResponse | null;
				const diskData = diskRes.data as DiskSpaceResponse | null;
				metrics.systemHealth = healthRes.ok ? asSystemHealth(healthData?.health) : null;
				metrics.disk = diskRes.ok ? asDiskSpace(diskData?.disk) : null;
			}

			if (shouldLoadExtended) extendedRefreshAt = now;
			if (shouldLoadSystem) systemRefreshAt = now;
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

	function formatPercent(value: number | null): string {
		if (value === null) return "—";
		return (value * 100).toFixed(1) + "%";
	}

	onMount(() => {
		// Initial load
		loadHealth(true);
	});

	// Set up visibility-based polling using IntersectionObserver
	$effect(() => {
		if (!browser || !panelRef) return;

		observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				isVisible = entry?.isIntersecting ?? false;

				if (isVisible && !autoRefreshInterval) {
					// Start polling when visible
					autoRefreshInterval = setInterval(() => loadHealth(false), 5000);
				} else if (!isVisible && autoRefreshInterval) {
					// Stop polling when not visible
					clearInterval(autoRefreshInterval);
					autoRefreshInterval = null;
				}
			},
			{ threshold: 0.1 }
		);
		observer.observe(panelRef);

		return () => {
			if (autoRefreshInterval) {
				clearInterval(autoRefreshInterval);
				autoRefreshInterval = null;
			}
			if (observer) {
				observer.disconnect();
				observer = null;
			}
		};
	});

	async function forceDecayRun() {
		decayForceStatus = "טוען…";
		try {
			const res = await fetch(`${base}/api/memory/decay/force`, { method: "POST" });
			const data = await res.json();
			if (!res.ok || !data?.success) throw new Error(String(data?.error ?? `HTTP ${res.status}`));
			decayForceStatus = "בוצע";
			await loadHealth(true);
		} catch (err) {
			decayForceStatus = err instanceof Error ? err.message : "שגיאה";
		}
	}

	async function runContentGraphBackfill() {
		backfillStatus = "טוען…";
		try {
			const res = await fetch(`${base}/api/memory/content-graph/backfill`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ limit: 250 }),
			});
			const data = await res.json();
			if (!res.ok || !data?.success) throw new Error(String(data?.error ?? `HTTP ${res.status}`));
			backfillStatus = "בוצע";
			await loadHealth(true);
		} catch (err) {
			backfillStatus = err instanceof Error ? err.message : "שגיאה";
		}
	}
</script>

<div bind:this={panelRef} class="flex h-full flex-col gap-3 overflow-y-auto p-3" dir="rtl">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-medium text-gray-700 dark:text-gray-200">בריאות מערכת הזיכרון</h3>
		<button
			type="button"
			onclick={() => loadHealth(true)}
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
		<div
			class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300"
		>
			{lastError}
		</div>
	{/if}

	{#if isLoading && !metrics.stats}
		<div class="flex items-center justify-center py-8">
			<div
				class="size-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"
			></div>
		</div>
	{:else}
		<!-- System Status -->
		<div
			class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700/50"
		>
			<div class="mb-2 flex items-center gap-2">
				<span
					class={["size-2.5 rounded-full", metrics.qdrantHealthy ? "bg-green-500" : "bg-red-500"]}
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
		<div
			class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700"
		>
			<h4 class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">זיכרונות לפי סוג</h4>
			<div class="space-y-2">
				{#each Object.entries(metrics.stats?.tiers ?? {}) as [tier, data]}
					<div class="flex items-center gap-2">
						<span
							class={[
								"size-2.5 rounded-full",
								tierLabels[tier as MemoryTier]?.color ?? "bg-gray-500",
							]}
						></span>
						<span class="w-20 text-xs text-gray-600 dark:text-gray-300">
							{tierLabels[tier as MemoryTier]?.name ?? tier}
						</span>
						<div class="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
							<div
								class={[
									"h-full rounded-full transition-all",
									tierLabels[tier as MemoryTier]?.color ?? "bg-gray-500",
								]}
								style="width: {Math.min(
									100,
									(data.active_count / Math.max(1, getTotalActiveMemories())) * 100
								)}%"
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
		<div
			class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700"
		>
			<h4 class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">מדדי ביצועים</h4>
			<div class="grid grid-cols-2 gap-3">
				<div class="text-center">
					<div class="text-lg font-semibold text-blue-600 dark:text-blue-400">
						{formatPercent(getOverallSuccessRate())}
					</div>
					<div class="text-[10px] text-gray-500 dark:text-gray-400">הצלחת אחזור</div>
				</div>
				{#if metrics.cacheHitRate !== null}
					<div class="text-center">
						<div class="text-lg font-semibold text-green-600 dark:text-green-400">
							{formatPercent(metrics.cacheHitRate)}
						</div>
						<div class="text-[10px] text-gray-500 dark:text-gray-400">פגיעות קאש</div>
					</div>
				{/if}
				{#if metrics.promotionRate !== null}
					<div class="text-center">
						<div class="text-lg font-semibold text-purple-600 dark:text-purple-400">
							{formatPercent(metrics.promotionRate)}
						</div>
						<div class="text-[10px] text-gray-500 dark:text-gray-400">קידום</div>
					</div>
				{/if}
				{#if metrics.demotionRate !== null}
					<div class="text-center">
						<div class="text-lg font-semibold text-amber-600 dark:text-amber-400">
							{formatPercent(metrics.demotionRate)}
						</div>
						<div class="text-[10px] text-gray-500 dark:text-gray-400">הורדה</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Tier Success Rates -->
		{#if metrics.stats?.tiers}
			<div
				class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700"
			>
				<h4 class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
					אחוזי הצלחה לפי סוג
				</h4>
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

		<!-- Decay / Promotion Ops -->
		<div
			class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700"
		>
			<h4 class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">דעיכה / קידום</h4>

			<div class="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
				<div>
					<span class="text-gray-500 dark:text-gray-400">מתזמן:</span>
					<span class="mr-1 font-medium">{metrics.decaySchedule?.running ? "פועל" : "לא פעיל"}</span
					>
				</div>
				<button
					type="button"
					onclick={forceDecayRun}
					class="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500"
				>
					הרץ עכשיו
				</button>
			</div>
			<div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
				הרצה אחרונה: {formatTimestamp(metrics.decaySchedule?.last_run_at ?? null)}
				{#if decayForceStatus}
					<span class="mr-2">({decayForceStatus})</span>
				{/if}
			</div>
		</div>

		<!-- Content Graph -->
		<div
			class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700"
		>
			<h4 class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">גרף תוכן</h4>
			<div class="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
				<div>
					<span class="text-gray-500 dark:text-gray-400">צמתים:</span>
					<span class="mr-1 font-medium">{metrics.contentGraph?.nodes ?? "—"}</span>
				</div>
				<div>
					<span class="text-gray-500 dark:text-gray-400">קשתות:</span>
					<span class="mr-1 font-medium">{metrics.contentGraph?.edges ?? "—"}</span>
				</div>
				<div class="col-span-2">
					<span class="text-gray-500 dark:text-gray-400">עדכון אחרון:</span>
					<span class="mr-1 font-medium">
						{formatTimestamp(metrics.contentGraph?.last_updated_at ?? null)}
					</span>
				</div>
			</div>
			<div class="mt-2 flex items-center justify-between">
				<button
					type="button"
					onclick={runContentGraphBackfill}
					class="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500"
				>
					Backfill
				</button>
				{#if backfillStatus}
					<div class="text-xs text-gray-500 dark:text-gray-400">{backfillStatus}</div>
				{/if}
			</div>
		</div>

		<!-- Patterns Performance -->
		{#if metrics.patterns.length > 0}
			<div
				class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700"
			>
				<h4 class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">דפוסים מובילים</h4>
				<div class="space-y-2">
					{#each metrics.patterns.slice(0, 5) as p}
						<div class="flex items-center justify-between gap-2 text-xs">
							<div class="flex-1 truncate text-gray-700 dark:text-gray-200">
								{p.summary ?? p.text_preview}
							</div>
							<div class="shrink-0 text-gray-500 dark:text-gray-400">
								{(p.success_rate * 100).toFixed(0)}% · {p.uses}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- System Health -->
		{#if metrics.systemHealth || metrics.disk}
			<div
				class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700"
			>
				<h4 class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">System Health</h4>
				<div class="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
					<div>
						<span class="text-gray-500 dark:text-gray-400">Qdrant:</span>
						<span class="mr-1 font-medium">
							{metrics.systemHealth?.services?.qdrant?.ok ? "OK" : "DOWN"}
						</span>
					</div>
					<div>
						<span class="text-gray-500 dark:text-gray-400">Disk:</span>
						<span class="mr-1 font-medium">
							{metrics.disk?.used_ratio === null || metrics.disk?.used_ratio === undefined
								? "—"
								: (metrics.disk?.used_ratio * 100).toFixed(0) + "%"}
						</span>
					</div>
					{#if metrics.systemHealth?.warnings?.length}
						<div class="col-span-2 text-xs text-amber-700 dark:text-amber-300">
							{metrics.systemHealth.warnings.join(", ")}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	{/if}
</div>
