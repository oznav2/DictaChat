import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { KeyValuePair } from "$lib/types/Tool";
import { config } from "$lib/server/config";
import type { RequestHandler } from "./$types";
import { isValidUrl } from "$lib/server/urlSafety";
import { isStrictHfMcpLogin, hasNonEmptyToken } from "$lib/server/mcp/hf";

interface HealthCheckRequest {
	url: string;
	headers?: KeyValuePair[];
}

interface HealthCheckResponse {
	ready: boolean;
	tools?: Array<{
		name: string;
		description?: string;
		inputSchema?: unknown;
	}>;
	error?: string;
	authRequired?: boolean;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	let client: Client | undefined;

	try {
		const body: HealthCheckRequest = await request.json();
		const { url, headers } = body;

		if (!url) {
			return new Response(JSON.stringify({ ready: false, error: "URL is required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// URL validation handled above
		// For Docker internal communication, we might need to adjust the URL
		// if the frontend is trying to access localhost from inside the container.
		let targetUrl = url;
		
		// If running in Docker (detect via environment or hostname), replace localhost with host.docker.internal
		// This is a heuristic - in a real prod env, the user should provide the correct service name
		if (process.env.DOCKER_ENV && (url.includes('localhost') || url.includes('127.0.0.1'))) {
			// Replace localhost with mcpo service name or host.docker.internal
			// Since we know the service name is 'mcpo', we can try that first
			// or host.docker.internal if we want to reach the host
			// BUT: The user provided URL is likely what they see in their browser (localhost:8888)
			// From inside the frontend container, localhost refers to the frontend container itself.
			// We need to route to the mcpo container.
			
			// Option 1: If the user entered localhost:8888, they likely mean the host machine's port 8888
			// which is mapped to mcpo container. From inside frontend container, we should use
			// host.docker.internal:8888 (if on Mac/Windows) or the service name 'mcpo:8888' if on the same network.
			
			// Let's try to be smart: if the port is 8888, it's likely our mcpo service.
			if (url.includes(':8888')) {
				targetUrl = url.replace(/localhost|127\.0\.0\.1/, 'mcpo-dicta');
				
				// Auto-fix path for MCPO: MCPO hosts tools under /{server_name}/sse
				// If the URL is just root or /sse, we might need to be specific, but
				// typically users should provide the full path like http://localhost:8888/memory/sse
				// However, if they just provide http://localhost:8888, we can't easily guess which server they want.
				// But we can at least ensure we don't fail on connection.
				
				// Check if the URL already has a subpath (e.g., /memory/sse)
				// The user provided URL might be http://localhost:8888/ or http://localhost:8888
				const urlObj = new URL(targetUrl);
				if (urlObj.pathname === '/' || urlObj.pathname === '/sse') {
					// Default to /memory/sse if no path provided, as a fallback
					// This is better than failing with 404
					// Ideally we should list available servers from openapi.json, but that's complex here.
					// For now, let's assume 'memory' is a safe default to check connectivity.
					// Or even better, try to fetch openapi.json to see if we are connected.
					// But the frontend expects a specific MCP connection.
					
					// Let's modify the path to point to a valid MCP endpoint
					// The user can override this by providing a full URL in the frontend UI.
					if (!urlObj.pathname.includes('/sse')) {
						targetUrl = targetUrl.replace(/\/$/, '') + '/memory/sse';
					} else {
						// if it ends with /sse but has no server prefix (e.g. mcpo:8888/sse)
						// we need to inject a server name. 
						// This is tricky because we don't know which server.
						// Let's assume 'memory' for now.
						targetUrl = targetUrl.replace('/sse', '/memory/sse');
					}
				}
			}
  		}

		if (!isValidUrl(targetUrl)) {
			// Try validating without strict HTTPS check for local development
			try {
				const parsed = new URL(targetUrl);
				if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
					throw new Error('Invalid protocol');
				}
			} catch {
				return new Response(
					JSON.stringify({
						ready: false,
						error: "Invalid or unsafe URL (only HTTP/HTTPS supported)",
					} as HealthCheckResponse),
					{ status: 400, headers: { "Content-Type": "application/json" } }
				);
			}
		}

		const baseUrl = new URL(targetUrl);

		// Minimal header handling
		const headersRecord: Record<string, string> = headers?.length
			? Object.fromEntries(headers.map((h) => [h.key, h.value]))
			: {};
		if (!headersRecord["Accept"]) {
			headersRecord["Accept"] = "application/json, text/event-stream";
		}

		// If enabled, attach the logged-in user's HF token only for the official HF MCP endpoint
		try {
			const shouldForward = config.MCP_FORWARD_HF_USER_TOKEN === "true";
			const userToken =
				(locals as unknown as { hfAccessToken?: string } | undefined)?.hfAccessToken ??
				(locals as unknown as { token?: string } | undefined)?.token;
			const hasAuth = typeof headersRecord["Authorization"] === "string";
			const isHfMcpTarget = isStrictHfMcpLogin(url);
			if (shouldForward && !hasAuth && isHfMcpTarget && hasNonEmptyToken(userToken)) {
				headersRecord["Authorization"] = `Bearer ${userToken}`;
			}
		} catch {
			// best-effort overlay
		}

		// Add an abort timeout to outbound requests (align with fetch-url: 30s)
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 30000);
		const signal = controller.signal;
		const requestInit: RequestInit = {
			headers: headersRecord,
			signal,
		};

		let httpError: Error | undefined;
		let lastError: Error | undefined;

		// Try Streamable HTTP transport first
		try {
			console.log(`[MCP Health] Trying HTTP transport for ${url}`);
			client = new Client({
				name: "chat-ui-health-check",
				version: "1.0.0",
			});

			const transport = new StreamableHTTPClientTransport(baseUrl, { requestInit });
			console.log(`[MCP Health] Connecting to ${url}...`);
			await client.connect(transport);
			console.log(`[MCP Health] Connected successfully via HTTP`);

			// Connection successful, get tools
			const toolsResponse = await client.listTools();

			// Disconnect after getting tools
			await client.close();

			if (toolsResponse && toolsResponse.tools) {
				const response: HealthCheckResponse = {
					ready: true,
					tools: toolsResponse.tools.map((tool) => ({
						name: tool.name,
						description: tool.description,
						inputSchema: tool.inputSchema,
					})),
					authRequired: false,
				};

				const res = new Response(JSON.stringify(response), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
				clearTimeout(timeoutId);
				return res;
			} else {
				const res = new Response(
					JSON.stringify({
						ready: false,
						error: "Connected but no tools available",
						authRequired: false,
					} as HealthCheckResponse),
					{
						status: 503,
						headers: { "Content-Type": "application/json" },
					}
				);
				clearTimeout(timeoutId);
				return res;
			}
		} catch (error) {
			httpError = error instanceof Error ? error : new Error(String(error));
			lastError = httpError;
			console.log("Streamable HTTP failed, trying SSE transport...", lastError.message);

			// Close failed client
			try {
				await client?.close();
			} catch {
				// Ignore
			}

			// Try SSE transport
			try {
				console.log(`[MCP Health] Trying SSE transport for ${url}`);
				client = new Client({
					name: "chat-ui-health-check",
					version: "1.0.0",
				});

				const sseTransport = new SSEClientTransport(baseUrl, { requestInit });
				console.log(`[MCP Health] Connecting via SSE...`);
				await client.connect(sseTransport);
				console.log(`[MCP Health] Connected successfully via SSE`);

				// Connection successful, get tools
				const toolsResponse = await client.listTools();

				// Disconnect after getting tools
				await client.close();

				if (toolsResponse && toolsResponse.tools) {
					const response: HealthCheckResponse = {
						ready: true,
						tools: toolsResponse.tools.map((tool) => ({
							name: tool.name,
							description: tool.description,
							inputSchema: tool.inputSchema,
						})),
						authRequired: false,
					};

					const res = new Response(JSON.stringify(response), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
					clearTimeout(timeoutId);
					return res;
				} else {
					const res = new Response(
						JSON.stringify({
							ready: false,
							error: "Connected but no tools available",
							authRequired: false,
						} as HealthCheckResponse),
						{
							status: 503,
							headers: { "Content-Type": "application/json" },
						}
					);
					clearTimeout(timeoutId);
					return res;
				}
			} catch (sseError) {
				lastError = sseError instanceof Error ? sseError : new Error(String(sseError));
				// Prefer the HTTP error when both failed so UI shows the primary failure (e.g., HTTP 500) instead
				// of the fallback SSE message.
				if (httpError) {
					lastError = new Error(
						`HTTP transport failed: ${httpError.message}; SSE fallback failed: ${lastError.message}`,
						{ cause: sseError instanceof Error ? sseError : undefined }
					);
				}
				console.error("Both transports failed. Last error:", lastError);
			}
		}

		// Both transports failed
		let errorMessage = lastError?.message || "Failed to connect to MCP server";

		// Detect unauthorized to signal auth requirement
		const lower = (errorMessage || "").toLowerCase();
		const authRequired =
			lower.includes("unauthorized") ||
			lower.includes("forbidden") ||
			lower.includes("401") ||
			lower.includes("403");

		// Provide more helpful error messages
		if (authRequired) {
			errorMessage =
				"Authentication required. Provide appropriate Authorization headers in the server configuration.";
		} else if (errorMessage.includes("not valid JSON")) {
			errorMessage =
				"Server returned invalid response. This might not be a valid MCP endpoint. MCP servers should respond to POST requests at /mcp with JSON-RPC messages.";
		} else if (errorMessage.includes("fetch failed") || errorMessage.includes("ECONNREFUSED")) {
			errorMessage = `Cannot connect to ${url}. Please verify the server is running and accessible.`;
		} else if (errorMessage.includes("CORS")) {
			errorMessage = `CORS error. The MCP server needs to allow requests from this origin.`;
		}

		const res = new Response(
			JSON.stringify({
				ready: false,
				error: errorMessage,
				authRequired,
			} as HealthCheckResponse),
			{
				status: 503,
				headers: { "Content-Type": "application/json" },
			}
		);
		clearTimeout(timeoutId);
		return res;
	} catch (error) {
		console.error("MCP health check failed:", error);

		// Clean up client if it exists
		try {
			await client?.close();
		} catch {
			// Ignore
		}

		const response: HealthCheckResponse = {
			ready: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};

		const res = new Response(JSON.stringify(response), {
			status: 503,
			headers: { "Content-Type": "application/json" },
		});
		return res;
	}
};
