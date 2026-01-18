<script lang="ts">
	import { base } from "$app/paths";
	import { onMount, onDestroy } from "svelte";
	import RetrievalLatencyPanel from "$lib/components/memory/RetrievalLatencyPanel.svelte";

	let stats = $state<Record<string, unknown> | null>(null);
	let loadingStats = $state(false);
	let opsLog = $state<string[]>([]);

	// Phase: Wire remaining 64 - Circuit Breaker and Performance state
	let mcpCircuitBreakers = $state<Record<string, unknown> | null>(null);
	let mcpCircuitLoading = $state(false);
	let embeddingCircuitBreaker = $state<Record<string, unknown> | null>(null);
	let embeddingCircuitLoading = $state(false);
	let performanceSummary = $state<Record<string, unknown> | null>(null);
	let performanceLoading = $state(false);

	// Phase: Wire remaining 64 - Additional API endpoints state
	let kgStats = $state<Record<string, unknown> | null>(null);
	let kgStatsLoading = $state(false);
	let patternPerformance = $state<Record<string, unknown> | null>(null);
	let patternLoading = $state(false);

	let reindexProgress = $state<Record<string, unknown> | null>(null);
	let polling = $state(false);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	let graphMeta = $state<Record<string, unknown> | null>(null);
	let graphLoading = $state(false);

	let searchQuery = $state<string>("test");
	let searchLoading = $state(false);
	let searchDebug = $state<Record<string, unknown> | null>(null);

	type ApiTimingEntry = {
		at: string;
		name: string;
		wall_ms: number;
		server_ms: number | null;
		meta?: Record<string, unknown> | null;
	};
	let apiTimings = $state<ApiTimingEntry[]>([]);

	function log(line: string) {
		opsLog = [`${new Date().toISOString()} ${line}`, ...opsLog].slice(0, 50);
	}

	function pushApiTiming(entry: ApiTimingEntry) {
		apiTimings = [entry, ...apiTimings].slice(0, 20);
	}

	function sumStageTimingsMs(stage: unknown): number | null {
		if (!stage || typeof stage !== "object") return null;
		const vals = Object.values(stage as Record<string, unknown>)
			.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0))
			.filter((n) => n > 0);
		if (vals.length === 0) return null;
		return vals.reduce((a, b) => a + b, 0);
	}

	async function loadStats() {
		loadingStats = true;
		const started = performance.now();
		try {
			const res = await fetch(`${base}/api/memory/stats`);
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `stats failed (${res.status})`);
			stats = data.stats;
			pushApiTiming({
				at: new Date().toISOString(),
				name: "GET /api/memory/stats",
				wall_ms: performance.now() - started,
				server_ms: typeof data?.meta?.built_ms === "number" ? data.meta.built_ms : null,
			});
		} catch (err) {
			log(`stats error: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			loadingStats = false;
		}
	}

	async function loadReindexProgress() {
		const started = performance.now();
		try {
			const res = await fetch(`${base}/api/memory/ops/reindex`);
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `progress failed (${res.status})`);
			reindexProgress = data.progress;
			pushApiTiming({
				at: new Date().toISOString(),
				name: "GET /api/memory/ops/reindex",
				wall_ms: performance.now() - started,
				server_ms: typeof data?.meta?.built_ms === "number" ? data.meta.built_ms : null,
			});
		} catch (err) {
			log(`reindex progress error: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	async function loadGraphTimings() {
		graphLoading = true;
		const started = performance.now();
		try {
			const res = await fetch(`${base}/api/memory/graph?mode=both`);
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `graph failed (${res.status})`);
			const builtMs = typeof data?.meta?.built_ms === "number" ? data.meta.built_ms : null;
			graphMeta = {
				built_ms: builtMs,
				nodes: Array.isArray(data?.nodes) ? data.nodes.length : null,
				edges: Array.isArray(data?.edges) ? data.edges.length : null,
			};
			pushApiTiming({
				at: new Date().toISOString(),
				name: "GET /api/memory/graph?mode=both",
				wall_ms: performance.now() - started,
				server_ms: builtMs,
				meta: {
					nodes: Array.isArray(data?.nodes) ? data.nodes.length : null,
					edges: Array.isArray(data?.edges) ? data.edges.length : null,
				},
			});
		} catch (err) {
			log(`graph timings error: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			graphLoading = false;
		}
	}

	async function runMemorySearch() {
		searchLoading = true;
		const started = performance.now();
		try {
			const res = await fetch(`${base}/api/memory/search`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: searchQuery,
					tier: "all",
					sortBy: "relevance",
					limit: 10,
					offset: 0,
				}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `search failed (${res.status})`);
			const debug = data?.debug ?? null;
			searchDebug = debug;
			const serverMs = sumStageTimingsMs(debug?.stage_timings_ms);
			pushApiTiming({
				at: new Date().toISOString(),
				name: "POST /api/memory/search",
				wall_ms: performance.now() - started,
				server_ms: serverMs,
				meta: {
					query: searchQuery,
					results: Array.isArray(data?.results) ? data.results.length : null,
				},
			});
		} catch (err) {
			log(`memory search error: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			searchLoading = false;
		}
	}

	// Phase: Wire remaining 64 - MCP Circuit Breaker functions
	async function loadMcpCircuitBreakers() {
		mcpCircuitLoading = true;
		const started = performance.now();
		try {
			const res = await fetch(`${base}/api/admin/circuit-breakers`);
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `circuit breakers failed (${res.status})`);
			mcpCircuitBreakers = data.stats;
			pushApiTiming({
				at: new Date().toISOString(),
				name: "GET /api/admin/circuit-breakers",
				wall_ms: performance.now() - started,
				server_ms: null,
			});
		} catch (err) {
			log(`MCP circuit breakers error: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			mcpCircuitLoading = false;
		}
	}

	async function resetMcpCircuitBreakers() {
		try {
			log("resetting MCP circuit breakers");
			const res = await fetch(`${base}/api/admin/circuit-breakers`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "reset" }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `reset failed (${res.status})`);
			log("MCP circuit breakers reset");
			await loadMcpCircuitBreakers();
		} catch (err) {
			log(`reset error: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// Phase: Wire remaining 64 - Embedding Circuit Breaker functions
	async function loadEmbeddingCircuitBreaker() {
		embeddingCircuitLoading = true;
		const started = performance.now();
		try {
			const res = await fetch(`${base}/api/memory/ops/circuit-breaker`);
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `embedding CB failed (${res.status})`);
			embeddingCircuitBreaker = data;
			pushApiTiming({
				at: new Date().toISOString(),
				name: "GET /api/memory/ops/circuit-breaker",
				wall_ms: performance.now() - started,
				server_ms: null,
			});
		} catch (err) {
			log(`embedding CB error: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			embeddingCircuitLoading = false;
		}
	}

	async function resetEmbeddingCircuitBreaker() {
		try {
			log("resetting embedding circuit breaker");
			const res = await fetch(`${base}/api/memory/ops/circuit-breaker`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "reset" }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `reset failed (${res.status})`);
			log(`embedding CB reset: ${data.message}`);
			await loadEmbeddingCircuitBreaker();
		} catch (err) {
			log(`embedding CB reset error: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// Phase: Wire remaining 64 - Performance Monitor functions
	async function loadPerformanceSummary() {
		performanceLoading = true;
		const started = performance.now();
		try {
			const res = await fetch(`${base}/api/admin/performance`);
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `performance failed (${res.status})`);
			performanceSummary = data.summary;
			pushApiTiming({
				at: new Date().toISOString(),
				name: "GET /api/admin/performance",
				wall_ms: performance.now() - started,
				server_ms: null,
			});
		} catch (err) {
			log(`performance error: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			performanceLoading = false;
		}
	}

	async function clearPerformanceMetrics() {
		try {
			log("clearing performance metrics");
			const res = await fetch(`${base}/api/admin/performance`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "clear" }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `clear failed (${res.status})`);
			log("performance metrics cleared");
			await loadPerformanceSummary();
		} catch (err) {
			log(`clear error: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// Phase: Wire remaining 64 - Knowledge Graph Stats
	async function loadKgStats() {
		kgStatsLoading = true;
		const started = performance.now();
		try {
			const res = await fetch(`${base}/api/memory/content-graph/stats`);
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `KG stats failed (${res.status})`);
			kgStats = data;
			pushApiTiming({
				at: new Date().toISOString(),
				name: "GET /api/memory/content-graph/stats",
				wall_ms: performance.now() - started,
				server_ms: null,
			});
		} catch (err) {
			log(`KG stats error: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			kgStatsLoading = false;
		}
	}

	async function runKgBackfill() {
		try {
			log("running KG backfill");
			const res = await fetch(`${base}/api/memory/content-graph/backfill`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `backfill failed (${res.status})`);
			log(`KG backfill: ${JSON.stringify(data.result ?? data)}`);
			await loadKgStats();
		} catch (err) {
			log(`KG backfill error: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// Phase: Wire remaining 64 - Pattern Performance
	async function loadPatternPerformance() {
		patternLoading = true;
		const started = performance.now();
		try {
			const res = await fetch(`${base}/api/memory/patterns/performance`);
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `pattern perf failed (${res.status})`);
			patternPerformance = data;
			pushApiTiming({
				at: new Date().toISOString(),
				name: "GET /api/memory/patterns/performance",
				wall_ms: performance.now() - started,
				server_ms: null,
			});
		} catch (err) {
			log(`pattern perf error: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			patternLoading = false;
		}
	}

	// Phase: Wire remaining 64 - Memory Operations
	async function runSanitize() {
		try {
			log("running sanitize");
			const res = await fetch(`${base}/api/memory/ops/sanitize`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `sanitize failed (${res.status})`);
			log(`sanitize: ${JSON.stringify(data.result ?? data)}`);
			await loadStats();
		} catch (err) {
			log(`sanitize error: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	async function runCleanup() {
		try {
			log("running cleanup");
			const res = await fetch(`${base}/api/memory/cleanup`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `cleanup failed (${res.status})`);
			log(`cleanup: ${JSON.stringify(data.result ?? data)}`);
			await loadStats();
		} catch (err) {
			log(`cleanup error: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	async function promoteNow() {
		try {
			log("promoteNow start");
			const started = performance.now();
			const res = await fetch(`${base}/api/memory/ops/promote`, { method: "POST" });
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `promote failed (${res.status})`);
			log(`promoteNow done: ${JSON.stringify(data.stats)}`);
			pushApiTiming({
				at: new Date().toISOString(),
				name: "POST /api/memory/ops/promote",
				wall_ms: performance.now() - started,
				server_ms: typeof data?.meta?.built_ms === "number" ? data.meta.built_ms : null,
			});
			await loadStats();
		} catch (err) {
			log(`promoteNow error: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	async function reindexStart() {
		try {
			log("reindex start");
			const started = performance.now();
			const res = await fetch(`${base}/api/memory/ops/reindex`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `reindex failed (${res.status})`);
			log(`reindex triggered: ${JSON.stringify(data.result)}`);
			pushApiTiming({
				at: new Date().toISOString(),
				name: "POST /api/memory/ops/reindex",
				wall_ms: performance.now() - started,
				server_ms: typeof data?.meta?.built_ms === "number" ? data.meta.built_ms : null,
			});
			await loadReindexProgress();
		} catch (err) {
			log(`reindex error: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	async function reindexPause() {
		try {
			log("reindex pause");
			const started = performance.now();
			const res = await fetch(`${base}/api/memory/ops/reindex/pause`, { method: "POST" });
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `pause failed (${res.status})`);
			log(`reindex paused: ${String(data.paused)}`);
			pushApiTiming({
				at: new Date().toISOString(),
				name: "POST /api/memory/ops/reindex/pause",
				wall_ms: performance.now() - started,
				server_ms: typeof data?.meta?.built_ms === "number" ? data.meta.built_ms : null,
			});
			await loadReindexProgress();
		} catch (err) {
			log(`pause error: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	async function consistencyCheck() {
		try {
			log("consistency check start");
			const started = performance.now();
			const res = await fetch(`${base}/api/memory/ops/consistency`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ dryRun: false, sampleSize: 250 }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || `consistency failed (${res.status})`);
			log(`consistency done: issues=${data.result?.issuesFound ?? "?"}`);
			pushApiTiming({
				at: new Date().toISOString(),
				name: "POST /api/memory/ops/consistency",
				wall_ms: performance.now() - started,
				server_ms: typeof data?.meta?.built_ms === "number" ? data.meta.built_ms : null,
			});
		} catch (err) {
			log(`consistency error: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	function startPolling() {
		if (pollTimer) return;
		polling = true;
		pollTimer = setInterval(() => {
			void loadReindexProgress();
		}, 3000);
	}

	function stopPolling() {
		if (!pollTimer) return;
		clearInterval(pollTimer);
		pollTimer = null;
		polling = false;
	}

	onMount(() => {
		void loadStats();
		void loadReindexProgress();
		void loadGraphTimings();
		// Phase: Wire remaining 64 - Load circuit breaker and performance data
		void loadMcpCircuitBreakers();
		void loadEmbeddingCircuitBreaker();
		void loadPerformanceSummary();
		// Phase: Wire remaining 64 - Load additional API stats
		void loadKgStats();
		void loadPatternPerformance();
		startPolling();
	});

	onDestroy(() => {
		stopPolling();
	});
</script>

<div class="mx-auto w-full max-w-3xl p-4" dir="rtl">
	<h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
		כלי פיתוח / Developer Tools
	</h1>
	<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
		מסך תפעול פנימי למערכת single-admin. Includes memory ops and health checks.
	</p>

	<div class="mt-4 grid gap-4">
		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Memory Stats</h2>
				<button
					type="button"
					class="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"
					onclick={loadStats}
					disabled={loadingStats}
				>
					רענן / Refresh
				</button>
			</div>
			<pre class="mt-2 overflow-auto rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-900"><code
					>{JSON.stringify(stats, null, 2)}</code
				></pre>
		</div>

		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Operations</h2>
			<div class="mt-3 flex flex-wrap gap-2">
				<button
					class="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
					type="button"
					onclick={promoteNow}
				>
					Promote Now
				</button>
				<button
					class="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
					type="button"
					onclick={reindexStart}
				>
					Reindex
				</button>
				<button
					class="rounded-md bg-gray-700 px-3 py-1.5 text-sm text-white hover:bg-gray-600"
					type="button"
					onclick={reindexPause}
				>
					Pause Reindex
				</button>
				<button
					class="rounded-md bg-orange-600 px-3 py-1.5 text-sm text-white hover:bg-orange-700"
					type="button"
					onclick={consistencyCheck}
				>
					Consistency Check
				</button>
				<button
					class="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"
					type="button"
					onclick={() => (polling ? stopPolling() : startPolling())}
				>
					{polling ? "עצור Polling" : "הפעל Polling"}
				</button>
			</div>
			<div class="mt-3">
				<div class="text-xs text-gray-500 dark:text-gray-400">Reindex progress</div>
				<pre class="mt-1 overflow-auto rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-900"><code
						>{JSON.stringify(reindexProgress, null, 2)}</code
					></pre>
			</div>
		</div>

		<!-- Phase: Wire remaining 64 - MCP Circuit Breakers Panel -->
		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
					MCP Circuit Breakers
				</h2>
				<div class="flex gap-2">
					<button
						type="button"
						class="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"
						onclick={loadMcpCircuitBreakers}
						disabled={mcpCircuitLoading}
					>
						רענן
					</button>
					<button
						type="button"
						class="rounded-md bg-orange-600 px-2 py-1 text-xs text-white hover:bg-orange-700"
						onclick={resetMcpCircuitBreakers}
					>
						Reset All
					</button>
				</div>
			</div>
			<pre class="mt-2 overflow-auto rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-900"><code
					>{JSON.stringify(mcpCircuitBreakers, null, 2)}</code
				></pre>
		</div>

		<!-- Phase: Wire remaining 64 - Embedding Circuit Breaker Panel -->
		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
					Embedding Service Circuit Breaker
				</h2>
				<div class="flex gap-2">
					<button
						type="button"
						class="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"
						onclick={loadEmbeddingCircuitBreaker}
						disabled={embeddingCircuitLoading}
					>
						רענן
					</button>
					<button
						type="button"
						class="rounded-md bg-orange-600 px-2 py-1 text-xs text-white hover:bg-orange-700"
						onclick={resetEmbeddingCircuitBreaker}
					>
						Reset
					</button>
				</div>
			</div>
			{#if embeddingCircuitBreaker}
				<div class="mt-2 flex flex-wrap gap-2">
					<span
						class="rounded-full px-2 py-0.5 text-xs font-medium
							{embeddingCircuitBreaker.isOperational ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}"
					>
						{embeddingCircuitBreaker.isOperational ? "Operational" : "Down"}
					</span>
					{#if embeddingCircuitBreaker.isDegradedMode}
						<span
							class="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
						>
							Degraded Mode
						</span>
					{/if}
					{#if embeddingCircuitBreaker.embeddingServiceHealthy}
						<span
							class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
						>
							Service Healthy
						</span>
					{/if}
				</div>
			{/if}
			<pre class="mt-2 overflow-auto rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-900"><code
					>{JSON.stringify(embeddingCircuitBreaker, null, 2)}</code
				></pre>
		</div>

		<!-- Phase: Wire remaining 64 - Performance Monitor Panel -->
		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
					MCP Performance Monitor
				</h2>
				<div class="flex gap-2">
					<button
						type="button"
						class="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"
						onclick={loadPerformanceSummary}
						disabled={performanceLoading}
					>
						רענן
					</button>
					<button
						type="button"
						class="rounded-md bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
						onclick={clearPerformanceMetrics}
					>
						Clear Metrics
					</button>
				</div>
			</div>
			<pre class="mt-2 overflow-auto rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-900"><code
					>{JSON.stringify(performanceSummary, null, 2)}</code
				></pre>
		</div>

		<!-- Phase: Wire remaining 64 - Knowledge Graph Stats Panel -->
		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
					Knowledge Graph Stats
				</h2>
				<div class="flex gap-2">
					<button
						type="button"
						class="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"
						onclick={loadKgStats}
						disabled={kgStatsLoading}
					>
						רענן
					</button>
					<button
						type="button"
						class="rounded-md bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-700"
						onclick={runKgBackfill}
					>
						Backfill KG
					</button>
				</div>
			</div>
			<pre class="mt-2 overflow-auto rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-900"><code
					>{JSON.stringify(kgStats, null, 2)}</code
				></pre>
		</div>

		<!-- Phase: Wire remaining 64 - Pattern Performance Panel -->
		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
					Pattern Performance
				</h2>
				<button
					type="button"
					class="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"
					onclick={loadPatternPerformance}
					disabled={patternLoading}
				>
					רענן
				</button>
			</div>
			<pre class="mt-2 overflow-auto rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-900"><code
					>{JSON.stringify(patternPerformance, null, 2)}</code
				></pre>
		</div>

		<!-- Phase: Wire remaining 64 - Memory Maintenance Panel -->
		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Memory Maintenance</h2>
			<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
				פעולות תחזוקה למערכת הזיכרון
			</p>
			<div class="mt-3 flex flex-wrap gap-2">
				<button
					class="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
					type="button"
					onclick={runSanitize}
				>
					Sanitize Data
				</button>
				<button
					class="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
					type="button"
					onclick={runCleanup}
				>
					Cleanup Stale
				</button>
			</div>
		</div>

		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Graph Timings</h2>
				<button
					type="button"
					class="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"
					onclick={loadGraphTimings}
					disabled={graphLoading}
				>
					רענן / Refresh
				</button>
			</div>
			<pre class="mt-2 overflow-auto rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-900"><code
					>{JSON.stringify(graphMeta, null, 2)}</code
				></pre>
		</div>

		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
					API Timings History (last 20)
				</h2>
				<button
					type="button"
					class="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"
					onclick={() => (apiTimings = [])}
					disabled={apiTimings.length === 0}
				>
					נקה / Clear
				</button>
			</div>
			<div class="mt-2 max-h-48 overflow-auto rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-900">
				{#if apiTimings.length === 0}
					<div class="text-gray-500 dark:text-gray-400">No calls yet</div>
				{:else}
					{#each apiTimings as t}
						<div
							class="flex items-start justify-between gap-3 font-mono text-gray-700 dark:text-gray-200"
						>
							<div class="min-w-0 flex-1">
								<div class="truncate">{t.name}</div>
								<div class="text-[11px] text-gray-500 dark:text-gray-400">{t.at}</div>
								{#if t.meta}
									<div class="text-[11px] text-gray-500 dark:text-gray-400">
										{JSON.stringify(t.meta)}
									</div>
								{/if}
							</div>
							<div class="shrink-0 text-right">
								<div>{Math.round(t.wall_ms)}ms</div>
								<div class="text-[11px] text-gray-500 dark:text-gray-400">
									{t.server_ms === null ? "-" : `${Math.round(t.server_ms)}ms`}
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Retrieval Timings</h2>
			<div class="mt-3">
				<RetrievalLatencyPanel />
			</div>
		</div>

		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="flex items-center justify-between gap-3">
				<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Search Debug Timings</h2>
				<div class="flex items-center gap-2">
					<input
						class="w-64 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
						bind:value={searchQuery}
						placeholder="query"
					/>
					<button
						type="button"
						class="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
						onclick={runMemorySearch}
						disabled={searchLoading || searchQuery.trim().length === 0}
					>
						Run
					</button>
				</div>
			</div>
			<pre class="mt-2 overflow-auto rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-900"><code
					>{JSON.stringify(searchDebug, null, 2)}</code
				></pre>
		</div>

		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Ops Log</h2>
			<div class="mt-2 max-h-64 overflow-auto rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-900">
				{#each opsLog as line}
					<div class="font-mono text-gray-700 dark:text-gray-200">{line}</div>
				{/each}
			</div>
		</div>
	</div>
</div>
