import { browser } from "$app/environment";
import { env as publicEnv } from "$env/dynamic/public";
import { base } from "$app/paths";
import { writable } from "svelte/store";

function toKeyPart(s: string | undefined): string {
	return (s || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

const appLabel = toKeyPart(publicEnv.PUBLIC_APP_ASSETS || publicEnv.PUBLIC_APP_NAME);
const baseLabel = toKeyPart(typeof base === "string" ? base : "");
const KEY_PREFIX = appLabel || baseLabel || "app";
const STORAGE_KEY = `${KEY_PREFIX}:ui:terminal-mode`;

function loadInitial(): boolean {
	if (!browser) return false;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? Boolean(JSON.parse(raw)) : false;
	} catch {
		return false;
	}
}

export const terminalMode = writable<boolean>(loadInitial());

if (browser) {
	terminalMode.subscribe((v) => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(Boolean(v)));
		} catch {}
	});
}

export function setTerminalMode(enabled: boolean) {
	terminalMode.set(Boolean(enabled));
}

export function toggleTerminalMode() {
	terminalMode.update((v) => !v);
}
