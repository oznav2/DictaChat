<script lang="ts">
	import { base } from "$app/paths";
	import { onMount, onDestroy } from "svelte";
	import RetrievalLatencyPanel from "$lib/components/memory/RetrievalLatencyPanel.svelte";

	let stats = $state<Record<string, unknown> | null>(null);
	let loadingStats = $state(false);
	let opsLog = $state<string[]>([]);

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
				body: JSON.stringify({ query: searchQuery, tier: "all", sortBy: "relevance", limit: 10, offset: 0 }),
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
						<div class="flex items-start justify-between gap-3 font-mono text-gray-700 dark:text-gray-200">
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
