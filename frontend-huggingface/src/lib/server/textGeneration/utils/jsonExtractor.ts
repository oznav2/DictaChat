/**
 * Robust JSON extraction utilities
 * Provides efficient and reliable JSON parsing from text content
 */

export interface JsonExtractionResult {
	success: boolean;
	data?: unknown;
	error?: string;
	position?: number;
}

export interface JsonSliceResult {
	success: boolean;
	json?: string;
	endIndex?: number;
	error?: string;
	position?: number;
}

/**
 * Extract and parse JSON object from text content
 * Uses a more robust approach than manual brace counting
 */
export function extractJsonObject(text: string, startIndex: number = 0): JsonExtractionResult {
	try {
		// Find the opening brace
		const openBraceIndex = text.indexOf("{", startIndex);
		if (openBraceIndex === -1) {
			return { success: false, error: "No opening brace found" };
		}

		// Use a stack-based approach to find the matching closing brace
		let braceCount = 0;
		let inString = false;
		let escapeNext = false;
		let endIndex = -1;

		for (let i = openBraceIndex; i < text.length; i++) {
			const char = text[i];

			// Handle string escaping
			if (escapeNext) {
				escapeNext = false;
				continue;
			}

			if (char === "\\") {
				escapeNext = true;
				continue;
			}

			// Handle string boundaries
			if (char === '"' && !inString) {
				inString = true;
				continue;
			}
			if (char === '"' && inString) {
				inString = false;
				continue;
			}

			// Only count braces outside of strings
			if (!inString) {
				if (char === "{") {
					braceCount++;
				} else if (char === "}") {
					braceCount--;
					if (braceCount === 0) {
						endIndex = i;
						break;
					}
				}
			}
		}

		if (endIndex === -1) {
			return { success: false, error: "No matching closing brace found" };
		}

		// Extract and parse the JSON
		const jsonString = text.slice(openBraceIndex, endIndex + 1);
		try {
			const parsed = JSON.parse(jsonString);
			return { success: true, data: parsed, position: endIndex + 1 };
		} catch (parseError) {
			return {
				success: false,
				error: `Invalid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
				position: openBraceIndex,
			};
		}
	} catch (error) {
		return {
			success: false,
			error: `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

export function extractJsonObjectSlice(text: string, startIndex: number = 0): JsonSliceResult {
	try {
		const openBraceIndex = text.indexOf("{", startIndex);
		if (openBraceIndex === -1) {
			return { success: false, error: "No opening brace found" };
		}

		let braceCount = 0;
		let inString: "'" | '"' | null = null;
		let escapeNext = false;
		let endIndex = -1;

		for (let i = openBraceIndex; i < text.length; i++) {
			const char = text[i];

			if (escapeNext) {
				escapeNext = false;
				continue;
			}

			if (char === "\\") {
				escapeNext = true;
				continue;
			}

			if ((char === '"' || char === "'") && inString === null) {
				inString = char as "'" | '"';
				continue;
			}
			if ((char === '"' || char === "'") && inString === char) {
				inString = null;
				continue;
			}

			if (inString === null) {
				if (char === "{") braceCount++;
				else if (char === "}") {
					braceCount--;
					if (braceCount === 0) {
						endIndex = i;
						break;
					}
				}
			}
		}

		if (endIndex === -1) {
			return { success: false, error: "No matching closing brace found", position: openBraceIndex };
		}

		return {
			success: true,
			json: text.slice(openBraceIndex, endIndex + 1),
			endIndex: endIndex + 1,
			position: openBraceIndex,
		};
	} catch (error) {
		return {
			success: false,
			error: `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

/**
 * Extract JSON array from text content
 */
export function extractJsonArray(text: string, startIndex: number = 0): JsonExtractionResult {
	try {
		// Find the opening bracket
		const openBracketIndex = text.indexOf("[", startIndex);
		if (openBracketIndex === -1) {
			return { success: false, error: "No opening bracket found" };
		}

		// Use a more sophisticated approach for arrays
		let bracketCount = 0;
		let inString = false;
		let escapeNext = false;
		let endIndex = -1;

		for (let i = openBracketIndex; i < text.length; i++) {
			const char = text[i];

			// Handle string escaping
			if (escapeNext) {
				escapeNext = false;
				continue;
			}

			if (char === "\\") {
				escapeNext = true;
				continue;
			}

			// Handle string boundaries
			if (char === '"' && !inString) {
				inString = true;
				continue;
			}
			if (char === '"' && inString) {
				inString = false;
				continue;
			}

			// Only count brackets outside of strings
			if (!inString) {
				if (char === "[") {
					bracketCount++;
				} else if (char === "]") {
					bracketCount--;
					if (bracketCount === 0) {
						endIndex = i;
						break;
					}
				}
			}
		}

		if (endIndex === -1) {
			return { success: false, error: "No matching closing bracket found" };
		}

		// Extract and parse the JSON
		const jsonString = text.slice(openBracketIndex, endIndex + 1);
		try {
			const parsed = JSON.parse(jsonString);
			return { success: true, data: parsed, position: endIndex + 1 };
		} catch (parseError) {
			return {
				success: false,
				error: `Invalid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
				position: openBracketIndex,
			};
		}
	} catch (error) {
		return {
			success: false,
			error: `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

export function extractJsonArraySlice(text: string, startIndex: number = 0): JsonSliceResult {
	try {
		const openBracketIndex = text.indexOf("[", startIndex);
		if (openBracketIndex === -1) {
			return { success: false, error: "No opening bracket found" };
		}

		let bracketCount = 0;
		let inString: "'" | '"' | null = null;
		let escapeNext = false;
		let endIndex = -1;

		for (let i = openBracketIndex; i < text.length; i++) {
			const char = text[i];

			if (escapeNext) {
				escapeNext = false;
				continue;
			}

			if (char === "\\") {
				escapeNext = true;
				continue;
			}

			if ((char === '"' || char === "'") && inString === null) {
				inString = char as "'" | '"';
				continue;
			}
			if ((char === '"' || char === "'") && inString === char) {
				inString = null;
				continue;
			}

			if (inString === null) {
				if (char === "[") bracketCount++;
				else if (char === "]") {
					bracketCount--;
					if (bracketCount === 0) {
						endIndex = i;
						break;
					}
				}
			}
		}

		if (endIndex === -1) {
			return {
				success: false,
				error: "No matching closing bracket found",
				position: openBracketIndex,
			};
		}

		return {
			success: true,
			json: text.slice(openBracketIndex, endIndex + 1),
			endIndex: endIndex + 1,
			position: openBracketIndex,
		};
	} catch (error) {
		return {
			success: false,
			error: `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

/**
 * Fast regex-based JSON detection and extraction
 * More efficient than manual parsing for simple cases
 */
export function extractJsonWithRegex(text: string): JsonExtractionResult {
	try {
		// Look for JSON object or array patterns
		const jsonObjectRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
		const jsonArrayRegex = /\[(?:[^[\]]*|\[[^[\]]*\])*\]/g;

		// Try object first
		const objectMatches = text.match(jsonObjectRegex);
		if (objectMatches && objectMatches.length > 0) {
			for (const match of objectMatches) {
				try {
					const parsed = JSON.parse(match);
					return { success: true, data: parsed, position: text.indexOf(match) };
				} catch {
					// Continue to next match
				}
			}
		}

		// Try array
		const arrayMatches = text.match(jsonArrayRegex);
		if (arrayMatches && arrayMatches.length > 0) {
			for (const match of arrayMatches) {
				try {
					const parsed = JSON.parse(match);
					return { success: true, data: parsed, position: text.indexOf(match) };
				} catch {
					// Continue to next match
				}
			}
		}

		return { success: false, error: "No valid JSON found" };
	} catch (error) {
		return {
			success: false,
			error: `Regex extraction failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

/**
 * Extract specific JSON structure (like tool_calls) from text
 */
export function extractSpecificJson(text: string, structureName: string): JsonExtractionResult {
	try {
		// Look for the structure name followed by JSON
		const pattern = new RegExp(`"${structureName}"\\s*:\\s*([{\\[])`);
		const match = text.match(pattern);

		if (!match) {
			return { success: false, error: `Structure "${structureName}" not found` };
		}

		const startChar = match[1];
		const startIndex = (match.index || 0) + match[0].length - 1;

		// Extract based on the opening character
		if (startChar === "{") {
			return extractJsonObject(text, startIndex);
		} else if (startChar === "[") {
			return extractJsonArray(text, startIndex);
		}

		return { success: false, error: `Invalid structure start: ${startChar}` };
	} catch (error) {
		return {
			success: false,
			error: `Structure extraction failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

export function extractToolCallsArray(text: string): JsonExtractionResult {
	const strict = extractSpecificJson(text, "tool_calls");
	if (strict.success) {
		return strict;
	}

	try {
		const pattern = /(^|[,{]\s*)(?:"tool_calls"|'tool_calls'|tool_calls)\s*:\s*\[/;
		const match = text.match(pattern);
		if (!match || match.index === undefined) {
			return { success: false, error: 'Structure "tool_calls" not found' };
		}

		const bracketIndex = text.indexOf("[", match.index);
		if (bracketIndex === -1) {
			return {
				success: false,
				error: "No opening bracket found for tool_calls",
				position: match.index,
			};
		}

		return extractJsonArray(text, bracketIndex);
	} catch (error) {
		return {
			success: false,
			error: `Structure extraction failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}
