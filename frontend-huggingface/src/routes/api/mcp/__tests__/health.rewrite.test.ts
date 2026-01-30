import { describe, expect, it } from "vitest";

import { rewriteMcpUrlForDocker } from "$lib/server/mcp/rewriteMcpUrlForDocker";

describe("rewriteMcpUrlForDocker", () => {
	it("rewrites localhost:3100 to mcp-sse-proxy under Docker", () => {
		const previousDockerEnv = process.env.DOCKER_ENV;
		process.env.DOCKER_ENV = "true";
		try {
			const rewritten = rewriteMcpUrlForDocker("http://localhost:3100/memory/sse");
			expect(rewritten).toBe("http://mcp-sse-proxy:3100/memory/sse");
		} finally {
			process.env.DOCKER_ENV = previousDockerEnv;
		}
	});

	it("keeps URLs unchanged when not running in Docker", () => {
		const previousDockerEnv = process.env.DOCKER_ENV;
		delete process.env.DOCKER_ENV;
		try {
			const original = "http://localhost:3100/memory/sse";
			const rewritten = rewriteMcpUrlForDocker(original);
			expect(rewritten).toBe(original);
		} finally {
			process.env.DOCKER_ENV = previousDockerEnv;
		}
	});
});
