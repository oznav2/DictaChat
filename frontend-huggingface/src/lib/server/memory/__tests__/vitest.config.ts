/**
 * Vitest configuration for Memory System Tests
 *
 * Adapted from roampal benchmark and unit test patterns
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname = frontend-huggingface/src/lib/server/memory/__tests__
// Go up 5 levels to reach frontend-huggingface, then into src/lib
const frontendRoot = resolve(__dirname, "../../../../..");
const libPath = resolve(frontendRoot, "src/lib");

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["**/*.test.ts", "**/*.spec.ts"],
		exclude: ["**/node_modules/**", "**/dist/**"],
		testTimeout: 60000,
		hookTimeout: 30000,
		reporters: ["verbose", "json"],
		outputFile: {
			json: "./test-results/results.json",
		},
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			reportsDirectory: "./test-results/coverage",
		},
		setupFiles: ["./setup.ts"],
	},
	resolve: {
		alias: {
			$lib: libPath,
			"@memory": resolve(libPath, "server/memory"),
			// Mock SvelteKit runtime modules
			"$app/environment": resolve(__dirname, "mocks/app-environment.ts"),
			"$app/stores": resolve(__dirname, "mocks/app-stores.ts"),
			"$env/dynamic/private": resolve(__dirname, "mocks/env-private.ts"),
			"$env/static/private": resolve(__dirname, "mocks/env-private.ts"),
			"$env/dynamic/public": resolve(__dirname, "mocks/env-public.ts"),
			"$env/static/public": resolve(__dirname, "mocks/env-public.ts"),
		},
	},
});
