/**
 * Mock for $env/dynamic/private and $env/static/private SvelteKit modules
 * Used in vitest to simulate SvelteKit runtime environment variables
 */

// Export common environment variables used in the app
export const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
export const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
export const EMBEDDING_URL = process.env.EMBEDDING_URL || 'http://localhost:5005';
export const RERANKER_URL = process.env.RERANKER_URL || 'http://localhost:5006';
export const MEMORY_ENABLED = process.env.MEMORY_ENABLED || 'true';
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// For dynamic private env
export const env = {
	MONGODB_URL,
	QDRANT_URL,
	EMBEDDING_URL,
	RERANKER_URL,
	MEMORY_ENABLED,
	REDIS_URL
};

export default env;
