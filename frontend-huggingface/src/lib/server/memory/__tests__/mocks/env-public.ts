/**
 * Mock for $env/dynamic/public and $env/static/public SvelteKit modules
 * Used in vitest to simulate SvelteKit runtime environment variables
 */

// Export common public environment variables used in the app
export const PUBLIC_APP_NAME = process.env.PUBLIC_APP_NAME || "DictaChat";
export const PUBLIC_API_URL = process.env.PUBLIC_API_URL || "http://localhost:8002";
export const PUBLIC_VERSION = process.env.PUBLIC_VERSION || "1.0.0";

// For dynamic public env
export const env = {
	PUBLIC_APP_NAME,
	PUBLIC_API_URL,
	PUBLIC_VERSION,
};

export default env;
