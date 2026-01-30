const MCP_EMPTY_WARN_INTERVAL_MS = 5 * 60_000;

let lastEmptyWarnAt: number | null = null;

export function shouldWarnOnEmptyServers(serverCount: number, now = Date.now()): boolean {
	if (serverCount > 0) {
		return false;
	}

	if (lastEmptyWarnAt === null || now - lastEmptyWarnAt >= MCP_EMPTY_WARN_INTERVAL_MS) {
		lastEmptyWarnAt = now;
		return true;
	}

	return false;
}

export function resetMcpReadinessState(): void {
	lastEmptyWarnAt = null;
}

export { MCP_EMPTY_WARN_INTERVAL_MS };
