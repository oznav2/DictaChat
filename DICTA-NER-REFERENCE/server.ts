import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config, isProduction } from './config/env.js';
import { HuggingFaceEmbeddingService } from './services/embedding.service.js';
import { SemanticSearchService } from './services/search.service.js';
import { CachedEmbeddingService } from './services/cache.service.js';
import { SemanticSearchController } from './controllers/search.controller.js';

/**
 * Create and configure Fastify server
 */
export async function createServer() {
  // Create Fastify instance with logging
  const server = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.LOG_PRETTY && !isProduction()
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
              colorize: true,
            },
          }
        : undefined,
    },
    trustProxy: true,
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
    requestIdHeader: 'x-request-id',
  });

  // Register CORS
  await server.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN,
    credentials: config.CORS_CREDENTIALS,
  });

  // Register Helmet for security headers
  await server.register(helmet, {
    contentSecurityPolicy: isProduction()
      ? undefined
      : false,
  });

  // Register rate limiting
  await server.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
  });

  // Initialize services
  server.log.info('Initializing services...');

  const embeddingService = new HuggingFaceEmbeddingService(server.log);
  const initResult = await embeddingService.initialize();

  if (!initResult.success) {
    server.log.error({ error: initResult.error }, 'Failed to initialize embedding service');
    throw new Error('Service initialization failed');
  }

  const cachedEmbeddingService = new CachedEmbeddingService(
    embeddingService,
    server.log
  );

  const searchService = new SemanticSearchService(
    cachedEmbeddingService as any, // Type compatibility workaround
    server.log
  );

  const controller = new SemanticSearchController(
    searchService,
    cachedEmbeddingService
  );

  server.log.info('Services initialized successfully');

  // Register routes
  
  // Health check
  server.get('/health', async (request, reply) => {
    return controller.health(request, reply);
  });

  // Root endpoint
  server.get('/', async () => {
    return {
      service: 'Hebrew Semantic Search',
      version: '1.0.0',
      model: config.MODEL_NAME,
      endpoints: {
        health: 'GET /health',
        embedding: 'POST /api/v1/embedding',
        batchEmbedding: 'POST /api/v1/batch-embedding',
        similarity: 'POST /api/v1/similarity',
        search: 'POST /api/v1/search',
        cacheStats: 'GET /api/v1/cache/stats',
        clearCache: 'POST /api/v1/cache/clear',
      },
    };
  });

  // API v1 routes
  
  // Generate single embedding
  server.post('/api/v1/embedding', async (request, reply) => {
    return controller.generateEmbedding(request, reply);
  });

  // Generate batch embeddings
  server.post('/api/v1/batch-embedding', async (request, reply) => {
    return controller.generateBatchEmbeddings(request, reply);
  });

  // Compute similarity
  server.post('/api/v1/similarity', async (request, reply) => {
    return controller.computeSimilarity(request, reply);
  });

  // Semantic search
  server.post('/api/v1/search', async (request, reply) => {
    return controller.search(request, reply);
  });

  // Cache management
  server.get('/api/v1/cache/stats', async (request, reply) => {
    return controller.getCacheStats(request, reply);
  });

  server.post('/api/v1/cache/clear', async (request, reply) => {
    return controller.clearCache(request, reply);
  });

  // Global error handler
  server.setErrorHandler((error, request, reply) => {
    request.log.error({ error, requestId: request.id }, 'Unhandled error');

    // Rate limit error
    if (error.statusCode === 429) {
      reply.code(429).send({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again later.',
      });
      return;
    }

    // Validation errors
    if (error.validation) {
      reply.code(400).send({
        error: 'Validation error',
        details: error.validation,
      });
      return;
    }

    // Generic error
    reply.code(error.statusCode ?? 500).send({
      error: isProduction() ? 'Internal server error' : error.message,
      requestId: request.id,
    });
  });

  // Graceful shutdown handler
  const closeGracefully = async (signal: string) => {
    server.log.info({ signal }, 'Received shutdown signal, closing server gracefully');
    
    await server.close();
    
    server.log.info('Server closed');
    process.exit(0);
  };

  process.on('SIGTERM', () => closeGracefully('SIGTERM'));
  process.on('SIGINT', () => closeGracefully('SIGINT'));

  return server;
}

/**
 * Start the server
 */
export async function startServer() {
  try {
    const server = await createServer();

    await server.listen({
      port: config.PORT,
      host: config.HOST,
    });

    server.log.info(
      {
        port: config.PORT,
        host: config.HOST,
        model: config.MODEL_NAME,
        provider: config.MODEL_PROVIDER,
      },
      'Server started successfully'
    );
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}