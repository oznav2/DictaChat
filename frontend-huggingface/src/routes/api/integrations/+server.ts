import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { z } from "zod";
import { env } from "$env/dynamic/private";
import { collections } from "$lib/server/database";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { getMemoryEnvConfig } from "$lib/server/memory";

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

type IntegrationDef = Omit<IntegrationItem, "enabled" | "health"> & {
	defaultEnabled: boolean;
	fallback: Pick<IntegrationHealth, "configured" | "base_url">;
	healthProbe: () => Promise<IntegrationHealth>;
};

const updateSchema = z.object({
	updates: z
		.array(z.object({ id: z.string().min(1).max(64), enabled: z.boolean() }))
		.min(1)
		.max(50),
});

function safeBaseUrl(input: string | undefined | null): string | null {
	const raw = (input ?? "").trim();
	if (!raw) return null;
	try {
		return new URL(raw).origin;
	} catch {
		return null;
	}
}

async function fetchHealth(url: string, timeoutMs: number): Promise<{ ok: boolean; latency_ms: number | null; error: string | null }> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	const start = Date.now();
	try {
		const res = await fetch(url, { signal: controller.signal });
		const latency_ms = Date.now() - start;
		return { ok: res.ok, latency_ms, error: res.ok ? null : `http_${res.status}` };
	} catch (err) {
		const latency_ms = Date.now() - start;
		const message = err instanceof Error ? err.message : String(err);
		const error =
			message.toLowerCase().includes("aborted") || message.toLowerCase().includes("timeout")
				? "timeout"
				: "network_error";
		return { ok: false, latency_ms, error };
	} finally {
		clearTimeout(timeoutId);
	}
}

function buildDefaults(): IntegrationDef[] {
	const memEnv = getMemoryEnvConfig();
	const qdrantBase = `${memEnv.qdrantHttps ? "https" : "http"}://${memEnv.qdrantHost}:${memEnv.qdrantPort}`;

	const doclingUrl = env.DOCLING_SERVER_URL || "http://docling:5001";
	const embeddingUrl = env.EMBEDDING_SERVICE_URL || "http://localhost:5005";
	const rerankerUrl = env.RERANKER_SERVICE_URL || "http://localhost:5006";

	return [
		{
			id: "qdrant",
			name: "Qdrant (Vector DB)",
			kind: "service",
			defaultEnabled: true,
			fallback: { configured: true, base_url: safeBaseUrl(qdrantBase) },
			healthProbe: async (): Promise<IntegrationHealth> => {
				const { ok, latency_ms, error } = await fetchHealth(`${qdrantBase}/healthz`, 1000);
				return { ok, configured: true, base_url: safeBaseUrl(qdrantBase), latency_ms, error };
			},
		},
		{
			id: "docling",
			name: "Docling (Document extraction)",
			kind: "service",
			defaultEnabled: true,
			fallback: { configured: Boolean(doclingUrl), base_url: safeBaseUrl(doclingUrl) },
			healthProbe: async (): Promise<IntegrationHealth> => {
				const configured = Boolean(doclingUrl);
				if (!configured) return { ok: false, configured: false, base_url: null, latency_ms: null, error: "missing_url" };
				const { ok, latency_ms, error } = await fetchHealth(`${doclingUrl.replace(/\/$/, "")}/health`, 1500);
				return { ok, configured: true, base_url: safeBaseUrl(doclingUrl), latency_ms, error };
			},
		},
		{
			id: "embedding_service",
			name: "Embedding service",
			kind: "service",
			defaultEnabled: true,
			fallback: { configured: Boolean(embeddingUrl), base_url: safeBaseUrl(embeddingUrl) },
			healthProbe: async (): Promise<IntegrationHealth> => {
				const configured = Boolean(embeddingUrl);
				if (!configured) return { ok: false, configured: false, base_url: null, latency_ms: null, error: "missing_url" };
				const { ok, latency_ms, error } = await fetchHealth(`${embeddingUrl.replace(/\/$/, "")}/health`, 1500);
				return { ok, configured: true, base_url: safeBaseUrl(embeddingUrl), latency_ms, error };
			},
		},
		{
			id: "reranker_service",
			name: "Reranker service",
			kind: "service",
			defaultEnabled: true,
			fallback: { configured: Boolean(rerankerUrl), base_url: safeBaseUrl(rerankerUrl) },
			healthProbe: async (): Promise<IntegrationHealth> => {
				const configured = Boolean(rerankerUrl);
				if (!configured) return { ok: false, configured: false, base_url: null, latency_ms: null, error: "missing_url" };
				const { ok, latency_ms, error } = await fetchHealth(`${rerankerUrl.replace(/\/$/, "")}/health`, 1500);
				return { ok, configured: true, base_url: safeBaseUrl(rerankerUrl), latency_ms, error };
			},
		},
	];
}

export const GET: RequestHandler = async () => {
	const docs = await collections.integrations.find({ userId: ADMIN_USER_ID }).toArray();
	const enabledMap = new Map(docs.map((d) => [d.integrationId, Boolean(d.enabled)]));

	const defs = buildDefaults();
	const health = await Promise.all(
		defs.map((d) =>
			d.healthProbe().catch(() => ({
				ok: false,
				configured: d.fallback.configured,
				base_url: d.fallback.base_url,
				latency_ms: null,
				error: "probe_failed",
			}))
		)
	);

	const items: IntegrationItem[] = defs.map((d, idx) => ({
		id: d.id,
		name: d.name,
		kind: d.kind,
		enabled: enabledMap.has(d.id) ? (enabledMap.get(d.id) as boolean) : d.defaultEnabled,
		health: health[idx],
	}));

	return json({ integrations: items, as_of: new Date().toISOString() });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = updateSchema.parse(await request.json());
	const now = new Date();

	const ops = body.updates.map((u) => ({
		updateOne: {
			filter: { userId: ADMIN_USER_ID, integrationId: u.id },
			update: {
				$set: { enabled: u.enabled, updatedAt: now },
				$setOnInsert: { createdAt: now, userId: ADMIN_USER_ID, integrationId: u.id },
			},
			upsert: true,
		},
	}));

	if (ops.length > 0) {
		await collections.integrations.bulkWrite(ops, { ordered: false });
	}

	return json({ success: true });
};
