<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { browser } from "$app/environment";
	import { base } from "$app/paths";
	import { memoryUi } from "$lib/stores/memoryUi";
	import * as d3 from "d3";
	import { apiRequest } from "$lib/utils/apiClient";

	type ConceptType = "routing" | "content" | "action";
	type TimeFilter = "all" | "today" | "week" | "session";
	type SortOption = "hybrid" | "recent" | "oldest";
	type ViewMode = "list" | "graph";
	type GraphMode = "both" | "content" | "routing";

	type ActionRollup = {
		label: string;
		action: string;
		context_type: string;
		tier_key: string;
		uses: number;
		success_rate: number;
		wilson_score: number;
		last_used_at: string | null;
	};

	interface GraphNode {
		id: string;
		concept: string;
		type: "routing" | "content" | "action";
		score: number;
		usage: number;
		x?: number;
		y?: number;
		fx?: number | null;
		fy?: number | null;
	}

	interface GraphEdge {
		source: string;
		target: string;
		weight: number;
	}

	interface Concept {
		id: string;
		concept: string;
		type: ConceptType;
		usage_count: number;
		success_rate: number;
		last_used: string;
		related_concepts?: string[];
		outcomes?: {
			positive: number;
			negative: number;
			partial: number;
		};
	}

	let timeFilter = $state<TimeFilter>("all");
	let sortBy = $state<SortOption>("hybrid");
	let concepts = $state<Concept[]>([]);
	let isLoading = $state(false);
	let selectedConcept = $state<Concept | null>(null);
	type ConceptDefinitionResponse = {
		success: true;
		concept: { id: string; label: string; type: string };
		definition: {
			stats?: Record<string, string | number | boolean | null>;
			related?: {
				memories?: Array<{ text_preview: string }>;
			};
		};
	};

	let selectedConceptDefinition = $state<ConceptDefinitionResponse | null>(null);
	let definitionLoading = $state(false);
	let definitionError = $state<string | null>(null);
	let viewMode = $state<ViewMode>("list");
	let graphMode = $state<GraphMode>("both");
	let graphNodes = $state<GraphNode[]>([]);
	let graphEdges = $state<GraphEdge[]>([]);
	let actionRollups = $state<ActionRollup[]>([]);
	let actionRollupsIncludeTiers = $state(false);
	let actionRollupsLoading = $state(false);
	let svgWidth = $state(300);
	let svgHeight = $state(300);
	let svgElement = $state<SVGSVGElement | null>(null);
	let simulation: d3.Simulation<GraphNode, GraphEdge> | null = null;
	let memoryUpdatedHandler: (() => void) | null = null;

	// Get active concepts from the store
	let activeConcepts = $derived($memoryUi.data.activeConcepts);

	const GRAPH_MODE_STORAGE_KEY = "kgGraphMode";

	const typeColors: Record<ConceptType, { bg: string; text: string; border: string }> = {
		routing: {
			bg: "bg-blue-100 dark:bg-blue-900/30",
			text: "text-blue-700 dark:text-blue-300",
			border: "border-blue-300 dark:border-blue-700",
		},
		content: {
			bg: "bg-green-100 dark:bg-green-900/30",
			text: "text-green-700 dark:text-green-300",
			border: "border-green-300 dark:border-green-700",
		},
		action: {
			bg: "bg-orange-100 dark:bg-orange-900/30",
			text: "text-orange-700 dark:text-orange-300",
			border: "border-orange-300 dark:border-orange-700",
		},
	};

	const typeLabels: Record<ConceptType, string> = {
		routing: "ניתוב",
		content: "תוכן",
		action: "פעולה",
	};

	const timeFilterLabels: Record<TimeFilter, string> = {
		all: "הכל",
		today: "היום",
		week: "השבוע",
		session: "סשן",
	};

	const sortLabels: Record<SortOption, string> = {
		hybrid: "ציון משולב",
		recent: "עדכניות",
		oldest: "ישן ביותר",
	};

	const graphModeLabels: Record<GraphMode, string> = {
		both: "משולב",
		content: "תוכן",
		routing: "ניתוב",
	};

	const contextTypeLabels: Record<string, string> = {
		general: "כללי",
		coding_help: "עזרה בקוד",
		web_search: "חיפוש ברשת",
		doc_rag: "מסמכים",
		datagov: "Data.gov",
		debugging: "דיבאג",
		docker: "דוקר",
		memory_management: "ניהול זיכרון",
	};

	function formatContextType(contextType: string): string {
		const he = contextTypeLabels[contextType];
		return he ? `${he} / ${contextType}` : contextType;
	}

	function getSuccessColor(rate: number): string {
		if (rate >= 0.7) return "text-green-600 dark:text-green-400";
		if (rate >= 0.4) return "text-yellow-600 dark:text-yellow-400";
		return "text-red-600 dark:text-red-400";
	}

	function formatTimeAgo(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / (1000 * 60));

		if (diffMins < 1) return "עכשיו";
		if (diffMins < 60) return `לפני ${diffMins} דקות`;
		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `לפני ${diffHours} שעות`;
		const diffDays = Math.floor(diffHours / 24);
		return `לפני ${diffDays} ימים`;
	}

	async function loadConcepts() {
		isLoading = true;
		try {
			const params = new URLSearchParams({
				time_filter: timeFilter,
				sort_by: sortBy,
				limit: "50",
			});
			const response = await fetch(`${base}/api/memory/kg?${params}`);
			if (!response.ok) throw new Error(`Failed to load concepts: ${response.status}`);
			const data = (await response.json()) as Record<string, unknown>;

			type RawConcept = Record<string, unknown>;
			const rawRouting = (Array.isArray(data.concepts) ? data.concepts : []) as RawConcept[];
			const rawActions = (
				Array.isArray(data.actionEffectiveness) ? data.actionEffectiveness : []
			) as RawConcept[];

			const mappedRouting: Concept[] = rawRouting.map((c) => ({
				id: String(c.concept_id ?? c.concept ?? c.label ?? "unknown"),
				concept: String(c.concept ?? c.label ?? c.concept_id ?? "Unknown"),
				type: "routing",
				usage_count: Number(c.usage_count ?? c.uses ?? 0),
				success_rate: Number(c.success_rate ?? c.wilson_score ?? 0.5),
				last_used: String(c.last_used ?? new Date(0).toISOString()),
				related_concepts: Array.isArray(c.related_concepts)
					? c.related_concepts.map((v) => String(v))
					: undefined,
				outcomes:
					c.outcomes && typeof c.outcomes === "object"
						? (c.outcomes as Concept["outcomes"])
						: undefined,
			}));

			const mappedActions: Concept[] = rawActions.map((a) => ({
				id: `action_${String(a.context_type ?? "general")}_${String(a.action ?? a.action_key ?? "Unknown")}`,
				concept: String(a.action ?? a.action_key ?? "Unknown"),
				type: "action",
				usage_count: Number(a.uses ?? a.total_uses ?? 0),
				success_rate: Number(a.success_rate ?? a.wilson_score ?? 0.5),
				last_used: String(a.last_used ?? new Date(0).toISOString()),
			}));

			concepts = [...mappedRouting, ...mappedActions];
		} catch (err) {
			console.error("Failed to load concepts:", err);
			concepts = [];
		} finally {
			isLoading = false;
		}
	}

	function selectConcept(concept: Concept) {
		const next = selectedConcept?.id === concept.id ? null : concept;
		selectedConcept = next;
		selectedConceptDefinition = null;
		definitionError = null;
		if (next) {
			loadConceptDefinition(next);
		} else {
			definitionLoading = false;
		}
	}

	async function loadConceptDefinition(concept: Concept) {
		definitionLoading = true;
		definitionError = null;

		try {
			const idForFetch =
				concept.type === "routing"
					? concept.id.startsWith("routing_")
						? concept.id
						: `routing_${concept.id}`
					: concept.id;
			const data = await apiRequest<unknown>(
				`${base}/api/memory/kg/concept/${encodeURIComponent(idForFetch)}/definition`,
				{ retries: 1, timeoutMs: 6000 }
			);
			const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
			if (!rec || rec.success !== true) {
				const msg =
					rec && typeof rec.error === "string" ? rec.error : "Failed to load concept definition";
				throw new Error(msg);
			}
			selectedConceptDefinition = data as ConceptDefinitionResponse;
		} catch (err) {
			definitionError = err instanceof Error ? err.message : "Failed to load concept definition";
			selectedConceptDefinition = null;
		} finally {
			definitionLoading = false;
		}
	}

	async function loadGraphData() {
		try {
			// Stop any existing simulation
			if (simulation) {
				simulation.stop();
				simulation = null;
			}

			const params = new URLSearchParams({ mode: graphMode });
			const response = await fetch(`${base}/api/memory/graph?${params}`);
			if (!response.ok) throw new Error(`Failed to load graph: ${response.status}`);
			const data = await response.json();

			const nodes: GraphNode[] = (data.nodes || []).map((node: GraphNode) => ({
				...node,
				x: svgWidth / 2 + (Math.random() - 0.5) * 100,
				y: svgHeight / 2 + (Math.random() - 0.5) * 100,
			}));

			const edges: GraphEdge[] = data.edges || [];

			graphNodes = nodes;
			graphEdges = edges;

			// Create D3 force simulation
			if (nodes.length > 0) {
				simulation = d3
					.forceSimulation<GraphNode>(nodes)
					.force(
						"link",
						d3
							.forceLink<GraphNode, GraphEdge>(edges)
							.id((d) => d.id)
							.distance(80)
							.strength((d) => Math.min(1, d.weight * 0.5))
					)
					.force("charge", d3.forceManyBody().strength(-120))
					.force("center", d3.forceCenter(svgWidth / 2, svgHeight / 2))
					.force(
						"collision",
						d3.forceCollide<GraphNode>().radius((d) => getNodeRadius(d.score) + 5)
					)
					.on("tick", () => {
						// Update node positions reactively
						graphNodes = [...nodes];
					});

				// Run simulation for a bit then slow down
				simulation.alpha(1).restart();
			}
		} catch (err) {
			console.error("Failed to load graph:", err);
			graphNodes = [];
			graphEdges = [];
		}
	}

	async function loadActionRollups() {
		actionRollupsLoading = true;
		try {
			const params = new URLSearchParams({
				limit: "25",
				include_tiers: String(actionRollupsIncludeTiers),
			});
			const res = await fetch(`${base}/api/memory/kg/action-rollups?${params}`);
			if (!res.ok) throw new Error(`Failed to load action rollups: ${res.status}`);
			const data = (await res.json()) as any;
			const rollups = Array.isArray(data?.rollups) ? data.rollups : [];
			actionRollups = rollups.map((r: any) => ({
				label: String(r.label ?? ""),
				action: String(r.action ?? ""),
				context_type: String(r.context_type ?? "general"),
				tier_key: String(r.tier_key ?? "*"),
				uses: Number(r.uses ?? 0),
				success_rate: Number(r.success_rate ?? 0.5),
				wilson_score: Number(r.wilson_score ?? 0.5),
				last_used_at: typeof r.last_used_at === "string" ? r.last_used_at : null,
			}));
		} catch (err) {
			console.error("Failed to load action rollups:", err);
			actionRollups = [];
		} finally {
			actionRollupsLoading = false;
		}
	}

	function stopSimulation() {
		if (simulation) {
			simulation.stop();
			simulation = null;
		}
	}

	function handleNodeDragStart(event: MouseEvent, node: GraphNode) {
		if (!simulation) return;
		simulation.alphaTarget(0.3).restart();
		node.fx = node.x;
		node.fy = node.y;
	}

	function handleNodeDrag(event: MouseEvent, node: GraphNode) {
		if (!svgElement) return;
		const rect = svgElement.getBoundingClientRect();
		node.fx = event.clientX - rect.left;
		node.fy = event.clientY - rect.top;
		graphNodes = [...graphNodes];
	}

	function handleNodeDragEnd(event: MouseEvent, node: GraphNode) {
		if (!simulation) return;
		simulation.alphaTarget(0);
		node.fx = null;
		node.fy = null;
	}

	function getNodeById(id: string): GraphNode | undefined {
		return graphNodes.find((n) => n.id === id);
	}

	function getNodeColor(type: "routing" | "content" | "action"): string {
		if (type === "routing") return "#3B82F6";
		if (type === "content") return "#22C55E";
		return "#F97316";
	}

	function getNodeRadius(score: number): number {
		return 8 + score * 12;
	}

	function isActive(concept: string): boolean {
		return activeConcepts.includes(concept);
	}

	onMount(() => {
		loadConcepts();
		loadActionRollups();
		if (browser) {
			const saved = window.localStorage.getItem(GRAPH_MODE_STORAGE_KEY);
			if (saved === "both" || saved === "content" || saved === "routing") {
				graphMode = saved;
			}
		}

		if (browser) {
			const handler = () => {
				loadConcepts();
				loadActionRollups();
				if (viewMode === "graph") loadGraphData();
			};
			memoryUpdatedHandler = handler;
			window.addEventListener("memoryUpdated", handler);
		}
	});

	onDestroy(() => {
		stopSimulation();
		if (browser && memoryUpdatedHandler) {
			window.removeEventListener("memoryUpdated", memoryUpdatedHandler);
			memoryUpdatedHandler = null;
		}
	});

	$effect(() => {
		// Re-fetch when filters change
		if (timeFilter || sortBy) {
			loadConcepts();
		}
	});

	$effect(() => {
		// Load graph data when switching to graph view
		if (viewMode === "graph") {
			loadGraphData();
		} else {
			stopSimulation();
		}
	});

	$effect(() => {
		if (browser) {
			window.localStorage.setItem(GRAPH_MODE_STORAGE_KEY, graphMode);
		}
		if (viewMode === "graph") {
			loadGraphData();
		}
	});

	$effect(() => {
		actionRollupsIncludeTiers;
		loadActionRollups();
	});
</script>

<div class="flex h-full flex-col gap-3 p-3" dir="rtl">
	<!-- Active Concepts Strip -->
	{#if activeConcepts.length > 0}
		<div
			class="rounded-lg border border-blue-200 bg-blue-50 p-2 dark:border-blue-800 dark:bg-blue-900/30"
		>
			<div class="mb-1.5 text-xs font-medium text-blue-700 dark:text-blue-300">מושגים פעילים</div>
			<div class="flex flex-wrap gap-1.5">
				{#each activeConcepts.slice(0, 8) as concept}
					<button
						type="button"
						onclick={() => {
							const found = concepts.find((c) => c.concept === concept);
							if (found) selectConcept(found);
						}}
						class="rounded-full bg-blue-200 px-2 py-0.5 text-xs text-blue-800 transition-colors hover:bg-blue-300 dark:bg-blue-800 dark:text-blue-200 dark:hover:bg-blue-700"
						aria-label="בחר מושג {concept}"
					>
						{concept}
					</button>
				{/each}
				{#if activeConcepts.length > 8}
					<span class="px-1 text-xs text-blue-500">+{activeConcepts.length - 8}</span>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Filter Controls -->
	<div class="flex items-center gap-2">
		<select
			bind:value={graphMode}
			class="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
			title="מצב גרף: ניתוב / תוכן / משולב"
			aria-label="מצב גרף"
		>
			{#each Object.entries(graphModeLabels) as [value, label]}
				<option {value}>{label}</option>
			{/each}
		</select>

		<select
			bind:value={timeFilter}
			class="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
		>
			{#each Object.entries(timeFilterLabels) as [value, label]}
				<option {value}>{label}</option>
			{/each}
		</select>

		<select
			bind:value={sortBy}
			class="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
		>
			{#each Object.entries(sortLabels) as [value, label]}
				<option {value}>{label}</option>
			{/each}
		</select>

		<button
			type="button"
			onclick={loadConcepts}
			class="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-600"
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

		<!-- View Mode Toggle -->
		<button
			type="button"
			onclick={() => (viewMode = viewMode === "list" ? "graph" : "list")}
			class={[
				"rounded p-1.5 transition-colors",
				viewMode === "graph"
					? "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400"
					: "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-600",
			]}
			title={viewMode === "list" ? "הצג גרף" : "הצג רשימה"}
			aria-label={viewMode === "list" ? "הצג גרף" : "הצג רשימה"}
		>
			{#if viewMode === "list"}
				<!-- Graph icon -->
				<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<circle cx="5" cy="12" r="2" stroke-width="2" />
					<circle cx="19" cy="6" r="2" stroke-width="2" />
					<circle cx="19" cy="18" r="2" stroke-width="2" />
					<path stroke-linecap="round" stroke-width="2" d="M7 11l10-4M7 13l10 4" />
				</svg>
			{:else}
				<!-- List icon -->
				<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 6h16M4 12h16M4 18h16"
					/>
				</svg>
			{/if}
		</button>
	</div>

	<!-- Concept List / Graph -->
	<div class="flex-1 overflow-y-auto">
		{#if isLoading}
			<div class="flex items-center justify-center py-8">
				<div
					class="size-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"
				></div>
			</div>
		{:else if viewMode === "graph"}
			<!-- Graph View -->
			<div class="flex h-full items-center justify-center">
				{#if graphNodes.length === 0}
					<div class="text-center text-sm text-gray-500 dark:text-gray-400">אין נתונים לגרף</div>
				{:else}
					<svg
						bind:this={svgElement}
						width={svgWidth}
						height={svgHeight}
						class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-800"
					>
						<!-- Edges -->
						{#each graphEdges as edge}
							{@const sourceNode = getNodeById(edge.source)}
							{@const targetNode = getNodeById(edge.target)}
							{#if sourceNode?.x && sourceNode?.y && targetNode?.x && targetNode?.y}
								<line
									x1={sourceNode.x}
									y1={sourceNode.y}
									x2={targetNode.x}
									y2={targetNode.y}
									stroke="#9CA3AF"
									stroke-width={Math.max(1, edge.weight * 2)}
									stroke-opacity="0.5"
								/>
							{/if}
						{/each}

						<!-- Nodes -->
						{#each graphNodes as node}
							{#if node.x && node.y}
								<g
									class="cursor-grab active:cursor-grabbing"
									transform="translate({node.x}, {node.y})"
									onmousedown={(e) => handleNodeDragStart(e, node)}
									onmousemove={(e) => e.buttons === 1 && handleNodeDrag(e, node)}
									onmouseup={(e) => handleNodeDragEnd(e, node)}
									onmouseleave={(e) => e.buttons === 1 && handleNodeDragEnd(e, node)}
									onclick={() =>
										selectConcept({
											id: node.id,
											concept: node.concept,
											type: node.type,
											usage_count: node.usage,
											success_rate: node.score,
											last_used: new Date().toISOString(),
										})}
									onkeydown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											selectConcept({
												id: node.id,
												concept: node.concept,
												type: node.type,
												usage_count: node.usage,
												success_rate: node.score,
												last_used: new Date().toISOString(),
											});
										}
									}}
									role="button"
									tabindex="0"
								>
									<circle
										r={getNodeRadius(node.score)}
										fill={getNodeColor(node.type)}
										fill-opacity="0.8"
										stroke={getNodeColor(node.type)}
										stroke-width="2"
										class="transition-all hover:stroke-white hover:stroke-[3]"
									/>
									<text
										y={getNodeRadius(node.score) + 12}
										text-anchor="middle"
										class="pointer-events-none select-none fill-gray-600 text-[10px] dark:fill-gray-300"
									>
										{node.concept.length > 10 ? node.concept.slice(0, 10) + "..." : node.concept}
									</text>
								</g>
							{/if}
						{/each}
					</svg>
				{/if}
			</div>

			<!-- Graph Legend -->
			<div
				class="mt-2 flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400"
			>
				<div class="flex items-center gap-1">
					<span class="size-3 rounded-full bg-blue-500"></span>
					<span>ניתוב</span>
				</div>
				<div class="flex items-center gap-1">
					<span class="size-3 rounded-full bg-green-500"></span>
					<span>תוכן</span>
				</div>
				<div class="flex items-center gap-1">
					<span class="size-3 rounded-full bg-orange-500"></span>
					<span>פעולה</span>
				</div>
			</div>
		{:else if concepts.length === 0}
			<div class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">אין מושגים להצגה</div>
		{:else}
			<div class="flex flex-col gap-2">
				<div class="rounded-lg border border-gray-200 bg-white p-2.5 dark:border-gray-600 dark:bg-gray-700">
					<div class="mb-2 flex items-center justify-between">
						<div class="text-xs font-medium text-gray-700 dark:text-gray-200">
							סיכום יעילות פעולות
						</div>
						<label class="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-300">
							<input type="checkbox" bind:checked={actionRollupsIncludeTiers} />
							<span>לפי שכבה</span>
						</label>
					</div>

					{#if actionRollupsLoading}
						<div class="text-xs text-gray-500 dark:text-gray-400">טוען…</div>
					{:else if actionRollups.length === 0}
						<div class="text-xs text-gray-500 dark:text-gray-400">אין נתונים</div>
					{:else}
						<div class="space-y-1">
							{#each actionRollups.slice(0, 8) as r}
								<div class="flex items-center justify-between gap-2 text-xs">
									<div class="min-w-0">
										<div class="truncate font-medium text-gray-800 dark:text-gray-100">
											{r.action}
											<span class="text-gray-500 dark:text-gray-400">
												@{formatContextType(r.context_type)}{r.tier_key !== "*" ? ` → ${r.tier_key}` : ""}
											</span>
										</div>
										<div class="text-[11px] text-gray-500 dark:text-gray-400">
											שימושים: {r.uses}
											{r.last_used_at ? ` · ${formatTimeAgo(r.last_used_at)}` : ""}
										</div>
									</div>
									<div class="shrink-0 text-right">
										<div class={getSuccessColor(r.success_rate)}>
											{(r.success_rate * 100).toFixed(0)}%
										</div>
										<div class="text-[11px] text-gray-400">W: {r.wilson_score.toFixed(2)}</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				{#each concepts as concept}
					<button
						type="button"
						onclick={() => selectConcept(concept)}
						class={[
							"w-full rounded-lg border p-2.5 text-right transition-colors",
							isActive(concept.concept)
								? "border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20"
								: "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600",
							selectedConcept?.concept === concept.concept && "ring-2 ring-blue-500",
						]}
					>
						<!-- Header -->
						<div class="mb-1.5 flex items-center gap-2">
							<span
								class={[
									"rounded px-1.5 py-0.5 text-xs font-medium",
									typeColors[concept.type].bg,
									typeColors[concept.type].text,
								]}
							>
								{typeLabels[concept.type]}
							</span>
							<span class="text-sm font-medium text-gray-800 dark:text-gray-100">
								{concept.concept}
							</span>
							{#if isActive(concept.concept)}
								<span class="mr-auto size-2 rounded-full bg-blue-500"></span>
							{/if}
						</div>

						<!-- Stats Row -->
						<div class="flex items-center gap-3 text-xs">
							<span class="text-gray-500 dark:text-gray-400">
								שימושים: {concept.usage_count}
							</span>
							<span class={getSuccessColor(concept.success_rate)}>
								הצלחה: {(concept.success_rate * 100).toFixed(0)}%
							</span>
							<span class="mr-auto text-gray-400">
								{formatTimeAgo(concept.last_used)}
							</span>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Selected Concept Detail -->
	{#if selectedConcept}
		<div
			class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700/50"
		>
			<div class="mb-2 flex items-center justify-between">
				<h4 class="text-sm font-medium text-gray-800 dark:text-gray-100">
					{selectedConcept.concept}
				</h4>
				<button
					type="button"
					onclick={() => {
						selectedConcept = null;
						selectedConceptDefinition = null;
						definitionError = null;
					}}
					class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
					aria-label="סגור פרטי מושג"
				>
					<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<!-- Outcomes Breakdown -->
			{#if selectedConcept.outcomes}
				<div class="mb-2 grid grid-cols-3 gap-2 text-center">
					<div class="rounded bg-green-100 p-1.5 dark:bg-green-900/30">
						<div class="text-lg font-medium text-green-700 dark:text-green-300">
							{selectedConcept.outcomes.positive}
						</div>
						<div class="text-[10px] text-green-600 dark:text-green-400">חיובי</div>
					</div>
					<div class="rounded bg-yellow-100 p-1.5 dark:bg-yellow-900/30">
						<div class="text-lg font-medium text-yellow-700 dark:text-yellow-300">
							{selectedConcept.outcomes.partial}
						</div>
						<div class="text-[10px] text-yellow-600 dark:text-yellow-400">חלקי</div>
					</div>
					<div class="rounded bg-red-100 p-1.5 dark:bg-red-900/30">
						<div class="text-lg font-medium text-red-700 dark:text-red-300">
							{selectedConcept.outcomes.negative}
						</div>
						<div class="text-[10px] text-red-600 dark:text-red-400">שלילי</div>
					</div>
				</div>
			{/if}

			<!-- Related Concepts -->
			{#if selectedConcept.related_concepts && selectedConcept.related_concepts.length > 0}
				<div>
					<div class="mb-1 text-xs text-gray-500 dark:text-gray-400">מושגים קשורים:</div>
					<div class="flex flex-wrap gap-1">
						{#each selectedConcept.related_concepts.slice(0, 5) as related}
							<span
								class="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-600 dark:text-gray-300"
							>
								{related}
							</span>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Definition -->
			<div class="mt-3 border-t border-gray-200 pt-3 dark:border-gray-600">
				<div class="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">פרטים</div>

				{#if definitionError}
					<div class="text-xs text-red-600 dark:text-red-300">{definitionError}</div>
				{:else if definitionLoading}
					<div class="text-xs text-gray-500 dark:text-gray-400">טוען…</div>
				{:else if selectedConceptDefinition?.success}
					{#if selectedConceptDefinition?.definition?.stats}
						<div class="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
							{#each Object.entries(selectedConceptDefinition.definition.stats) as [k, v]}
								<div class="truncate">
									<span class="text-gray-500 dark:text-gray-400">{k}:</span>
									<span class="mr-1 font-medium">{String(v)}</span>
								</div>
							{/each}
						</div>
					{/if}

					{#if (selectedConceptDefinition?.definition?.related?.memories?.length ?? 0) > 0}
						<div class="mt-2">
							<div class="mb-1 text-xs text-gray-500 dark:text-gray-400">דוגמאות:</div>
							<div class="space-y-1">
								{#each selectedConceptDefinition?.definition?.related?.memories?.slice(0, 3) ?? [] as m}
									<div
										class="rounded bg-white p-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200"
									>
										{m.text_preview}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{:else}
					<div class="text-xs text-gray-500 dark:text-gray-400">אין פרטים נוספים</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
