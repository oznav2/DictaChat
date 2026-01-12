<script lang="ts">
	import { usePublicConfig } from "$lib/utils/PublicConfig.svelte";
	import { base } from "$app/paths";
	import Modal from "$lib/components/Modal.svelte";
	import ServerCard from "./ServerCard.svelte";
	import AddServerForm from "./AddServerForm.svelte";
	import {
		allMcpServers,
		selectedServerIds,
		enabledServersCount,
		addCustomServer,
		refreshMcpServers,
		healthCheckServer,
		importCustomServersFromScan,
	} from "$lib/stores/mcpServers";
	import type { KeyValuePair } from "$lib/types/Tool";
	import IconAddLarge from "~icons/carbon/add-large";
	import IconRefresh from "~icons/carbon/renew";
	import IconSearch from "~icons/carbon/search";
	import LucideHammer from "~icons/lucide/hammer";
	import IconMCP from "$lib/components/icons/IconMCP.svelte";

	const publicConfig = usePublicConfig();

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();

	type View = "list" | "add";
	let currentView = $state<View>("list");
	let isRefreshing = $state(false);
	let scanStatus = $state<string | null>(null);

	const baseServers = $derived($allMcpServers.filter((s) => s.type === "base"));
	const customServers = $derived($allMcpServers.filter((s) => s.type === "custom"));
	const enabledCount = $derived($enabledServersCount);

	function handleAddServer(serverData: { name: string; url: string; headers?: KeyValuePair[] }) {
		addCustomServer(serverData);
		currentView = "list";
	}

	function handleCancel() {
		currentView = "list";
	}

	async function handleRefresh() {
		if (isRefreshing) return;
		isRefreshing = true;
		try {
			await refreshMcpServers();
			// After refreshing the list, re-run health checks for all known servers
			const servers = $allMcpServers;
			await Promise.allSettled(servers.map((s) => healthCheckServer(s)));
		} finally {
			isRefreshing = false;
		}
	}

	async function handleScan() {
		scanStatus = "סורק…";
		try {
			const res = await fetch(`${base}/api/mcp/scan`);
			const data = await res.json().catch(() => null);
			if (!res.ok || !data?.success) throw new Error(String(data?.error ?? `HTTP ${res.status}`));
			const servers = Array.isArray(data.servers) ? data.servers : [];
			const result = importCustomServersFromScan(servers);
			scanStatus = `נוספו ${result.added}, דולגו ${result.skipped}`;
		} catch (err) {
			scanStatus = err instanceof Error ? err.message : "סריקה נכשלה";
		}
	}
</script>

<Modal width={currentView === "list" ? "w-[800px]" : "w-[600px]"} {onclose} closeButton dir="rtl">
	<div class="p-6" dir="rtl">
		<!-- Header -->
		<div class="mb-6">
			<h2 class="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-200">
				{#if currentView === "list"}
					שרתי MCP
				{:else}
					הוסף שרת MCP
				{/if}
			</h2>
			<p class="text-sm text-gray-600 dark:text-gray-400">
				{#if currentView === "list"}
					זוכה להרחבה דרמטית של יכולות המודל להתקשר עם מקורות מידע חיצוניים {publicConfig.PUBLIC_APP_NAME}
					באמצעות שרתי כלים ופונקציות.
				{:else}
					הוסף שרת כלים מותאם אישית {publicConfig.PUBLIC_APP_NAME}.
				{/if}
			</p>
		</div>

		<!-- Content -->
		{#if currentView === "list"}
			<div
				class="mb-6 flex justify-between rounded-lg p-4 max-sm:flex-col max-sm:gap-4 sm:items-center {!enabledCount
					? 'bg-gray-100 dark:bg-white/5'
					: 'bg-blue-50 dark:bg-blue-900/10'}"
			>
				<div class="flex items-center gap-3">
					<div
						class="flex size-10 items-center justify-center rounded-xl bg-blue-500/10"
						class:grayscale={!enabledCount}
					>
						<IconMCP classNames="size-8 text-blue-600 dark:text-blue-500" />
					</div>
					<div>
						<p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
							{$allMcpServers.length}
							{$allMcpServers.length === 1 ? "שרת" : "שרתים"} מוגדרים במערכת באמצעות קובץ servers.json
						</p>
						<p class="text-xs text-gray-600 dark:text-gray-400">
							{enabledCount} שרתים פעילים
						</p>
					</div>
				</div>

				<div class="flex gap-2">
					<button
						onclick={handleRefresh}
						disabled={isRefreshing}
						class="btn gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
					>
						<IconRefresh class="size-4 {isRefreshing ? 'animate-spin' : ''}" />
						{isRefreshing ? "מרענן…" : "רענן"}
					</button>
					<button
						onclick={handleScan}
						class="btn gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
					>
						<IconSearch class="size-4" />
						סרוק
					</button>
					<button
						onclick={() => (currentView = "add")}
						class="btn flex items-center gap-0.5 rounded-lg bg-blue-600 py-1.5 pl-2 pr-3 text-sm font-medium text-white hover:bg-blue-600"
					>
						<IconAddLarge class="size-4" />
						הוסף שרת
					</button>
				</div>
			</div>
			{#if scanStatus}
				<div class="mb-4 text-xs text-gray-600 dark:text-gray-300">{scanStatus}</div>
			{/if}
			<div class="space-y-5">
				<!-- Base Servers -->
				{#if baseServers.length > 0}
					<div>
						<h3 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
							מותקנים מראש ({baseServers.length})
						</h3>
						<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
							{#each baseServers as server (server.id)}
								<ServerCard {server} isSelected={$selectedServerIds.has(server.id)} />
							{/each}
						</div>
					</div>
				{/if}

				<!-- Custom Servers -->
				<div>
					<h3 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
						שרתי כלים בהגדרה ידנית ({customServers.length})
					</h3>
					{#if customServers.length === 0}
						<div
							class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 dark:border-gray-700"
						>
							<LucideHammer class="mb-3 size-12 text-gray-400" />
							<p class="mb-1 text-sm font-medium text-gray-900 dark:text-gray-100">
								לא נוספו שרתי כלים חדשים מעבר לאלו שהוגדרו כברירת מחדל
							</p>
							<p class="mb-4 text-xs text-gray-600 dark:text-gray-400">
								הוסף שרת כלים להוספת פונקציות ויכולות משלימות של המודל לקבל מידע ממקורות חיצוניים
							</p>
							<button
								onclick={() => (currentView = "add")}
								class="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
							>
								<IconAddLarge class="size-4" />
								הגדר שרת כלים חדש
							</button>
						</div>
					{:else}
						<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
							{#each customServers as server (server.id)}
								<ServerCard {server} isSelected={$selectedServerIds.has(server.id)} />
							{/each}
						</div>
					{/if}
				</div>

				<!-- Help Text -->
				<div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
					<h4 class="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">💡 טיפים</h4>
					<ul class="space-y-1 text-xs text-gray-600 dark:text-gray-400">
						<li>• הוסף שרתי כלים ממקור מהימן בלבד</li>
						<li>• הפעל את השרת הרלוונטים לך בתוך חלון השיחה</li>
						<li>
							• השתמש בכפתור בדיקת החיבור בכדי לבדוק זמינות שרת הכלים ורשימת הפונקציות שהוא פותח
							בפני המודל
						</li>
						<li>• תוכל להגדיר שרתי כלים עם גישה מאובטחת תלוית סיסמה או מפתח טוקן</li>
					</ul>
				</div>
			</div>
		{:else if currentView === "add"}
			<AddServerForm onsubmit={handleAddServer} oncancel={handleCancel} />
		{/if}
	</div>
</Modal>
