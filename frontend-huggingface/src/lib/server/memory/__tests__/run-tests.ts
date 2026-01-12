/**
 * Test Runner for Memory System Tests
 *
 * Usage:
 *   npx vitest run --config src/lib/server/memory/__tests__/vitest.config.ts
 *
 * Reports are generated in: src/lib/server/memory/__tests__/test-results/
 */

import * as fs from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

// ============================================================================
// Configuration
// ============================================================================

const TEST_SUITES = {
	unit: [
		"unit/unified-memory-facade.test.ts",
		"unit/search-service.test.ts",
		"unit/outcome-service.test.ts",
	],
	benchmarks: [
		"benchmarks/latency-benchmark.test.ts",
		"benchmarks/comprehensive-benchmark.test.ts",
		"benchmarks/torture-suite.test.ts",
	],
};

// ============================================================================
// Report Types
// ============================================================================

interface TestRunResult {
	suite: string;
	passed: number;
	failed: number;
	skipped: number;
	duration_ms: number;
	timestamp: string;
}

interface ConsolidatedReport {
	run_id: string;
	timestamp: string;
	total_suites: number;
	total_tests: number;
	total_passed: number;
	total_failed: number;
	total_skipped: number;
	total_duration_ms: number;
	suites: TestRunResult[];
	summary: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateRunId(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = (now.getMonth() + 1).toString().padStart(2, "0");
	const day = now.getDate().toString().padStart(2, "0");
	const hour = now.getHours().toString().padStart(2, "0");
	const min = now.getMinutes().toString().padStart(2, "0");
	const sec = now.getSeconds().toString().padStart(2, "0");
	return `run_${year}${month}${day}_${hour}${min}${sec}`;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms.toFixed(0)}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
	return `${(ms / 60000).toFixed(2)}m`;
}

// ============================================================================
// Report Generation
// ============================================================================

export function generateTextReport(report: ConsolidatedReport): string {
	const lines: string[] = [
		"#".repeat(80),
		"#  MEMORY SYSTEM TEST SUITE - CONSOLIDATED REPORT",
		"#".repeat(80),
		"",
		`Run ID: ${report.run_id}`,
		`Timestamp: ${report.timestamp}`,
		"",
		"=".repeat(80),
		"SUMMARY",
		"=".repeat(80),
		`Total Suites: ${report.total_suites}`,
		`Total Tests: ${report.total_tests}`,
		`Passed: ${report.total_passed}`,
		`Failed: ${report.total_failed}`,
		`Skipped: ${report.total_skipped}`,
		`Duration: ${formatDuration(report.total_duration_ms)}`,
		`Pass Rate: ${((report.total_passed / Math.max(report.total_tests, 1)) * 100).toFixed(1)}%`,
		"",
		"=".repeat(80),
		"SUITE DETAILS",
		"=".repeat(80),
		"",
	];

	for (const suite of report.suites) {
		const status = suite.failed === 0 ? "[PASS]" : "[FAIL]";
		lines.push(`${status} ${suite.suite}`);
		lines.push(`    Tests: ${suite.passed + suite.failed + suite.skipped}`);
		lines.push(`    Passed: ${suite.passed} | Failed: ${suite.failed} | Skipped: ${suite.skipped}`);
		lines.push(`    Duration: ${formatDuration(suite.duration_ms)}`);
		lines.push("");
	}

	lines.push("=".repeat(80));
	lines.push("INDIVIDUAL REPORTS");
	lines.push("=".repeat(80));
	lines.push("");
	lines.push("The following individual reports are available in test-results/:");
	lines.push("  - latency-benchmark-report.txt");
	lines.push("  - comprehensive-benchmark-report.txt");
	lines.push("  - torture-test-report.txt");
	lines.push("  - results.json (Vitest JSON output)");
	lines.push("");
	lines.push("#".repeat(80));
	lines.push(`# ${report.summary}`);
	lines.push("#".repeat(80));

	return lines.join("\n");
}

export function generateJsonReport(report: ConsolidatedReport): string {
	return JSON.stringify(report, null, 2);
}

// ============================================================================
// Report Writer
// ============================================================================

export function writeReports(resultsDir: string, report: ConsolidatedReport): void {
	if (!fs.existsSync(resultsDir)) {
		fs.mkdirSync(resultsDir, { recursive: true });
	}

	const textPath = resolve(resultsDir, "consolidated-report.txt");
	const jsonPath = resolve(resultsDir, "consolidated-report.json");

	fs.writeFileSync(textPath, generateTextReport(report));
	fs.writeFileSync(jsonPath, generateJsonReport(report));
}

// ============================================================================
// Create Report from Vitest Results
// ============================================================================

export function createReportFromResults(
	vitestResults: { numPassedTests: number; numFailedTests: number; numPendingTests: number }[],
	suiteNames: string[]
): ConsolidatedReport {
	const suites: TestRunResult[] = suiteNames.map((name, idx) => ({
		suite: name,
		passed: vitestResults[idx]?.numPassedTests || 0,
		failed: vitestResults[idx]?.numFailedTests || 0,
		skipped: vitestResults[idx]?.numPendingTests || 0,
		duration_ms: 0,
		timestamp: new Date().toISOString(),
	}));

	const totalTests = suites.reduce((sum, r) => sum + r.passed + r.failed + r.skipped, 0);
	const totalPassed = suites.reduce((sum, r) => sum + r.passed, 0);
	const totalFailed = suites.reduce((sum, r) => sum + r.failed, 0);
	const totalSkipped = suites.reduce((sum, r) => sum + r.skipped, 0);

	return {
		run_id: generateRunId(),
		timestamp: new Date().toISOString(),
		total_suites: suites.length,
		total_tests: totalTests,
		total_passed: totalPassed,
		total_failed: totalFailed,
		total_skipped: totalSkipped,
		total_duration_ms: 0,
		suites,
		summary:
			totalFailed === 0 ? "ALL TESTS PASSED" : `${totalFailed} TEST(S) FAILED - REVIEW REQUIRED`,
	};
}

// Export test suite configuration
export { TEST_SUITES };
