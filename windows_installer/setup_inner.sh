#!/bin/bash
set -e

# Log output to a file
exec > >(tee -a /var/log/bricksllm_setup.log) 2>&1

echo "=========================================="
echo "Starting BricksLLM Setup inside WSL2..."
echo "=========================================="

# 1. Update and Install Prerequisites
echo "[+] Updating package lists..."
sudo apt-get update -y

echo "[+] Installing prerequisites (curl, git, docker)..."
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    docker.io

# 2. Install NVIDIA Container Toolkit
echo "[+] Installing NVIDIA Container Toolkit..."
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
  && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update -y
sudo apt-get install -y nvidia-container-toolkit

# 3. Configure Docker
echo "[+] Configuring Docker to use NVIDIA runtime..."
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker || sudo service docker start

# 4. Setup User Permissions for Docker
echo "[+] Adding user $SUDO_USER to docker group..."
sudo usermod -aG docker $SUDO_USER || true

# 5. Clone/Update Repository
REPO_DIR="/home/$SUDO_USER/BricksLLM"
if [ -d "$REPO_DIR" ]; then
    echo "[+] Repository exists at $REPO_DIR. Pulling latest changes..."
    cd "$REPO_DIR"
    git pull
else
    echo "[+] Cloning BricksLLM repository to $REPO_DIR..."
    git clone https://github.com/check-mate-ai/BricksLLM.git "$REPO_DIR"
    cd "$REPO_DIR"
fi

# 6. Setup Environment Variables
if [ ! -f ".env" ]; then
    echo "[+] Creating .env file from template..."
    cp .env.template .env
    # Optional: Customize .env here if needed
fi

# 7. Pull Docker Images (Pre-cache)
echo "[+] Pulling Docker images (this may take a while)..."
# We use 'sg' to execute the command with the new group membership immediately
sg docker -c "docker compose pull"

echo "=========================================="
echo "BricksLLM Setup Complete!"
echo "You can now run 'start.sh' from the repository."
echo "=========================================="
