import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getMemoryEnvConfig, createDictaEmbeddingClient } from "$lib/server/memory";
import { env } from "$env/dynamic/private";

async function fetchOk(url: string, timeoutMs: number): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { signal: controller.signal });
		return res.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

// Singleton embedding client for health checks
let embeddingClient: ReturnType<typeof createDictaEmbeddingClient> | null = null;

function getEmbeddingClient() {
	if (!embeddingClient) {
		embeddingClient = createDictaEmbeddingClient({
			endpoint: env.EMBEDDING_SERVICE_URL || "http://dicta-retrieval:5005",
		});
	}
	return embeddingClient;
}

export const GET: RequestHandler = async () => {
	const envConfig = getMemoryEnvConfig();
	const qdrantBase = `${envConfig.qdrantHttps ? "https" : "http"}://${envConfig.qdrantHost}:${envConfig.qdrantPort}`;
	const qdrantOk = await fetchOk(`${qdrantBase}/healthz`, 1000);

	// Check embedding service health
	const embeddingBase = env.EMBEDDING_SERVICE_URL || "http://dicta-retrieval:5005";
	const embeddingOk = await fetchOk(`${embeddingBase}/health`, 3000);
	
	// Get circuit breaker status
	const client = getEmbeddingClient();
	const circuitBreakerStatus = (client as unknown as { getCircuitBreakerStatus?: () => unknown })?.getCircuitBreakerStatus?.() || {
		isOpen: client.isCircuitOpen(),
	};

	const warnings: string[] = [];
	if (!qdrantOk) warnings.push("qdrant_unavailable");
	if (!embeddingOk) warnings.push("embedding_service_unavailable");
	if (client.isCircuitOpen()) warnings.push("embedding_circuit_breaker_open");

	return json({
		success: true,
		health: {
			ok: warnings.length === 0,
			warnings,
			services: {
				qdrant: { ok: qdrantOk, base_url: qdrantBase },
				embedding: { 
					ok: embeddingOk, 
					base_url: embeddingBase,
					circuit_breaker: circuitBreakerStatus,
				},
			},
		},
	});
};
