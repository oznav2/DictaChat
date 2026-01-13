/**
 * Docling Client - Document Text Extraction
 *
 * Calls the Docling service to extract text from PDFs and other documents.
 * Handles both sync and async (task-based) responses from docling-serve.
 */

import { env } from "$env/dynamic/private";
import { readFile } from "fs/promises";
import { basename } from "path";

export interface DoclingConfig {
	endpoint?: string;
	timeout?: number;
	pollInterval?: number;
	onStatus?: (update: { taskId: string; status: string }) => void;
}

export interface DoclingExtractResult {
	text: string;
	pages?: number;
	format?: string;
	taskId?: string;
}

interface DoclingTaskResponse {
	task_id?: string;
	status?: string;
	documents?: DoclingDocument[];
	document?: DoclingDocument;
}

interface DoclingDocument {
	md_content?: string;
	text?: string;
	num_pages?: number;
	input_format?: string;
}

const DEFAULT_CONFIG: DoclingConfig = {
	endpoint: env.DOCLING_SERVER_URL || "http://docling:5001",
	timeout: 120000, // 2 minutes for large documents
	pollInterval: 1000, // 1 second between polls
};

/**
 * Sleep helper for polling
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll for task completion and fetch result
 */
async function pollForTaskResult(
	baseUrl: string,
	taskId: string,
	timeout: number,
	pollInterval: number,
	onStatus?: (update: { taskId: string; status: string }) => void
): Promise<DoclingDocument | null> {
	const startTime = Date.now();
	const statusUrl = `${baseUrl}/v1/convert/status/${taskId}`;
	const resultUrl = `${baseUrl}/v1/convert/result/${taskId}`;

	console.log(`[Docling] Polling for task ${taskId}...`);
	let lastStatus: string | null = null;

	while (Date.now() - startTime < timeout) {
		try {
			// Check status
			const statusResponse = await fetch(statusUrl);
			if (!statusResponse.ok) {
				console.log(`[Docling] Status check failed: ${statusResponse.status}`);
				await sleep(pollInterval);
				continue;
			}

			const statusData = await statusResponse.json();
			console.log(`[Docling] Task status: ${statusData.status}`);

			if (typeof statusData.status === "string" && statusData.status !== lastStatus) {
				lastStatus = statusData.status;
				onStatus?.({ taskId, status: statusData.status });
			}

			if (statusData.status === "completed" || statusData.status === "success") {
				// Fetch the result
				const resultResponse = await fetch(resultUrl);
				if (!resultResponse.ok) {
					throw new Error(`Failed to fetch result: ${resultResponse.status}`);
				}
				const resultData = await resultResponse.json();
				console.log(`[Docling] Got result, keys: ${Object.keys(resultData).join(", ")}`);

				// Return first document from result
				if (resultData.documents && Array.isArray(resultData.documents)) {
					return resultData.documents[0] || null;
				}
				if (resultData.document) {
					return resultData.document;
				}
				return resultData as DoclingDocument;
			}

			if (statusData.status === "failed" || statusData.status === "error") {
				throw new Error(`Docling task failed: ${statusData.error || "Unknown error"}`);
			}

			// Still processing, wait and retry
			await sleep(pollInterval);
		} catch (error) {
			console.error(`[Docling] Poll error:`, error);
			await sleep(pollInterval);
		}
	}

	throw new Error(`Docling task ${taskId} timed out after ${timeout}ms`);
}

/**
 * Sanitize extracted text by removing embedded binary/base64 data and artifacts
 * This handles cases where PDFs have embedded images that get converted to raw binary
 */
export function sanitizeExtractedText(text: string): string {
	if (!text) return "";

	let sanitized = text;

	// Remove inline base64 data URLs (images embedded in markdown/HTML)
	// Pattern: data:image/xxx;base64,... or data:application/xxx;base64,...
	sanitized = sanitized.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "[image]");

	// Remove markdown image references with base64 data
	// Pattern: ![alt](data:image/...)
	sanitized = sanitized.replace(/!\[[^\]]*\]\(data:[^)]+\)/g, "[image]");

	// Remove long sequences of base64-like characters (40+ chars of only base64 alphabet)
	// These appear when binary data leaks into text extraction
	// The pattern seen: mJ2dffny5fj4uMVicTqdfn5+QUFBNBqNz+dHRUWx2WwajYY5DBiGlUrlr7/...
	sanitized = sanitized.replace(/[A-Za-z0-9+/]{40,}={0,2}/g, (match) => {
		// Only remove if it looks like base64 (high ratio of uppercase, has +/)
		const hasBase64Chars = /[+/]/.test(match);
		const ratio = (match.match(/[A-Z]/g) || []).length / match.length;
		if (hasBase64Chars || ratio > 0.3) {
			return "[binary-data-removed]";
		}
		return match;
	});

	// Remove raw binary-looking sequences (non-printable mixed with printable)
	// These are raw bytes that got decoded as text
	sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]{3,}/g, "");

	// Remove sequences with excessive special characters (corrupted binary)
	sanitized = sanitized.replace(/(?:[^\w\s\u0590-\u05FF.,;:!?'"()\[\]{}<>@#$%&*+=-]){10,}/g, "");

	// Normalize whitespace (multiple spaces, tabs, newlines)
	sanitized = sanitized.replace(/[ \t]+/g, " ");
	sanitized = sanitized.replace(/\n{3,}/g, "\n\n");

	// Remove lines that are mostly binary placeholders
	sanitized = sanitized
		.split("\n")
		.filter((line) => {
			const placeholderCount = (line.match(/\[(image|binary-data-removed)\]/g) || []).length;
			const wordCount = line.split(/\s+/).filter((w) => w.length > 0).length;
			// Keep line if it has meaningful content beyond just placeholders
			return placeholderCount < 3 || wordCount - placeholderCount > 2;
		})
		.join("\n");

	return sanitized.trim();
}

/**
 * Extract text from a document - helper to get text from document object
 */
function extractTextFromDocument(doc: DoclingDocument): string {
	let rawText = "";

	// Try multiple possible fields where content might be
	if (doc.md_content && doc.md_content.trim()) {
		rawText = doc.md_content;
	} else if (doc.text && doc.text.trim()) {
		rawText = doc.text;
	} else {
		// Check for content field (some docling versions use this)
		const docAny = doc as Record<string, unknown>;
		if (typeof docAny.content === "string" && docAny.content.trim()) {
			rawText = docAny.content;
		} else if (typeof docAny.markdown === "string" && docAny.markdown.trim()) {
			rawText = docAny.markdown;
		}
	}

	// Always sanitize extracted text to remove binary artifacts
	return sanitizeExtractedText(rawText);
}

/**
 * Extract text from a document using Docling
 */
export async function extractDocumentText(
	filePath: string,
	config?: DoclingConfig
): Promise<DoclingExtractResult> {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	const endpoint = `${cfg.endpoint}/v1/convert/file`;

	try {
		// Read the file
		const fileBuffer = await readFile(filePath);
		const fileName = basename(filePath);

		// Create form data
		const formData = new FormData();
		formData.append("files", new Blob([new Uint8Array(fileBuffer)]), fileName);

		console.log(`[Docling] Sending file ${fileName} to ${endpoint}`);

		// Call Docling
		const response = await fetch(endpoint, {
			method: "POST",
			body: formData,
			signal: AbortSignal.timeout(cfg.timeout || 120000),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Docling extraction failed: ${response.status} - ${errorText}`);
		}

		const result = await response.json();

		// Log response for debugging
		console.log(`[Docling] Response keys: ${Object.keys(result).join(", ")}`);

		let extractedText = "";
		let pages: number | undefined;
		let format: string | undefined;

		// Check if this is an async task response
		if (result.task_id) {
			console.log(`[Docling] Async mode - task_id: ${result.task_id}`);
			cfg.onStatus?.({ taskId: result.task_id, status: "submitted" });
			const doc = await pollForTaskResult(
				cfg.endpoint!,
				result.task_id,
				cfg.timeout || 120000,
				cfg.pollInterval || 1000,
				cfg.onStatus
			);

			if (doc) {
				extractedText = extractTextFromDocument(doc);
				pages = doc.num_pages;
				format = doc.input_format;
			}
		} else {
			// Sync response - extract directly
			cfg.onStatus?.({ taskId: "sync", status: "completed" });
			if (result.documents && Array.isArray(result.documents)) {
				for (const doc of result.documents as DoclingDocument[]) {
					extractedText += extractTextFromDocument(doc) + "\n\n";
					pages = pages || doc.num_pages;
					format = format || doc.input_format;
				}
			} else if (result.document) {
				const doc = result.document as DoclingDocument;
				extractedText = extractTextFromDocument(doc);
				pages = doc.num_pages;
				format = doc.input_format;
			} else {
				// Try to extract from top-level result
				extractedText = extractTextFromDocument(result as DoclingDocument);
				pages = result.num_pages;
				format = result.input_format;
			}
		}

		extractedText = extractedText.trim();
		console.log(
			`[Docling] Extracted ${extractedText.length} chars, ${pages} pages, format: ${format}`
		);

		return {
			text: extractedText,
			pages,
			format,
			taskId: result.task_id,
		};
	} catch (error) {
		if (error instanceof Error) {
			console.error("[Docling] Extraction error:", error.message);
		}
		throw error;
	}
}

/**
 * Create a Docling client with custom config
 */
export function createDoclingClient(config?: DoclingConfig) {
	const cfg = { ...DEFAULT_CONFIG, ...config };

	return {
		extract: (filePath: string) => extractDocumentText(filePath, cfg),
	};
}
