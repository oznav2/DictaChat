# Enterprise-Grade MCP Chat Flow Overview (Gemini Analysis)

## 1. LLM Navigation Map (Glossary)

Use this map to locate specific logic within `runMcpFlow.ts` (~2500 lines).

| Line Range | Functional Block | Key Responsibilities |
| :--- | :--- | :--- |
| **1 - 92** | **Imports** | Imports services, types, and memory integration modules. |
| **204 - 218** | **Function Entry** | `runMcpFlow` signature and context destructuring. |
| **233 - 395** | **Server Config** | Loads `MCP_SERVERS`, merges custom servers, and handles HF token forwarding. |
| **440 - 454** | **Routing** | Resolves target model and router resolution. |
| **459** | **Service Registration** | Initializes `ServiceContainer` and registers MCP services. |
| **467 - 472** | **Document Detection** | Checks for attached documents to ensure Docling tools are enabled. |
| **476 - 480** | **Tool Filtering** | `ToolFilterService` selects tools based on query keywords. |
| **568 - 1107** | **Memory Integration** | **Massive Block**: Parallel prefetch of Memory Context, Contextual Guidance, Tool Guidance, and Outcome Detection. |
| **1113 - 1164** | **Tool Gating** | `decideToolGating`: Filters tools based on memory confidence and user intent. |
| **1191 - 1270** | **Prompt Construction** | Builds the system prompt with "Reasoning First" instructions, memory context, and language constraints. |
| **1430** | **Main Execution Loop** | The `for` loop managing multi-turn tool interactions (max 10 turns). |
| **1552 - 1825** | **Streaming & Parsing** | Streams tokens to UI. Handles `<think>` blocks, detects gibberish/repetition, and parses tool calls. |
| **2072 - 2178** | **Tool Execution** | Executes tools via `toolInvocation.ts`, captures outputs, and handles errors. |
| **2183 - 2195** | **Action KG Recording** | Records tool execution outcomes for future "Tool Guidance". |
| **2236 - 2250** | **XML Repair** | `repairXmlTags`: Ensures `</think>` and `<tool_call>` tags are closed. |
| **2290 - 2354** | **Attribution** | Parses response for memory citations (marks) and scores them. |
| **2372 - 2488** | **Learning & Storage** | Records interaction outcome, stores "Working Memory" of the exchange, and updates surfaced memories. |
| **2506 - 2519** | **Cleanup** | Drains MCP client pool and logs performance metrics. |

---

## 2. Executive Summary & Architecture

This document provides a comprehensive analysis of `runMcpFlow.ts`, the central orchestrator of the BricksLLM frontend. It details the "Reasoning-First" architecture augmented by a "Memory-First" system, handling user queries, tool execution, memory retrieval, and outcome learning in a unified loop.

**Core Philosophy**: The system acts as a cognitive agent that:
1.  **Remembers**: Prefetches relevant context from a multi-tier memory system (Working, History, Patterns, Documents, DataGov).
2.  **Reasons**: Uses a `<think>` block to plan before acting.
3.  **Gates**: Intelligently filters tools based on memory confidence and user intent.
4.  **Learns**: Tracks outcomes and updates its knowledge graph based on user feedback.

---

## 3. High-Level Flow Schema

```mermaid
graph TD
    A[User Request] --> B[generate.ts]
    B --> C{Tools Enabled?}
    C -- No --> D[Standard Generation]
    C -- Yes --> E[runMcpFlow.ts]

    subgraph "MCP Orchestration (runMcpFlow.ts)"
        E --> F[Service Registration]
        
        subgraph "Phase 1: Context & Memory"
            F --> G[Detect Document Attachments]
            G --> H{Parallel Operations}
            H --> I[Prefetch Memory Context]
            H --> J[Get Contextual Guidance]
            H --> K[Get Tool Guidance]
            H --> L[Phase 8: Outcome Detection]
        end

        subgraph "Phase 2: Decision & Gating"
            I & J & K --> M[Tool Filter (Keyword)]
            M --> N[Tool Gating (Confidence-Based)]
            N --> O[Build Prompt (Reasoning + Memory)]
        end

        subgraph "Phase 3: Execution Loop"
            O --> P[Model Inference (Stream)]
            P --> Q{Parse Stream}
            Q -- "<think>" --> R[Stream Thought]
            Q -- "tool_calls" --> S[Execute Tools]
            Q -- "Text" --> T[Stream Answer]
            
            S --> U[Loop Detection]
            U -- Safe --> V[Append Results]
            V --> P
            U -- Loop --> W[Abort/Fallback]
        end

        subgraph "Phase 4: Learning & Finalization"
            T --> X[Final Answer]
            X --> Y{Parallel Background Tasks}
            Y --> Z1[Record Outcome]
            Y --> Z2[Store Working Memory]
            Y --> Z3[Update Action KG]
        end
    end
```

---

## 4. Detailed Flow Analysis

### Phase 1: Initialization & Memory Prefetch
1.  **Service Binding**: Initializes `ServiceContainer` and registers services.
2.  **Document Detection**: Checks `hasDocumentAttachments` to ensure Docling tools are available.
3.  **Parallel Memory Operations**:
    *   **Prefetch Context**: Queries `UnifiedMemoryFacade` for relevant memories across all tiers.
    *   **Contextual Guidance**: Retrieves past failures/patterns relevant to the query.
    *   **Tool Guidance**: Fetches stats on tool effectiveness (e.g., "avoid `create_memory` for this query").
    *   **Outcome Detection**: Analyzes if the user's *current* message is positive/negative feedback on the *previous* turn.

### Phase 2: Gating & Prompt Engineering
1.  **Initial Filtering**: `ToolFilterService` selects tools based on query keywords (e.g., "search" -> Tavily).
2.  **Memory-First Gating** (`toolGatingDecision.ts`):
    *   **Rule 1 (Fail-Open)**: If memory system is degraded, allow all tools.
    *   **Rule 2 (Explicit Request)**: If user asks for a specific tool, allow it.
    *   **Rule 3 (Intent)**: If Hebrew intent is "research" (מחקר), allow all tools.
    *   **Rule 4 (Confidence)**: If memory confidence is HIGH/MEDIUM and results exist, **reduce** external search tools to prevent redundancy.
3.  **Prompt Construction**:
    *   Injects **Memory Context** (Personality, Facts).
    *   Injects **Attribution Instructions** (Tell model to cite memories).
    *   Injects **Guidance** (Warnings, "Do not use X").
    *   Injects **Language Instruction** (Force response in user's language).

### Phase 3: The Reasoning Loop
1.  **Inference**: Streams tokens from LLM with `max_tokens` clamped to ~4k-8k (higher for follow-ups).
2.  **Streaming Analysis**:
    *   **Gibberish Detection**: Aborts if model babbles without tool calls (unless in `<think>` block).
    *   **Repetition Detection**: Checks for infinite repeating patterns.
    *   **Content Truncation**: Caps output at 50KB to prevent memory exhaustion.
3.  **Tool Execution**:
    *   Parses JSON/XML tool calls.
    *   Checks `LoopDetector` (Semantic Hashing) to prevent infinite recursion.
    *   Executes via `toolInvocation.ts` (Circuit Breaker protected).
    *   Appends results wrapped in `<tool_results>` tags.

### Phase 4: Post-Processing & Learning
1.  **XML Repair**: Ensures all tags (`</think>`, `</tool_results>`) are closed.
2.  **Attribution**: Parses which memories the model actually used (citations).
3.  **Learning (Background)**:
    *   **Record Outcome**: Was the interaction successful?
    *   **Store Working Memory**: Summarize exchange into short-term memory.
    *   **Action KG**: Update tool success rates based on execution results.

---

## 5. Key Files & Responsibilities

### Core Orchestrators
| File Path | Role | Critical Logic |
| :--- | :--- | :--- |
| `src/lib/server/textGeneration/mcp/runMcpFlow.ts` | **The Brain** | Manages the entire lifecycle: initialization, memory prefetch, tool gating, execution loop, and learning. |
| `src/lib/server/textGeneration/mcp/memoryIntegration.ts` | **Memory Bridge** | Handles prefetching, prompt formatting, and outcome recording. Connects flow to `UnifiedMemoryFacade`. |
| `src/lib/server/textGeneration/mcp/toolGatingDecision.ts` | **The Gatekeeper** | **Single Source of Truth** for deciding which tools are allowed based on confidence and intent. |
| `src/lib/server/textGeneration/mcp/toolFilter.ts` | **The Filter** | Keyword-based filtering and "Best-in-Class" selection (e.g., picking the right Perplexity tool). |

### Service Layer (The "Smart" Components)
| File Path | Role | Critical Logic |
| :--- | :--- | :--- |
| `src/lib/server/memory/UnifiedMemoryFacade.ts` | **Memory API** | Unified interface for all memory operations (Search, Store, Ops). Abstracts MongoDB/Qdrant complexity. |
| `src/lib/server/textGeneration/mcp/loopDetector.ts` | **Safety** | Stateless semantic hashing to detect and stop infinite tool/content loops. |
| `src/lib/server/textGeneration/mcp/toolInvocation.ts` | **Executor** | Executes MCP tools, handles timeouts, and normalizes outputs (JSON/XML). |
| `src/lib/server/textGeneration/utils/hebrewIntentDetector.ts` | **Intent** | Detects Hebrew intent (Search vs. Research) to guide tool gating. |
| `src/lib/server/textGeneration/mcp/toolFilter.ts` | **Context Optimization** | Filters available tools based on user intent. Prevents overloading the model context with irrelevant tool definitions. |
| `src/lib/server/textGeneration/mcp/toolArgumentSanitizer.ts` | **Security Firewall** | Validates and cleans tool arguments before execution. Prevents injection attacks and fixes common JSON formatting errors from the model. |
| `src/lib/server/textGeneration/mcp/performanceMonitor.ts` | **Metrics** | Tracks execution time of tool calls and inference steps. Helps identify bottlenecks in the "Thinking" process. |

---

## 6. Infrastructure & Execution

### Configuration Consolidation
All configuration is driven by `.env` and `featureFlags.ts`:
*   **`MCP_USE_NATIVE_TOOLS`**: Must be `false` for "Reasoning First".
*   **`MCP_MAX_TOOLS`**: Limits tool count (default 4) to save context.
*   **`MCP_FOLLOWUP_MAX_TOKENS`**: Allows larger context (6144) for tool summaries.
*   **Memory Flags**: `getMemoryFeatureFlags()` controls system enablement, outcome tracking, and attribution.

### Execution Resiliency
*   **Circuit Breakers**: Protect against failing external MCP servers.
*   **Graceful Degradation**: If memory system fails, the flow continues ("Fail-Open") with a warning log.
*   **Background Operations**: Learning and storage tasks run in the background (fire-and-forget) to avoid blocking the UI response.

### DataGov Integration
Specific logic exists to prioritize Israeli government data:
*   **Detection**: `toolFilter.ts` identifies "datagov" intent.
*   **Guidance**: `runMcpFlow.ts` injects a specific prompt forcing the use of `datagov_query` for relevant queries.
*   **Tiers**: Memory system includes specialized `datagov_schema` and `datagov_expansion` tiers.

---

## 7. Critical Realizations & Constraints

1.  **Token Budgeting**: The system aggressively manages tokens. It reserves ~4k for initial reasoning but expands to ~6k+ for follow-up summaries to handle verbose tool outputs.
2.  **Language Parity**: The system is designed to be fully bilingual. It detects query language and forces the model to respond in kind, even if retrieved documents are in a different language.
3.  **Stateless Safety**: `LoopDetector` and other services are stateless (accepting `conversationId`) or Transient, ensuring no cross-request contamination.
4.  **RAG Replacement**: The legacy `ragIntegration.ts` pipeline has been fully replaced by the Unified Memory System (Docling + Qdrant), offering a more integrated "Memory-First" experience.
