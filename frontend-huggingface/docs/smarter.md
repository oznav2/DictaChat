# Smarter Tool Orchestration: Enterprise-Grade Methods

This document catalogs all the intelligent methods implemented to make the model's tool usage smarter, more reliable, and user-friendly.

---

## Table of Contents

1. [Tool Intelligence Registry](#1-tool-intelligence-registry)
2. [Parameter Normalization Registry](#2-parameter-normalization-registry)
3. [Cascade Fallback System](#3-cascade-fallback-system)
4. [Graceful Error Handling](#4-graceful-error-handling)
5. [Hebrew Intent Detection](#5-hebrew-intent-detection)
6. [Best-in-Class Tool Selection](#6-best-in-class-tool-selection)
7. [Smart Timeout Management](#7-smart-timeout-management)
8. [Tool Capability Awareness](#8-tool-capability-awareness)
9. [Tool Name Normalization](#9-tool-name-normalization)
10. [Loop Detection & Prevention](#10-loop-detection--prevention)

---

## 1. Tool Intelligence Registry

**File:** `src/lib/server/textGeneration/mcp/toolIntelligenceRegistry.ts`

### What It Does

Centralized metadata for ALL MCP tools including latency characteristics, fallback chains, user-friendly messages, and intent signals.

### Key Data Structure

```typescript
interface ToolIntelligence {
	name: string;
	patterns: RegExp[]; // Match tool name variants
	mcpServer: string; // Which MCP server
	displayName: string; // User-friendly name (Hebrew)
	priority: number; // 0-100 score
	fallbackChain: string[]; // Tools to try if this fails
	conflictsWith: string[]; // Mutually exclusive tools
	latency: {
		typical: number; // Expected ms
		timeout: number; // Max wait ms
		userFeedbackDelay: number; // Show spinner after ms
		tier: "fast" | "medium" | "slow" | "very_slow";
	};
	response: {
		typicalTokens: number;
		maxTokens: number;
		structured: boolean;
		requiresSummarization: boolean;
	};
	messages: {
		progress: string; // "מחפש במאגרי המידע..."
		noResults: string;
		suggestion: string;
		gracefulFailure: string;
	};
	intentSignals: {
		keywords: RegExp; // Hebrew + English patterns
		weight: number; // Score boost when matched
		exclusive?: boolean; // Use ONLY this tool if matched
	};
}
```

### Smart Methods

| Method                            | Purpose                                      |
| --------------------------------- | -------------------------------------------- |
| `getToolIntelligence(name)`       | Get metadata by tool name                    |
| `getFallbackChain(name)`          | Get ordered fallback list                    |
| `getLatencyTier(name)`            | Categorize speed expectation                 |
| `scoreToolForQuery(name, query)`  | Score tool relevance 0-200                   |
| `rankToolsForQuery(query, tools)` | Sort by relevance + handle exclusive matches |

---

## 2. Parameter Normalization Registry

**File:** `src/lib/server/textGeneration/mcp/toolParameterRegistry.ts`

### What It Does

Automatically transforms model-generated parameters to match what each tool expects, preventing "missing parameter" errors.

### Key Features

#### Alias Mapping

Models often use different parameter names. The registry maps them:

```typescript
// Perplexity tools
"query" → "messages" (with proper format)
"question" → "messages"
"prompt" → "messages"

// Filesystem tools
"file" → "path"
"filepath" → "path"
"file_path" → "path"

// Git tools
"path" → "repo_path"
"repository" → "repo_path"

// Docker tools
"container_id" → "container"
"name" → "container"
```

#### Type Coercion

Automatically converts types:

```typescript
// String to number
"5" → 5 (for days, limit, etc.)

// String to boolean
"true" → true
"false" → false

// Enum validation
"general" | "news" (for Tavily topic)
```

#### Default Values

Injects required defaults:

```typescript
// Tavily search
search_depth: "advanced";
include_answer: true;

// Perplexity
return_related_questions: false;
```

### Normalization Flow

```
1. Copy ALL original args (never lose data)
2. Apply alias mappings
3. Coerce types
4. Inject defaults
5. Return normalized + warnings
```

---

## 3. Cascade Fallback System

**File:** `src/lib/server/textGeneration/mcp/toolInvocation.ts`

### What It Does

When a primary tool fails, automatically tries fallback tools in priority order before showing an error.

### Fallback Chains

```
Israeli Government Data:
  datagov_query → perplexity-search → tavily-search

Deep Research:
  perplexity-research → perplexity-ask → tavily-search

Quick Search:
  tavily-search → perplexity-search → fetch
```

### Implementation

```typescript
// After primary tool fails with recoverable error
if (isRecoverableError(message)) {
	const fallbackChain = getFallbackChain(originalTool);

	for (const fallbackTool of fallbackChain) {
		// Check if fallback is available
		const fallbackMapping = mapping[fallbackTool];
		if (!fallbackMapping) continue;

		// Try fallback
		try {
			const result = await callMcpTool(fallbackTool, args);
			return result; // Success!
		} catch {
			continue; // Try next fallback
		}
	}
}
// All failed → show graceful error
```

### Non-Recoverable Errors (Skip Fallback)

- `unauthorized` / `forbidden` (auth issues)
- `invalid api key` (configuration issues)

---

## 4. Graceful Error Handling

**File:** `src/lib/server/textGeneration/mcp/toolInvocation.ts`

### What It Does

Users NEVER see raw errors. Every error is transformed into a helpful Hebrew message explaining:

1. **WHAT** happened (which service failed)
2. **WHY** it likely failed (possible reason)
3. **WHAT TO DO** (actionable next step)

### Error Categories

| Error Type | Example Message                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Timeout    | `⏱️ **המחקר לקח יותר מדי זמן**\n\nהשירות Perplexity מבצע חיפוש מעמיק שלפעמים דורש זמן רב.\n\n**מה לעשות:**\n• נסה שאלה קצרה יותר` |
| Connection | `🔌 **שירות Tavily אינו זמין כרגע**\n\nייתכן שיש תקלה זמנית.\n\n**מה לעשות:**\n• נסה שוב בעוד מספר שניות`                         |
| Not Found  | `🔍 **לא נמצא מידע במאגרים הממשלתיים**\n\n**מה לעשות:**\n• נסה מילות מפתח רשמיות`                                                 |
| Validation | `📝 **חסר מידע לביצוע הפעולה**\n\n**מה לעשות:**\n• נסח את הבקשה בצורה מפורטת יותר`                                                |
| Rate Limit | `⚡ **הגעת למגבלת בקשות**\n\n**מה לעשות:**\n• המתן דקה ונסה שוב`                                                                  |
| Auth       | `🔐 **בעיית הרשאה**\n\n**מה לעשות:**\n• פנה למנהל המערכת`                                                                         |

### Tool-Specific Context

```typescript
// DataGov timeout
if (toolName.includes("datagov")) {
	return (
		`⏱️ **הגישה למאגרי המידע הממשלתיים ארכה זמן רב**\n\n` +
		`המאגרים הממשלתיים מכילים מיליוני רשומות...`
	);
}

// Perplexity research timeout
if (toolName.includes("research")) {
	return `⏱️ **המחקר לקח יותר מדי זמן**\n\n` + `השירות Perplexity מבצע חיפוש מעמיק...`;
}
```

---

## 5. Hebrew Intent Detection

**File:** `src/lib/server/textGeneration/mcp/toolFilter.ts`
**File:** `src/lib/server/textGeneration/utils/hebrewIntentDetector.ts`

### What It Does

Detects user intent from Hebrew keywords to select the optimal tool.

### Hebrew Keywords → Tool Scoring

```typescript
// Research intent
/מחקר|לחקור|ניתוח מעמיק|לעומק|מקיף|מפורט/ → perplexity-research (+100)

// Government data intent (EXCLUSIVE)
/מאגר רשמי|נתונים ממשלתי|לשכת הסטטיסטיקה|משרד ה/ → datagov_query (+100, exclusive)

// Quick search intent
/חפש|מצא|חדשות|עדכון/ → tavily-search (+80)

// Explanation intent
/הסבר|ספר לי|מה זה|איך עובד/ → perplexity-ask (+90)
```

### Exclusive Matching

When `exclusive: true` is set, ONLY that tool is used:

```typescript
// User asks about official Israeli data
"כמה רכבים חשמליים רשומים במשרד התחבורה?"
→ Matches /משרד ה/ with exclusive=true
→ ONLY datagov_query is returned (no alternatives)
```

---

## 6. Best-in-Class Tool Selection

**File:** `src/lib/server/textGeneration/mcp/toolFilter.ts`

### What It Does

When multiple similar tools exist, automatically selects the best one based on intent and priority.

### Perplexity Tool Scoring

```typescript
function selectBestPerplexityTool(query: string): string {
	const scores = {
		"perplexity-research": 0,
		"perplexity-ask": 0,
		"perplexity-search": 0,
		"perplexity-reason": 0,
	};

	// Score based on Hebrew keywords
	if (/מחקר|ניתוח מעמיק/.test(query)) scores["perplexity-research"] += 100;
	if (/הסבר|ספר לי/.test(query)) scores["perplexity-ask"] += 90;
	if (/חפש|מצא/.test(query)) scores["perplexity-search"] += 80;
	if (/נמק|צעד אחר צעד/.test(query)) scores["perplexity-reason"] += 85;

	// Return highest scorer
	return Object.entries(scores).sort(([, a], [, b]) => b - a)[0][0];
}
```

### Tool Category Priorities

```typescript
const TOOL_PRIORITIES = {
	datagov_query: 95, // Official Israeli data
	"perplexity-research": 100, // Deep research
	"perplexity-ask": 95,
	"perplexity-search": 90,
	"tavily-search": 85,
	fetch: 70,
};
```

---

## 7. Smart Timeout Management

**File:** `src/lib/server/mcp/httpClient.ts`

### What It Does

Applies intelligent timeouts based on tool type - research tools get 5 minutes, quick tools get 60 seconds.

### Timeout Configuration

```typescript
// Default for most tools
const DEFAULT_TIMEOUT_MS = 60_000; // 1 minute

// Extended for research-intensive tools
const EXTENDED_TIMEOUT_TOOLS = [
	"perplexity_research",
	"perplexity_ask",
	"perplexity-research",
	"perplexity-ask",
	"perplexity_reason",
	"perplexity-reason",
	"perplexity_search",
	"perplexity-search",
];
const EXTENDED_TIMEOUT_MS = 300_000; // 5 minutes
```

### Smart Timeout Selection

```typescript
const isExtendedTool = EXTENDED_TIMEOUT_TOOLS.some((t) =>
	tool.toLowerCase().includes(t.toLowerCase())
);
const smartTimeout = isExtendedTool ? EXTENDED_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
const effectiveTimeout = Math.max(timeoutMs ?? 0, smartTimeout);
```

---

## 8. Tool Capability Awareness

**File:** `src/lib/server/textGeneration/mcp/toolIntelligenceRegistry.ts`
**File:** `src/lib/server/textGeneration/utils/toolPrompt.ts`

### What It Does

Enables the model to describe its capabilities to users and proactively suggest better tools.

### Capability Manifest Generator

```typescript
function generateToolCapabilityManifest(availableTools: string[]): string {
	// Groups tools by category
	// Returns Hebrew + English descriptions
	return `
## היכולות שלי / My Capabilities

**מחקר מעמיק / Deep Research**
  • Perplexity Deep Research (לוקח זמן): מבצע מחקר מעמיק
  • Perplexity Q&A: מחפש תשובה

**חיפוש ברשת / Web Search**
  • Tavily Web Search: מחפש ברשת

**מידע ממשלתי / Government Data**
  • Israel Government Data: מחפש במאגרי המידע הממשלתיים
`;
}
```

### Post-Execution Suggestions

```typescript
function generatePostExecutionSuggestions(usedTool: string, query: string): string {
	// Quick search → Suggest deeper research
	if (usedTool.includes("tavily")) {
		if (/מחקר|ניתוח/.test(query)) {
			return `💡 **הצעה**: לניתוח מעמיק יותר, אוכל לבצע מחקר עם Perplexity Research`;
		}
	}

	// DataGov → Suggest context from other sources
	if (usedTool.includes("datagov")) {
		return `💡 **הערה**: הנתונים מגיעים ממאגרי המידע הממשלתיים הרשמיים.`;
	}

	return "";
}
```

### Prompt Instructions

Added to system prompt:

```
4. **Tool Transparency & Capability Awareness**:
   - When user asks "מה אתה יכול לעשות?" → describe available tools
   - After using a tool → mention which tool provided the answer
   - If answer is limited → proactively suggest alternatives
   - Example: "ביצעתי חיפוש מהיר. לתוצאות מקיפות יותר, אוכל להפעיל את כלי המחקר המעמיק."
```

---

## 9. Tool Name Normalization

**File:** `src/lib/server/textGeneration/mcp/toolInvocation.ts`

### What It Does

Models generate tool names inconsistently (underscores vs hyphens, case variations). This normalizes them.

### Normalization Variants

```typescript
function normalizeToolName(name: string, mapping: Record<string, any>): string {
	// Direct match
	if (mapping[name]) return name;

	// underscore → hyphen: tavily_search → tavily-search
	const hyphenVariant = name.replace(/_/g, "-");
	if (mapping[hyphenVariant]) return hyphenVariant;

	// hyphen → underscore: tavily-search → tavily_search
	const underscoreVariant = name.replace(/-/g, "_");
	if (mapping[underscoreVariant]) return underscoreVariant;

	// Case-insensitive match
	for (const key of Object.keys(mapping)) {
		if (key.toLowerCase() === name.toLowerCase()) return key;
	}

	return name;
}
```

---

## 10. Loop Detection & Prevention

**File:** `src/lib/server/textGeneration/mcp/loopDetector.ts`

### What It Does

Prevents infinite tool call loops by detecting when the model calls the same tool with the same arguments repeatedly.

### Detection Method

```typescript
interface LoopDetectorService {
	// Semantic hashing of tool calls
	addToolCall(toolName: string, args: Record<string, unknown>): void;

	// Check if we've seen this exact call 3+ times
	isLooping(): boolean;

	// Reset after successful conversation turn
	reset(): void;
}
```

### Limits

- Maximum 3 identical tool calls
- Maximum 10 tool rounds per conversation turn
- Semantic comparison (not just string equality)

---

---

## 11. DataGov Enterprise Intelligence

**Files:** `datagov/server.py`, `datagov/query_builder.py`

This is a comprehensive suite of smart methods specifically designed for querying Israeli government data (data.gov.il). These methods handle the unique challenges of Hebrew language, government data structures, and user intent disambiguation.

### 11.1 Browser Impersonation (Anti-403)

**Problem:** data.gov.il blocks non-browser requests with 403 errors.

**Solution:** Use `curl_cffi` with Chrome 120 fingerprint:

```python
session = requests.Session(impersonate="chrome120")
session.headers.update({
    "Referer": "https://data.gov.il/",
    "User-Agent": "Mozilla/5.0 ... datagov-external-client",
})
```

### 11.2 Query Decomposition

**Problem:** User queries mix WHAT they want with WHERE they want it.

**Solution:** `_decompose_query()` separates subject from location:

```python
"בתי חולים בירושלים" →
{
    "subject_tokens": ["בתי", "חולים"],
    "location_tokens": ["ירושלים"],
    "expanded_subjects": ["hospital", "בית חולים", "רפואה"...]
}
```

### 11.3 Hebrew Morphological Normalization

**Problem:** Hebrew has prefixes (ב, ל, מ, ה) and plural suffixes (ים, ות) that prevent matching.

**Solution:** `get_hebrew_variants()` generates all forms:

```python
"לרכבים" → ["לרכבים", "רכבים", "רכב"]
"בירושלים" → ["בירושלים", "ירושלים"]
```

### 11.4 Bidirectional Expansion Index

**Problem:** One-way expansion (crime → פשיעה) doesn't work in reverse (פשיעה → crime).

**Solution:** `_build_bidirectional_index()` maps ALL synonyms both ways:

```python
# Before: {"crime": ["פשיעה"]}
# After:  {"crime": {"crime", "פשיעה"}, "פשיעה": {"crime", "פשיעה"}}
```

**22 domains with 3,972 bidirectional terms** in `enterprise_expansions.py`:

- Justice: court, judge, law → בית משפט, שופט, חוק (30 keys → 95 terms)
- Healthcare: hospital, clinic → בית חולים, מרפאה (23 keys → 76 terms)
- Education: school, university → בית ספר, אוניברסיטה (27 keys → 94 terms)
- Transportation: vehicle, road, traffic → רכב, כביש, תנועה (53 keys → 202 terms)
- Finance: budget, tax, bank → תקציב, מס, בנק (37 keys → 109 terms)
- Environment: pollution, climate, nature → זיהום, אקלים, טבע (39 keys → 126 terms)
- **ENTERPRISE_SUBJECT_EXPANSIONS**: 476 keys → 1,500 terms (dataset-specific keywords)
- And 15 more domains (Agriculture, Communications, Culture, Demographics, Geography, Housing, Immigration, Insurance, Labor, Municipal, Religion, Technology, Tourism, Water, Welfare)

### 11.5 Count Query Detection & Auto-Aggregation

**Problem:** User asks "כמה רכבים בישראל?" but only gets 20 rows.

**Solution:** `_is_count_query()` + `_calculate_aggregates()`:

```python
# Detects patterns:
count_patterns = [r'\bכמה\b', r'\bסה"כ\b', r'\btotal\b', r'\bcount\b']

# If matched:
# 1. Auto-increase limit to 100 (get all records)
# 2. Calculate SUM/COUNT for numeric columns
# 3. Include totals in response:
{
    "summary_totals": {
        "כמות_רכבים": {"sum": 4500000, "count": 4500000}
    },
    "metadata": {
        "aggregation_note": "Use these totals directly to answer 'how many' questions"
    }
}
```

### 11.6 Enterprise Schema System

**Problem:** API calls to get field names are slow (500ms each). Monolithic JSON files are hard to maintain.

**Solution:** Per-dataset schema files organized by category in `schemas/` directory:

```
schemas/
├── _index.json           # Master lookup: resource_id → file path (1,960 resources)
├── _field_index.json     # Quick field availability lookup
├── _category_index.json  # Category → datasets mapping
├── health/               # 84 health datasets
│   ├── serologiclabs.json
│   ├── בתי_חולים.json
│   └── ...
├── transportation/       # 200+ transportation datasets
├── finance/              # Budget, tax, economic data
└── ... (20 category directories)
```

**Individual Schema Structure:**

```json
{
	"dataset_id": "62c54ef6-49f1-4b5f-bd1e-1e88a5955acd",
	"title": "serologiclabs",
	"organization": "משרד הבריאות",
	"categories": ["health"],
	"keywords": ["phone", "hospital", "city", "משרד", "הבריאות"],
	"resources": [
		{
			"resource_id": "b3c89abc-8e86-4abd-a4f3-a33ebee9fc07",
			"title": "מעבדות המבצעות בדיקות סרולוגיות",
			"format": "XLSX",
			"fields": [
				{ "name": "city", "type": "text", "semantic": "city" },
				{ "name": "phone", "type": "text", "semantic": "phone" },
				{ "name": "hospital", "type": "text", "semantic": null }
			],
			"total_records": 32
		}
	],
	"field_availability": {
		"has_phone": true,
		"has_address": false,
		"has_location": true,
		"has_email": false
	}
}
```

**Schema includes:**

- Field names, types, and **semantic annotations** (phone, city, address, email, date, coordinate)
- **Keywords extracted from titles and fields** for search matching
- **Field availability flags** for instant filtering (has_phone, has_address)
- **Multiple resources per dataset** with individual field mappings
- **Total record counts** per resource

### 11.7 Semantic Field Mapping

**Problem:** User asks for "phone numbers" but field is named "טלפון_מוסד".

**Solution:** `get_semantic_field_name()` maps intents to actual fields:

```python
get_semantic_field_name("abc-123", "phone") → "טלפון_מוסד"
get_semantic_field_name("abc-123", "address") → "כתובת_מלאה"
```

### 11.8 Field Intent Extraction

**Problem:** User asks "courts with addresses and phone numbers" - need to select only those fields.

**Solution:** `extract_field_intents()` parses English/Hebrew intent:

```python
"hospitals with phone numbers and addresses" →
["phone", "address"]

# Then match to schema:
match_fields_to_schema(["phone", "address"], schema_fields) →
{
    "matched_fields": ["טלפון_מוסד", "כתובת_מלאה"],
    "missing_intents": []
}
```

### 11.9 Field Availability Filtering

**Problem:** 5 datasets match "hospitals" but only 2 have phone numbers.

**Solution:** `filter_by_field_availability()` pre-filters candidates:

```python
# Before: 5 candidates
candidates = filter_by_field_availability(candidates, ["phone", "address"])
# After: 2 candidates (only those with both fields)
```

Uses lightweight `_field_index.json` for fast lookup:

```python
{
    "abc-123": {"has_phone": true, "has_address": true, "has_email": false}
}
```

### 11.10 Enterprise Fallback: Query Rephrasing

**Problem:** Initial query returns no/low-confidence matches.

**Solution:** `rephrase_query()` tries alternative phrasings:

```python
"סטטיסטיקת פשיעה" (0.25 confidence) →
# Strategy 1: Morphological normalization
"סטטיסטיקה פשיעה" (0.32)

# Strategy 2: Core subjects only
"פשיעה" (0.45)

# Strategy 3: English equivalent
"crime" (0.55) ✓ Success!
```

### 11.11 Subject-First Scoring Algorithm

**Problem:** Location matches dominate results (everything in "ירושלים" matches).

**Solution:** Subject-first scoring with minimum threshold:

```python
# Weights:
# - Subject match (title): 40%
# - Subject match (name/tags): 30%
# - Hebrew expansion match: 20%
# - Location match: 10% (bonus only)
# - Format preference: 0-30% bonus

# CRITICAL: Skip if subject score < 0.15
if subject_tokens and subject_score < 0.15:
    continue  # Don't return irrelevant location matches
```

### 11.12 Location Filter Values

**Problem:** User says "Jerusalem" but data has "ירושלים", "JERUSALEM", or "3".

**Solution:** `LOCATION_FILTER_VALUES` maps all variants:

```python
{
    "jerusalem": ["ירושלים", "Jerusalem", "JERUSALEM", "3"],
    "tel aviv": ["תל אביב", "Tel Aviv", "TEL AVIV", "5", "תל-אביב"]
}
```

### 11.13 Hebrew Prefix Stripping for Locations

**Problem:** User types "בירושלים" (in Jerusalem) but data has "ירושלים".

**Solution:** `_strip_hebrew_prefix()` intelligently strips:

```python
"בירושלים" → "ירושלים" (in Jerusalem → Jerusalem)
"לתל אביב" → "תל אביב" (to Tel Aviv → Tel Aviv)
"מחיפה" → "חיפה" (from Haifa → Haifa)
```

**Smart stripping:** Only strips if remaining word is a known location.

### 11.14 Format Preference Scoring

**Problem:** PDF datasets can't be queried; CSV is best.

**Solution:** Format bonus in scoring:

```python
fmt_bonus = {
    "CSV": 0.15,   # Best - queryable, clean
    "XLSX": 0.12,  # Good - queryable
    "JSON": 0.10,  # Good - structured
    "XML": 0.05,   # OK - structured
    "PDF": 0.02,   # Poor - not queryable
    "API": 0.08    # Good - direct access
}
```

### 11.15 Comprehensive Keyword Index

**Problem:** SUBJECT_EXPANSIONS only covers known terms; new datasets have new keywords.

**Solution:** `_load_keyword_index()` indexes ALL keywords from ALL datasets:

```python
# Indexes every keyword from enterprise_schemas.json
# Maps keyword → [resource_ids]

# If query contains any keyword, those resources get boosted
if rid in keyword_resource_scores:
    resource_score += min(0.25, keyword_resource_scores[rid] * 0.08)
```

### 11.16 Category Suggestion for Vague Queries

**Problem:** User query too vague to match anything.

**Solution:** `get_category_suggestion()` provides guidance:

```python
# If query is too vague:
"Query is too vague. Please specify a domain:
• בריאות (health) - hospitals, clinics, medical data
• חינוך (education) - schools, students, academic
• תחבורה (transport) - vehicles, roads, traffic
• תקציב (budget) - government spending, finance
..."
```

### 11.17 Resource Scoring Algorithm

**Problem:** Multiple datasets match - which is best?

**Solution:** `_score_resource()` with multi-factor scoring:

```python
def _score_resource(query, ds_title, res_title, fmt, last_modified, tags):
    score = 0.0
    # Title match: +0.4
    if query in ds_title.lower(): score += 0.4
    # Resource match: +0.3
    if query in res_title.lower(): score += 0.3
    # Tag match: +0.2
    if any(query in tag.lower() for tag in tags): score += 0.2
    # Format bonus: +0.05 to +0.30
    score += format_bonus[fmt]
    return min(1.0, score)
```

### 11.18 Markdown Table Formatting

**Problem:** Raw JSON is hard to read in chat.

**Solution:** `_format_as_markdown()` creates readable tables:

```markdown
| שם             | כתובת   | טלפון      |
| -------------- | ------- | ---------- |
| בית חולים הדסה | ירושלים | 02-1234567 |

**Source**: בתי חולים בישראל - רשימה מלאה
**Records**: 1-20 of 150 | **Format**: CSV

**📊 SUMMARY TOTALS:**

- **מספר_מיטות**: 45,000 (from 150 records)

_☝️ Use these totals to answer 'how many' questions directly._
```

### 11.19 Retry Logic with Graceful Degradation

**Problem:** API sometimes returns 403 or times out.

**Solution:** Retry with graceful fallback:

```python
max_retries = 2
for attempt in range(max_retries + 1):
    try:
        response = _http("GET", "/action/datastore_search", params)
        if response.status_code == 403:
            time.sleep(0.5)
            continue  # Retry
        if response.status_code == 404:
            return {"error": "Resource not found", "suggestion": "Try different format"}
        break
    except Exception:
        if attempt < max_retries:
            time.sleep(0.5)
            continue
```

### 11.20 Pre-loaded Resource Map

**Problem:** Searching the API for datasets is slow.

**Solution:** Pre-indexed `resources_map.json` loaded at startup:

```python
# Loaded once at startup (1187 datasets)
RESOURCES_MAP = {}
if os.path.exists(MAP_PATH):
    RESOURCES_MAP = json.load(f)
    print(f"Loaded {len(RESOURCES_MAP['datasets'])} datasets")

# Instant local search
candidates = suggest_for_query(query, RESOURCES_MAP, limit=5)
```

---

## Summary: The Smarter Tool Stack

| Layer           | Component               | Smart Behavior                           |
| --------------- | ----------------------- | ---------------------------------------- |
| **Selection**   | Hebrew Intent Detection | Understands Hebrew queries               |
| **Selection**   | Best-in-Class Selection | Picks optimal tool from similar options  |
| **Selection**   | Exclusive Matching      | Forces single tool when intent is clear  |
| **Preparation** | Parameter Normalization | Fixes model parameter mistakes           |
| **Preparation** | Tool Name Normalization | Handles underscore/hyphen/case variants  |
| **Execution**   | Smart Timeouts          | 5 min for research, 1 min for quick      |
| **Execution**   | Cascade Fallback        | Tries alternatives before failing        |
| **Execution**   | Loop Detection          | Prevents infinite loops                  |
| **Response**    | Graceful Errors         | Hebrew messages with actionable guidance |
| **Response**    | Capability Awareness    | Model can describe and suggest tools     |
| **DataGov**     | Query Decomposition     | Separates subject from location          |
| **DataGov**     | Hebrew Morphology       | Strips prefixes, handles plurals         |
| **DataGov**     | Bidirectional Expansion | 3,972 terms across 22 domains            |
| **DataGov**     | Auto-Aggregation        | Detects "כמה" and calculates totals      |
| **DataGov**     | Enterprise Schemas      | Pre-computed field metadata              |
| **DataGov**     | Semantic Field Mapping  | "phone" → "טלפון_מוסד"                   |
| **DataGov**     | Query Rephrasing        | Tries alternative phrasings on fail      |
| **DataGov**     | Subject-First Scoring   | Prioritizes WHAT over WHERE              |
| **DataGov**     | Format Preference       | CSV > XLSX > JSON > XML > PDF            |
| **DataGov**     | Pre-loaded Resource Map | 1187 datasets indexed locally            |

---

## Files Reference

| File                                   | Purpose                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| `toolIntelligenceRegistry.ts`          | Central metadata for all tools                             |
| `toolParameterRegistry.ts`             | Parameter alias mapping & normalization                    |
| `toolInvocation.ts`                    | Execution, fallback, error handling                        |
| `toolFilter.ts`                        | Intent detection, tool selection                           |
| `toolPrompt.ts`                        | System prompt with capabilities                            |
| `httpClient.ts`                        | Timeout management                                         |
| `loopDetector.ts`                      | Infinite loop prevention                                   |
| `hebrewIntentDetector.ts`              | Hebrew language detection                                  |
| `datagov/server.py`                    | DataGov MCP server with all tools                          |
| `datagov/query_builder.py`             | Query decomposition, scoring, expansion                    |
| `datagov/enterprise_expansions.py`     | 22 domains, 3,972 bidirectional Hebrew↔English terms      |
| `datagov/schemas/`                     | **1,190 per-dataset schema files** in 20 category dirs     |
| `datagov/schemas/_index.json`          | Master lookup: resource_id → schema file (1,960 resources) |
| `datagov/schemas/_field_index.json`    | Fast field availability lookup (has_phone, has_address)    |
| `datagov/schemas/_category_index.json` | Category → datasets mapping                                |
| `datagov/resources_map.json`           | Local index for instant dataset search                     |

---

## Statistics

| Metric                        | Value                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Total Smart Methods           | **30+**                                                                      |
| DataGov Datasets Indexed      | **1,187**                                                                    |
| Individual Schema Files       | **1,190** (organized in 20 categories)                                       |
| Resources with Field Metadata | **1,960**                                                                    |
| Bidirectional Expansion Terms | **3,972** (22 domains)                                                       |
| Dataset Tags Indexed          | **1,527** unique                                                             |
| Title Keywords Indexed        | **3,963** unique                                                             |
| **Total Searchable Terms**    | **~9,500+**                                                                  |
| Semantic Domains              | **22**                                                                       |
| Semantic Field Types          | **6** (phone, address, email, date, city, coordinate)                        |
| Tool Categories               | **6** (Research, Search, Data, Files, Dev, Utility)                          |
| Fallback Chains               | **3** main chains                                                            |
| Error Categories              | **7** (timeout, connection, not found, validation, rate limit, auth, server) |

---

_Generated: December 2024_
_Enterprise Tool Orchestration System v1.0_
