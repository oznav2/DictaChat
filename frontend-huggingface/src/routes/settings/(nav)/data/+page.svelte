<!--
  Data Management Settings Page
  
  RoamPal parity: DataManagementModal functionality
  Provides Export/Delete/Compact capabilities for memory data
-->
<script lang="ts">
	import { base } from "$app/paths";
	import { browser } from "$app/environment";
	import { onMount } from "svelte";
	import CarbonDownload from "~icons/carbon/download";
	import CarbonTrashCan from "~icons/carbon/trash-can";
	import CarbonDataBase from "~icons/carbon/data-base";
	import CarbonWarningAlt from "~icons/carbon/warning-alt";
	import CarbonCheckmarkFilled from "~icons/carbon/checkmark-filled";
	import Modal from "$lib/components/Modal.svelte";

	type DeleteTarget =
		| "memory_bank"
		| "working"
		| "history"
		| "patterns"
		| "books"
		| "sessions"
		| "knowledge-graph"
		| null;

	interface DataStats {
		memory_bank: { count: number; active: number; archived: number };
		working: { count: number };
		history: { count: number };
		patterns: { count: number };
		books: { count: number };
		sessions: { count: number };
		knowledge_graph: { nodes: number; edges: number };
	}

	let dataStats = $state<DataStats | null>(null);
	let isLoadingStats = $state(false);
	let deleteTarget = $state<DeleteTarget>(null);
	let showDeleteConfirm = $state(false);
	let isDeleting = $state(false);
	let isCompacting = $state(false);
	let deleteError = $state<string | null>(null);
	let lastAction = $state<{ type: string; count: number; timestamp: Date } | null>(null);

	async function fetchDataStats() {
		if (!browser) return;
		isLoadingStats = true;
		try {
			const res = await fetch(`${base}/api/data/stats`);
			if (res.ok) {
				dataStats = await res.json();
			}
		} catch (err) {
			console.error("Failed to fetch data stats:", err);
		} finally {
			isLoadingStats = false;
		}
	}

	function getDeleteItemCount(collection: DeleteTarget): number {
		if (!dataStats || !collection) return 0;
		switch (collection) {
			case "memory_bank":
				return dataStats.memory_bank.count;
			case "working":
				return dataStats.working.count;
			case "history":
				return dataStats.history.count;
			case "patterns":
				return dataStats.patterns.count;
			case "books":
				return dataStats.books.count;
			case "sessions":
				return dataStats.sessions.count;
			case "knowledge-graph":
				return dataStats.knowledge_graph.nodes + dataStats.knowledge_graph.edges;
			default:
				return 0;
		}
	}

	function getDeleteMessage(collection: DeleteTarget): string {
		switch (collection) {
			case "memory_bank":
				return "זה ימחק לצמיתות את כל הזיכרונות שה-AI שמר עליך. כולל זהות, העדפות, מטרות והקשר.";
			case "working":
				return "זה ימחק את הקשר השיחה הנוכחי מ-24 השעות האחרונות.";
			case "history":
				return "זה ימחק היסטוריית שיחות קודמות (שמירה של 30 יום).";
			case "patterns":
				return "זה יסיר את כל דפוסי הפתרון המוכחים שה-AI למד.";
			case "books":
				return "זה ימחק את כל הספרים והמסמכים שהועלו. כולל וקטורים וגרף ידע.";
			case "sessions":
				return "זה ימחק את כל קבצי השיחות.";
			case "knowledge-graph":
				return "זה ינקה את כל יחסי המושגים והחיבורים שה-AI בנה.";
			default:
				return "פעולה זו לא ניתנת לביטול.";
		}
	}

	function getLabelHebrew(collection: DeleteTarget): string {
		switch (collection) {
			case "memory_bank":
				return "בנק זיכרון";
			case "working":
				return "זיכרון עובד";
			case "history":
				return "היסטוריה";
			case "patterns":
				return "דפוסים";
			case "books":
				return "ספרים";
			case "sessions":
				return "שיחות";
			case "knowledge-graph":
				return "גרף ידע";
			default:
				return collection ?? "";
		}
	}

	async function handleDeleteClick(target: DeleteTarget) {
		deleteTarget = target;
		showDeleteConfirm = true;
		deleteError = null;
	}

	async function handleDeleteConfirm() {
		if (!deleteTarget) return;
		isDeleting = true;
		deleteError = null;

		try {
			const res = await fetch(`${base}/api/data/clear/${deleteTarget}`, {
				method: "POST",
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || data.detail || `Delete failed (${res.status})`);
			}

			const result = await res.json();

			// Set success feedback
			lastAction = {
				type: getLabelHebrew(deleteTarget),
				count: result.deleted_count || 0,
				timestamp: new Date(),
			};

			// Refresh stats
			await fetchDataStats();

			// Notify memory panel to refresh
			if (browser) {
				window.dispatchEvent(
					new CustomEvent("memoryUpdated", {
						detail: {
							source: "data_delete",
							target: deleteTarget,
							timestamp: new Date().toISOString(),
						},
					})
				);
			}

			showDeleteConfirm = false;
			deleteTarget = null;
		} catch (err) {
			deleteError = err instanceof Error ? err.message : "Delete failed";
		} finally {
			isDeleting = false;
		}
	}

	async function handleCompactDatabase() {
		isCompacting = true;
		try {
			const res = await fetch(`${base}/api/data/compact-database`, {
				method: "POST",
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || "Compaction failed");
			}

			const result = await res.json();

			lastAction = {
				type: "דחיסת מסד נתונים",
				count: Math.round(result.space_reclaimed_mb * 100) / 100,
				timestamp: new Date(),
			};
		} catch (err) {
			console.error("Compaction failed:", err);
			alert(`הדחיסה נכשלה: ${err instanceof Error ? err.message : "Unknown error"}`);
		} finally {
			isCompacting = false;
		}
	}

	onMount(() => {
		fetchDataStats();
	});

	const deleteItems: Array<{ key: DeleteTarget; label: string; labelEn: string; desc: string }> = [
		{
			key: "memory_bank",
			label: "בנק זיכרון",
			labelEn: "Memory Bank",
			desc: "עובדות והעדפות משתמש",
		},
		{
			key: "working",
			label: "זיכרון עובד",
			labelEn: "Working Memory",
			desc: "הקשר נוכחי (24 שעות)",
		},
		{ key: "history", label: "היסטוריה", labelEn: "History", desc: "שיחות קודמות (30 יום)" },
		{ key: "patterns", label: "דפוסים", labelEn: "Patterns", desc: "פתרונות מוכחים" },
		{ key: "books", label: "ספרים", labelEn: "Books", desc: "מסמכי עיון" },
		{ key: "sessions", label: "שיחות", labelEn: "Sessions", desc: "קבצי שיחות" },
		{ key: "knowledge-graph", label: "גרף ידע", labelEn: "Knowledge Graph", desc: "יחסי מושגים" },
	];

	function getTotalCount(): number {
		if (!dataStats) return 0;
		return (
			dataStats.memory_bank.count +
			dataStats.working.count +
			dataStats.history.count +
			dataStats.patterns.count +
			dataStats.books.count +
			dataStats.sessions.count +
			dataStats.knowledge_graph.nodes +
			dataStats.knowledge_graph.edges
		);
	}
</script>

<div class="mx-auto w-full max-w-3xl p-4" dir="rtl">
	<h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
		ניהול נתונים / Data Management
	</h1>
	<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
		נהל, מחק ודחוס את נתוני מערכת הזיכרון שלך.
	</p>

	<!-- Success feedback -->
	{#if lastAction}
		<div
			class="mt-4 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900/30 dark:bg-green-900/10"
		>
			<CarbonCheckmarkFilled class="h-5 w-5 text-green-500" />
			<div class="text-sm text-green-700 dark:text-green-400">
				{lastAction.type}: {lastAction.count}
				{typeof lastAction.count === "number" && lastAction.type !== "דחיסת מסד נתונים"
					? "פריטים נמחקו"
					: "MB שוחזרו"}
			</div>
			<button
				type="button"
				onclick={() => (lastAction = null)}
				class="mr-auto text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200"
			>
				×
			</button>
		</div>
	{/if}

	<div class="mt-4 grid gap-4">
		<!-- Export Section -->
		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<h2 class="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
				<CarbonDownload class="h-4 w-4 text-blue-500" />
				ייצוא גיבוי / Export Backup
			</h2>
			<p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
				ייצא את כל נתוני הזיכרון שלך כגיבוי מלא.
			</p>
			<a
				href="{base}/settings/backup"
				class="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
			>
				<CarbonDownload class="h-4 w-4" />
				עבור לעמוד גיבוי
			</a>
		</div>

		<!-- Delete Section -->
		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<h2 class="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
				<CarbonTrashCan class="h-4 w-4 text-red-500" />
				מחיקת נתונים / Delete Data
			</h2>

			<!-- Warning -->
			<div
				class="mt-3 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/30 dark:bg-red-900/10"
			>
				<CarbonWarningAlt class="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
				<div>
					<p class="text-sm font-medium text-red-700 dark:text-red-400">
						אזור סכנה - פעולות אלה קבועות
					</p>
					<p class="mt-1 text-xs text-red-600 dark:text-red-400/80">
						מומלץ לייצא גיבוי לפני מחיקת נתונים.
					</p>
				</div>
			</div>

			{#if isLoadingStats}
				<div class="mt-4 flex items-center justify-center py-8">
					<div
						class="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-500"
					></div>
				</div>
			{:else}
				<!-- Summary -->
				{#if dataStats}
					<div class="mt-4 rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
						<div class="text-xs font-medium text-gray-500 dark:text-gray-400">סה"כ פריטים</div>
						<div class="text-xl font-bold text-gray-900 dark:text-gray-100">
							{getTotalCount().toLocaleString()}
						</div>
					</div>
				{/if}

				<div class="mt-4 space-y-2">
					{#each deleteItems as item}
						{@const count = getDeleteItemCount(item.key)}
						<div
							class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50"
						>
							<div class="flex-1">
								<div class="text-sm font-medium text-gray-800 dark:text-gray-200">{item.label}</div>
								<div class="text-xs text-gray-500 dark:text-gray-400">{item.desc}</div>
							</div>
							<div class="flex items-center gap-3">
								<span
									class="min-w-[60px] text-left text-sm tabular-nums text-gray-500 dark:text-gray-400"
									>{count} פריטים</span
								>
								<button
									type="button"
									onclick={() => handleDeleteClick(item.key)}
									disabled={count === 0}
									class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
										{count === 0
										? 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
										: 'border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400 dark:hover:bg-red-900/20'}"
								>
									מחק
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Compact Database Section -->
		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<h2 class="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
				<CarbonDataBase class="h-4 w-4 text-purple-500" />
				דחיסת מסד נתונים / Compact Database
			</h2>
			<p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
				דחס את מסד הנתונים כדי לשחזר שטח דיסק לאחר מחיקות. פעולה זו בטוחה ולא מוחקת נתונים.
			</p>
			<button
				type="button"
				onclick={handleCompactDatabase}
				disabled={isCompacting}
				class="mt-3 flex items-center gap-2 rounded-lg border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-purple-900/30 dark:bg-purple-900/10 dark:text-purple-400 dark:hover:bg-purple-900/20"
			>
				{#if isCompacting}
					<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"
					></div>
					דוחס...
				{:else}
					<CarbonDataBase class="h-4 w-4" />
					דחוס מסד נתונים
				{/if}
			</button>
		</div>
	</div>
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm && deleteTarget}
	<Modal
		onclose={() => {
			showDeleteConfirm = false;
			deleteTarget = null;
			deleteError = null;
		}}
	>
		<div class="w-full max-w-md p-6" dir="rtl">
			<div class="mb-4 flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
				>
					<CarbonWarningAlt class="h-5 w-5 text-red-600 dark:text-red-400" />
				</div>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
					למחוק {getLabelHebrew(deleteTarget)}?
				</h3>
			</div>

			<p class="mb-4 text-sm text-gray-600 dark:text-gray-300">
				{getDeleteMessage(deleteTarget)}
			</p>

			<p class="mb-6 text-sm font-medium text-gray-800 dark:text-gray-200">
				{getDeleteItemCount(deleteTarget)} פריטים יימחקו.
			</p>

			{#if deleteError}
				<div
					class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400"
				>
					{deleteError}
				</div>
			{/if}

			<div class="flex justify-end gap-3">
				<button
					type="button"
					onclick={() => {
						showDeleteConfirm = false;
						deleteTarget = null;
						deleteError = null;
					}}
					class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
				>
					ביטול
				</button>
				<button
					type="button"
					onclick={handleDeleteConfirm}
					disabled={isDeleting}
					class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{#if isDeleting}
						<span class="flex items-center gap-2">
							<div
								class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
							></div>
							מוחק...
						</span>
					{:else}
						מחק לצמיתות
					{/if}
				</button>
			</div>
		</div>
	</Modal>
{/if}
