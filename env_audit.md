# Env Audit Report

Generated: 2026-01-29

This report enumerates environment variables from `.env`, code, Dockerfiles, and `docker-compose.yml`.
Sensitive values are masked as `***` (presence only). Long values are truncated for readability.

## Summary

- Total variables: 249
- In .env: 196
- Referenced in code: 102
- Referenced in docker-compose: 72

## Missing From `.env` (Referenced Elsewhere)

- `APP_BASE` (sources: dockerfile-arg; locations: frontend-huggingface/Dockerfile:52; frontend-huggingface/Dockerfile:91)
- `BODY_SIZE_LIMIT` (sources: dockerfile-env; locations: frontend-huggingface/Dockerfile:54; frontend-huggingface/Dockerfile:95)
- `BRICKSLLM_SKIP_MODEL_FETCH` (sources: code, dockerfile-env; locations: frontend-huggingface/Dockerfile:55; frontend-huggingface/src/lib/server/models.ts:419)
- `CGO_ENABLED` (sources: dockerfile-env; locations: Dockerfile.datadog:2; Dockerfile.dev:2; Dockerfile.prod:2)
- `CONFIG_FILE_NAME` (sources: code; locations: internal/config/config.go:98)
- `DATAGOV_PRELOAD_BACKGROUND` (sources: code; locations: frontend-huggingface/src/hooks.server.ts:252)
- `DATAGOV_PRELOAD_ENABLED` (sources: code; locations: frontend-huggingface/src/hooks.server.ts:251)
- `DEBIAN_FRONTEND` (sources: dockerfile-env; locations: Dockerfile.BAAI:38; Dockerfile.BAAI:5)
- `DEBUG` (sources: code; locations: frontend-huggingface/src/lib/server/textGeneration/utils/debugLog.ts:3)
- `DEBUG_MCP` (sources: code; locations: frontend-huggingface/src/lib/server/textGeneration/mcp/serviceContainer.ts:198)
- `DOCKER_ENV` (sources: code; locations: docker-compose.yml:270; frontend-huggingface/src/hooks.server.ts:100; frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:27; frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:35; frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:45; frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:47; frontend-huggingface/src/lib/server/endpoints/preprocessMessages.ts:24; frontend-huggingface/src/lib/server/files/uploadFile.ts:13; frontend-huggingface/src/lib/server/mcp/rewriteMcpUrlForDocker.ts:7; frontend-huggingface/src/lib/server/textGeneration/mcp/toolInvocation.ts:78; frontend-huggingface/src/routes/api/mcp/__tests__/health.rewrite.test.ts:13; frontend-huggingface/src/routes/api/mcp/__tests__/health.rewrite.test.ts:18; frontend-huggingface/src/routes/api/mcp/__tests__/health.rewrite.test.ts:19; frontend-huggingface/src/routes/api/mcp/__tests__/health.rewrite.test.ts:25; frontend-huggingface/src/routes/api/mcp/__tests__/health.rewrite.test.ts:7; frontend-huggingface/src/routes/api/mcp/__tests__/health.rewrite.test.ts:8; frontend-huggingface/src/routes/api/memory/books/+server.ts:19)
- `EMBEDDING_DIMENSION` (sources: code; locations: frontend-huggingface/src/routes/api/memory/diagnostics/+server.ts:383)
- `EMBEDDING_MODEL` (sources: code; locations: frontend-huggingface/src/routes/api/memory/diagnostics/+server.ts:384)
- `EMBEDDING_URL` (sources: code; locations: frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-private.ts:9)
- `ENABLE_CONFIG_MANAGER` (sources: code; locations: docker-compose.yml:273; frontend-huggingface/src/lib/server/config.ts:42)
- `GIT_SHA` (sources: code; locations: frontend-huggingface/src/routes/api/system/version/+server.ts:32)
- `GOOS` (sources: dockerfile-env; locations: Dockerfile.datadog:3; Dockerfile.dev:3; Dockerfile.prod:3)
- `HF_TOKEN` (sources: code, compose; locations: docker-compose.yml:269; frontend-huggingface/src/hooks.server.ts:314)
- `HOME` (sources: code, dockerfile-env; locations: frontend-huggingface/Dockerfile:15; frontend-huggingface/src/routes/api/mcp/scan/+server.ts:64)
- `INCLUDE_DB` (sources: dockerfile-env, dockerfile-arg; locations: frontend-huggingface/Dockerfile:3; frontend-huggingface/Dockerfile:87; frontend-huggingface/Dockerfile:88)
- `MCP_DEBUG` (sources: code; locations: frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts:260)
- `MCP_TOOL_PARSE_WORKERS` (sources: code; locations: frontend-huggingface/src/lib/server/textGeneration/mcp/__tests__/unit/workerPool.test.ts:25; frontend-huggingface/src/lib/server/textGeneration/mcp/__tests__/unit/workerPool.test.ts:39; frontend-huggingface/src/lib/server/textGeneration/mcp/workerPool.ts:54)
- `MCP_TOOL_PARSE_WORKER_PATH` (sources: code; locations: frontend-huggingface/src/lib/server/textGeneration/mcp/workerPool.ts:46)
- `MEMORY_BENCHMARK_MODE` (sources: code; locations: frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:8)
- `MEMORY_ENABLED` (sources: code; locations: frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-private.ts:11)
- `MOCK_EMBEDDINGS` (sources: code; locations: frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:13)
- `MOCK_LLM` (sources: code; locations: frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:12)
- `MONGODB_URI` (sources: code; locations: frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:17)
- `PATH` (sources: dockerfile-env; locations: Dockerfile.mcpo:27)
- `POETRY_INSTALL_ARGS` (sources: dockerfile-arg; locations: Dockerfile.BAAI:4; docker-compose.yml:419)
- `POETRY_NO_INTERACTION` (sources: dockerfile-env; locations: Dockerfile.BAAI:20)
- `PORT` (sources: code; locations: docker-compose.yml:349; docker-compose.yml:489; frontend-huggingface/src/lib/server/adminToken.ts:40; frontend-huggingface/src/lib/server/adminToken.ts:41; frontend-huggingface/vite.config.ts:35)
- `PUBLIC_API_URL` (sources: code; locations: frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-public.ts:8)
- `PUBLIC_APP_ASSETS` (sources: code; locations: docker-compose.yml:261; frontend-huggingface/src/lib/components/UpdateBanner.svelte:18; frontend-huggingface/src/lib/stores/mcpServers.ts:19; frontend-huggingface/src/lib/stores/terminalMode.ts:10; frontend-huggingface/src/lib/utils/storageMigration.ts:10)
- `PUBLIC_APP_COLOR` (sources: dockerfile-arg; locations: docker-compose.yml:262; frontend-huggingface/Dockerfile:53; frontend-huggingface/Dockerfile:92)
- `PUBLIC_APP_NAME` (sources: code; locations: docker-compose.yml:260; frontend-huggingface/src/lib/components/UpdateBanner.svelte:18; frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-public.ts:7; frontend-huggingface/src/lib/stores/mcpServers.ts:19; frontend-huggingface/src/lib/stores/terminalMode.ts:10; frontend-huggingface/src/lib/utils/storageMigration.ts:10)
- `PUBLIC_COMMIT_SHA` (sources: dockerfile-env, dockerfile-arg; locations: frontend-huggingface/Dockerfile:93; frontend-huggingface/Dockerfile:94)
- `PUBLIC_VERSION` (sources: code; locations: frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-public.ts:9)
- `QDRANT_API_KEY` (sources: code; locations: frontend-huggingface/scripts/migrate-books-to-documents.ts:19; frontend-huggingface/src/hooks.server.ts:95)
- `QDRANT_COLLECTION_NAME` (sources: code; locations: frontend-huggingface/scripts/migrate-books-to-documents.ts:20)
- `QDRANT_GRPC_PORT` (sources: compose; locations: docker-compose.yml:64)
- `QDRANT_HTTPS` (sources: code; locations: frontend-huggingface/src/hooks.server.ts:94; frontend-huggingface/src/lib/server/memory/featureFlags.ts:150)
- `QDRANT_URL` (sources: code; locations: frontend-huggingface/scripts/migrate-books-to-documents.ts:18; frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-private.ts:8; frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:18)
- `RERANKER_URL` (sources: code; locations: frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-private.ts:10; frontend-huggingface/src/routes/api/memory/health/+server.ts:175)
- `SECRET_CONFIG` (sources: code; locations: frontend-huggingface/scripts/updateLocalEnv.ts:32)
- `SILENT_TESTS` (sources: code; locations: frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:29)
- `SWAGGER_HOST_PORT` (sources: compose; locations: docker-compose.yml:249)
- `TEST_MONGODB_URI` (sources: code; locations: frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:16)
- `TEST_QDRANT_URL` (sources: code; locations: frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:18)
- `TEST_REDIS_URL` (sources: code; locations: frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:19)
- `UPLOADS_DIR` (sources: code; locations: frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:26; frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:34; frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:40; frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:42; frontend-huggingface/src/lib/server/endpoints/preprocessMessages.ts:23; frontend-huggingface/src/lib/server/files/uploadFile.ts:12; frontend-huggingface/src/lib/server/textGeneration/mcp/toolInvocation.ts:77; frontend-huggingface/src/routes/api/memory/books/+server.ts:18)
- `VIRTUAL_ENV` (sources: dockerfile-env; locations: Dockerfile.mcpo:25)
- `VITEST_BROWSER` (sources: code; locations: frontend-huggingface/vite.config.ts:9)

## Build-Time and Image-Level Variables (Dockerfiles)

### `Dockerfile.BAAI`
**ARGs:**
- `POETRY_INSTALL_ARGS` default: ``
**ENV:**
- `DEBIAN_FRONTEND` = `noninteractive`
- `POETRY_NO_INTERACTION` = `1`

### `Dockerfile.datadog`
**ENV:**
- `CGO_ENABLED` = `0`
- `GOOS` = `linux`

### `Dockerfile.dev`
**ENV:**
- `CGO_ENABLED` = `0`
- `GOOS` = `linux`

### `Dockerfile.mcpo`
**ENV:**
- `VIRTUAL_ENV` = `/venv`
- `PATH` = `$VIRTUAL_ENV/bin:$PATH`

### `Dockerfile.prod`
**ENV:**
- `CGO_ENABLED` = `0`
- `GOOS` = `linux`

### `frontend-huggingface/Dockerfile`
**ARGs:**
- `INCLUDE_DB` default: `false`
- `APP_BASE` default: ``
- `PUBLIC_APP_COLOR` default: ``
- `PUBLIC_COMMIT_SHA` default: ``
**ENV:**
- `HOME` = `/home/user`
- `BODY_SIZE_LIMIT` = `15728640`
- `BRICKSLLM_SKIP_MODEL_FETCH` = `true`
- `MONGODB_URL` = `mongodb://localhost:27017`
- `INCLUDE_DB` = `${INCLUDE_DB}`
- `PUBLIC_COMMIT_SHA` = `${PUBLIC_COMMIT_SHA}`

## Per-Service Environment Variables (docker-compose)

### `redis`
- No explicit environment variables set.

**Interpolated vars used in service config (ports/volumes/etc):**
- `REDIS_HOST_PORT` locations: docker-compose.yml:7
- `REDIS_PASSWORD` locations: docker-compose.yml:202; docker-compose.yml:8

### `mongo`
- No explicit environment variables set.

### `mongo-compass`

| Variable | Value/Default | Purpose | Latency Impact | Variants | Source | Locations |
|---|---|---|---|---|---|---|
| `CW_HOST` | `0.0.0.0` | Application configuration. | none (connectivity/credentials only) | string | compose-env | docker-compose.yml:49 |
| `CW_MONGO_URI` | `mongodb://mongo:27017/chat-ui` | Application configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:51 |
| `CW_PORT` | `8080` | Service port mapping. | none (connectivity/credentials only) | integer port (1-65535) | compose-env | docker-compose.yml:50 |

### `qdrant`

| Variable | Value/Default | Purpose | Latency Impact | Variants | Source | Locations |
|---|---|---|---|---|---|---|
| `QDRANT__LOG_LEVEL` | `INFO` | Memory system / Qdrant / DataGov configuration. | low (logging overhead) | enum/string | compose-env | docker-compose.yml:70 |
| `QDRANT__SERVICE__GRPC_PORT` | `6334` | Memory system / Qdrant / DataGov configuration. | none (connectivity/credentials only) | integer port (1-65535) | compose-env | docker-compose.yml:68 |
| `QDRANT__SERVICE__HTTP_PORT` | `6333` | Memory system / Qdrant / DataGov configuration. | none (connectivity/credentials only) | integer port (1-65535) | compose-env | docker-compose.yml:69 |

**Interpolated vars used in service config (ports/volumes/etc):**
- `QDRANT_GRPC_PORT` locations: docker-compose.yml:64
- `QDRANT_PORT` locations: docker-compose.yml:297; docker-compose.yml:63

### `postgresql`

| Variable | Value/Default | Purpose | Latency Impact | Variants | Source | Locations |
|---|---|---|---|---|---|---|
| `PGDATA` | `/var/lib/postgresql/data/pgdata` | Application configuration. | low (indirect/feature gating) | string | compose-env |  |
| `POSTGRES_DB` | `${POSTGRES_DB}` | PostgreSQL configuration (credentials, host, ports, timeouts). | low (indirect/feature gating) | string | compose-env | docker-compose.yml:97 |
| `POSTGRES_PASSWORD` | `***` | PostgreSQL configuration (credentials, host, ports, timeouts). | none (connectivity/credentials only) | opaque secret string | compose-env | docker-compose.yml:96 |
| `POSTGRES_USER` | `${POSTGRES_USER}` | PostgreSQL configuration (credentials, host, ports, timeouts). | low (indirect/feature gating) | string | compose-env | docker-compose.yml:95 |

**Interpolated vars used in service config (ports/volumes/etc):**
- `POSTGRESQL_DB` locations: docker-compose.yml:109; docker-compose.yml:195; docker-compose.yml:97
- `POSTGRESQL_HOST_PORT` locations: docker-compose.yml:100
- `POSTGRESQL_PASSWORD` locations: docker-compose.yml:197; docker-compose.yml:96
- `POSTGRESQL_USERNAME` locations: docker-compose.yml:109; docker-compose.yml:196; docker-compose.yml:95

### `llama-server`

| Variable | Value/Default | Purpose | Latency Impact | Variants | Source | Locations |
|---|---|---|---|---|---|---|
| `CUDA_VISIBLE_DEVICES` | `${CUDA_VISIBLE_DEVICES}` | Application configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:135 |
| `SYSTEM_PROMPT` | `${SYSTEM_PROMPT}` | Model generation/sampling configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:136 |

**Interpolated vars used in service config (ports/volumes/etc):**
- `CONTEXT_SIZE` locations: docker-compose.yml:150
- `GPU_COUNT` locations: docker-compose.yml:176
- `GPU_DEVICE_IDS` locations: docker-compose.yml:135
- `HF_FILE` locations: docker-compose.yml:148
- `LLAMA_HOST_PORT` locations: docker-compose.yml:138
- `LLAMA_IMAGE` locations: docker-compose.yml:123
- `LOCAL_MODEL_PATH` locations: docker-compose.yml:140
- `NUM_PREDICT` locations: docker-compose.yml:164
- `N_GPU_LAYERS` locations: docker-compose.yml:156
- `REPEAT_PENALTY` locations: docker-compose.yml:162
- `TEMPERATURE` locations: docker-compose.yml:158
- `TOP_P` locations: docker-compose.yml:160

### `bricksllm`

| Variable | Value/Default | Purpose | Latency Impact | Variants | Source | Locations |
|---|---|---|---|---|---|---|
| `AMAZON_REGION` | `${AMAZON_REGION}` | Application configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:208 |
| `AMAZON_SECRET_ARN` | `***` | Application configuration. | none (connectivity/credentials only) | opaque secret string | compose-env | docker-compose.yml:207 |
| `IN_MEMORY_DB_UPDATE_INTERVAL` | `${IN_MEMORY_DB_UPDATE_INTERVAL}` | Application configuration. | medium-high (adds retrieval/processing work) | duration (e.g., 500ms, 2s, 1m) | compose-env | docker-compose.yml:205 |
| `NUMBER_OF_EVENT_MESSAGE_CONSUMERS` | `${NUMBER_OF_EVENT_MESSAGE_CONSUMERS}` | Application configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:210 |
| `POSTGRESQL_DB_NAME` | `${POSTGRESQL_DB_NAME}` | PostgreSQL configuration (credentials, host, ports, timeouts). | low (indirect/feature gating) | string | compose-env | docker-compose.yml:195 |
| `POSTGRESQL_HOSTS` | `postgresql` | PostgreSQL configuration (credentials, host, ports, timeouts). | none (connectivity/credentials only) | string | compose-env |  |
| `POSTGRESQL_PASSWORD` | `***` | PostgreSQL configuration (credentials, host, ports, timeouts). | none (connectivity/credentials only) | opaque secret string | compose-env | docker-compose.yml:197; docker-compose.yml:96 |
| `POSTGRESQL_PORT` | `5432` | PostgreSQL configuration (credentials, host, ports, timeouts). | none (connectivity/credentials only) | integer port (1-65535) | compose-env |  |
| `POSTGRESQL_READ_TIME_OUT` | `${POSTGRESQL_READ_TIME_OUT}` | PostgreSQL configuration (credentials, host, ports, timeouts). | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | compose-env | docker-compose.yml:198 |
| `POSTGRESQL_USERNAME` | `${POSTGRESQL_USERNAME}` | PostgreSQL configuration (credentials, host, ports, timeouts). | low (indirect/feature gating) | string | compose-env | docker-compose.yml:109; docker-compose.yml:196; docker-compose.yml:95 |
| `POSTGRESQL_WRITE_TIME_OUT` | `${POSTGRESQL_WRITE_TIME_OUT}` | PostgreSQL configuration (credentials, host, ports, timeouts). | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | compose-env | docker-compose.yml:199 |
| `PROXY_TIMEOUT` | `${PROXY_TIMEOUT}` | Application configuration. | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | compose-env | docker-compose.yml:209 |
| `REDIS_HOSTS` | `redis` | Redis configuration (credentials, host, ports, timeouts). | none (connectivity/credentials only) | string | compose-env |  |
| `REDIS_PASSWORD` | `***` | Redis configuration (credentials, host, ports, timeouts). | none (connectivity/credentials only) | opaque secret string | compose-env | docker-compose.yml:202; docker-compose.yml:8 |
| `REDIS_PORT` | `6379` | Redis configuration (credentials, host, ports, timeouts). | none (connectivity/credentials only) | integer port (1-65535) | compose-env |  |
| `REDIS_READ_TIME_OUT` | `${REDIS_READ_TIME_OUT}` | Redis configuration (credentials, host, ports, timeouts). | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | compose-env | docker-compose.yml:203 |
| `REDIS_WRITE_TIME_OUT` | `${REDIS_WRITE_TIME_OUT}` | Redis configuration (credentials, host, ports, timeouts). | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | compose-env | docker-compose.yml:204 |
| `STATS_PROVIDER` | `${STATS_PROVIDER}` | Application configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:206 |

**Interpolated vars used in service config (ports/volumes/etc):**
- `BRICKSLLM_ADMIN_PORT` locations: docker-compose.yml:212
- `BRICKSLLM_MODE` locations: docker-compose.yml:238
- `BRICKSLLM_PROXY_PORT` locations: docker-compose.yml:213
- `POSTGRESQL_DB` locations: docker-compose.yml:109; docker-compose.yml:195; docker-compose.yml:97

### `swagger-ui`

| Variable | Value/Default | Purpose | Latency Impact | Variants | Source | Locations |
|---|---|---|---|---|---|---|
| `SWAGGER_JSON` | `/docs/admin.yaml` | Application configuration. | low (indirect/feature gating) | string | compose-env |  |

**Interpolated vars used in service config (ports/volumes/etc):**
- `SWAGGER_HOST_PORT` locations: docker-compose.yml:249

### `frontend-ui`

| Variable | Value/Default | Purpose | Latency Impact | Variants | Source | Locations |
|---|---|---|---|---|---|---|
| `CONTEXT_TOKEN_BUDGET` | `***` | RAG / document retrieval pipeline configuration. | none (connectivity/credentials only) | opaque secret string | compose-env | docker-compose.yml:286 |
| `DOCKER_ENV` | `true` | Docker resource or healthcheck configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:270 |
| `DOCLING_SERVER_URL` | `http://docling:5001` | Docling document extraction configuration. | none (connectivity/credentials only) | URL (http/https) | compose-env | docker-compose.yml:283 |
| `DOCUMENT_RAG_ENABLED` | `true` | RAG / document retrieval pipeline configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | compose-env | docker-compose.yml:280 |
| `EMBEDDING_SERVICE_URL` | `http://dicta-retrieval:5005` | RAG / document retrieval pipeline configuration. | medium-high (adds retrieval/processing work) | URL (http/https) | compose-env | docker-compose.yml:281 |
| `ENABLE_CONFIG_MANAGER` | `false` | Application configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:273 |
| `HF_TOKEN` | `***` | Application configuration. | none (connectivity/credentials only) | opaque secret string | compose-env | docker-compose.yml:269 |
| `LLM_ROUTER_ENABLE_TOOLS` | `true` | Application configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:275 |
| `LLM_ROUTER_TOOLS_MODEL` | `DictaLM-3.0-24B-Thinking.i1-Q4_K_M.gguf` | Application configuration. | low (indirect/feature gating) | enum/string | compose-env | docker-compose.yml:276 |
| `MAX_CONTEXT_CHUNKS` | `10` | RAG / document retrieval pipeline configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:285 |
| `MCP_SERVERS` | `[{"name":"Everything","url":"http://mcp-sse-proxy:3100/everything/sse"},{"nam...` | MCP tool system configuration (tool filtering, security, debugging). | low (indirect/feature gating) | CSV list or JSON array | compose-env |  |
| `MEMORY_BM25_ENABLED` | `${MEMORY_BM25_ENABLED}` | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | compose-env | docker-compose.yml:291 |
| `MEMORY_INITIAL_SCORE` | `${MEMORY_INITIAL_SCORE}` | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | string | compose-env | docker-compose.yml:300 |
| `MEMORY_LLM_BASE_URL` | `http://bricksllm:8002/v1` | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | URL (http/https) | compose-env | docker-compose.yml:305 |
| `MEMORY_LLM_MODEL` | `${MEMORY_LLM_MODEL}` | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | enum/string | compose-env | docker-compose.yml:306 |
| `MEMORY_NEGATIVE_PENALTY` | `${MEMORY_NEGATIVE_PENALTY}` | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | compose-env | docker-compose.yml:302 |
| `MEMORY_OUTCOME_ENABLED` | `${MEMORY_OUTCOME_ENABLED}` | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | compose-env | docker-compose.yml:294 |
| `MEMORY_POSITIVE_BOOST` | `${MEMORY_POSITIVE_BOOST}` | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | string | compose-env | docker-compose.yml:301 |
| `MEMORY_PROMOTION_ENABLED` | `${MEMORY_PROMOTION_ENABLED}` | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | compose-env | docker-compose.yml:295 |
| `MEMORY_QDRANT_ENABLED` | `${MEMORY_QDRANT_ENABLED}` | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | compose-env | docker-compose.yml:290 |
| `MEMORY_RERANK_ENABLED` | `${MEMORY_RERANK_ENABLED}` | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | compose-env | docker-compose.yml:293 |
| `MEMORY_SEARCH_LIMIT` | `${MEMORY_SEARCH_LIMIT}` | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | compose-env | docker-compose.yml:304 |
| `MEMORY_SYSTEM_ENABLED` | `${MEMORY_SYSTEM_ENABLED}` | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | compose-env | docker-compose.yml:288 |
| `MEMORY_TOP_K` | `${MEMORY_TOP_K}` | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | compose-env | docker-compose.yml:303 |
| `MEMORY_UI_ENABLED` | `${MEMORY_UI_ENABLED}` | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | compose-env | docker-compose.yml:289 |
| `MODELS` | `[{"id":"DictaLM-3.0-24B-Thinking.i1-Q4_K_M.gguf","name":"DictaLM 3.0 24B","en...` | Application configuration. | low (indirect/feature gating) | enum/string | compose-env |  |
| `MONGODB_DB_NAME` | `chat-ui` | Application configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:267 |
| `MONGODB_DIRECT_CONNECTION` | `false` | Application configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:268 |
| `MONGODB_URL` | `mongodb://mongo:27017/chat-ui` | Service URL / endpoint configuration. | none (connectivity/credentials only) | URL (http/https) | compose-env | docker-compose.yml:266 |
| `OPENAI_API_KEY` | `***` | Application configuration. | none (connectivity/credentials only) | opaque secret string | compose-env | docker-compose.yml:272 |
| `OPENAI_BASE_URL` | `http://bricksllm:8002/api/custom/providers/llama-cpp-root` | Service URL / endpoint configuration. | none (connectivity/credentials only) | URL (http/https) | compose-env | docker-compose.yml:271 |
| `ORIGIN` | `http://localhost:8004` | Application configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:274 |
| `PUBLIC_APP_ASSETS` | `chatui` | Frontend UI configuration and public branding. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:261 |
| `PUBLIC_APP_COLOR` | `blue` | Frontend UI configuration and public branding. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:262 |
| `PUBLIC_APP_DATA_SHARING` | `1` | Frontend UI configuration and public branding. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:264 |
| `PUBLIC_APP_DESCRIPTION` | `A chat interface for DictaLM` | Frontend UI configuration and public branding. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:263 |
| `PUBLIC_APP_DISCLAIMER` | `0` | Frontend UI configuration and public branding. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:265 |
| `PUBLIC_APP_NAME` | `DictaLM Chat` | Frontend UI configuration and public branding. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:260 |
| `QDRANT_COLLECTION` | `${QDRANT_COLLECTION}` | Memory system / Qdrant / DataGov configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:298 |
| `QDRANT_HOST` | `qdrant` | Memory system / Qdrant / DataGov configuration. | none (connectivity/credentials only) | string | compose-env | docker-compose.yml:296 |
| `QDRANT_PORT` | `6333` | Memory system / Qdrant / DataGov configuration. | none (connectivity/credentials only) | integer port (1-65535) | compose-env | docker-compose.yml:297; docker-compose.yml:63 |
| `QDRANT_VECTOR_SIZE` | `${QDRANT_VECTOR_SIZE}` | Memory system / Qdrant / DataGov configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:299 |
| `RERANKER_SERVICE_URL` | `http://dicta-retrieval:5006/v1/rerank` | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | URL (http/https) | compose-env | docker-compose.yml:282 |
| `RERANKER_THRESHOLD` | `0.7` | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | string | compose-env | docker-compose.yml:284 |

**Interpolated vars used in service config (ports/volumes/etc):**
- `BRICKSLLM_API_KEY` locations: docker-compose.yml:272

### `mcp-sse-proxy`

| Variable | Value/Default | Purpose | Latency Impact | Variants | Source | Locations |
|---|---|---|---|---|---|---|
| `CONFIG_PATH` | `/app/config/servers.json` | Application configuration. | low (indirect/feature gating) | filesystem path | compose-env | docker-compose.yml:350 |
| `DATAGOV_PROXY_URL` | `${DATAGOV_PROXY_URL}` | Memory system / Qdrant / DataGov configuration. | none (connectivity/credentials only) | URL (http/https) | compose-env | docker-compose.yml:356 |
| `NODE_ENV` | `production` | Runtime mode or logging configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:351 |
| `PERPLEXITY_API_KEY` | `***` | Application configuration. | none (connectivity/credentials only) | opaque secret string | compose-env | docker-compose.yml:353 |
| `PORT` | `3100` | Application configuration. | none (connectivity/credentials only) | string | compose-env | docker-compose.yml:349; docker-compose.yml:489 |
| `SMITHERY_API_KEY` | `***` | Application configuration. | none (connectivity/credentials only) | opaque secret string | compose-env | docker-compose.yml:355 |
| `TAVILY_API_KEY` | `***` | Application configuration. | none (connectivity/credentials only) | opaque secret string | compose-env | docker-compose.yml:354 |

**Interpolated vars used in service config (ports/volumes/etc):**
- `TAVILIY_SEARCH_API_KEY` locations: docker-compose.yml:354

### `docling`
- `env_file`: .env (all variables in those files are injected)

| Variable | Value/Default | Purpose | Latency Impact | Variants | Source | Locations |
|---|---|---|---|---|---|---|
| `DOCLING_SERVE_ENABLE_REMOTE_SERVICES` | `true` | Docling document extraction configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:391 |
| `DOCLING_SERVE_ENABLE_UI` | `true` | Docling document extraction configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:389 |
| `DOCLING_SERVE_MAX_SYNC_WAIT` | `1800` | Docling document extraction configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:399 |
| `DOCLING_SERVE_TIMEOUT` | `3600` | Docling document extraction configuration. | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | compose-env | docker-compose.yml:400 |
| `GRADIO_MCP_SERVER` | `true` | Application configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:403 |
| `MAX_FILE_SIZE` | `${MAX_FILE_SIZE}` | Docling document extraction configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:404 |
| `MAX_NUM_PAGES` | `${MAX_NUM_PAGES}` | Docling document extraction configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:405 |
| `MKL_NUM_THREADS` | `24` | Application configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:393 |
| `NUMBA_NUM_THREADS` | `24` | Application configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:395 |
| `NVIDIA_VISIBLE_DEVICES` | `all` | Application configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:390 |
| `OMP_NUM_THREADS` | `24` | Application configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:392; docker-compose.yml:499 |
| `OPENBLAS_NUM_THREADS` | `24` | Application configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:394 |
| `PYTORCH_NUM_THREADS` | `24` | Application configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:396 |
| `TESSDATA_PREFIX` | `/root/.cache/docling/tessdata` | Docling document extraction configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:406 |
| `TF_NUM_INTEROP_THREADS` | `2` | Application configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:398 |
| `TF_NUM_INTRAOP_THREADS` | `24` | Application configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:397 |
| `UVICORN_TIMEOUT_GRACEFUL_SHUTDOWN` | `30` | Application configuration. | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | compose-env | docker-compose.yml:402 |
| `UVICORN_TIMEOUT_KEEP_ALIVE` | `65` | Application configuration. | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | compose-env | docker-compose.yml:401 |

### `dicta-retrieval`

| Variable | Value/Default | Purpose | Latency Impact | Variants | Source | Locations |
|---|---|---|---|---|---|---|
| `DEVICE` | `cuda` | Application configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:427; docker-compose.yml:491 |
| `EMBEDDINGS_MODEL_BATCH_SIZE` | `${EMBEDDINGS_MODEL_BATCH_SIZE}` | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | compose-env | docker-compose.yml:433 |
| `EMBEDDINGS_MODEL_CTX_SIZE` | `${EMBEDDINGS_MODEL_CTX_SIZE}` | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | compose-env | docker-compose.yml:432 |
| `EMBEDDINGS_MODEL_MAIN_GPU` | `${EMBEDDINGS_MODEL_MAIN_GPU}` | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | enum/string | compose-env | docker-compose.yml:438 |
| `EMBEDDINGS_MODEL_N_GPU_LAYERS` | `${EMBEDDINGS_MODEL_N_GPU_LAYERS}` | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | compose-env | docker-compose.yml:437 |
| `EMBEDDINGS_MODEL_THREADS` | `${EMBEDDINGS_MODEL_THREADS}` | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | compose-env | docker-compose.yml:436 |
| `EMBEDDINGS_MODEL_UBATCH_SIZE` | `${EMBEDDINGS_MODEL_UBATCH_SIZE}` | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | compose-env | docker-compose.yml:435 |
| `EMBEDDING_MODEL_NAME` | `${EMBEDDING_MODEL_NAME}` | Application configuration. | medium-high (adds retrieval/processing work) | enum/string | compose-env | docker-compose.yml:430 |
| `FASTAPI_HOST` | `0.0.0.0` | Application configuration. | none (connectivity/credentials only) | string | compose-env | docker-compose.yml:423 |
| `FASTAPI_PORT` | `5005` | Service port mapping. | none (connectivity/credentials only) | integer port (1-65535) | compose-env | docker-compose.yml:424 |
| `LOG_LEVEL` | `INFO` | Runtime mode or logging configuration. | low (logging overhead) | enum/string | compose-env | docker-compose.yml:426; docker-compose.yml:496 |
| `MODEL_IDLE_TIMEOUT` | `60` | Application configuration. | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | compose-env | docker-compose.yml:428 |
| `RERANKER_MODEL_BATCH_SIZE` | `${RERANKER_MODEL_BATCH_SIZE}` | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | compose-env | docker-compose.yml:440 |
| `RERANKER_MODEL_CTX_SIZE` | `${RERANKER_MODEL_CTX_SIZE}` | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | compose-env | docker-compose.yml:439 |
| `RERANKER_MODEL_MAIN_GPU` | `${RERANKER_MODEL_MAIN_GPU}` | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | enum/string | compose-env | docker-compose.yml:446 |
| `RERANKER_MODEL_NAME` | `${RERANKER_MODEL_NAME}` | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | enum/string | compose-env | docker-compose.yml:431 |
| `RERANKER_MODEL_N_GPU_LAYERS` | `${RERANKER_MODEL_N_GPU_LAYERS}` | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | compose-env | docker-compose.yml:445 |
| `RERANKER_MODEL_THREADS` | `${RERANKER_MODEL_THREADS}` | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | compose-env | docker-compose.yml:444 |
| `RERANKER_MODEL_UBATCH_SIZE` | `${RERANKER_MODEL_UBATCH_SIZE}` | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | compose-env | docker-compose.yml:443 |
| `RERANKING_PORT` | `5006` | Service port mapping. | medium-high (adds retrieval/processing work) | integer port (1-65535) | compose-env | docker-compose.yml:425 |
| `USE_FP16` | `true` | Application configuration. | low (indirect/feature gating) | boolean: true|false | compose-env | docker-compose.yml:429 |

**Interpolated vars used in service config (ports/volumes/etc):**
- `EMBEDDINGS_MODEL_PATH` locations: docker-compose.yml:430

### `ner-service`

| Variable | Value/Default | Purpose | Latency Impact | Variants | Source | Locations |
|---|---|---|---|---|---|---|
| `DEVICE` | `cuda` | Application configuration. | low (indirect/feature gating) | string | compose-env | docker-compose.yml:427; docker-compose.yml:491 |
| `LOG_LEVEL` | `INFO` | Runtime mode or logging configuration. | low (logging overhead) | enum/string | compose-env | docker-compose.yml:426; docker-compose.yml:496 |
| `MAX_BATCH_SIZE` | `32` | Application configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:492 |
| `MAX_SEQUENCE_LENGTH` | `512` | Application configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:493 |
| `MODEL_NAME` | `dicta-il/dictabert-ner` | Application configuration. | low (indirect/feature gating) | enum/string | compose-env | docker-compose.yml:490 |
| `NER_MIN_CONFIDENCE` | `0.85` | NER service configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:495 |
| `OMP_NUM_THREADS` | `4` | Application configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:392; docker-compose.yml:499 |
| `PORT` | `5007` | Application configuration. | none (connectivity/credentials only) | string | compose-env | docker-compose.yml:349; docker-compose.yml:489 |
| `TIMEOUT_SECONDS` | `2` | Application configuration. | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | compose-env | docker-compose.yml:494 |
| `TORCH_NUM_THREADS` | `4` | Application configuration. | low (indirect/feature gating) | number (int/float depending on variable) | compose-env | docker-compose.yml:498 |

## Full Variable Index (All Sources)

| Variable | Default | Purpose | Latency Impact | Variants | Sources | Services | Locations |
|---|---|---|---|---|---|---|---|
| `AMAZON_REGION` | `(unset)` (env) | Application configuration. | low (indirect/feature gating) | string | env, compose | bricksllm | .env:228; docker-compose.yml:208 |
| `AMAZON_SECRET_ARN` | `(empty)` (env) | Application configuration. | none (connectivity/credentials only) | opaque secret string | env, compose | bricksllm | .env:227; docker-compose.yml:207 |
| `APP_BASE` | `(unset)` (docker-arg-default) | Application configuration. | low (indirect/feature gating) | string | dockerfile-arg |  | frontend-huggingface/Dockerfile:52; frontend-huggingface/Dockerfile:91 |
| `BODY_SIZE_LIMIT` | `15728640` (docker-env) | Application configuration. | low (indirect/feature gating) | number (int/float depending on variable) | dockerfile-env |  | frontend-huggingface/Dockerfile:54; frontend-huggingface/Dockerfile:95 |
| `BRICKSLLM_ADMIN_PORT` | `8001` (env) | Gateway service configuration. | none (connectivity/credentials only) | integer port (1-65535) | env, compose | bricksllm | .env:220; docker-compose.yml:212 |
| `BRICKSLLM_API_KEY` | `(empty)` (env) | Gateway service configuration. | none (connectivity/credentials only) | opaque secret string | env, compose | frontend-ui | .env:222; docker-compose.yml:272 |
| `BRICKSLLM_MODE` | `production` (env) | Gateway service configuration. | low (indirect/feature gating) | enum/string | env, compose | bricksllm | .env:219; docker-compose.yml:238 |
| `BRICKSLLM_PROXY_PORT` | `8002` (env) | Gateway service configuration. | none (connectivity/credentials only) | integer port (1-65535) | env, compose | bricksllm | .env:221; docker-compose.yml:213 |
| `BRICKSLLM_SKIP_MODEL_FETCH` | `true` (docker-env) | Gateway service configuration. | low (indirect/feature gating) | boolean: true|false | code, dockerfile-env |  | frontend-huggingface/Dockerfile:55; frontend-huggingface/src/lib/server/models.ts:419 |
| `CACHE_TYPE_K` | `q8_0               # K cache quantization` (env) | Model runtime performance and GPU/CPU configuration. | high (inference/runtime performance) | string | env |  | .env:91 |
| `CACHE_TYPE_V` | `q8_0               # V cache quantization` (env) | Model runtime performance and GPU/CPU configuration. | high (inference/runtime performance) | string | env |  | .env:92 |
| `CGO_ENABLED` | `0` (docker-env) | Application configuration. | low (indirect/feature gating) | boolean: true|false | dockerfile-env |  | Dockerfile.datadog:2; Dockerfile.dev:2; Dockerfile.prod:2 |
| `CONFIG_FILE_NAME` | `(unset)` (unset) | Application configuration. | low (indirect/feature gating) | string | code |  | internal/config/config.go:98 |
| `CONTENT_EXTRACTION_ENGINE` | `docling` (env) | Docling document extraction configuration. | low (indirect/feature gating) | enum/string | env |  | .env:302 |
| `CONTEXTUAL_EMBEDDING_ENABLED` | `true` (env) | Application configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env, code |  | .env:437; frontend-huggingface/src/lib/server/memory/featureFlags.ts:132 |
| `CONTEXT_SIZE` | `32768              # 32K for proper MCP tool usage` (env) | Model generation/sampling configuration. | high (inference/runtime performance) | number (int/float depending on variable) | env, compose | llama-server | .env:42; docker-compose.yml:150 |
| `CONTEXT_TOKEN_BUDGET` | `***` (env) | RAG / document retrieval pipeline configuration. | none (connectivity/credentials only) | opaque secret string | env | frontend-ui | .env:402; docker-compose.yml:286 |
| `DATAGOV_PRELOAD_BACKGROUND` | `(unset)` (unset) | Memory system / Qdrant / DataGov configuration. | low (indirect/feature gating) | string | code |  | frontend-huggingface/src/hooks.server.ts:252 |
| `DATAGOV_PRELOAD_ENABLED` | `(unset)` (unset) | Memory system / Qdrant / DataGov configuration. | low (indirect/feature gating) | boolean: true|false | code |  | frontend-huggingface/src/hooks.server.ts:251 |
| `DATAGOV_PROXY_URL` | `(unset)` (env) | Memory system / Qdrant / DataGov configuration. | none (connectivity/credentials only) | URL (http/https) | env, compose | mcp-sse-proxy | .env:285; docker-compose.yml:356 |
| `DEBIAN_FRONTEND` | `noninteractive` (docker-env) | Application configuration. | low (indirect/feature gating) | string | dockerfile-env |  | Dockerfile.BAAI:38; Dockerfile.BAAI:5 |
| `DEBUG` | `(unset)` (unset) | Application configuration. | low (logging overhead) | boolean: true|false | code |  | frontend-huggingface/src/lib/server/textGeneration/utils/debugLog.ts:3 |
| `DEBUG_MCP` | `(unset)` (unset) | Application configuration. | low (logging overhead) | boolean: true|false | code |  | frontend-huggingface/src/lib/server/textGeneration/mcp/serviceContainer.ts:198 |
| `DOCKER_CPU_LIMIT` | `8              # Docker CPU limit` (env) | Docker resource or healthcheck configuration. | low (indirect/feature gating) | number (int/float depending on variable) | env |  | .env:206 |
| `DOCKER_ENV` | `true` (compose-env) | Docker resource or healthcheck configuration. | low (indirect/feature gating) | string | code | frontend-ui | docker-compose.yml:270; frontend-huggingface/src/hooks.server.ts:100; frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:27; frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:35; frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:45; frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:47; frontend-huggingface/src/lib/server/endpoints/preprocessMessages.ts:24; frontend-huggingface/src/lib/server/files/uploadFile.ts:13; frontend-huggingface/src/lib/server/mcp/rewriteMcpUrlForDocker.ts:7; frontend-huggingface/src/lib/server/textGeneration/mcp/toolInvocation.ts:78; frontend-huggingface/src/routes/api/mcp/__tests__/health.rewrite.test.ts:13; frontend-huggingface/src/routes/api/mcp/__tests__/health.rewrite.test.ts:18; frontend-huggingface/src/routes/api/mcp/__tests__/health.rewrite.test.ts:19; frontend-huggingface/src/routes/api/mcp/__tests__/health.rewrite.test.ts:25; frontend-huggingface/src/routes/api/mcp/__tests__/health.rewrite.test.ts:7; frontend-huggingface/src/routes/api/mcp/__tests__/health.rewrite.test.ts:8; frontend-huggingface/src/routes/api/memory/books/+server.ts:19 |
| `DOCKER_MEMORY_LIMIT` | `40G         # Docker memory limit` (env) | Docker resource or healthcheck configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env |  | .env:205 |
| `DOCLING_SERVER_URL` | `http://docling:5001` (env) | Docling document extraction configuration. | none (connectivity/credentials only) | URL (http/https) | env, code | frontend-ui | .env:301; docker-compose.yml:283; frontend-huggingface/src/lib/server/textGeneration/mcp/services/doclingClient.ts:41; frontend-huggingface/src/routes/api/integrations/+server.ts:76 |
| `DOCLING_SERVE_ENABLE_UI` | `true` (env) | Docling document extraction configuration. | low (indirect/feature gating) | string | env | docling | .env:300; docker-compose.yml:389 |
| `DOCUMENT_RAG_ENABLED` | `true` (env) | RAG / document retrieval pipeline configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env | frontend-ui | .env:387; docker-compose.yml:280 |
| `DRY_ALLOWED_LENGTH` | `2            # Minimum sequence length to penalize` (env) | Model generation/sampling configuration. | high (inference/runtime performance) | boolean: true|false | env |  | .env:187 |
| `DRY_BASE` | `1.75                   # Base for exponential penalty` (env) | Model generation/sampling configuration. | high (inference/runtime performance) | string | env |  | .env:185 |
| `DRY_MULTIPLIER` | `0.8              # Strength (0.0 = off, 0.8 = moderate, 2.0 = strong)` (env) | Model generation/sampling configuration. | high (inference/runtime performance) | string | env |  | .env:183 |
| `DRY_PENALTY_LAST_N` | `1024         # Match REPEAT_LAST_N` (env) | Model generation/sampling configuration. | high (inference/runtime performance) | number (int/float depending on variable) | env |  | .env:188 |
| `EMBEDDINGS_MODEL` | `bge-m3-f16.gguf` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | enum/string | env |  | .env:240 |
| `EMBEDDINGS_MODEL_BATCH_SIZE` | `512` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env, compose | dicta-retrieval | .env:243; docker-compose.yml:433 |
| `EMBEDDINGS_MODEL_CONT_BATCHING` | `true` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env |  | .env:250 |
| `EMBEDDINGS_MODEL_CTX_SIZE` | `8192` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env, compose | dicta-retrieval | .env:242; docker-compose.yml:432 |
| `EMBEDDINGS_MODEL_FLASH_ATTN` | `true` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | enum/string | env |  | .env:251 |
| `EMBEDDINGS_MODEL_MAIN_GPU` | `0` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | enum/string | env, compose | dicta-retrieval | .env:247; docker-compose.yml:438 |
| `EMBEDDINGS_MODEL_N_GPU_LAYERS` | `-1` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env, compose | dicta-retrieval | .env:246; docker-compose.yml:437 |
| `EMBEDDINGS_MODEL_PARALLEL` | `4` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | enum/string | env |  | .env:249 |
| `EMBEDDINGS_MODEL_PATH` | `/app/models/embeddings/bge-m3-f16.gguf` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | filesystem path | env, compose | dicta-retrieval | .env:241; docker-compose.yml:430 |
| `EMBEDDINGS_MODEL_TENSOR_SPLIT` | `1.0` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env |  | .env:248 |
| `EMBEDDINGS_MODEL_THREADS` | `8` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env, compose | dicta-retrieval | .env:245; docker-compose.yml:436 |
| `EMBEDDINGS_MODEL_UBATCH_SIZE` | `512` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env, compose | dicta-retrieval | .env:244; docker-compose.yml:435 |
| `EMBEDDING_DIMENSION` | `(unset)` (unset) | Application configuration. | medium-high (adds retrieval/processing work) | string | code |  | frontend-huggingface/src/routes/api/memory/diagnostics/+server.ts:383 |
| `EMBEDDING_MODEL` | `(unset)` (unset) | Application configuration. | medium-high (adds retrieval/processing work) | enum/string | code |  | frontend-huggingface/src/routes/api/memory/diagnostics/+server.ts:384 |
| `EMBEDDING_SERVICE_URL` | `http://dicta-retrieval:5005` (env) | RAG / document retrieval pipeline configuration. | medium-high (adds retrieval/processing work) | URL (http/https) | env, code | frontend-ui | .env:390; docker-compose.yml:281; frontend-huggingface/src/hooks.server.ts:102; frontend-huggingface/src/routes/api/integrations/+server.ts:77; frontend-huggingface/src/routes/api/memory/diagnostics/+server.ts:248; frontend-huggingface/src/routes/api/memory/health/+server.ts:131; frontend-huggingface/src/routes/api/memory/health/+server.ts:175; frontend-huggingface/src/routes/api/memory/ops/circuit-breaker/+server.ts:24; frontend-huggingface/src/routes/api/memory/ops/circuit-breaker/+server.ts:75; frontend-huggingface/src/routes/api/memory/ops/reindex/deferred/+server.ts:105; frontend-huggingface/src/routes/api/memory/ops/reindex/deferred/+server.ts:40; frontend-huggingface/src/routes/api/memory/ops/sanitize/+server.ts:42; frontend-huggingface/src/routes/api/system/health/+server.ts:25; frontend-huggingface/src/routes/api/system/health/+server.ts:47 |
| `EMBEDDING_URL` | `(unset)` (unset) | Service URL / endpoint configuration. | medium-high (adds retrieval/processing work) | URL (http/https) | code |  | frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-private.ts:9 |
| `ENABLE_CONFIG_MANAGER` | `false` (compose-env) | Application configuration. | low (indirect/feature gating) | string | code | frontend-ui | docker-compose.yml:273; frontend-huggingface/src/lib/server/config.ts:42 |
| `FLASH_ATTN` | `on                   # on|off|auto` (env) | Model runtime performance and GPU/CPU configuration. | high (inference/runtime performance) | string | env |  | .env:67 |
| `FREQUENCY_PENALTY` | `0.0           # DISABLED (use repeat_penalty instead)` (env) | Model generation/sampling configuration. | low (indirect/feature gating) | number (int/float depending on variable) | env |  | .env:177 |
| `FRONTEND_MCP_SERVERS` | `'[{"name":"Everything","url":"http://mcp-sse-proxy:3100/everything/sse"},{"na...` (env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | CSV list or JSON array | env |  | .env:381 |
| `FRONTEND_MODEL_DESCRIPTION` | `Enterprise-grade Hebrew-optimized language model (imatrix weighted quantization)` (env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | enum/string | env |  | .env:355 |
| `FRONTEND_MODEL_DISPLAY_NAME` | `DictaLM-3.0 (imatrix Q4_K_M)` (env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | enum/string | env |  | .env:354 |
| `FRONTEND_MODEL_ID` | `mradermacher/DictaLM-3.0-24B-Thinking-i1-GGUF` (env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | enum/string | env |  | .env:352 |
| `FRONTEND_MODEL_MAX_TOKENS` | `***` (env) | Frontend UI configuration and public branding. | none (connectivity/credentials only) | number (int/float depending on variable) | env |  | .env:363 |
| `FRONTEND_MODEL_NAME` | `dictalm-3.0-i1-q4km` (env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | enum/string | env |  | .env:353 |
| `FRONTEND_MODEL_REPETITION_PENALTY` | `1.1` (env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | number (int/float depending on variable) | env |  | .env:361 |
| `FRONTEND_MODEL_TEMPERATURE` | `0.4` (env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | number (int/float depending on variable) | env |  | .env:359 |
| `FRONTEND_MODEL_TOP_P` | `0.9` (env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | number (int/float depending on variable) | env |  | .env:360 |
| `FRONTEND_MODEL_TRUNCATE` | `1000` (env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | enum/string | env |  | .env:362 |
| `FRONTEND_MODEL_WEBSITE` | `https://dicta.org.il` (env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | enum/string | env |  | .env:356 |
| `FRONTEND_OPENAI_API_KEY` | `***` (env) | Frontend UI configuration and public branding. | none (connectivity/credentials only) | opaque secret string | env |  | .env:338 |
| `FRONTEND_OPENAI_BASE_URL` | `http://bricksllm:8002/api/custom/providers/llama-cpp-root` (env) | Frontend UI configuration and public branding. | none (connectivity/credentials only) | URL (http/https) | env |  | .env:337 |
| `FRONTEND_PUBLIC_APP_ASSETS` | `chatui` (env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | string | env |  | .env:342 |
| `FRONTEND_PUBLIC_APP_DATA_SHARING` | `false` (env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | string | env |  | .env:344 |
| `FRONTEND_PUBLIC_APP_DESCRIPTION` | `"A chat interface for DictaLM-3.0"` (env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | string | env |  | .env:343 |
| `FRONTEND_PUBLIC_APP_NAME` | `DictaLM Chat` (env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | string | env |  | .env:341 |
| `FRONTEND_PUBLIC_ORIGIN` | `http://localhost:8004` (env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | URL (http/https) | env |  | .env:345 |
| `GIT_SHA` | `(unset)` (unset) | Application configuration. | low (indirect/feature gating) | string | code |  | frontend-huggingface/src/routes/api/system/version/+server.ts:32 |
| `GOOS` | `linux` (docker-env) | Application configuration. | low (indirect/feature gating) | string | dockerfile-env |  | Dockerfile.datadog:3; Dockerfile.dev:3; Dockerfile.prod:3 |
| `GPU_COUNT` | `1                     # Number of GPUs` (env) | Model runtime performance and GPU/CPU configuration. | low (indirect/feature gating) | number (int/float depending on variable) | env, compose | llama-server | .env:55; docker-compose.yml:176 |
| `GPU_DEVICE_IDS` | `0                # CUDA device ID` (env) | Model runtime performance and GPU/CPU configuration. | low (indirect/feature gating) | string | env, compose | llama-server | .env:54; docker-compose.yml:135 |
| `HEALTHCHECK_START_PERIOD` | `90s    # Health check start delay (model loading time)` (env) | Docker resource or healthcheck configuration. | low (indirect/feature gating) | duration (e.g., 500ms, 2s, 1m) | env |  | .env:208; .env:38 |
| `HF_FILE` | `DictaLM-3.0-24B-Thinking.i1-Q4_K_M.gguf` (env) | llama.cpp model/server configuration. | low (indirect/feature gating) | filesystem path | env, code, compose | llama-server | .env:32; deploy.py:290; docker-compose.yml:148 |
| `HF_REPO` | `mradermacher/DictaLM-3.0-24B-Thinking-i1-GGUF` (env) | llama.cpp model/server configuration. | low (indirect/feature gating) | string | env |  | .env:35 |
| `HF_TOKEN` | `(unset)` (compose-default) | Application configuration. | none (connectivity/credentials only) | opaque secret string | code, compose | frontend-ui | docker-compose.yml:269; frontend-huggingface/src/hooks.server.ts:314 |
| `HOME` | `/home/user` (docker-env) | Application configuration. | low (indirect/feature gating) | string | code, dockerfile-env |  | frontend-huggingface/Dockerfile:15; frontend-huggingface/src/routes/api/mcp/scan/+server.ts:64 |
| `INCLUDE_DB` | `false` (docker-arg-default) | Application configuration. | low (indirect/feature gating) | string | dockerfile-env, dockerfile-arg |  | frontend-huggingface/Dockerfile:3; frontend-huggingface/Dockerfile:87; frontend-huggingface/Dockerfile:88 |
| `IN_MEMORY_DB_UPDATE_INTERVAL` | `5s` (env) | Application configuration. | medium-high (adds retrieval/processing work) | duration (e.g., 500ms, 2s, 1m) | env, compose | bricksllm | .env:223; docker-compose.yml:205 |
| `LLAMA_HOST_PORT` | `5002` (env) | llama.cpp model/server configuration. | none (connectivity/credentials only) | integer port (1-65535) | env, compose | llama-server | .env:31; docker-compose.yml:138 |
| `LLAMA_IMAGE` | `ghcr.io/ggml-org/llama.cpp:server-cuda` (env) | llama.cpp model/server configuration. | low (indirect/feature gating) | string | env, compose | llama-server | .env:30; docker-compose.yml:123 |
| `LOCAL_MODEL_PATH` | `/home/ilan/BricksLLM/models` (env) | llama.cpp model/server configuration. | low (indirect/feature gating) | filesystem path | env, code, compose | llama-server | .env:34; deploy.py:289; docker-compose.yml:140 |
| `LOG_FORMAT` | `json                 # json|text` (env) | Runtime mode or logging configuration. | low (logging overhead) | enum/string | env |  | .env:213 |
| `MAIN_GPU` | `0                      # Primary GPU device` (env) | Model runtime performance and GPU/CPU configuration. | low (indirect/feature gating) | string | env |  | .env:52 |
| `MAX_CHUNK_TOKENS` | `***` (env) | RAG / document retrieval pipeline configuration. | none (connectivity/credentials only) | number (int/float depending on variable) | env |  | .env:405 |
| `MAX_CONTEXT_CHUNKS` | `10` (env) | RAG / document retrieval pipeline configuration. | low (indirect/feature gating) | number (int/float depending on variable) | env | frontend-ui | .env:399; docker-compose.yml:285 |
| `MAX_FILE_SIZE` | `10485760` (env) | Docling document extraction configuration. | low (indirect/feature gating) | number (int/float depending on variable) | env, compose | docling | .env:308; docker-compose.yml:404 |
| `MAX_NUM_PAGES` | `30` (env) | Docling document extraction configuration. | low (indirect/feature gating) | number (int/float depending on variable) | env, compose | docling | .env:307; docker-compose.yml:405 |
| `MCP_ALLOWED_HOSTS` | `(unset)` (env) | MCP tool system configuration (tool filtering, security, debugging). | none (connectivity/credentials only) | boolean: true|false | env, code |  | .env:372; frontend-huggingface/src/lib/server/urlValidationCache.ts:216 |
| `MCP_ALLOW_LOCALHOST_URLS` | `false` (env) | MCP tool system configuration (tool filtering, security, debugging). | none (connectivity/credentials only) | boolean: true|false | env, code |  | .env:369; frontend-huggingface/src/lib/server/urlValidationCache.ts:202; frontend-huggingface/src/lib/server/urlValidationCache.ts:209 |
| `MCP_ALLOW_PRIVATE_URLS` | `***` (env) | MCP tool system configuration (tool filtering, security, debugging). | none (connectivity/credentials only) | boolean: true|false | env, code |  | .env:370; frontend-huggingface/src/lib/server/urlValidationCache.ts:203; frontend-huggingface/src/lib/server/urlValidationCache.ts:210 |
| `MCP_ALLOW_RESERVED_URLS` | `false` (env) | MCP tool system configuration (tool filtering, security, debugging). | none (connectivity/credentials only) | boolean: true|false | env, code |  | .env:371; frontend-huggingface/src/lib/server/urlValidationCache.ts:204 |
| `MCP_DEBUG` | `(unset)` (unset) | MCP tool system configuration (tool filtering, security, debugging). | low (logging overhead) | boolean: true|false | code |  | frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts:260 |
| `MCP_DEBUG_LOG_TOOL_OUTPUTS` | `false` (env) | MCP tool system configuration (tool filtering, security, debugging). | low (logging overhead) | boolean: true|false | env |  | .env:373 |
| `MCP_FILTER_TOOLS` | `true` (env) | MCP tool system configuration (tool filtering, security, debugging). | low (indirect/feature gating) | string | env |  | .env:367 |
| `MCP_FOLLOWUP_MAX_TOKENS` | `***` (env) | MCP tool system configuration (tool filtering, security, debugging). | none (connectivity/credentials only) | number (int/float depending on variable) | env, code |  | .env:375; frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts:1572 |
| `MCP_FOLLOWUP_REP_PENALTY` | `1.05` (env) | MCP tool system configuration (tool filtering, security, debugging). | low (indirect/feature gating) | number (int/float depending on variable) | env, code |  | .env:376; frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts:1577; frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts:1586 |
| `MCP_FOLLOWUP_TEMPERATURE` | `0.3` (env) | MCP tool system configuration (tool filtering, security, debugging). | low (indirect/feature gating) | number (int/float depending on variable) | env, code |  | .env:377; frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts:1594 |
| `MCP_MAX_TOOLS` | `4` (env) | MCP tool system configuration (tool filtering, security, debugging). | low (indirect/feature gating) | number (int/float depending on variable) | env, code |  | .env:366; frontend-huggingface/src/lib/server/textGeneration/mcp/toolFilter.ts:19 |
| `MCP_SERVERS` | `(unset)` (env) | MCP tool system configuration (tool filtering, security, debugging). | low (indirect/feature gating) | CSV list or JSON array | env | frontend-ui | .env:380 |
| `MCP_TOOL_PARSE_WORKERS` | `(unset)` (unset) | MCP tool system configuration (tool filtering, security, debugging). | low (indirect/feature gating) | string | code |  | frontend-huggingface/src/lib/server/textGeneration/mcp/__tests__/unit/workerPool.test.ts:25; frontend-huggingface/src/lib/server/textGeneration/mcp/__tests__/unit/workerPool.test.ts:39; frontend-huggingface/src/lib/server/textGeneration/mcp/workerPool.ts:54 |
| `MCP_TOOL_PARSE_WORKER_PATH` | `(unset)` (unset) | MCP tool system configuration (tool filtering, security, debugging). | low (indirect/feature gating) | filesystem path | code |  | frontend-huggingface/src/lib/server/textGeneration/mcp/workerPool.ts:46 |
| `MCP_TOOL_SUMMARY_PROMPT` | `"Based on the tool results above, provide a helpful and concise answer in the...` (env) | MCP tool system configuration (tool filtering, security, debugging). | low (indirect/feature gating) | string | env |  | .env:374 |
| `MCP_USE_NATIVE_TOOLS` | `false` (env) | MCP tool system configuration (tool filtering, security, debugging). | low (indirect/feature gating) | boolean: true|false | env, code |  | .env:368; frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts:612 |
| `MEMORY_BENCHMARK_MODE` | `(unset)` (unset) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | enum/string | code |  | frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:8 |
| `MEMORY_BM25_ENABLED` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env, code, compose | frontend-ui | .env:418; docker-compose.yml:291; frontend-huggingface/src/lib/server/memory/featureFlags.ts:111 |
| `MEMORY_CONSOLIDATION_ENABLED` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env, code |  | .env:432; frontend-huggingface/src/lib/server/memory/featureFlags.ts:126 |
| `MEMORY_DATA_DIR` | `./data/memory` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | filesystem path | env, code |  | .env:442; frontend-huggingface/src/lib/server/memory/featureFlags.ts:145 |
| `MEMORY_ENABLED` | `(unset)` (unset) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | code |  | frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-private.ts:11 |
| `MEMORY_ENABLE_AUTONOMY` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | string | env, code |  | .env:425; frontend-huggingface/src/lib/server/memory/featureFlags.ts:121 |
| `MEMORY_ENABLE_KG` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | string | env, code |  | .env:424; frontend-huggingface/src/lib/server/memory/featureFlags.ts:120 |
| `MEMORY_ENABLE_OUTCOME_DETECTION` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env, code |  | .env:426; frontend-huggingface/src/lib/server/memory/featureFlags.ts:122 |
| `MEMORY_ENABLE_PROBLEM_SOLUTION_INDEX` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | string | env, code |  | .env:427; frontend-huggingface/src/lib/server/memory/featureFlags.ts:123 |
| `MEMORY_FIRST_LOGIC_ENABLED` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env, code |  | .env:434; frontend-huggingface/src/lib/server/memory/featureFlags.ts:129 |
| `MEMORY_FULL_ATTRIBUTION_ENABLED` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env, code |  | .env:438; frontend-huggingface/src/lib/server/memory/featureFlags.ts:135 |
| `MEMORY_INITIAL_SCORE` | `0.5` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | string | env, code, compose | frontend-ui | .env:451; docker-compose.yml:300; frontend-huggingface/src/lib/server/memory/featureFlags.ts:156 |
| `MEMORY_KG_VIZ_ENABLED` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env, code |  | .env:414; frontend-huggingface/src/lib/server/memory/featureFlags.ts:107 |
| `MEMORY_LLM_BASE_URL` | `http://bricksllm:8002/v1` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | URL (http/https) | env, code | frontend-ui | .env:468; docker-compose.yml:305; frontend-huggingface/src/lib/server/memory/featureFlags.ts:175 |
| `MEMORY_LLM_MODEL` | `dictalm-3.0` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | enum/string | env, code, compose | frontend-ui | .env:469; docker-compose.yml:306; frontend-huggingface/src/lib/server/memory/featureFlags.ts:176 |
| `MEMORY_LOG_LEVEL` | `INFO` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | enum/string | env, code |  | .env:464; frontend-huggingface/src/lib/server/memory/featureFlags.ts:171 |
| `MEMORY_NEGATIVE_PENALTY` | `0.3` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env, code, compose | frontend-ui | .env:453; docker-compose.yml:302; frontend-huggingface/src/lib/server/memory/featureFlags.ts:158 |
| `MEMORY_OUTCOME_ENABLED` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env, code, compose | frontend-ui | .env:420; docker-compose.yml:294; frontend-huggingface/src/lib/server/memory/featureFlags.ts:116 |
| `MEMORY_PARTIAL_BOOST` | `0.05` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | string | env, code |  | .env:454; frontend-huggingface/src/lib/server/memory/featureFlags.ts:159 |
| `MEMORY_POSITIVE_BOOST` | `0.2` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | string | env, code, compose | frontend-ui | .env:452; docker-compose.yml:301; frontend-huggingface/src/lib/server/memory/featureFlags.ts:157 |
| `MEMORY_PREFETCH_TIMEOUT_MS` | `6000` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | duration (e.g., 500ms, 2s, 1m) | env, code |  | .env:460; frontend-huggingface/src/lib/server/memory/featureFlags.ts:167 |
| `MEMORY_PROMOTION_ENABLED` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env, code, compose | frontend-ui | .env:421; docker-compose.yml:295; frontend-huggingface/src/lib/server/memory/featureFlags.ts:117 |
| `MEMORY_QDRANT_ENABLED` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env, code, compose | frontend-ui | .env:417; docker-compose.yml:290; frontend-huggingface/src/lib/server/memory/featureFlags.ts:110 |
| `MEMORY_REQUIRE_AUTH` | `***` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env, code |  | .env:465; frontend-huggingface/src/lib/server/memory/featureFlags.ts:172 |
| `MEMORY_REQUIRE_CONFIRMATION` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env, code |  | .env:428; frontend-huggingface/src/lib/server/memory/featureFlags.ts:124 |
| `MEMORY_RERANK_ENABLED` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env, code, compose | frontend-ui | .env:419; docker-compose.yml:293; frontend-huggingface/src/lib/server/memory/featureFlags.ts:115 |
| `MEMORY_SEARCH_LIMIT` | `20` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env, code, compose | frontend-ui | .env:458; docker-compose.yml:304; frontend-huggingface/src/lib/server/memory/featureFlags.ts:163 |
| `MEMORY_SEARCH_MIN_SCORE` | `0.0` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env, code |  | .env:459; frontend-huggingface/src/lib/server/memory/featureFlags.ts:164 |
| `MEMORY_SEARCH_TIMEOUT_MS` | `15000` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | duration (e.g., 500ms, 2s, 1m) | env, code |  | .env:461; frontend-huggingface/src/lib/server/memory/featureFlags.ts:168 |
| `MEMORY_SYSTEM_ENABLED` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env, code, compose | frontend-ui | .env:412; docker-compose.yml:288; frontend-huggingface/src/lib/server/memory/featureFlags.ts:105 |
| `MEMORY_TOP_K` | `10` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env, code, compose | frontend-ui | .env:455; docker-compose.yml:303; frontend-huggingface/src/lib/server/memory/featureFlags.ts:160 |
| `MEMORY_UI_ENABLED` | `true` (env) | Memory system / Qdrant / DataGov configuration. | medium-high (adds retrieval/processing work) | boolean: true|false | env, code, compose | frontend-ui | .env:413; docker-compose.yml:289; frontend-huggingface/src/lib/server/memory/featureFlags.ts:106 |
| `METRICS_ENABLED` | `false` (env) | Application configuration. | low (indirect/feature gating) | boolean: true|false | env |  | .env:479 |
| `MIN_P` | `0.05                      # Filter tokens below 5% probability` (env) | Model generation/sampling configuration. | high (inference/runtime performance) | number (int/float depending on variable) | env |  | .env:153 |
| `MIROSTAT` | `0                      # Mirostat DISABLED (0 = off)` (env) | Application configuration. | low (indirect/feature gating) | string | env |  | .env:160 |
| `MOCK_EMBEDDINGS` | `(unset)` (unset) | Application configuration. | medium-high (adds retrieval/processing work) | string | code |  | frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:13 |
| `MOCK_LLM` | `(unset)` (unset) | Application configuration. | low (indirect/feature gating) | string | code |  | frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:12 |
| `MONGODB_DB_NAME` | `chat-ui` (env) | Application configuration. | low (indirect/feature gating) | string | env | frontend-ui | .env:332; docker-compose.yml:267 |
| `MONGODB_URI` | `(unset)` (unset) | Application configuration. | low (indirect/feature gating) | string | code |  | frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:17 |
| `MONGODB_URL` | `mongodb://mongo:27017` (env) | Service URL / endpoint configuration. | none (connectivity/credentials only) | URL (http/https) | env, code, dockerfile-env | frontend-ui | .env:331; docker-compose.yml:266; frontend-huggingface/Dockerfile:78; frontend-huggingface/scripts/migrate-books-to-documents.ts:17; frontend-huggingface/scripts/populate.ts:268; frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-private.ts:7 |
| `MUPDF_API_KEY` | `***` (env) | Application configuration. | none (connectivity/credentials only) | opaque secret string | env |  | .env:294 |
| `NER_CACHE_ENABLED` | `true` (env) | NER service configuration. | low (indirect/feature gating) | boolean: true|false | env |  | .env:276 |
| `NER_CACHE_MAX_SIZE` | `5000` (env) | NER service configuration. | low (indirect/feature gating) | number (int/float depending on variable) | env |  | .env:278 |
| `NER_CACHE_TTL_SECONDS` | `3600` (env) | NER service configuration. | low (indirect/feature gating) | duration (e.g., 500ms, 2s, 1m) | env |  | .env:277 |
| `NER_CB_FAILURE_THRESHOLD` | `3` (env) | NER service configuration. | low (indirect/feature gating) | string | env |  | .env:272 |
| `NER_CB_OPEN_DURATION_MS` | `30000` (env) | NER service configuration. | low (indirect/feature gating) | duration (e.g., 500ms, 2s, 1m) | env |  | .env:274 |
| `NER_CB_SUCCESS_THRESHOLD` | `2` (env) | NER service configuration. | low (indirect/feature gating) | string | env |  | .env:273 |
| `NER_ENTITY_OVERLAP_THRESHOLD` | `0.3` (env) | NER service configuration. | low (indirect/feature gating) | string | env |  | .env:280 |
| `NER_MAX_BATCH_SIZE` | `32` (env) | NER service configuration. | low (indirect/feature gating) | number (int/float depending on variable) | env |  | .env:270 |
| `NER_MIN_CONFIDENCE` | `0.85` (env) | NER service configuration. | low (indirect/feature gating) | number (int/float depending on variable) | env, code | ner-service | .env:269; docker-compose.yml:495; frontend-huggingface/src/lib/server/memory/ai/UnifiedAIClient.ts:480 |
| `NER_PREFILTER_ENABLED` | `true` (env) | NER service configuration. | low (indirect/feature gating) | boolean: true|false | env |  | .env:281 |
| `NER_SERVICE_ENABLED` | `true` (env) | NER service configuration. | low (indirect/feature gating) | boolean: true|false | env, code |  | .env:266; frontend-huggingface/src/lib/server/memory/ai/UnifiedAIClient.ts:481 |
| `NER_SERVICE_TIMEOUT_MS` | `2000` (env) | NER service configuration. | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | env, code |  | .env:268; frontend-huggingface/src/lib/server/memory/ai/UnifiedAIClient.ts:479 |
| `NER_SERVICE_URL` | `http://dicta-ner:5007` (env) | NER service configuration. | none (connectivity/credentials only) | URL (http/https) | env, code |  | .env:267; frontend-huggingface/src/lib/server/memory/ai/UnifiedAIClient.ts:476 |
| `NETWORK_SUBNET` | `172.28.0.0/16` (env) | Docker network configuration. | low (indirect/feature gating) | string | env |  | .env:233; docker-compose.yml:530 |
| `NODE_ENV` | `production` (env) | Runtime mode or logging configuration. | low (indirect/feature gating) | string | env, code | mcp-sse-proxy | .env:214; docker-compose.yml:351; frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:9; frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts:260; frontend-huggingface/src/lib/server/textGeneration/utils/debugLog.ts:3; frontend-huggingface/src/routes/api/system/version/+server.ts:33 |
| `NUMBER_OF_EVENT_MESSAGE_CONSUMERS` | `3` (env) | Application configuration. | low (indirect/feature gating) | string | env, compose | bricksllm | .env:225; docker-compose.yml:210 |
| `NUM_PREDICT` | `4096                # Maximum tokens to generate per request` (env) | Model generation/sampling configuration. | high (inference/runtime performance) | string | env, compose | llama-server | .env:193; docker-compose.yml:164 |
| `N_BATCH` | `1024                    # Main batch size (optimal for 32K @ RTX 3090)` (env) | Model runtime performance and GPU/CPU configuration. | high (inference/runtime performance) | number (int/float depending on variable) | env |  | .env:75 |
| `N_GPU_LAYERS` | `99                 # Offload all layers to GPU` (env) | Model runtime performance and GPU/CPU configuration. | high (inference/runtime performance) | number (int/float depending on variable) | env, compose | llama-server | .env:51; docker-compose.yml:156 |
| `N_PARALLEL` | `1                    # Concurrent request slots` (env) | Model runtime performance and GPU/CPU configuration. | high (inference/runtime performance) | string | env |  | .env:109 |
| `N_THREADS` | `8                     # CPU threads (match your cores)` (env) | Model runtime performance and GPU/CPU configuration. | high (inference/runtime performance) | number (int/float depending on variable) | env |  | .env:77 |
| `N_THREADS_BATCH` | `8               # Threads for batch processing` (env) | Model runtime performance and GPU/CPU configuration. | high (inference/runtime performance) | number (int/float depending on variable) | env |  | .env:78 |
| `N_UBATCH` | `256                    # Physical batch size (ubatch)` (env) | Model runtime performance and GPU/CPU configuration. | high (inference/runtime performance) | number (int/float depending on variable) | env |  | .env:76 |
| `PATH` | `$VIRTUAL_ENV/bin:$PATH` (docker-env) | Application configuration. | low (indirect/feature gating) | string | dockerfile-env |  | Dockerfile.mcpo:27 |
| `PERPLEXITY_API_KEY` | `***` (env) | Application configuration. | none (connectivity/credentials only) | opaque secret string | env, compose | mcp-sse-proxy | .env:291; docker-compose.yml:353 |
| `PERSONALITY_ACTIVE_TEMPLATE` | `active.txt` (env) | Application configuration. | low (indirect/feature gating) | string | env, code |  | .env:474; frontend-huggingface/src/lib/server/memory/featureFlags.ts:184 |
| `PERSONALITY_DEFAULT_TEMPLATE` | `default.txt` (env) | Application configuration. | low (indirect/feature gating) | string | env, code |  | .env:473; frontend-huggingface/src/lib/server/memory/featureFlags.ts:183 |
| `PERSONALITY_TEMPLATES_DIR` | `/app/templates/personality` (env) | Application configuration. | low (indirect/feature gating) | filesystem path | env, code |  | .env:472; frontend-huggingface/src/lib/server/memory/featureFlags.ts:180 |
| `POETRY_INSTALL_ARGS` | `(unset)` (docker-arg-default) | Application configuration. | low (indirect/feature gating) | string | dockerfile-arg |  | Dockerfile.BAAI:4; docker-compose.yml:419 |
| `POETRY_NO_INTERACTION` | `1` (docker-env) | Application configuration. | low (indirect/feature gating) | string | dockerfile-env |  | Dockerfile.BAAI:20 |
| `PORT` | `varies by service` (compose-env) | Application configuration. | none (connectivity/credentials only) | string | code | mcp-sse-proxy, ner-service | docker-compose.yml:349; docker-compose.yml:489; frontend-huggingface/src/lib/server/adminToken.ts:40; frontend-huggingface/src/lib/server/adminToken.ts:41; frontend-huggingface/vite.config.ts:35 |
| `POSTGRESQL_DB` | `bricksllm` (env) | PostgreSQL configuration (credentials, host, ports, timeouts). | low (indirect/feature gating) | string | env, compose | bricksllm, postgresql | .env:14; docker-compose.yml:109; docker-compose.yml:195; docker-compose.yml:97 |
| `POSTGRESQL_HOST_PORT` | `5433` (env) | PostgreSQL configuration (credentials, host, ports, timeouts). | none (connectivity/credentials only) | integer port (1-65535) | env, compose | postgresql | .env:15; docker-compose.yml:100 |
| `POSTGRESQL_PASSWORD` | `***` (env) | PostgreSQL configuration (credentials, host, ports, timeouts). | none (connectivity/credentials only) | opaque secret string | env, compose | bricksllm, postgresql | .env:13; docker-compose.yml:197; docker-compose.yml:96 |
| `POSTGRESQL_READ_TIME_OUT` | `2s` (env) | PostgreSQL configuration (credentials, host, ports, timeouts). | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | env, compose | bricksllm | .env:16; docker-compose.yml:198 |
| `POSTGRESQL_USERNAME` | `postgres` (env) | PostgreSQL configuration (credentials, host, ports, timeouts). | low (indirect/feature gating) | string | env, compose | bricksllm, postgresql | .env:12; docker-compose.yml:109; docker-compose.yml:196; docker-compose.yml:95 |
| `POSTGRESQL_WRITE_TIME_OUT` | `1s` (env) | PostgreSQL configuration (credentials, host, ports, timeouts). | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | env, compose | bricksllm | .env:17; docker-compose.yml:199 |
| `POSTGRES_URL` | `postgres://postgres:postgres@postgresql:5432/bricksllm` (env) | PostgreSQL configuration (credentials, host, ports, timeouts). | none (connectivity/credentials only) | URL (http/https) | env |  | .env:333 |
| `PRESENCE_PENALTY` | `0.0            # DISABLED (use repeat_penalty instead)` (env) | Model generation/sampling configuration. | low (indirect/feature gating) | number (int/float depending on variable) | env |  | .env:178 |
| `PROXY_TIMEOUT` | `600s` (env) | Application configuration. | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | env, compose | bricksllm | .env:224; docker-compose.yml:209 |
| `PUBLIC_API_URL` | `(unset)` (unset) | Frontend UI configuration and public branding. | none (connectivity/credentials only) | URL (http/https) | code |  | frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-public.ts:8 |
| `PUBLIC_APP_ASSETS` | `chatui` (compose-env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | string | code | frontend-ui | docker-compose.yml:261; frontend-huggingface/src/lib/components/UpdateBanner.svelte:18; frontend-huggingface/src/lib/stores/mcpServers.ts:19; frontend-huggingface/src/lib/stores/terminalMode.ts:10; frontend-huggingface/src/lib/utils/storageMigration.ts:10 |
| `PUBLIC_APP_COLOR` | `blue` (compose-env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | string | dockerfile-arg | frontend-ui | docker-compose.yml:262; frontend-huggingface/Dockerfile:53; frontend-huggingface/Dockerfile:92 |
| `PUBLIC_APP_NAME` | `DictaLM Chat` (compose-env) | Frontend UI configuration and public branding. | low (indirect/feature gating) | string | code | frontend-ui | docker-compose.yml:260; frontend-huggingface/src/lib/components/UpdateBanner.svelte:18; frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-public.ts:7; frontend-huggingface/src/lib/stores/mcpServers.ts:19; frontend-huggingface/src/lib/stores/terminalMode.ts:10; frontend-huggingface/src/lib/utils/storageMigration.ts:10 |
| `PUBLIC_COMMIT_SHA` | `(unset)` (docker-arg-default) | Frontend UI configuration and public branding. | low (indirect/feature gating) | string | dockerfile-env, dockerfile-arg |  | frontend-huggingface/Dockerfile:93; frontend-huggingface/Dockerfile:94 |
| `PUBLIC_VERSION` | `(unset)` (unset) | Frontend UI configuration and public branding. | low (indirect/feature gating) | string | code |  | frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-public.ts:9 |
| `QDRANT_API_KEY` | `(unset)` (unset) | Memory system / Qdrant / DataGov configuration. | none (connectivity/credentials only) | opaque secret string | code |  | frontend-huggingface/scripts/migrate-books-to-documents.ts:19; frontend-huggingface/src/hooks.server.ts:95 |
| `QDRANT_COLLECTION` | `memories_v1` (env) | Memory system / Qdrant / DataGov configuration. | low (indirect/feature gating) | string | env, code, compose | frontend-ui | .env:447; docker-compose.yml:298; frontend-huggingface/src/lib/server/memory/featureFlags.ts:151 |
| `QDRANT_COLLECTION_NAME` | `(unset)` (unset) | Memory system / Qdrant / DataGov configuration. | low (indirect/feature gating) | string | code |  | frontend-huggingface/scripts/migrate-books-to-documents.ts:20 |
| `QDRANT_GRPC_PORT` | `6334` (compose-default) | Memory system / Qdrant / DataGov configuration. | none (connectivity/credentials only) | integer port (1-65535) | compose | qdrant | docker-compose.yml:64 |
| `QDRANT_HOST` | `qdrant` (env) | Memory system / Qdrant / DataGov configuration. | none (connectivity/credentials only) | string | env, code | frontend-ui | .env:445; docker-compose.yml:296; frontend-huggingface/src/lib/server/memory/featureFlags.ts:148; frontend-huggingface/src/routes/api/memory/diagnostics/+server.ts:192; frontend-huggingface/src/routes/api/memory/health/+server.ts:94 |
| `QDRANT_HTTPS` | `false` (code-default) | Memory system / Qdrant / DataGov configuration. | low (indirect/feature gating) | string | code |  | frontend-huggingface/src/hooks.server.ts:94; frontend-huggingface/src/lib/server/memory/featureFlags.ts:150 |
| `QDRANT_PORT` | `6333` (env) | Memory system / Qdrant / DataGov configuration. | none (connectivity/credentials only) | integer port (1-65535) | env, code, compose | frontend-ui, qdrant | .env:446; docker-compose.yml:297; docker-compose.yml:63; frontend-huggingface/src/lib/server/memory/featureFlags.ts:149; frontend-huggingface/src/routes/api/memory/diagnostics/+server.ts:193; frontend-huggingface/src/routes/api/memory/health/+server.ts:95 |
| `QDRANT_URL` | `(unset)` (unset) | Memory system / Qdrant / DataGov configuration. | none (connectivity/credentials only) | URL (http/https) | code |  | frontend-huggingface/scripts/migrate-books-to-documents.ts:18; frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-private.ts:8; frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:18 |
| `QDRANT_VECTOR_SIZE` | `1024` (env) | Memory system / Qdrant / DataGov configuration. | low (indirect/feature gating) | number (int/float depending on variable) | env, code, compose | frontend-ui | .env:448; docker-compose.yml:299; frontend-huggingface/src/lib/server/memory/featureFlags.ts:153 |
| `REDIS_HOST_PORT` | `6380` (env) | Redis configuration (credentials, host, ports, timeouts). | none (connectivity/credentials only) | integer port (1-65535) | env, compose | redis | .env:23; docker-compose.yml:7 |
| `REDIS_PASSWORD` | `***` (env) | Redis configuration (credentials, host, ports, timeouts). | none (connectivity/credentials only) | opaque secret string | env, compose | bricksllm, redis | .env:22; docker-compose.yml:202; docker-compose.yml:8 |
| `REDIS_READ_TIME_OUT` | `1s` (env) | Redis configuration (credentials, host, ports, timeouts). | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | env, compose | bricksllm | .env:24; docker-compose.yml:203 |
| `REDIS_URL` | `redis://redis:6379` (env) | Redis configuration (credentials, host, ports, timeouts). | none (connectivity/credentials only) | URL (http/https) | env, code |  | .env:334; frontend-huggingface/src/lib/server/memory/ContextualEmbeddingService.ts:102; frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-private.ts:12; frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:19 |
| `REDIS_WRITE_TIME_OUT` | `1s` (env) | Redis configuration (credentials, host, ports, timeouts). | medium (affects tail latency and failure handling) | duration (e.g., 500ms, 2s, 1m) | env, compose | bricksllm | .env:25; docker-compose.yml:204 |
| `REPEAT_LAST_N` | `1024              # Tokens to consider for repeat penalty` (env) | Model generation/sampling configuration. | high (inference/runtime performance) | string | env |  | .env:172 |
| `REPEAT_PENALTY` | `1.1              # Penalty for repeating tokens (LOWERED from 1.5 - was causi...` (env) | Model generation/sampling configuration. | high (inference/runtime performance) | number (int/float depending on variable) | env, compose | llama-server | .env:165; docker-compose.yml:162 |
| `RERANKER_MODEL_BATCH_SIZE` | `512` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env, compose | dicta-retrieval | .env:257; docker-compose.yml:440 |
| `RERANKER_MODEL_CTX_SIZE` | `8192` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env, compose | dicta-retrieval | .env:256; docker-compose.yml:439 |
| `RERANKER_MODEL_MAIN_GPU` | `0` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | enum/string | env, compose | dicta-retrieval | .env:261; docker-compose.yml:446 |
| `RERANKER_MODEL_NAME` | `/app/models/reranking/bge-reranker-v2-m3-q8_0.gguf` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | enum/string | env, compose | dicta-retrieval | .env:255; docker-compose.yml:431 |
| `RERANKER_MODEL_N_GPU_LAYERS` | `-1` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env, compose | dicta-retrieval | .env:260; docker-compose.yml:445 |
| `RERANKER_MODEL_THREADS` | `8` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env, compose | dicta-retrieval | .env:259; docker-compose.yml:444 |
| `RERANKER_MODEL_UBATCH_SIZE` | `4096` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | number (int/float depending on variable) | env, compose | dicta-retrieval | .env:258; docker-compose.yml:443 |
| `RERANKER_SERVICE_URL` | `http://dicta-retrieval:5006/v1/rerank` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | URL (http/https) | env, code | frontend-ui | .env:393; docker-compose.yml:282; frontend-huggingface/src/hooks.server.ts:107; frontend-huggingface/src/routes/api/integrations/+server.ts:78 |
| `RERANKER_THRESHOLD` | `0.7` (env) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | string | env | frontend-ui | .env:396; docker-compose.yml:284 |
| `RERANKER_URL` | `(unset)` (unset) | Embedding/reranker service configuration. | medium-high (adds retrieval/processing work) | URL (http/https) | code |  | frontend-huggingface/src/lib/server/memory/__tests__/mocks/env-private.ts:10; frontend-huggingface/src/routes/api/memory/health/+server.ts:175 |
| `ROPE_FREQ_BASE` | `10000            # Base frequency` (env) | Model runtime performance and GPU/CPU configuration. | high (inference/runtime performance) | string | env |  | .env:118 |
| `ROPE_SCALING` | `linear             # linear|yarn|none` (env) | Model runtime performance and GPU/CPU configuration. | high (inference/runtime performance) | enum/string | env |  | .env:117 |
| `SECRET_CONFIG` | `(unset)` (unset) | Application configuration. | none (connectivity/credentials only) | opaque secret string | code |  | frontend-huggingface/scripts/updateLocalEnv.ts:32 |
| `SHM_SIZE` | `20gb                   # Shared memory (important for large contexts)` (env) | Docker resource or healthcheck configuration. | low (indirect/feature gating) | number (int/float depending on variable) | env |  | .env:207 |
| `SILENT_TESTS` | `(unset)` (unset) | Application configuration. | low (indirect/feature gating) | string | code |  | frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:29 |
| `SINGLE_USER_ADMIN` | `true` (env) | Application configuration. | low (indirect/feature gating) | number (int/float depending on variable) | env, code |  | .env:348; frontend-huggingface/src/lib/server/__tests__/auth/singleUserAdmin.test.ts:6 |
| `SINGLE_USER_SESSION_SECRET` | `***` (env) | Application configuration. | none (connectivity/credentials only) | opaque secret string | env, code |  | .env:349; frontend-huggingface/src/lib/server/__tests__/auth/singleUserAdmin.test.ts:7 |
| `SMITHERY_API_KEY` | `***` (env) | Application configuration. | none (connectivity/credentials only) | opaque secret string | env, compose | mcp-sse-proxy | .env:292; docker-compose.yml:355 |
| `SPLIT_MODE` | `none                 # none for single GPU` (env) | Model runtime performance and GPU/CPU configuration. | low (indirect/feature gating) | number (int/float depending on variable) | env |  | .env:53 |
| `STATS_PROVIDER` | `(unset)` (env) | Application configuration. | low (indirect/feature gating) | string | env, compose | bricksllm | .env:226; docker-compose.yml:206 |
| `SUPERMEMORY_API_KEY` | `***` (env) | Application configuration. | medium-high (adds retrieval/processing work) | opaque secret string | env |  | .env:293 |
| `SWAGGER_HOST_PORT` | `8082` (compose-default) | Service port mapping. | none (connectivity/credentials only) | integer port (1-65535) | compose | swagger-ui | docker-compose.yml:249 |
| `SYSTEM_PROMPT` | `"You are DictaLM, a helpful AI assistant developed by Dicta. When answering, ...` (env) | Model generation/sampling configuration. | low (indirect/feature gating) | string | env, compose | llama-server | .env:201; .env:36; docker-compose.yml:136 |
| `TAVILIY_SEARCH_API_KEY` | `***` (env) | Application configuration. | none (connectivity/credentials only) | opaque secret string | env, compose | mcp-sse-proxy | .env:290; docker-compose.yml:354 |
| `TEMPERATURE` | `0.4                 # 0.4 = more deterministic (testing)` (env) | Model generation/sampling configuration. | high (inference/runtime performance) | number (int/float depending on variable) | env, compose | llama-server | .env:139; docker-compose.yml:158 |
| `TESSDATA_PREFIX` | `/home/linuxbrew/.linuxbrew/bin/tesseract` (env) | Docling document extraction configuration. | low (indirect/feature gating) | string | env | docling | .env:303; docker-compose.yml:406 |
| `TEST_MONGODB_URI` | `(unset)` (unset) | Application configuration. | low (indirect/feature gating) | string | code |  | frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:16 |
| `TEST_QDRANT_URL` | `(unset)` (unset) | Service URL / endpoint configuration. | none (connectivity/credentials only) | URL (http/https) | code |  | frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:18 |
| `TEST_REDIS_URL` | `(unset)` (unset) | Service URL / endpoint configuration. | none (connectivity/credentials only) | URL (http/https) | code |  | frontend-huggingface/src/lib/server/memory/__tests__/setup.ts:19 |
| `TOOL_RESULT_ENHANCED_INGESTION_ENABLED` | `true` (env) | Application configuration. | low (indirect/feature gating) | boolean: true|false | env, code |  | .env:429; frontend-huggingface/src/lib/server/memory/featureFlags.ts:128 |
| `TOOL_RESULT_INGESTION_ENABLED` | `true` (env) | Application configuration. | low (indirect/feature gating) | boolean: true|false | env, code |  | .env:433; frontend-huggingface/src/lib/server/memory/featureFlags.ts:127 |
| `TOP_K` | `0                         # DISABLED (0 = off, redundant with min_p)` (env) | Model generation/sampling configuration. | high (inference/runtime performance) | number (int/float depending on variable) | env |  | .env:148 |
| `TOP_P` | `0.9                       # Keep top 90% probability mass` (env) | Model generation/sampling configuration. | high (inference/runtime performance) | number (int/float depending on variable) | env, compose | llama-server | .env:147; docker-compose.yml:160 |
| `TSSDATA_HEBREW_PREFIX` | `/home/ilan/BricksLLM/docling/Hebrew.traineddata` (env) | Docling document extraction configuration. | low (indirect/feature gating) | string | env |  | .env:304 |
| `UPLOADS_DIR` | `(unset)` (unset) | Application configuration. | low (indirect/feature gating) | filesystem path | code |  | frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:26; frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:34; frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:40; frontend-huggingface/src/lib/server/endpoints/__tests__/unit/preprocessMessages.docling-path.test.ts:42; frontend-huggingface/src/lib/server/endpoints/preprocessMessages.ts:23; frontend-huggingface/src/lib/server/files/uploadFile.ts:12; frontend-huggingface/src/lib/server/textGeneration/mcp/toolInvocation.ts:77; frontend-huggingface/src/routes/api/memory/books/+server.ts:18 |
| `UVICORN_RELOAD` | `True` (env) | Application configuration. | low (indirect/feature gating) | string | env |  | .env:306 |
| `UVICORN_WORKERS` | `2` (env) | Application configuration. | low (indirect/feature gating) | string | env |  | .env:305 |
| `VIRTUAL_ENV` | `/venv` (docker-env) | Application configuration. | low (indirect/feature gating) | string | dockerfile-env |  | Dockerfile.mcpo:25 |
| `VITEST_BROWSER` | `(unset)` (unset) | Application configuration. | low (indirect/feature gating) | string | code |  | frontend-huggingface/vite.config.ts:9 |
| `YARN_EXT_FACTOR` | `1.0             # YaRN extension factor` (env) | Model runtime performance and GPU/CPU configuration. | high (inference/runtime performance) | string | env |  | .env:119 |
