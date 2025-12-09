#!/bin/bash
set -e

# Default system prompt if not set
if [ -z "$SYSTEM_PROMPT" ]; then
    export SYSTEM_PROMPT="You are a helpful assistant."
fi

echo "Initializing Llama.cpp with System Prompt: $SYSTEM_PROMPT"

# Read template
TEMPLATE=$(cat /app/chat_template.jinja2.template)

# Replace placeholder
# Use bash string replacement to avoid sed delimiter issues
# Escape double quotes for Jinja string context
ESCAPED_PROMPT=${SYSTEM_PROMPT//\"/\\\"}
FINAL_TEMPLATE="${TEMPLATE/__SYSTEM_PROMPT__/$ESCAPED_PROMPT}"

echo "$FINAL_TEMPLATE" > /app/chat_template.jinja2

# Execute the passed command (llama-server args)
# Append --chat-template-file
exec "$@" --chat-template-file /app/chat_template.jinja2