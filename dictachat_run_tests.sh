#!/bin/bash
# DictaChat Memory System Benchmark Runner
# Enterprise-grade test runner with detailed per-test reporting

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend-huggingface"
TEST_DIR="$FRONTEND_DIR/src/lib/server/memory/__tests__"
VITEST_DIR="$TEST_DIR"  # Run vitest from here (where vitest.config.ts is)
RESULTS_BASE="$SCRIPT_DIR/Dictachat_testings_results"
VITEST_TIMEOUT=180

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

# Counters
TOTAL_FILES=0
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0
CURRENT_TEST=0

# Arrays for tracking
declare -a TEST_FILES
declare -a FAILED_TEST_NAMES

show_banner() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}DictaChat Memory System Benchmark Runner${NC}                        ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  Enterprise-grade test runner with detailed per-test reporting    ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

check_dependencies() {
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}[WARN]${NC} jq not found - installing for JSON parsing..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get install -y jq 2>/dev/null || true
        elif command -v brew &> /dev/null; then
            brew install jq 2>/dev/null || true
        fi
    fi

    if ! command -v jq &> /dev/null; then
        echo -e "${RED}[ERROR]${NC} jq is required for detailed test reporting"
        echo -e "${BLUE}[INFO]${NC} Install with: apt-get install jq (Linux) or brew install jq (macOS)"
        exit 1
    fi
}

get_system_info() {
    echo -e "${BLUE}[INFO]${NC} System Information:"
    echo -e "  Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    echo -e "  Hostname:  $(hostname)"
    echo -e "  Platform:  $(uname -s) $(uname -r)"
    echo -e "  Node:      $(node --version 2>/dev/null || echo 'N/A')"
    echo -e "  NPM:       $(npm --version 2>/dev/null || echo 'N/A')"

    if command -v nvidia-smi &> /dev/null; then
        local gpu=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
        echo -e "  GPU:       ${gpu:-N/A}"
    fi
    echo ""
}

create_results_dir() {
    mkdir -p "$RESULTS_BASE"

    local today=$(date '+%d-%m-%Y')
    local num=1

    while [ -d "$RESULTS_BASE/${today}_$(printf '%02d' $num)" ]; do
        num=$((num + 1))
    done

    RESULTS_DIR="$RESULTS_BASE/${today}_$(printf '%02d' $num)"
    mkdir -p "$RESULTS_DIR"

    echo -e "${BLUE}[INFO]${NC} Results directory: $RESULTS_DIR"
    echo ""
}

find_tests() {
    TEST_FILES=()

    # Find all test files
    for subdir in "unit" "integration" "benchmarks" "characterization"; do
        if [ -d "$TEST_DIR/$subdir" ]; then
            while IFS= read -r -d '' file; do
                TEST_FILES+=("$file")
            done < <(find "$TEST_DIR/$subdir" -name "*.test.ts" -type f -print0 2>/dev/null | sort -z) || true
        fi
    done

    TOTAL_FILES=${#TEST_FILES[@]}
}

count_total_tests() {
    echo -e "${BLUE}[INFO]${NC} Counting total tests across all files..."

    # Run vitest in dry-run mode to count tests
    cd "$VITEST_DIR"
    local json_output=$(timeout 60 npx vitest run --reporter=json 2>/dev/null || true)

    if [ -n "$json_output" ]; then
        TOTAL_TESTS=$(echo "$json_output" | jq '.numTotalTests // 0' 2>/dev/null || echo "529")
    else
        # Fallback to known count
        TOTAL_TESTS=529
    fi

    # Ensure we have a valid number
    if ! [[ "$TOTAL_TESTS" =~ ^[0-9]+$ ]] || [ "$TOTAL_TESTS" -eq 0 ]; then
        TOTAL_TESTS=529
    fi
}

show_test_summary_header() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}                      ${BOLD}TEST EXECUTION PLAN${NC}                         ${CYAN}║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}Total Test Files:${NC}    ${MAGENTA}${TOTAL_FILES}${NC}                                        ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}Total Overall Tests:${NC} ${MAGENTA}${TOTAL_TESTS}${NC}                                      ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

draw_progress_bar() {
    local current=$1
    local total=$2
    local width=50
    local percent=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))

    printf "\r${BLUE}[${NC}"
    printf "${GREEN}%${filled}s${NC}" | tr ' ' '█'
    printf "${DIM}%${empty}s${NC}" | tr ' ' '░'
    printf "${BLUE}]${NC} ${BOLD}%3d%%${NC} (%d/%d)" "$percent" "$current" "$total"
}

get_test_file_description() {
    local name=$(basename "$1" .test.ts)
    case "$name" in
        test_dictachat_vs_vector_db) echo "DictaChat hybrid vs vector DB comparison" ;;
        test_catastrophic_forgetting) echo "Memory retention under high load" ;;
        test_context_poisoning) echo "Context poisoning prevention" ;;
        test_contradictions) echo "Contradiction handling" ;;
        test_edge_cases) echo "Edge case handling" ;;
        test_learning_speed) echo "Learning speed benchmarks" ;;
        test_outcome_learning_ab) echo "A/B outcome learning comparison" ;;
        test_recovery_resilience) echo "Recovery and fault tolerance" ;;
        test_search_quality) echo "Search quality metrics" ;;
        test_semantic_confusion) echo "Semantic confusion handling" ;;
        test_stale_data) echo "Stale data management" ;;
        test_token_efficiency) echo "Token efficiency metrics" ;;
        comprehensive-benchmark) echo "Comprehensive performance benchmarks" ;;
        latency-benchmark) echo "Latency measurements" ;;
        torture-suite) echo "Stress and torture tests" ;;
        test_context_service) echo "Context service unit tests" ;;
        test_ghost_registry) echo "Ghost registry unit tests" ;;
        test_knowledge_graph_service) echo "Knowledge graph service tests" ;;
        test_memory_bank_service) echo "Memory bank CRUD operations" ;;
        test_promotion_service) echo "Promotion scheduling tests" ;;
        test_routing_service) echo "Query routing tests" ;;
        test_search_service) echo "Search service unit tests" ;;
        outcome-service) echo "Outcome service tests" ;;
        search-service) echo "Search service metrics tests" ;;
        unified-memory-facade) echo "Unified memory facade API tests" ;;
        test_smoke) echo "Smoke tests for service health" ;;
        test_working_memory_cleanup) echo "Working memory cleanup tests" ;;
        test_outcome_behavior) echo "Outcome behavior characterization" ;;
        test_search_behavior) echo "Search behavior characterization" ;;
        *) echo "$name" ;;
    esac
}

run_single_test_file() {
    local test_file="$1"
    local test_name=$(basename "$test_file" .test.ts)
    local desc=$(get_test_file_description "$test_file")
    local txt_file="$RESULTS_DIR/${test_name}.txt"
    local vitest_json="$VITEST_DIR/test-results/results.json"

    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}📁 Test File:${NC} ${MAGENTA}${test_name}.test.ts${NC}"
    echo -e "${BOLD}📋 Purpose:${NC}   ${desc}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Run vitest and capture JSON output
    cd "$VITEST_DIR"
    local start_time=$(date +%s.%N)
    local relative_file="${test_file#$VITEST_DIR/}"

    # Run vitest (it writes JSON to test-results/results.json per vitest.config.ts)
    if timeout "$VITEST_TIMEOUT" npx vitest run "$relative_file" --reporter=json >/dev/null 2>&1; then
        local exit_code=0
    else
        local exit_code=$?
    fi

    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)

    # Initialize counters for this file
    local file_passed=0
    local file_failed=0
    local file_skipped=0
    local file_total=0

    # Start writing TXT file (pytest-style format)
    {
        echo "============================= test session starts ============================="
        echo "platform $(uname -s) -- Node $(node --version 2>/dev/null || echo 'N/A'), vitest"
        echo "rootdir: $FRONTEND_DIR"
        echo "test file: ${test_name}.test.ts"
        echo ""
    } > "$txt_file"

    # Parse JSON results and display each test + write to txt
    if [ -f "$vitest_json" ] && [ -s "$vitest_json" ]; then
        # Extract test results with full ancestor titles
        local test_results=$(jq -r '
            .testResults[]?.assertionResults[]? |
            "\(.status)|\(.ancestorTitles | join("::"))||\(.title)|\(.duration // 0)"
        ' "$vitest_json" 2>/dev/null || echo "")

        # Count total tests in this file
        file_total=$(echo "$test_results" | grep -c '|' || echo "0")
        local current_in_file=0

        if [ -n "$test_results" ]; then
            echo ""
            while IFS='|' read -r status ancestors _ title test_duration; do
                CURRENT_TEST=$((CURRENT_TEST + 1))
                current_in_file=$((current_in_file + 1))

                # Calculate percentage within this file
                local percent=0
                if [ "$file_total" -gt 0 ]; then
                    percent=$((current_in_file * 100 / file_total))
                fi

                # Build full test path (pytest style)
                local test_path="${test_name}.test.ts"
                if [ -n "$ancestors" ]; then
                    test_path="${test_path}::${ancestors}"
                fi
                test_path="${test_path}::${title}"

                # Convert duration from ms to readable format
                local duration_str="--"
                if [ -n "$test_duration" ] && [ "$test_duration" != "null" ]; then
                    local ms=$(printf "%.0f" "$test_duration" 2>/dev/null || echo "0")
                    duration_str="${ms}ms"
                fi

                case "$status" in
                    "passed")
                        echo -e "  ${GREEN}✔ PASS${NC} ${title} ${DIM}(${duration_str})${NC}"
                        printf "%s PASSED [%3d%%]\n" "$test_path" "$percent" >> "$txt_file"
                        PASSED_TESTS=$((PASSED_TESTS + 1))
                        file_passed=$((file_passed + 1))
                        ;;
                    "failed")
                        echo -e "  ${RED}✘ FAIL${NC} ${title} ${DIM}(${duration_str})${NC}"
                        printf "%s FAILED [%3d%%]\n" "$test_path" "$percent" >> "$txt_file"
                        FAILED_TESTS=$((FAILED_TESTS + 1))
                        file_failed=$((file_failed + 1))
                        FAILED_TEST_NAMES+=("${test_name}: ${title}")
                        ;;
                    "skipped"|"pending"|"todo")
                        echo -e "  ${YELLOW}○ SKIP${NC} ${title}"
                        printf "%s SKIPPED [%3d%%]\n" "$test_path" "$percent" >> "$txt_file"
                        SKIPPED_TESTS=$((SKIPPED_TESTS + 1))
                        file_skipped=$((file_skipped + 1))
                        ;;
                    *)
                        echo -e "  ${YELLOW}? ${status}${NC} ${title}"
                        printf "%s %s [%3d%%]\n" "$test_path" "$status" "$percent" >> "$txt_file"
                        ;;
                esac

                # Update progress bar
                draw_progress_bar "$CURRENT_TEST" "$TOTAL_TESTS"

            done <<< "$test_results"
            echo ""  # New line after progress bar
        else
            # Fallback if JSON parsing fails
            echo -e "  ${YELLOW}⚠${NC} Could not parse individual test results"

            # Try to count from numPassedTests/numFailedTests
            local passed=$(jq '.numPassedTests // 0' "$vitest_json" 2>/dev/null || echo "0")
            local failed=$(jq '.numFailedTests // 0' "$vitest_json" 2>/dev/null || echo "0")

            if [ "$passed" -gt 0 ] || [ "$failed" -gt 0 ]; then
                PASSED_TESTS=$((PASSED_TESTS + passed))
                FAILED_TESTS=$((FAILED_TESTS + failed))
                CURRENT_TEST=$((CURRENT_TEST + passed + failed))
                file_passed=$passed
                file_failed=$failed
                echo -e "  ${GREEN}Passed: $passed${NC} | ${RED}Failed: $failed${NC}"
                echo "(Individual test details not available - summary only)" >> "$txt_file"
                echo "Passed: $passed, Failed: $failed" >> "$txt_file"
                draw_progress_bar "$CURRENT_TEST" "$TOTAL_TESTS"
                echo ""
            fi
        fi
    else
        echo -e "  ${RED}✘${NC} Test execution failed or produced no output"
        echo "ERROR: Test execution failed or produced no output" >> "$txt_file"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        CURRENT_TEST=$((CURRENT_TEST + 1))
        file_failed=1
    fi

    # Write summary footer to txt file
    {
        echo ""
        echo "============================= test summary ============================="
        local summary_parts=""
        [ "$file_passed" -gt 0 ] && summary_parts="${file_passed} passed"
        [ "$file_failed" -gt 0 ] && summary_parts="${summary_parts}${summary_parts:+, }${file_failed} failed"
        [ "$file_skipped" -gt 0 ] && summary_parts="${summary_parts}${summary_parts:+, }${file_skipped} skipped"
        echo "======================== ${summary_parts} in ${duration}s ========================"
    } >> "$txt_file"

    echo -e "${DIM}  ⏱  File completed in ${duration}s${NC}"
    echo -e "${DIM}  📄 Results saved to: ${test_name}.txt${NC}"
}

run_all_tests() {
    echo ""
    echo -e "${BOLD}🚀 Starting test execution...${NC}"
    echo ""

    local file_num=0
    for test_file in "${TEST_FILES[@]}"; do
        file_num=$((file_num + 1))
        echo -e "${DIM}[File $file_num/$TOTAL_FILES]${NC}"
        run_single_test_file "$test_file"
    done
}

generate_report() {
    local report_file="$RESULTS_DIR/results.md"
    local success_rate=0

    if [ $TOTAL_TESTS -gt 0 ]; then
        success_rate=$(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
    fi

    cat > "$report_file" << EOF
# DictaChat Memory System Test Results

## System Information

- **Timestamp**: $(date '+%Y-%m-%d %H:%M:%S')
- **Hostname**: $(hostname)
- **Platform**: $(uname -s) $(uname -r)
- **Node**: $(node --version 2>/dev/null || echo 'N/A')
- **NPM**: $(npm --version 2>/dev/null || echo 'N/A')

## Summary

| Metric | Value |
|--------|-------|
| **Total Test Files** | $TOTAL_FILES |
| **Total Tests** | $TOTAL_TESTS |
| **Passed** | $PASSED_TESTS |
| **Failed** | $FAILED_TESTS |
| **Skipped** | $SKIPPED_TESTS |
| **Success Rate** | ${success_rate}% |

EOF

    if [ ${#FAILED_TEST_NAMES[@]} -gt 0 ]; then
        echo "## Failed Tests" >> "$report_file"
        echo "" >> "$report_file"
        for failed in "${FAILED_TEST_NAMES[@]}"; do
            echo "- $failed" >> "$report_file"
        done
        echo "" >> "$report_file"
    fi

    echo "## Test Files" >> "$report_file"
    echo "" >> "$report_file"
    echo "| File | Description |" >> "$report_file"
    echo "|------|-------------|" >> "$report_file"

    for test_file in "${TEST_FILES[@]}"; do
        local test_name=$(basename "$test_file" .test.ts)
        local desc=$(get_test_file_description "$test_file")
        echo "| $test_name | $desc |" >> "$report_file"
    done

    echo ""
    echo -e "${GREEN}[OK]${NC} Report saved to: $report_file"
}

show_final_summary() {
    local success_rate=0
    if [ $TOTAL_TESTS -gt 0 ]; then
        success_rate=$(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
    fi

    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}                      ${BOLD}FINAL TEST SUMMARY${NC}                          ${CYAN}║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════════════╣${NC}"
    printf "${CYAN}║${NC}  ${BOLD}Test Files:${NC}     %-5s                                          ${CYAN}║${NC}\n" "$TOTAL_FILES"
    printf "${CYAN}║${NC}  ${BOLD}Total Tests:${NC}    %-5s                                          ${CYAN}║${NC}\n" "$TOTAL_TESTS"
    printf "${CYAN}║${NC}  ${GREEN}Passed:${NC}         %-5s                                          ${CYAN}║${NC}\n" "$PASSED_TESTS"
    printf "${CYAN}║${NC}  ${RED}Failed:${NC}         %-5s                                          ${CYAN}║${NC}\n" "$FAILED_TESTS"
    printf "${CYAN}║${NC}  ${YELLOW}Skipped:${NC}        %-5s                                          ${CYAN}║${NC}\n" "$SKIPPED_TESTS"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════════════╣${NC}"

    if [ "$FAILED_TESTS" -eq 0 ]; then
        echo -e "${CYAN}║${NC}  ${GREEN}${BOLD}✓ SUCCESS RATE: ${success_rate}%${NC}                                      ${CYAN}║${NC}"
    else
        echo -e "${CYAN}║${NC}  ${RED}${BOLD}✗ SUCCESS RATE: ${success_rate}%${NC}                                      ${CYAN}║${NC}"
    fi

    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"

    if [ ${#FAILED_TEST_NAMES[@]} -gt 0 ]; then
        echo ""
        echo -e "${RED}${BOLD}Failed Tests:${NC}"
        for failed in "${FAILED_TEST_NAMES[@]}"; do
            echo -e "  ${RED}✘${NC} $failed"
        done
    fi

    echo ""
    echo -e "${BLUE}[INFO]${NC} Results saved to: $RESULTS_DIR"
    echo ""
}

# Main
main() {
    show_banner
    check_dependencies
    get_system_info
    create_results_dir
    find_tests

    if [ $TOTAL_FILES -eq 0 ]; then
        echo -e "${RED}[ERROR]${NC} No test files found!"
        exit 1
    fi

    count_total_tests
    show_test_summary_header
    run_all_tests
    generate_report
    show_final_summary

    if [ $FAILED_TESTS -gt 0 ]; then
        exit 1
    fi
    exit 0
}

main "$@"
