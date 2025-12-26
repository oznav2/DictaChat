FROM node:20-alpine

# Install system dependencies for MCP servers
# - python3, py3-pip: Python runtime for uvx-based servers
# - curl: For downloading uv installer
# - git: Required for mcp-server-git
# - docker-cli: Required for mcp-server-docker (will use host Docker socket)
RUN apk add --no-cache python3 py3-pip curl git docker-cli && \
    curl -LsSf https://astral.sh/uv/install.sh | sh && \
    ln -sf /root/.local/bin/uv /usr/local/bin/uv && \
    ln -sf /root/.local/bin/uvx /usr/local/bin/uvx

# Prebuild a dedicated Python venv for DataGov MCP and install core deps
# Added curl_cffi for browser TLS impersonation to bypass 403 blocks
RUN uv venv /opt/datagov-venv && \
    uv pip install --python /opt/datagov-venv "fastmcp>=2.8.1" "requests>=2.32.4" "curl_cffi>=0.5.10"

WORKDIR /app

# Copy package files and install Node.js dependencies
COPY package.json ./
RUN npm install --production --legacy-peer-deps

# Copy application code and configuration
COPY server.js ./
COPY config/ ./config/

# Create data directories for MCP servers that need persistent storage
# - /app/data/memory: For @modelcontextprotocol/server-memory
# - /app/uploads: For @modelcontextprotocol/server-filesystem
# - /app/sandbox: For @modelcontextprotocol/server-filesystem (sandbox directory)
RUN mkdir -p /app/data/memory /app/uploads /app/sandbox

# Expose SSE proxy port
EXPOSE 3100

# Start the server
CMD ["npm", "start"]
