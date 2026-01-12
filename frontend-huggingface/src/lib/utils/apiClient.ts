import { z } from "zod";
import { randomUUID } from "$lib/utils/randomUuid";

export class ApiClientError extends Error {
	status: number | null;
	url: string;

	constructor(message: string, params: { status: number | null; url: string }) {
		super(message);
		this.status = params.status;
		this.url = params.url;
	}
}

export interface ApiRequestOptions<T> {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	body?: unknown;
	headers?: Record<string, string>;
	idempotent?: boolean;
	retries?: number;
	timeoutMs?: number;
	schema?: z.ZodType<T>;
	fetchImpl?: typeof fetch;
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiRequest<T>(url: string, options: ApiRequestOptions<T> = {}): Promise<T> {
	const {
		method = "GET",
		body,
		headers = {},
		idempotent = false,
		retries = 2,
		timeoutMs = 15_000,
		schema,
		fetchImpl = fetch,
	} = options;

	const requestHeaders: Record<string, string> = {
		...headers,
	};

	if (body !== undefined) {
		requestHeaders["Content-Type"] ??= "application/json";
	}

	if (idempotent) {
		requestHeaders["X-Idempotency-Key"] ??= randomUUID();
	}

	for (let attempt = 0; attempt <= retries; attempt++) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const res = await fetchImpl(url, {
				method,
				headers: requestHeaders,
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: controller.signal,
			});

			const text = await res.text();
			const data = text ? JSON.parse(text) : null;

			if (!res.ok) {
				const message =
					typeof data?.error === "string"
						? data.error
						: typeof data?.message === "string"
							? data.message
							: `HTTP ${res.status}`;
				if (attempt < retries && res.status >= 500) {
					await sleep(Math.pow(2, attempt) * 250 + Math.random() * 150);
					continue;
				}
				throw new ApiClientError(message, { status: res.status, url });
			}

			return schema ? schema.parse(data) : (data as T);
		} catch (err) {
			const isAbort = err instanceof Error && err.name === "AbortError";
			if (attempt < retries && (isAbort || err instanceof TypeError)) {
				await sleep(Math.pow(2, attempt) * 250 + Math.random() * 150);
				continue;
			}
			if (err instanceof ApiClientError) throw err;
			throw new ApiClientError(err instanceof Error ? err.message : "Request failed", {
				status: null,
				url,
			});
		} finally {
			clearTimeout(timeout);
		}
	}

	throw new ApiClientError("Request failed after retries", { status: null, url });
}
