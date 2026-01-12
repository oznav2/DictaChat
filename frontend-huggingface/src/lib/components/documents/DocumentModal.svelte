<script lang="ts">
	/**
	 * DocumentModal - Full document view with tabs
	 *
	 * Features:
	 * - "View Document" tab: Full parsed markdown in Hebrew RTL scrollable container
	 * - "Summary" tab: LLM-generated summary + key points
	 * - Bilingual source badges
	 */

	import Modal from "$lib/components/Modal.svelte";
	import IconLoading from "$lib/components/icons/IconLoading.svelte";
	import { base } from "$app/paths";

	interface DocumentData {
		id: string;
		title: string;
		author?: string;
		sourceUrl?: string;
		sourceType?: "upload" | "web" | "api";
		language?: "he" | "en" | "mixed";
		parsedMarkdown?: string;
		summary?: string;
		keyPoints?: string[];
		numPages?: number;
		fileType?: string;
		uploadTimestamp?: string;
	}

	interface Props {
		document: DocumentData | null;
		onclose: () => void;
	}

	let { document, onclose }: Props = $props();

	let activeTab = $state<"view" | "summary">("summary");
	let loading = $state(false);
	let fullDocument = $state<DocumentData | null>(null);

	// Load full document content when opening
	$effect(() => {
		if (document && !fullDocument) {
			loadFullDocument();
		}
	});

	async function loadFullDocument() {
		if (!document) return;
		loading = true;
		try {
			const res = await fetch(`${base}/api/documents/${document.id}`);
			if (res.ok) {
				fullDocument = await res.json();
			} else {
				fullDocument = document;
			}
		} catch {
			fullDocument = document;
		} finally {
			loading = false;
		}
	}

	function getSourceBadge(sourceType?: string, language?: string): { text: string; color: string } {
		const langBadge = language === "he" ? "עברית" : language === "en" ? "English" : "Mixed";
		const typeBadge = sourceType === "web" ? "אתר" : sourceType === "upload" ? "העלאה" : "API";
		return {
			text: `${typeBadge} • ${langBadge}`,
			color:
				sourceType === "web"
					? "bg-blue-500"
					: sourceType === "upload"
						? "bg-green-500"
						: "bg-purple-500",
		};
	}

	let doc = $derived(fullDocument || document);
	let sourceBadge = $derived(doc ? getSourceBadge(doc.sourceType, doc.language) : null);
</script>

{#if document}
	<Modal width="max-w-4xl" closeButton={true} {onclose}>
		<div class="flex h-[80vh] flex-col" dir="rtl">
			<!-- Header -->
			<div class="border-b border-gray-200 p-4 dark:border-gray-700">
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0 flex-1">
						<h2 class="truncate text-xl font-semibold text-gray-900 dark:text-white">
							{doc?.title || "מסמך"}
						</h2>
						{#if doc?.author}
							<p class="text-sm text-gray-500 dark:text-gray-400">{doc.author}</p>
						{/if}
					</div>
					{#if sourceBadge}
						<span
							class="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-white {sourceBadge.color}"
						>
							{sourceBadge.text}
						</span>
					{/if}
				</div>

				{#if doc?.sourceUrl}
					<a
						href={doc.sourceUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="mt-2 block truncate text-sm text-blue-500 hover:underline"
					>
						{doc.sourceUrl}
					</a>
				{/if}

				<!-- Tabs -->
				<div class="mt-4 flex gap-2">
					<button
						type="button"
						class="rounded-lg px-4 py-2 text-sm font-medium transition-colors
							{activeTab === 'summary'
							? 'bg-blue-500 text-white'
							: 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200'}"
						onclick={() => (activeTab = "summary")}
					>
						סיכום
					</button>
					<button
						type="button"
						class="rounded-lg px-4 py-2 text-sm font-medium transition-colors
							{activeTab === 'view'
							? 'bg-blue-500 text-white'
							: 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200'}"
						onclick={() => (activeTab = "view")}
					>
						צפייה במסמך
					</button>
				</div>
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-hidden">
				{#if loading}
					<div class="flex h-full items-center justify-center">
						<IconLoading classNames="h-8 w-8" />
					</div>
				{:else if activeTab === "summary"}
					<!-- Summary Tab -->
					<div class="h-full overflow-y-auto p-4">
						{#if doc?.summary}
							<div class="mb-6">
								<h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">סיכום</h3>
								<p class="whitespace-pre-wrap text-gray-700 dark:text-gray-300">{doc.summary}</p>
							</div>
						{:else}
							<p class="text-gray-500 dark:text-gray-400">לא נוצר סיכום עדיין</p>
						{/if}

						{#if doc?.keyPoints && doc.keyPoints.length > 0}
							<div>
								<h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
									נקודות מפתח
								</h3>
								<ul class="space-y-2">
									{#each doc.keyPoints as point}
										<li class="flex items-start gap-2">
											<span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500"></span>
											<span class="text-gray-700 dark:text-gray-300">{point}</span>
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						<!-- Metadata -->
						<div
							class="mt-6 border-t border-gray-200 pt-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
						>
							{#if doc?.numPages}
								<span>עמודים: {doc.numPages}</span>
								<span class="mx-2">•</span>
							{/if}
							{#if doc?.fileType}
								<span>סוג: {doc.fileType}</span>
								<span class="mx-2">•</span>
							{/if}
							{#if doc?.uploadTimestamp}
								<span>הועלה: {new Date(doc.uploadTimestamp).toLocaleDateString("he-IL")}</span>
							{/if}
						</div>
					</div>
				{:else}
					<!-- View Document Tab -->
					<div class="h-full overflow-y-auto bg-gray-50 p-4 dark:bg-gray-800">
						{#if doc?.parsedMarkdown}
							<div class="prose prose-sm max-w-none whitespace-pre-wrap dark:prose-invert">
								{doc.parsedMarkdown}
							</div>
						{:else}
							<p class="text-center text-gray-500 dark:text-gray-400">
								תוכן המסמך אינו זמין. ייתכן שהמסמך עדיין בעיבוד.
							</p>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</Modal>
{/if}
