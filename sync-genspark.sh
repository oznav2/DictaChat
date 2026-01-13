#!/bin/bash
# =============================================================================
# sync-genspark.sh - Auto-sync script for pulling AI sandbox commits
# =============================================================================
# 
# This script automatically pulls the latest commits from the genspark_ai_developer branch
# that were made by the AI assistant in the sandbox environment.
#
# Usage:
#   ./sync-genspark.sh              # Pull latest changes
#   ./sync-genspark.sh --watch      # Watch mode - poll every 30 seconds
#   ./sync-genspark.sh --log        # Show recent commits
#   ./sync-genspark.sh --status     # Show current status
#
# The AI assistant commits with sequential numbering format:
#   001-description, 002-description, etc.
#
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REMOTE="origin"
LOCAL_BRANCH="genspark_ai_developer"
REMOTE_BRANCH="genspark_ai_developer"
POLL_INTERVAL=30

# Functions
print_header() {
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}  DictaChat Genspark Branch Sync Tool${NC}"
    echo -e "${BLUE}============================================${NC}"
}

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_branch() {
    current_branch=$(git branch --show-current)
    if [ "$current_branch" != "$LOCAL_BRANCH" ]; then
        print_warning "Currently on branch '$current_branch', switching to '$LOCAL_BRANCH'..."
        git checkout "$LOCAL_BRANCH" 2>/dev/null || git checkout -b "$LOCAL_BRANCH" --track "$REMOTE/$REMOTE_BRANCH"
    fi
}

fetch_updates() {
    print_status "Fetching updates from $REMOTE..."
    git fetch "$REMOTE" "$REMOTE_BRANCH"
}

get_commit_count() {
    local behind=$(git rev-list --count HEAD.."$REMOTE/$REMOTE_BRANCH" 2>/dev/null || echo "0")
    echo "$behind"
}

show_pending_commits() {
    local count=$(get_commit_count)
    if [ "$count" -gt 0 ]; then
        echo -e "${YELLOW}$count new commit(s) available:${NC}"
        echo ""
        git log --oneline HEAD.."$REMOTE/$REMOTE_BRANCH" | head -20
        echo ""
    else
        print_status "Already up to date!"
    fi
}

pull_changes() {
    print_status "Pulling changes from $REMOTE/$REMOTE_BRANCH..."
    git pull "$REMOTE" "$REMOTE_BRANCH"
}

show_log() {
    echo -e "${BLUE}Recent commits on $LOCAL_BRANCH:${NC}"
    echo ""
    git log --oneline --graph -20
}

show_status() {
    echo -e "${BLUE}Current Status:${NC}"
    echo ""
    echo "Local branch:  $LOCAL_BRANCH"
    echo "Remote:        $REMOTE/$REMOTE_BRANCH"
    echo "Current HEAD:  $(git rev-parse --short HEAD)"
    echo ""
    
    fetch_updates
    local behind=$(get_commit_count)
    local ahead=$(git rev-list --count "$REMOTE/$REMOTE_BRANCH"..HEAD 2>/dev/null || echo "0")
    
    if [ "$behind" -gt 0 ]; then
        echo -e "${YELLOW}Behind by $behind commit(s)${NC}"
    fi
    if [ "$ahead" -gt 0 ]; then
        echo -e "${YELLOW}Ahead by $ahead commit(s)${NC}"
    fi
    if [ "$behind" -eq 0 ] && [ "$ahead" -eq 0 ]; then
        echo -e "${GREEN}Up to date with remote${NC}"
    fi
    
    echo ""
    echo "Working tree status:"
    git status --short
}

watch_mode() {
    print_header
    print_status "Starting watch mode (polling every ${POLL_INTERVAL}s)..."
    print_status "Press Ctrl+C to stop"
    echo ""
    
    check_branch
    
    while true; do
        fetch_updates
        local count=$(get_commit_count)
        
        if [ "$count" -gt 0 ]; then
            echo ""
            echo -e "${YELLOW}[$(date +%H:%M:%S)]${NC} Found $count new commit(s)!"
            show_pending_commits
            
            read -t 10 -p "Pull now? [Y/n/skip]: " response || response="y"
            case "$response" in
                [nN]|skip)
                    print_status "Skipped. Will check again in ${POLL_INTERVAL}s..."
                    ;;
                *)
                    pull_changes
                    ;;
            esac
        else
            echo -ne "\r${GREEN}[$(date +%H:%M:%S)]${NC} Up to date. Checking again in ${POLL_INTERVAL}s...    "
        fi
        
        sleep "$POLL_INTERVAL"
    done
}

# Main
main() {
    # Ensure we're in a git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        print_error "Not a git repository!"
        exit 1
    fi
    
    case "${1:-}" in
        --watch|-w)
            watch_mode
            ;;
        --log|-l)
            print_header
            show_log
            ;;
        --status|-s)
            print_header
            show_status
            ;;
        --help|-h)
            print_header
            echo ""
            echo "Usage: $0 [option]"
            echo ""
            echo "Options:"
            echo "  (none)        Pull latest changes from genspark branch"
            echo "  --watch, -w   Watch mode - poll for new commits every ${POLL_INTERVAL}s"
            echo "  --log, -l     Show recent commit history"
            echo "  --status, -s  Show sync status"
            echo "  --help, -h    Show this help"
            echo ""
            ;;
        *)
            print_header
            check_branch
            fetch_updates
            show_pending_commits
            pull_changes
            ;;
    esac
}

main "$@"
