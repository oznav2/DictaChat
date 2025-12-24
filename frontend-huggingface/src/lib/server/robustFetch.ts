import { fetch } from "undici";
import { logger } from "$lib/server/logger";
import iconv from "iconv-lite";

const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;
const TIMEOUT = 30000;

const COMMON_HEADERS = {
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	Accept:
		"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
	"Accept-Language": "he,en-US;q=0.9,en;q=0.8",
	"Cache-Control": "no-cache",
	Pragma: "no-cache",
	"Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
	"Sec-Ch-Ua-Mobile": "?0",
	"Sec-Ch-Ua-Platform": '"Windows"',
	"Sec-Fetch-Dest": "document",
	"Sec-Fetch-Mode": "navigate",
	"Sec-Fetch-Site": "none",
	"Sec-Fetch-User": "?1",
	"Upgrade-Insecure-Requests": "1",
};

export interface RobustFetchOptions extends RequestInit {
	timeout?: number;
	retries?: number;
	forceEncoding?: string;
}

export interface RobustFetchResponse {
	content: Buffer;
	contentType: string;
	charset: string;
	text: () => string;
	status: number;
	statusText: string;
	headers: Headers;
}

/**
 * Enterprise-grade robust fetching with retry, timeout, and encoding handling.
 */
export async function robustFetch(
	url: string,
	options: RobustFetchOptions = {}
): Promise<RobustFetchResponse> {
	const { timeout = TIMEOUT, retries = MAX_RETRIES, ...fetchOptions } = options;

	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= retries; attempt++) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			if (attempt > 0) {
				logger.info({ url, attempt }, "Retrying fetch...");
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * attempt));
			}

			const response = await fetch(url, {
				...fetchOptions,
				headers: {
					...COMMON_HEADERS,
					...(fetchOptions.headers as any),
				},
				signal: controller.signal,
			} as any);

			clearTimeout(timeoutId);

			if (!response.ok) {
				// Retry on 5xx or specific 4xx (like 429)
				if (response.status >= 500 || response.status === 429) {
					throw new Error(`HTTP ${response.status} ${response.statusText}`);
				}
				// For other 4xx, don't retry, just return
			}

			// Read buffer
			const buffer = Buffer.from(await response.arrayBuffer());

			// Detect charset
			const contentType = response.headers.get("content-type") || "";
			let charset = detectCharset(contentType, buffer);

			if (options.forceEncoding) {
				charset = options.forceEncoding;
			}

			return {
				content: buffer,
				contentType,
				charset,
				status: response.status,
				statusText: response.statusText,
				headers: response.headers as unknown as Headers,
				text: () => decodeBuffer(buffer, charset),
			};
		} catch (e: any) {
			clearTimeout(timeoutId);
			lastError = e;
			logger.warn({ url, attempt, error: e.message }, "Fetch attempt failed");

			if (e.name === "AbortError") {
				throw new Error(`Fetch timeout after ${timeout}ms`);
			}
		}
	}

	throw lastError || new Error("Fetch failed after retries");
}

function detectCharset(contentType: string, buffer: Buffer): string {
	// 1. Try Content-Type header
	const headerMatch = contentType.match(/charset=([^;]+)/i);
	if (headerMatch && headerMatch[1]) {
		const charset = headerMatch[1].trim().toLowerCase();
		// Validate charset is supported
		if (iconv.encodingExists(charset)) {
			return charset;
		}
	}

	// 2. Try sniffing HTML meta tags (for text/html)
	if (contentType.includes("html")) {
		const head = buffer.slice(0, 1024).toString("ascii"); // Peek first 1KB

		// <meta charset="utf-8">
		const metaCharset = head.match(/<meta[^>]+charset=["']?([^"'>]+)["']?/i);
		if (metaCharset && metaCharset[1]) {
			const charset = metaCharset[1].trim().toLowerCase();
			if (iconv.encodingExists(charset)) return charset;
		}

		// <meta http-equiv="Content-Type" content="...; charset=...">
		const metaHttpEquiv = head.match(
			/<meta[^>]+http-equiv=["']?Content-Type["']?[^>]+content=["']?[^"'>]*charset=([^"'>;]+)/i
		);
		if (metaHttpEquiv && metaHttpEquiv[1]) {
			const charset = metaHttpEquiv[1].trim().toLowerCase();
			if (iconv.encodingExists(charset)) return charset;
		}
	}

	// 3. Fallback to UTF-8
	return "utf-8";
}

function decodeBuffer(buffer: Buffer, charset: string): string {
	try {
		return iconv.decode(buffer, charset);
	} catch (e) {
		logger.warn(
			{ charset, error: String(e) },
			"Failed to decode buffer with detected charset, falling back to utf-8"
		);
		return iconv.decode(buffer, "utf-8");
	}
}
