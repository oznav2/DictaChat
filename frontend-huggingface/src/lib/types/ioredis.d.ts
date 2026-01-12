/**
 * Minimal type declarations for ioredis
 * Used only for optional Redis embedding cache
 */
declare module "ioredis" {
	interface RedisOptions {
		maxRetriesPerRequest?: number;
		retryStrategy?: (times: number) => number | null;
		lazyConnect?: boolean;
	}

	export default class Redis {
		constructor(url: string, options?: RedisOptions);
		get(key: string): Promise<string | null>;
		set(key: string, value: string, mode?: string, duration?: number): Promise<"OK">;
		mget(...keys: string[]): Promise<(string | null)[]>;
		expire(key: string, seconds: number): Promise<number>;
		pipeline(): Pipeline;
		quit(): Promise<"OK">;
	}

	interface Pipeline {
		set(key: string, value: string, mode: string, duration: number): Pipeline;
		exec(): Promise<[Error | null, unknown][]>;
	}
}
