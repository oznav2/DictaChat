#!/bin/bash

# Ensure script is run from its directory
cd "$(dirname "$0")"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check for Python 3
if command_exists python3; then
    PYTHON_CMD="python3"
elif command_exists python; then
    PYTHON_CMD="python"
else
    echo "Error: Python 3 is not installed. Please install Python 3 to proceed."
    exit 1
fi

# Check version (optional, but good practice)
PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | awk '{print $2}')
echo "Using Python: $PYTHON_CMD ($PYTHON_VERSION)"

# Create virtual environment if it doesn't exist
VENV_DIR=".venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    $PYTHON_CMD -m venv "$VENV_DIR"
fi

# Activate virtual environment
source "$VENV_DIR/bin/activate"

# Install requirements (Rich) if not installed
if ! python -c "import rich" &> /dev/null; then
    echo "Installing required Python packages (rich)..."
    pip install rich requests
fi

# Install requirements (Docling) if not installed
if ! python -c "import docling" &> /dev/null; then
    echo "Installing required Python packages (docling)..."
    pip install docling
fi

# Pass control to the Python deployment script
# Use the venv python explicitly to avoid system python issues
"$VENV_DIR/bin/python" deploy.py "$@"
