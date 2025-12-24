import type { OpenAiTool } from "$lib/server/mcp/tools";

/**
 * Builds the system prompt for tool usage with reasoning capabilities.
 * Enforces a "Reasoning First" approach where the model must explain its thought process
 * before invoking tools, improving reliability and reducing hallucinations.
 */
export function buildToolPreprompt(tools: OpenAiTool[], intentHint?: string): string {
	if (!Array.isArray(tools) || tools.length === 0) return "";

	const toolDefs = JSON.stringify(tools, null, 2);
	const currentDate = new Date().toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	const hintSection = intentHint ? `\n**SYSTEM NOTE / הערת מערכת**:\n${intentHint}\n` : "";

	const hasSequentialThinking = tools.some((t) => t.function.name === "sequentialthinking");
	const sequentialThinkingConstraint = hasSequentialThinking
		? `\n   - **Sequential Thinking Constraint**: You MUST limit your thinking process to a maximum of 5 steps to prevent context overflow. Be concise in each step. / הגבל את תהליך החשיבה ל-5 שלבים לכל היותר.`
		: "";

	return `Available Tools: ${toolDefs}
Today's date: ${currentDate}${hintSection}

You are an expert assistant capable of fluent reasoning and communication in both English and Hebrew (עברית).
Your task is to analyze the user's request and determine if a tool is needed.

**Guidelines / הנחיות:**

1. **Reasoning First / חשיבה תחילה**:
   - You MUST start with a <think> block to analyze the request.
   - Explain your thought process in the user's language.
   - התחל בבלוק חשיבה <think> ונתח את הבקשה.

2. **Tool Selection / בחירת כלי**:
   - If a tool is needed, output a JSON object immediately after the </think> tag.
   - The JSON must follow this EXACT format:
     {
       "tool_calls": [
         {"name": "tool_name", "arguments": {"key": "value"}}
       ]
     }
   - Return ONLY the JSON object for tool calls (after reasoning). No extra text.
   - If NO tool is needed, simply write your response text after the </think> tag.

3. **Important Constraints**:
   - If the user asks in Hebrew, you can use Hebrew arguments (e.g., search queries). / אם המשתמש שואל בעברית, ניתן להשתמש בפרמטרים בעברית.
   - Ensure arguments match the tool's schema exactly.
   - NEVER say "I cannot search" - USE A TOOL if information is missing.
   - If a tool generates an image, you can inline it directly: ![alt text](image_url)${sequentialThinkingConstraint}

**Examples:**

[Tool Use / שימוש בכלי]
<think>
User wants to search for "autonomous driving". I should use the search tool.
</think>
{
  "tool_calls": [
    {"name": "tavily_search", "arguments": {"query": "autonomous driving"}}
  ]
}

[No Tool / ללא כלי]
<think>
User is just saying hello. No tool needed.
</think>
Hello! How can I help you today? / שלום! איך אוכל לעזור היום?`;
}
