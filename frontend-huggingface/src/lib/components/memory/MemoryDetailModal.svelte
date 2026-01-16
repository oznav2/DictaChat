<script lang="ts">
	import Modal from "$lib/components/Modal.svelte";
	import { base } from "$app/paths";
	import type { MemoryTier } from "$lib/types/MemoryMeta";
	import { dispatchMemoryEvent } from "$lib/stores/memoryEvents";

	interface MemoryDetail {
		memory_id: string;
		tier: MemoryTier;
		content: string;
		wilson_score: number;
		outcomes?: { worked: number; failed: number; partial: number };
		tags?: string[];
		created_at: string;
		last_used?: string;
	}

	interface Props {
		memory: MemoryDetail | null;
		onclose: () => void;
		onarchived?: (id: string) => void;
		onghosted?: (id: string) => void;
	}

	let { memory, onclose, onarchived, onghosted }: Props = $props();

	let isArchiving = $state(false);
	let isGhosting = $state(false);
	let actionError = $state<string | null>(null);

	const tierLabels: Record<MemoryTier, string> = {
		working: "זיכרון עבודה",
		history: "היסטוריה",
		patterns: "דפוסים",
		books: "ספרים",
		memory_bank: "בנק זיכרון",
		datagov_schema: "DataGov סכמות",
		datagov_expansion: "DataGov הרחבות",
	};

	const tierColors: Record<MemoryTier, string> = {
		working: "bg-blue-500",
		history: "bg-purple-500",
		patterns: "bg-green-500",
		books: "bg-amber-500",
		memory_bank: "bg-pink-500",
		datagov_schema: "bg-slate-500",
		datagov_expansion: "bg-slate-500",
	};

	function getScoreColor(score: number): string {
		if (score >= 0.7) return "text-green-500";
		if (score >= 0.4) return "text-yellow-500";
		return "text-red-500";
	}

	async function handleArchive() {
		if (!memory) return;
		isArchiving = true;
		actionError = null;

		try {
			const res = await fetch(`${base}/api/memory/memory-bank/${memory.memory_id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "archived" }),
			});

			if (res.ok) {
				onarchived?.(memory.memory_id);
				dispatchMemoryEvent({ type: "memory_updated", detail: { memoryId: memory.memory_id } });
				onclose();
			} else {
				const data = await res.json().catch(() => ({}));
				actionError = data.error || "שגיאה בארכוב הזיכרון";
			}
		} catch (err) {
			actionError = "שגיאת רשת";
		} finally {
			isArchiving = false;
		}
	}

	async function handleGhost() {
		if (!memory) return;
		isGhosting = true;
		actionError = null;

		try {
			const res = await fetch(`${base}/api/memory/ghost`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					memoryId: memory.memory_id,
					tier: memory.tier,
					reason: "user_action",
				}),
			});

			if (res.ok) {
				onghosted?.(memory.memory_id);
				dispatchMemoryEvent({ type: "memory_updated", detail: { memoryId: memory.memory_id } });
				onclose();
			} else {
				const data = await res.json().catch(() => ({}));
				actionError = data.error || "שגיאה בהסתרת הזיכרון";
			}
		} catch (err) {
			actionError = "שגיאת רשת";
		} finally {
			isGhosting = false;
		}
	}

	function formatDate(dateStr: string): string {
		try {
			return new Date(dateStr).toLocaleString("he-IL", {
				year: "numeric",
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
		} catch {
			return dateStr;
		}
	}
</script>

{#if memory}
	<Modal width="max-w-lg" closeButton={true} {onclose} dir="rtl">
		<div class="p-5">
			<!-- Header -->
			<div class="mb-4 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<span class={["size-3 rounded-full", tierColors[memory.tier]]}></span>
					<h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
						{tierLabels[memory.tier]}
					</h2>
				</div>
				<span class={["text-sm font-medium", getScoreColor(memory.wilson_score)]}>
					{Math.round(memory.wilson_score * 100)}% Wilson Score
				</span>
			</div>

			<!-- Content -->
			<div class="mb-4 max-h-64 overflow-y-auto rounded-lg bg-gray-100 p-4 dark:bg-gray-700">
				<p class="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">
					{memory.content}
				</p>
			</div>

			<!-- Tags -->
			{#if memory.tags && memory.tags.length > 0}
				<div class="mb-4 flex flex-wrap gap-2">
					{#each memory.tags as tag}
						<span
							class="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-600 dark:text-gray-300"
						>
							{tag}
						</span>
					{/each}
				</div>
			{/if}

			<!-- Outcomes -->
			{#if memory.outcomes}
				<div class="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
					<div class="rounded bg-green-100 p-2 dark:bg-green-900/30">
						<div class="text-lg font-bold text-green-600 dark:text-green-400">
							{memory.outcomes.worked}
						</div>
						<div class="text-xs text-gray-500 dark:text-gray-400">הצליח</div>
					</div>
					<div class="rounded bg-red-100 p-2 dark:bg-red-900/30">
						<div class="text-lg font-bold text-red-600 dark:text-red-400">
							{memory.outcomes.failed}
						</div>
						<div class="text-xs text-gray-500 dark:text-gray-400">נכשל</div>
					</div>
					<div class="rounded bg-yellow-100 p-2 dark:bg-yellow-900/30">
						<div class="text-lg font-bold text-yellow-600 dark:text-yellow-400">
							{memory.outcomes.partial}
						</div>
						<div class="text-xs text-gray-500 dark:text-gray-400">חלקי</div>
					</div>
				</div>
			{/if}

			<!-- Timestamps -->
			<div class="mb-4 text-xs text-gray-500 dark:text-gray-400">
				<span>נוצר: {formatDate(memory.created_at)}</span>
				{#if memory.last_used}
					<span class="mx-2">|</span>
					<span>שימוש אחרון: {formatDate(memory.last_used)}</span>
				{/if}
			</div>

			<!-- Error Message -->
			{#if actionError}
				<div
					class="mb-4 rounded bg-red-100 p-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400"
				>
					{actionError}
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex gap-2 border-t border-gray-200 pt-4 dark:border-gray-600">
				<button
					type="button"
					onclick={handleArchive}
					disabled={isArchiving || isGhosting}
					class="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
				>
					{isArchiving ? "מעביר..." : "העבר לארכיון"}
				</button>
				<button
					type="button"
					onclick={handleGhost}
					disabled={isArchiving || isGhosting}
					class="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
				>
					{isGhosting ? "מסתיר..." : "הסתר (Ghost)"}
				</button>
			</div>
		</div>
	</Modal>
{/if}
