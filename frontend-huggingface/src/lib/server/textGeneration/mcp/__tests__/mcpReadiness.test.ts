import { describe, expect, it } from "vitest";

import {
	MCP_EMPTY_WARN_INTERVAL_MS,
	resetMcpReadinessState,
	shouldWarnOnEmptyServers,
} from "../mcpReadiness";

describe("shouldWarnOnEmptyServers", () => {
	it("warns on the first empty-server observation", () => {
		resetMcpReadinessState();
		expect(shouldWarnOnEmptyServers(0, 0)).toBe(true);
	});

	it("suppresses repeated warnings within the interval", () => {
		resetMcpReadinessState();
		expect(shouldWarnOnEmptyServers(0, 0)).toBe(true);
		expect(shouldWarnOnEmptyServers(0, MCP_EMPTY_WARN_INTERVAL_MS - 1)).toBe(false);
	});

	it("warns again after the interval elapses", () => {
		resetMcpReadinessState();
		expect(shouldWarnOnEmptyServers(0, 0)).toBe(true);
		expect(shouldWarnOnEmptyServers(0, MCP_EMPTY_WARN_INTERVAL_MS)).toBe(true);
	});

	it("does not warn when servers exist", () => {
		resetMcpReadinessState();
		expect(shouldWarnOnEmptyServers(3, 0)).toBe(false);
	});
});
