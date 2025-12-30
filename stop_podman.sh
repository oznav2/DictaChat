#!/bin/bash

set -e

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

stop_stack() {
	log_info "Stopping BricksLLM stack (Podman)..."
	
	if [ -f ".logs/frontend.pid" ]; then
		FRONTEND_PID=$(cat .logs/frontend.pid)
		if ps -p $FRONTEND_PID > /dev/null; then
			kill $FRONTEND_PID
			log_success "Frontend service stopped (PID: $FRONTEND_PID)"
		fi
		rm .logs/frontend.pid
	fi

    # Try podman-compose first, then podman compose
    if command -v podman-compose >/dev/null 2>&1; then
        CMD="podman-compose"
    else
        CMD="podman compose"
    fi

	if $CMD down; then
		log_success "Stack stopped and containers removed."
	else
		log_error "Failed to stop stack."
		exit 1
	fi
}

main() {
	stop_stack
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
	main "$@"
fi
