// Lazy evaluation logging wrapper to avoid expensive object construction in production

const isDebugEnabled = process.env.NODE_ENV === "development" || process.env.DEBUG === "true";

/**
 * Conditional debug logger that only evaluates expensive object construction
 * if debug logging is actually enabled. Prevents wasted CPU in production.
 *
 * Usage:
 *   debugLog(() => ({ expensiveData: servers.map(...) }), "[mcp] message");
 *
 * Instead of:
 *   console.debug({ expensiveData: servers.map(...) }, "[mcp] message");
 */
export function debugLog(dataFn: () => any, message: string): void {
	if (isDebugEnabled) {
		try {
			const data = dataFn();
			console.debug(data, message);
		} catch (e) {
			// Silently ignore logging errors
		}
	}
}

/**
 * Standard console.debug wrapper with error protection
 */
export function safeDebug(data: any, message: string): void {
	try {
		console.debug(data, message);
	} catch {
		// Silently ignore
	}
}

/**
 * Standard console.info wrapper with error protection
 */
export function safeInfo(data: any, message: string): void {
	try {
		console.info(data, message);
	} catch {
		// Silently ignore
	}
}
