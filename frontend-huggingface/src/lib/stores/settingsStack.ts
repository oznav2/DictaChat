import { get, writable } from "svelte/store";

export const settingsStack = writable<string[]>([]);

export function resetSettingsStack(rootPath: string, currentPath?: string) {
	const stack = [rootPath];
	if (currentPath && currentPath !== rootPath) {
		stack.push(currentPath);
	}
	settingsStack.set(stack);
}

export function syncSettingsStackTo(path: string) {
	const stack = get(settingsStack);
	if (stack.length === 0) {
		settingsStack.set([path]);
		return;
	}
	const existingIndex = stack.lastIndexOf(path);
	if (existingIndex >= 0) {
		settingsStack.set(stack.slice(0, existingIndex + 1));
		return;
	}
	if (stack[stack.length - 1] === path) return;
	settingsStack.set([...stack, path].slice(-30));
}

export function canPopSettingsStack(): boolean {
	return get(settingsStack).length > 1;
}

export function popSettingsStack(): string | null {
	const stack = get(settingsStack);
	if (stack.length <= 1) return stack[0] ?? null;
	const next = stack.slice(0, -1);
	settingsStack.set(next);
	return next[next.length - 1] ?? null;
}
