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

WORKDIR /app

# Copy package files and install Node.js dependencies
COPY package.json ./
RUN npm install --production

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
