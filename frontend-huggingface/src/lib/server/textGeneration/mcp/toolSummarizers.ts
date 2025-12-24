/**
 * Tool-specific summarization patterns (inspired by fabric framework)
 * Each tool can define its own summarization instructions
 */

export interface ToolSummarizerPattern {
	/** Unique identifier for this pattern */
	id: string;
	/** Tool names this pattern applies to */
	toolNames: string[];
	/** System prompt for summarization */
	systemPrompt: string;
	/** User prompt template ({query} and {results} will be replaced) */
	userPromptTemplate: string;
	/** Max tokens for this summarizer */
	maxTokens?: number;
}

/**
 * Default comprehensive summarizer (used when no tool-specific pattern matches)
 */
const DEFAULT_PATTERN: ToolSummarizerPattern = {
	id: "default-comprehensive",
	toolNames: [],
	systemPrompt: `You are a helpful assistant that creates comprehensive summaries from search results.

Your task: Read the search results and create a detailed, well-organized summary.

Format your response with these sections:
1. **Overview** - Write 2-3 paragraphs explaining what you found
2. **Key Information** - List the most important points (at least 10-15 items)
3. **Sources** - List all URLs mentioned in the results

Guidelines:
- Include ALL important details, headlines, and information
- Use clear, complete sentences
- Include URLs and citations where available
- Organize information logically
- Be thorough and comprehensive
- Write in natural language (no JSON, no code blocks)`,
	userPromptTemplate: `User's question: {query}

Here are the search results:

{results}

Please create a comprehensive summary following the format specified in the system message.`,
	maxTokens: 6144,
};

/**
 * Tavily/Perplexity search summarizer (optimized for web search results)
 */
const SEARCH_PATTERN: ToolSummarizerPattern = {
	id: "web-search",
	toolNames: ["perplexity_search", "perplexity-search"],
	systemPrompt: `You are a comprehensive search results formatter. Your job is to EXTRACT and organize ALL information from the search results.

URL HANDLING RULES (CRITICAL):
URLs are ALWAYS in Latin/English characters (.com, .il, .org). NEVER modify them.
✅ CORRECT: https://www.israelhayom.co.il/
❌ WRONG: https://www.israelhayom.co.יל/ (Hebrew chars = WRONG!)
✅ CORRECT: https://www.ynet.co.il/news/article
❌ WRONG: https://www.ynet.co.יל/news/article (NEVER translate URL!)

CRITICAL INSTRUCTIONS:
1. Read ALL search results carefully
2. COPY the exact Title and URL from EACH result (do NOT paraphrase, translate, or modify URLs)
3. List ALL results found (typically 5-10 results)
4. Write a comprehensive summary paragraph (3-5 sentences) covering the key information
5. Extract and list key headlines/points from the results
6. STOP after completing all sections - do NOT repeat information

FORBIDDEN:
- Do NOT generate fake titles or URLs
- Do NOT translate URLs or add Hebrew/Arabic characters to URLs
- Do NOT add phrases like "הכתבות גם..." or repeat the same information
- Do NOT elaborate with invented examples`,
	userPromptTemplate: `Question: {query}

Search Results:
{results}

TASK: Create a comprehensive summary with ALL results found.

FORMAT YOUR RESPONSE WITH THESE SECTIONS:

**כותרות ומקורות:**
[List ALL results - find "Title:" and "URL:" and copy EXACTLY]
1. [Title from results] - [URL from results]
2. [Title from results] - [URL from results]
... (continue for ALL results found)

**סיכום מקיף:**
[Write 3-5 sentences covering the main information, key findings, and important details]

**נקודות עיקריות:**
[List 5-8 key headlines or important points extracted from the results]
1. [Key point]
2. [Key point]
...

CRITICAL: Copy URLs character-by-character. If you see "URL: https://www.example.co.il/page", write EXACTLY "https://www.example.co.il/page" with NO changes.`,
	maxTokens: 1536,
};

/**
 * Tavily Search Pattern (Language Agnostic & Robust)
 */
const TAVILY_PATTERN: ToolSummarizerPattern = {
	id: "tavily-search",
	toolNames: ["tavily-search", "tavily_search"],
	systemPrompt: `You are a precision research assistant. Your ONLY source of truth is the provided "Search Results".

CRITICAL INSTRUCTIONS:
1. **GROUNDING**: Answer based **ONLY** on the provided Search Results. Do NOT use outside knowledge. Do NOT make up facts.
2. **LANGUAGE**: Answer in the SAME LANGUAGE as the User's Question.
   - If User asks in Hebrew and Results are in English -> TRANSLATE the information to Hebrew.
   - If User asks in English and Results are in Hebrew -> TRANSLATE to English.
3. **NEWS/HEADLINES**: If the user asks for news, headlines, or updates:
   - Present a clear **bulleted list** of the top stories found.
   - Include 1-2 sentences of detail for each story based on the snippet.
   - Cite the source (e.g., "Source: Haaretz", "Source: Ynet").
4. **UNKNOWN**: If the search results do not contain the answer, say "I could not find information about that in the search results."
5. **URLS**: Never translate URLs. Keep them exactly as they appear.`,
	userPromptTemplate: `User Question: {query}

Search Results:
{results}

Based ONLY on the search results above, answer the user's question.
If this is a news query, list the headlines found in the results.
Translate the answer to the language of the question.`,
	maxTokens: 2048,
};

/**
 * Direct answer relay (for tools that return full answers like Perplexity)
 */
const ANSWER_PATTERN: ToolSummarizerPattern = {
	id: "answer-relay",
	toolNames: ["perplexity_ask", "perplexity_chat"],
	systemPrompt: `You are a helpful assistant. The user asked a question, and you used a tool to get a comprehensive answer.
Your job is to relay this answer to the user.

Instructions:
1. Review the Tool Answer provided.
2. Present the answer clearly to the user.
3. You may improve the formatting (e.g., add headers, bullet points) but PRESERVE all information.
4. If the Tool Answer contains citations (e.g. [1], [2]), KEEP THEM.
5. If the user asked in a specific language, translate the answer to that language.
6. Do NOT add your own commentary like "Here is what I found" or "The tool says". Just give the answer.`,
	userPromptTemplate: `User Question: {query}

Tool Answer:
{results}

Please present this answer to the user.`,
	maxTokens: 4096,
};

/**
 * Extract/scrape content summarizer (for tavily-extract or content extraction)
 */
const EXTRACT_PATTERN: ToolSummarizerPattern = {
	id: "content-extract",
	toolNames: ["tavily-extract", "tavily_extract"],
	systemPrompt: `You are an expert at summarizing extracted web content.

Your task: Read the extracted content and create a clear, organized summary.

Format your response with these sections:

**MAIN CONTENT**
Summarize the key information in 3-5 paragraphs.

**KEY POINTS**
List the most important points as a numbered list (at least 10 items).

**DETAILS**
Include any specific facts, data, quotes, or technical information.

Guidelines:
- Focus on the main content and purpose of the extracted text
- Include specific details and examples
- Preserve technical accuracy
- Organize by topic or section
- Be thorough and comprehensive
- Write in natural language`,
	userPromptTemplate: `User wanted to extract content for: {query}

Extracted Content:
{results}

Create a comprehensive summary of this content.`,
	maxTokens: 6144,
};

/**
 * All available summarization patterns
 */
export const SUMMARIZER_PATTERNS: ToolSummarizerPattern[] = [
	SEARCH_PATTERN,
	TAVILY_PATTERN,
	ANSWER_PATTERN,
	EXTRACT_PATTERN,
	DEFAULT_PATTERN, // Must be last (fallback)
];

/**
 * Get the appropriate summarizer pattern for the given tool calls
 */
export function getSummarizerPattern(toolNames: string[]): ToolSummarizerPattern {
	// Try to match tool-specific patterns
	for (const pattern of SUMMARIZER_PATTERNS) {
		if (pattern.toolNames.length === 0) continue; // Skip default pattern

		// Check if any of the tool calls match this pattern
		for (const toolName of toolNames) {
			if (pattern.toolNames.includes(toolName)) {
				return pattern;
			}
		}
	}

	// Fallback to default pattern
	return DEFAULT_PATTERN;
}

/**
 * Apply language-specific instructions to a pattern
 */
export function applyLanguageInstructions(
	pattern: ToolSummarizerPattern,
	isHebrew: boolean
): ToolSummarizerPattern {
	if (!isHebrew) return pattern;

	const hebrewInstruction = `

CRITICAL LANGUAGE REQUIREMENT - READ THIS FIRST:
========================================
You MUST respond ENTIRELY in Hebrew (עברית).

URL HANDLING (MOST CRITICAL):
URLs are ALWAYS Latin characters. NEVER translate the URL itself!
✅ CORRECT: https://www.israelhayom.co.il/
❌ WRONG: https://www.israelhayom.co.יל/ (Hebrew in URL = FORBIDDEN!)
Translate the TITLE to Hebrew, but copy the URL exactly as-is.

RULES:
- ALL text must be in Hebrew - titles, summaries, everything
- URLs must be copied EXACTLY as they appear (Latin characters only!)
- Write ONLY what is asked - do NOT elaborate or repeat
- STOP immediately after completing the requested format
- Do NOT add phrases like "הכתבות גם..." or "הכתבות מראות..."
- This is MANDATORY - extract and translate TEXT, but URLs stay UNCHANGED
========================================`;

	// No need to replace headers - they're already in Hebrew in the new format
	const hebrewSystemPrompt = pattern.systemPrompt;

	// For search tools, enforce a structured Hebrew template
	let newUserTemplate = pattern.userPromptTemplate;
	if (pattern.id === "tavily-search" || pattern.id === "web-search") {
		newUserTemplate = `User Question: {query}

Search Results:
{results}

TASK: Create a comprehensive summary with ALL results found.

FORMAT YOUR RESPONSE WITH THESE SECTIONS:

**כותרות ומקורות:**
[List ALL results - find "Title:" and "URL:" and copy EXACTLY]
1. [Title from results] - [URL from results]
2. [Title from results] - [URL from results]
... (continue for ALL results found)

**סיכום מקיף:**
[Write 3-5 sentences covering the main information, key findings, and important details]

**נקודות עיקריות:**
[List 5-8 key headlines or important points extracted from the results]
1. [Key point]
2. [Key point]
...

CRITICAL: Copy URLs character-by-character. If you see "URL: https://www.example.co.il/page", write EXACTLY "https://www.example.co.il/page" with NO changes.`;
	} else {
		newUserTemplate +=
			"\n\nREMINDER: Respond ENTIRELY in Hebrew. Translate all text content. Copy URLs exactly in Latin characters. Include ALL three sections.";
	}

	return {
		...pattern,
		systemPrompt: hebrewInstruction + "\n\n" + hebrewSystemPrompt,
		userPromptTemplate: newUserTemplate,
	};
}
