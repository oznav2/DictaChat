<script lang="ts">
	import { base } from "$app/paths";
	import { onMount } from "svelte";
	import { apiRequest } from "$lib/utils/apiClient";

	type IntegrationHealth = {
		ok: boolean;
		configured: boolean;
		base_url: string | null;
		latency_ms: number | null;
		error: string | null;
	};

	type IntegrationItem = {
		id: string;
		name: string;
		kind: "service" | "external";
		enabled: boolean;
		health: IntegrationHealth;
	};

	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let integrations = $state<IntegrationItem[]>([]);
	let saving = $state<Set<string>>(new Set());

	async function loadIntegrations() {
		loading = true;
		errorMsg = null;
		try {
			const data = await apiRequest<{ integrations?: IntegrationItem[] }>(
				`${base}/api/integrations`,
				{
					timeoutMs: 8000,
					retries: 1,
				}
			);
			integrations = Array.isArray(data.integrations) ? data.integrations : [];
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : "Failed to load integrations";
		} finally {
			loading = false;
		}
	}

	function setSaving(id: string, on: boolean) {
		const next = new Set(saving);
		if (on) next.add(id);
		else next.delete(id);
		saving = next;
	}

	async function toggleEnabled(item: IntegrationItem) {
		setSaving(item.id, true);
		try {
			await apiRequest(`${base}/api/integrations`, {
				method: "POST",
				body: { updates: [{ id: item.id, enabled: !item.enabled }] },
				timeoutMs: 8000,
				retries: 0,
			});
			integrations = integrations.map((it) =>
				it.id === item.id ? { ...it, enabled: !it.enabled } : it
			);
		} catch {
			await loadIntegrations();
		} finally {
			setSaving(item.id, false);
		}
	}

	function badgeClasses(item: IntegrationItem): string {
		if (!item.enabled) return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200";
		if (item.health.ok)
			return "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-300";
		if (!item.health.configured)
			return "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300";
		return "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300";
	}

	function badgeText(item: IntegrationItem): string {
		if (!item.enabled) return "DISABLED";
		if (item.health.ok) return "OK";
		if (!item.health.configured) return "MISCONFIGURED";
		return item.health.error ?? "DOWN";
	}

	onMount(() => {
		void loadIntegrations();
	});
</script>

<div class="mx-auto w-full max-w-3xl p-4" dir="rtl">
	<h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">אינטגרציות</h1>
	<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
		פאנל זה מציג סטטוס שירותים לא־MCP. מפתחות וסודות לא נשמרים ב‑DB ולא מוחזרים ללקוח.
	</p>

	<div class="mt-4 flex items-center justify-between">
		<div class="text-xs text-gray-500 dark:text-gray-400">
			{loading ? "טוען…" : `${integrations.length} פריטים`}
		</div>
		<button
			type="button"
			class="btn rounded-md text-xs"
			onclick={loadIntegrations}
			disabled={loading}
			aria-label="Refresh integrations"
		>
			רענן
		</button>
	</div>

	{#if errorMsg}
		<div
			class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800/30 dark:bg-red-900/10 dark:text-red-200"
		>
			{errorMsg}
		</div>
	{/if}

	<div class="mt-4 grid gap-3">
		{#each integrations as item (item.id)}
			<div
				class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
			>
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							<h2 class="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
								{item.name}
							</h2>
							<span
								class={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + badgeClasses(item)}
							>
								{badgeText(item)}
							</span>
						</div>
						<div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
							<span class="font-mono">{item.id}</span>
							{#if item.health.base_url}
								<span class="mx-1">•</span>
								<span class="font-mono">{item.health.base_url}</span>
							{/if}
							{#if item.health.latency_ms !== null}
								<span class="mx-1">•</span>
								<span>{item.health.latency_ms}ms</span>
							{/if}
						</div>
					</div>
					<label class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
						<input
							type="checkbox"
							checked={item.enabled}
							disabled={saving.has(item.id)}
							onchange={() => toggleEnabled(item)}
							class="size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700"
							aria-label="Enable integration"
						/>
						פעיל
					</label>
				</div>
			</div>
		{/each}
	</div>
</div>
