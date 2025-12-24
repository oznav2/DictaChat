import { error } from "@sveltejs/kit";
import { logger } from "$lib/server/logger.js";
import { robustFetch } from "$lib/server/robustFetch";
import { isValidUrl } from "$lib/server/urlSafetyEnhanced";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SECURITY_HEADERS: HeadersInit = {
	// Prevent any active content from executing if someone navigates directly to this endpoint.
	"Content-Security-Policy":
		"default-src 'none'; frame-ancestors 'none'; sandbox; script-src 'none'; img-src 'none'; style-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"Referrer-Policy": "no-referrer",
};

export async function GET({ url }) {
	const targetUrl = url.searchParams.get("url");

	if (!targetUrl) {
		logger.warn("Missing 'url' parameter");
		throw error(400, "Missing 'url' parameter");
	}

	if (!isValidUrl(targetUrl)) {
		logger.warn({ targetUrl }, "Invalid or unsafe URL (only HTTPS is supported)");
		throw error(400, "Invalid or unsafe URL (only HTTPS is supported)");
	}

	try {
		const response = await robustFetch(targetUrl, {
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; BricksLLM-Fetcher/1.0)",
			},
		});

		// Check content length
		if (response.content.length > MAX_FILE_SIZE) {
			throw error(413, "File too large (max 10MB)");
		}

		const safeContentType = response.contentType || "application/octet-stream";

		// Ensure charset is communicated if detected (e.g. from meta tags) but missing in header
		let finalContentType = safeContentType;
		if (response.charset && !finalContentType.toLowerCase().includes("charset=")) {
			finalContentType += `; charset=${response.charset}`;
		}

		return new Response(response.content as BodyInit, {
			headers: {
				...SECURITY_HEADERS,
				"Content-Type": finalContentType, // Return the detected/original content type with charset
				"X-Forwarded-Content-Type": safeContentType,
				"X-Original-Charset": response.charset,
				// Cache control
				"Cache-Control": "public, max-age=3600",
			},
		});
	} catch (e: any) {
		logger.error({ targetUrl, error: e.message }, `Error fetching URL`);
		throw error(500, `Failed to fetch: ${e.message}`);
	}
}
