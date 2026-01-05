# Project Status

**Last Updated**: December 30, 2025

## RAG Trace Panel Implementation (2025-12-30)

### Summary
Complete implementation of a visual trace panel for RAG (Retrieval-Augmented Generation) pipeline progress. Shows real-time step-by-step progress during document retrieval with bilingual (Hebrew/English) support.

### Phase 1-3: Backend Services (Completed)

**Type Definitions:**
| File | Purpose |
|------|---------|
| `mcp/types/trace.ts` | TraceStep, TraceEvent, StepStatus types |
| `mcp/types/documentContext.ts` | DocumentContext, DocumentChunk, ConversationMemory, RetrievalResult |

**Constants:**
| File | Purpose |
|------|---------|
| `mcp/constants/traceSteps.ts` | Bilingual step labels (EXTRACTING_DOCUMENT, CHUNKING_CONTENT, etc.) |

**Services:**
| File | Purpose |
|------|---------|
| `mcp/services/traceEmitter.ts` | SSE event streaming, run/step management |
| `mcp/services/semanticChunker.ts` | Document chunking with section/paragraph/sentence splitting |
| `mcp/services/embeddingClient.ts` | Client for dicta-retrieval (port 5005) |
| `mcp/services/rerankerClient.ts` | Client for dicta-retrieval (port 5006) |
| `mcp/services/documentRAG.ts` | Main orchestrator (ingestDocument, retrieveContext) |
| `mcp/services/ragDatabase.ts` | MongoDB connection helper |

**Store:**
| File | Purpose |
|------|---------|
| `mcp/stores/documentContextStore.ts` | MongoDB CRUD for document contexts, chunks, memory |

**Integration:**
| File | Purpose |
|------|---------|
| `mcp/ragIntegration.ts` | runMcpFlow integration helper |

### Phase 4: Full UI Integration (Completed)

**Frontend Changes:**
| File | Changes |
|------|---------|
| `src/lib/types/MessageUpdate.ts` | Added `MessageUpdateType.Trace`, `MessageTraceUpdateType` enum, trace update interfaces |
| `src/lib/utils/messageUpdates.ts` | Added 6 type guard helpers: `isMessageTraceUpdate()`, `isMessageTraceRunCreatedUpdate()`, etc. |
| `src/lib/stores/traceStore.ts` | Added `handleMessageTraceUpdate()`, `getActiveRunId()`, `hasActiveRuns` derived store |
| `src/lib/components/chat/ChatMessage.svelte` | Integrated TracePanel with trace event processing |
| `src/lib/components/chat/TracePanel.svelte` | Collapsible panel with step progress, status icons, bilingual labels |

**Backend Changes:**
| File | Changes |
|------|---------|
| `mcp/services/traceEmitter.ts` | Added `toMessageUpdate()` and `streamAsMessageUpdates()` methods |
| `mcp/runMcpFlow.ts` | Yields trace events (run.created → step.created → run.completed) after RAG retrieval |

### Event Flow
```
ragIntegration.ts (retrieval)
    → traceEmitter (collects events)
    → runMcpFlow (yields MessageTraceUpdate)
    → textGeneration
    → +server.ts (SSE stream)
    → ChatMessage.svelte (processes updates)
    → traceStore (manages state)
    → TracePanel.svelte (renders UI)
```

### Key Methods Introduced
| Method | Location | Purpose |
|--------|----------|---------|
| `toMessageUpdate()` | traceEmitter.ts | Converts TraceEvent to MessageTraceUpdate |
| `handleMessageTraceUpdate()` | traceStore.ts | Dispatches trace updates to store actions |
| `isMessageTraceUpdate()` | messageUpdates.ts | Type guard for trace updates |
| `tryRetrieveRAGContext()` | ragIntegration.ts | Retrieves RAG context with trace events |
| `injectRAGContext()` | ragIntegration.ts | Injects retrieved context into preprompt |

### Environment Variables
```
DOCUMENT_RAG_ENABLED=true
EMBEDDING_SERVICE_URL=http://dicta-retrieval:5005
RERANKER_SERVICE_URL=http://dicta-retrieval:5006
RERANKER_THRESHOLD=0.7
MAX_CONTEXT_CHUNKS=10
CONTEXT_TOKEN_BUDGET=8000
MAX_CHUNK_TOKENS=800
```

### UI Features
- Collapsible panel with Melt-UI
- Real-time step progress (queued → running → done/error)
- Status icons (spinner, checkmark, X)
- Bilingual labels (Hebrew RTL / English LTR)
- Auto-collapse after 2 seconds when complete
- Nested step support

---

## Review - Podman Support (2025-12-30)

### Summary of Changes
- **Podman Integration**:
    - Created `start_podman.sh` and `stop_podman.sh` for seamless Podman usage.
    - Updated `deploy.py` to support `--podman` flag.
    - Abstracted container runtime (Docker vs Podman) and Compose commands.
    - Added support for `podman-compose` and `podman compose`.

### Kubernetes Support
- **Helm Charts**: Updated to include all new services (Docling, Retrieval, MCP, Frontend) and dependencies (MongoDB).
- **Deployment Tools**:
    - `kubernetes/update_deps.sh`: Simple script to update Helm chart dependencies.
    - `kubernetes/deploy_kubernetes.py`: User-friendly Python script for graceful deployment with interactive prompts and dry-run capabilities.

## Review - Deployment Automation (2025-12-30)

### Summary of Changes
- **Deployment Script (`deploy.py`)**:
    - Added automated checks for BAAI retrieval models (`bge-m3-f16.gguf` and `bge-reranker-v2-m3-q8_0.gguf`).
    - Implemented interactive download prompt if models are missing from local `.models` directory.
    - Integrated model verification into both standard and fallback deployment flows.
    - Aligned with `docker-compose.yml` volume bindings (`./.models:/app/models`).


## Review - Repository Maintenance (2025-12-30)

### Summary of Changes
- **Git Configuration**:
    - Updated `.gitignore` to exclude large model directories (`.models/`, `BAAI/`).
    - Fixed typo in `.gitignore` (`_pycache_` -> `__pycache__`).
    - Verified repo status to ensure large files are not committed.

## Review - Retrieval & Processing Integration (2025-12-28)

### Summary of Changes
- **Service Added**: `dicta-retrieval` (BAAI) for embeddings and reranking.
    - **Endpoints**:
        - Embeddings: `http://localhost:5005/v1/embeddings` (OpenAI compatible).
        - Reranking: `http://localhost:5006/v1/rerank`.
        - Health: `http://localhost:5005/health`, `http://localhost:5006/health`.
    - **Models**:
        - Embedding: `bge-m3-f16.gguf` (Multilingual/Hebrew support).
        - Reranking: `bge-reranker-v2-m3-q8_0.gguf`.
    - **Fixes**:
        - Resolved startup crashes by adding `libgomp1` and `libstdc++6`.
        - Fixed configuration initialization order in `main.py`.
        - Implemented single-input processing to bypass GGUF batch limitations.
        - Aligned output keys with Pydantic DTOs (`dense` vs `dense_vecs`).

- **Service Added**: `dicta-docling` (Quay.io/docling-project/docling-serve-cu128) for OCR and document processing.
    - **Configuration**:
        - Added `MAX_FILE_SIZE=10MB` and `MAX_NUM_PAGES=30` to `.env`.
        - Mounted Tesseract data (`Hebrew.traineddata`) and `UPLOADED_FILES` volume.
        - Configured `TESSDATA_PREFIX` for container-side OCR using mounted data.
    - **Deployment**:
        - Updated `deploy.py` to launch Docling first and stream verbose logs for model downloads.
        - Created `UPLOADED_FILES` directory for persistent uploads.

### Next Steps
- Verify Docling service health (`curl http://localhost:5001/health`).
- Test file upload and OCR processing.
- Validate end-to-end RAG pipeline using new embeddings and reranker.

## Overview

BricksLLM Enterprise AI Gateway with intelligent MCP tool orchestration for Hebrew-first chat interface.

---

## Completed Features

### Enterprise Tool Intelligence System

| Component | Status | Description |
| :--- | :--- | :--- |
| Tool Intelligence Registry | ✅ Complete | Central metadata for all MCP tools |
| Parameter Normalization | ✅ Complete | Automatic alias mapping & type coercion |
| Cascade Fallback System | ✅ Complete | Tries alternatives before failing |
| Graceful Error Handling | ✅ Complete | Hebrew messages with actionable guidance |
| Hebrew Intent Detection | ✅ Complete | 3,972 bidirectional expansion terms |
| Best-in-Class Selection | ✅ Complete | Picks optimal tool from similar options |
| Smart Timeout Management | ✅ Complete | 5 min research, 1 min quick tools |
| Tool Capability Awareness | ✅ Complete | Model describes and suggests tools |
| Loop Detection | ✅ Complete | Prevents infinite tool call loops |

### DataGov Enterprise Intelligence

| Component | Status | Description |
| :--- | :--- | :--- |
| Per-Dataset Schemas | ✅ Complete | 1,190 schema files in 20 categories |
| Semantic Field Mapping | ✅ Complete | "phone" → actual field name |
| Query Decomposition | ✅ Complete | Separates WHAT from WHERE |
| Hebrew Morphology | ✅ Complete | Prefix stripping, plural handling |
| Bidirectional Expansion | ✅ Complete | 22 domains, 3,972 terms |
| Auto-Aggregation | ✅ Complete | Detects "כמה" count queries |
| Subject-First Scoring | ✅ Complete | Prioritizes intent over location |
| Enterprise Fallback | ✅ Complete | Query rephrasing on fail |

---

## Statistics

| Metric | Value |
| :--- | :--- |
| Total Smart Methods | 30+ |
| DataGov Datasets Indexed | 1,187 |
| Individual Schema Files | 1,190 |
| Resources with Metadata | 1,960 |
| Bidirectional Expansion Terms | 3,972 |
| Dataset Tags Indexed | 1,527 |
| Title Keywords Indexed | 3,963 |
| **Total Searchable Terms** | ~9,500+ |
| Semantic Domains | 22 |
| Tool Categories | 6 |
| Fallback Chains | 3 |
| Error Categories | 7 |

---

## Architecture

```
User Request
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  Frontend (SvelteKit)                                   │
│  ├── runMcpFlow.ts (Core Orchestrator)                  │
│  ├── toolPrompt.ts (Reasoning-First Prompting)          │
│  ├── toolIntelligenceRegistry.ts (Tool Metadata)        │
│  ├── toolParameterRegistry.ts (Parameter Normalization) │
│  ├── toolInvocation.ts (Execution + Fallback)           │
│  └── toolFilter.ts (Intent Detection + Selection)       │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  MCP Servers                                            │
│  ├── DataGov (Israeli Government Data)                  │
│  │   ├── 1,190 schema files                             │
│  │   ├── 22 semantic domains                            │
│  │   └── Query decomposition + scoring                  │
│  ├── Perplexity (Research, Ask, Search, Reason)         │
│  ├── Tavily (Web Search)                                │
│  └── Others (Filesystem, Git, Docker, etc.)             │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  LLM Backend                                            │
│  └── DictaLM-3.0 (24B) via llama-server                 │
└─────────────────────────────────────────────────────────┘
```

---

## Fallback Chains

### Israeli Government Data

```
DataGov (priority: 95)
  └── Perplexity Search (priority: 90)
      └── Tavily Search (priority: 85)
```

### Deep Research

```
Perplexity Research (priority: 100)
  └── Perplexity Ask (priority: 95)
      └── Tavily Search (priority: 80)
```

### Quick Search

```
Tavily Search (priority: 90)
  └── Perplexity Search (priority: 85)
```

---

## Key Files

| File | Purpose |
| :--- | :--- |
| `frontend-huggingface/docs/smarter.md` | Full enterprise intelligence documentation |
| `frontend-huggingface/src/lib/server/textGeneration/mcp/toolIntelligenceRegistry.ts` | Tool metadata & capability awareness |
| `frontend-huggingface/src/lib/server/textGeneration/mcp/toolParameterRegistry.ts` | Parameter normalization |
| `frontend-huggingface/src/lib/server/textGeneration/mcp/toolInvocation.ts` | Execution & fallback |
| `datagov/server.py` | DataGov MCP server |
| `datagov/query_builder.py` | Query decomposition & scoring |
| `datagov/enterprise_expansions.py` | 22 domains, 3,972 terms |
| `datagov/schemas/` | 1,190 per-dataset schema files |

---

## Pending / Roadmap

| Feature | Priority | Status |
| :--- | :--- | :--- |
| Context Manager (Sliding Window) | Medium | Planned |
| Mem0 Integration | Low | Evaluated, not implemented |
| Additional MCP Servers | Low | As needed |

---

## Recent Changes (December 2025)

1. **Enterprise Tool Orchestration System** - Complete implementation
2. **Cascade Fallback System** - Automatic retry with alternative tools
3. **Graceful Error Handling** - Hebrew messages explaining WHAT/WHY/WHAT TO DO
4. **Tool Capability Awareness** - Model can describe and suggest its tools
5. **DataGov Enterprise Schemas** - Per-dataset schema files with semantic metadata
6. **Documentation** - Comprehensive `smarter.md` with 30+ methods documented
