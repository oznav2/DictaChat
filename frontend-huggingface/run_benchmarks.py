#!/usr/bin/python3
"""
DictaChat Memory System Benchmark Runner
Enterprise-grade test runner with Rich library for beautiful terminal output.
Features:
- Extracts test descriptions from JSDoc comments in each file
- Shows detailed per-test PASS/FAIL results
- Uses Rich Live display to avoid console scrolling
- Progress bar tracks all 529 individual tests
"""

import json
import os
import platform
import sys
import time
import re
import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Tuple

from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn, TimeElapsedColumn
from rich.table import Table
from rich.live import Live
from rich.text import Text
from rich.theme import Theme
from rich import box

# Constants
SCRIPT_DIR = Path(__file__).parent.resolve()
TEST_DIR = SCRIPT_DIR / "src" / "lib" / "server" / "memory" / "__tests__"
RESULTS_BASE = SCRIPT_DIR.parent / "Dictachat_testings_results"
VITEST_TIMEOUT = 180

# Custom theme
THEME = Theme({
    "info": "cyan",
    "success": "green",
    "warning": "yellow",
    "error": "red bold",
    "header": "magenta bold",
    "dim": "dim white",
    "test_pass": "green",
    "test_fail": "red bold",
    "test_skip": "yellow",
    "file_header": "cyan bold",
})

console = Console(theme=THEME)


@dataclass
class TestResult:
    """Single test assertion result."""
    name: str
    status: str  # passed, failed, skipped
    duration: float = 0.0


@dataclass
class TestFileResult:
    """Results from a single test file."""
    file_path: Path
    name: str
    description: str = ""
    tests: List[TestResult] = field(default_factory=list)
    duration: float = 0.0
    error_message: str = ""

    @property
    def passed(self) -> int:
        return sum(1 for t in self.tests if t.status == "passed")

    @property
    def failed(self) -> int:
        return sum(1 for t in self.tests if t.status == "failed")

    @property
    def skipped(self) -> int:
        return sum(1 for t in self.tests if t.status in ("skipped", "pending", "todo"))


def extract_test_description(file_path: Path) -> str:
    """
    Extract the JSDoc description from a test file's header comment.
    Returns the multi-line description explaining what the test does.
    """
    try:
        content = file_path.read_text(encoding='utf-8')

        # Match JSDoc comment at the start of the file
        match = re.search(r'/\*\*\s*([\s\S]*?)\*/', content)
        if match:
            doc = match.group(1)
            lines = []
            for line in doc.split('\n'):
                # Remove leading asterisks and whitespace
                cleaned = re.sub(r'^\s*\*\s?', '', line).strip()
                # Skip empty lines, @tags, and roampal references
                if cleaned and not cleaned.startswith('@'):
                    # Filter out lines mentioning roampal or "Adapted from"
                    if 'roampal' in cleaned.lower() or 'adapted from' in cleaned.lower():
                        continue
                    lines.append(cleaned)

            if lines:
                return '\n'.join(lines)

        return f"Tests for {file_path.stem}"
    except Exception:
        return f"Tests for {file_path.stem}"


def find_test_files() -> List[Path]:
    """Find all test files in test directories."""
    test_files = []

    for subdir in ["unit", "integration", "benchmarks", "characterization"]:
        dir_path = TEST_DIR / subdir
        if dir_path.exists():
            for f in sorted(dir_path.glob("*.test.ts")):
                test_files.append(f)

    return test_files


def count_total_tests() -> int:
    """Count total tests by running vitest once."""
    try:
        result = subprocess.run(
            ["npx", "vitest", "run", str(TEST_DIR), "--reporter=json"],
            cwd=str(SCRIPT_DIR),
            capture_output=True,
            text=True,
            timeout=120
        )

        json_start = result.stdout.find("{")
        if json_start >= 0:
            data = json.loads(result.stdout[json_start:])
            return data.get("numTotalTests", 529)
    except Exception:
        pass

    return 529  # Fallback to known count


def run_vitest_json(test_file: Path) -> Tuple[Dict, float]:
    """Run vitest on a single file and return JSON results."""
    start_time = time.time()

    try:
        result = subprocess.run(
            ["npx", "vitest", "run", str(test_file), "--reporter=json"],
            cwd=str(SCRIPT_DIR),
            capture_output=True,
            text=True,
            timeout=VITEST_TIMEOUT
        )
        duration = time.time() - start_time

        # Parse JSON output
        json_start = result.stdout.find("{")
        if json_start >= 0:
            data = json.loads(result.stdout[json_start:])
            return data, duration

        return {"error": "No JSON output"}, duration

    except subprocess.TimeoutExpired:
        return {"error": "timeout"}, VITEST_TIMEOUT
    except Exception as e:
        return {"error": str(e)}, time.time() - start_time


def parse_test_results(json_data: Dict) -> List[TestResult]:
    """Parse vitest JSON output into TestResult objects."""
    results = []

    try:
        for test_result in json_data.get("testResults", []):
            for assertion in test_result.get("assertionResults", []):
                status = assertion.get("status", "unknown")
                title = assertion.get("title", "Unknown test")
                duration = assertion.get("duration", 0) or 0
                results.append(TestResult(title, status, duration))
    except Exception:
        pass

    return results


def create_results_dir() -> Path:
    """Create a timestamped results directory."""
    RESULTS_BASE.mkdir(parents=True, exist_ok=True)

    today = datetime.now().strftime("%d-%m-%Y")
    num = 1

    while (RESULTS_BASE / f"{today}_{num:02d}").exists():
        num += 1

    results_dir = RESULTS_BASE / f"{today}_{num:02d}"
    results_dir.mkdir(parents=True, exist_ok=True)

    return results_dir


def get_system_info() -> Dict[str, str]:
    """Collect system information."""
    info = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "hostname": platform.node(),
        "platform": f"{platform.system()} {platform.release()}",
    }

    # Node version
    try:
        result = subprocess.run(["node", "--version"], capture_output=True, text=True, timeout=10)
        info["node"] = result.stdout.strip()
    except Exception:
        info["node"] = "N/A"

    # NPM version
    try:
        result = subprocess.run(["npm", "--version"], capture_output=True, text=True, timeout=10)
        info["npm"] = result.stdout.strip()
    except Exception:
        info["npm"] = "N/A"

    # GPU info
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=10
        )
        info["gpu"] = result.stdout.strip().split("\n")[0]
    except Exception:
        info["gpu"] = "N/A"

    return info


def generate_report(results_dir: Path, file_results: List[TestFileResult],
                   total_tests: int, sys_info: Dict[str, str]) -> Path:
    """Generate markdown report."""
    report_path = results_dir / "results.md"

    total_passed = sum(fr.passed for fr in file_results)
    total_failed = sum(fr.failed for fr in file_results)
    total_skipped = sum(fr.skipped for fr in file_results)
    success_rate = (total_passed / total_tests * 100) if total_tests > 0 else 0

    lines = [
        "# DictaChat Memory System Test Results\n",
        "## System Information\n",
        f"- **Timestamp**: {sys_info['timestamp']}",
        f"- **Platform**: {sys_info['platform']}",
        f"- **Node**: {sys_info['node']}",
        f"- **NPM**: {sys_info['npm']}",
        f"- **GPU**: {sys_info['gpu']}\n",
        "## Summary\n",
        "| Metric | Value |",
        "|--------|-------|",
        f"| **Total Test Files** | {len(file_results)} |",
        f"| **Total Tests** | {total_tests} |",
        f"| **Passed** | {total_passed} |",
        f"| **Failed** | {total_failed} |",
        f"| **Skipped** | {total_skipped} |",
        f"| **Success Rate** | {success_rate:.1f}% |\n",
    ]

    # Failed tests section
    failed_list = []
    for fr in file_results:
        for test in fr.tests:
            if test.status == "failed":
                failed_list.append(f"- **{fr.name}**: {test.name}")

    if failed_list:
        lines.append("## Failed Tests\n")
        lines.extend(failed_list)
        lines.append("")

    # Test files section
    lines.append("## Test Files\n")
    lines.append("| File | Description | Passed | Failed |")
    lines.append("|------|-------------|--------|--------|")

    for fr in file_results:
        desc = fr.description.split('\n')[0][:60]
        lines.append(f"| {fr.name} | {desc} | {fr.passed} | {fr.failed} |")

    report_path.write_text('\n'.join(lines))
    return report_path


def show_banner():
    """Display the application banner."""
    banner_text = """
╔══════════════════════════════════════════════════════════════════╗
║           DictaChat Memory System Benchmark Runner               ║
║     Enterprise-grade test runner with Rich terminal output       ║
╚══════════════════════════════════════════════════════════════════╝
    """
    console.print(Panel(banner_text.strip(), border_style="cyan"))


def show_system_info(sys_info: Dict[str, str]):
    """Display system information table."""
    table = Table(title="System Information", show_header=False, border_style="blue", box=box.ROUNDED)
    table.add_column("Key", style="cyan")
    table.add_column("Value", style="white")

    for key, value in sys_info.items():
        table.add_row(key.title(), value)

    console.print(table)
    console.print()


def show_test_plan(total_files: int, total_tests: int):
    """Display the test execution plan."""
    table = Table(title="TEST EXECUTION PLAN", border_style="cyan", title_style="bold cyan", box=box.DOUBLE)
    table.add_column("Metric", style="bold white")
    table.add_column("Value", style="magenta bold", justify="right")

    table.add_row("Total Test Files", str(total_files))
    table.add_row("Total Overall Tests", str(total_tests))

    console.print(table)
    console.print()


def main():
    """Main entry point."""
    console.clear()
    show_banner()

    # Collect system info
    console.print("[info]Collecting system information...[/]")
    sys_info = get_system_info()
    show_system_info(sys_info)

    # Find test files
    test_files = find_test_files()

    if not test_files:
        console.print("[error]No test files found![/]")
        sys.exit(1)

    # Count total tests
    console.print("[info]Counting total tests across all files...[/]")
    total_tests = count_total_tests()

    # Create results directory
    results_dir = create_results_dir()
    console.print(f"[info]Results directory: {results_dir}[/]\n")

    # Show test plan
    show_test_plan(len(test_files), total_tests)

    # Initialize tracking
    file_results: List[TestFileResult] = []
    current_test = 0
    total_passed = 0
    total_failed = 0
    failed_tests: List[Tuple[str, str]] = []

    console.print("[header]🚀 Starting test execution...[/]\n")

    # Main progress bar tracking overall tests (0 to 529)
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(bar_width=50),
        TaskProgressColumn(),
        TextColumn("({task.completed}/{task.total})"),
        TimeElapsedColumn(),
        console=console,
        transient=False
    ) as progress:

        overall_task = progress.add_task("[cyan]Overall Progress", total=total_tests)

        for file_idx, test_file in enumerate(test_files, 1):
            file_result = TestFileResult(
                file_path=test_file,
                name=test_file.stem.replace(".test", "")
            )
            file_result.description = extract_test_description(test_file)

            # Display test file header with description
            console.print()
            console.print(f"[file_header]{'━' * 70}[/]")
            console.print(f"[bold]📁 Test File [{file_idx}/{len(test_files)}]:[/] [magenta]{test_file.name}[/]")

            # Show description in a panel (first 6 lines max)
            desc_lines = file_result.description.split('\n')[:6]
            desc_panel = Panel(
                '\n'.join(f"  {line}" for line in desc_lines),
                title="[bold]📋 Purpose[/]",
                border_style="dim",
                expand=False
            )
            console.print(desc_panel)

            # Run the test file
            json_data, duration = run_vitest_json(test_file)
            file_result.duration = duration

            # Parse individual test results
            file_result.tests = parse_test_results(json_data)

            if file_result.tests:
                # Process tests and collect results (without nested Live - Progress uses Live)
                for test in file_result.tests:
                    current_test += 1

                    # Determine status and count
                    if test.status == "passed":
                        total_passed += 1
                    elif test.status == "failed":
                        total_failed += 1
                        failed_tests.append((file_result.name, test.name))

                    # Update progress bar
                    progress.update(overall_task, completed=current_test)

                # Print summary for this file showing pass/fail counts
                console.print(
                    f"  [dim]⏱  {duration:.2f}s |[/] "
                    f"[test_pass]✔ {file_result.passed} passed[/] | "
                    f"[test_fail]✘ {file_result.failed} failed[/]"
                )

                # Show failed test names if any
                file_failed = [t for t in file_result.tests if t.status == "failed"]
                for t in file_failed[:3]:  # Show max 3 failed tests
                    console.print(f"    [test_fail]└─ {t.name}[/]")
            else:
                # No test results parsed - count from JSON summary
                num_passed = json_data.get("numPassedTests", 0)
                num_failed = json_data.get("numFailedTests", 0)
                total_passed += num_passed
                total_failed += num_failed
                current_test += num_passed + num_failed
                progress.update(overall_task, completed=current_test)

                console.print(f"  [warning]⚠ Could not parse individual tests[/]")
                console.print(f"  [dim]Summary: {num_passed} passed, {num_failed} failed[/]")

            file_results.append(file_result)

            # Save individual JSON result
            json_path = results_dir / f"{file_result.name}.json"
            with open(json_path, "w") as f:
                json.dump(json_data, f, indent=2)

    # Generate report
    report_path = generate_report(results_dir, file_results, total_tests, sys_info)

    # Final summary
    total_skipped = total_tests - total_passed - total_failed
    success_rate = (total_passed / total_tests * 100) if total_tests > 0 else 0

    console.print()

    # Summary table
    summary_table = Table(
        title="FINAL TEST SUMMARY",
        border_style="cyan",
        title_style="bold cyan",
        box=box.DOUBLE
    )
    summary_table.add_column("Metric", style="bold")
    summary_table.add_column("Value", justify="right")

    summary_table.add_row("Test Files", str(len(test_files)))
    summary_table.add_row("Total Tests", str(total_tests))
    summary_table.add_row("[green]Passed[/]", f"[green]{total_passed}[/]")
    summary_table.add_row("[red]Failed[/]", f"[red]{total_failed}[/]")
    summary_table.add_row("[yellow]Skipped[/]", f"[yellow]{total_skipped}[/]")

    if total_failed == 0:
        summary_table.add_row("[bold]Success Rate[/]", f"[bold green]✓ {success_rate:.1f}%[/]")
    else:
        summary_table.add_row("[bold]Success Rate[/]", f"[bold red]✗ {success_rate:.1f}%[/]")

    console.print(summary_table)

    # Show failed tests if any
    if failed_tests:
        console.print()
        console.print("[error]Failed Tests:[/]")
        for file_name, test_name in failed_tests:
            console.print(f"  [test_fail]✘[/] {file_name}: {test_name}")

    console.print()
    console.print(f"[info]Results saved to: {results_dir}[/]")
    console.print(f"[info]Report: {report_path}[/]")
    console.print()

    # Exit code
    sys.exit(1 if total_failed > 0 else 0)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print("\n[warning]Interrupted by user[/]")
        sys.exit(130)
    except Exception as e:
        console.print(f"\n[error]Fatal error: {e}[/]")
        import traceback
        traceback.print_exc()
        sys.exit(1)
