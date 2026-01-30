import type { MCPServer } from "$lib/types/Tool";
import { config } from "$lib/server/config";

const sanitizeJsonEnv = (val: string | undefined): string => {
	const raw = (val || "").trim();
	if (!raw) return "";
	if (
		(raw.startsWith("'") && raw.endsWith("'")) ||
		(raw.startsWith('"') && raw.endsWith('"')) ||
		(raw.startsWith("`") && raw.endsWith("`"))
	) {
		return raw.slice(1, -1).trim();
	}
	return raw;
};

export async function GET() {
	// Prefer MCP_SERVERS but fall back to FRONTEND_MCP_SERVERS for dev/local flows.
	const mcpServersEnv = sanitizeJsonEnv(config.MCP_SERVERS) ||
		sanitizeJsonEnv(config.FRONTEND_MCP_SERVERS) ||
		"[]";

	let servers: Array<{ name: string; url: string; headers?: Record<string, string> }> = [];

	try {
		servers = JSON.parse(mcpServersEnv);
		if (!Array.isArray(servers)) {
			servers = [];
		}
	} catch (error) {
		console.error("Failed to parse MCP_SERVERS env variable:", error);
		servers = [];
	}

	// Convert internal server config to client MCPServer format
	const mcpServers: MCPServer[] = servers.map((server) => ({
		id: `base-${server.name}`, // Stable ID based on name
		name: server.name,
		url: server.url,
		type: "base" as const,
		// headers intentionally omitted
		isLocked: false, // Base servers can be toggled by users
		status: undefined, // Status determined client-side via health check
	}));

	return Response.json(mcpServers);
}
