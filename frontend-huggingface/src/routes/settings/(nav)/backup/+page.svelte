<script lang="ts">
	import { base } from "$app/paths";
	import JSZip from "jszip";
	import { browser } from "$app/environment";
	import { onMount } from "svelte";

	type MergeStrategy = "merge" | "replace" | "skip_existing";

	let exporting = $state(false);
	let importDryRun = $state(true);
	let importing = $state(false);
	let mergeStrategy = $state<MergeStrategy>("merge");
	let lastImportResult = $state<Record<string, unknown> | null>(null);
	let importError = $state<string | null>(null);
	let preRestoreBackup = $state<{
		exportedAt: string;
		size_bytes: number;
		payload: unknown;
	} | null>(null);

	let exportFormat = $state<"json" | "zip">("zip");
	let includeArchived = $state(true);
	let includeTiers = $state("all");
	let includeOutcomes = $state(true);
	let includeActionOutcomes = $state(true);
	let includeKg = $state(true);
	let includeRoutingKg = $state(true);
	let includeActionKg = $state(true);
	let includeVersions = $state(true);
	let includePersonalityMappings = $state(true);
	let includeReindexCheckpoints = $state(true);
	let includeConsistencyLogs = $state(true);

	type BackupEstimate = {
		total_docs: number;
		total_bytes: number;
		collection_counts: Record<string, number>;
		qdrant: {
			ok: boolean;
			point_count: number;
			collection_exists: boolean;
			vector_dims: number | null;
		};
	};

	let estimate = $state<BackupEstimate | null>(null);
	let estimateLoading = $state(false);
	let estimateError = $state<string | null>(null);

	function formatBytes(bytes: number): string {
		if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
		const units = ["B", "KB", "MB", "GB", "TB"];
		let value = bytes;
		let i = 0;
		while (value >= 1024 && i < units.length - 1) {
			value /= 1024;
			i++;
		}
		return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
	}

	function buildBackupParams() {
		return new URLSearchParams({
			includeArchived: String(includeArchived),
			includeTiers,
			includeOutcomes: String(includeOutcomes),
			includeActionOutcomes: String(includeActionOutcomes),
			includeKg: String(includeKg),
			includeRoutingKg: String(includeRoutingKg),
			includeActionKg: String(includeActionKg),
			includeVersions: String(includeVersions),
			includePersonalityMappings: String(includePersonalityMappings),
			includeReindexCheckpoints: String(includeReindexCheckpoints),
			includeConsistencyLogs: String(includeConsistencyLogs),
		});
	}

	async function refreshEstimate() {
		if (!browser) return;
		estimateLoading = true;
		estimateError = null;
		try {
			const params = buildBackupParams();
			const res = await fetch(`${base}/api/memory/backup/estimate?${params.toString()}`);
			const data = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error(
					(data && (data.error || data.message)) || `Estimate failed (${res.status})`
				);
			}
			estimate = (data as { estimate?: BackupEstimate }).estimate ?? null;
		} catch (err) {
			estimateError = err instanceof Error ? err.message : String(err);
			estimate = null;
		} finally {
			estimateLoading = false;
		}
	}

	async function exportBackup() {
		exporting = true;
		try {
			const params = buildBackupParams();
			params.set("format", exportFormat);

			const res = await fetch(`${base}/api/memory/backup/export?${params.toString()}`);
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || `Export failed (${res.status})`);
			}

			const blob = await res.blob();
			const cd = res.headers.get("Content-Disposition") ?? "";
			const match = cd.match(/filename="([^"]+)"/);
			const filename = match?.[1] ?? `bricksllm-backup.${exportFormat}`;

			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} finally {
			exporting = false;
		}
	}

	async function readBackupFile(file: File): Promise<unknown> {
		const name = file.name.toLowerCase();
		if (name.endsWith(".zip")) {
			const zip = await JSZip.loadAsync(file);
			const jsonEntry = Object.values(zip.files).find((f) =>
				f.name.toLowerCase().endsWith(".json")
			);
			if (!jsonEntry) throw new Error("ZIP does not contain a .json backup file");
			const text = await jsonEntry.async("string");
			return JSON.parse(text) as unknown;
		}
		const text = await file.text();
		return JSON.parse(text) as unknown;
	}

	async function importBackup(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		importError = null;
		lastImportResult = null;
		preRestoreBackup = null;
		importing = true;
		try {
			const payload = await readBackupFile(file);
			const endpoint = importDryRun
				? `${base}/api/memory/backup/import`
				: `${base}/api/memory/backup/restore`;
			const body = importDryRun
				? { payload, dryRun: true, mergeStrategy }
				: { payload, mergeStrategy };

			const res = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const data = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error((data && (data.error || data.message)) || `Import failed (${res.status})`);
			}
			if (!importDryRun && data && typeof data === "object") {
				const d = data as {
					preRestore?: { exportedAt: string; size_bytes: number; payload: unknown };
					import?: unknown;
				};
				preRestoreBackup = d.preRestore ?? null;
				lastImportResult =
					(d.import as Record<string, unknown>) ?? (data as Record<string, unknown>);
			} else {
				lastImportResult = data as Record<string, unknown>;
			}
		} catch (err) {
			importError = err instanceof Error ? err.message : String(err);
		} finally {
			importing = false;
			input.value = "";
		}
	}

	function downloadPreRestore() {
		if (!preRestoreBackup) return;
		const json = JSON.stringify(preRestoreBackup.payload, null, 2);
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		const dateTag = preRestoreBackup.exportedAt.replace(/[:.]/g, "-");
		a.download = `bricksllm-pre-restore-${dateTag}.json`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	let estimateDebounce: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!browser) return;
		void includeArchived;
		void includeTiers;
		void includeOutcomes;
		void includeActionOutcomes;
		void includeKg;
		void includeRoutingKg;
		void includeActionKg;
		void includeVersions;
		void includePersonalityMappings;
		void includeReindexCheckpoints;
		void includeConsistencyLogs;
		if (estimateDebounce) clearTimeout(estimateDebounce);
		estimateDebounce = setTimeout(() => {
			void refreshEstimate();
		}, 250);
	});

	onMount(() => {
		void refreshEstimate();
	});
</script>

<div class="mx-auto w-full max-w-3xl p-4" dir="rtl">
	<h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
		גיבוי ושחזור / Backup & Restore
	</h1>
	<p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
		ייצוא וייבוא מלא של מערכת הזיכרון, כולל KG ותוצאות. Designed for single-admin deployments.
	</p>

	<div class="mt-4 grid gap-4">
		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">ייצוא גיבוי / Export</h2>

			<div
				class="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
			>
				<div class="flex items-center justify-between gap-2">
					<div class="font-semibold">הערכת גודל / Size estimate</div>
					<button
						type="button"
						class="btn rounded-md text-xs"
						onclick={refreshEstimate}
						disabled={estimateLoading}
						aria-label="Refresh estimate"
					>
						רענן
					</button>
				</div>
				{#if estimateLoading}
					<div class="mt-1 text-gray-500 dark:text-gray-400">טוען…</div>
				{:else if estimateError}
					<div class="mt-1 text-red-700 dark:text-red-300">{estimateError}</div>
				{:else if estimate}
					<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
						<span><span class="font-semibold">{formatBytes(estimate.total_bytes)}</span></span>
						<span class="text-gray-500 dark:text-gray-400">•</span>
						<span>{estimate.total_docs} מסמכים</span>
						<span class="text-gray-500 dark:text-gray-400">•</span>
						<span
							>Qdrant: {estimate.qdrant.ok ? "OK" : "DOWN"} ({estimate.qdrant.point_count} points)</span
						>
					</div>
				{/if}
			</div>

			<div class="mt-3 grid gap-3 text-sm">
				<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
					<label class="flex items-center gap-2">
						<span class="w-40 text-gray-700 dark:text-gray-200">פורמט / Format</span>
						<select
							class="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
							bind:value={exportFormat}
						>
							<option value="zip">ZIP</option>
							<option value="json">JSON</option>
						</select>
					</label>
					<label class="flex items-center gap-2">
						<span class="w-40 text-gray-700 dark:text-gray-200">Tiers</span>
						<input
							class="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 font-mono text-xs dark:border-gray-700 dark:bg-gray-900"
							bind:value={includeTiers}
							placeholder="all או working,history,patterns,books"
						/>
					</label>
				</div>

				<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={includeArchived} />
						<span class="text-gray-700 dark:text-gray-200">כולל ארכיון / Include archived</span>
					</label>
					<div class="text-xs text-gray-500 dark:text-gray-400">
						טיפ: להשאיר פעיל כדי לקבל שחזור מלא.
					</div>
				</div>

				<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={includeOutcomes} />
						<span class="text-gray-700 dark:text-gray-200">Outcomes</span>
					</label>
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={includeActionOutcomes} />
						<span class="text-gray-700 dark:text-gray-200">Action outcomes</span>
					</label>
				</div>

				<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={includeKg} />
						<span class="text-gray-700 dark:text-gray-200">Content KG (nodes/edges)</span>
					</label>
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={includeRoutingKg} />
						<span class="text-gray-700 dark:text-gray-200">Routing KG</span>
					</label>
				</div>

				<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={includeActionKg} />
						<span class="text-gray-700 dark:text-gray-200">Action KG</span>
					</label>
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={includeVersions} />
						<span class="text-gray-700 dark:text-gray-200">Version history</span>
					</label>
				</div>

				<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={includePersonalityMappings} />
						<span class="text-gray-700 dark:text-gray-200">Personality mappings</span>
					</label>
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={includeReindexCheckpoints} />
						<span class="text-gray-700 dark:text-gray-200">Reindex checkpoints</span>
					</label>
				</div>

				<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={includeConsistencyLogs} />
						<span class="text-gray-700 dark:text-gray-200">Consistency logs</span>
					</label>
				</div>

				<div class="mt-2 flex items-center gap-2">
					<button
						type="button"
						class="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
						disabled={exporting}
						onclick={exportBackup}
					>
						{exporting ? "מייצא..." : "הורד גיבוי / Download"}
					</button>
				</div>
			</div>
		</div>

		<div
			class="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
		>
			<h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">שחזור / Import</h2>

			<div class="mt-3 grid gap-3 text-sm">
				<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
					<label class="flex items-center gap-2">
						<span class="w-40 text-gray-700 dark:text-gray-200">Merge strategy</span>
						<select
							class="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
							bind:value={mergeStrategy}
						>
							<option value="merge">merge</option>
							<option value="replace">replace</option>
							<option value="skip_existing">skip_existing</option>
						</select>
					</label>
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={importDryRun} />
						<span class="text-gray-700 dark:text-gray-200">Dry run / הדמיה</span>
					</label>
				</div>

				{#if !importDryRun}
					<div
						class="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800/30 dark:bg-amber-900/10 dark:text-amber-200"
					>
						שחזור אמיתי ייצור אוטומטית גיבוי “Pre-restore” לפני הייבוא.
					</div>
				{/if}

				<label class="block">
					<span class="text-gray-700 dark:text-gray-200"
						>בחר קובץ / Choose backup file (JSON/ZIP)</span
					>
					<input
						class="mt-1 block w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
						type="file"
						accept=".json,.zip,application/json,application/zip"
						onchange={importBackup}
						disabled={importing}
					/>
				</label>

				{#if importing}
					<div class="text-sm text-gray-500 dark:text-gray-400">מייבא... / Importing...</div>
				{/if}

				{#if importError}
					<div
						class="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
					>
						{importError}
					</div>
				{/if}

				{#if lastImportResult}
					<pre class="overflow-auto rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-900"><code
							>{JSON.stringify(lastImportResult, null, 2)}</code
						></pre>
				{/if}

				{#if preRestoreBackup}
					<div
						class="rounded-md border border-gray-200 bg-white p-3 text-xs dark:border-gray-700 dark:bg-gray-900"
					>
						<div class="flex items-center justify-between gap-2">
							<div class="text-gray-700 dark:text-gray-200">
								נוצר Pre-restore: <span class="font-mono">{preRestoreBackup.exportedAt}</span> •
								<span class="font-semibold">{formatBytes(preRestoreBackup.size_bytes)}</span>
							</div>
							<button type="button" class="btn rounded-md text-xs" onclick={downloadPreRestore}>
								הורד Pre-restore
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
