/**
 * Tool argument sanitization to prevent injection attacks
 * Validates and sanitizes tool parameters before execution
 */

export interface SanitizationResult {
	success: boolean;
	sanitized?: Record<string, unknown>;
	error?: string;
	warnings?: string[];
}

/**
 * Tool argument sanitizer with comprehensive validation
 */
export class ToolArgumentSanitizer {
	private readonly maxStringLength = 10000;
	private readonly maxObjectDepth = 10;
	private readonly maxArrayLength = 1000;
	private readonly forbiddenPatterns = [
		/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // Script tags
		/javascript:/gi, // JavaScript protocol
		/data:text\/html/gi, // Data URLs with HTML
		/file:\/\//gi, // File protocol
		/<iframe/gi, // Iframe tags
		/<object/gi, // Object tags
		/<embed/gi, // Embed tags
		/<form/gi, // Form tags
	];

	/**
	 * Sanitize tool arguments
	 */
	sanitizeArguments(toolName: string, args: Record<string, unknown>): SanitizationResult {
		try {
			const warnings: string[] = [];
			const sanitized: Record<string, unknown> = {};

			// Validate tool name
			if (!this.isValidToolName(toolName)) {
				return {
					success: false,
					error: `Invalid tool name: ${toolName}`,
				};
			}

			// Sanitize each argument
			for (const [key, value] of Object.entries(args)) {
				// Validate key name
				if (!this.isValidKey(key)) {
					warnings.push(`Invalid parameter name '${key}' - skipped`);
					continue;
				}

				// Sanitize value
				const sanitizedValue = this.sanitizeValue(value, 0, warnings);
				if (sanitizedValue !== undefined) {
					sanitized[key] = sanitizedValue;
				}
			}

			return {
				success: true,
				sanitized,
				warnings: warnings.length > 0 ? warnings : undefined,
			};
		} catch (error) {
			return {
				success: false,
				error: `Sanitization failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Validate tool name
	 */
	private isValidToolName(toolName: string): boolean {
		if (!toolName || typeof toolName !== "string") {
			return false;
		}

		// Only allow alphanumeric, hyphens, and underscores
		return /^[a-zA-Z0-9_-]+$/.test(toolName);
	}

	/**
	 * Validate parameter key name
	 */
	private isValidKey(key: string): boolean {
		if (!key || typeof key !== "string") {
			return false;
		}

		// Only allow alphanumeric and underscore
		return /^[a-zA-Z0-9_]+$/.test(key);
	}

	/**
	 * Sanitize a value recursively
	 */
	private sanitizeValue(value: unknown, depth: number, warnings: string[]): unknown {
		// Check depth limit
		if (depth > this.maxObjectDepth) {
			warnings.push(`Object depth limit exceeded at level ${depth}`);
			return undefined;
		}

		// Handle null and undefined
		if (value === null || value === undefined) {
			return value;
		}

		// Handle strings
		if (typeof value === "string") {
			return this.sanitizeString(value, warnings);
		}

		// Handle numbers
		if (typeof value === "number") {
			return this.sanitizeNumber(value, warnings);
		}

		// Handle booleans
		if (typeof value === "boolean") {
			return value;
		}

		// Handle arrays
		if (Array.isArray(value)) {
			return this.sanitizeArray(value, depth, warnings);
		}

		// Handle objects
		if (typeof value === "object") {
			return this.sanitizeObject(value as Record<string, unknown>, depth, warnings);
		}

		// Unknown type - skip
		warnings.push(`Unknown value type: ${typeof value}`);
		return undefined;
	}

	/**
	 * Sanitize string values
	 */
	private sanitizeString(str: string, warnings: string[]): string {
		// Check length limit
		if (str.length > this.maxStringLength) {
			warnings.push(
				`String length ${str.length} exceeds maximum ${this.maxStringLength} - truncated`
			);
			str = str.slice(0, this.maxStringLength);
		}

		// Check for forbidden patterns
		for (const pattern of this.forbiddenPatterns) {
			if (pattern.test(str)) {
				warnings.push(`Suspicious pattern detected in string`);
			}
			pattern.lastIndex = 0;
		}

		// Remove potentially dangerous characters
		str = str
			// eslint-disable-next-line no-control-regex
			.replace(/\x00/g, "") // Remove null bytes
			.trim();

		return str;
	}

	/**
	 * Sanitize number values
	 */
	private sanitizeNumber(num: number, warnings: string[]): number {
		// Check for NaN and Infinity
		if (isNaN(num) || !isFinite(num)) {
			warnings.push(`Invalid number value: ${num} - replaced with 0`);
			return 0;
		}

		// Check for reasonable range
		if (Math.abs(num) > Number.MAX_SAFE_INTEGER) {
			warnings.push(`Number ${num} exceeds safe integer range - clamped`);
			return num > 0 ? Number.MAX_SAFE_INTEGER : -Number.MAX_SAFE_INTEGER;
		}

		return num;
	}

	/**
	 * Sanitize array values
	 */
	private sanitizeArray(arr: unknown[], depth: number, warnings: string[]): unknown[] {
		// Check array length limit
		if (arr.length > this.maxArrayLength) {
			warnings.push(
				`Array length ${arr.length} exceeds maximum ${this.maxArrayLength} - truncated`
			);
			arr = arr.slice(0, this.maxArrayLength);
		}

		const sanitizedArray: unknown[] = [];

		for (let i = 0; i < arr.length; i++) {
			const sanitizedItem = this.sanitizeValue(arr[i], depth + 1, warnings);
			if (sanitizedItem !== undefined) {
				sanitizedArray.push(sanitizedItem);
			}
		}

		return sanitizedArray;
	}

	/**
	 * Sanitize object values
	 */
	private sanitizeObject(
		obj: Record<string, unknown>,
		depth: number,
		warnings: string[]
	): Record<string, unknown> {
		const sanitizedObj: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(obj)) {
			// Validate key name
			if (!this.isValidKey(key)) {
				warnings.push(`Invalid object key '${key}' - skipped`);
				continue;
			}

			const sanitizedValue = this.sanitizeValue(value, depth + 1, warnings);
			if (sanitizedValue !== undefined) {
				sanitizedObj[key] = sanitizedValue;
			}
		}

		return sanitizedObj;
	}
}

/**
 * Global sanitizer instance
 */
const toolArgumentSanitizer = new ToolArgumentSanitizer();

/**
 * Sanitize tool arguments (convenience function)
 */
export function sanitizeToolArguments(
	toolName: string,
	args: Record<string, unknown>
): SanitizationResult {
	return toolArgumentSanitizer.sanitizeArguments(toolName, args);
}

/**
 * Validate tool name only
 */
export function isValidToolName(toolName: string): boolean {
	return /^[a-zA-Z0-9_-]+$/.test(toolName);
}
