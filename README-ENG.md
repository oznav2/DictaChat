<p align="center">
<img src="./assets/hero-dicta.jpeg" width="150" />
</p>

# **BricksLLM: Local AI Infrastructure for DictaLM-3.0**

**BricksLLM** is a specialized, cloud-native AI gateway optimized for the local deployment and management of the **DictaLM-3.0** model. This project provides a complete, containerized infrastructure that orchestrates:

-   **DictaLM-3.0 Inference**: Runs the `dictalm-3.0-24b-thinking-fp8-q4_k_m.gguf` model via a dedicated `llama-server` container (Dockerized Llama.cpp with CUDA support).
-   **AI Gateway**: A Go-based proxy that manages rate limiting, cost control, caching, and API key authentication between clients and the model.
-   **Frontend Demo**: A lightweight, hot-reloading chat interface for interacting with DictaLM, demonstrating reasoning capabilities (`<think>` tags) and tool use.
-   **Data Persistence**: PostgreSQL and Redis containers for storing configuration, logs, and cache data.

This setup is specifically designed for local usage, leveraging Docker Compose to spin up the entire stack with a single command. It acts as a production-ready template for deploying DictaLM with enterprise-grade management features.

## 🚀 Server Management Rules (CRITICAL)

### Rule 1: Stop Before Start
To ensure a clean state and prevent "Address already in use" errors (especially with port bindings like 8003 or 5002), strict server management discipline is enforced.

**Protocol:**
Before executing the `start.sh` script or any command that starts server services (like `docker compose up`), you **MUST ALWAYS** first stop any running server instances.

**Required Workflow:**
```bash
./stop.sh  # 1. Cleans up old containers and releases ports
./start.sh # 2. Starts the fresh stack
```

**Rationale:**
This prevents port binding conflicts and ensures that configuration changes (like volume bindings, environment variables, or hot-reload settings) are correctly applied to recreated containers.

## 🛠️ Technical Stack & Operations Guide

### 1. Stack Deployment Process

The deployment is orchestrated by the `start.sh` script, which ensures a consistent and error-free initialization of the environment using Docker Compose.

**Deployment Sequence:**
1.  **Prerequisite Validation**: Checks for Docker, NVIDIA drivers (for GPU support), and essential configuration files (`.env`, `docker-compose.yml`).
2.  **Resource Check**: Verifies available GPU resources and disk space to ensure the model can be loaded.
3.  **Configuration Validation**: Ensures all required environment variables are set in `.env`.
4.  **Service Initialization**:
    -   Executes `docker compose up -d` to start the backend services (`postgresql`, `redis`, `llama-server`, `bricksllm`, `swagger-ui`).
    -   Starts the frontend container (`frontend`).
5.  **Health Verification**:
    -   Polls the health endpoints of each service (`pg_isready`, `redis-cli ping`, `curl health`).
    -   **Critical Step**: Waits for `llama-server` to fully load the DictaLM model into memory (indicated by a healthy HTTP 200 response).
6.  **Integration Testing**: Runs a suite of internal tests (`test-stack.sh`) to verify connectivity between the proxy, the model, and the database.
7.  **Access Information**: Prints the available URLs for all services.

### 2. Service Endpoints

#### Frontend UI
-   **URL**: `http://localhost:8003`
-   **Access**: Browser-based chat interface.

#### BricksLLM Proxy API
The primary entry point for AI applications.
-   **Base URL**: `http://localhost:8002`
-   **Auth**: Bearer Token (API Key required)
-   **Key Endpoint**: 
    -   `POST /api/custom/providers/llama-cpp-root/chat/completions`
    -   **Payload**: OpenAI-compatible JSON (messages, model, tools).
    -   **Response**: Streaming or JSON completion with `<think>` tags.

#### BricksLLM Admin API
Used for configuration and management.
-   **Base URL**: `http://localhost:8001`
-   **Auth**: None (Local default) / Configurable
-   **Key Endpoints**:
    -   `GET /api/health`: System health status.
    -   `PUT /api/key-management/keys`: Create/Update API keys.
    -   `PUT /api/provider-settings`: Configure LLM providers.
    -   `GET /api/events`: Retrieve usage logs and analytics.

#### Llama Server (Direct)
Direct access to the model (bypassing the gateway).
-   **Base URL**: `http://localhost:5002`
-   **Endpoint**: `POST /v1/chat/completions`
-   **Auth**: Bearer token (optional/ignored by default server config, but header may be required).

### 3. Model Loading Process

**Mechanism**:
Upon container start, the `llama-server` maps the GGUF model file from the host filesystem to the container and begins loading it into GPU VRAM (and system RAM if VRAM is insufficient).

**Timing & Readiness**:
-   **Duration**: Typically **10-45 seconds**, depending on disk speed (NVMe recommended) and model size (24B parameters).
-   **Readiness Check**: The container will report as "healthy" only when the model is fully loaded and the HTTP server is accepting requests.

> **⚠️ CRITICAL WARNING:**
> **DO NOT** attempt to interact with the frontend or API endpoints until the `start.sh` script explicitly reports that all services are **HEALTHY**.
> Premature interaction while the model is loading will result in `Connection Refused` or `502 Bad Gateway` errors and may require a stack restart.

### 4. Operational Considerations

**System Requirements**:
-   **GPU**: NVIDIA GPU with **16GB+ VRAM** (24GB recommended for full offload of the 24B parameter model).
-   **RAM**: 32GB+ System RAM (if partial CPU offloading is required).
-   **Disk**: Fast NVMe SSD (critical for model loading times).

**Performance**:
-   **Inference**: The system uses `llama.cpp` with CUDA acceleration. Performance scales with the number of GPU layers offloaded (`--n-gpu-layers`).
-   **Context Window**: Default configured to 8192 tokens. Increasing this will significantly increase VRAM usage.

## 🏗️ Codebase Structure and Technical Architecture

This section provides a comprehensive breakdown of the project's organization, technical stack, and component relationships.

### 1. Codebase Structure Tree

The project is organized into functional areas: Core Go Application, Frontend Interface, and Deployment Configuration.

```
BricksLLM/
├── cmd/
│   └── bricksllm/              # Main application entry point
│       └── main.go             # Bootstraps Admin and Proxy servers
├── internal/                   # Core business logic (Go)
│   ├── config/                 # Configuration loading (env, file)
│   ├── event/                  # Event bus and logging system
│   ├── key/                    # API key validation logic
│   ├── manager/                # State management (keys, providers, routes)
│   ├── message/                # Pub/sub messaging system
│   ├── provider/               # LLM Provider integrations
│   │   ├── custom/             # Custom provider logic (used for DictaLM)
│   │   ├── openai/             # OpenAI adapter
│   │   └── ...                 # Other providers (Anthropic, vLLM, etc.)
│   ├── route/                  # Request routing and failover logic
│   ├── server/                 # HTTP Server implementations
│   │   ├── web/
│   │       ├── admin/          # Admin API endpoints (Port 8001)
│   │       └── proxy/          # Proxy API endpoints (Port 8002)
│   ├── storage/                # Data persistence layer
│   │   ├── postgresql/         # SQL database implementations
│   │   └── redis/              # Cache implementations
│   └── validator/              # Request validation (Rate limits, Cost)
├── frontend/                   # Frontend Chat Application
│   ├── index.html              # Main UI structure
│   ├── index.js                # Chat logic and API integration
│   ├── style.css               # UI Styling
│   └── package.json            # Build scripts (cache versioning)
├── .env.template               # Template for environment variables
├── chat_template.jinja2.template # ChatML template for DictaLM
├── docker-compose.yml          # Container orchestration config
├── Dockerfile.prod             # BricksLLM Go binary build definition
├── llama_entrypoint.sh         # Startup script for Llama Server container
├── start.sh                    # Master deployment script
├── stop.sh                     # Cleanup and shutdown script
└── test-stack.sh               # Integration testing suite
```

### 2. Technical Architecture Diagram

The system operates as a cohesive stack of containerized services, orchestrated by Docker Compose.

```ascii
                                  [ User Browser ]
                                         │
                                         ▼
                             [ Frontend Container (8003) ]
                             (Hot-reloadable static server)
                                         │
                                         ▼
[ External API Client ] ────► [ BricksLLM Proxy (8002) ] ◄────► [ Redis Cache (6380) ]
                                         │                       (Rate Limits, Responses)
                                         ▼
                             [ Llama Server (5002) ]
                             (DictaLM-3.0 Inference)
                             (CUDA / GPU Accelerated)
                                         │
                                         ▼
                                  [ GPU Hardware ]

-----------------------------------------------------------------------------------

[ Admin Dashboard/CLI ] ────► [ BricksLLM Admin (8001) ] ◄────► [ PostgreSQL (5433) ]
                                                                 (Config, Logs, Keys)
```

## 🔐 Environment Variables Configuration

This section documents the critical environment variables used to configure the BricksLLM stack.

### Variable Reference Table

| Variable Name | Default Value | Required | Purpose | Used In |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL** | | | | |
| `POSTGRESQL_USERNAME` | `postgres` | Yes | Database user for BricksLLM metadata. | `.env`, `docker-compose.yml` |
| `POSTGRESQL_PASSWORD` | `postgres` | Yes | Database password. **Security Warning: Change in production.** | `.env`, `docker-compose.yml` |
| `POSTGRESQL_DB` | `bricksllm` | Yes | Name of the database to create/use. | `.env`, `docker-compose.yml` |
| `POSTGRESQL_HOST_PORT` | `5433` | Yes | Host port mapping for PostgreSQL. | `.env`, `docker-compose.yml` |
| **Redis** | | | | |
| `REDIS_PASSWORD` | (Complex String) | Yes | Password for Redis authentication. | `.env`, `docker-compose.yml` |
| `REDIS_HOST_PORT` | `6380` | Yes | Host port mapping for Redis. | `.env`, `docker-compose.yml` |
| **Llama Server** | | | | |
| `LLAMA_IMAGE` | `ghcr.io/ggml-org/llama.cpp:server-cuda` | Yes | Docker image for the inference engine. | `.env`, `docker-compose.yml` |
| `LLAMA_HOST_PORT` | `5002` | Yes | Host port for direct model access. | `.env`, `docker-compose.yml` |
| `HF_FILE` | `dictalm...gguf` | Yes | Filename of the GGUF model to load. | `.env`, `docker-compose.yml` |
| `LOCAL_MODEL_PATH` | `./models` | Yes | Host path containing the model file. | `.env`, `docker-compose.yml` |
| `CONTEXT_SIZE` | `8192` | No | Context window size in tokens. | `.env`, `docker-compose.yml` |
| `N_GPU_LAYERS` | `99` | No | Number of layers to offload to GPU. | `.env`, `docker-compose.yml` |
| `SYSTEM_PROMPT` | "You are DictaLM..." | No | Base system instruction injected into the chat template. | `.env`, `llama_entrypoint.sh` |
| **BricksLLM Gateway** | | | | |
| `BRICKSLLM_MODE` | `production` | Yes | Operational mode (`development` or `production`). | `.env`, `docker-compose.yml` |
| `BRICKSLLM_ADMIN_PORT`| `8001` | Yes | Host port for the Admin API. | `.env`, `docker-compose.yml` |
| `BRICKSLLM_PROXY_PORT`| `8002` | Yes | Host port for the Proxy API. | `.env`, `docker-compose.yml` |

## 📥 Model Download Instructions

### Downloading the DictaLM-3.0 GGUF Model

Before running the BricksLLM stack, you need to download the DictaLM-3.0 GGUF model file and place it in the correct directory.

#### Step 1: Create the Model Directory
```bash
# Create the models directory (if it doesn't exist)
mkdir -p ./models

# Or create a custom directory and update LOCAL_MODEL_PATH in .env
mkdir -p /path/to/your/local/model/directory
```

#### Step 2: Download the Model File

Download the DictaLM-3.0-24B-Thinking-FP8-Q4_0-GGUF model using one of these methods:

**Model File Details:**
- **Size**: 13.4 GB
- **SHA256**: `41353ca50fb02be915a7924c0e98061b8657f685c6fcb9a25c522a682cb77732`

**Using wget:**
```bash
wget https://huggingface.co/VRDate/DictaLM-3.0-24B-Thinking-FP8-Q4_0-GGUF/resolve/main/dictalm-3.0-24b-thinking-fp8-q4_0.gguf -O ./models/dictalm-3.0-24b-thinking-fp8-q4_0.gguf
```

**Using curl:**
```bash
curl -L https://huggingface.co/VRDate/DictaLM-3.0-24B-Thinking-FP8-Q4_0-GGUF/resolve/main/dictalm-3.0-24b-thinking-fp8-q4_0.gguf -o ./models/dictalm-3.0-24b-thinking-fp8-q4_0.gguf
```

**For custom directory (update LOCAL_MODEL_PATH in .env):**
```bash
curl -L https://huggingface.co/VRDate/DictaLM-3.0-24B-Thinking-FP8-Q4_0-GGUF/resolve/main/dictalm-3.0-24b-thinking-fp8-q4_0.gguf -o /path/to/your/local/model/directory/dictalm-3.0-24b-thinking-fp8-q4_0.gguf
```

#### Step 3: Verify the Download

Check that the model file was downloaded correctly:
```bash
ls -la ./models/
# Should show: dictalm-3.0-24b-thinking-fp8-q4_0.gguf

# Check file size (should be ~13-14GB)
du -h ./models/dictalm-3.0-24b-thinking-fp8-q4_0.gguf
```

#### Step 4: Update Environment Configuration

Ensure your `.env` file has the correct model configuration:
```bash
# For default models directory
LOCAL_MODEL_PATH=./models
HF_FILE=dictalm-3.0-24b-thinking-fp8-q4_0.gguf

# Or for custom directory
LOCAL_MODEL_PATH=/path/to/your/local/model/directory
HF_FILE=dictalm-3.0-24b-thinking-fp8-q4_0.gguf
```

### Alternative Models

You can also use other GGUF format models by:
1. Downloading the desired model file
2. Placing it in your `LOCAL_MODEL_PATH` directory
3. Updating `HF_FILE` in your `.env` to match the filename
4. Adjusting `CONTEXT_SIZE` and `N_GPU_LAYERS` as needed for the new model

## 💻 Frontend Documentation

### Overview
The BricksLLM frontend is a lightweight, single-page application (SPA) designed to demonstrate the capabilities of the BricksLLM gateway and the underlying DictaLM model. It provides a chat interface that supports reasoning visualization (via `<think>` tags) and integrates directly with the BricksLLM proxy.

### API Integration

#### Configuration
The frontend uses the following hardcoded configuration to connect to the BricksLLM proxy. These settings match the custom provider and key configured in the backend.

**Provider Setting (Custom):**
- **Provider Name**: `llama-cpp-root`
- **URL**: `http://llama-server:5002`
- **Setting ID**: (Auto-generated by setup script)

**API Key:**
- **Key**: `sk-bricksllm-frontend-llama-key-explicit`
- **Name**: `Frontend Llama Key`
- **Allowed Path**: `/chat/completions`

#### Endpoint
The frontend communicates with the BricksLLM proxy via the following endpoint:
- **URL**: `http://localhost:8002/api/custom/providers/llama-cpp-root/chat/completions`
- **Method**: `POST`
- **Headers**:
  - `Authorization`: `Bearer sk-bricksllm-frontend-llama-key-explicit` (Key configured for the custom provider)
  - `Content-Type`: `application/json`

### Deployment

#### Docker Configuration
The frontend is defined as a service in `docker-compose.yml`:
- **Image**: `node:18-alpine`
- **Container Name**: `dictachat-frontend`
- **Port Mapping**: Host port `8003` -> Container port `8003`
- **Volume**: Binds the local `frontend` directory to `/app` in the container for hot-reloading.

#### Development Mode (Hot Reload)
- **Command**: The container runs a shell command that checks `NODE_ENV`.
  - If `development`: Runs `bun run build` (updates cache version) and starts `http-server` with caching disabled (`-c-1`).
  - If `production`: Starts `http-server` with default caching.
- **Environment Variable**: `NODE_ENV=development` is set in `docker-compose.yml` to enable hot-reloading behavior.

---

<p align="center">
  <a href="https://discord.gg/dFvdt4wqWh"><img src="https://img.shields.io/badge/discord-BricksLLM-blue?logo=discord&labelColor=2EB67D" alt="Join BricksLLM on Discord"></a>
  <a href="https://github.com/bricks-cloud/bricks/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-red" alt="License"></a>
</p>
