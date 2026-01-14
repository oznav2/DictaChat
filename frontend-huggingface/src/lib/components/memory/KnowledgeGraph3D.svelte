<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { browser } from "$app/environment";
	import { base } from "$app/paths";
	import * as THREE from "three";

	type ConceptType = "routing" | "content" | "action" | "both";
	type TimeFilter = "all" | "today" | "week" | "session";
	type SortOption = "hybrid" | "recent" | "oldest";

	interface GraphNode {
		id: string;
		concept: string;
		type: ConceptType;
		score: number;
		usage: number;
		success_rate?: number;
		last_used?: string;
		created_at?: string;
		best_collection?: string;
	}

	interface GraphEdge {
		source: string;
		target: string;
		weight: number;
	}

	interface ConceptDefinition {
		id: string;
		label: string;
		type?: string;
		best_collection?: string;
		success_rate?: number;
		usage_count?: number;
		related_concepts?: string[];
		last_used?: string;
		created_at?: string;
		total_searches?: number;
		outcome_breakdown?: {
			worked: number;
			failed: number;
			partial: number;
		};
		collections_breakdown?: Record<
			string,
			{
				successes: number;
				failures: number;
				total: number;
			}
		>;
		related_concepts_with_stats?: Array<{
			concept: string;
			co_occurrence: number;
			success_together: number;
			failure_together: number;
			success_rate: number;
		}>;
	}

	interface Props {
		graphMode?: "both" | "content" | "routing";
		timeFilter?: TimeFilter;
		sortBy?: SortOption;
		onNodeSelect?: (node: GraphNode | null) => void;
	}

	let { graphMode = "both", timeFilter = "all", sortBy = "hybrid", onNodeSelect }: Props = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	let tooltipEl = $state<HTMLDivElement | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let graphNodes = $state<GraphNode[]>([]);
	let graphEdges = $state<GraphEdge[]>([]);
	let hoveredNode = $state<GraphNode | null>(null);
	let selectedNode = $state<GraphNode | null>(null);
	let selectedNodeDefinition = $state<ConceptDefinition | null>(null);
	let definitionLoading = $state(false);
	let tooltipPosition = $state({ x: 0, y: 0 });

	// 3D Force Graph instance
	let Graph: any = null;
	let graphInstance: any = null;

	// Node colors by type (hex numbers for Three.js)
	const nodeColors: Record<ConceptType, string> = {
		routing: "#3B82F6", // Blue
		content: "#22C55E", // Green
		action: "#F97316", // Orange
		both: "#A855F7", // Purple
	};

	const nodeColorsHex: Record<ConceptType, number> = {
		routing: 0x3b82f6,
		content: 0x22c55e,
		action: 0xf97316,
		both: 0xa855f7,
	};

	// Glow colors (lighter versions)
	const glowColors: Record<ConceptType, string> = {
		routing: "#60A5FA",
		content: "#4ADE80",
		action: "#FB923C",
		both: "#C084FC",
	};

	const glowColorsHex: Record<ConceptType, number> = {
		routing: 0x60a5fa,
		content: 0x4ade80,
		action: 0xfb923c,
		both: 0xc084fc,
	};

	async function loadGraphData() {
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({ mode: graphMode });
			const response = await fetch(`${base}/api/memory/graph?${params}`);
			if (!response.ok) throw new Error(`Failed to load graph: ${response.status}`);
			const data = await response.json();

			// Apply time filter
			let filteredNodes = (data.nodes || []) as GraphNode[];
			if (timeFilter !== "all") {
				const now = new Date();
				const sessionStart = new Date(sessionStorage.getItem("kg_session_start") || now.toISOString());

				filteredNodes = filteredNodes.filter((node: GraphNode) => {
					if (!node.last_used) return false;
					const lastUsed = new Date(node.last_used);

					if (timeFilter === "today") {
						return lastUsed.toDateString() === now.toDateString();
					} else if (timeFilter === "week") {
						const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
						return lastUsed >= weekAgo;
					} else if (timeFilter === "session") {
						return lastUsed >= sessionStart;
					}
					return true;
				});
			}

			// Apply sorting
			filteredNodes.sort((a: GraphNode, b: GraphNode) => {
				if (sortBy === "hybrid") {
					return (b.score || 0) - (a.score || 0);
				} else if (sortBy === "recent") {
					const aTime = a.last_used ? new Date(a.last_used).getTime() : 0;
					const bTime = b.last_used ? new Date(b.last_used).getTime() : 0;
					return bTime - aTime;
				} else if (sortBy === "oldest") {
					const aTime = a.created_at ? new Date(a.created_at).getTime() : Date.now();
					const bTime = b.created_at ? new Date(b.created_at).getTime() : Date.now();
					return aTime - bTime;
				}
				return 0;
			});

			// Take top 50 nodes for 3D visualization
			const topNodes = filteredNodes.slice(0, 50);
			const topNodeIds = new Set(topNodes.map((n: GraphNode) => n.id));

			// Filter edges
			const filteredEdges = (data.edges || []).filter(
				(edge: GraphEdge) => topNodeIds.has(edge.source) && topNodeIds.has(edge.target)
			);

			graphNodes = topNodes;
			graphEdges = filteredEdges;

			// Update the 3D graph
			if (graphInstance) {
				updateGraph();
			}
		} catch (err) {
			console.error("Failed to load graph:", err);
			error = err instanceof Error ? err.message : "Failed to load graph";
		} finally {
			isLoading = false;
		}
	}

	async function loadNodeDefinition(node: GraphNode) {
		definitionLoading = true;
		selectedNodeDefinition = null;

		try {
			const idForFetch = node.type === "routing" && !node.id.startsWith("routing_") ? `routing_${node.id}` : node.id;

			const response = await fetch(`${base}/api/memory/kg/concept/${encodeURIComponent(idForFetch)}/definition`);
			if (response.ok) {
				const data = await response.json();
				if (data.success) {
					selectedNodeDefinition = {
						id: node.id,
						label: node.concept,
						type: node.type,
						best_collection: data.best_collection || node.best_collection,
						success_rate: data.success_rate ?? node.success_rate,
						usage_count: data.usage_count ?? node.usage,
						related_concepts: data.related_concepts || [],
						last_used: data.last_used || node.last_used,
						created_at: data.created_at || node.created_at,
						total_searches: data.total_searches,
						outcome_breakdown: data.outcome_breakdown,
						collections_breakdown: data.collections_breakdown,
						related_concepts_with_stats: data.related_concepts_with_stats,
					};
				}
			}
		} catch (err) {
			console.error("Failed to load node definition:", err);
		} finally {
			definitionLoading = false;
		}
	}

	function updateGraph() {
		if (!graphInstance) return;

		// Transform data for 3d-force-graph
		const graphData = {
			nodes: graphNodes.map((node) => ({
				id: node.id,
				name: node.concept,
				type: node.type,
				score: node.score,
				usage: node.usage,
				success_rate: node.success_rate,
				best_collection: node.best_collection,
				val: Math.max(1, (node.score || 0.5) * 10), // Node size
			})),
			links: graphEdges.map((edge) => ({
				source: edge.source,
				target: edge.target,
				weight: edge.weight,
			})),
		};

		graphInstance.graphData(graphData);
	}

	async function initGraph() {
		if (!browser || !containerEl) return;

		try {
			// Dynamically import 3d-force-graph (browser-only)
			const ForceGraph3DModule = await import("3d-force-graph");
			Graph = ForceGraph3DModule.default;

			// Create the graph instance
			graphInstance = Graph()(containerEl)
				.backgroundColor("#0a0a0f")
				.width(containerEl.clientWidth)
				.height(containerEl.clientHeight)
				// Node styling
				.nodeColor((node: any) => nodeColors[node.type as ConceptType] || nodeColors.routing)
				.nodeOpacity(0.9)
				.nodeResolution(16)
				.nodeVal((node: any) => node.val)
				// Node labels
				.nodeLabel((node: any) => {
					const successRate = node.success_rate ? `${Math.round(node.success_rate * 100)}%` : "N/A";
					return `<div style="background: rgba(0,0,0,0.8); padding: 8px 12px; border-radius: 8px; border: 1px solid ${nodeColors[node.type as ConceptType] || "#3B82F6"};">
						<div style="font-weight: bold; color: ${nodeColors[node.type as ConceptType] || "#3B82F6"}; margin-bottom: 4px;">${node.name}</div>
						<div style="color: #9CA3AF; font-size: 11px;">Type: ${node.type}</div>
						<div style="color: #9CA3AF; font-size: 11px;">Success: ${successRate}</div>
						<div style="color: #9CA3AF; font-size: 11px;">Usage: ${node.usage || 0}x</div>
					</div>`;
				})
				// Link styling
				.linkColor(() => "rgba(100, 116, 139, 0.3)")
				.linkWidth((link: any) => Math.max(0.5, (link.weight || 0.5) * 2))
				.linkOpacity(0.6)
				.linkDirectionalParticles(2)
				.linkDirectionalParticleWidth(1.5)
				.linkDirectionalParticleSpeed(0.005)
				.linkDirectionalParticleColor(() => "#60A5FA")
				// Interaction
				.onNodeHover((node: any) => {
					if (containerEl) {
						containerEl.style.cursor = node ? "pointer" : "default";
					}
					hoveredNode = node
						? {
								id: node.id,
								concept: node.name,
								type: node.type,
								score: node.score,
								usage: node.usage,
								success_rate: node.success_rate,
								best_collection: node.best_collection,
							}
						: null;
				})
				.onNodeClick((node: any) => {
					if (node) {
						const graphNode: GraphNode = {
							id: node.id,
							concept: node.name,
							type: node.type,
							score: node.score,
							usage: node.usage,
							success_rate: node.success_rate,
							best_collection: node.best_collection,
						};
						selectedNode = graphNode;
						loadNodeDefinition(graphNode);
						onNodeSelect?.(graphNode);

						// Focus on node
						const distance = 120;
						const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
						graphInstance.cameraPosition(
							{ x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
							node,
							2000
						);
					}
				})
				.onBackgroundClick(() => {
					selectedNode = null;
					selectedNodeDefinition = null;
					onNodeSelect?.(null);
				})
				// Physics
				.d3AlphaDecay(0.02)
				.d3VelocityDecay(0.3)
				.warmupTicks(100)
				.cooldownTicks(200);

			// Add custom node rendering with glow effect
			graphInstance.nodeThreeObject((node: any) => {
				// Create a group to hold sphere and glow
				const group = new THREE.Group();

				// Calculate node radius based on score
				const nodeRadius = Math.max(2, Math.cbrt(node.val) * 2);

				// Main sphere with Phong shading for glossy look
				const geometry = new THREE.SphereGeometry(nodeRadius, 32, 32);
				const material = new THREE.MeshPhongMaterial({
					color: nodeColorsHex[node.type as ConceptType] || nodeColorsHex.routing,
					transparent: true,
					opacity: 0.95,
					shininess: 100,
					specular: 0x444444,
				});
				const sphere = new THREE.Mesh(geometry, material);
				group.add(sphere);

				// Inner glow effect (slightly larger, semi-transparent)
				const glowGeometry = new THREE.SphereGeometry(nodeRadius * 1.3, 32, 32);
				const glowMaterial = new THREE.MeshBasicMaterial({
					color: glowColorsHex[node.type as ConceptType] || glowColorsHex.routing,
					transparent: true,
					opacity: 0.2,
					side: THREE.BackSide,
				});
				const glow = new THREE.Mesh(glowGeometry, glowMaterial);
				group.add(glow);

				// Outer glow effect (even larger, more transparent)
				const outerGlowGeometry = new THREE.SphereGeometry(nodeRadius * 1.8, 32, 32);
				const outerGlowMaterial = new THREE.MeshBasicMaterial({
					color: glowColorsHex[node.type as ConceptType] || glowColorsHex.routing,
					transparent: true,
					opacity: 0.08,
					side: THREE.BackSide,
				});
				const outerGlow = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial);
				group.add(outerGlow);

				// Text sprite for label (floating above the node)
				const canvas = document.createElement("canvas");
				const ctx = canvas.getContext("2d");
				if (ctx) {
					canvas.width = 512;
					canvas.height = 128;
					ctx.clearRect(0, 0, canvas.width, canvas.height);

					// Background for better readability
					ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
					ctx.roundRect(10, 30, canvas.width - 20, 70, 12);
					ctx.fill();

					// Label text - Use system fonts with Hebrew support (Phase 6.1)
					ctx.font = "bold 36px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Hebrew', 'Heebo', sans-serif";
					ctx.fillStyle = "#ffffff";
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";

					// Phase 6.3: Defensive fallback for empty/missing node names
					const nodeName = node.name?.trim() || node.id || "Unknown";
					const label = nodeName.length > 15 ? nodeName.slice(0, 15) + "…" : nodeName;
					ctx.fillText(label, canvas.width / 2, canvas.height / 2);

					// Success rate indicator
					if (node.success_rate !== undefined) {
						const rate = Math.round(node.success_rate * 100);
						ctx.font = "20px Arial, sans-serif";
						ctx.fillStyle = rate >= 70 ? "#4ADE80" : rate >= 40 ? "#FBBF24" : "#F87171";
						ctx.fillText(`${rate}%`, canvas.width / 2, canvas.height / 2 + 28);
					}

					const texture = new THREE.CanvasTexture(canvas);
					texture.needsUpdate = true;
					const spriteMaterial = new THREE.SpriteMaterial({
						map: texture,
						transparent: true,
						depthTest: false,
					});
					const sprite = new THREE.Sprite(spriteMaterial);
					// Phase 6.2: Increased sprite scale for better visibility
					sprite.scale.set(32, 8, 1);
					sprite.position.set(0, nodeRadius + 8, 0);
					group.add(sprite);
				}

				return group;
			});

			// Add lighting to the scene
			const scene = graphInstance.scene();

			// Ambient light for overall illumination
			const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
			scene.add(ambientLight);

			// Key light (main light source)
			const keyLight = new THREE.PointLight(0xffffff, 1.2, 1000);
			keyLight.position.set(200, 200, 200);
			scene.add(keyLight);

			// Fill light (softer, from opposite side)
			const fillLight = new THREE.PointLight(0x4080ff, 0.6, 800);
			fillLight.position.set(-150, 50, -150);
			scene.add(fillLight);

			// Rim light (for edge definition)
			const rimLight = new THREE.PointLight(0x22c55e, 0.4, 600);
			rimLight.position.set(0, -200, 100);
			scene.add(rimLight);

			// Add subtle fog for depth perception
			scene.fog = new THREE.FogExp2(0x0a0a0f, 0.002);

			// Load initial data
			await loadGraphData();
		} catch (err) {
			console.error("Failed to initialize 3D graph:", err);
			error = "Failed to initialize 3D visualization";
		}
	}

	function handleResize() {
		if (graphInstance && containerEl) {
			graphInstance.width(containerEl.clientWidth).height(containerEl.clientHeight);
		}
	}

	function resetCamera() {
		if (graphInstance) {
			graphInstance.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 1000);
		}
	}

	function zoomIn() {
		if (graphInstance) {
			const pos = graphInstance.cameraPosition();
			const factor = 0.7;
			graphInstance.cameraPosition({ x: pos.x * factor, y: pos.y * factor, z: pos.z * factor }, undefined, 500);
		}
	}

	function zoomOut() {
		if (graphInstance) {
			const pos = graphInstance.cameraPosition();
			const factor = 1.4;
			graphInstance.cameraPosition({ x: pos.x * factor, y: pos.y * factor, z: pos.z * factor }, undefined, 500);
		}
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

	function getSuccessColor(rate: number): string {
		if (rate >= 0.7) return "text-green-400";
		if (rate >= 0.4) return "text-yellow-400";
		return "text-red-400";
	}

	onMount(() => {
		if (browser) {
			// Track session start
			if (!sessionStorage.getItem("kg_session_start")) {
				sessionStorage.setItem("kg_session_start", new Date().toISOString());
			}

			initGraph();
			window.addEventListener("resize", handleResize);
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener("resize", handleResize);
			if (graphInstance) {
				graphInstance._destructor?.();
			}
		}
	});

	// Reload when filters change
	$effect(() => {
		if (graphMode || timeFilter || sortBy) {
			if (graphInstance) {
				loadGraphData();
			}
		}
	});
</script>

<div class="relative h-full w-full overflow-hidden rounded-lg bg-[#0a0a0f]">
	<!-- 3D Graph Container -->
	<div bind:this={containerEl} class="h-full w-full"></div>

	<!-- Loading Overlay -->
	{#if isLoading}
		<div class="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
			<div class="flex flex-col items-center gap-3">
				<div class="size-10 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-500"></div>
				<span class="text-sm text-zinc-400">טוען גרף תלת-ממדי...</span>
			</div>
		</div>
	{/if}

	<!-- Error Display -->
	{#if error}
		<div class="absolute inset-0 flex items-center justify-center bg-black/50">
			<div class="rounded-lg bg-red-900/50 p-4 text-red-300">
				<p class="text-sm">{error}</p>
				<button onclick={() => loadGraphData()} class="mt-2 text-xs text-red-400 hover:text-red-300 underline">
					נסה שוב
				</button>
			</div>
		</div>
	{/if}

	<!-- Camera Controls -->
	<div class="absolute bottom-4 left-4 flex flex-col gap-2">
		<button
			onclick={zoomIn}
			class="flex size-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-300 backdrop-blur-sm transition-colors hover:bg-zinc-700"
			title="התקרב"
			aria-label="התקרב"
		>
			<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v12m6-6H6" />
			</svg>
		</button>
		<button
			onclick={zoomOut}
			class="flex size-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-300 backdrop-blur-sm transition-colors hover:bg-zinc-700"
			title="התרחק"
			aria-label="התרחק"
		>
			<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 12H6" />
			</svg>
		</button>
		<button
			onclick={resetCamera}
			class="flex size-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-300 backdrop-blur-sm transition-colors hover:bg-zinc-700"
			title="אפס מצלמה"
			aria-label="אפס מצלמה"
		>
			<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
				/>
			</svg>
		</button>
	</div>

	<!-- Legend -->
	<div class="absolute bottom-4 right-4 rounded-lg bg-zinc-900/80 p-3 backdrop-blur-sm" dir="rtl">
		<div class="mb-2 text-xs font-medium text-zinc-400">מקור ישות</div>
		<div class="flex flex-col gap-1.5 text-xs">
			<div class="flex items-center gap-2">
				<span class="size-3 rounded-full bg-blue-500"></span>
				<span class="text-zinc-300">ניתוב (Query)</span>
			</div>
			<div class="flex items-center gap-2">
				<span class="size-3 rounded-full bg-green-500"></span>
				<span class="text-zinc-300">תוכן (Memory)</span>
			</div>
			<div class="flex items-center gap-2">
				<span class="size-3 rounded-full bg-purple-500"></span>
				<span class="text-zinc-300">משולב (Both)</span>
			</div>
			<div class="flex items-center gap-2">
				<span class="size-3 rounded-full bg-orange-500"></span>
				<span class="text-zinc-300">פעולה (Action)</span>
			</div>
		</div>
	</div>

	<!-- Stats Counter -->
	<div class="absolute left-4 top-4 rounded-lg bg-zinc-900/80 px-3 py-2 backdrop-blur-sm">
		<div class="text-xs text-zinc-400">
			<span class="font-medium text-zinc-200">{graphNodes.length}</span> צמתים ·
			<span class="font-medium text-zinc-200">{graphEdges.length}</span> קשרים
		</div>
	</div>

	<!-- Instructions -->
	<div class="absolute right-4 top-4 rounded-lg bg-zinc-900/80 px-3 py-2 backdrop-blur-sm" dir="rtl">
		<div class="text-xs text-zinc-400">
			<span class="text-zinc-300">גרור</span> לסיבוב ·
			<span class="text-zinc-300">גלגל</span> לזום ·
			<span class="text-zinc-300">לחץ</span> על צומת לפרטים
		</div>
	</div>

	<!-- Selected Node Detail Panel -->
	{#if selectedNode}
		<div
			class="absolute left-4 top-16 w-72 rounded-xl bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-sm"
			dir="rtl"
		>
			<!-- Header -->
			<div class="mb-3 flex items-start justify-between">
				<div class="flex items-center gap-2">
					<span
						class="size-3 rounded-full"
						style="background-color: {nodeColors[selectedNode.type]}"
					></span>
					<h3 class="text-sm font-semibold text-zinc-100">{selectedNode.concept}</h3>
				</div>
				<button
					onclick={() => {
						selectedNode = null;
						selectedNodeDefinition = null;
						onNodeSelect?.(null);
					}}
					class="text-zinc-500 transition-colors hover:text-zinc-300"
					aria-label="סגור פרטי מושג"
				>
					<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Quick Stats -->
			<div class="mb-3 flex gap-2 text-xs">
				{#if selectedNode.success_rate !== undefined}
					<span class="rounded-md bg-zinc-800 px-2 py-1 {getSuccessColor(selectedNode.success_rate)}">
						הצלחה: {Math.round(selectedNode.success_rate * 100)}%
					</span>
				{/if}
				{#if selectedNode.usage}
					<span class="rounded-md bg-zinc-800 px-2 py-1 text-zinc-300">שימושים: {selectedNode.usage}x</span>
				{/if}
				{#if selectedNode.best_collection}
					<span class="rounded-md bg-zinc-800 px-2 py-1 text-zinc-300">{selectedNode.best_collection}</span>
				{/if}
			</div>

			<!-- Definition Loading/Content -->
			{#if definitionLoading}
				<div class="flex items-center justify-center py-4">
					<div class="size-5 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500"></div>
				</div>
			{:else if selectedNodeDefinition}
				<div class="space-y-3 text-xs">
					<!-- Outcome Breakdown -->
					{#if selectedNodeDefinition.outcome_breakdown}
						<div class="rounded-lg bg-zinc-800/50 p-2">
							<div class="mb-1.5 text-zinc-400">מעקב תוצאות</div>
							<div class="flex gap-3">
								<span class="text-green-400">✓ {selectedNodeDefinition.outcome_breakdown.worked}</span>
								<span class="text-red-400">✗ {selectedNodeDefinition.outcome_breakdown.failed}</span>
								{#if selectedNodeDefinition.outcome_breakdown.partial > 0}
									<span class="text-yellow-400">◐ {selectedNodeDefinition.outcome_breakdown.partial}</span>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Collections Breakdown -->
					{#if selectedNodeDefinition.collections_breakdown && Object.keys(selectedNodeDefinition.collections_breakdown).length > 0}
						<div class="rounded-lg bg-zinc-800/50 p-2">
							<div class="mb-1.5 text-zinc-400">אוספים</div>
							<div class="space-y-1">
								{#each Object.entries(selectedNodeDefinition.collections_breakdown).slice(0, 3) as [collection, data]}
									{@const total = data.successes + data.failures}
									{@const rate = total > 0 ? Math.round((data.successes / total) * 100) : 0}
									<div class="flex items-center justify-between">
										<span class="text-zinc-300">{collection}</span>
										<span class="text-zinc-500">{rate}% ({total})</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Related Concepts -->
					{#if selectedNodeDefinition.related_concepts_with_stats && selectedNodeDefinition.related_concepts_with_stats.length > 0}
						<div class="rounded-lg bg-zinc-800/50 p-2">
							<div class="mb-1.5 text-zinc-400">מושגים קשורים</div>
							<div class="flex flex-wrap gap-1">
								{#each selectedNodeDefinition.related_concepts_with_stats.slice(0, 5) as rel}
									<span class="rounded bg-zinc-700 px-1.5 py-0.5 text-zinc-300">{rel.concept}</span>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Timestamps -->
					{#if selectedNodeDefinition.last_used || selectedNodeDefinition.created_at}
						<div class="border-t border-zinc-800 pt-2 text-zinc-500">
							{#if selectedNodeDefinition.last_used}
								<div>שימוש אחרון: {formatTimeAgo(selectedNodeDefinition.last_used)}</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
