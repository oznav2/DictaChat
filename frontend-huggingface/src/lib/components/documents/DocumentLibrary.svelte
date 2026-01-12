<script lang="ts">
	/**
	 * DocumentLibrary - Unified document library view
	 *
	 * Features:
	 * - Lists all documents (books, web articles, API imports)
	 * - Filter by source type and language
	 * - Bilingual source badges
	 * - Click to open DocumentModal
	 */

	import { base } from "$app/paths";
	import IconLoading from "$lib/components/icons/IconLoading.svelte";
	import DocumentModal from "./DocumentModal.svelte";

	interface DocumentSummary {
		id: string;
		title: string;
		author?: string;
		description?: string;
		sourceType: "upload" | "web" | "api";
		sourceUrl?: string;
		language?: "he" | "en" | "mixed";
		status: "processing" | "completed" | "failed";
		uploadTimestamp: string;
		numPages?: number;
		fileType?: string;
		accessCount?: number;
	}

	let documents = $state<DocumentSummary[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selectedDocument = $state<DocumentSummary | null>(null);

	// Filters
	let sourceTypeFilter = $state<string>("");
	let languageFilter = $state<string>("");

	async function loadDocuments() {
		loading = true;
		error = null;

		try {
			const params = new URLSearchParams();
			if (sourceTypeFilter) params.set("sourceType", sourceTypeFilter);
			if (languageFilter) params.set("language", languageFilter);

			const res = await fetch(`${base}/api/documents?${params.toString()}`);
			if (res.ok) {
				const data = await res.json();
				documents = data.documents || [];
			} else {
				error = "Failed to load documents";
			}
		} catch (err) {
			error = err instanceof Error ? err.message : "Failed to load documents";
		} finally {
			loading = false;
		}
	}

	// Load on mount and filter change
	$effect(() => {
		loadDocuments();
	});

	function getSourceIcon(sourceType: string): string {
		switch (sourceType) {
			case "web":
				return "🌐";
			case "upload":
				return "📄";
			case "api":
				return "🔌";
			default:
				return "📝";
		}
	}

	function getSourceBadge(sourceType: string): { text: string; color: string } {
		switch (sourceType) {
			case "web":
				return { text: "אתר", color: "bg-blue-500" };
			case "upload":
				return { text: "העלאה", color: "bg-green-500" };
			case "api":
				return { text: "API", color: "bg-purple-500" };
			default:
				return { text: "מסמך", color: "bg-gray-500" };
		}
	}

	function getLanguageBadge(language?: string): { text: string; color: string } | null {
		if (!language) return null;
		switch (language) {
			case "he":
				return { text: "עברית", color: "bg-amber-500" };
			case "en":
				return { text: "English", color: "bg-sky-500" };
			case "mixed":
				return { text: "דו-לשוני", color: "bg-violet-500" };
			default:
				return null;
		}
	}

	function getStatusBadge(status: string): { text: string; color: string } {
		switch (status) {
			case "completed":
				return { text: "מוכן", color: "bg-green-600" };
			case "processing":
				return { text: "מעבד...", color: "bg-yellow-500" };
			case "failed":
				return { text: "נכשל", color: "bg-red-500" };
			default:
				return { text: status, color: "bg-gray-500" };
		}
	}
</script>

<div class="flex h-full flex-col" dir="rtl">
	<!-- Header with filters -->
	<div class="border-b border-gray-200 p-4 dark:border-gray-700">
		<h2 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">ספריית מסמכים</h2>

		<div class="flex flex-wrap gap-3">
			<!-- Source type filter -->
			<select
				bind:value={sourceTypeFilter}
				class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
				onchange={() => loadDocuments()}
			>
				<option value="">כל המקורות</option>
				<option value="upload">העלאות</option>
				<option value="web">אתרים</option>
				<option value="api">API</option>
			</select>

			<!-- Language filter -->
			<select
				bind:value={languageFilter}
				class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
				onchange={() => loadDocuments()}
			>
				<option value="">כל השפות</option>
				<option value="he">עברית</option>
				<option value="en">אנגלית</option>
				<option value="mixed">דו-לשוני</option>
			</select>

			<!-- Refresh button -->
			<button
				type="button"
				onclick={() => loadDocuments()}
				class="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
			>
				רענן
			</button>
		</div>
	</div>

	<!-- Document list -->
	<div class="flex-1 overflow-y-auto p-4">
		{#if loading}
			<div class="flex items-center justify-center py-12">
				<IconLoading classNames="h-8 w-8" />
			</div>
		{:else if error}
			<div class="rounded-lg bg-red-50 p-4 text-center text-red-600 dark:bg-red-900/20">
				{error}
			</div>
		{:else if documents.length === 0}
			<div class="py-12 text-center text-gray-500 dark:text-gray-400">
				<p class="text-lg">אין מסמכים בספרייה</p>
				<p class="mt-2 text-sm">העלה מסמכים או הוסף כתובות URL להתחלה</p>
			</div>
		{:else}
			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each documents as doc (doc.id)}
					{@const sourceBadge = getSourceBadge(doc.sourceType)}
					{@const langBadge = getLanguageBadge(doc.language)}
					{@const statusBadge = getStatusBadge(doc.status)}
					<button
						type="button"
						onclick={() => (selectedDocument = doc)}
						class="rounded-lg border border-gray-200 bg-white p-4 text-right shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
					>
						<!-- Title and icon -->
						<div class="mb-2 flex items-start gap-2">
							<span class="text-xl">{getSourceIcon(doc.sourceType)}</span>
							<h3 class="flex-1 truncate font-medium text-gray-900 dark:text-white">
								{doc.title}
							</h3>
						</div>

						<!-- Author -->
						{#if doc.author && doc.author !== "Unknown" && doc.author !== "Web"}
							<p class="mb-2 truncate text-sm text-gray-500 dark:text-gray-400">
								{doc.author}
							</p>
						{/if}

						<!-- Description -->
						{#if doc.description}
							<p class="mb-3 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
								{doc.description}
							</p>
						{/if}

						<!-- Badges -->
						<div class="flex flex-wrap gap-1">
							<span
								class="rounded-full px-2 py-0.5 text-xs font-medium text-white {sourceBadge.color}"
							>
								{sourceBadge.text}
							</span>

							{#if langBadge}
								<span
									class="rounded-full px-2 py-0.5 text-xs font-medium text-white {langBadge.color}"
								>
									{langBadge.text}
								</span>
							{/if}

							{#if doc.status !== "completed"}
								<span
									class="rounded-full px-2 py-0.5 text-xs font-medium text-white {statusBadge.color}"
								>
									{statusBadge.text}
								</span>
							{/if}
						</div>

						<!-- Metadata footer -->
						<div class="mt-3 flex items-center justify-between text-xs text-gray-400">
							<span>
								{new Date(doc.uploadTimestamp).toLocaleDateString("he-IL")}
							</span>
							{#if doc.numPages}
								<span>{doc.numPages} עמודים</span>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Document Modal -->
{#if selectedDocument}
	<DocumentModal document={selectedDocument} onclose={() => (selectedDocument = null)} />
{/if}
