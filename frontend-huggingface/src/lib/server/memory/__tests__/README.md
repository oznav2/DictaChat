# Memory System Test Suite

Comprehensive test suite for the BricksLLM Memory System, adapted from roampal benchmarks.

## Directory Structure

```
__tests__/
├── setup.ts                 # Test environment setup
├── vitest.config.ts         # Vitest configuration
├── mock-utilities.ts        # Mock services and test helpers
├── run-tests.ts             # Test runner and report generator
├── README.md                # This file
│
├── unit/                    # Unit tests
│   ├── unified-memory-facade.test.ts
│   ├── search-service.test.ts
│   └── outcome-service.test.ts
│
├── benchmarks/              # Performance benchmarks
│   ├── latency-benchmark.test.ts
│   ├── comprehensive-benchmark.test.ts
│   └── torture-suite.test.ts
│
└── test-results/            # Generated reports (gitignored)
    ├── consolidated-report.txt
    ├── consolidated-report.json
    ├── latency-benchmark-report.txt
    ├── comprehensive-benchmark-report.txt
    └── torture-test-report.txt
```

## Running Tests

### Run All Tests

```bash
cd frontend-huggingface
npx vitest run --config src/lib/server/memory/__tests__/vitest.config.ts
```

### Run Unit Tests Only

```bash
npx vitest run src/lib/server/memory/__tests__/unit --config src/lib/server/memory/__tests__/vitest.config.ts
```

### Run Benchmarks Only

```bash
npx vitest run src/lib/server/memory/__tests__/benchmarks --config src/lib/server/memory/__tests__/vitest.config.ts
```

### Run Specific Test File

```bash
npx vitest run src/lib/server/memory/__tests__/unit/unified-memory-facade.test.ts
```

### Watch Mode (Development)

```bash
npx vitest --config src/lib/server/memory/__tests__/vitest.config.ts
```

## Test Categories

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `unified-memory-facade.test.ts` | Facade initialization, search, store, goals/values, books, context services |
| `search-service.test.ts` | Hybrid search, sort modes, tier resolution, position tracking |
| `outcome-service.test.ts` | Outcome recording, protected tiers, related memory resolution |

### Benchmarks

| Benchmark | Description | Targets |
|-----------|-------------|---------|
| `latency-benchmark.test.ts` | Latency measurements | P50 < 100ms, P95 < 300ms, P99 < 500ms |
| `comprehensive-benchmark.test.ts` | 4 conditions × 5 maturity levels | MRR > 0.5, nDCG > 0.6, P@5 > 0.4 |
| `torture-suite.test.ts` | Stress tests and edge cases | 10 torture scenarios |

## Mock Utilities

The `mock-utilities.ts` file provides:

- **MockEmbeddingService**: Deterministic embeddings with seeded RNG
- **MockLLMService**: Rule-based response generation
- **MockTimeManager**: Time manipulation for testing
- **MockCollection**: In-memory vector collection with cosine similarity
- **TestHarness**: Test execution and report generation
- **Metrics**: MRR, nDCG@K, Precision@K calculations

### Usage Example

```typescript
import {
  MockEmbeddingService,
  MockCollection,
  createTestFragment,
  calculateAllMetrics,
  MATURITY_LEVELS
} from '../mock-utilities';

const embedding = new MockEmbeddingService();
const collection = new MockCollection(embedding);

// Create test data
const fragment = createTestFragment({
  maturity: 'established',
  content: 'Test content'
});

await collection.add(fragment);

// Search and measure
const results = await collection.search('query', 5);
const metrics = calculateAllMetrics(
  results.map(r => r.document.id),
  new Set(['expected_id']),
  5
);
```

## Report Formats

### Text Report

Human-readable format with:
- Summary statistics
- Per-suite breakdown
- Pass/fail status
- Latency metrics

### JSON Report

Machine-parseable format for CI/CD integration:

```json
{
  "run_id": "run_20250107_143022",
  "timestamp": "2025-01-07T14:30:22.000Z",
  "total_tests": 150,
  "total_passed": 148,
  "total_failed": 2,
  "suites": [...]
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORY_BENCHMARK_MODE` | `true` | Disables certain features during testing |
| `MOCK_LLM` | `true` | Uses mock LLM instead of real API |
| `MOCK_EMBEDDINGS` | `true` | Uses mock embeddings |
| `SILENT_TESTS` | `false` | Silences console output |
| `TEST_MONGODB_URI` | `mongodb://localhost:27017/bricksllm_test` | Test database |
| `TEST_QDRANT_URL` | `http://localhost:6333` | Test vector store |

## Quality Targets

### Latency Targets (from roampal)

- P50 (median): < 100ms
- P95: < 300ms
- P99: < 500ms

### Retrieval Quality Targets

- MRR (Mean Reciprocal Rank): > 0.5
- nDCG@5: > 0.6
- Precision@5: > 0.4

### Maturity Levels

| Level | Uses | Score | Description |
|-------|------|-------|-------------|
| cold_start | 0 | 0.5 | New memory, no feedback |
| early | 2 | 0.55 | Few uses, slight learning |
| established | 10 | 0.7 | Regular use, good performance |
| proven | 25 | 0.85 | Proven reliability |
| mature | 50 | 0.95 | Highly trusted memory |

## CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Run Memory System Tests
  run: |
    cd frontend-huggingface
    npx vitest run --config src/lib/server/memory/__tests__/vitest.config.ts --reporter=json --outputFile=test-results.json

- name: Upload Test Results
  uses: actions/upload-artifact@v3
  with:
    name: memory-test-results
    path: |
      frontend-huggingface/src/lib/server/memory/__tests__/test-results/
      frontend-huggingface/test-results.json
```

## Troubleshooting

### Tests fail with "Cannot find module"

Ensure you're running from the `frontend-huggingface` directory and the config path is correct.

### Benchmarks are slow

The comprehensive benchmark runs 4 × 5 = 20 test combinations. For faster iteration, run individual unit tests.

### Mock services not working

Check that `MOCK_LLM=true` and `MOCK_EMBEDDINGS=true` are set in the test environment.
