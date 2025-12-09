#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
	echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
	echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
	echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
	echo -e "${RED}[ERROR]${NC} $1"
}

print_banner() {
	echo -e "${BLUE}"
	cat <<'EOF'
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║             BricksLLM Production Stack Startup                ║
║                                                               ║
║  Services: Llama.cpp (GGUF) + BricksLLM + PostgreSQL + Redis  ║
║  Model: DictaLM-3.0-24B (GGUF)                                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
	echo -e "${NC}"
}

check_prerequisites() {
	log_info "Checking prerequisites..."
	
	if ! command -v docker &> /dev/null; then
		log_error "Docker is not installed. Please install Docker first."
		exit 1
	fi
	log_success "Docker found: $(docker --version)"
	
	if ! docker compose version &> /dev/null; then
		log_error "Docker Compose plugin is not installed. Please install Docker Compose."
		exit 1
	fi
	log_success "Docker Compose found: $(docker compose version)"
	
	if ! command -v nvidia-smi &> /dev/null; then
		log_error "NVIDIA drivers not found. GPU acceleration requires NVIDIA drivers."
		exit 1
	fi
	log_success "NVIDIA drivers found: $(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -n1)"
	
	if ! docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu22.04 nvidia-smi &> /dev/null; then
		log_error "NVIDIA Container Toolkit not properly configured."
		log_error "Run: sudo apt-get install -y nvidia-docker2 && sudo systemctl restart docker"
		exit 1
	fi
	log_success "NVIDIA Container Toolkit verified"
	
	if [[ ! -f "$SCRIPT_DIR/.env" ]]; then
		log_error ".env file not found!"
		log_error "Please create .env from .env.template:"
		log_error "  cp .env.template .env"
		log_error "  nano .env  # Edit with your settings"
		exit 1
	fi
	log_success ".env file found"
	
	if [[ ! -f "$SCRIPT_DIR/docker-compose.yml" ]]; then
		log_error "docker-compose.yml not found!"
		exit 1
	fi
	log_success "docker-compose.yml found"
	
	echo ""
}

check_gpu_resources() {
	log_info "Checking GPU resources..."
	
	GPU_COUNT=$(nvidia-smi --list-gpus | wc -l)
	log_info "Available GPUs: $GPU_COUNT"
	
	nvidia-smi --query-gpu=index,name,memory.total,memory.free --format=csv,noheader | while IFS=, read -r idx name total free; do
		log_info "  GPU $idx: $name (Total: $total, Free: $free)"
	done
	
	source .env
	REQUIRED_GPU_IDS="${GPU_DEVICE_IDS:-0}"
	log_info "Configured GPU IDs: $REQUIRED_GPU_IDS"
	
	echo ""
}

validate_env_config() {
	log_info "Validating environment configuration..."
	
	source .env
	
	REQUIRED_VARS=(
		"POSTGRESQL_USERNAME"
		"POSTGRESQL_PASSWORD"
		"POSTGRESQL_DB"
		"REDIS_PASSWORD"
		"LLAMA_IMAGE"
		"HF_REPO"
		"HF_FILE"
		"LOCAL_MODEL_PATH"
		"GPU_DEVICE_IDS"
	)
	
	MISSING_VARS=()
	for var in "${REQUIRED_VARS[@]}"; do
		if [[ -z "${!var}" ]]; then
			MISSING_VARS+=("$var")
		fi
	done
	
	if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
		log_error "Missing required environment variables in .env:"
		for var in "${MISSING_VARS[@]}"; do
			log_error "  - $var"
		done
		exit 1
	fi
	
	log_success "All required environment variables are set"
	echo ""
}

pull_images() {
	log_info "Pulling Docker images (this may take several minutes)..."
	
	if docker compose pull; then
		log_success "All images pulled successfully"
	else
		log_error "Failed to pull one or more images"
		exit 1
	fi
	
	echo ""
}

check_disk_space() {
	log_info "Checking disk space..."
	
	AVAILABLE_GB=$(df -BG "$SCRIPT_DIR" | awk 'NR==2 {print $4}' | sed 's/G//')
	REQUIRED_GB=100
	
	if [[ $AVAILABLE_GB -lt $REQUIRED_GB ]]; then
		log_warning "Low disk space: ${AVAILABLE_GB}GB available (${REQUIRED_GB}GB recommended)"
		log_warning "Model weights and logs require substantial storage"
	else
		log_success "Sufficient disk space: ${AVAILABLE_GB}GB available"
	fi
	
	echo ""
}

verify_model_path() {
	log_info "Verifying local model file..."
	source .env
	
	FULL_PATH="$LOCAL_MODEL_PATH/$HF_FILE"
	
	if [[ -f "$FULL_PATH" ]]; then
		log_success "Model file found: $FULL_PATH"
		return 0
	else
		log_error "Model file NOT found at: $FULL_PATH"
		log_info "Please ensure the path is correct and accessible."
		exit 1
	fi
	
	echo ""
}

start_services() {
	if ! docker compose up -d > /dev/null 2>&1; then
		log_error "Failed to start services"
		exit 1
	fi
}

start_frontend() {
	# Check if frontend is already running via Docker
	if docker compose ps --services --filter "status=running" | grep -q "frontend"; then
		log_success "Frontend is managed by Docker Compose."
		return
	fi

	# Only start locally if not defined in docker-compose or explicitly requested
	if grep -q "container_name: bricksllm-frontend" "$SCRIPT_DIR/docker-compose.yml"; then
		log_info "Frontend service defined in docker-compose but not running. It should start with 'start_services'."
		return
	fi

	log_info "Starting Frontend Service (Local)..."
	
	if ! command -v bun &> /dev/null; then
		log_warning "Bun not found. Skipping local frontend startup."
		return
	fi

	cd "$SCRIPT_DIR/frontend"
	if bun install &> /dev/null; then
		# Kill any existing process on port 8003
		fuser -k 8003/tcp >/dev/null 2>&1 || true
		
		# Start in background
		nohup bun run start > ../.logs/frontend.log 2>&1 &
		FRONTEND_PID=$!
		echo $FRONTEND_PID > ../.logs/frontend.pid
		log_success "Frontend started on http://localhost:8003 (PID: $FRONTEND_PID)"
	else
		log_error "Failed to install frontend dependencies"
	fi
	cd "$SCRIPT_DIR"
}

wait_for_service() {
	local service_name=$1
	local max_attempts=$2
	local sleep_time=$3
	
	for ((i=1; i<=max_attempts; i++)); do
		# Get service status using docker compose ps with json format
		# The format returns an array of objects, we need to access the first element's Health property
		# If the service is not running or health check is not configured, it might return null or empty
		service_info=$(docker compose ps --format json "$service_name")
		
		# Check if service_info is valid json
		if echo "$service_info" | jq empty > /dev/null 2>&1; then
			status=$(echo "$service_info" | jq -r 'if type=="array" then .[0].Health else .Health end // "starting"')
		else
			status="starting"
		fi
		
		if [[ "$status" == "healthy" ]]; then
			return 0
		fi
		
		# Only sleep if we haven't succeeded yet and it's not the last attempt
		if [[ $i -lt $max_attempts ]]; then
			sleep "$sleep_time"
		fi
	done
	
	log_error "$service_name failed to become healthy within expected time"
	return 1
}

monitor_llama_logs() {
	log_info "Monitoring Llama.cpp model loading progress..."
	log_info "This may take 5-10 minutes depending on network speed and GPU"
	echo ""
	
	timeout 600 docker compose logs -f llama-server &
	LOGS_PID=$!
	
	sleep 300
	
	if ps -p $LOGS_PID > /dev/null; then
		kill $LOGS_PID 2>/dev/null || true
	fi
	
	echo ""
}

verify_services() {
	wait_for_service "postgresql" 60 1
	wait_for_service "redis" 30 1
	wait_for_service "llama-server" 120 5
	wait_for_service "bricksllm" 60 3
}

test_endpoints() {
	source .env
	LLAMA_PORT="${LLAMA_HOST_PORT:-5002}"
	
	sleep 5
	
	if ! curl -sf "http://localhost:$LLAMA_PORT/health" > /dev/null; then
		log_warning "Llama.cpp health endpoint not responding yet"
	fi
	
	if ! curl -sf "http://localhost:8001/api/health" > /dev/null; then
		log_warning "BricksLLM health endpoint not responding yet"
	fi
}

print_access_info() {
	source .env
	LLAMA_PORT="${LLAMA_HOST_PORT:-5002}"
	ADMIN_PORT="${BRICKSLLM_ADMIN_PORT:-8001}"
	PROXY_PORT="${BRICKSLLM_PROXY_PORT:-8002}"
	
	echo ""
	echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
	echo -e "${GREEN}║                    Service Access URLs                        ║${NC}"
	echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════╣${NC}"
	echo -e "${GREEN}║${NC} Llama.cpp API (OpenAI-compatible):                          ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC}   http://localhost:$LLAMA_PORT/v1                                   ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC}                                                               ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC} BricksLLM Admin (Provider Settings, API Keys):               ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC}   http://localhost:$ADMIN_PORT                                    ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC}                                                               ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC} BricksLLM Proxy (Client Requests):                           ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC}   http://localhost:$PROXY_PORT                                    ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC}                                                               ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC} Frontend UI:                                                 ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC}   http://localhost:8003                                       ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC}                                                               ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC} BricksLLM Admin Panel:                                       ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC}   http://localhost:3000                                           ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC}                                                               ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC} API Documentation (Swagger UI):                              ${GREEN}║${NC}"
	echo -e "${GREEN}║${NC}   http://localhost:8081                                           ${GREEN}║${NC}"
	echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
	echo ""
}

show_logs_prompt() {
	echo -e "${YELLOW}Would you like to view live logs? (y/N)${NC} "
	read -t 10 -n 1 -r REPLY || REPLY="n"
	echo ""
	
	if [[ $REPLY =~ ^[Yy]$ ]]; then
		log_info "Starting log viewer (Ctrl+C to exit)..."
		docker compose logs -f
	fi
}

cleanup_on_error() {
	log_error "Startup failed. Cleaning up..."
	docker compose down
	exit 1
}

main() {
	trap cleanup_on_error ERR
	
	check_prerequisites > /dev/null
	check_gpu_resources > /dev/null
	validate_env_config > /dev/null
	check_disk_space > /dev/null
	verify_model_path > /dev/null
	pull_images > /dev/null
	start_services
	start_frontend
	verify_services
	test_endpoints
	print_access_info
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
	main "$@"
fi
