import { sveltekit } from "@sveltejs/kit/vite";
import Icons from "unplugin-icons/vite";
import { promises } from "fs";
import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config({ path: "./.env.local" });

const enableBrowserTests = process.env.VITEST_BROWSER === "true";

// used to load fonts server side for thumbnail generation
function loadTTFAsArrayBuffer() {
	return {
		name: "load-ttf-as-array-buffer",
		async transform(_src: unknown, id: string) {
			if (id.endsWith(".ttf")) {
				return `export default new Uint8Array([
			${new Uint8Array(await promises.readFile(id))}
		  ]).buffer`;
			}
		},
	};
}
export default defineConfig({
	plugins: [
		sveltekit(),
		Icons({
			compiler: "svelte",
		}),
		loadTTFAsArrayBuffer(),
	],
	// Allow external access via ngrok tunnel host
	server: {
		port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
		// Allow any ngrok-free.app subdomain (dynamic tunnels)
		// See Vite server.allowedHosts: string[] | true
		// Using leading dot matches subdomains per Vite's host check logic
		allowedHosts: ["huggingface.ngrok.io"],
	},
	resolve: {
		alias: {
			"dayjs/plugin/advancedFormat.js": "dayjs/esm/plugin/advancedFormat/index.js",
			"dayjs/plugin/customParseFormat.js": "dayjs/esm/plugin/customParseFormat/index.js",
			"dayjs/plugin/isoWeek.js": "dayjs/esm/plugin/isoWeek/index.js",
			"dayjs/plugin/duration.js": "dayjs/esm/plugin/duration/index.js",
			"dayjs/plugin/advancedFormat": "dayjs/esm/plugin/advancedFormat",
			"dayjs/plugin/customParseFormat": "dayjs/esm/plugin/customParseFormat",
			"dayjs/plugin/isoWeek": "dayjs/esm/plugin/isoWeek",
			"dayjs/plugin/duration": "dayjs/esm/plugin/duration",
			dayjs: "dayjs/esm",
		},
	},
	optimizeDeps: {
		include: ["uuid", "sharp", "clsx", "@braintree/sanitize-url"],
		exclude: ["mermaid", "dayjs"],
	},
	build: {
		rollupOptions: {
			// Mark ioredis as external - it's optionally used for caching
			// and gracefully falls back when not available
			external: ["ioredis"],
		},
	},
	test: {
		workspace: [
			...(enableBrowserTests
				? [
						{
							extends: "./vite.config.ts",
							test: {
								name: "client",
								environment: "browser",
								browser: {
									enabled: true,
									provider: "playwright",
									instances: [{ browser: "chromium", headless: true }],
								},
								include: ["src/**/*.svelte.{test,spec}.{js,ts}"],
								exclude: ["src/lib/server/**", "src/**/*.ssr.{test,spec}.{js,ts}"],
								setupFiles: ["./scripts/setups/vitest-setup-client.ts"],
							},
						},
					]
				: []),
			{
				extends: "./vite.config.ts",
				test: {
					name: "ssr",
					environment: "node",
					include: ["src/**/*.ssr.{test,spec}.{js,ts}"],
				},
			},
			{
				extends: "./vite.config.ts",
				test: {
					name: "server",
					environment: "node",
					include: ["src/**/*.{test,spec}.{js,ts}"],
					exclude: ["src/**/*.svelte.{test,spec}.{js,ts}", "src/**/*.ssr.{test,spec}.{js,ts}"],
					setupFiles: ["./scripts/setups/vitest-setup-server.ts"],
				},
			},
		],
	},
});
