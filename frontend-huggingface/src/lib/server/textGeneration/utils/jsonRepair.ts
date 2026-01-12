// JSON extraction and repair utilities for model outputs

export interface JsonRepairResult {
	success: boolean;
	data?: any;
	error?: string;
	position?: string;
}

/**
 * Attempts to extract and repair JSON from model-generated text.
 * Handles common issues like:
 * - Unclosed brackets/braces
 * - Model generating }}} instead of }}]
 * - Too many closing braces (e.g., }}}]} instead of }}]})
 * - Incomplete JSON structures
 *
 * @param content - The text content to extract JSON from
 * @param searchKey - The key to search for (e.g., "tool_calls")
 * @returns RepairResult with success flag and parsed data or error details
 */
export function extractAndRepairJson(
	content: string,
	searchKey: string = "tool_calls"
): JsonRepairResult {
	try {
		// Find the JSON object containing the search key
		const keyIndex = content.indexOf(`"${searchKey}"`);
		if (keyIndex === -1) {
			return {
				success: false,
				error: `Key "${searchKey}" not found in content`,
			};
		}

		const jsonStart = content.lastIndexOf("{", keyIndex);
		if (jsonStart === -1) {
			return {
				success: false,
				error: "No opening brace found before search key",
			};
		}

		// Extract everything from { to end of content
		let potentialJson = content.slice(jsonStart);

		console.info(
			{
				originalLength: potentialJson.length,
				original: potentialJson,
			},
			"[json-repair] extracted JSON before repair"
		);

		// Count unbalanced brackets and braces
		let braceCount = 0;
		let bracketCount = 0;
		for (const char of potentialJson) {
			if (char === "{") braceCount++;
			else if (char === "}") braceCount--;
			else if (char === "[") bracketCount++;
			else if (char === "]") bracketCount--;
		}

		// Fix unbalanced structures
		if (braceCount !== 0 || bracketCount !== 0) {
			console.info(
				{ braceCount, bracketCount },
				"[json-repair] unbalanced brackets detected, attempting fix"
			);

			// Case 1: Too many closing braces (braceCount < 0)
			// Pattern: ...}}}]} instead of ...}}]}
			// The model added an extra } before ]}
			if (braceCount < 0 && bracketCount === 0) {
				console.info("[json-repair] too many closing braces - removing extras");
				// Remove extra } characters
				let extraBraces = Math.abs(braceCount);
				while (extraBraces > 0) {
					// Check if we have the pattern }}}]} (extra } before ]})
					if (potentialJson.endsWith("}]}")) {
						// Remove the third } from the end (the extra one)
						potentialJson = potentialJson.slice(0, -3) + "]}";
						extraBraces--;
						console.info("[json-repair] removed extra } before ]}");
					} else if (potentialJson.endsWith("}")) {
						// Generic removal from the end
						potentialJson = potentialJson.slice(0, -1);
						extraBraces--;
						console.info("[json-repair] removed trailing }");
					} else {
						break; // Can't find more braces to remove
					}
				}
			}

			// Case 2: Missing closing bracket, model generated }}} instead of }}]
			// Example: {"tool_calls": [{"name": "..."}}} -> should be {"tool_calls": [{"name": "..."}]}
			if (bracketCount > 0 && braceCount === 0) {
				const lastBraceIndex = potentialJson.lastIndexOf("}");
				if (lastBraceIndex > 0) {
					const secondToLastBraceIndex = potentialJson.lastIndexOf("}", lastBraceIndex - 1);
					if (secondToLastBraceIndex !== -1) {
						// Replace second-to-last } with ]
						potentialJson =
							potentialJson.slice(0, secondToLastBraceIndex) +
							"]" +
							potentialJson.slice(secondToLastBraceIndex + 1);
						bracketCount--;
						console.info("[json-repair] replaced second-to-last } with ]");
					}
				}
			}

			// Case 3: Append missing closures
			while (bracketCount > 0) {
				potentialJson += "]";
				bracketCount--;
			}
			while (braceCount > 0) {
				potentialJson += "}";
				braceCount--;
			}
		}

		console.info(
			{
				repairedLength: potentialJson.length,
				repaired: potentialJson,
			},
			"[json-repair] attempting to parse repaired JSON"
		);

		// Attempt to parse the repaired JSON
		let parsed;
		try {
			parsed = JSON.parse(potentialJson);
		} catch (parseError) {
			// Extract position info from error message (supports V8, SpiderMonkey, JavaScriptCore)
			const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
			let errorPosition = "unknown";
			let contextChar = "";

			// V8 format: "Unexpected token } in JSON at position 123"
			const v8Match = errorMsg.match(/position (\d+)/);
			if (v8Match) {
				const pos = parseInt(v8Match[1], 10);
				errorPosition = String(pos);
				if (pos < potentialJson.length) {
					contextChar = potentialJson[pos];
				}
			} else {
				// SpiderMonkey format: "JSON.parse: unexpected character at line 1 column 45"
				const mozMatch = errorMsg.match(/line (\d+) column (\d+)/);
				if (mozMatch) {
					errorPosition = `line ${mozMatch[1]}, col ${mozMatch[2]}`;
				}
			}

			return {
				success: false,
				error: errorMsg,
				position: errorPosition + (contextChar ? ` (char: '${contextChar}')` : ""),
			};
		}

		return {
			success: true,
			data: parsed,
		};
	} catch (e) {
		const errorMsg = e instanceof Error ? e.message : String(e);
		return {
			success: false,
			error: errorMsg,
		};
	}
}

/**
 * Validates and normalizes tool call parameters from parsed JSON.
 * Handles both "parameters" and "arguments" fields.
 */
export function normalizeToolCallParams(params: any): string {
	// Proper validation: check for object but exclude arrays and null
	if (params && typeof params === "object" && !Array.isArray(params) && params !== null) {
		return JSON.stringify(params);
	}
	return "{}";
}
