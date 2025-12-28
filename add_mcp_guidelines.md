# ADD_MCP_GUIDELINES.md

## Enterprise MCP Server Integration Guide

This document provides step-by-step instructions for integrating new MCP servers into the BricksLLM system with the same enterprise-grade quality as the DataGov MCP integration.

**Target Audience**: LLMs assisting with MCP integration
**Reference Implementation**: `/home/ilan/BricksLLM/datagov/`
**Last Updated**: December 2025

---

## Table of Contents

### Part 1: Getting Started (Sections 1-4)
1. [Overview: What Makes Enterprise-Grade Integration](#1-overview-what-makes-enterprise-grade-integration)
2. [Pre-Integration Analysis](#2-pre-integration-analysis)
3. [Architecture Understanding](#3-architecture-understanding)
4. [Step-by-Step Integration Process](#4-step-by-step-integration-process)

### Part 2: Implementation (Sections 5-10)
5. [Helper Scripts to Create](#5-helper-scripts-to-create)
6. [Frontend Integration Files](#6-frontend-integration-files)
7. [Docker Configuration](#7-docker-configuration)
8. [Testing & Validation](#8-testing--validation)
9. [Common Pitfalls to Avoid](#9-common-pitfalls-to-avoid)
10. [Reference: DataGov Implementation](#10-reference-datagov-implementation)

### Part 3: Enterprise Features (Sections 11-16)
11. [Hebrew Intent Detection System](#11-hebrew-intent-detection-system)
12. [Parameter Normalization System](#12-parameter-normalization-system)
13. [Cascade Fallback System](#13-cascade-fallback-system)
14. [Graceful Error Handling](#14-graceful-error-handling)
15. [Tool Capability Awareness](#15-tool-capability-awareness)
16. [Loop Detection & Safety](#16-loop-detection--safety)

### Part 4: Complete Specifications (Sections 17-21)
17. [Complete Data Flow Architecture](#17-complete-data-flow-architecture)
18. [The ToolIntelligence Interface (Complete Specification)](#18-the-toolintelligence-interface-complete-specification)
19. [Complete Parameter Normalization Reference](#19-complete-parameter-normalization-reference)
20. [All Error Categories & Graceful Handling](#20-all-error-categories--graceful-handling)
21. [DataGov Enterprise Intelligence (All 20 Methods)](#21-datagov-enterprise-intelligence-all-20-methods)

### Part 5: Operations & Reference (Sections 22-24)
22. [Troubleshooting & Debugging Guide](#22-troubleshooting--debugging-guide)
23. [Complete Statistics & Metrics Reference](#23-complete-statistics--metrics-reference)
24. [Final Summary & Quick Reference](#24-final-summary--quick-reference)

---

## 1. Overview: What Makes Enterprise-Grade Integration

Enterprise-grade MCP integration means:

| Feature | Description |
|---------|-------------|
| **Graceful Error Handling** | Users NEVER see raw errors. Always provide WHAT/WHY/WHAT TO DO |
| **Cascade Fallback** | When primary tool fails, try alternatives before giving up |
| **Parameter Normalization** | Auto-fix model parameter mistakes (aliases, types, defaults) |
| **Hebrew Intent Detection** | Understand Hebrew queries through semantic expansion |
| **Smart Tool Selection** | Pick optimal tool from similar options |
| **Progress Indicators** | Show meaningful progress messages during execution |
| **Tool Capability Awareness** | Model can describe and suggest its tools |

### Enterprise Integration Layers

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: MCP Server (Python/Node.js)                        │
│   - Core API integration                                     │
│   - Data transformation                                      │
│   - Semantic schemas                                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2: Helper Scripts                                      │
│   - resources_mapper.py (aggregate API data)                 │
│   - generate_enterprise_schemas.py (extract schemas)         │
│   - split_schemas.py (per-resource files)                    │
│   - enterprise_expansions.py (semantic terms)                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 3: Frontend Integration                                │
│   - toolIntelligenceRegistry.ts (metadata, fallbacks)        │
│   - toolParameterRegistry.ts (normalization)                 │
│   - toolFilter.ts (intent detection)                         │
│   - hebrewIntentDetector.ts (semantic expansion)             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 4: Orchestration                                       │
│   - runMcpFlow.ts (main loop)                                │
│   - toolInvocation.ts (execution + fallback)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Pre-Integration Analysis

Before writing any code, analyze the MCP server folder thoroughly.

### 2.1 Required Analysis Checklist

- [ ] **API Documentation**: What API does this MCP wrap?
- [ ] **Authentication**: What auth method (API key, OAuth, none)?
- [ ] **Rate Limits**: What are the API limits?
- [ ] **Response Format**: JSON, XML, text, structured?
- [ ] **Available Tools**: List all MCP tools exposed
- [ ] **Tool Parameters**: What parameters does each tool accept?
- [ ] **Error Patterns**: What errors does the API return?
- [ ] **Language Support**: Does it support Hebrew content?

### 2.2 Questions to Answer

1. **What domain does this MCP serve?** (e.g., research, data, files, development)
2. **What user intents should trigger this MCP?** (Hebrew + English keywords)
3. **What fallback tools exist if this fails?** (e.g., Perplexity → Tavily)
4. **What latency tier?** (fast <1s, medium 1-10s, slow 10-60s, very_slow >60s)
5. **What output format?** (structured JSON, markdown, raw text)

### 2.3 Analysis Template

Create a file `{mcp_name}_analysis.md` with:

```markdown
# MCP Analysis: {MCP_NAME}

## API Source
- Base URL: {url}
- Documentation: {link}
- Auth Method: {api_key/oauth/none}

## Tools Exposed
| Tool Name | Description | Parameters | Response Type |
|-----------|-------------|------------|---------------|
| {name} | {desc} | {params} | {type} |

## Intent Signals
- Hebrew: {כלל, מחפש, בדוק}
- English: {search, find, analyze}

## Fallback Chain
Primary: {this_tool} → Fallback: {alternative_1} → {alternative_2}

## Latency Characteristics
- Typical: {Xms}
- Timeout: {Xms}
- User Feedback Delay: {Xms}
```

---

## 3. Architecture Understanding

### 3.1 runMcpFlow.ts - The Brain

Location: `frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts`

This is the main orchestrator (~1200 lines). Key flow:

```
1. Initialize: Load MCP servers from .env
2. Get Tools: getOpenAiToolsForMcp(servers)
3. Filter: filterToolsByIntent(tools, userQuery)
4. Build Prompt: buildToolPreprompt(filteredTools)
5. Inference: Stream tokens from LLM
6. Parse: Extract tool_calls JSON from response
7. Execute: executeToolCalls() via toolInvocation.ts
8. Loop: Append results, continue if more tools needed
9. Finalize: Repair XML, stream answer
```

**Critical Understanding**:
- Model outputs `<think>` block followed by JSON `{"tool_calls": [...]}`
- `toolFilter.ts` filters tools by user intent BEFORE sending to LLM
- Loop detection prevents infinite tool calls (3x repeat limit)
- Circuit breaker fails fast if MCP server is down

### 3.2 toolInvocation.ts - The Executor

Location: `frontend-huggingface/src/lib/server/textGeneration/mcp/toolInvocation.ts`

Key functions:
- `executeToolCalls()`: Main execution loop
- `normalizeToolArgs()`: Calls registry for parameter fixing
- `toGracefulError()`: Converts raw errors to Hebrew user messages
- Cascade fallback logic: Tries `getFallbackChain()` tools on failure

**Error Handling Pattern**:
```typescript
// NEVER expose raw errors
if (isRecoverableError(error)) {
  for (const fallbackTool of getFallbackChain(originalTool)) {
    try { /* try fallback */ }
    catch { /* continue to next */ }
  }
}
// All fallbacks failed → return graceful Hebrew message
return toGracefulError(toolName, error);
```

### 3.3 toolIntelligenceRegistry.ts - The Metadata Hub

Location: `frontend-huggingface/src/lib/server/textGeneration/mcp/toolIntelligenceRegistry.ts`

Defines for EACH tool:
- `name`: Canonical tool name
- `patterns`: RegExp to match tool variants
- `mcpServer`: Which MCP server owns this tool
- `priority`: 0-100 score for selection
- `fallbackChain`: Tools to try if this fails
- `latency`: {typical, timeout, userFeedbackDelay, tier}
- `response`: {typicalTokens, maxTokens, structured, requiresSummarization}
- `messages`: {progress, noResults, suggestion, gracefulFailure}
- `intentSignals`: {keywords: RegExp, weight, exclusive?}

### 3.4 toolParameterRegistry.ts - The Normalizer

Location: `frontend-huggingface/src/lib/server/textGeneration/mcp/toolParameterRegistry.ts`

Defines parameter schemas for automatic normalization:
- `patterns`: Tool name patterns this applies to
- `parameters`: Array of {name, type, aliases, required, default, transform}

**Transformation Types**:
- `toString`: Ensure string type
- `toNumber`: Parse to number
- `toBoolean`: Parse to boolean
- `toArray`: Wrap in array or parse JSON
- `toMessages`: Convert string to `[{role, content}]` format

---

## 4. Step-by-Step Integration Process

### Step 1: Create MCP Server Folder

```
{mcp_name}/
├── server.py           # Main MCP server (FastMCP recommended)
├── requirements.txt    # Python dependencies
├── Dockerfile          # Container definition
├── README.md           # Usage documentation
├── resources_map.json  # (optional) Cached resource metadata
├── schemas/            # (optional) Per-resource schema files
│   ├── _index.json
│   ├── _field_index.json
│   └── {category}/
│       └── {dataset_name}.json
└── enterprise_expansions.py  # (optional) Semantic term mappings
```

### Step 2: Implement MCP Server

Use FastMCP for Python:

```python
from mcp.server.fastmcp import FastMCP
import httpx

mcp = FastMCP("{mcp_name}")

@mcp.tool()
async def primary_tool(query: str, limit: int = 20) -> str:
    """
    Primary tool description.

    Args:
        query: Search query in Hebrew or English
        limit: Maximum results to return (1-100)

    Returns:
        Formatted results in markdown
    """
    # Implementation here
    async with httpx.AsyncClient() as client:
        response = await client.get(API_URL, params={"q": query})
        return format_response(response.json())

if __name__ == "__main__":
    mcp.run()
```

### Step 3: Register Tool Intelligence

Add entry to `toolIntelligenceRegistry.ts`:

```typescript
{
    name: "{mcp_name}_tool",
    patterns: [/^{mcp_name}[_-]tool$/i],
    mcpServer: "{mcp_name}",
    displayName: "{Display Name}",
    priority: 85,  // Adjust based on capability
    fallbackChain: ["alternative_tool_1", "alternative_tool_2"],
    conflictsWith: [],
    latency: {
        typical: 5000,    // 5 seconds typical
        timeout: 60000,   // 1 minute max
        userFeedbackDelay: 1000,  // Show progress after 1s
        tier: "medium",
    },
    response: {
        typicalTokens: 2000,
        maxTokens: 15000,
        structured: true,
        requiresSummarization: false,
    },
    messages: {
        progress: "מחפש מידע...",  // Hebrew progress
        noResults: "לא נמצאו תוצאות. נסה לנסח את השאלה אחרת.",
        suggestion: "נסה להוסיף פרטים נוספים לחיפוש",
        gracefulFailure: "השירות אינו זמין כעת. הנה מידע ממקורות אחרים:",
    },
    intentSignals: {
        keywords: /keyword1|keyword2|מילת מפתח/i,
        weight: 90,
        exclusive: false,  // Set true if only this tool should handle
    },
}
```

### Step 4: Register Parameter Schema

Add entry to `toolParameterRegistry.ts`:

```typescript
{
    patterns: [/^{mcp_name}[_-]tool$/i],
    parameters: [
        {
            name: "query",
            type: "string",
            aliases: ["search", "q", "text", "prompt", "input"],
            required: true,
            transform: "toString",
            description: "Search query",
        },
        {
            name: "limit",
            type: "number",
            aliases: ["max_results", "count", "n"],
            default: 20,
            transform: "toNumber",
        },
        // Add more parameters as needed
    ],
}
```

### Step 5: Update Hebrew Intent Detector

Location: `frontend-huggingface/src/lib/server/textGeneration/utils/hebrewIntentDetector.ts`

Add to `SEMANTIC_EXPANSIONS`:

```typescript
"{domain}": [
    "primary_term",
    "כלל_עברית",
    "synonym1",
    "synonym2",
    // ... more terms
],
```

### Step 6: Update Tool Categories

In `toolIntelligenceRegistry.ts`, add to `TOOL_CATEGORIES`:

```typescript
{category}: {
    name: "{Category Name}",
    hebrewName: "{שם קטגוריה}",
    description: "{Category description}",
    tools: ["{mcp_name}_tool", "{mcp_name}_tool2"],
},
```

### Step 7: Configure Docker

Add to `docker-compose.yml`:

```yaml
{mcp_name}:
  build:
    context: ./{mcp_name}
    dockerfile: Dockerfile
  container_name: {mcp_name}
  restart: unless-stopped
  ports:
    - "{port}:{port}"
  environment:
    - API_KEY=${API_KEY}
  networks:
    - bricksllm-network
```

### Step 8: Add to MCP_SERVERS

In `.env`:

```env
MCP_SERVERS='[
  {"name": "{mcp_name}", "url": "http://{mcp_name}:{port}/sse"},
  ... existing servers ...
]'
```

---

## 5. Helper Scripts to Create

### 5.1 resources_mapper.py

Purpose: Aggregate all available resources from the API into a single JSON file.

```python
#!/usr/bin/env python3
"""
{MCP_NAME} Resources Mapper

Aggregates all resources from the API into resources_map.json
for fast lookup during queries.
"""

import json
import httpx
import asyncio

API_BASE = "https://api.example.com"

async def fetch_all_resources() -> dict:
    """Fetch all resources from the API."""
    resources = {}
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{API_BASE}/resources")
        data = response.json()
        for item in data["items"]:
            resources[item["id"]] = {
                "name": item["name"],
                "description": item.get("description", ""),
                "keywords": item.get("keywords", []),
                "categories": item.get("categories", []),
            }
    return resources

async def main():
    resources = await fetch_all_resources()
    with open("resources_map.json", "w", encoding="utf-8") as f:
        json.dump(resources, f, ensure_ascii=False, indent=2)
    print(f"Mapped {len(resources)} resources")

if __name__ == "__main__":
    asyncio.run(main())
```

### 5.2 generate_enterprise_schemas.py

Purpose: Extract field-level schemas from each resource for semantic matching.

```python
#!/usr/bin/env python3
"""
{MCP_NAME} Enterprise Schema Generator

Generates per-resource schema files with:
- Field names and types
- Semantic field annotations
- Category/keyword mappings
"""

import json
import os
from typing import Dict, Any, List

def generate_schema(resource: Dict[str, Any]) -> Dict[str, Any]:
    """Generate enterprise schema for a single resource."""
    return {
        "resource_id": resource["id"],
        "name": resource["name"],
        "description": resource.get("description", ""),
        "keywords": resource.get("keywords", []),
        "categories": resource.get("categories", []),
        "fields": [
            {
                "name": field["name"],
                "type": field["type"],
                "description": field.get("description", ""),
                "semantic_type": infer_semantic_type(field["name"]),
            }
            for field in resource.get("fields", [])
        ],
    }

def infer_semantic_type(field_name: str) -> str:
    """Map field name to semantic type."""
    name_lower = field_name.lower()
    if "phone" in name_lower or "טלפון" in name_lower:
        return "phone"
    if "email" in name_lower or "דוא" in name_lower:
        return "email"
    if "address" in name_lower or "כתובת" in name_lower:
        return "address"
    if "date" in name_lower or "תאריך" in name_lower:
        return "date"
    return "text"

def main():
    with open("resources_map.json", "r", encoding="utf-8") as f:
        resources = json.load(f)

    os.makedirs("schemas", exist_ok=True)

    for resource_id, resource in resources.items():
        schema = generate_schema(resource)
        # Save to category subfolder
        category = resource.get("categories", ["general"])[0]
        category_dir = os.path.join("schemas", category)
        os.makedirs(category_dir, exist_ok=True)

        filename = f"{resource['name'].replace(' ', '_')}.json"
        with open(os.path.join(category_dir, filename), "w", encoding="utf-8") as f:
            json.dump(schema, f, ensure_ascii=False, indent=2)

    print(f"Generated {len(resources)} schema files")

if __name__ == "__main__":
    main()
```

### 5.3 enterprise_expansions.py

Purpose: Bidirectional Hebrew↔English semantic term mappings.

```python
"""
{MCP_NAME} Enterprise Expansions

Bidirectional semantic mappings for Hebrew↔English intent detection.
Structure: {domain: [terms]} where terms include both languages.
"""

SUBJECT_EXPANSIONS = {
    "domain1": [
        "english_term", "מונח_עברי",
        "synonym1", "מילה_נרדפת",
    ],
    "domain2": [
        "term1", "מונח1",
        "term2", "מונח2",
    ],
    # Add more domains...
}

def expand_query(query: str) -> set:
    """
    Expand query with related terms from all matching domains.

    Args:
        query: User query in Hebrew or English

    Returns:
        Set of expanded terms
    """
    expanded = set()
    query_lower = query.lower()

    for domain, terms in SUBJECT_EXPANSIONS.items():
        terms_lower = [t.lower() for t in terms]
        if any(term in query_lower for term in terms_lower):
            expanded.update(terms)

    return expanded

def get_all_terms() -> int:
    """Count total terms across all domains."""
    return sum(len(terms) for terms in SUBJECT_EXPANSIONS.values())
```

---

## 6. Frontend Integration Files

### 6.1 Files to Modify

| File | Purpose | What to Add |
|------|---------|-------------|
| `toolIntelligenceRegistry.ts` | Tool metadata | New tool entry with all fields |
| `toolParameterRegistry.ts` | Parameter schemas | New tool parameter definitions |
| `hebrewIntentDetector.ts` | Hebrew expansion | New domain terms |
| `toolFilter.ts` | Intent detection | (Usually auto-handled) |

### 6.2 Integration Validation Checklist

- [ ] Tool appears in `getToolIntelligence()` lookup
- [ ] Parameters are normalized by `normalizeWithRegistry()`
- [ ] Fallback chain is registered
- [ ] Hebrew intent keywords work
- [ ] Progress messages display correctly
- [ ] Error messages are graceful (Hebrew)
- [ ] Tool shows in capability manifest

---

## 7. Docker Configuration

### 7.1 Dockerfile Template

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# System dependencies (if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

# Pre-generate schemas if applicable
RUN python generate_enterprise_schemas.py || true

# Expose MCP port
EXPOSE 8080

# Run MCP server
CMD ["python", "server.py"]
```

### 7.2 requirements.txt Template

```
mcp>=1.0.0
httpx>=0.27.0
fastmcp>=0.1.0
curl_cffi>=0.6.0  # If browser impersonation needed
```

### 7.3 docker-compose.yml Addition

```yaml
  {mcp_name}:
    build:
      context: ./{mcp_name}
      dockerfile: Dockerfile
    container_name: {mcp_name}
    restart: unless-stopped
    ports:
      - "{port}:{port}"
    environment:
      - {MCP_NAME}_API_KEY=${MCP_NAME_API_KEY}
    volumes:
      - ./{mcp_name}/resources_map.json:/app/resources_map.json:ro
      - ./{mcp_name}/schemas:/app/schemas:ro
    networks:
      - bricksllm-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:{port}/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## 8. Testing & Validation

### 8.1 Unit Tests

Create `{mcp_name}/test_server.py`:

```python
import pytest
from server import mcp

@pytest.mark.asyncio
async def test_primary_tool():
    result = await mcp.call_tool("primary_tool", {"query": "test"})
    assert result is not None
    assert "error" not in result.lower()

@pytest.mark.asyncio
async def test_hebrew_query():
    result = await mcp.call_tool("primary_tool", {"query": "בדיקה"})
    assert result is not None
```

### 8.2 Integration Tests

Test the full flow:

```bash
# 1. Start the stack
./stop.sh && ./start.sh

# 2. Wait for containers
sleep 30

# 3. Test MCP connection
curl -X POST http://localhost:8003/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Use {mcp_name} to search for test"}]}'
```

### 8.3 Validation Checklist

- [ ] MCP server starts without errors
- [ ] Tool appears in tool list (check logs)
- [ ] English queries work
- [ ] Hebrew queries work
- [ ] Error handling returns graceful messages
- [ ] Fallback triggers on failure
- [ ] Progress messages display
- [ ] Parameter aliases are normalized

---

## 9. Common Pitfalls to Avoid

### 9.1 Breaking Changes

| Mistake | Consequence | Prevention |
|---------|-------------|------------|
| Missing tool in registry | Tool fails silently | Always add to `toolIntelligenceRegistry.ts` |
| Wrong parameter schema | Arguments rejected | Test all parameter aliases |
| Missing Hebrew patterns | Intent not detected | Add to `hebrewIntentDetector.ts` |
| No fallback chain | Single point of failure | Define fallback tools |
| Raw error exposure | Bad UX | Use `toGracefulError()` pattern |

### 9.2 Performance Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Slow startup | Loading large JSON | Use split schema files |
| Timeout errors | No timeout config | Set proper latency tier |
| Memory bloat | Loading all schemas | Use lazy loading |

### 9.3 Security Considerations

- Never expose API keys in logs
- Validate all user inputs
- Use HTTPS for external APIs
- Sanitize tool arguments

---

## 10. Reference: DataGov Implementation

### 10.1 File Structure

```
datagov/
├── server.py                 # FastMCP server (450 lines)
├── query_builder.py          # Query decomposition (800 lines)
├── enterprise_expansions.py  # 22 domains, 3,972 terms
├── resources_mapper.py       # API aggregation helper
├── generate_enterprise_schemas.py
├── split_schemas.py          # Creates per-dataset files
├── resources_map.json        # 1,960 resources cached
├── schemas/                  # 1,190 schema files
│   ├── _index.json
│   ├── _field_index.json
│   ├── agriculture/
│   ├── economy/
│   ├── education/
│   ├── environment/
│   ├── government/
│   ├── health/
│   └── ... (20 categories)
├── Dockerfile
├── requirements.txt
└── README.md
```

### 10.2 Key Implementation Patterns

**Browser Impersonation** (for APIs that block bots):
```python
from curl_cffi import requests as curl_requests

response = curl_requests.get(
    url,
    headers={"User-Agent": "..."},
    impersonate="chrome120"
)
```

**Query Decomposition** (separate WHAT from WHERE):
```python
def decompose_query(query: str) -> Dict:
    return {
        "subject": extract_subject(query),   # WHAT they want
        "location": extract_location(query), # WHERE to look
        "filters": extract_filters(query),   # Additional constraints
    }
```

**Hebrew Morphology** (handle prefixes/suffixes):
```python
HEBREW_PREFIXES = ['ל', 'ב', 'מ', 'ה', 'ו', 'ש', 'כ']
HEBREW_PLURAL_SUFFIXES = ['ים', 'ות']

def get_hebrew_variants(word: str) -> List[str]:
    # "לרכבים" → ["לרכבים", "רכבים", "רכב"]
    ...
```

**Subject-First Scoring** (prioritize intent over location):
```python
def score_resource(resource: dict, query: dict) -> float:
    subject_score = match_subject(resource, query["subject"])
    if subject_score < MINIMUM_THRESHOLD:
        return 0  # Don't return irrelevant data
    location_bonus = match_location(resource, query["location"])
    return subject_score + (location_bonus * 0.5)
```

### 10.3 Statistics

| Metric | Value |
|--------|-------|
| Total Schema Files | 1,190 |
| Categories | 20 |
| Resources with Metadata | 1,960 |
| Bidirectional Terms | 3,972 |
| Semantic Domains | 22 |
| Dataset Tags Indexed | 1,527 |
| Title Keywords Indexed | 3,963 |
| **Total Searchable Terms** | ~9,500+ |

---

## Quick Reference: Integration Command Sequence

```bash
# 1. Create folder structure
mkdir -p {mcp_name}/schemas

# 2. Create MCP server
touch {mcp_name}/server.py
touch {mcp_name}/requirements.txt
touch {mcp_name}/Dockerfile

# 3. Create helper scripts
touch {mcp_name}/resources_mapper.py
touch {mcp_name}/enterprise_expansions.py

# 4. Generate resources map
cd {mcp_name} && python resources_mapper.py

# 5. Generate schemas
python generate_enterprise_schemas.py

# 6. Update frontend files
# Edit: toolIntelligenceRegistry.ts
# Edit: toolParameterRegistry.ts
# Edit: hebrewIntentDetector.ts

# 7. Update Docker
# Edit: docker-compose.yml
# Edit: .env (MCP_SERVERS)

# 8. Test
./stop.sh && ./start.sh
./test-stack.sh
```

---

## Summary

Enterprise-grade MCP integration requires attention to:

1. **Layer 1**: Robust MCP server with proper error handling
2. **Layer 2**: Helper scripts for data aggregation and schema generation
3. **Layer 3**: Frontend registry entries for metadata, parameters, and intent
4. **Layer 4**: Docker configuration for deployment

Follow the DataGov implementation as the reference standard. Never expose raw errors to users, always provide fallbacks, and ensure Hebrew queries work through semantic expansion.

When analyzing a new MCP server folder, look for:
- API documentation and endpoints
- Authentication requirements
- Rate limits and timeout characteristics
- Response formats
- Existing error patterns

Then systematically implement each layer, testing at each stage before proceeding to the next.

---

## 11. System Prompt Engineering

### 11.1 The toolPrompt.ts File

Location: `frontend-huggingface/src/lib/server/textGeneration/utils/toolPrompt.ts`

The `buildToolPreprompt()` function generates the system prompt that instructs the model on:
- How to reason before using tools (`<think>` blocks)
- Exact JSON format for tool calls
- Tool capability awareness
- Attribution requirements

**Key Components**:

```typescript
function buildToolPreprompt(tools: OpenAiTool[], intentHint?: string): string {
    // 1. Tool definitions in JSON
    const toolDefs = JSON.stringify(tools, null, 2);

    // 2. Capability manifest (human-readable list of what tools can do)
    const capabilityManifest = generateToolCapabilityManifest(toolNames);

    // 3. Intent hint (optional system note for special routing)
    const hintSection = intentHint ? `\n**SYSTEM NOTE**:\n${intentHint}\n` : "";

    // 4. Build complete prompt
    return `Available Tools: ${toolDefs}
Today's date: ${currentDate}${hintSection}
${capabilityManifest}

**Guidelines:**
1. Reasoning First: Start with <think> block
2. Tool Selection: Output JSON after </think>
3. Constraints: Match schema exactly
4. Transparency: Mention which tool provided answer
`;
}
```

### 11.2 Capability Manifest

The `generateToolCapabilityManifest()` function creates a human-readable list of tool capabilities:

```typescript
/**
 * Generates capability manifest like:
 *
 * ## היכולות שלי / My Capabilities
 *
 * **מידע ממשלתי / Government Data**
 *   • Israel Government Data: מחפש במאגרי המידע הממשלתיים
 *
 * **חיפוש ברשת / Web Search**
 *   • Tavily Web Search (מהיר): מחפש ברשת
 */
export function generateToolCapabilityManifest(availableTools: string[]): string
```

### 11.3 Tool-Specific Prompts

For each new MCP tool, you should define how it appears in the capability manifest by updating `TOOL_CATEGORIES` in `toolIntelligenceRegistry.ts`:

```typescript
TOOL_CATEGORIES: Record<ToolCategory, ToolCategoryInfo> = {
    {your_category}: {
        name: "{Category Name}",
        hebrewName: "{שם קטגוריה}",
        description: "{Category description}",
        tools: ["{mcp_name}_tool"],
    },
}
```

### 11.4 Intent Hints

Intent hints are special system notes injected into the prompt when specific conditions are detected:

```typescript
// In runMcpFlow.ts
const intentHint = detectSpecialIntent(userQuery);
const preprompt = buildToolPreprompt(filteredTools, intentHint);
```

**When to use intent hints**:
- Detected language preference (Hebrew-first queries)
- Specific domain detection (government data, research)
- Time-sensitive queries (news, current events)

---

## 12. Tool Dissection & Understanding

### 12.1 Analyzing Existing Tools

Before adding a new MCP, thoroughly analyze similar existing tools:

```typescript
// toolIntelligenceRegistry.ts - Full tool definition structure
{
    name: "datagov_query",                    // Canonical name
    patterns: [/^datagov[_-]query$/i],        // Match variants
    mcpServer: "datagov",                     // MCP server name
    displayName: "Israel Government Data",   // Human-readable
    priority: 95,                             // Selection priority (0-100)
    fallbackChain: ["perplexity-search"],     // Alternatives on failure
    conflictsWith: [],                        // Mutually exclusive tools
    latency: {
        typical: 5000,                        // Expected ms
        timeout: 60000,                       // Max wait
        userFeedbackDelay: 1000,              // When to show progress
        tier: "medium",                       // fast|medium|slow|very_slow
    },
    response: {
        typicalTokens: 2000,                  // Expected output size
        maxTokens: 15000,                     // Truncation limit
        structured: true,                     // JSON vs text
        requiresSummarization: false,         // Post-process needed?
    },
    messages: {
        progress: "מחפש במאגרי המידע...",      // During execution
        noResults: "לא נמצאו תוצאות...",       // Empty results
        suggestion: "נסה לציין שם משרד...",     // Query improvement
        gracefulFailure: "המאגרים אינם זמינים...", // Error fallback
    },
    intentSignals: {
        keywords: /מאגר רשמי|ממשלתי|data\.gov/i, // Trigger patterns
        weight: 100,                          // Score boost on match
        exclusive: true,                      // Only use this tool
    },
}
```

### 12.2 Understanding Tool Categories

Tools are grouped into categories for filtering in `toolFilter.ts`:

```typescript
const TOOL_CATEGORIES = {
    // Deep Research: Perplexity-only (Tavily EXCLUDED)
    deepResearch: {
        keywords: /research|מחקר|לחקור|ניתוח מעמיק/i,
        tools: ["perplexity-ask", "perplexity-search", "perplexity-research"],
    },

    // Simple Search: Tavily preferred
    simpleSearch: {
        keywords: /search|find|חפש|מצא/i,
        tools: ["tavily-search", "tavily-extract", "fetch"],
    },

    // Government Data: DataGov
    datagov: {
        keywords: /government data|מאגר רשמי|ממשלתי/i,
        tools: ["datagov_query", "package_search", "datastore_search"],
    },
}
```

### 12.3 Tool Patterns Recognition

`identifyToolMcp()` identifies which MCP a tool belongs to:

```typescript
const TOOL_PATTERNS = {
    perplexity: /^perplexity[_-]/i,
    tavily: /^tavily[_-]/i,
    datagov: /^(datagov|package_|organization_|resource_|datastore_)/i,
}
```

**When adding a new MCP, add its pattern here for graceful error handling.**

---

## 13. Ranking Methodology

### 13.1 Tool Priority Scoring

Tools are scored using `scoreToolForQuery()`:

```typescript
export function scoreToolForQuery(toolName: string, query: string): number {
    const ti = getToolIntelligence(toolName);
    if (!ti) return 0;

    let score = 0;

    // Check intent signals
    if (ti.intentSignals.keywords.test(query)) {
        score += ti.intentSignals.weight;  // 0-100
    }

    // Add priority bonus (scaled to 0-50)
    score += ti.priority * 0.5;

    return score;  // Final: 0-200 range
}
```

### 13.2 Ranking All Tools

`rankToolsForQuery()` sorts tools by score:

```typescript
export function rankToolsForQuery(query: string, availableTools: string[]): Array<{
    tool: string;
    score: number;
    latencyTier: LatencyTier;
    isExclusive: boolean;
}> {
    const results = availableTools.map(toolName => {
        const score = scoreToolForQuery(toolName, query);
        const isExclusive = ti?.intentSignals.exclusive && ti.intentSignals.keywords.test(query);
        return { tool: toolName, score, latencyTier, isExclusive };
    });

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // If exclusive match exists, return ONLY that tool
    const exclusiveMatch = results.find(r => r.isExclusive);
    if (exclusiveMatch) {
        return [exclusiveMatch];  // No other tools considered
    }

    return results;
}
```

### 13.3 Priority Constants

Define priority scores in `TOOL_PRIORITIES`:

```typescript
const TOOL_PRIORITIES: Record<string, number> = {
    // Research tools (highest)
    "perplexity-ask": 100,
    "perplexity-research": 100,
    sequentialthinking: 95,

    // Data tools
    datagov_query: 95,
    datastore_search: 80,

    // Search tools
    "tavily-search": 90,
    fetch: 90,

    // Utilities (lower)
    search: 40,
    google_search: 10,
};
```

### 13.4 Perplexity Tool Scoring

For Perplexity tools specifically, `scorePerplexityTools()` provides advanced scoring:

```typescript
const PERPLEXITY_INTENTS = {
    search: {
        keywords: /חפש|מצא|what is|who is|search|find/i,
        weight: 100,
    },
    ask: {
        keywords: /הסבר|ספר לי|explain|tell me/i,
        weight: 90,
    },
    research: {
        keywords: /מחקר|לחקור|in-depth|comprehensive/i,
        weight: 100,
    },
    reason: {
        keywords: /צעד אחר צעד|step by step|reason|prove/i,
        weight: 100,
    },
};

// Quality ranking for tie-breaking
const TOOL_QUALITY_RANK: Record<PerplexityTool, number> = {
    perplexity_ask: 4,      // Best quality
    perplexity_research: 3, // Deep with citations
    perplexity_reason: 2,   // Step-by-step
    perplexity_search: 1,   // Quick facts
};
```

---

## 14. Validation & Verification of Enterprise Results

### 14.1 Result Verification Checklist

For enterprise-grade results, verify:

- [ ] **Relevance**: Results match user intent (subject-first scoring)
- [ ] **Completeness**: All requested data fields present
- [ ] **Accuracy**: Data from authoritative sources
- [ ] **Freshness**: Data is current (check timestamps)
- [ ] **Format**: Output in expected format (markdown, JSON)

### 14.2 Loop Detection

`LoopDetector` prevents infinite tool loops:

```typescript
class LoopDetector {
    private readonly MAX_REPEATED_CALLS = 3;

    detectToolLoop(toolCalls: NormalizedToolCall[]): boolean {
        const semanticHash = this.generateToolCallHash(toolCalls);
        const count = this.callHashes.get(semanticHash) || 0;

        if (count >= this.MAX_REPEATED_CALLS) {
            return true;  // LOOP DETECTED
        }

        this.callHashes.set(semanticHash, count + 1);
        return false;
    }

    // Semantic hashing: ignores ID differences, focuses on intent
    private generateToolCallHash(calls): string {
        return calls
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(c => `${c.name}:${normalizedArgs}`)
            .join("|");
    }
}
```

### 14.3 Post-Execution Suggestions

`generatePostExecutionSuggestions()` provides proactive guidance:

```typescript
function generatePostExecutionSuggestions(usedTool: string, query: string): string {
    // Quick search → Suggest deeper research
    if (usedTool.includes("tavily") || usedTool === "perplexity-search") {
        if (/מחקר|ניתוח|comprehensive/.test(query)) {
            return `💡 **הצעה**: לניתוח מעמיק יותר, אוכל לבצע מחקר עם Perplexity Research`;
        }
    }

    // DataGov → Suggest context from other sources
    if (usedTool.includes("datagov")) {
        return `💡 **הערה**: הנתונים מגיעים ממאגרים ממשלתיים רשמיים. לקבלת הקשר נוסף, אוכל לחפש מידע משלים.`;
    }

    return "";
}
```

### 14.4 Tool Attribution

Always attribute which tool provided the answer:

```typescript
function getToolUsageAttribution(toolName: string): string {
    const ti = getToolIntelligence(toolName);
    return `מקור: ${ti?.displayName || toolName}`;
}

// Usage in response:
// "המידע מבוסס על חיפוש עם Tavily"
// "הנתונים מגיעים ממאגרי המידע הממשלתיים"
```

### 14.5 Complementary Tool Suggestions

`getComplementaryTools()` suggests enhancing tools:

```typescript
function getComplementaryTools(currentTool: string): Array<{
    name: string;
    displayName: string;
    reason: string;
}> {
    // If using quick search, suggest deep research
    if (currentTool.includes("tavily")) {
        return [{
            name: "perplexity-research",
            displayName: "Perplexity Deep Research",
            reason: "לניתוח מעמיק ומקיף יותר",
        }];
    }

    // If using Perplexity, suggest DataGov for Israeli data
    if (currentTool.includes("perplexity")) {
        return [{
            name: "datagov_query",
            displayName: "Israel Government Data",
            reason: "לנתונים רשמיים ממאגרי המידע הממשלתיים",
        }];
    }

    return [];
}
```

---

## 15. Optimized Calling Methods

### 15.1 Parameter Normalization Flow

Always normalize parameters before execution:

```typescript
function normalizeToolArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
    // Step 1: Security sanitization (prevent injection)
    const sanitizationResult = sanitizeToolArguments(toolName, args);

    // Step 2: Registry-based normalization
    // - Map aliases: "prompt" → "query"
    // - Type coercion: "20" → 20
    // - Apply defaults: limit = 20
    const registryResult = normalizeWithRegistry(toolName, sanitizationResult.sanitized!);

    return registryResult.normalized;
}
```

### 15.2 Tool Name Normalization

Handle underscore/hyphen variants:

```typescript
function normalizeToolName(name: string, mapping: Record<string, McpToolMapping>): string {
    // Direct match
    if (mapping[name]) return name;

    // Try underscore to hyphen: tavily_search → tavily-search
    const hyphenVariant = name.replace(/_/g, "-");
    if (mapping[hyphenVariant]) return hyphenVariant;

    // Try hyphen to underscore: tavily-search → tavily_search
    const underscoreVariant = name.replace(/-/g, "_");
    if (mapping[underscoreVariant]) return underscoreVariant;

    // Case-insensitive match
    for (const key of Object.keys(mapping)) {
        if (key.toLowerCase() === name.toLowerCase()) return key;
    }

    return name;
}
```

### 15.3 Cascade Fallback Execution

When primary tool fails, try fallbacks:

```typescript
async function executeWithFallback(toolName: string, args: Record<string, unknown>) {
    try {
        return await executeTool(toolName, args);
    } catch (error) {
        if (!isRecoverableError(error)) throw error;

        // Try fallback chain
        const fallbackChain = getFallbackChain(toolName);
        for (const fallbackTool of fallbackChain) {
            try {
                logger.info({ originalTool: toolName, fallbackTool }, "Trying fallback");
                return await executeTool(fallbackTool, args);
            } catch (fallbackError) {
                logger.warn({ fallbackTool }, "Fallback also failed");
                continue;
            }
        }

        // All fallbacks failed → graceful error
        return toGracefulError(toolName, error.message);
    }
}
```

### 15.4 Timeout Management

Use smart timeouts based on latency tier:

```typescript
function getToolTimeout(toolName: string): number {
    const ti = getToolIntelligence(toolName);
    return ti?.latency.timeout || 60000;  // Default 1 minute
}

// Latency tiers:
// fast: 10s (file operations)
// medium: 60s (search, data queries)
// slow: 120s (research)
// very_slow: 300s (deep research)
```

### 15.5 Parallel vs Sequential Execution

The system executes independent tool calls in parallel:

```typescript
// In executeToolCalls():
const tasks = prepared.map(async (p, index) => {
    // Each tool call runs independently
    await executeCall(client);
});

// Kick off all and stream as they finish
Promise.allSettled(tasks).then(() => q.close());

// Results are collated in original order
results.sort((a, b) => a.index - b.index);
```

---

## 16. Complete Integration Verification Checklist

### Layer 1: MCP Server

- [ ] Server starts without errors
- [ ] All tools are exposed correctly
- [ ] API authentication works
- [ ] Error handling returns meaningful messages
- [ ] Timeout handling implemented

### Layer 2: Schema & Expansions

- [ ] Resources mapped to JSON
- [ ] Per-resource schema files generated
- [ ] Semantic expansions defined (Hebrew + English)
- [ ] Field index for fast lookups

### Layer 3: Frontend Integration

- [ ] `toolIntelligenceRegistry.ts` entry added
- [ ] `toolParameterRegistry.ts` schema defined
- [ ] `TOOL_CATEGORIES` updated in `toolFilter.ts`
- [ ] `TOOL_PRIORITIES` score assigned
- [ ] `TOOL_PATTERNS` pattern added for identification
- [ ] Hebrew intent keywords in `hebrewIntentDetector.ts`

### Layer 4: Orchestration

- [ ] Tool appears in capability manifest
- [ ] Parameter normalization works
- [ ] Fallback chain tested
- [ ] Loop detection verified
- [ ] Graceful errors in Hebrew
- [ ] Progress messages display
- [ ] Post-execution suggestions work
- [ ] Tool attribution correct

### Docker & Deployment

- [ ] Dockerfile builds correctly
- [ ] docker-compose.yml configured
- [ ] MCP_SERVERS in .env updated
- [ ] Health check passes
- [ ] Logs show tool invocations

### End-to-End Tests

- [ ] English query works
- [ ] Hebrew query works
- [ ] Parameter aliases normalized
- [ ] Error triggers graceful message
- [ ] Fallback works on failure
- [ ] Results are accurate and complete

---

## 17. Complete Data Flow Architecture

### 17.1 System Architecture Diagram

```
User Request
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend (SvelteKit) - Port 8003                           │
│  ├── runMcpFlow.ts (Core Orchestrator - 1200+ lines)        │
│  ├── toolPrompt.ts (Reasoning-First Prompting)              │
│  ├── toolIntelligenceRegistry.ts (Tool Metadata Hub)        │
│  ├── toolParameterRegistry.ts (Parameter Normalization)     │
│  ├── toolInvocation.ts (Execution + Cascade Fallback)       │
│  ├── toolFilter.ts (Intent Detection + Best-in-Class)       │
│  ├── hebrewIntentDetector.ts (Semantic Expansion)           │
│  ├── loopDetector.ts (Infinite Loop Prevention)             │
│  ├── circuitBreaker.ts (Fails Fast on MCP Down)             │
│  ├── serviceContainer.ts (Dependency Injection)             │
│  └── xmlUtils.ts (Repairs Unclosed Tags)                    │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  BricksLLM Proxy - Port 8002                                │
│  ├── Rate Limiting                                          │
│  ├── Authentication                                         │
│  └── Request/Response Caching                               │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  MCP Servers                                                │
│  ├── DataGov (Israeli Government Data) - Port 8084          │
│  │   ├── 1,190 schema files in 20 categories                │
│  │   ├── 22 semantic domains with 3,972 terms               │
│  │   ├── Query decomposition + subject-first scoring        │
│  │   └── Auto-aggregation for count queries                 │
│  ├── Perplexity (Research, Ask, Search, Reason)             │
│  ├── Tavily (Web Search, Extract)                           │
│  ├── Filesystem (File operations)                           │
│  ├── Git (Repository operations)                            │
│  ├── Docker (Container operations)                          │
│  └── Others (80+ tools total)                               │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  LLM Backend - Port 5002                                    │
│  └── DictaLM-3.0 (24B) via llama-server                     │
│      ├── Context Size: 32768 tokens                         │
│      ├── Max Output: 16384 tokens                           │
│      ├── GPU Layers: 99 (full offload)                      │
│      └── Flash Attention: enabled                           │
└─────────────────────────────────────────────────────────────┘
```

### 17.2 Docker Network Configuration

| Service | Container Name | Internal Port | Host Port | Purpose |
|---------|---------------|---------------|-----------|---------|
| **Frontend** | frontend | 8003 | 8003 | User Chat UI (Hot-reload) |
| **Proxy** | bricksllm-proxy | 8002 | 8002 | **Main Entrypoint** for API calls |
| **Admin** | bricksllm-admin | 8001 | 8001 | Configuration API |
| **Llama** | llama-server | 5002 | 5002 | Inference Engine |
| **Redis** | redis | 6379 | 6380 | Rate limiting & Cache |
| **Postgres** | postgresql | 5432 | 5433 | Persistent storage |
| **DataGov** | datagov | 8084 | 8084 | Israeli Government Data MCP |

### 17.3 Request Flow (Step-by-Step)

```
1. User → Frontend (8003)
   └── User sends chat message

2. Frontend → runMcpFlow.ts
   └── Initialize ServiceContainer
   └── Load MCP_SERVERS from .env

3. runMcpFlow.ts → getOpenAiToolsForMcp()
   └── Fetch tool schemas from all MCP servers
   └── Return array of OpenAI-compatible tool definitions

4. runMcpFlow.ts → filterToolsByIntent()
   └── Detect Hebrew/English intent from query
   └── Filter tools by category (deepResearch, simpleSearch, datagov)
   └── Apply TOOL_PRIORITIES for ranking
   └── Return filtered tools (max 4 by default)

5. runMcpFlow.ts → buildToolPreprompt()
   └── Generate system prompt with tool definitions
   └── Include capability manifest
   └── Add reasoning-first instructions

6. Frontend → Proxy (8002)
   └── Send request with system prompt + user message

7. Proxy → Llama Server (5002)
   └── Stream tokens from DictaLM-3.0
   └── Model outputs <think> block followed by tool_calls JSON

8. runMcpFlow.ts → parseToolCalls()
   └── Extract JSON tool calls from response
   └── Validate against tool schemas

9. runMcpFlow.ts → executeToolCalls()
   └── For each tool call:
       ├── normalizeToolName() - Fix underscore/hyphen variants
       ├── normalizeToolArgs() - Apply parameter registry
       ├── LoopDetector.check() - Prevent infinite loops
       └── callMcpTool() - Execute via MCP server

10. toolInvocation.ts → Error Handling
    └── If tool fails:
        ├── Check if recoverable error
        ├── Try fallback chain (getFallbackChain)
        └── If all fail → toGracefulError() (Hebrew message)

11. runMcpFlow.ts → Append Results
    └── Add tool results to conversation history
    └── Loop back to step 6 if more tools needed

12. runMcpFlow.ts → Finalize
    └── xmlUtils.ts repairs any unclosed tags
    └── Stream final answer to user
```

---

## 18. The ToolIntelligence Interface (Complete Specification)

### 18.1 Full Interface Definition

**Location**: `frontend-huggingface/src/lib/server/textGeneration/mcp/toolIntelligenceRegistry.ts`

```typescript
/**
 * Complete metadata for a single MCP tool.
 * This is the CENTRAL source of truth for tool behavior.
 */
export interface ToolIntelligence {
    /**
     * Canonical tool name (e.g., "datagov_query", "perplexity-search")
     * MUST match exactly what the MCP server exposes
     */
    name: string;

    /**
     * Regular expressions to match tool name variants
     * Used for normalization: "tavily_search" matches /^tavily[_-]search$/i
     */
    patterns: RegExp[];

    /**
     * Name of the MCP server this tool belongs to
     * Used for error messages and logging
     */
    mcpServer: string;

    /**
     * Human-readable name for display in capability manifest
     * Should include Hebrew translation if applicable
     */
    displayName: string;

    /**
     * Selection priority score (0-100)
     * Higher = more likely to be selected when multiple tools match
     * 100 = highest priority (research tools)
     * 10 = lowest priority (deprecated tools)
     */
    priority: number;

    /**
     * Ordered list of tool names to try if this tool fails
     * First tool is tried first, then second, etc.
     * Empty array means no fallback available
     */
    fallbackChain: string[];

    /**
     * Tools that should NOT be used together with this tool
     * If this tool is selected, conflicting tools are filtered out
     */
    conflictsWith: string[];

    /**
     * Latency characteristics for timeout management
     */
    latency: {
        /**
         * Expected execution time in milliseconds
         * Used for progress indicator timing
         */
        typical: number;

        /**
         * Maximum allowed execution time in milliseconds
         * Request is aborted if exceeded
         */
        timeout: number;

        /**
         * Delay before showing "still working" message
         * Shows spinner/progress after this many ms
         */
        userFeedbackDelay: number;

        /**
         * Latency tier for categorization
         * - "fast": <1 second (file operations)
         * - "medium": 1-10 seconds (search, queries)
         * - "slow": 10-60 seconds (research)
         * - "very_slow": >60 seconds (deep research)
         */
        tier: "fast" | "medium" | "slow" | "very_slow";
    };

    /**
     * Response characteristics for output handling
     */
    response: {
        /**
         * Expected output size in tokens
         * Used for context window management
         */
        typicalTokens: number;

        /**
         * Maximum allowed output tokens
         * Output is truncated if exceeded
         */
        maxTokens: number;

        /**
         * Whether output is structured JSON vs free text
         * Affects parsing and display logic
         */
        structured: boolean;

        /**
         * Whether output needs summarization before display
         * If true, LLM is called to summarize long outputs
         */
        requiresSummarization: boolean;
    };

    /**
     * User-facing messages in Hebrew
     */
    messages: {
        /**
         * Progress message shown during execution
         * Example: "מחפש במאגרי המידע הממשלתיים..."
         */
        progress: string;

        /**
         * Message shown when no results found
         * Example: "לא נמצאו תוצאות. נסה מילות מפתח אחרות."
         */
        noResults: string;

        /**
         * Suggestion for improving query
         * Example: "נסה לציין שם משרד או סוג מידע ספציפי"
         */
        suggestion: string;

        /**
         * Message shown on graceful failure
         * Example: "המאגרים הממשלתיים אינם זמינים כעת."
         */
        gracefulFailure: string;
    };

    /**
     * Intent detection signals for tool selection
     */
    intentSignals: {
        /**
         * Regular expression to match user intent
         * Matches against user query to determine relevance
         */
        keywords: RegExp;

        /**
         * Score boost when keywords match (0-100)
         * Added to base priority when intent detected
         */
        weight: number;

        /**
         * If true, ONLY this tool is used when intent matches
         * No other tools are included even if they also match
         */
        exclusive?: boolean;
    };
}
```

### 18.2 Example Tool Intelligence Entries

**DataGov Query Tool:**
```typescript
{
    name: "datagov_query",
    patterns: [/^datagov[_-]query$/i, /^package[_-]search$/i],
    mcpServer: "datagov",
    displayName: "Israel Government Data",
    priority: 95,
    fallbackChain: ["perplexity-search", "tavily-search"],
    conflictsWith: [],
    latency: {
        typical: 5000,
        timeout: 60000,
        userFeedbackDelay: 1000,
        tier: "medium",
    },
    response: {
        typicalTokens: 2000,
        maxTokens: 15000,
        structured: true,
        requiresSummarization: false,
    },
    messages: {
        progress: "מחפש במאגרי המידע הממשלתיים...",
        noResults: "לא נמצאו תוצאות במאגרים הממשלתיים. נסה מילות מפתח רשמיות (למשל: משרד הבריאות, רכבים).",
        suggestion: "נסה לציין שם משרד ממשלתי או סוג מידע ספציפי",
        gracefulFailure: "המאגרים הממשלתיים אינם זמינים כעת. הנה מידע ממקורות אחרים:",
    },
    intentSignals: {
        keywords: /מאגר רשמי|ממשלתי|data\.gov|משרד ה|לשכת הסטטיסטיקה|סטטיסטיקה לישראל/i,
        weight: 100,
        exclusive: true,
    },
}
```

**Perplexity Research Tool:**
```typescript
{
    name: "perplexity-research",
    patterns: [/^perplexity[_-]research$/i],
    mcpServer: "perplexity",
    displayName: "Perplexity Deep Research",
    priority: 100,
    fallbackChain: ["perplexity-ask", "tavily-search"],
    conflictsWith: ["google_search"],
    latency: {
        typical: 45000,
        timeout: 300000,  // 5 minutes for deep research
        userFeedbackDelay: 3000,
        tier: "very_slow",
    },
    response: {
        typicalTokens: 8000,
        maxTokens: 50000,
        structured: false,
        requiresSummarization: true,
    },
    messages: {
        progress: "מבצע מחקר מעמיק...",
        noResults: "לא נמצא מידע רלוונטי. נסה לנסח את השאלה אחרת.",
        suggestion: "נסה לפרט את השאלה או להוסיף הקשר",
        gracefulFailure: "שירות המחקר אינו זמין כעת. מבצע חיפוש מהיר במקום:",
    },
    intentSignals: {
        keywords: /מחקר|לחקור|ניתוח מעמיק|לעומק|מקיף|comprehensive|in-depth|research/i,
        weight: 100,
        exclusive: false,
    },
}
```

**Tavily Search Tool:**
```typescript
{
    name: "tavily-search",
    patterns: [/^tavily[_-]search$/i],
    mcpServer: "tavily",
    displayName: "Tavily Web Search",
    priority: 90,
    fallbackChain: ["perplexity-search", "fetch"],
    conflictsWith: [],
    latency: {
        typical: 3000,
        timeout: 60000,
        userFeedbackDelay: 1000,
        tier: "medium",
    },
    response: {
        typicalTokens: 1500,
        maxTokens: 10000,
        structured: true,
        requiresSummarization: false,
    },
    messages: {
        progress: "מחפש ברשת...",
        noResults: "לא נמצאו תוצאות. נסה מילות חיפוש אחרות.",
        suggestion: "נסה חיפוש באנגלית לתוצאות רחבות יותר",
        gracefulFailure: "שירות החיפוש אינו זמין כעת.",
    },
    intentSignals: {
        keywords: /חפש|מצא|search|find|what is|who is/i,
        weight: 80,
        exclusive: false,
    },
}
```

### 18.3 Smart Methods in ToolIntelligenceRegistry

| Method | Purpose | Returns |
|--------|---------|---------|
| `getToolIntelligence(name)` | Get full metadata for a tool | `ToolIntelligence \| undefined` |
| `getFallbackChain(name)` | Get ordered fallback list | `string[]` |
| `getLatencyTier(name)` | Get speed category | `"fast" \| "medium" \| "slow" \| "very_slow"` |
| `getTimeout(name)` | Get timeout in ms | `number` |
| `getProgressMessage(name)` | Get Hebrew progress text | `string` |
| `getGracefulFailureMessage(name)` | Get Hebrew error text | `string` |
| `scoreToolForQuery(name, query)` | Score tool relevance 0-200 | `number` |
| `rankToolsForQuery(query, tools)` | Sort tools by relevance | `Array<{tool, score, isExclusive}>` |
| `generateToolCapabilityManifest(tools)` | Generate capability text | `string` |
| `getToolUsageAttribution(name)` | Get attribution text | `string` |
| `generatePostExecutionSuggestions(tool, query)` | Get follow-up suggestions | `string` |
| `getComplementaryTools(tool)` | Get enhancing tools | `Array<{name, reason}>` |

---

## 19. Complete Parameter Normalization Reference

### 19.1 The Normalization Flow (Detailed)

**Location**: `frontend-huggingface/src/lib/server/textGeneration/mcp/toolParameterRegistry.ts`

```
┌─────────────────────────────────────────────────────────────┐
│ INPUT: Raw Tool Arguments from Model                         │
│ {                                                            │
│   "prompt": "electric vehicles",                             │
│   "n": "5"                                                   │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Copy All Original Args (Never Lose Data)            │
│ normalized = { ...args }                                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Apply Alias Mappings                                 │
│ "prompt" → "query" (alias match)                             │
│ "n" → "limit" (alias match)                                  │
│ Result: { query: "electric vehicles", limit: "5" }           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Type Coercion                                        │
│ limit: "5" → 5 (string to number)                            │
│ Result: { query: "electric vehicles", limit: 5 }             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Inject Defaults                                      │
│ search_depth: undefined → "advanced" (default)               │
│ Result: { query: "...", limit: 5, search_depth: "advanced" } │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT: Normalized Arguments + Warnings                      │
│ {                                                            │
│   normalized: { query: "electric vehicles", limit: 5, ... }, │
│   warnings: ["Mapped 'prompt' → 'query'"]                    │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
```

### 19.2 Complete Alias Mapping Reference

**Perplexity Tools:**
```typescript
{
    patterns: [/^perplexity[_-](ask|search|research|reason)$/i],
    parameters: [
        {
            name: "messages",
            type: "array",
            aliases: ["query", "question", "prompt", "input", "text", "q"],
            required: true,
            transform: "toMessages",  // Converts string to [{role: "user", content: string}]
            description: "User message(s) to send to Perplexity",
        },
        {
            name: "return_related_questions",
            type: "boolean",
            aliases: ["related_questions", "related"],
            default: false,
            transform: "toBoolean",
        },
    ],
}
```

**Tavily Search:**
```typescript
{
    patterns: [/^tavily[_-]search$/i],
    parameters: [
        {
            name: "query",
            type: "string",
            aliases: ["q", "search", "text", "prompt", "input", "question"],
            required: true,
            transform: "toString",
        },
        {
            name: "search_depth",
            type: "string",
            aliases: ["depth"],
            default: "advanced",
            enum: ["basic", "advanced"],
        },
        {
            name: "include_answer",
            type: "boolean",
            aliases: ["answer"],
            default: true,
            transform: "toBoolean",
        },
        {
            name: "max_results",
            type: "number",
            aliases: ["limit", "n", "count", "num_results"],
            default: 10,
            transform: "toNumber",
        },
        {
            name: "topic",
            type: "string",
            aliases: ["type", "category"],
            default: "general",
            enum: ["general", "news"],
        },
        {
            name: "days",
            type: "number",
            aliases: ["time_range", "days_back"],
            transform: "toNumber",
        },
    ],
}
```

**DataGov Query:**
```typescript
{
    patterns: [/^datagov[_-]query$/i, /^package[_-]search$/i, /^datastore[_-]search$/i],
    parameters: [
        {
            name: "query",
            type: "string",
            aliases: ["q", "search", "text", "prompt", "input"],
            required: true,
            transform: "toString",
        },
        {
            name: "limit",
            type: "number",
            aliases: ["max_results", "n", "count", "rows"],
            default: 20,
            transform: "toNumber",
        },
        {
            name: "resource_id",
            type: "string",
            aliases: ["resource", "dataset", "rid"],
            transform: "toString",
        },
        {
            name: "filters",
            type: "object",
            aliases: ["filter", "where", "conditions"],
            transform: "toObject",
        },
    ],
}
```

**Filesystem Tools:**
```typescript
{
    patterns: [/^(read|write|list|create)[_-](file|directory)$/i],
    parameters: [
        {
            name: "path",
            type: "string",
            aliases: ["file", "filepath", "file_path", "filename", "dir", "directory"],
            required: true,
            transform: "toString",
        },
        {
            name: "content",
            type: "string",
            aliases: ["data", "text", "body"],
            transform: "toString",
        },
        {
            name: "encoding",
            type: "string",
            aliases: ["enc"],
            default: "utf-8",
        },
    ],
}
```

**Git Tools:**
```typescript
{
    patterns: [/^git[_-]/i],
    parameters: [
        {
            name: "repo_path",
            type: "string",
            aliases: ["path", "repository", "repo", "dir", "directory"],
            default: ".",
            transform: "toString",
        },
        {
            name: "branch",
            type: "string",
            aliases: ["ref", "branch_name"],
        },
        {
            name: "message",
            type: "string",
            aliases: ["msg", "commit_message"],
        },
    ],
}
```

**Docker Tools:**
```typescript
{
    patterns: [/^docker[_-]/i],
    parameters: [
        {
            name: "container",
            type: "string",
            aliases: ["container_id", "container_name", "name", "id"],
            required: true,
            transform: "toString",
        },
        {
            name: "image",
            type: "string",
            aliases: ["image_name", "img"],
        },
        {
            name: "command",
            type: "string",
            aliases: ["cmd", "exec"],
        },
    ],
}
```

### 19.3 Type Transformation Functions

```typescript
/**
 * Available transform functions:
 */

// toString: Ensure value is a string
function toString(value: unknown): string {
    if (value === null || value === undefined) return "";
    return String(value);
}

// toNumber: Parse to number
function toNumber(value: unknown): number {
    if (typeof value === "number") return value;
    const parsed = Number(value);
    if (isNaN(parsed)) throw new Error(`Cannot convert "${value}" to number`);
    return parsed;
}

// toBoolean: Parse to boolean
function toBoolean(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1" || value === 1) return true;
    if (value === "false" || value === "0" || value === 0) return false;
    throw new Error(`Cannot convert "${value}" to boolean`);
}

// toArray: Wrap in array or parse JSON
function toArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
            return [value];
        }
    }
    return [value];
}

// toMessages: Convert to Perplexity message format
function toMessages(value: unknown): Array<{role: string, content: string}> {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
        return [{ role: "user", content: value }];
    }
    throw new Error(`Cannot convert "${value}" to messages format`);
}

// toObject: Parse JSON object
function toObject(value: unknown): Record<string, unknown> {
    if (typeof value === "object" && value !== null) return value as Record<string, unknown>;
    if (typeof value === "string") {
        try {
            return JSON.parse(value);
        } catch {
            throw new Error(`Cannot parse "${value}" as JSON object`);
        }
    }
    throw new Error(`Cannot convert "${value}" to object`);
}
```

---

## 20. All Error Categories & Graceful Handling

### 20.1 Error Category Reference

**Location**: `frontend-huggingface/src/lib/server/textGeneration/mcp/toolInvocation.ts`

| Error Type | Detection Pattern | Example Raw Error | Graceful Hebrew Message |
|------------|------------------|-------------------|------------------------|
| **Timeout** | `timeout`, `ETIMEDOUT`, `ESOCKETTIMEDOUT` | `Request timeout after 60000ms` | `⏱️ **הפעולה ארכה זמן רב מדי**\n\nהשירות עמוס או מבצע חיפוש מורכב.\n\n**מה לעשות:**\n• נסה שאלה קצרה ופשוטה יותר\n• המתן מספר שניות ונסה שוב` |
| **Connection** | `ECONNREFUSED`, `ECONNRESET`, `ENOTFOUND` | `connect ECONNREFUSED 127.0.0.1:8084` | `🔌 **שירות {toolName} אינו זמין כרגע**\n\nייתכן שיש תקלה זמנית בשרת.\n\n**מה לעשות:**\n• נסה שוב בעוד מספר שניות\n• אם הבעיה נמשכת, פנה למנהל המערכת` |
| **Not Found** | `404`, `not found`, `no results` | `Resource not found` | `🔍 **לא נמצא מידע**\n\nייתכן שהמידע המבוקש אינו קיים במאגר.\n\n**מה לעשות:**\n• נסה מילות מפתח שונות\n• ודא את האיות הנכון\n• נסה חיפוש כללי יותר` |
| **Validation** | `400`, `validation`, `invalid`, `missing` | `Missing required parameter: query` | `📝 **חסר מידע לביצוע הפעולה**\n\nהבקשה אינה מכילה את כל הפרטים הנדרשים.\n\n**מה לעשות:**\n• נסח את הבקשה בצורה מפורטת יותר\n• כלול את כל הפרטים הרלוונטיים` |
| **Rate Limit** | `429`, `rate limit`, `too many requests` | `Rate limit exceeded` | `⚡ **הגעת למגבלת בקשות**\n\nמספר הבקשות חרג מהמותר.\n\n**מה לעשות:**\n• המתן דקה אחת ונסה שוב\n• הפחת את תדירות הבקשות` |
| **Auth** | `401`, `403`, `unauthorized`, `forbidden` | `Invalid API key` | `🔐 **בעיית הרשאה**\n\nאין הרשאה לגשת לשירות זה.\n\n**מה לעשות:**\n• פנה למנהל המערכת לבדיקת ההרשאות\n• ודא שמפתח ה-API תקין` |
| **Server** | `500`, `502`, `503`, `504`, `internal` | `Internal server error` | `⚠️ **תקלה בשרת**\n\nאירעה שגיאה פנימית בשירות.\n\n**מה לעשות:**\n• נסה שוב בעוד מספר שניות\n• אם הבעיה נמשכת, פנה למנהל המערכת` |

### 20.2 Tool-Specific Error Context

```typescript
function toGracefulError(toolName: string, errorMessage: string): string {
    const errorType = categorizeError(errorMessage);
    const ti = getToolIntelligence(toolName);

    // Tool-specific context
    if (toolName.includes("datagov")) {
        if (errorType === "timeout") {
            return `⏱️ **הגישה למאגרי המידע הממשלתיים ארכה זמן רב**\n\n` +
                `המאגרים הממשלתיים מכילים מיליוני רשומות ולפעמים דורשים זמן עיבוד.\n\n` +
                `**מה לעשות:**\n` +
                `• נסה שאילתה ספציפית יותר (למשל: "בתי חולים בתל אביב" במקום "בתי חולים")\n` +
                `• ציין שם משרד ממשלתי ספציפי\n` +
                `• הוסף מגבלת תוצאות (למשל: "10 הראשונים")`;
        }
        if (errorType === "not_found") {
            return `🔍 **לא נמצא מידע במאגרי המידע הממשלתיים**\n\n` +
                `המידע המבוקש אינו קיים במאגרים הממשלתיים הפתוחים.\n\n` +
                `**מה לעשות:**\n` +
                `• נסה מילות מפתח רשמיות (למשל: "רישוי רכב" במקום "רישיון נהיגה")\n` +
                `• בדוק את האיות בעברית\n` +
                `• נסה לחפש בשם המשרד הממשלתי הרלוונטי`;
        }
    }

    if (toolName.includes("perplexity")) {
        if (errorType === "timeout") {
            return `⏱️ **המחקר לקח יותר מדי זמן**\n\n` +
                `שירות Perplexity מבצע חיפוש מעמיק שלפעמים דורש זמן רב.\n\n` +
                `**מה לעשות:**\n` +
                `• נסה שאלה קצרה וממוקדת יותר\n` +
                `• לחיפוש מהיר, נסה את Tavily Search\n` +
                `• המתן מספר שניות ונסה שוב`;
        }
    }

    if (toolName.includes("tavily")) {
        if (errorType === "not_found") {
            return `🔍 **לא נמצאו תוצאות בחיפוש**\n\n` +
                `**מה לעשות:**\n` +
                `• נסה מילות חיפוש באנגלית לתוצאות רחבות יותר\n` +
                `• הסר מרכאות או תווים מיוחדים\n` +
                `• נסה מונחים נרדפים`;
        }
    }

    // Generic fallback
    return ti?.messages.gracefulFailure || getGenericError(errorType);
}
```

### 20.3 Error Categorization Function

```typescript
function categorizeError(message: string): ErrorCategory {
    const msg = message.toLowerCase();

    if (msg.includes("timeout") || msg.includes("etimedout") || msg.includes("esockettimedout")) {
        return "timeout";
    }
    if (msg.includes("econnrefused") || msg.includes("econnreset") || msg.includes("enotfound")) {
        return "connection";
    }
    if (msg.includes("404") || msg.includes("not found") || msg.includes("no results")) {
        return "not_found";
    }
    if (msg.includes("400") || msg.includes("validation") || msg.includes("invalid") || msg.includes("missing")) {
        return "validation";
    }
    if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many")) {
        return "rate_limit";
    }
    if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden")) {
        return "auth";
    }
    if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("internal")) {
        return "server";
    }

    return "unknown";
}

type ErrorCategory = "timeout" | "connection" | "not_found" | "validation" | "rate_limit" | "auth" | "server" | "unknown";
```

### 20.4 Non-Recoverable Errors (Skip Fallback)

Some errors should NOT trigger fallback because they indicate configuration issues:

```typescript
function isRecoverableError(message: string): boolean {
    const nonRecoverable = [
        "unauthorized",
        "forbidden",
        "invalid api key",
        "authentication failed",
        "not authorized",
        "access denied",
        "api key expired",
        "api key invalid",
    ];

    const msg = message.toLowerCase();
    return !nonRecoverable.some(pattern => msg.includes(pattern));
}
```

---

## 21. DataGov Enterprise Intelligence (All 20 Methods)

This section documents ALL 20 enterprise methods implemented in the DataGov MCP server. **When implementing a new MCP server, use these patterns as templates.**

**Files:**
- `datagov/server.py` - FastMCP server (~450 lines)
- `datagov/query_builder.py` - Query decomposition & scoring (~800 lines)
- `datagov/enterprise_expansions.py` - 22 domains, 3,972 terms

### 21.1 Browser Impersonation (Anti-403)

**Problem:** data.gov.il blocks non-browser requests with 403 errors.

**Solution:** Use `curl_cffi` with Chrome 120 fingerprint:

```python
from curl_cffi import requests as curl_requests

# Create session with browser impersonation
session = curl_requests.Session(impersonate="chrome120")
session.headers.update({
    "Referer": "https://data.gov.il/",
    "Accept": "application/json",
    "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 datagov-external-client",
})

def _http(method: str, endpoint: str, params: dict = None) -> requests.Response:
    """Make HTTP request with browser impersonation."""
    url = f"https://data.gov.il/api/3{endpoint}"
    response = session.request(method, url, params=params)
    return response
```

**When to use:** Any API that blocks automated requests (Cloudflare, rate limiters).

### 21.2 Query Decomposition

**Problem:** User queries mix WHAT they want with WHERE they want it.

**Solution:** `_decompose_query()` separates subject from location:

```python
def _decompose_query(query: str) -> dict:
    """
    Decompose query into subject (WHAT) and location (WHERE).

    Example:
    "בתי חולים בירושלים" →
    {
        "original": "בתי חולים בירושלים",
        "subject_tokens": ["בתי", "חולים"],
        "location_tokens": ["ירושלים"],
        "expanded_subjects": ["hospital", "בית חולים", "רפואה", "medical", ...],
        "location_variants": ["ירושלים", "Jerusalem", "JERUSALEM", "3"],
    }
    """
    tokens = query.split()
    subject_tokens = []
    location_tokens = []

    for token in tokens:
        stripped = _strip_hebrew_prefix(token)
        if stripped.lower() in KNOWN_LOCATIONS:
            location_tokens.append(stripped)
        else:
            subject_tokens.append(token)

    # Expand subjects using bidirectional index
    expanded_subjects = set()
    for token in subject_tokens:
        expansions = get_bidirectional_expansions(token)
        expanded_subjects.update(expansions)

    return {
        "original": query,
        "subject_tokens": subject_tokens,
        "location_tokens": location_tokens,
        "expanded_subjects": list(expanded_subjects),
        "location_variants": get_location_variants(location_tokens),
    }
```

### 21.3 Hebrew Morphological Normalization

**Problem:** Hebrew has prefixes (ב, ל, מ, ה) and plural suffixes (ים, ות) that prevent matching.

**Solution:** `get_hebrew_variants()` generates all morphological forms:

```python
# Hebrew morphology constants
HEBREW_PREFIXES = ['ל', 'ב', 'מ', 'ה', 'ו', 'ש', 'כ']  # Common prefixes
HEBREW_PLURAL_SUFFIXES = ['ים', 'ות']                    # Plural endings

def get_hebrew_variants(word: str) -> List[str]:
    """
    Generate all morphological variants of a Hebrew word.

    Examples:
    "לרכבים" → ["לרכבים", "רכבים", "רכב"]
    "בירושלים" → ["בירושלים", "ירושלים"]
    "בתי" → ["בתי", "בית"]
    """
    variants = [word]
    current = word

    # Strip prefixes one by one
    for prefix in HEBREW_PREFIXES:
        if current.startswith(prefix) and len(current) > len(prefix) + 1:
            stripped = current[len(prefix):]
            variants.append(stripped)
            current = stripped

    # Strip plural suffixes
    for suffix in HEBREW_PLURAL_SUFFIXES:
        if current.endswith(suffix) and len(current) > len(suffix) + 1:
            singular = current[:-len(suffix)]
            variants.append(singular)
            # Also add common singular endings
            if current.endswith('ים'):
                variants.append(singular)  # רכבים → רכב
            if current.endswith('ות'):
                variants.append(singular + 'ה')  # מכוניות → מכונית → מכונה

    return list(set(variants))

def _strip_hebrew_prefix(word: str) -> str:
    """Strip common Hebrew prefixes intelligently."""
    for prefix in HEBREW_PREFIXES:
        if word.startswith(prefix) and len(word) > 2:
            stripped = word[len(prefix):]
            # Only strip if result is a known word/location
            if stripped.lower() in KNOWN_WORDS or stripped in KNOWN_LOCATIONS:
                return stripped
    return word
```

### 21.4 Bidirectional Expansion Index

**Problem:** One-way expansion (crime → פשיעה) doesn't work in reverse (פשיעה → crime).

**Solution:** `_build_bidirectional_index()` maps ALL synonyms both ways:

```python
def _build_bidirectional_index(expansions: Dict[str, List[str]]) -> Dict[str, Set[str]]:
    """
    Build bidirectional mapping from unidirectional expansions.

    Input:
    {"crime": ["פשיעה", "עבריינות", "פלילי"]}

    Output:
    {
        "crime": {"crime", "פשיעה", "עבריינות", "פלילי"},
        "פשיעה": {"crime", "פשיעה", "עבריינות", "פלילי"},
        "עבריינות": {"crime", "פשיעה", "עבריינות", "פלילי"},
        "פלילי": {"crime", "פשיעה", "עבריינות", "פלילי"},
    }
    """
    bidirectional = {}

    for key, values in expansions.items():
        # Create a set with the key and all its values
        all_terms = {key.lower()} | {v.lower() for v in values}

        # Map each term to the full set
        for term in all_terms:
            if term in bidirectional:
                bidirectional[term].update(all_terms)
            else:
                bidirectional[term] = all_terms.copy()

    return bidirectional

# Pre-built at startup
BIDIRECTIONAL_INDEX = _build_bidirectional_index(SUBJECT_EXPANSIONS)

def get_bidirectional_expansions(term: str) -> Set[str]:
    """Get all related terms for a given term."""
    return BIDIRECTIONAL_INDEX.get(term.lower(), {term})
```

### 21.5 Count Query Detection & Auto-Aggregation

**Problem:** User asks "כמה רכבים בישראל?" but only gets 20 rows, not a total count.

**Solution:** `_is_count_query()` + `_calculate_aggregates()`:

```python
# Count query detection patterns
COUNT_PATTERNS = [
    r'\bכמה\b',        # "how many" in Hebrew
    r'\bסה"כ\b',       # "total" in Hebrew
    r'\bסכום\b',       # "sum" in Hebrew
    r'\btotal\b',      # English
    r'\bcount\b',      # English
    r'\bhow many\b',   # English
    r'\bsum of\b',     # English
]

def _is_count_query(query: str) -> bool:
    """Detect if user is asking for a count/total."""
    query_lower = query.lower()
    return any(re.search(pattern, query_lower) for pattern in COUNT_PATTERNS)

def _calculate_aggregates(records: List[dict], fields: List[str]) -> dict:
    """
    Calculate SUM and COUNT for numeric fields.

    Returns:
    {
        "כמות_רכבים": {"sum": 4500000, "count": 4500000, "min": 1, "max": 500000},
        "total_records": 150
    }
    """
    aggregates = {}

    for field in fields:
        values = []
        for record in records:
            val = record.get(field)
            if val is not None:
                try:
                    values.append(float(val))
                except (ValueError, TypeError):
                    continue

        if values:
            aggregates[field] = {
                "sum": sum(values),
                "count": len(values),
                "min": min(values),
                "max": max(values),
                "avg": sum(values) / len(values),
            }

    aggregates["total_records"] = len(records)
    return aggregates

# Usage in query execution:
if _is_count_query(query):
    # Increase limit to get more records for accurate totals
    params["limit"] = min(limit * 5, 100)

    # Calculate aggregates
    aggregates = _calculate_aggregates(records, numeric_fields)

    # Include in response
    response["summary_totals"] = aggregates
    response["metadata"]["aggregation_note"] = (
        "Use these totals directly to answer 'how many' questions"
    )
```

### 21.6 Enterprise Schema System

**Problem:** API calls to get field names are slow (500ms each). Monolithic JSON files are hard to maintain.

**Solution:** Per-dataset schema files organized by category:

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
│   ├── רכבים_חשמליים.json
│   └── ...
├── finance/              # Budget, tax, economic data
├── education/            # Schools, universities
├── environment/          # Pollution, climate
├── government/           # Ministries, agencies
├── agriculture/          # Farms, crops
├── communications/       # Telecom, internet
├── culture/              # Museums, heritage
├── demographics/         # Population, census
├── geography/            # Maps, regions
├── housing/              # Real estate, construction
├── immigration/          # Aliyah, visas
├── insurance/            # Health, life, car
├── justice/              # Courts, crime
├── labor/                # Employment, wages
├── municipal/            # Local authorities
├── religion/             # Religious affairs
├── technology/           # Startups, R&D
├── tourism/              # Hotels, visitors
├── water/                # Resources, quality
└── welfare/              # Social services
```

**Individual Schema Structure:**

```json
{
  "dataset_id": "62c54ef6-49f1-4b5f-bd1e-1e88a5955acd",
  "title": "serologiclabs",
  "organization": "משרד הבריאות",
  "categories": ["health"],
  "tags": ["laboratory", "blood", "test", "medical"],
  "keywords": ["phone", "hospital", "city", "משרד", "הבריאות", "בדיקה", "מעבדה"],
  "resources": [
    {
      "resource_id": "b3c89abc-8e86-4abd-a4f3-a33ebee9fc07",
      "title": "מעבדות המבצעות בדיקות סרולוגיות",
      "format": "XLSX",
      "last_modified": "2024-03-15T10:30:00Z",
      "total_records": 32,
      "fields": [
        {"name": "city", "type": "text", "semantic": "city", "hebrew_name": "עיר"},
        {"name": "phone", "type": "text", "semantic": "phone", "hebrew_name": "טלפון"},
        {"name": "hospital", "type": "text", "semantic": null, "hebrew_name": "בית חולים"},
        {"name": "address", "type": "text", "semantic": "address", "hebrew_name": "כתובת"}
      ]
    }
  ],
  "field_availability": {
    "has_phone": true,
    "has_address": true,
    "has_email": false,
    "has_city": true,
    "has_date": false,
    "has_coordinates": false
  }
}
```

**Loading schemas at startup:**

```python
import os
import json

SCHEMAS_DIR = os.path.join(os.path.dirname(__file__), "schemas")
SCHEMA_INDEX = {}
FIELD_INDEX = {}

def _load_schemas():
    """Load all schemas at startup for fast lookup."""
    global SCHEMA_INDEX, FIELD_INDEX

    # Load master index
    index_path = os.path.join(SCHEMAS_DIR, "_index.json")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            SCHEMA_INDEX = json.load(f)

    # Load field index
    field_index_path = os.path.join(SCHEMAS_DIR, "_field_index.json")
    if os.path.exists(field_index_path):
        with open(field_index_path, "r", encoding="utf-8") as f:
            FIELD_INDEX = json.load(f)

    print(f"Loaded {len(SCHEMA_INDEX)} resources from schema index")

# Call at module load
_load_schemas()
```

### 21.7 Semantic Field Mapping

**Problem:** User asks for "phone numbers" but field is named "טלפון_מוסד".

**Solution:** `get_semantic_field_name()` maps intents to actual fields:

```python
# Semantic field type mappings
SEMANTIC_FIELD_PATTERNS = {
    "phone": [
        r"phone", r"טלפון", r"tel", r"telephone", r"mobile", r"נייד", r"פקס", r"fax"
    ],
    "email": [
        r"email", r"mail", r"דוא\"?ל", r"אימייל", r"מייל"
    ],
    "address": [
        r"address", r"כתובת", r"רחוב", r"street", r"location", r"מיקום"
    ],
    "city": [
        r"city", r"עיר", r"יישוב", r"settlement", r"town", r"מקום"
    ],
    "date": [
        r"date", r"תאריך", r"year", r"שנה", r"month", r"חודש", r"time", r"זמן"
    ],
    "coordinates": [
        r"lat", r"lon", r"latitude", r"longitude", r"קואורדינ", r"x", r"y"
    ],
}

def get_semantic_field_name(resource_id: str, semantic_type: str) -> str | None:
    """
    Get the actual field name for a semantic type in a specific resource.

    Example:
    get_semantic_field_name("abc-123", "phone") → "טלפון_מוסד"
    get_semantic_field_name("abc-123", "address") → "כתובת_מלאה"
    """
    schema = get_resource_schema(resource_id)
    if not schema:
        return None

    for field in schema.get("fields", []):
        if field.get("semantic") == semantic_type:
            return field["name"]

    return None

def infer_semantic_type(field_name: str) -> str | None:
    """Infer semantic type from field name."""
    field_lower = field_name.lower()

    for semantic_type, patterns in SEMANTIC_FIELD_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, field_lower, re.IGNORECASE):
                return semantic_type

    return None
```

### 21.8 Field Intent Extraction

**Problem:** User asks "courts with addresses and phone numbers" - need to select only those fields.

**Solution:** `extract_field_intents()` parses English/Hebrew intent:

```python
# Field intent patterns (Hebrew + English)
FIELD_INTENT_PATTERNS = {
    "phone": [
        r"phone", r"טלפון", r"telephone", r"מספר\s*טלפון", r"טל'", r"נייד"
    ],
    "address": [
        r"address", r"כתובת", r"location", r"מיקום", r"רחוב", r"where"
    ],
    "email": [
        r"email", r"mail", r"דוא\"?ל", r"אימייל", r"מייל"
    ],
    "hours": [
        r"hours", r"שעות", r"פתיחה", r"opening", r"סגירה", r"closing"
    ],
    "website": [
        r"website", r"אתר", r"url", r"link", r"קישור"
    ],
}

def extract_field_intents(query: str) -> List[str]:
    """
    Extract field intents from user query.

    Example:
    "hospitals with phone numbers and addresses" → ["phone", "address"]
    "בתי חולים עם טלפון וכתובת" → ["phone", "address"]
    """
    intents = []
    query_lower = query.lower()

    for intent_type, patterns in FIELD_INTENT_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, query_lower, re.IGNORECASE):
                intents.append(intent_type)
                break  # Don't add same intent twice

    return intents

def match_fields_to_schema(intents: List[str], schema: dict) -> dict:
    """
    Match user field intents to actual schema fields.

    Returns:
    {
        "matched_fields": ["טלפון_מוסד", "כתובת_מלאה"],
        "missing_intents": ["email"]
    }
    """
    matched = []
    missing = []

    for intent in intents:
        field_name = None
        for field in schema.get("fields", []):
            if field.get("semantic") == intent:
                field_name = field["name"]
                break

        if field_name:
            matched.append(field_name)
        else:
            missing.append(intent)

    return {
        "matched_fields": matched,
        "missing_intents": missing,
    }
```

### 21.9 Field Availability Filtering

**Problem:** 5 datasets match "hospitals" but only 2 have phone numbers.

**Solution:** `filter_by_field_availability()` pre-filters candidates:

```python
def filter_by_field_availability(
    candidates: List[dict],
    required_intents: List[str]
) -> List[dict]:
    """
    Filter candidates to only those with required field types.

    Example:
    # Before: 5 hospital datasets
    candidates = filter_by_field_availability(candidates, ["phone", "address"])
    # After: 2 datasets (only those with both phone AND address)
    """
    if not required_intents:
        return candidates

    filtered = []
    for candidate in candidates:
        resource_id = candidate.get("resource_id")
        field_info = FIELD_INDEX.get(resource_id, {})

        # Check all required intents are available
        all_available = True
        for intent in required_intents:
            flag_name = f"has_{intent}"
            if not field_info.get(flag_name, False):
                all_available = False
                break

        if all_available:
            filtered.append(candidate)

    return filtered
```

**Fast lookup via `_field_index.json`:**

```json
{
  "b3c89abc-8e86-4abd-a4f3-a33ebee9fc07": {
    "has_phone": true,
    "has_address": true,
    "has_email": false,
    "has_city": true,
    "has_date": false,
    "has_coordinates": false
  },
  "c4d90def-1234-5678-abcd-9876543210ab": {
    "has_phone": false,
    "has_address": true,
    "has_email": true,
    "has_city": true,
    "has_date": true,
    "has_coordinates": true
  }
}
```

### 21.10 Enterprise Fallback: Query Rephrasing

**Problem:** Initial query returns no/low-confidence matches.

**Solution:** `rephrase_query()` tries alternative phrasings:

```python
def rephrase_query(query: str, original_score: float) -> List[dict]:
    """
    Generate rephrased versions of query for retry.

    Strategies:
    1. Morphological normalization (strip prefixes/suffixes)
    2. Core subjects only (remove modifiers)
    3. English equivalent (translate key terms)
    4. Singular form (remove plurals)
    5. Expanded form (add related terms)

    Returns list of {query, strategy, expected_improvement}
    """
    rephrasings = []

    # Strategy 1: Morphological normalization
    tokens = query.split()
    normalized_tokens = [get_hebrew_variants(t)[0] for t in tokens]
    normalized = " ".join(normalized_tokens)
    if normalized != query:
        rephrasings.append({
            "query": normalized,
            "strategy": "morphological_normalization",
            "expected_improvement": 0.1,
        })

    # Strategy 2: Core subjects only
    decomposed = _decompose_query(query)
    if decomposed["subject_tokens"]:
        core = " ".join(decomposed["subject_tokens"])
        rephrasings.append({
            "query": core,
            "strategy": "core_subjects_only",
            "expected_improvement": 0.15,
        })

    # Strategy 3: English equivalent
    english_terms = []
    for token in tokens:
        expansions = get_bidirectional_expansions(token)
        english = [e for e in expansions if is_english(e)]
        if english:
            english_terms.append(english[0])
    if english_terms:
        rephrasings.append({
            "query": " ".join(english_terms),
            "strategy": "english_equivalent",
            "expected_improvement": 0.2,
        })

    # Strategy 4: Singular form
    singular_tokens = []
    for token in tokens:
        variants = get_hebrew_variants(token)
        # Prefer shortest variant (likely singular)
        singular = min(variants, key=len)
        singular_tokens.append(singular)
    singular = " ".join(singular_tokens)
    if singular != query:
        rephrasings.append({
            "query": singular,
            "strategy": "singular_form",
            "expected_improvement": 0.05,
        })

    return rephrasings

# Usage:
results = search(query)
if results["confidence"] < 0.3:
    for rephrasing in rephrase_query(query, results["confidence"]):
        retry_results = search(rephrasing["query"])
        if retry_results["confidence"] > results["confidence"]:
            results = retry_results
            results["rephrasing_used"] = rephrasing["strategy"]
            break
```

### 21.11 Subject-First Scoring Algorithm

**Problem:** Location matches dominate results (everything in "ירושלים" matches).

**Solution:** Subject-first scoring with minimum threshold:

```python
def _score_resource(
    query_decomposed: dict,
    dataset: dict,
    resource: dict
) -> float:
    """
    Score a resource based on query match.

    Scoring weights:
    - Subject match in title: 40%
    - Subject match in name/tags: 30%
    - Hebrew expansion match: 20%
    - Location match: 10% (BONUS ONLY)
    - Format preference: 0-30% bonus

    CRITICAL: If subject_tokens exist but subject_score < 0.15,
    return 0 (don't return irrelevant location-only matches).
    """
    score = 0.0
    subject_score = 0.0

    ds_title = dataset.get("title", "").lower()
    res_title = resource.get("title", "").lower()
    tags = [t.lower() for t in dataset.get("tags", [])]

    # Subject matching (primary scoring)
    for token in query_decomposed["subject_tokens"]:
        token_lower = token.lower()
        variants = get_hebrew_variants(token)

        # Title match (highest weight)
        if any(v in ds_title for v in variants):
            subject_score += 0.40

        # Resource name match
        if any(v in res_title for v in variants):
            subject_score += 0.30

        # Tag match
        if any(v in tag for v in variants for tag in tags):
            subject_score += 0.20

    # Expansion match
    for expanded_term in query_decomposed["expanded_subjects"]:
        if expanded_term in ds_title or expanded_term in res_title:
            subject_score += 0.10

    # CRITICAL: Minimum subject score threshold
    if query_decomposed["subject_tokens"] and subject_score < 0.15:
        return 0.0  # Don't return irrelevant results

    score = subject_score

    # Location bonus (NOT primary score)
    for location in query_decomposed["location_variants"]:
        if location.lower() in ds_title or location.lower() in res_title:
            score += 0.10  # Small bonus only

    # Format bonus
    fmt = resource.get("format", "").upper()
    format_bonus = FORMAT_SCORES.get(fmt, 0.0)
    score += format_bonus

    return min(1.0, score)

# Format preference scores
FORMAT_SCORES = {
    "CSV": 0.15,   # Best - queryable, clean structure
    "XLSX": 0.12,  # Good - queryable
    "JSON": 0.10,  # Good - structured
    "API": 0.08,   # Good - direct access
    "XML": 0.05,   # OK - structured but verbose
    "PDF": 0.02,   # Poor - not queryable
    "DOC": 0.01,   # Poor - not queryable
    "DOCX": 0.01,  # Poor - not queryable
}
```

### 21.12 Location Filter Values

**Problem:** User says "Jerusalem" but data has "ירושלים", "JERUSALEM", or "3" (city code).

**Solution:** `LOCATION_FILTER_VALUES` maps all variants:

```python
LOCATION_FILTER_VALUES = {
    # Major cities with all known variants
    "jerusalem": ["ירושלים", "Jerusalem", "JERUSALEM", "3", "ירושלים-יפו"],
    "tel aviv": ["תל אביב", "Tel Aviv", "TEL AVIV", "5", "תל-אביב", "תל אביב-יפו", "תל אביב יפו"],
    "haifa": ["חיפה", "Haifa", "HAIFA", "4"],
    "beer sheva": ["באר שבע", "Beer Sheva", "BEER SHEVA", "9", "באר-שבע", "B'eer Sheva"],
    "rishon": ["ראשון לציון", "Rishon LeZion", "RISHON LEZION", "ראשל\"צ"],
    "petah tikva": ["פתח תקווה", "Petah Tikva", "PETAH TIKVA", "פ\"ת", "פתח-תקווה"],
    "ashdod": ["אשדוד", "Ashdod", "ASHDOD"],
    "netanya": ["נתניה", "Netanya", "NETANYA"],
    "holon": ["חולון", "Holon", "HOLON"],
    "bnei brak": ["בני ברק", "Bnei Brak", "BNEI BRAK", "בני-ברק"],
    "ramat gan": ["רמת גן", "Ramat Gan", "RAMAT GAN", "רמת-גן"],
    "bat yam": ["בת ים", "Bat Yam", "BAT YAM", "בת-ים"],
    "ashkelon": ["אשקלון", "Ashkelon", "ASHKELON"],
    "herzliya": ["הרצליה", "Herzliya", "HERZLIYA"],
    "kfar saba": ["כפר סבא", "Kfar Saba", "KFAR SABA", "כפר-סבא"],
    "hadera": ["חדרה", "Hadera", "HADERA"],
    "modiin": ["מודיעין", "Modi'in", "MODIIN", "מודיעין-מכבים-רעות"],
    "nazareth": ["נצרת", "Nazareth", "NAZARETH"],
    "lod": ["לוד", "Lod", "LOD"],
    "ramla": ["רמלה", "Ramla", "RAMLA"],
    "rehovot": ["רחובות", "Rehovot", "REHOVOT"],
    "raanana": ["רעננה", "Ra'anana", "RAANANA"],
    "eilat": ["אילת", "Eilat", "EILAT"],
    "tiberias": ["טבריה", "Tiberias", "TIBERIAS"],
    "acre": ["עכו", "Acre", "ACRE", "Akko"],
    "nahariya": ["נהריה", "Nahariya", "NAHARIYA"],
    "carmiel": ["כרמיאל", "Carmiel", "CARMIEL", "Karmiel"],
}

def get_location_variants(locations: List[str]) -> List[str]:
    """Get all variants for given locations."""
    variants = []
    for loc in locations:
        loc_lower = loc.lower()
        # Direct lookup
        if loc_lower in LOCATION_FILTER_VALUES:
            variants.extend(LOCATION_FILTER_VALUES[loc_lower])
        else:
            # Reverse lookup (Hebrew → English)
            for key, values in LOCATION_FILTER_VALUES.items():
                if any(v.lower() == loc_lower for v in values):
                    variants.extend(values)
                    break
        variants.append(loc)  # Include original
    return list(set(variants))
```

### 21.13 Hebrew Prefix Stripping for Locations

**Problem:** User types "בירושלים" (in Jerusalem) but data has "ירושלים".

**Solution:** Smart prefix stripping that only strips if result is a known location:

```python
def _strip_hebrew_prefix_for_location(word: str) -> str:
    """
    Strip Hebrew prefix only if result is a known location.

    "בירושלים" → "ירושלים" (in Jerusalem → Jerusalem)
    "לתל אביב" → "תל אביב" (to Tel Aviv → Tel Aviv)
    "מחיפה" → "חיפה" (from Haifa → Haifa)
    "בית" → "בית" (NOT stripped - "בית" is not a location)
    """
    for prefix in HEBREW_PREFIXES:
        if word.startswith(prefix) and len(word) > len(prefix) + 1:
            stripped = word[len(prefix):]
            # Only strip if result is a known location
            if _is_known_location(stripped):
                return stripped
    return word

def _is_known_location(word: str) -> bool:
    """Check if word is a known location."""
    word_lower = word.lower()

    # Check as key
    if word_lower in LOCATION_FILTER_VALUES:
        return True

    # Check as value
    for values in LOCATION_FILTER_VALUES.values():
        if any(v.lower() == word_lower for v in values):
            return True

    return False
```

### 21.14 Format Preference Scoring

**Problem:** PDF datasets can't be queried; CSV is best for data extraction.

**Solution:** Format bonus in scoring algorithm:

```python
# Format scores - higher is better for data extraction
FORMAT_SCORES = {
    # Queryable formats (best)
    "CSV": 0.15,    # Clean, structured, universal support
    "XLSX": 0.12,   # Queryable, widely used
    "XLS": 0.10,    # Legacy Excel, still queryable

    # Structured formats (good)
    "JSON": 0.10,   # Structured, API-friendly
    "API": 0.08,    # Direct access, real-time
    "XML": 0.05,    # Structured but verbose

    # Document formats (poor for data)
    "PDF": 0.02,    # Not queryable, requires OCR
    "DOC": 0.01,    # Word document, not structured
    "DOCX": 0.01,   # Modern Word, still not structured
    "TXT": 0.01,    # Plain text, no structure

    # Other
    "ZIP": 0.00,    # Archive, unknown contents
    "HTML": 0.03,   # Web page, may have tables
    "GeoJSON": 0.08, # Geographic data
    "SHP": 0.06,    # Shapefile, geographic
}

def get_format_score(format_str: str) -> float:
    """Get format preference score."""
    return FORMAT_SCORES.get(format_str.upper(), 0.0)

# Usage in resource scoring:
score += get_format_score(resource.get("format", ""))
```

### 21.15 Comprehensive Keyword Index

**Problem:** SUBJECT_EXPANSIONS only covers known terms; new datasets have new keywords.

**Solution:** `_load_keyword_index()` indexes ALL keywords from ALL datasets:

```python
# Global keyword → resource mapping
KEYWORD_TO_RESOURCES: Dict[str, List[str]] = {}

def _load_keyword_index():
    """
    Load keyword index from all schema files.
    Maps each keyword to list of resource IDs that contain it.
    """
    global KEYWORD_TO_RESOURCES

    for category_dir in os.listdir(SCHEMAS_DIR):
        if category_dir.startswith("_"):
            continue  # Skip index files

        category_path = os.path.join(SCHEMAS_DIR, category_dir)
        if not os.path.isdir(category_path):
            continue

        for schema_file in os.listdir(category_path):
            if not schema_file.endswith(".json"):
                continue

            with open(os.path.join(category_path, schema_file), "r", encoding="utf-8") as f:
                schema = json.load(f)

            # Index all keywords
            for keyword in schema.get("keywords", []):
                kw_lower = keyword.lower()
                if kw_lower not in KEYWORD_TO_RESOURCES:
                    KEYWORD_TO_RESOURCES[kw_lower] = []

                for resource in schema.get("resources", []):
                    rid = resource.get("resource_id")
                    if rid and rid not in KEYWORD_TO_RESOURCES[kw_lower]:
                        KEYWORD_TO_RESOURCES[kw_lower].append(rid)

    print(f"Indexed {len(KEYWORD_TO_RESOURCES)} keywords")

# Call at startup
_load_keyword_index()

def get_keyword_boost(query: str, resource_id: str) -> float:
    """
    Get score boost based on keyword matches.

    Returns 0.0 to 0.25 based on how many query tokens
    match indexed keywords for this resource.
    """
    tokens = query.lower().split()
    matches = 0

    for token in tokens:
        if resource_id in KEYWORD_TO_RESOURCES.get(token, []):
            matches += 1

    # Cap at 0.25 (3+ matches = max boost)
    return min(0.25, matches * 0.08)
```

### 21.16 Category Suggestion for Vague Queries

**Problem:** User query too vague to match anything meaningfully.

**Solution:** `get_category_suggestion()` provides guidance:

```python
# Category descriptions for suggestions
CATEGORY_DESCRIPTIONS = {
    "health": {
        "hebrew": "בריאות",
        "examples": ["בתי חולים", "מרפאות", "רופאים", "תרופות"],
        "english_examples": ["hospitals", "clinics", "medical"],
    },
    "education": {
        "hebrew": "חינוך",
        "examples": ["בתי ספר", "אוניברסיטאות", "תלמידים"],
        "english_examples": ["schools", "universities", "students"],
    },
    "transportation": {
        "hebrew": "תחבורה",
        "examples": ["רכבים", "כבישים", "תאונות", "רכבת"],
        "english_examples": ["vehicles", "roads", "traffic"],
    },
    "finance": {
        "hebrew": "כספים",
        "examples": ["תקציב", "מסים", "הוצאות ממשלה"],
        "english_examples": ["budget", "taxes", "spending"],
    },
    "environment": {
        "hebrew": "סביבה",
        "examples": ["זיהום", "מים", "אקלים"],
        "english_examples": ["pollution", "water", "climate"],
    },
    # ... more categories
}

def get_category_suggestion(query: str, confidence: float) -> str | None:
    """
    Generate category suggestion for vague queries.

    Returns suggestion string if confidence is too low.
    """
    if confidence >= 0.3:
        return None  # Query is specific enough

    suggestion = (
        f"**השאילתה '{query}' כללית מדי.**\n\n"
        f"נסה לציין תחום ספציפי:\n\n"
    )

    for category, info in CATEGORY_DESCRIPTIONS.items():
        examples = ", ".join(info["examples"][:3])
        suggestion += f"• **{info['hebrew']}** ({category}): {examples}\n"

    suggestion += (
        f"\n**דוגמה:** במקום 'נתונים' נסה 'נתוני רכבים במשרד התחבורה'"
    )

    return suggestion
```

### 21.17 Resource Scoring Algorithm (Complete)

**Problem:** Multiple datasets match - which is best?

**Solution:** Multi-factor `_score_resource()` with all weights:

```python
def _score_resource_complete(
    query: str,
    query_decomposed: dict,
    dataset: dict,
    resource: dict
) -> dict:
    """
    Complete scoring algorithm with all factors.

    Returns detailed scoring breakdown:
    {
        "total_score": 0.75,
        "breakdown": {
            "title_match": 0.40,
            "tag_match": 0.15,
            "expansion_match": 0.10,
            "location_bonus": 0.05,
            "format_bonus": 0.05,
            "keyword_bonus": 0.00,
        },
        "confidence": "high",
        "reasons": ["Title contains search term", "CSV format preferred"],
    }
    """
    breakdown = {
        "title_match": 0.0,
        "tag_match": 0.0,
        "expansion_match": 0.0,
        "location_bonus": 0.0,
        "format_bonus": 0.0,
        "keyword_bonus": 0.0,
    }
    reasons = []

    ds_title = dataset.get("title", "").lower()
    res_title = resource.get("title", "").lower()
    tags = [t.lower() for t in dataset.get("tags", [])]
    resource_id = resource.get("resource_id")

    # 1. Title matching (40% max)
    for token in query_decomposed["subject_tokens"]:
        variants = get_hebrew_variants(token)
        if any(v.lower() in ds_title for v in variants):
            breakdown["title_match"] += 0.20
            reasons.append(f"Title contains '{token}'")
        if any(v.lower() in res_title for v in variants):
            breakdown["title_match"] += 0.20
            reasons.append(f"Resource title contains '{token}'")
    breakdown["title_match"] = min(0.40, breakdown["title_match"])

    # 2. Tag matching (20% max)
    for token in query_decomposed["subject_tokens"]:
        variants = get_hebrew_variants(token)
        if any(v.lower() in tag for v in variants for tag in tags):
            breakdown["tag_match"] += 0.10
    breakdown["tag_match"] = min(0.20, breakdown["tag_match"])

    # 3. Expansion matching (15% max)
    for term in query_decomposed["expanded_subjects"]:
        if term.lower() in ds_title or term.lower() in res_title:
            breakdown["expansion_match"] += 0.05
    breakdown["expansion_match"] = min(0.15, breakdown["expansion_match"])

    # 4. Location bonus (10% max)
    for loc in query_decomposed["location_variants"]:
        if loc.lower() in ds_title or loc.lower() in res_title:
            breakdown["location_bonus"] += 0.05
            reasons.append(f"Matches location '{loc}'")
    breakdown["location_bonus"] = min(0.10, breakdown["location_bonus"])

    # 5. Format bonus (15% max)
    fmt = resource.get("format", "").upper()
    breakdown["format_bonus"] = get_format_score(fmt)
    if breakdown["format_bonus"] > 0.10:
        reasons.append(f"{fmt} format preferred")

    # 6. Keyword bonus (25% max)
    breakdown["keyword_bonus"] = get_keyword_boost(query, resource_id)

    # Calculate total
    total = sum(breakdown.values())

    # Determine confidence level
    if total >= 0.6:
        confidence = "high"
    elif total >= 0.35:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "total_score": min(1.0, total),
        "breakdown": breakdown,
        "confidence": confidence,
        "reasons": reasons,
    }
```

### 21.18 Markdown Table Formatting

**Problem:** Raw JSON is hard to read in chat interface.

**Solution:** `_format_as_markdown()` creates readable tables:

```python
def _format_as_markdown(
    records: List[dict],
    fields: List[str],
    metadata: dict,
    aggregates: dict | None = None
) -> str:
    """
    Format query results as markdown table.

    Example output:

    | שם | כתובת | טלפון |
    | --- | --- | --- |
    | בית חולים הדסה | ירושלים | 02-1234567 |
    | בית חולים איכילוב | תל אביב | 03-1234567 |

    **Source**: בתי חולים בישראל - רשימה מלאה
    **Records**: 1-20 of 150 | **Format**: CSV

    **📊 SUMMARY TOTALS:**
    - **מספר_מיטות**: 45,000 (from 150 records)

    *☝️ Use these totals to answer 'how many' questions directly.*
    """
    if not records or not fields:
        return "לא נמצאו תוצאות."

    # Limit fields for readability
    display_fields = fields[:6]  # Max 6 columns

    # Build header
    header = "| " + " | ".join(display_fields) + " |"
    separator = "| " + " | ".join(["---"] * len(display_fields)) + " |"

    # Build rows
    rows = []
    for record in records[:20]:  # Max 20 rows
        values = []
        for field in display_fields:
            val = record.get(field, "")
            # Truncate long values
            val_str = str(val)[:50] if val else "-"
            values.append(val_str)
        rows.append("| " + " | ".join(values) + " |")

    # Build table
    table = "\n".join([header, separator] + rows)

    # Add metadata
    source = metadata.get("dataset_title", "Unknown")
    total = metadata.get("total_records", len(records))
    fmt = metadata.get("format", "Unknown")

    table += f"\n\n**Source**: {source}"
    table += f"\n**Records**: 1-{len(records)} of {total} | **Format**: {fmt}"

    # Add aggregates if present
    if aggregates and aggregates.get("summary_totals"):
        table += "\n\n**📊 SUMMARY TOTALS:**"
        for field, stats in aggregates["summary_totals"].items():
            if isinstance(stats, dict) and "sum" in stats:
                table += f"\n- **{field}**: {stats['sum']:,.0f} (from {stats['count']:,} records)"
        table += "\n\n*☝️ Use these totals to answer 'how many' questions directly.*"

    return table
```

### 21.19 Retry Logic with Graceful Degradation

**Problem:** API sometimes returns 403 or times out.

**Solution:** Retry with exponential backoff and graceful fallback:

```python
MAX_RETRIES = 2
RETRY_DELAY_MS = 500

async def _http_with_retry(
    method: str,
    endpoint: str,
    params: dict = None
) -> dict:
    """
    Make HTTP request with retry logic.

    Retry conditions:
    - 403 Forbidden (Cloudflare challenge)
    - 429 Rate Limit
    - 500-504 Server errors
    - Connection timeout
    """
    last_error = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            response = _http(method, endpoint, params)

            # Success
            if response.status_code == 200:
                return response.json()

            # Retryable errors
            if response.status_code in [403, 429, 500, 502, 503, 504]:
                last_error = f"HTTP {response.status_code}"
                if attempt < MAX_RETRIES:
                    delay = RETRY_DELAY_MS * (2 ** attempt)  # Exponential backoff
                    await asyncio.sleep(delay / 1000)
                    continue

            # Non-retryable errors
            if response.status_code == 404:
                return {
                    "error": "Resource not found",
                    "suggestion": "Try a different search term or format",
                }

            if response.status_code == 400:
                return {
                    "error": "Invalid request",
                    "suggestion": "Check query parameters",
                }

            last_error = f"HTTP {response.status_code}: {response.text[:100]}"

        except asyncio.TimeoutError:
            last_error = "Request timed out"
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY_MS / 1000)
                continue

        except Exception as e:
            last_error = str(e)
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY_MS / 1000)
                continue

    # All retries exhausted
    return {
        "error": last_error,
        "retries_attempted": MAX_RETRIES,
        "suggestion": "Try again in a few seconds",
    }
```

### 21.20 Pre-loaded Resource Map

**Problem:** Searching the API for datasets is slow (multiple API calls).

**Solution:** Pre-indexed `resources_map.json` loaded at startup:

```python
# Global resource map (loaded once at startup)
RESOURCES_MAP = {
    "datasets": {},
    "resources": {},
    "last_updated": None,
}

def _load_resources_map():
    """Load pre-indexed resource map at startup."""
    global RESOURCES_MAP

    map_path = os.path.join(os.path.dirname(__file__), "resources_map.json")

    if os.path.exists(map_path):
        with open(map_path, "r", encoding="utf-8") as f:
            RESOURCES_MAP = json.load(f)
        print(f"Loaded {len(RESOURCES_MAP.get('datasets', {}))} datasets from resources_map.json")
    else:
        print("Warning: resources_map.json not found. Run resources_mapper.py to generate.")

# Call at module load
_load_resources_map()

def suggest_for_query(query: str, limit: int = 5) -> List[dict]:
    """
    Suggest datasets for a query using pre-loaded resource map.
    No API calls needed - instant local search.
    """
    if not RESOURCES_MAP.get("datasets"):
        return []

    candidates = []
    query_decomposed = _decompose_query(query)

    for ds_id, dataset in RESOURCES_MAP["datasets"].items():
        for resource in dataset.get("resources", []):
            score_result = _score_resource_complete(
                query, query_decomposed, dataset, resource
            )

            if score_result["total_score"] > 0.15:
                candidates.append({
                    "dataset_id": ds_id,
                    "dataset_title": dataset.get("title"),
                    "resource_id": resource.get("resource_id"),
                    "resource_title": resource.get("title"),
                    "format": resource.get("format"),
                    "score": score_result["total_score"],
                    "confidence": score_result["confidence"],
                    "reasons": score_result["reasons"],
                })

    # Sort by score descending
    candidates.sort(key=lambda x: x["score"], reverse=True)

    return candidates[:limit]
```

**resources_map.json Structure:**

```json
{
  "datasets": {
    "62c54ef6-49f1-4b5f-bd1e-1e88a5955acd": {
      "title": "בתי חולים בישראל",
      "organization": "משרד הבריאות",
      "tags": ["hospital", "health", "medical", "בריאות"],
      "resources": [
        {
          "resource_id": "b3c89abc-8e86-4abd-a4f3-a33ebee9fc07",
          "title": "רשימת בתי חולים ציבוריים",
          "format": "CSV",
          "last_modified": "2024-03-15"
        }
      ]
    }
  },
  "stats": {
    "total_datasets": 1187,
    "total_resources": 1960,
    "last_updated": "2025-12-27T10:30:00Z"
  }
}
```

---

## 22. Troubleshooting & Debugging Guide

This section provides detailed troubleshooting procedures for common issues. **EVERY error pattern is documented with diagnosis steps, root cause, and fix.**

### 22.1 Common Errors & Fixes

#### 22.1.1 502 Bad Gateway

**Symptoms:**
- Frontend shows "502 Bad Gateway" error
- API calls to `localhost:8002` fail
- MCP tools return connection errors

**Diagnosis:**
```bash
# Check if llama-server is running
docker ps | grep llama-server

# Check llama-server logs
docker logs -f llama-server --tail 100

# Check if model is still loading
# Look for: "model loaded" or "server listening"
```

**Root Cause:**
- Llama server is still loading the model (~45 seconds for 24B model)
- Llama server crashed due to OOM
- Docker container failed to start

**Fix:**
```bash
# Wait for model to load (watch logs)
docker logs -f llama-server

# If crashed, restart the stack
./stop.sh && ./start.sh

# If OOM, reduce context size in .env
# Change CONTEXT_SIZE=32768 to CONTEXT_SIZE=16384
```

#### 22.1.2 OOM (Out of Memory) Crash

**Symptoms:**
- `llama-server` container exits unexpectedly
- `nvidia-smi` shows 100% GPU memory usage
- Error: "CUDA out of memory"

**Diagnosis:**
```bash
# Check GPU memory
nvidia-smi

# Check container exit code
docker inspect llama-server --format='{{.State.ExitCode}}'

# Check for OOM in logs
docker logs llama-server 2>&1 | grep -i "out of memory\|OOM\|CUDA"
```

**Root Cause:**
- Context size too large for available VRAM
- Multiple large requests running simultaneously
- KV cache not quantized

**Fix:**
```bash
# Option 1: Reduce context size
# In .env:
CONTEXT_SIZE=16384  # Was 32768

# Option 2: Enable KV cache quantization
# In .env:
KV_CACHE_TYPE=q8_0  # Saves ~6GB VRAM

# Option 3: Reduce batch size
# In .env:
BATCH_SIZE=512  # Was 2048

# Restart after changes
./stop.sh && ./start.sh
```

#### 22.1.3 "Thinking" Block Not Showing

**Symptoms:**
- Model responses don't show `<think>` block
- Tool calls appear without reasoning
- Model seems to skip thinking phase

**Diagnosis:**
```bash
# Check MCP configuration
grep "MCP_USE_NATIVE_TOOLS" .env

# Should output:
# MCP_USE_NATIVE_TOOLS=false
```

**Root Cause:**
- `MCP_USE_NATIVE_TOOLS` is set to `true`
- Frontend is using native OpenAI tool calling instead of "Reasoning First"

**Fix:**
```bash
# In .env, ensure:
MCP_USE_NATIVE_TOOLS=false

# Restart frontend
docker restart bricksllm-frontend
```

#### 22.1.4 MCP Server Connection Refused

**Symptoms:**
- Error: "Connection refused to http://mcp-sse-proxy:3010"
- Tool calls fail with network errors
- Cascade fallback activates immediately

**Diagnosis:**
```bash
# Check if MCP proxy is running
docker ps | grep mcp-sse-proxy

# Check MCP proxy logs
docker logs mcp-sse-proxy --tail 50

# Check network connectivity
docker exec bricksllm-frontend curl http://mcp-sse-proxy:3010/health
```

**Root Cause:**
- MCP SSE proxy container not running
- Wrong port configuration
- Docker network not connected

**Fix:**
```bash
# Restart MCP proxy
docker restart mcp-sse-proxy

# Check network configuration
docker network inspect bricksllm-network

# Ensure containers are on same network
docker network connect bricksllm-network mcp-sse-proxy
```

#### 22.1.5 Hebrew Text Encoding Issues

**Symptoms:**
- Hebrew text appears as `????` or boxes
- Tool parameters show encoded characters
- API responses have garbled Hebrew

**Diagnosis:**
```python
# Check response encoding in MCP server
import json
response = {"text": "שלום"}
print(json.dumps(response, ensure_ascii=False))  # Should show Hebrew
print(json.dumps(response, ensure_ascii=True))   # Shows \u05e9...
```

**Root Cause:**
- JSON encoding with `ensure_ascii=True`
- Missing UTF-8 content-type header
- Database not using UTF-8 collation

**Fix:**
```python
# In MCP server, always use:
json.dumps(data, ensure_ascii=False)

# Set response headers:
response.headers["Content-Type"] = "application/json; charset=utf-8"

# In Python requests:
response.encoding = "utf-8"
```

#### 22.1.6 Tool Not Found in Registry

**Symptoms:**
- Error: "Unknown tool: {tool_name}"
- Tool calls fail at validation stage
- Model suggests tools that don't exist

**Diagnosis:**
```typescript
// Check if tool is registered
import { TOOL_INTELLIGENCE } from "./toolIntelligenceRegistry";
console.log(TOOL_INTELLIGENCE["your_tool_name"]);
```

**Root Cause:**
- Tool not added to `toolIntelligenceRegistry.ts`
- MCP server not exposing tool in tool list
- Tool name mismatch (case sensitivity)

**Fix:**
```typescript
// Add to toolIntelligenceRegistry.ts
export const TOOL_INTELLIGENCE: Record<string, ToolIntelligence> = {
  // ... existing tools ...

  your_tool_name: {
    name: "your_tool_name",
    patterns: ["your_tool_name"],
    mcpServer: "your_mcp_server",
    priority: 80,
    // ... full specification
  }
};
```

#### 22.1.7 Infinite Tool Loop Detected

**Symptoms:**
- Error: "Tool loop detected, breaking"
- Same tool called repeatedly with same parameters
- Response never completes

**Diagnosis:**
```typescript
// Check loop detector threshold
import { MAX_REPEATED_CALLS } from "./loopDetector";
console.log(`Max repeated calls: ${MAX_REPEATED_CALLS}`);  // Should be 3
```

**Root Cause:**
- Model stuck in reasoning loop
- Tool returning result that triggers another call
- Missing termination condition in tool response

**Fix:**
```typescript
// Adjust loop detector threshold if needed
export const MAX_REPEATED_CALLS = 3;

// Ensure tool response includes clear completion signal
return {
  result: data,
  complete: true,
  message: "Query completed successfully"
};
```

#### 22.1.8 Timeout Errors

**Symptoms:**
- Error: "Request timed out after Xms"
- Research tools fail but quick search works
- Slow queries never complete

**Diagnosis:**
```typescript
// Check timeout configuration
import { TOOL_INTELLIGENCE } from "./toolIntelligenceRegistry";
const tool = TOOL_INTELLIGENCE["perplexity_research"];
console.log(`Timeout: ${tool.latency.timeout}ms`);
```

**Root Cause:**
- Timeout set too low for tool's expected latency
- External API slow or overloaded
- Network latency between services

**Fix:**
```typescript
// Adjust timeout in toolIntelligenceRegistry.ts
perplexity_research: {
  latency: {
    typical: 30000,
    timeout: 300000,  // 5 minutes for research
    feedbackDelay: 5000
  }
}
```

### 22.2 Debugging Procedures

#### 22.2.1 Enable Debug Logging

```bash
# In .env
BRICKSLLM_MODE=development
LOG_LEVEL=debug

# Restart stack
./stop.sh && ./start.sh

# Watch logs
docker logs -f bricksllm-frontend
```

#### 22.2.2 Trace MCP Request Flow

```typescript
// In runMcpFlow.ts, add tracing
console.log("[MCP] Starting flow with query:", userQuery);
console.log("[MCP] Available tools:", tools.map(t => t.function.name));
console.log("[MCP] Filtered tools:", filteredTools.map(t => t.function.name));
console.log("[MCP] Tool call detected:", JSON.stringify(toolCall));
console.log("[MCP] Tool result:", JSON.stringify(result));
```

#### 22.2.3 Test Individual MCP Server

```bash
# Test DataGov directly
cd datagov
python -c "
from server import search_resources
result = search_resources('בתי חולים', limit=5)
print(result)
"

# Test via SSE proxy
curl -X POST http://localhost:3010/mcp/datagov/tools/search_resources \
  -H 'Content-Type: application/json' \
  -d '{"query": "בתי חולים", "limit": 5}'
```

#### 22.2.4 Validate Parameter Normalization

```typescript
// Test parameter normalization
import { normalizeToolParameters } from "./toolParameterRegistry";

const raw = { q: "test query", max: "10" };
const normalized = normalizeToolParameters("tavily_search", raw);
console.log("Normalized:", normalized);
// Should output: { query: "test query", max_results: 10 }
```

### 22.3 Health Check Scripts

#### 22.3.1 Full Stack Health Check

```bash
#!/bin/bash
# save as: health_check.sh

echo "=== BricksLLM Health Check ==="

# Check Docker containers
echo -e "\n[1] Docker Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "llama|bricksllm|mcp|redis|postgres"

# Check GPU
echo -e "\n[2] GPU Status:"
nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv

# Check Llama server
echo -e "\n[3] Llama Server:"
curl -s http://localhost:5002/health || echo "FAILED"

# Check Frontend
echo -e "\n[4] Frontend:"
curl -s http://localhost:8003/api/health || echo "FAILED"

# Check MCP Proxy
echo -e "\n[5] MCP Proxy:"
curl -s http://localhost:3010/health || echo "FAILED"

# Check Redis
echo -e "\n[6] Redis:"
docker exec bricksllm-redis redis-cli ping || echo "FAILED"

echo -e "\n=== Health Check Complete ==="
```

#### 22.3.2 MCP Tools Verification

```bash
#!/bin/bash
# save as: verify_mcp_tools.sh

echo "=== MCP Tools Verification ==="

# Get available tools
echo -e "\n[1] Available MCP Servers:"
curl -s http://localhost:3010/servers | jq '.servers[].name'

# Test each server
echo -e "\n[2] Testing DataGov:"
curl -s -X POST http://localhost:3010/mcp/datagov/tools/list_categories | jq '.categories | length'

echo -e "\n[3] Testing Perplexity:"
curl -s -X POST http://localhost:3010/mcp/perplexity/tools/perplexity_search \
  -H 'Content-Type: application/json' \
  -d '{"query": "test"}' | jq '.status'

echo -e "\n[4] Testing Tavily:"
curl -s -X POST http://localhost:3010/mcp/tavily/tools/tavily_search \
  -H 'Content-Type: application/json' \
  -d '{"query": "test"}' | jq '.status'

echo -e "\n=== Verification Complete ==="
```

### 22.4 Error Recovery Procedures

#### 22.4.1 Complete Stack Reset

```bash
#!/bin/bash
# save as: reset_stack.sh

echo "=== Complete Stack Reset ==="

# Stop everything
./stop.sh

# Remove containers
docker rm -f $(docker ps -aq --filter "name=bricksllm") 2>/dev/null

# Clear Docker cache (optional)
docker system prune -f

# Restart
./start.sh

echo "=== Reset Complete ==="
```

#### 22.4.2 Database Reset

```bash
#!/bin/bash
# save as: reset_db.sh

echo "=== Database Reset ==="
echo "WARNING: This will delete all data!"
read -p "Continue? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
  # Stop stack
  ./stop.sh

  # Remove PostgreSQL volume
  docker volume rm bricksllm_postgresql_data

  # Restart
  ./start.sh

  echo "=== Database Reset Complete ==="
fi
```

#### 22.4.3 MCP Server Recovery

```bash
#!/bin/bash
# save as: recover_mcp.sh

echo "=== MCP Server Recovery ==="

# Restart MCP proxy
docker restart mcp-sse-proxy

# Wait for startup
sleep 5

# Verify
curl -s http://localhost:3010/health && echo "MCP Proxy: OK" || echo "MCP Proxy: FAILED"

echo "=== Recovery Complete ==="
```

---

## 23. Complete Statistics & Metrics Reference

This section provides all project metrics for tracking and monitoring enterprise MCP integration quality.

### 23.1 Current System Statistics

| Category | Metric | Value |
|----------|--------|-------|
| **Tool Intelligence** | Total Smart Methods | 30+ |
| **Tool Intelligence** | Tool Categories | 6 |
| **Tool Intelligence** | Fallback Chains | 3 |
| **Tool Intelligence** | Error Categories | 7 |
| **DataGov** | Datasets Indexed | 1,187 |
| **DataGov** | Individual Schema Files | 1,190 |
| **DataGov** | Resources with Metadata | 1,960 |
| **Hebrew Support** | Bidirectional Expansion Terms | 3,972 |
| **Hebrew Support** | Dataset Tags Indexed | 1,527 |
| **Hebrew Support** | Title Keywords Indexed | 3,963 |
| **Hebrew Support** | Semantic Domains | 22 |
| **Hebrew Support** | Total Searchable Terms | ~9,500+ |

### 23.2 Performance Benchmarks

| Tool Category | Typical Latency | Timeout | Feedback Delay |
|---------------|-----------------|---------|----------------|
| **Quick Search** | 500ms - 2s | 15s | 1s |
| **Deep Search** | 2s - 10s | 60s | 3s |
| **Research** | 10s - 60s | 300s (5min) | 5s |
| **File Operations** | 100ms - 500ms | 10s | 0.5s |
| **DataGov Query** | 1s - 5s | 30s | 2s |

### 23.3 Quality Metrics Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| **First-Call Success Rate** | >90% | Primary tool succeeds without fallback |
| **Cascade Success Rate** | >99% | Including all fallback attempts |
| **Parameter Fix Rate** | >95% | Auto-normalized parameters work |
| **Intent Detection Accuracy** | >90% | Correct tool selected for query |
| **Hebrew Query Coverage** | >85% | Hebrew queries matched correctly |
| **Error Message Quality** | 100% | All errors have Hebrew guidance |

### 23.4 Integration Checklist Metrics

Use this checklist to measure integration completeness:

#### Layer 1: MCP Server (0-25 points)

| Item | Points | Criteria |
|------|--------|----------|
| Server starts without errors | 5 | `python server.py` succeeds |
| All tools listed | 5 | `/tools` endpoint returns all tools |
| Parameters validated | 5 | Invalid parameters return clear errors |
| Hebrew input supported | 5 | UTF-8 handling correct |
| Error responses structured | 5 | Standard error format used |

#### Layer 2: Helper Scripts (0-25 points)

| Item | Points | Criteria |
|------|--------|----------|
| Resource mapper created | 5 | Generates `resources_map.json` |
| Schema generator created | 5 | Extracts field metadata |
| Semantic expansions defined | 10 | Hebrew↔English term mappings |
| Documentation generated | 5 | Tool usage examples created |

#### Layer 3: Frontend Integration (0-25 points)

| Item | Points | Criteria |
|------|--------|----------|
| ToolIntelligence entry added | 10 | Complete specification with all fields |
| Parameter aliases defined | 5 | All known aliases mapped |
| Intent patterns added | 5 | Hebrew + English triggers |
| Fallback chain configured | 5 | At least 1 fallback tool |

#### Layer 4: Orchestration (0-25 points)

| Item | Points | Criteria |
|------|--------|----------|
| Tool appears in filtered list | 5 | Selected for relevant queries |
| Execution succeeds | 10 | Returns valid results |
| Error handling works | 5 | Graceful Hebrew messages |
| Fallback tested | 5 | Cascade activates on failure |

**Scoring:**
- 90-100: Enterprise Grade ✅
- 75-89: Production Ready ⚠️
- 50-74: Needs Improvement ❌
- <50: Not Ready ❌

### 23.5 Monitoring Dashboard Metrics

#### 23.5.1 Real-Time Metrics to Track

```typescript
interface ToolMetrics {
  // Call metrics
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  fallbackActivations: number;

  // Latency metrics
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;

  // Error metrics
  errorsByCategory: Record<string, number>;
  parameterNormalizationCount: number;
  loopDetectionCount: number;

  // Hebrew metrics
  hebrewQueryCount: number;
  hebrewIntentMatchRate: number;
}
```

#### 23.5.2 Alerting Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Error Rate | >5% | >15% |
| Avg Latency | >30s | >60s |
| Fallback Rate | >20% | >40% |
| Loop Detection | >1/hour | >5/hour |
| OOM Events | 1/day | 3/day |

### 23.6 Semantic Domain Statistics

The 22 semantic domains with their term counts:

| Domain | Hebrew Term Count | English Term Count | Total |
|--------|-------------------|-------------------|-------|
| Healthcare | 45 | 35 | 80 |
| Education | 60 | 45 | 105 |
| Transportation | 50 | 40 | 90 |
| Environment | 40 | 35 | 75 |
| Finance | 55 | 50 | 105 |
| Government | 70 | 55 | 125 |
| Demographics | 45 | 35 | 80 |
| Legal | 50 | 45 | 95 |
| Technology | 35 | 60 | 95 |
| Agriculture | 40 | 30 | 70 |
| Real Estate | 45 | 35 | 80 |
| Employment | 50 | 40 | 90 |
| Security | 35 | 30 | 65 |
| Tourism | 40 | 35 | 75 |
| Culture | 45 | 35 | 80 |
| Sports | 30 | 25 | 55 |
| Infrastructure | 55 | 45 | 100 |
| Energy | 35 | 40 | 75 |
| Water | 30 | 25 | 55 |
| Welfare | 50 | 40 | 90 |
| Communications | 35 | 45 | 80 |
| Science | 40 | 55 | 95 |
| **TOTAL** | **980** | **895** | **1,875 base** |

*Note: With bidirectional expansion (both directions), total reaches ~3,972 terms.*

---

## 24. Final Summary & Quick Reference

### 24.1 Enterprise MCP Integration Checklist

Use this master checklist for every new MCP integration:

#### Pre-Integration
- [ ] Analyze API documentation
- [ ] Document authentication requirements
- [ ] Identify rate limits
- [ ] List all exposed tools
- [ ] Define Hebrew intent signals
- [ ] Identify fallback tools

#### MCP Server Development
- [ ] Create Python/Node.js MCP server
- [ ] Implement all tools with proper error handling
- [ ] Add browser impersonation if needed (curl_cffi)
- [ ] Support UTF-8/Hebrew throughout
- [ ] Return structured JSON responses
- [ ] Include debug information in responses

#### Helper Scripts
- [ ] Create resources_mapper.py (if applicable)
- [ ] Create schema generator (if applicable)
- [ ] Define semantic expansions (Hebrew↔English)
- [ ] Generate per-resource schemas

#### Frontend Integration
- [ ] Add full ToolIntelligence entry
- [ ] Define parameter aliases
- [ ] Add Hebrew intent patterns
- [ ] Configure fallback chain
- [ ] Add graceful error messages

#### Testing & Validation
- [ ] Test with Hebrew queries
- [ ] Test with malformed parameters
- [ ] Test timeout handling
- [ ] Test fallback activation
- [ ] Verify error messages are user-friendly

#### Documentation
- [ ] Document all tools
- [ ] Document parameter requirements
- [ ] Document error responses
- [ ] Add examples for each tool

### 24.2 Key File Locations

| Purpose | File Path |
|---------|-----------|
| **Main Orchestrator** | `frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts` |
| **Tool Metadata** | `frontend-huggingface/src/lib/server/textGeneration/mcp/toolIntelligenceRegistry.ts` |
| **Parameter Normalization** | `frontend-huggingface/src/lib/server/textGeneration/mcp/toolParameterRegistry.ts` |
| **Tool Execution** | `frontend-huggingface/src/lib/server/textGeneration/mcp/toolInvocation.ts` |
| **Intent Detection** | `frontend-huggingface/src/lib/server/textGeneration/mcp/toolFilter.ts` |
| **Hebrew Expansion** | `frontend-huggingface/src/lib/server/textGeneration/utils/hebrewIntentDetector.ts` |
| **System Prompt** | `frontend-huggingface/src/lib/server/textGeneration/utils/toolPrompt.ts` |
| **Loop Detection** | `frontend-huggingface/src/lib/server/textGeneration/mcp/loopDetector.ts` |
| **Reference Server** | `datagov/server.py` |
| **Reference Schemas** | `datagov/schemas/` |
| **Reference Expansions** | `datagov/enterprise_expansions.py` |
| **Environment Config** | `.env` |
| **MCP Server Config** | `mcp-sse-proxy/config/servers.json` |

### 24.3 Quick Command Reference

```bash
# Start Stack
./stop.sh && ./start.sh

# View Logs
docker logs -f bricksllm-frontend
docker logs -f llama-server
docker logs -f mcp-sse-proxy

# Check GPU
nvidia-smi

# Test Health
curl http://localhost:8003/api/health
curl http://localhost:5002/health
curl http://localhost:3010/health

# Restart Single Service
docker restart bricksllm-frontend
docker restart mcp-sse-proxy

# Full Reset
./stop.sh
docker system prune -f
./start.sh
```

### 24.4 Success Criteria Summary

An enterprise-grade MCP integration MUST:

1. **Never show raw errors** - All errors wrapped in Hebrew guidance
2. **Auto-fix parameters** - Model mistakes normalized automatically
3. **Cascade on failure** - Try fallbacks before giving up
4. **Support Hebrew** - Full bidirectional semantic expansion
5. **Provide progress** - Show feedback during long operations
6. **Describe capabilities** - Model can explain its tools
7. **Log appropriately** - Debug info without sensitive data
8. **Handle timeouts** - Category-appropriate timeout values
9. **Prevent loops** - Detect and break infinite tool loops
10. **Format results** - Clean, readable output in user's language

**End of Enterprise MCP Server Integration Guide**
