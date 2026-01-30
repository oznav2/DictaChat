#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
	echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
	echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
	echo -e "${RED}[ERROR]${NC} $1"
}

ensure_command() {
	if ! command -v "$1" >/dev/null 2>&1; then
		log_error "Missing required command: $1"
		exit 1
	fi
}

ensure_command docker
ensure_command npm
ensure_command curl

# Ensure previous stack is stopped to prevent port conflicts
if [ -f "$SCRIPT_DIR/stop.sh" ]; then
    log_info "Invoking stop.sh to clean up previous stack..."
    bash "$SCRIPT_DIR/stop.sh"
fi

# Check for Python 3 (Logic aligned with start.sh)
if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
else
    log_error "Python 3 is not installed. Please install Python 3 to proceed."
    exit 1
fi

# Create virtual environment if it doesn't exist
VENV_DIR=".venv"
if [ ! -d "$VENV_DIR" ]; then
    log_info "Creating virtual environment..."
    $PYTHON_CMD -m venv "$VENV_DIR"
fi

# Activate virtual environment
if [ -f "$VENV_DIR/bin/activate" ]; then
    source "$VENV_DIR/bin/activate"
else
    log_error "Failed to activate virtual environment."
    exit 1
fi

# Install requirements if not installed
if ! python -c "import rich" &> /dev/null; then
    log_info "Installing required Python packages (rich)..."
    pip install rich requests
fi

mkdir -p .logs

ADMIN_TOKEN_FILE=".logs/admin.token"

# --- Configuration ---
LOG_DIR="$SCRIPT_DIR/.logs"
LOG_FILE="$LOG_DIR/debug.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_LOG="$LOG_DIR/backend.log"
CONSOLE_LOG="$LOG_DIR/console.log"
CONSOLE_PASTE_PIPE="$LOG_DIR/console.paste"

# Clean up old logs to ensure a fresh start
rm -f "$LOG_FILE" "$FRONTEND_LOG" "$BACKEND_LOG" "$CONSOLE_LOG"
rm -f "$CONSOLE_PASTE_PIPE"

mkdir -p "$LOG_DIR"
: > "$FRONTEND_LOG"
: > "$BACKEND_LOG"
: > "$CONSOLE_LOG"

# Resolve "failed to get console" error in Docker BuildKit
export BUILDKIT_PROGRESS=plain

# Force color output for tools that support it (if not already set)
# REMOVED FORCE_COLOR and COMPOSE_ANSI to prevent ANSI conflicts and allow cleaner logs
# export FORCE_COLOR="${FORCE_COLOR:-true}"
# export COMPOSE_ANSI="${COMPOSE_ANSI:-always}"

log_info "Logging session to: $LOG_FILE"

# Redirect all script output to both stdout and the log file
# We use process substitution to tee everything
# Stripping colors from the log file using sed
exec > >(tee >(sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' >> "$LOG_FILE")) 2>&1

# ==============================================================================
# 📝 LOGGING INSTRUCTIONS
# ==============================================================================
# This script captures ALL output (deploy.py, Docker logs, Frontend logs) into:
#   .logs/debug.log
#
# To monitor logs in another terminal:
#   tail -f .logs/debug.log
#
# To feed logs to an LLM for debugging:
#   cat .logs/debug.log
#   # Or copy the content to your clipboard
# ==============================================================================

clean_frontend_cache() {
	local root_dir="$SCRIPT_DIR/frontend-huggingface"

	log_info "Cleaning frontend caches (.svelte-kit, build artifacts)..."
	# Note: We preserve node_modules/.vite to avoid forcing a full dependency rebuild
	rm -rf \
		"$root_dir/.svelte-kit" \
		"$root_dir/.vite" \
		"$root_dir/build" \
		"$root_dir/package" >/dev/null 2>&1 || true
	log_success "Frontend caches cleared"
}

ensure_admin_token() {
	if [ -f "${ADMIN_TOKEN_FILE}" ]; then
		cat "${ADMIN_TOKEN_FILE}"
		return 0
	fi

	local token
	token="$(node -e "console.log(require('crypto').randomUUID())")"
	printf "%s" "${token}" > "${ADMIN_TOKEN_FILE}"
	chmod 600 "${ADMIN_TOKEN_FILE}" >/dev/null 2>&1 || true
	echo "${token}"
}

DOCKER_LOGS_PID=""
FRONTEND_PID=""
MCP_LOGS_PID=""
LLAMA_LOGS_PID=""
BROWSER_CONSOLE_PID=""
BROWSER_TOOLS_PID=""
CONSOLE_PASTE_PID=""

start_browser_tools_server() {
	if [ "${BROWSER_TOOLS_AUTO_START:-true}" = "false" ]; then
		log_info "Browser tools auto-start disabled (BROWSER_TOOLS_AUTO_START=false)."
		return
	fi

	local port="${BROWSER_TOOLS_PORT:-3025}"
	local -a hosts=()

	if [ -n "${BROWSER_TOOLS_HOST:-}" ]; then
		hosts=("${BROWSER_TOOLS_HOST}")
	elif [ -n "${BROWSER_TOOLS_HOSTS:-}" ]; then
		IFS=',' read -r -a hosts <<< "${BROWSER_TOOLS_HOSTS}"
	else
		hosts=("localhost" "127.0.0.1" "192.168.31.238" "172.21.64.1" "172.28.32.1")
	fi

	for host in "${hosts[@]}"; do
		if curl -sS --max-time 1 "http://${host}:${port}/console-logs" >/dev/null 2>&1; then
			log_info "Browser Tools Server already reachable at ${host}:${port}"
			return
		fi
	done

	log_info "Starting Browser Tools Server via Windows npx..."
	cmd.exe /c "cd /d %USERPROFILE% && npx -y @agentdeskai/browser-tools-server" >/dev/null 2>&1 &
	BROWSER_TOOLS_PID="$!"

	local start_time
	start_time=$(date +%s)
	local timeout="${BROWSER_TOOLS_START_TIMEOUT:-20}"

	while true; do
		for host in "${hosts[@]}"; do
			if curl -sS --max-time 1 "http://${host}:${port}/console-logs" >/dev/null 2>&1; then
				log_success "Browser Tools Server reachable at ${host}:${port}"
				return
			fi
		done
		if (( $(date +%s) - start_time > timeout )); then
			log_error "Browser Tools Server not reachable after ${timeout}s. Start it manually in Windows."
			return
		fi
		sleep 1
	done
}

start_browser_console_capture() {
	log_info "Starting browser console capture (polling every 5s)..."
	"$PYTHON_CMD" - "$CONSOLE_LOG" <<'PY' &
import json
import os
import sys
import time
import urllib.request

log_file = sys.argv[1]
port = int(os.getenv("BROWSER_TOOLS_PORT", "3025"))
poll_interval = float(os.getenv("BROWSER_TOOLS_POLL_INTERVAL", "5"))
host_override = os.getenv("BROWSER_TOOLS_HOST", "").strip()
hosts_env = os.getenv("BROWSER_TOOLS_HOSTS", "").strip()

def get_hosts() -> list[str]:
	if host_override:
		return [host_override]
	if hosts_env:
		return [h.strip() for h in hosts_env.split(",") if h.strip()]
	return [
		"localhost",
		"127.0.0.1",
		"192.168.31.238",
		"172.21.64.1",
		"172.28.32.1",
	]

def fetch_json(url: str, timeout: float = 1.5):
	with urllib.request.urlopen(url, timeout=timeout) as response:
		payload = response.read().decode("utf-8")
		return json.loads(payload)

def discover_host() -> str | None:
	for host in get_hosts():
		try:
			data = fetch_json(f"http://{host}:{port}/console-logs", timeout=1.0)
			if isinstance(data, list):
				return host
		except Exception:
			continue
	return None

def append_entries(entries, last_ts, seen):
	if not isinstance(entries, list):
		return last_ts
	newest = last_ts
	lines = []
	for entry in entries:
		if isinstance(entry, dict):
			key = (entry.get("timestamp"), entry.get("level"), entry.get("message"), entry.get("type"))
			if key in seen:
				continue
			seen.add(key)
			if len(seen) > 5000:
				seen.pop()
			ts_raw = entry.get("timestamp")
			try:
				ts = int(ts_raw) if ts_raw is not None else 0
			except Exception:
				ts = 0
			if ts and ts <= last_ts:
				continue
			if ts:
				newest = max(newest, ts)
			lines.append(entry)
		else:
			lines.append(entry)
	if lines:
		with open(log_file, "a", encoding="utf-8") as handle:
			for entry in lines:
				if isinstance(entry, (dict, list)):
					handle.write(json.dumps(entry, ensure_ascii=False))
				else:
					handle.write(str(entry))
				handle.write("\n")
	return newest

selected_host = None
last_console_ts = 0
last_error_ts = 0
seen_entries = set()

while True:
	if not selected_host:
		selected_host = discover_host()
		if not selected_host:
			time.sleep(2.0)
			continue
	base_url = f"http://{selected_host}:{port}"
	try:
		console_logs = fetch_json(f"{base_url}/console-logs", timeout=2.0)
		console_errors = fetch_json(f"{base_url}/console-errors", timeout=2.0)
	except Exception:
		selected_host = None
		time.sleep(2.0)
		continue
	last_console_ts = append_entries(console_logs, last_console_ts, seen_entries)
	last_error_ts = append_entries(console_errors, last_error_ts, seen_entries)
	time.sleep(poll_interval)
PY
	BROWSER_CONSOLE_PID="$!"
}

start_console_paste_capture() {
	log_info "Paste capture enabled (pipe: ${CONSOLE_PASTE_PIPE})"
	mkfifo -m 600 "${CONSOLE_PASTE_PIPE}"
	"$PYTHON_CMD" - "$CONSOLE_PASTE_PIPE" "$CONSOLE_LOG" <<'PY' &
import json
import sys
import time

pipe_path = sys.argv[1]
log_file = sys.argv[2]

def write_entry(message: str):
	payload = {
		"type": "manual-paste",
		"level": "error",
		"message": message,
		"timestamp": int(time.time() * 1000),
	}
	with open(log_file, "a", encoding="utf-8") as handle:
		handle.write(json.dumps(payload, ensure_ascii=False))
		handle.write("\n")

while True:
	with open(pipe_path, "r", encoding="utf-8", errors="replace") as handle:
		for line in handle:
			line = line.rstrip("\n")
			if line:
				write_entry(line)
PY
	CONSOLE_PASTE_PID="$!"
}

start_browser_tools_server
start_browser_console_capture
start_console_paste_capture

cleanup() {
	if [ -n "${DOCKER_LOGS_PID}" ]; then
		kill "${DOCKER_LOGS_PID}" >/dev/null 2>&1 || true
	fi
	if [ -n "${LLAMA_LOGS_PID}" ]; then
		kill "${LLAMA_LOGS_PID}" >/dev/null 2>&1 || true
	fi
	if [ -n "${FRONTEND_PID}" ]; then
		kill "${FRONTEND_PID}" >/dev/null 2>&1 || true
	fi
	if [ -n "${MCP_LOGS_PID}" ]; then
		kill "${MCP_LOGS_PID}" >/dev/null 2>&1 || true
	fi
	if [ -n "${BROWSER_CONSOLE_PID}" ]; then
		kill "${BROWSER_CONSOLE_PID}" >/dev/null 2>&1 || true
	fi
	if [ -n "${BROWSER_TOOLS_PID}" ]; then
		kill "${BROWSER_TOOLS_PID}" >/dev/null 2>&1 || true
	fi
	if [ -n "${CONSOLE_PASTE_PID}" ]; then
		kill "${CONSOLE_PASTE_PID}" >/dev/null 2>&1 || true
	fi
}

trap cleanup EXIT INT TERM

# 2. Get Admin Token
ADMIN_TOKEN="$(ensure_admin_token)"

# If ADMIN_TOKEN is defined in root .env, use it instead of the generated/stored one
if [ -f "$SCRIPT_DIR/.env" ] && grep -q "^ADMIN_TOKEN=" "$SCRIPT_DIR/.env"; then
    log_info "Detected ADMIN_TOKEN in .env, using it."
    ADMIN_TOKEN=$(grep "^ADMIN_TOKEN=" "$SCRIPT_DIR/.env" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
fi

log_success "Admin token ready (stored at ${ADMIN_TOKEN_FILE})"
log_info "Admin login URL: http://localhost:8004?token=${ADMIN_TOKEN}"

# clean_frontend_cache

log_info "Invoking stack containers using deploy.py..."

# Copy root .env to frontend-huggingface/.env so the local frontend picks it up
if [ -f "$SCRIPT_DIR/.env" ]; then
    log_info "Copying root .env to frontend-huggingface/.env (excluding NODE_ENV and MCP restrictions)..."
    # Filter out NODE_ENV to avoid Vite conflict in dev mode
    # Filter out MCP safety flags to override them for dev
    grep -vE "^(NODE_ENV|MCP_ALLOW_LOCALHOST_URLS|MCP_ALLOW_PRIVATE_URLS)=" "$SCRIPT_DIR/.env" > "$SCRIPT_DIR/frontend-huggingface/.env"
    
    # Inject required dev configurations if not present
    echo "" >> "$SCRIPT_DIR/frontend-huggingface/.env"
    echo "# --- Dev Injection ---" >> "$SCRIPT_DIR/frontend-huggingface/.env"
    
    # Enable Localhost/Private URLs for MCP in Dev Mode
    echo "MCP_ALLOW_LOCALHOST_URLS=true" >> "$SCRIPT_DIR/frontend-huggingface/.env"
    echo "MCP_ALLOW_PRIVATE_URLS=true" >> "$SCRIPT_DIR/frontend-huggingface/.env"
    
    if ! grep -q "^COOKIE_NAME=" "$SCRIPT_DIR/.env"; then
        echo "COOKIE_NAME=chat-session" >> "$SCRIPT_DIR/frontend-huggingface/.env"
    fi

    if ! grep -q "^ADMIN_CLI_LOGIN=" "$SCRIPT_DIR/.env"; then
        echo "ADMIN_CLI_LOGIN=true" >> "$SCRIPT_DIR/frontend-huggingface/.env"
    fi

    if ! grep -q "^ADMIN_TOKEN=" "$SCRIPT_DIR/.env"; then
        echo "ADMIN_TOKEN=${ADMIN_TOKEN}" >> "$SCRIPT_DIR/frontend-huggingface/.env"
    fi

    # Single-user always-admin mode (dev default unless explicitly overridden)
    if ! grep -q "^SINGLE_USER_ADMIN=" "$SCRIPT_DIR/frontend-huggingface/.env"; then
        echo "SINGLE_USER_ADMIN=true" >> "$SCRIPT_DIR/frontend-huggingface/.env"
    fi
    if ! grep -q "^SINGLE_USER_SESSION_SECRET=" "$SCRIPT_DIR/frontend-huggingface/.env"; then
        echo "SINGLE_USER_SESSION_SECRET=bricksllm-single-user-admin" >> "$SCRIPT_DIR/frontend-huggingface/.env"
    fi
fi

# Ensure .svelte-kit directory exists to avoid tsconfig warning
log_info "Syncing SvelteKit to generate types and config..."
(cd frontend-huggingface && npx svelte-kit sync) || log_error "SvelteKit sync failed, but continuing..."

# Pass --no-frontend to deploy.py to start backend services only
if ! "$VENV_DIR/bin/python" deploy.py --no-frontend; then
    log_error "Failed to deploy stack services."
    exit 1
fi

log_success "Stack services are ready."

SERVICES="$(
	docker compose config --services \
		| tr -d '\r' \
		| grep -v '^frontend-ui$' \
		| grep -v '^mcp-sse-proxy$' \
		| grep -v '^llama-server$' \
		| xargs
)"

HEALTHCHECK_LOG_FILTER_REGEX='("GET /(health|healthz|readyz|livez)(\?| |/|")|/api/health|/readyz|/healthz|/livez)'

# 4. Start Docker logs in background (buffered to file)
log_info "Starting backend services (logs buffering to $BACKEND_LOG)..."
# --no-color ensures logs are readable in text editors
# format_logs.py handles ANSI stripping and date formatting (Jerusalem Time)
docker compose logs -f --no-color --tail=0 ${SERVICES} 2>&1 | \
    python3 "$SCRIPT_DIR/scripts/format_logs.py" | \
    grep -vE "${HEALTHCHECK_LOG_FILTER_REGEX}" > "$BACKEND_LOG" &
DOCKER_LOGS_PID="$!"

# Start llama-server logs (buffering to BACKEND_LOG)
docker compose logs -f --no-color --tail=0 llama-server 2>&1 | \
    python3 "$SCRIPT_DIR/scripts/format_logs.py" | \
    grep -vE "${HEALTHCHECK_LOG_FILTER_REGEX}" >> "$BACKEND_LOG" &
LLAMA_LOGS_PID="$!"

# Start mcp-sse-proxy logs (buffering to FRONTEND_LOG)
# We append (>>) so we don't overwrite frontend logs
docker compose logs -f --no-color --tail=0 mcp-sse-proxy 2>&1 | \
    python3 "$SCRIPT_DIR/scripts/format_logs.py" | \
    grep -vE "${HEALTHCHECK_LOG_FILTER_REGEX}" >> "$FRONTEND_LOG" &
MCP_LOGS_PID="$!"

# 5. Start Frontend in background (buffered to file)
log_info "Starting frontend server (logs buffering to $FRONTEND_LOG)..."
cd frontend-huggingface
# FORCE_COLOR=0 disables ANSI colors for readability
# format_logs.py handles ANSI stripping and date formatting
# Explicitly export MCP safety flags to ensure they are picked up by the process
export MCP_ALLOW_LOCALHOST_URLS=true
export MCP_ALLOW_PRIVATE_URLS=true
FORCE_COLOR=0 npm run dev -- --port 8004 --host 0.0.0.0 --clearScreen false 2>&1 | \
    python3 "$SCRIPT_DIR/scripts/format_logs.py" >> "$FRONTEND_LOG" &
FRONTEND_PID="$!"
cd ..

# 6. Wait for Frontend to be ready
log_info "Waiting for UI to become reachable..."
START_TIME=$(date +%s)
TIMEOUT=120
UI_READY=false

while true; do
    # Check if frontend process is still running
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        log_error "Frontend process died unexpectedly."
        break
    fi

    if curl -s --head http://localhost:8004 >/dev/null; then
        UI_READY=true
        break
    fi
    CURRENT_TIME=$(date +%s)
    if (( CURRENT_TIME - START_TIME > TIMEOUT )); then
        break
    fi
    sleep 1
done

if [ "$UI_READY" = false ]; then
    log_error "Frontend did not respond in ${TIMEOUT}s. Showing frontend logs:"
    cat "$FRONTEND_LOG"
    exit 1
fi

# ==============================================================================
# 🚀 STARTUP SUMMARY
# ==============================================================================
clear
log_success "Stack is ready!"
echo -e "${BLUE}====================================================================${NC}"
echo -e "  ${GREEN}Frontend UI:${NC}    http://localhost:8004"
echo -e "  ${GREEN}Admin Link:${NC}     http://localhost:8004?token=${ADMIN_TOKEN}"
echo -e "  ${GREEN}Admin Token:${NC}    ${ADMIN_TOKEN}"
echo -e "${BLUE}====================================================================${NC}"
echo ""
echo -e "1. Open the Admin Link above in your browser."
echo -e "2. Once the UI is visible, press ${GREEN}ENTER${NC} below to start streaming logs."
echo -e "   (Logs are currently being buffered to .logs/)"
echo -e "3. To paste extension errors, run: ${GREEN}cat > .logs/console.paste${NC} in another terminal, paste, then Ctrl+D."
echo ""

read -p "Press ENTER to start streaming logs..."

echo ""
log_info "Streaming logs... (Press Ctrl+C to stop)"
tail -n 200 -F "$FRONTEND_LOG" | grep --line-buffered -vE "${HEALTHCHECK_LOG_FILTER_REGEX}"
