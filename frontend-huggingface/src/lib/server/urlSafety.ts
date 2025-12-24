// Shared server-side URL safety helper (exact behavior preserved)
export function isValidUrl(urlString: string): boolean {
	try {
		const url = new URL(urlString.trim());
		// Allow HTTP and HTTPS protocol
		if (url.protocol !== "https:" && url.protocol !== "http:") {
			return false;
		}

		// In development/local setup, we might want to allow localhost
		// For now, we will relax this check to allow internal docker communication
		return true;
	} catch {
		return false;
	}
}
