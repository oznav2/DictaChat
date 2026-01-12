import { browser } from "$app/environment";
import { env as publicEnv } from "$env/dynamic/public";
import { base } from "$app/paths";

function toKeyPart(s: string | undefined): string {
	return (s || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function getKeyPrefix() {
	const appLabel = toKeyPart(publicEnv.PUBLIC_APP_ASSETS || publicEnv.PUBLIC_APP_NAME);
	const baseLabel = toKeyPart(typeof base === "string" ? base : "");
	return appLabel || baseLabel || "app";
}

function migrateOne(oldKey: string, newKey: string) {
	try {
		const oldVal = localStorage.getItem(oldKey);
		if (oldVal === null) return false;
		const newVal = localStorage.getItem(newKey);
		if (newVal !== null) {
			localStorage.removeItem(oldKey);
			return false;
		}
		localStorage.setItem(newKey, oldVal);
		localStorage.removeItem(oldKey);
		return true;
	} catch {
		return false;
	}
}

export function runStorageMigration() {
	if (!browser) return { migrated: 0 };

	const prefix = getKeyPrefix();
	let migrated = 0;

	migrated += migrateOne("mcp:custom-servers", `${prefix}:mcp:custom-servers`) ? 1 : 0;
	migrated += migrateOne("mcp:selected-ids", `${prefix}:mcp:selected-ids`) ? 1 : 0;
	migrated += migrateOne("mcp:disabled-base-ids", `${prefix}:mcp:disabled-base-ids`) ? 1 : 0;
	migrated += migrateOne("ui:terminal-mode", `${prefix}:ui:terminal-mode`) ? 1 : 0;

	return { migrated };
}
