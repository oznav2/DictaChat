<script lang="ts">
	import { onMount } from "svelte";
	import { base } from "$app/paths";
	import { memoryUi } from "$lib/stores/memoryUi";

	interface Memory {
		id: string;
		text: string;
		tags: string[];
		status: "active" | "archived";
		created_at: string;
		archived_at?: string;
		archived_reason?: string;
	}

	interface MemoryStats {
		total_memories: number;
		active: number;
		archived: number;
		unique_tags: number;
		tags: string[];
	}

	let isOpen = $derived($memoryUi.modals.memoryBankOpen);
	let memories = $state<Memory[]>([]);
	let archivedMemories = $state<Memory[]>([]);
	let stats = $state<MemoryStats | null>(null);
	let loading = $state(true);
	let view = $state<"active" | "archived" | "stats">("active");
	let searchQuery = $state("");
	let selectedTags = $state<string[]>([]);
	let showFilters = $state(false);

	function handleClose() {
		memoryUi.closeMemoryBank();
	}

	async function fetchData() {
		loading = true;
		try {
			const [activeRes, archivedRes, statsRes] = await Promise.all([
				fetch(`${base}/api/memory/memory-bank?status=active`),
				fetch(`${base}/api/memory/memory-bank?status=archived`),
				fetch(`${base}/api/memory/memory-bank/stats`),
			]);

			if (activeRes.ok) {
				const data = await activeRes.json();
				memories = data.memories || [];
			}
			if (archivedRes.ok) {
				const data = await archivedRes.json();
				archivedMemories = data.memories || [];
			}
			if (statsRes.ok) {
				const data = await statsRes.json();
				stats = data;
			}
		} catch (err) {
			console.error("Failed to fetch memory bank data:", err);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (isOpen) {
			fetchData();
		}
	});

	async function handleArchive(id: string) {
		try {
			const response = await fetch(`${base}/api/memory/memory-bank/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					status: "archived",
					archived_reason: "user_action",
				}),
			});
			if (response.ok) {
				fetchData();
			}
		} catch (err) {
			console.error("Failed to archive memory:", err);
		}
	}

	async function handleRestore(id: string) {
		try {
			const response = await fetch(`${base}/api/memory/memory-bank/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "active" }),
			});
			if (response.ok) {
				fetchData();
			}
		} catch (err) {
			console.error("Failed to restore memory:", err);
		}
	}

	async function handleDelete(id: string) {
		if (!confirm("למחוק לצמיתות את הזיכרון הזה? לא ניתן לבטל פעולה זו.")) return;

		try {
			const response = await fetch(`${base}/api/memory/memory-bank/${id}`, {
				method: "DELETE",
			});
			if (response.ok) {
				fetchData();
			}
		} catch (err) {
			console.error("Failed to delete memory:", err);
		}
	}

	function toggleTag(tag: string) {
		if (selectedTags.includes(tag)) {
			selectedTags = selectedTags.filter((t) => t !== tag);
		} else {
			selectedTags = [...selectedTags, tag];
		}
	}

	let filteredMemories = $derived(
		memories.filter((memory) => {
			const matchesSearch =
				searchQuery === "" ||
				memory.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
				memory.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

			const matchesTags = selectedTags.length === 0 || selectedTags.every((tag) => memory.tags.includes(tag));

			return matchesSearch && matchesTags;
		})
	);

	let allTags = $derived(Array.from(new Set(memories.flatMap((m) => m.tags))));
</script>

{#if isOpen}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
		aria-label="בנק זיכרון"
		tabindex="-1"
		onclick={handleClose}
		onkeydown={(e) => e.key === "Escape" && handleClose()}
		dir="rtl"
	>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			role="document"
			class="flex h-[80vh] w-full max-w-4xl flex-col rounded-xl border border-gray-700 bg-gray-800 shadow-2xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex flex-shrink-0 items-center justify-between border-b border-gray-700 p-3">
				<h2 class="text-lg font-bold text-gray-100">בנק זיכרון</h2>
				<button onclick={handleClose} class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200" title="סגור" aria-label="סגור">
					<svg class="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Tabs -->
			<div class="flex flex-shrink-0 gap-1 border-b border-gray-700 px-3 py-1">
				<button
					onclick={() => (view = "active")}
					class={["rounded-t-lg px-3 py-1.5 transition-colors", view === "active" ? "border-x border-t border-gray-600 bg-gray-700 text-gray-100" : "text-gray-400 hover:text-gray-200"]}
				>
					פעיל ({memories.length})
				</button>
				<button
					onclick={() => (view = "archived")}
					class={["rounded-t-lg px-3 py-1.5 transition-colors", view === "archived" ? "border-x border-t border-gray-600 bg-gray-700 text-gray-100" : "text-gray-400 hover:text-gray-200"]}
				>
					בארכיון ({archivedMemories.length})
				</button>
				<button
					onclick={() => (view = "stats")}
					class={["rounded-t-lg px-3 py-1.5 transition-colors", view === "stats" ? "border-x border-t border-gray-600 bg-gray-700 text-gray-100" : "text-gray-400 hover:text-gray-200"]}
				>
					<svg class="ml-1 inline size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
					</svg>
					סטטיסטיקות
				</button>
			</div>

			<!-- Search & Filters (only for active view) -->
			{#if view === "active"}
				<div class="flex-shrink-0 space-y-2 border-b border-gray-700 p-2">
					<div class="flex gap-2">
						<div class="relative flex-1">
							<svg class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
							</svg>
							<input
								type="text"
								placeholder="חפש זיכרונות..."
								bind:value={searchQuery}
								class="w-full rounded-lg border border-gray-600 bg-gray-700 py-2 pr-10 pl-4 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
							/>
						</div>
						{#if allTags.length > 0}
							<button
								onclick={() => (showFilters = !showFilters)}
								class="flex items-center gap-1 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
							>
								<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
								</svg>
								{#if selectedTags.length > 0}
									<span class="text-blue-400">({selectedTags.length})</span>
								{/if}
							</button>
						{/if}
					</div>

					{#if showFilters && allTags.length > 0}
						<div class="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
							{#each allTags as tag}
								<button
									onclick={() => toggleTag(tag)}
									class={["flex-shrink-0 rounded border px-2.5 py-1 text-xs transition-colors", selectedTags.includes(tag) ? "border-blue-600/30 bg-blue-600/20 text-blue-400" : "border-gray-600 bg-gray-700 text-gray-400 hover:border-gray-500"]}
								>
									#{tag}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Content -->
			<div class="flex-1 overflow-y-auto p-4">
				{#if loading}
					<div class="flex items-center justify-center py-12">
						<div class="size-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
					</div>
				{:else if view === "active"}
					{#if filteredMemories.length === 0}
						<div class="py-12 text-center">
							<svg class="mx-auto mb-3 size-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
							</svg>
							<p class="text-gray-500">
								{searchQuery || selectedTags.length > 0 ? "אין זיכרונות תואמים לסינון" : "עדיין לא נשמרו זיכרונות"}
							</p>
						</div>
					{:else}
						<div class="space-y-2">
							{#each filteredMemories as memory (memory.id)}
								<div class="rounded-lg border border-gray-600 bg-gray-700 p-4 transition-colors hover:border-gray-500">
									<div class="mb-3 flex items-start justify-between">
										<div class="flex-1">
											<p class="mb-2 line-clamp-3 text-sm text-gray-200">{memory.text}</p>
											{#if memory.tags.length > 0}
												<div class="flex flex-wrap gap-1.5">
													{#each memory.tags as tag}
														<span class="rounded bg-gray-600 px-2 py-0.5 text-xs text-gray-400">#{tag}</span>
													{/each}
												</div>
											{/if}
										</div>
										<div class="mr-3 flex flex-shrink-0 gap-1">
											<button onclick={() => handleArchive(memory.id)} class="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-600 hover:text-yellow-400" title="העבר לארכיון" aria-label="העבר לארכיון">
												<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
												</svg>
											</button>
											<button onclick={() => handleDelete(memory.id)} class="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-600 hover:text-red-400" title="מחק" aria-label="מחק">
												<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
												</svg>
											</button>
										</div>
									</div>
									<div class="flex gap-4 text-xs text-gray-500">
										<span>{new Date(memory.created_at).toLocaleDateString("he-IL")}</span>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{:else if view === "archived"}
					{#if archivedMemories.length === 0}
						<div class="py-12 text-center">
							<svg class="mx-auto mb-3 size-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
							</svg>
							<p class="text-gray-500">אין זיכרונות בארכיון</p>
						</div>
					{:else}
						<div class="space-y-2">
							{#each archivedMemories as memory (memory.id)}
								<div class="rounded-lg border border-gray-700/50 bg-gray-700/50 p-4">
									<div class="mb-3 flex items-start justify-between">
										<div class="flex-1">
											<p class="mb-2 line-clamp-3 text-sm text-gray-400">{memory.text}</p>
											{#if memory.tags.length > 0}
												<div class="flex flex-wrap gap-1.5">
													{#each memory.tags as tag}
														<span class="rounded bg-gray-600/50 px-2 py-0.5 text-xs text-gray-500">#{tag}</span>
													{/each}
												</div>
											{/if}
										</div>
										<div class="mr-3 flex flex-shrink-0 gap-1">
											<button onclick={() => handleRestore(memory.id)} class="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-600 hover:text-green-400" title="שחזר" aria-label="שחזר">
												<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
												</svg>
											</button>
											<button onclick={() => handleDelete(memory.id)} class="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-600 hover:text-red-400" title="מחק" aria-label="מחק">
												<svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
												</svg>
											</button>
										</div>
									</div>
									<div class="flex gap-4 text-xs text-gray-500">
										<span>בארכיון: {memory.archived_at ? new Date(memory.archived_at).toLocaleDateString("he-IL") : ""}</span>
										{#if memory.archived_reason}
											<span>סיבה: {memory.archived_reason}</span>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{:else if stats}
					<!-- Stats view -->
					<div class="h-full space-y-6 overflow-y-auto">
						<div class="grid grid-cols-2 gap-4">
							<div class="rounded-lg border border-gray-600 bg-gray-700 p-4">
								<div class="text-2xl font-bold text-blue-400">{stats.active}</div>
								<div class="text-sm text-gray-500">זיכרונות פעילים</div>
							</div>
							<div class="rounded-lg border border-gray-600 bg-gray-700 p-4">
								<div class="text-2xl font-bold text-gray-400">{stats.archived}</div>
								<div class="text-sm text-gray-500">בארכיון</div>
							</div>
							<div class="rounded-lg border border-gray-600 bg-gray-700 p-4">
								<div class="text-2xl font-bold text-green-400">{stats.total_memories}</div>
								<div class="text-sm text-gray-500">סה"כ זיכרונות</div>
							</div>
							<div class="rounded-lg border border-gray-600 bg-gray-700 p-4">
								<div class="text-2xl font-bold text-purple-400">{stats.unique_tags}</div>
								<div class="text-sm text-gray-500">תגיות ייחודיות</div>
							</div>
						</div>

						{#if stats.tags.length > 0}
							<div class="rounded-lg border border-gray-600 bg-gray-700 p-4">
								<div class="mb-3 flex items-center gap-2">
									<svg class="size-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
									</svg>
									<h3 class="text-sm font-medium text-gray-200">כל התגיות</h3>
								</div>
								<div class="flex flex-wrap gap-2">
									{#each stats.tags as tag}
										<span class="rounded bg-gray-600 px-2 py-1 text-xs text-gray-300">#{tag}</span>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
