/**
 * Mock for $app/stores SvelteKit module
 * Used in vitest to simulate SvelteKit runtime
 */

import { writable, readable } from 'svelte/store';

export const page = readable({
	url: new URL('http://localhost'),
	params: {},
	route: { id: null },
	status: 200,
	error: null,
	data: {},
	form: null
});

export const navigating = readable(null);
export const updated = {
	subscribe: writable(false).subscribe,
	check: async () => false
};
