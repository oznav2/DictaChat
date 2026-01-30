import type { RequestHandler } from "./$types";

import { json } from "@sveltejs/kit";

import { getMcpServersDiagnostics } from "$lib/server/mcp/registry";

// GET /api/admin/diagnostics/mcp - Inspect effective MCP server configuration
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.isAdmin) {
		return json({ success: false, error: "Admin only" }, { status: 403 });
	}

	const diagnostics = getMcpServersDiagnostics();

	return json({
		success: true,
		...diagnostics,
		count: diagnostics.parsedServers.length,
	});
};
