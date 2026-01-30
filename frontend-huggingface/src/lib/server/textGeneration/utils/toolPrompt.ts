import type { OpenAiTool } from "$lib/server/mcp/tools";
import { logger } from "$lib/server/logger";
import { generateToolCapabilityManifest } from "$lib/server/textGeneration/mcp/toolIntelligenceRegistry";

type ToolCallFormat = "json" | "xml";

/**
 * Builds the system prompt for tool usage with reasoning capabilities.
 * Enforces a "Reasoning First" approach where the model must explain its thought process
 * before invoking tools, improving reliability and reducing hallucinations.
 *
 * ENTERPRISE FEATURES:
 * - Tool Capability Awareness: Model knows and can describe its available tools
 * - Tool Attribution: Model is instructed to tell users which tool provided answers
 * - Proactive Guidance: Model suggests alternative tools when appropriate
 */
export function buildToolPreprompt(
	tools: OpenAiTool[],
	intentHint?: string,
	options?: { toolCallFormat?: ToolCallFormat }
): string {
	if (!Array.isArray(tools) || tools.length === 0) return "";
	const toolCallFormat = options?.toolCallFormat ?? "json";

	// Phase 2.2: Compact JSON (no pretty-print) to reduce prompt tokens and prefill time
	// With 80+ tools, pretty-printing adds ~2-3KB of whitespace to every request
	const toolDefs = JSON.stringify(tools);
	const currentDate = new Date().toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	// Generate human-readable capability manifest for the model
	const toolNames = tools.map((t) => t.function.name);
	const capabilityManifest = generateToolCapabilityManifest(toolNames);

	const hintSection = intentHint ? `\n**SYSTEM NOTE / הערת מערכת**:\n${intentHint}\n` : "";

	const hasSequentialThinking = tools.some((t) => t.function.name === "sequentialthinking");
	const sequentialThinkingConstraint = hasSequentialThinking
		? `\n   - **Sequential Thinking Constraint**: You MUST limit your thinking process to a maximum of 5 steps to prevent context overflow. Be concise in each step. / הגבל את תהליך החשיבה ל-5 שלבים לכל היותר.`
		: "";

	const toolCallInstructions =
		toolCallFormat === "xml"
			? `2. **Tool Selection / בחירת כלי**:
   - If a tool is needed, output one or more <tool_call> XML blocks immediately after the </think> tag.
   - Each <tool_call> block must contain EXACT JSON:
     <tool_call>
     {"name": "tool_name", "arguments": {"key": "value"}}
     </tool_call>
   - Return ONLY the <tool_call> block(s) after reasoning. No extra text.
   - If NO tool is needed, simply write your response text after the </think> tag.`
			: `2. **Tool Selection / בחירת כלי**:
   - If a tool is needed, output a JSON object immediately after the </think> tag.
   - The JSON must follow this EXACT format:
     {
       "tool_calls": [
         {"name": "tool_name", "arguments": {"key": "value"}}
       ]
     }
   - Return ONLY the JSON object for tool calls (after reasoning). No extra text.
   - If NO tool is needed, simply write your response text after the </think> tag.`;

	const formatRequirements =
		toolCallFormat === "xml"
			? `   - **FORMAT REQUIREMENTS** (CRITICAL):
     * Use <tool_call> XML blocks exactly as shown above.
     * Do NOT output {"tool_calls": ...} JSON objects when using XML tool calls.
     * Do NOT wrap URLs or argument values in backticks (e.g., write "https://..." not "\`https://...\`")
     * Output clean JSON inside XML only, no markdown formatting around tool calls${sequentialThinkingConstraint}`
			: `   - **FORMAT REQUIREMENTS** (CRITICAL):
     * Do NOT wrap tool calls in XML tags like <tool_call>...</tool_call>
     * Do NOT wrap URLs or argument values in backticks (e.g., write "https://..." not "\`https://...\`")
     * Output clean JSON only, no markdown formatting around tool calls${sequentialThinkingConstraint}`;

	const examples =
		toolCallFormat === "xml"
			? `\n[Tool Use / שימוש בכלי]\n<think>\nUser wants to search for \"autonomous driving\". I should use the search tool.\n</think>\n<tool_call>\n{\"name\": \"tavily_search\", \"arguments\": {\"query\": \"autonomous driving\"}}\n</tool_call>\n\n[No Tool / ללא כלי]\n<think>\nUser is just saying hello. No tool needed.\n</think>\nHello! How can I help you today? / שלום! איך אוכל לעזור היום?`
			: `\n[Tool Use / שימוש בכלי]\n<think>\nUser wants to search for \"autonomous driving\". I should use the search tool.\n</think>\n{\n  \"tool_calls\": [\n    {\"name\": \"tavily_search\", \"arguments\": {\"query\": \"autonomous driving\"}}\n  ]\n}\n\n[No Tool / ללא כלי]\n<think>\nUser is just saying hello. No tool needed.\n</think>\nHello! How can I help you today? / שלום! איך אוכל לעזור היום?`;

	const prompt = `Available Tools: ${toolDefs}
Today's date: ${currentDate}${hintSection}
${capabilityManifest}

You are an expert assistant capable of fluent reasoning and communication in both English and Hebrew (עברית).
Your task is to analyze the user's request and determine if a tool is needed.

**Guidelines / הנחיות:**

1. **Reasoning First / חשיבה תחילה**:
   - You MUST start with a <think> block to analyze the request.
   - Explain your thought process in the user's language.
   - התחל בבלוק חשיבה <think> ונתח את הבקשה.

${toolCallInstructions}

3. **Important Constraints**:
   - If the user asks in Hebrew, you can use Hebrew arguments (e.g., search queries). / אם המשתמש שואל בעברית, ניתן להשתמש בפרמטרים בעברית.
   - Ensure arguments match the tool's schema exactly.
   - NEVER say "I cannot search" - USE A TOOL if information is missing.
   - If a tool generates an image, you can inline it directly: ![alt text](image_url)
   - **HONESTY WHEN TOOLS FAIL** (CRITICAL - prevents hallucination):
     * If a tool returns an error, "robots disallow", "access denied", or empty results - ADMIT IT
     * Say "לא הצלחתי למצוא מידע על כך" / "I couldn't find information about this"
     * Do NOT invent or hallucinate facts when tools fail to provide evidence
     * Suggest trying a different tool (e.g., "אנסה עם Perplexity במקום" / "Let me try Perplexity instead")
   - **EVIDENCE REQUIRED FOR FACTUAL CLAIMS** (CRITICAL - prevents hallucination):
     * For specific factual queries (legal cases, statistics, news, people, dates, prices) - you MUST cite tool results
     * If you have NO tool evidence, state clearly: "אין לי מידע מאומת על כך" / "I don't have verified information"
     * NEVER generate specific names, numbers, dates, or facts without tool evidence
     * When uncertain, prefer "I don't know" over a confident-sounding guess
${formatRequirements}

4. **Tool Transparency & Capability Awareness / שקיפות וידע על יכולות**:
   - When a user asks "מה אתה יכול לעשות?" or "what can you do?", describe your available tools using the capability list above.
   - After using a tool, mention which tool provided the answer (e.g., "המידע מבוסס על חיפוש עם Tavily").
   - If your answer is limited by the tool used, proactively suggest alternatives:
     * Quick search → Suggest deep research for more comprehensive results
     * Government data → Mention you can add context from other sources
   - Example: "ביצעתי חיפוש מהיר. לתוצאות מקיפות יותר, אוכל להפעיל את כלי המחקר המעמיק."
   - כאשר המשתמש שואל על היכולות שלך, תאר את הכלים הזמינים. לאחר שימוש בכלי, ציין איזה כלי שימש.

**Examples:**
${examples}`;

	logger.debug("[mcp] tool prompt built (native-first, envelope fallback)", { toolCallFormat });

	return prompt;
}
