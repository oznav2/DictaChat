const SERVER_DOMAIN_MAPPING: Record<string, string> = {
	// Servers from servers.json
	everything: "modelcontextprotocol.io",
	docker: "docker.com",
	"sequential-thinking": "modelcontextprotocol.io",
	git: "git-scm.com",
	fetch: "modelcontextprotocol.io",
	time: "time.is",
	memory: "modelcontextprotocol.io",
	filesystem: "modelcontextprotocol.io",
	perplexity: "perplexity.ai",
	tavily: "tavily.com",
	"youtube-video-summarizer": "youtube.com",

	// Other common tools
	postgres: "postgresql.org",
	github: "github.com",
	"brave-search": "brave.com",
	"google-maps": "google.com",
	puppeteer: "pptr.dev",
	slack: "slack.com",
	sentry: "sentry.io",
	gitlab: "gitlab.com",
	linear: "linear.app",
	notion: "notion.so",
	openai: "openai.com",
	anthropic: "anthropic.com",
	discord: "discord.com",
};

function isLocalHostname(hostname: string): boolean {
	const lower = hostname.toLowerCase();
	if (lower === "localhost" || lower === "127.0.0.1" || lower === "0.0.0.0" || lower === "::1") {
		return true;
	}
	if (lower.endsWith(".local")) {
		return true;
	}
	if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) {
		return true;
	}
	if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(lower)) {
		return true;
	}
	if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(lower)) {
		return true;
	}
	return false;
}

/**
 * Generates a Google favicon URL for the given server URL
 * @param serverUrl - The MCP server URL (e.g., "https://mcp.exa.ai/mcp")
 * @param size - The size of the favicon in pixels (default: 64)
 * @returns The Google favicon service URL
 */
export function getMcpServerFaviconUrl(serverUrl: string, size: number = 64): string {
	try {
		const parsed = new URL(serverUrl);
		if (isLocalHostname(parsed.hostname)) {
			return "";
		}

		// Check if it's a proxy URL (e.g. http://mcp-sse-proxy:3100/git/sse)
		// We assume the second part of the path is the server name
		const pathParts = parsed.pathname.split("/").filter(Boolean);
		if (pathParts.length >= 1) {
			const serverName = pathParts[0].toLowerCase();
			if (serverName in SERVER_DOMAIN_MAPPING) {
				const domain = `https://${SERVER_DOMAIN_MAPPING[serverName]}`;
				return `https://www.google.com/s2/favicons?sz=${size}&domain_url=${encodeURIComponent(domain)}`;
			}
		}

		// Extract root domain (e.g., "exa.ai" from "mcp.exa.ai")
		// Google's favicon service needs the root domain, not subdomains
		const hostnameParts = parsed.hostname.split(".");
		const rootDomain =
			hostnameParts.length >= 2 ? hostnameParts.slice(-2).join(".") : parsed.hostname;
		const domain = `${parsed.protocol}//${rootDomain}`;
		return `https://www.google.com/s2/favicons?sz=${size}&domain_url=${encodeURIComponent(domain)}`;
	} catch {
		if (/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1)/i.test(serverUrl)) {
			return "";
		}
		// If URL parsing fails, just use the raw serverUrl - Google will handle it
		return `https://www.google.com/s2/favicons?sz=${size}&domain_url=${encodeURIComponent(serverUrl)}`;
	}
}
