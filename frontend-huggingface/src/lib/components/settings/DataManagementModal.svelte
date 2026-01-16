<!--
  DataManagementModal.svelte - RoamPal v0.2.9 parity
  
  Unified Data Management Modal with Export and Delete tabs.
  Allows users to:
  - Export data as backup (redirects to existing backup page)
  - Delete specific memory tiers/collections
  - Compact database to reclaim space
-->
<script lang="ts">
	import { base } from "$app/paths";
	import { browser } from "$app/environment";
	import Modal from "$lib/components/Modal.svelte";
	import CarbonClose from "~icons/carbon/close";
	import CarbonDownload from "~icons/carbon/download";
	import CarbonTrashCan from "~icons/carbon/trash-can";
	import CarbonDataBase from "~icons/carbon/data-base";
	import CarbonWarningAlt from "~icons/carbon/warning-alt";

	interface Props {
		isOpen: boolean;
		onClose: () => void;
	}

	let { isOpen = false, onClose }: Props = $props();

	type ActiveTab = "export" | "delete";
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

	let activeTab = $state<ActiveTab>("export");
	let dataStats = $state<DataStats | null>(null);
	let isLoadingStats = $state(false);
	let deleteTarget = $state<DeleteTarget>(null);
	let showDeleteConfirm = $state(false);
	let isDeleting = $state(false);
	let isCompacting = $state(false);
	let deleteError = $state<string | null>(null);

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
				return "זה ימחק את כל הספרים והמסמכים שהועלו.";
			case "sessions":
				return "זה ימחק את כל קבצי השיחות. השיחה הפעילה שלך תישמר.";
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

			// Show success feedback
			alert(`נמחק בהצלחה!\n\n${result.deleted_count || 0} פריטים הוסרו`);
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

			if (result.space_reclaimed_mb > 0.1) {
				alert(`מסד הנתונים דוחס!\n\nשוחזרו ${result.space_reclaimed_mb.toFixed(1)} MB של שטח דיסק`);
			} else {
				alert(
					`מסד הנתונים כבר מיטבי\n\nאין שטח משמעותי לשחזר (${result.space_reclaimed_mb.toFixed(2)} MB)`
				);
			}
		} catch (err) {
			console.error("Compaction failed:", err);
			alert(`הדחיסה נכשלה: ${err instanceof Error ? err.message : "Unknown error"}`);
		} finally {
			isCompacting = false;
		}
	}

	$effect(() => {
		if (isOpen && browser) {
			fetchDataStats();
		}
	});

	const deleteItems: Array<{ key: DeleteTarget; label: string; desc: string }> = [
		{ key: "memory_bank", label: "בנק זיכרון", desc: "עובדות והעדפות משתמש" },
		{ key: "working", label: "זיכרון עובד", desc: "הקשר נוכחי (24 שעות)" },
		{ key: "history", label: "היסטוריה", desc: "שיחות קודמות (30 יום)" },
		{ key: "patterns", label: "דפוסים", desc: "פתרונות מוכחים" },
		{ key: "books", label: "ספרים", desc: "מסמכי עיון" },
		{ key: "sessions", label: "שיחות", desc: "קבצי שיחות" },
		{ key: "knowledge-graph", label: "גרף ידע", desc: "יחסי מושגים" },
	];
</script>

{#if isOpen}
	<Modal onclose={onClose}>
		<div class="w-full max-w-2xl" dir="rtl">
			<!-- Header -->
			<div
				class="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700"
			>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">ניהול נתונים</h2>
				<button
					type="button"
					onclick={onClose}
					class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
				>
					<CarbonClose class="h-5 w-5" />
				</button>
			</div>

			<!-- Tabs -->
			<div class="flex border-b border-gray-200 dark:border-gray-700">
				<button
					type="button"
					onclick={() => (activeTab = "export")}
					class="flex flex-1 items-center justify-center gap-2 px-6 py-3 text-sm font-medium transition-colors
						{activeTab === 'export'
						? 'border-b-2 border-blue-500 bg-blue-50/50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
						: 'text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200'}"
				>
					<CarbonDownload class="h-4 w-4" />
					ייצוא
				</button>
				<button
					type="button"
					onclick={() => (activeTab = "delete")}
					class="flex flex-1 items-center justify-center gap-2 px-6 py-3 text-sm font-medium transition-colors
						{activeTab === 'delete'
						? 'border-b-2 border-red-500 bg-red-50/50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
						: 'text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200'}"
				>
					<CarbonTrashCan class="h-4 w-4" />
					מחיקה
				</button>
			</div>

			<!-- Content -->
			<div class="max-h-[60vh] overflow-y-auto p-4">
				{#if activeTab === "export"}
					<div class="space-y-4">
						<p class="text-sm text-gray-600 dark:text-gray-300">
							ייצא את כל נתוני הזיכרון שלך כגיבוי. אתה יכול לבחור אילו קולקציות לכלול בעמוד הגיבוי
							המלא.
						</p>
						<a
							href="{base}/settings/backup"
							class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
							onclick={onClose}
						>
							<CarbonDownload class="h-4 w-4" />
							עבור לעמוד גיבוי
						</a>
					</div>
				{:else}
					<div class="space-y-4">
						<!-- Warning -->
						<div
							class="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/30 dark:bg-red-900/10"
						>
							<CarbonWarningAlt class="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
							<p class="text-sm font-medium text-red-700 dark:text-red-400">
								אזור סכנה - פעולות אלה קבועות
							</p>
						</div>

						{#if isLoadingStats}
							<div class="flex items-center justify-center py-12">
								<div
									class="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-500"
								></div>
							</div>
						{:else}
							<div class="space-y-2">
								{#each deleteItems as item}
									{@const count = getDeleteItemCount(item.key)}
									<div
										class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50"
									>
										<div class="flex-1">
											<div class="text-sm font-medium text-gray-800 dark:text-gray-200">
												{item.label}
											</div>
											<div class="text-xs text-gray-500 dark:text-gray-400">{item.desc}</div>
										</div>
										<div class="flex items-center gap-3">
											<span class="text-sm text-gray-500 dark:text-gray-400">{count} פריטים</span>
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

							<!-- Compact Database -->
							<div class="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
								<button
									type="button"
									onclick={handleCompactDatabase}
									disabled={isCompacting}
									class="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-400 dark:hover:bg-blue-900/20"
								>
									{#if isCompacting}
										<div
											class="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
										></div>
										דוחס מסד נתונים...
									{:else}
										<CarbonDataBase class="h-4 w-4" />
										דחוס מסד נתונים (שחרור שטח דיסק)
									{/if}
								</button>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</Modal>
{/if}

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
