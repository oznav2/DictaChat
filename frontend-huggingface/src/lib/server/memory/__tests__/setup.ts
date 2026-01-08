/**
 * Test Setup for Memory System Tests
 *
 * Sets up environment variables and global test utilities
 */

// Set benchmark mode to disable certain features during testing
process.env.MEMORY_BENCHMARK_MODE = 'true';
process.env.NODE_ENV = 'test';

// Disable actual LLM calls during tests
process.env.MOCK_LLM = 'true';
process.env.MOCK_EMBEDDINGS = 'true';

// Test database configuration
process.env.TEST_MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bricksllm_test';
process.env.TEST_QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
process.env.TEST_REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Global test utilities
import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// Mock console methods to reduce noise during tests
const originalConsole = { ...console };

beforeAll(() => {
	// Optionally silence console during tests
	if (process.env.SILENT_TESTS === 'true') {
		console.log = vi.fn();
		console.info = vi.fn();
		console.debug = vi.fn();
	}
});

afterAll(() => {
	// Restore console
	Object.assign(console, originalConsole);
});

afterEach(() => {
	// Clear all mocks between tests
	vi.clearAllMocks();
});

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
