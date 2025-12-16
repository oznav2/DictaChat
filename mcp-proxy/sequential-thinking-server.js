#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import express from 'express';

const PORT = process.env.PORT || 3001;
const app = express();
app.use(express.json());

let mcpClient = null;
const sessions = new Map();

async function initializeMcpClient() {
  if (mcpClient) return mcpClient;

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    stderr: 'inherit'
  });

  mcpClient = new Client({
    name: 'sequential-thinking-proxy',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  await mcpClient.connect(transport);
  return mcpClient;
}

app.get('/sse', async (req, res) => {
  try {
    if (!mcpClient) {
      await initializeMcpClient();
    }

    const transport = new SSEServerTransport('/sse', res);
    const server = new Server({
      name: 'sequential-thinking-server',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });

    server.setRequestHandler('tools/list', async () => {
      return await mcpClient.request({ method: 'tools/list' }, {});
    });

    server.setRequestHandler('tools/call', async (request) => {
      return await mcpClient.request({
        method: 'tools/call',
        params: request.params
      }, {});
    });

    sessions.set(transport.sessionId, transport);

    await server.connect(transport);

    req.on('close', async () => {
      sessions.delete(transport.sessionId);
      await server.close();
    });

  } catch (error) {
    if (!res.headersSent) {
      res.status(500).end();
    }
  }
});

app.post('/sse', async (req, res) => {
  try {
    const sessionId = req.query.sessionId;

    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(404).end('Session not found');
    }

    const transport = sessions.get(sessionId);
    await transport.handlePostMessage(req, res, req.body);

  } catch (error) {
    if (!res.headersSent) {
      res.status(500).end();
    }
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    server: 'sequential-thinking',
    transport: 'sse',
    endpoint: '/sse'
  });
});

app.listen(PORT, '0.0.0.0');

process.on('SIGTERM', async () => {
  if (mcpClient) {
    await mcpClient.close();
  }
  process.exit(0);
});
