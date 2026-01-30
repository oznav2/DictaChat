function isLocalhostUrl(url: string): boolean {
	return url.includes("localhost") || url.includes("127.0.0.1");
}

/** Rewrite localhost MCP URLs when running inside Docker. */
export function rewriteMcpUrlForDocker(url: string): string {
	if (!process.env.DOCKER_ENV || !isLocalhostUrl(url)) {
		return url;
	}

	// MCP SSE proxy runs on :3100 in this stack.
	if (url.includes(":3100")) {
		return url.replace(/localhost|127\.0\.0\.1/, "mcp-sse-proxy");
	}

	// Legacy MCPO mapping kept for compatibility.
	if (url.includes(":8888")) {
		let targetUrl = url.replace(/localhost|127\.0\.0\.1/, "mcpo-dicta");
		const urlObj = new URL(targetUrl);
		if (urlObj.pathname === "/" || urlObj.pathname === "/sse") {
			if (!urlObj.pathname.includes("/sse")) {
				targetUrl = targetUrl.replace(/\/$/, "") + "/memory/sse";
			} else {
				targetUrl = targetUrl.replace("/sse", "/memory/sse");
			}
		}
		return targetUrl;
	}

	return url;
}
