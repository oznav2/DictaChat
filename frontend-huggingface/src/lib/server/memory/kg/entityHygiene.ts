const EXACT_BLOCKLIST = new Set([
	"search_memory",
	"add_to_memory_bank",
	"create_memory",
	"update_memory",
	"archive_memory",
	"get_context_insights",
	"record_response",
	"validated",
	"memory_bank",
	"working",
	"history",
	"patterns",
	"books",
	"function",
	"parameter",
	"response",
	"request",
	"query",
	"result",
	"collection",
	"collections",
	"metadata",
	"timestamp",
	"document",
]);

const ALLOWLIST = new Set<string>([]);

export function normalizeEntityLabel(raw: string): string {
	return raw
		.trim()
		.replace(/^[^\w\u0590-\u05FF]+|[^\w\u0590-\u05FF]+$/g, "")
		.replace(/\s+/g, " ");
}

export function isEntityBlocklistedLabel(rawLabel: string): boolean {
	const label = normalizeEntityLabel(rawLabel);
	if (!label) return true;

	const lower = label.toLowerCase();
	if (ALLOWLIST.has(lower)) return false;

	if (EXACT_BLOCKLIST.has(lower)) return true;

	if (lower.includes("_") || lower.includes("-")) {
		for (const blocked of EXACT_BLOCKLIST) {
			if (blocked.length >= 4 && lower.includes(blocked)) return true;
		}
	}

	return false;
}
