<script lang="ts">
	/**
	 * GrowthTimeline - Visualizes user's knowledge growth over time
	 *
	 * Features:
	 * - Summary stats (total, weekly growth, sources)
	 * - Bar chart of memory accumulation
	 * - Hebrew RTL support
	 */

	import { base } from "$app/paths";
	import IconLoading from "$lib/components/icons/IconLoading.svelte";

	interface GrowthDataPoint {
		date: string;
		totalMemories: number;
		bySource: Record<string, number>;
	}

	interface Props {
		userId?: string;
	}

	let { userId }: Props = $props();

	let data = $state<GrowthDataPoint[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	$effect(() => {
		loadGrowthData();
	});

	async function loadGrowthData() {
		loading = true;
		error = null;

		try {
			const params = new URLSearchParams();
			if (userId) params.set("userId", userId);
			params.set("days", "30");

			const res = await fetch(`${base}/api/memory/growth?${params.toString()}`);
			if (res.ok) {
				data = await res.json();
			} else {
				error = "Failed to load growth data";
			}
		} catch (err) {
			error = err instanceof Error ? err.message : "Failed to load growth data";
		} finally {
			loading = false;
		}
	}

	const latestTotal = $derived(data.length > 0 ? data[data.length - 1].totalMemories : 0);
	const weekAgoTotal = $derived(data.length >= 7 ? data[data.length - 7].totalMemories : 0);
	const weekGrowth = $derived(latestTotal - weekAgoTotal);
	const sourceCount = $derived(
		data.length > 0 ? Object.keys(data[data.length - 1]?.bySource || {}).length : 0
	);
	const maxTotal = $derived(Math.max(...data.map((d) => d.totalMemories), 1));
</script>

<div class="growth-timeline rounded-lg bg-gray-800 p-4" dir="rtl">
	<h3 class="mb-3 text-lg font-semibold text-white">גדילת הידע שלך</h3>

	{#if loading}
		<div class="flex items-center justify-center py-8">
			<IconLoading classNames="h-6 w-6" />
		</div>
	{:else if error}
		<div class="rounded bg-red-900/30 p-3 text-sm text-red-300">
			{error}
		</div>
	{:else if data.length === 0}
		<div class="py-8 text-center text-gray-400">
			<p>אין עדיין נתוני צמיחה</p>
			<p class="mt-1 text-sm">התחל לשוחח כדי לצבור ידע</p>
		</div>
	{:else}
		<!-- Summary stats -->
		<div class="mb-4 grid grid-cols-3 gap-3">
			<div class="rounded bg-gray-700 p-3 text-center">
				<div class="text-2xl font-bold text-blue-400">{latestTotal}</div>
				<div class="text-xs text-gray-400">סה"כ זיכרונות</div>
			</div>
			<div class="rounded bg-gray-700 p-3 text-center">
				<div class="text-2xl font-bold text-green-400">
					{weekGrowth >= 0 ? "+" : ""}{weekGrowth}
				</div>
				<div class="text-xs text-gray-400">השבוע</div>
			</div>
			<div class="rounded bg-gray-700 p-3 text-center">
				<div class="text-2xl font-bold text-purple-400">{sourceCount}</div>
				<div class="text-xs text-gray-400">מקורות</div>
			</div>
		</div>

		<!-- Bar chart -->
		<div class="flex h-32 items-end gap-1">
			{#each data.slice(-14) as point (point.date)}
				<div
					class="flex-1 rounded-t bg-blue-500 transition-colors hover:bg-blue-400"
					style="height: {(point.totalMemories / maxTotal) * 100}%"
					title="{point.date}: {point.totalMemories} זיכרונות"
				></div>
			{/each}
		</div>
		<div class="mt-1 flex justify-between text-xs text-gray-500">
			<span>לפני שבועיים</span>
			<span>היום</span>
		</div>
	{/if}
</div>
