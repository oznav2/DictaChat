#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import fs from 'fs/promises';

const PORT = process.env.PORT || 3100;
const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/servers.json';

// Default configuration values
const DEFAULTS = {
  timeout: 120000, // 2 minutes
  retries: 2,
  retryDelay: 1000, // 1 second
  capabilities: {
    tools: {},
    prompts: {},
    resources: {},
    logging: {}
  }
};

const app = express();
app.use(express.json());

const mcpClients = new Map();
const sessions = new Map();

function substituteEnvVars(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] || '');
  }
  if (Array.isArray(obj)) {
    return obj.map(item => substituteEnvVars(item));
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVars(value);
    }
    return result;
  }
  return obj;
}

function validateAndNormalizeConfig(serverName, serverConfig) {
  const tag = serverName.toUpperCase();
  const normalized = { ...serverConfig };

  // Apply defaults
  normalized.timeout = normalized.timeout || DEFAULTS.timeout;
  normalized.retries = normalized.retries !== undefined ? normalized.retries : DEFAULTS.retries;
  normalized.retryDelay = normalized.retryDelay || DEFAULTS.retryDelay;

  // Normalize server type
  normalized.type = normalized.type || 'stdio';

  // Validate stdio servers have required fields
  if (!normalized.type || normalized.type === 'stdio') {
    if (!normalized.command) {
      console.error(`[${tag}] WARNING: stdio server missing 'command' field, may fail to start`);
    }
    normalized.args = normalized.args || [];
    normalized.env = normalized.env || {};
  }

  // Validate SSE/HTTP servers have required fields
  if (normalized.type === 'sse' || normalized.type === 'external_sse' ||
      normalized.type === 'streamable_http' || normalized.type === 'external_http') {
    if (!normalized.url) {
      console.error(`[${tag}] WARNING: ${normalized.type} server missing 'url' field, may fail to start`);
    }
    normalized.headers = normalized.headers || {};
  }

  // Normalize capabilities
  normalized.capabilities = normalized.capabilities || {};
  if (typeof normalized.capabilities !== 'object') {
    normalized.capabilities = {};
  }

  return normalized;
}

async function loadConfig() {
  const data = await fs.readFile(CONFIG_PATH, 'utf8');
  const config = JSON.parse(data);
  return substituteEnvVars(config);
}

async function initializeMcpClient(serverName, serverConfig) {
  const tag = serverName.toUpperCase();

  const timestamp = new Date().toISOString();

  if (mcpClients.has(serverName)) {
    console.log(`[${timestamp}] [${tag}] [SESSION-CACHE] Reusing existing client (cached session)`);
    return mcpClients.get(serverName);
  }

  // Validate and normalize configuration
  const config = validateAndNormalizeConfig(serverName, serverConfig);

  console.log(`[${timestamp}] [${tag}] [CLIENT-INIT] Creating new MCP client`);
  console.log(`[${timestamp}] [${tag}] [CLIENT-INIT] Server type:`, config.type);
  console.log(`[${timestamp}] [${tag}] [CLIENT-INIT] Environment vars:`, JSON.stringify(config.env || {}));

  let transport;
  const serverType = config.type;

  // Create appropriate transport based on type
  if (serverType === 'sse' || serverType === 'external_sse') {
    console.log(`[${tag}] Creating SSE client transport`);
    console.log(`[${tag}] URL:`, config.url);

    transport = new SSEClientTransport(
      new URL(config.url),
      config.headers
    );
  } else if (serverType === 'streamable_http' || serverType === 'external_http') {
    console.log(`[${tag}] Creating Streamable HTTP client transport`);
    console.log(`[${tag}] URL:`, config.url);

    // Streamable HTTP not yet implemented - graceful fallback
    console.error(`[${tag}] WARNING: Streamable HTTP transport not yet implemented, server may not function`);
    throw new Error(`Streamable HTTP transport not yet implemented for ${serverName}`);
  } else {
    // Default: stdio transport
    console.log(`[${tag}] Creating stdio client transport`);
    console.log(`[${tag}] Command:`, config.command, config.args);

    transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env },
      stderr: 'inherit'
    });
  }

  const client = new Client(
    {
      name: `${serverName}-proxy`,
      version: '1.0.0'
    },
    {
      capabilities: {}
    }
  );

  // Retry logic with exponential backoff
  console.log(`[${tag}] Connecting client to transport...`);
  let lastError;
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = config.retryDelay * Math.pow(2, attempt - 1);
        console.log(`[${tag}] Retry attempt ${attempt}/${config.retries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      await client.connect(transport);
      console.log(`[${tag}] Client connected successfully`);
      mcpClients.set(serverName, client);
      return client;
    } catch (err) {
      lastError = err;
      console.error(`[${tag}] Connection attempt ${attempt + 1} failed:`, err.message);

      if (attempt === config.retries) {
        console.error(`[${tag}] All retry attempts exhausted`);
        throw err;
      }
    }
  }

  throw lastError;
}

app.get('/:serverName/sse', async (req, res) => {
  const { serverName } = req.params;
  const tag = serverName.toUpperCase();

  try {
    console.log(`[${tag}] GET request received`);
    const config = await loadConfig();
    const serverConfig = config.servers[serverName];

    if (!serverConfig) {
      console.error(`[${tag}] Server not found in configuration`);
      return res.status(404).end('Server not found');
    }

    const serverType = serverConfig.type || 'stdio';
    console.log(`[${tag}] Server type: ${serverType}`);
    console.log(`[${tag}] Initializing MCP client`);
    const mcpClient = await initializeMcpClient(serverName, serverConfig);

    console.log(`[${tag}] Creating SSE server transport for frontend`);
    const transport = new SSEServerTransport(`/${serverName}/sse`, res);

    console.log(`[${tag}] Creating MCP server instance`);

    // Validate and normalize config for capabilities
    const normalizedConfig = validateAndNormalizeConfig(serverName, serverConfig);

    const server = new Server({
      name: serverName,
      version: '1.0.0'
    }, {
      capabilities: {
        tools: normalizedConfig.capabilities?.tools || {},
        prompts: normalizedConfig.capabilities?.prompts || {},
        resources: normalizedConfig.capabilities?.resources || {},
        logging: normalizedConfig.capabilities?.logging || {}
      }
    });

    console.log(`[${tag}] Setting up request handlers`);

    // Tools handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.log(`[${tag}] Handling tools/list request`);
      try {
        const result = await mcpClient.listTools();
        console.log(`[${tag}] tools/list returned ${result.tools?.length || 0} tools`);
        return result;
      } catch (err) {
        console.error(`[${tag}] WARNING: tools/list failed:`, err.message);
        return { tools: [] };
      }
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${tag}] Handling tools/call request for tool: ${request.params.name}`);
      console.log(`[${timestamp}] [${tag}] [MCP-REQUEST] Tool: ${request.params.name}, Args: ${JSON.stringify(request.params.arguments || {})}`);

      try {
        const result = await mcpClient.callTool(request.params);
        const responseTimestamp = new Date().toISOString();

        console.log(`[${responseTimestamp}] [${tag}] [MCP-RAW-RESPONSE] ${JSON.stringify(result, null, 2)}`);
        console.log(`[${responseTimestamp}] [${tag}] tools/call completed successfully`);

        return result;
      } catch (err) {
        const errorTimestamp = new Date().toISOString();
        console.error(`[${errorTimestamp}] [${tag}] [MCP-ERROR] tools/call failed:`, err.message);
        console.error(`[${errorTimestamp}] [${tag}] [MCP-ERROR] Stack:`, err.stack);
        throw err;
      }
    });

    // Prompts handlers
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      console.log(`[${tag}] Handling prompts/list request`);
      try {
        const result = await mcpClient.listPrompts();
        console.log(`[${tag}] prompts/list returned ${result.prompts?.length || 0} prompts`);
        return result;
      } catch (err) {
        console.error(`[${tag}] WARNING: prompts/list failed:`, err.message);
        return { prompts: [] };
      }
    });

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      console.log(`[${tag}] Handling prompts/get request for: ${request.params.name}`);
      try {
        const result = await mcpClient.getPrompt(request.params);
        console.log(`[${tag}] prompts/get completed`);
        return result;
      } catch (err) {
        console.error(`[${tag}] WARNING: prompts/get failed:`, err.message);
        throw err;
      }
    });

    // Resources handlers
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      console.log(`[${tag}] Handling resources/list request`);
      try {
        const result = await mcpClient.listResources();
        console.log(`[${tag}] resources/list returned ${result.resources?.length || 0} resources`);
        return result;
      } catch (err) {
        console.error(`[${tag}] WARNING: resources/list failed:`, err.message);
        return { resources: [] };
      }
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      console.log(`[${tag}] Handling resources/read request for: ${request.params.uri}`);
      try {
        const result = await mcpClient.readResource(request.params);
        console.log(`[${tag}] resources/read completed`);
        return result;
      } catch (err) {
        console.error(`[${tag}] WARNING: resources/read failed:`, err.message);
        throw err;
      }
    });

    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      console.log(`[${tag}] Handling resources/templates/list request`);
      try {
        const result = await mcpClient.listResourceTemplates();
        console.log(`[${tag}] resources/templates/list returned ${result.resourceTemplates?.length || 0} templates`);
        return result;
      } catch (err) {
        console.error(`[${tag}] WARNING: resources/templates/list failed:`, err.message);
        return { resourceTemplates: [] };
      }
    });

    const sessionKey = `${serverName}:${transport.sessionId}`;
    sessions.set(sessionKey, { transport, server });
    console.log(`[${tag}] Session created: ${sessionKey}`);

    console.log(`[${tag}] Connecting server to SSE transport`);
    await server.connect(transport);
    console.log(`[${tag}] Proxy ready (${serverType} -> SSE)`);

    req.on('close', async () => {
      console.log(`[${tag}] Session closing: ${sessionKey}`);
      sessions.delete(sessionKey);
      try {
        await server.close();
      } catch (err) {
        console.error(`[${tag}] Error closing server:`, err);
      }
    });

  } catch (error) {
    console.error(`[${tag}] Error in GET handler:`, error);
    console.error(`[${tag}] Error stack:`, error.stack);
    if (!res.headersSent) {
      res.status(500).end(String(error));
    }
  }
});

app.post('/:serverName/sse', async (req, res) => {
  const { serverName } = req.params;
  const sessionId = req.query.sessionId;
  const tag = serverName.toUpperCase();

  try {
    const sessionKey = `${serverName}:${sessionId}`;

    if (!sessionId || !sessions.has(sessionKey)) {
      console.error(`[${tag}] Session not found: ${sessionKey}`);
      return res.status(404).end('Session not found');
    }

    const { transport } = sessions.get(sessionKey);
    await transport.handlePostMessage(req, res, req.body);

  } catch (error) {
    console.error(`[${tag}] Error in POST handler:`, error);
    if (!res.headersSent) {
      res.status(500).end(String(error));
    }
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    servers: Array.from(mcpClients.keys()),
    activeSessions: sessions.size
  });
});

app.listen(PORT, '0.0.0.0', async () => {
  try {
    const config = await loadConfig();
  } catch (error) {
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  for (const client of mcpClients.values()) {
    try {
      await client.close();
    } catch (err) {}
  }
  process.exit(0);
});
