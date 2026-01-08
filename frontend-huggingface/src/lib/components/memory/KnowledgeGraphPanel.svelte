<script lang="ts">
	import { onMount } from "svelte";
	import { base } from "$app/paths";
	import { memoryUi } from "$lib/stores/memoryUi";

	type ConceptType = "routing" | "content" | "action";
	type TimeFilter = "all" | "today" | "week" | "session";
	type SortOption = "hybrid" | "recent" | "oldest";

	interface Concept {
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

	// Get active concepts from the store
	let activeConcepts = $derived($memoryUi.data.activeConcepts);

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
			bg: "bg-purple-100 dark:bg-purple-900/30",
			text: "text-purple-700 dark:text-purple-300",
			border: "border-purple-300 dark:border-purple-700",
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
			const data = await response.json();

			concepts = data.concepts ?? [];
		} catch (err) {
			console.error("Failed to load concepts:", err);
			concepts = [];
		} finally {
			isLoading = false;
		}
	}

	function selectConcept(concept: Concept) {
		selectedConcept = selectedConcept?.concept === concept.concept ? null : concept;
	}

	function isActive(concept: string): boolean {
		return activeConcepts.includes(concept);
	}

	onMount(() => {
		loadConcepts();
	});

	$effect(() => {
		// Re-fetch when filters change
		if (timeFilter || sortBy) {
			loadConcepts();
		}
	});
</script>

<div class="flex h-full flex-col gap-3 p-3" dir="rtl">
	<!-- Active Concepts Strip -->
	{#if activeConcepts.length > 0}
		<div class="rounded-lg border border-blue-200 bg-blue-50 p-2 dark:border-blue-800 dark:bg-blue-900/30">
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
	</div>

	<!-- Concept List / Graph -->
	<div class="flex-1 overflow-y-auto">
		{#if isLoading}
			<div class="flex items-center justify-center py-8">
				<div
					class="size-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"
				></div>
			</div>
		{:else if concepts.length === 0}
			<div class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
				אין מושגים להצגה
			</div>
		{:else}
			<div class="flex flex-col gap-2">
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
					onclick={() => (selectedConcept = null)}
					class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
					aria-label="סגור פרטי מושג"
				>
					<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
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
		</div>
	{/if}
</div>
