import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createDictaEmbeddingClient } from "$lib/server/memory";
import type { EmbeddingServiceDiagnostics } from "$lib/server/memory/embedding/DictaEmbeddingClient";
import { env } from "$env/dynamic/private";

/**
 * API endpoint to manage embedding service circuit breaker
 *
 * Enterprise-grade endpoint with comprehensive diagnostics:
 * - GET: Get circuit breaker status + full diagnostics
 * - POST: Reset circuit breaker / enter/exit degraded mode
 *
 * This endpoint is critical for monitoring embedding service health
 * and managing graceful degradation when the service is unavailable.
 */

// Singleton for circuit breaker management
let embeddingClient: ReturnType<typeof createDictaEmbeddingClient> | null = null;

function getEmbeddingClient() {
	if (!embeddingClient) {
		embeddingClient = createDictaEmbeddingClient({
			endpoint: env.EMBEDDING_SERVICE_URL || "http://dicta-retrieval:5005",
			// Enable graceful degradation by default
			enableGracefulDegradation: true,
		});
	}
	return embeddingClient;
}

export const GET: RequestHandler = async ({ locals }) => {
	try {
		if (!locals.isAdmin) {
			return json(
				{
					success: false,
					error: "Admin only",
				},
				{ status: 403 }
			);
		}

		const client = getEmbeddingClient();

		// Get comprehensive diagnostics if available
		const getDiagnostics = (
			client as unknown as { getDiagnostics?: () => EmbeddingServiceDiagnostics }
		)?.getDiagnostics;
		const diagnostics = getDiagnostics?.call(client);

		// Get basic circuit breaker status as fallback
		const status = client.getCircuitBreakerStatus();

		// Health check
		const isHealthy = await client.healthCheck();

		// Get operational status
		const isOperational =
			(client as unknown as { isOperational?: () => boolean })?.isOperational?.() ?? !status.isOpen;
		const isDegradedMode =
			(client as unknown as { isDegradedMode?: () => boolean })?.isDegradedMode?.() ?? false;

		// Build response with all available information
		return json({
			success: true,
			// Core status
			circuitBreaker: {
				...status,
				// Include error category if available
				lastErrorCategory: diagnostics?.lastErrorCategory ?? null,
				lastError: diagnostics?.lastError ?? null,
			},
			embeddingServiceHealthy: isHealthy,
			endpoint: env.EMBEDDING_SERVICE_URL || "http://dicta-retrieval:5005",

			// Enterprise features
			isOperational, // True if service works OR graceful degradation active
			isDegradedMode, // True if using fallback embeddings

			// Full diagnostics (if available)
			diagnostics: diagnostics ?? null,

			// Always include recommendations
			recommendations:
				diagnostics?.recommendations ??
				(status.isOpen
					? [
							"Circuit breaker is OPEN - embedding requests will fail fast",
							'POST to this endpoint with {"action":"reset"} to close circuit breaker',
							'Or POST with {"action":"degraded","enabled":true} to enable fallback mode',
						]
					: ["System operational"]),
		});
	} catch (err) {
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : String(err),
			},
			{ status: 500 }
		);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.isAdmin) {
		return json(
			{
				success: false,
				error: "Admin only",
			},
			{ status: 403 }
		);
	}

	const body = await request.json().catch(() => ({}));
	const action = body.action as string;

	// Supported actions: reset, degraded
	if (!["reset", "degraded"].includes(action)) {
		return json(
			{
				success: false,
				error:
					"Invalid action. Supported actions: 'reset' (reset circuit breaker), 'degraded' (manage degraded mode)",
				usage: {
					reset: 'POST {"action":"reset"} - Reset circuit breaker if service is healthy',
					degraded:
						'POST {"action":"degraded","enabled":true|false} - Enable/disable graceful degradation mode',
				},
			},
			{ status: 400 }
		);
	}

	try {
		const client = getEmbeddingClient();

		// Handle degraded mode action
		if (action === "degraded") {
			const enabled = body.enabled as boolean;

			if (typeof enabled !== "boolean") {
				return json(
					{
						success: false,
						error:
							'Missing or invalid \'enabled\' parameter. Use {"action":"degraded","enabled":true|false}',
					},
					{ status: 400 }
				);
			}

			if (enabled) {
				(client as unknown as { enterDegradedMode?: () => void })?.enterDegradedMode?.();
			} else {
				(client as unknown as { exitDegradedMode?: () => void })?.exitDegradedMode?.();
			}

			return json({
				success: true,
				message: enabled
					? "Degraded mode enabled - using fallback embeddings"
					: "Degraded mode disabled",
				degradedMode: enabled,
			});
		}

		// Handle reset action
		// Check if service is healthy before resetting
		const isHealthy = await client.healthCheck();

		// Get current diagnostics
		const getDiagnostics = (
			client as unknown as { getDiagnostics?: () => EmbeddingServiceDiagnostics }
		)?.getDiagnostics;
		const diagnostics = getDiagnostics?.call(client);

		if (!isHealthy) {
			// Build detailed recovery steps based on error category
			const recoverySteps: string[] = [
				"1. Check container status: docker-compose ps dicta-retrieval",
				"2. Check container logs: docker-compose logs --tail=50 dicta-retrieval",
			];

			if (diagnostics?.lastErrorCategory === "configuration") {
				recoverySteps.push(
					"3. CONFIGURATION ERROR: Check MODEL_IDLE_TIMEOUT environment variable (must be > 0)"
				);
				recoverySteps.push(
					"4. Fix the configuration and restart: docker-compose restart dicta-retrieval"
				);
			} else if (diagnostics?.lastErrorCategory === "service_down") {
				recoverySteps.push(
					"3. SERVICE DOWN: Start the container: docker-compose up -d dicta-retrieval"
				);
			} else {
				recoverySteps.push("3. Restart the service: docker-compose restart dicta-retrieval");
			}

			recoverySteps.push(`${recoverySteps.length + 1}. Wait 30 seconds for GPU model to load`);
			recoverySteps.push(`${recoverySteps.length + 1}. Retry this endpoint`);
			recoverySteps.push("");
			recoverySteps.push(
				"ALTERNATIVE: Enable graceful degradation to continue without embeddings:"
			);
			recoverySteps.push('POST {"action":"degraded","enabled":true}');

			return json(
				{
					success: false,
					error: "Cannot reset circuit breaker: embedding service is not healthy",
					lastError: diagnostics?.lastError ?? null,
					lastErrorCategory: diagnostics?.lastErrorCategory ?? null,
					recoverySteps,
				},
				{ status: 503 }
			);
		}

		// Reset the circuit breaker
		client.resetCircuitBreaker();

		// Exit degraded mode if service is healthy
		(client as unknown as { exitDegradedMode?: () => void })?.exitDegradedMode?.();

		const status = client.getCircuitBreakerStatus();

		return json({
			success: true,
			message: "Circuit breaker reset successfully - service is operational",
			circuitBreaker: status,
			degradedMode: false,
		});
	} catch (err) {
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : String(err),
			},
			{ status: 500 }
		);
	}
};
