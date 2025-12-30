import os
import sys
import platform
import subprocess
import time
import shutil
import re
import argparse
import hashlib
import json
from pathlib import Path

# Ensure rich is installed before importing
try:
    from rich.console import Console
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
    from rich.panel import Panel
    from rich.prompt import Confirm, Prompt
    from rich.theme import Theme
    from rich import print as rprint
except ImportError:
    print("Rich library not found. Installing...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "rich"])
    from rich.console import Console
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
    from rich.panel import Panel
    from rich.prompt import Confirm, Prompt
    from rich.theme import Theme
    from rich import print as rprint

# Custom theme for BricksLLM
custom_theme = Theme({
    "info": "cyan",
    "warning": "yellow",
    "error": "bold red",
    "success": "bold green",
    "step": "bold blue"
})

console = Console(theme=custom_theme)
SCRIPT_DIR = Path(__file__).parent.absolute()
STATE_FILE = SCRIPT_DIR / ".deployment_state"
ENV_FILE = SCRIPT_DIR / ".env"
DOCKER_COMPOSE_FILE = SCRIPT_DIR / "docker-compose.yml"

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def print_banner(mode="Standard"):
    banner = """
    ╔═══════════════════════════════════════════════════════════════╗
    ║             DictaChat Startup                                 ║
    ║                                                               ║
    ║  Stack: DictaLM-3.0-24B (llama-server) + PostgreSQL + Redis   ║
    ║            + Frontend UI + 12 MCP Servers via SSE Proxy       ║
    ║  Model: DictaLM-3.0-24B (GGUF)                                ║
    ╚═══════════════════════════════════════════════════════════════╝
    """
    subtitle = f"[bold yellow]Mode: {mode}[/]"
    console.print(Panel(banner, title="[bold blue]DictaChat Stack Installer[/]", subtitle=subtitle, border_style="blue"))

def get_file_hash(file_path):
    """Calculate MD5 hash of a file to detect changes."""
    if not file_path.exists():
        return None
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def load_state():
    """Load deployment state from hidden file."""
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE, "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {}
    return {}

def save_state(state):
    """Save deployment state to hidden file."""
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=4)

def check_fast_track_eligibility(state, force=False):
    """Determine if fast-track mode can be used."""
    if force:
        return False, "Force flag used"
    
    if not state.get("last_successful_deployment"):
        return False, "No previous successful deployment found"
    
    # Check if critical configuration files have changed
    current_env_hash = get_file_hash(ENV_FILE)
    if state.get("env_hash") != current_env_hash:
        return False, ".env file has changed"
        
    current_compose_hash = get_file_hash(DOCKER_COMPOSE_FILE)
    if state.get("compose_hash") != current_compose_hash:
        return False, "docker-compose.yml has changed"
        
    # Check if docker is still available (basic check)
    if shutil.which("docker") is None:
        return False, "Docker not found"

    return True, "All checks passed"

def check_system_requirements():
    console.print("[step]Step 1: Checking System Requirements...[/]")
    
    # Check OS
    os_name = platform.system()
    if os_name == "Linux":
        try:
            with open("/etc/os-release") as f:
                content = f.read()
                name_match = re.search(r'PRETTY_NAME="([^"]+)"', content)
                distro = name_match.group(1) if name_match else "Unknown Linux"
                
            # Check for WSL
            if "WSL" in platform.uname().release or "microsoft" in platform.uname().release.lower():
                console.print(f"[success]✔ Detected WSL Environment: {distro}[/]")
            else:
                console.print(f"[success]✔ Detected Linux Environment: {distro}[/]")
        except Exception:
            console.print("[warning]⚠ Could not detect specific Linux distro[/]")
            
    elif os_name == "Windows":
        console.print("[success]✔ Detected Windows Environment[/]")
    elif os_name == "Darwin":
        console.print("[success]✔ Detected macOS Environment[/]")
    else:
        console.print(f"[warning]⚠ Unknown OS: {os_name}[/]")

    # Check CUDA
    cuda_detected = False
    try:
        # Check nvcc
        subprocess.run(["nvcc", "-V"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        # Check nvidia-smi
        subprocess.run(["nvidia-smi"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        cuda_detected = True
        console.print("[success]✔ CUDA Detected (nvcc and nvidia-smi found)[/]")
    except (subprocess.CalledProcessError, FileNotFoundError):
        console.print("[warning]⚠ CUDA not detected or not fully configured.[/]")
        if Confirm.ask("CUDA is required for GPU acceleration. Do you want to attempt to install CUDA toolkit? (Experimental)"):
            try:
                subprocess.run([sys.executable, str(SCRIPT_DIR / "cuda_install.py")], check=True)
                # Re-check after installation attempt
                try:
                    subprocess.run(["nvidia-smi"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
                    cuda_detected = True
                    console.print("[success]✔ CUDA successfully installed/verified![/]")
                except:
                    console.print("[error]✘ CUDA installation failed or still not detected.[/]")
            except Exception as e:
                console.print(f"[error]✘ Error running CUDA installer: {e}[/]")
    
    if not cuda_detected:
        if not Confirm.ask("[warning]Continuing without CUDA means Llama.cpp will run in CPU-only mode (very slow). Continue?[/]"):
            sys.exit(1)

def check_env_configuration():
    console.print("\n[step]Step 2: Verifying Configuration...[/]")
    
    env_heb_path = SCRIPT_DIR / ".env.heb"
    
    if not ENV_FILE.exists():
        console.print("[warning]⚠ .env file not found.[/]")
        if env_heb_path.exists():
            console.print("[info]Creating .env from .env.heb template...[/]")
            shutil.copy(env_heb_path, ENV_FILE)
            console.print("[success]✔ Created .env file[/]")
        else:
            console.print("[error]✘ No .env and no .env.heb template found![/]")
            sys.exit(1)
            
    # Load and validate .env
    env_vars = {}
    with open(ENV_FILE) as f:
        for line in f:
            if line.strip() and not line.startswith('#'):
                parts = line.strip().split('=', 1)
                if len(parts) == 2:
                    env_vars[parts[0]] = parts[1].strip('"').strip("'")
    
    required_vars = ["POSTGRESQL_PASSWORD", "REDIS_PASSWORD", "HF_REPO", "HF_FILE"]
    missing = [v for v in required_vars if v not in env_vars or not env_vars[v]]
    
    if missing:
        console.print(f"[error]✘ Missing required variables in .env: {', '.join(missing)}[/]")
        console.print("[info]Please edit .env and set these values.[/]")
        sys.exit(1)
        
    return env_vars

def check_model_files(env_vars):
    console.print("\n[step]Step 3: Checking Model Files...[/]")
    
    # Get raw path from env
    raw_path = env_vars.get("LOCAL_MODEL_PATH", "./models")
    local_model_path = Path(raw_path).resolve()
    
    model_filename = env_vars.get("HF_FILE", "dictalm-3.0-24b-thinking-fp8-q4_k_m.gguf")
    repo = env_vars.get("HF_REPO", "VRDate/DictaLM-3.0-24B-Thinking-FP8-Q4_K_M-GGUF")
    
    # SMART FIX: Check if the user provided a direct file path in LOCAL_MODEL_PATH
    # Logic: if it exists and is a file, OR if it doesn't exist but looks like a GGUF file path
    is_direct_file = False
    if local_model_path.exists() and local_model_path.is_file():
        is_direct_file = True
    elif not local_model_path.exists() and local_model_path.suffix.lower() == ".gguf":
        is_direct_file = True
        
    if is_direct_file:
        console.print(f"[info]ℹ Detected direct file path in LOCAL_MODEL_PATH: {local_model_path.name}[/]")
        console.print("[info]Auto-correcting configuration for Docker compatibility...[/]")
        
        # Split into directory and filename
        actual_dir = local_model_path.parent
        actual_filename = local_model_path.name
        
        # Set environment variables for the current process (which Docker Compose will inherit)
        os.environ["LOCAL_MODEL_PATH"] = str(actual_dir)
        os.environ["HF_FILE"] = actual_filename
        
        # Update local variables for the rest of this function
        local_model_path = actual_dir
        model_filename = actual_filename
        
        console.print(f"[info]  • Model Directory: {local_model_path}[/]")
        console.print(f"[info]  • Model Filename:  {model_filename}[/]")
    
    # Ensure directory exists
    if not local_model_path.exists():
        console.print(f"[info]Creating model directory: {local_model_path}[/]")
        local_model_path.mkdir(parents=True, exist_ok=True)
        
    model_file = local_model_path / model_filename
    
    if model_file.exists():
        console.print(f"[success]✔ Model file found: {model_filename}[/]")
    else:
        console.print(f"[warning]⚠ Model file missing: {model_filename}[/]")
        url = f"https://huggingface.co/{repo}/resolve/main/{model_filename}"
        
        if Confirm.ask(f"Do you want to download it now from {url}?"):
            download_file(url, model_file)
        else:
            console.print("[error]✘ Cannot proceed without model file.[/]")
            sys.exit(1)

def download_file(url, dest_path):
    try:
        import requests
        from rich.progress import DownloadColumn, TransferSpeedColumn
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
        import requests
        from rich.progress import DownloadColumn, TransferSpeedColumn

    response = requests.get(url, stream=True)
    response.raise_for_status()
    total_size = int(response.headers.get('content-length', 0))
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        DownloadColumn(),
        TransferSpeedColumn(),
        console=console
    ) as progress:
        task = progress.add_task(f"[cyan]Downloading {dest_path.name}...", total=total_size)
        
        with open(dest_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=32768):
                f.write(chunk)
                progress.update(task, advance=len(chunk))
                
    console.print("[success]✔ Download complete![/]")

def check_docker_images():
    console.print("\n[step]Step 4: Verifying Docker Images...[/]")
    
    services = [
        {"name": "frontend-ui", "path": "./frontend-huggingface"},
        {"name": "mcp-sse-proxy", "path": "./mcp-sse-proxy", "no_cache": True}
    ]
    
    for service in services:
        img_name = service["name"]
        # Check if image exists
        result = subprocess.run(
            ["docker", "image", "inspect", img_name], 
            stdout=subprocess.DEVNULL, 
            stderr=subprocess.DEVNULL
        )
        
        if result.returncode != 0:
            console.print(f"[warning]⚠ Image {img_name} not found. Building...[/]")
            cmd = ["docker", "compose", "build", img_name]
            if service.get("no_cache"):
                cmd.append("--no-cache")
                
            with console.status(f"[bold green]Building {img_name}...[/]"):
                if subprocess.run(cmd).returncode == 0:
                    console.print(f"[success]✔ Built {img_name}[/]")
                else:
                    console.print(f"[error]✘ Failed to build {img_name}[/]")
                    sys.exit(1)
        else:
            console.print(f"[success]✔ Image {img_name} exists[/]")

def wait_for_model_loading():
    console.print("\n[step]Step 6: Waiting for Model Loading...[/]")
    console.print("[dim]This involves loading the GGUF model into VRAM and initializing the server.[/]")
    
    try:
        import requests
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
        import requests

    llama_health_url = "http://localhost:5002/health"
    
    start_time = time.time()
    
    # 1. Get Model Path
    try:
        # Load env again to get current path
        env_vars = {}
        if ENV_FILE.exists():
            with open(ENV_FILE) as f:
                for line in f:
                    if line.strip() and not line.startswith('#'):
                        parts = line.strip().split('=', 1)
                        if len(parts) == 2:
                            env_vars[parts[0]] = parts[1].strip('"').strip("'")
                            
        local_model_path = Path(env_vars.get("LOCAL_MODEL_PATH", "./models")).resolve()
        model_filename = env_vars.get("HF_FILE", "dictalm-3.0-24b-thinking-fp8-q4_k_m.gguf")
        
        full_path = local_model_path / model_filename
        if not full_path.exists() and local_model_path.is_file():
             full_path = local_model_path
    except Exception:
        full_path = None

    if full_path and full_path.exists():
        total_bytes = full_path.stat().st_size
        chunk_size = 4 * 1024 * 1024 # 4MB chunks
        
        console.print(f"[info]Loading Model to VRAM Memory: {full_path.name} ({total_bytes / (1024**3):.2f} GB)[/]")
        
        try:
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                BarColumn(),
                TaskProgressColumn(),
                #DownloadColumn(), # Shows size
                #TransferSpeedColumn(), # Shows speed
                console=console,
                transient=False
            ) as progress:
                task_id = progress.add_task("[blue]Loading...", total=total_bytes)
                
                with open(full_path, "rb") as f:
                    loaded_bytes = 0
                    while loaded_bytes < total_bytes:
                        chunk = f.read(chunk_size)
                        if not chunk:
                            break
                        loaded_bytes += len(chunk)
                        progress.update(task_id, advance=len(chunk))
                        
                        # Optimization: Don't just burn CPU/IO.
                        # Also, if we want to be smart, we could check if the server is ALREADY ready
                        # and abort the read?
                        # No, let's finish the read to ensure file isn't corrupted.
                        
        except Exception as e:
            console.print(f"[warning]⚠ Error reading model file: {e}[/]")
    
    # 2. Wait for Server (The real wait)
    console.print("[step]Waiting for Server API...[/]")
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
        transient=True
    ) as progress:
        task = progress.add_task("[cyan]Waiting for Llama.cpp Health Check...", total=None)
        
        max_retries = 60  # Wait up to ~2 minutes
        for i in range(max_retries):
            try:
                response = requests.get(llama_health_url, timeout=2)
                if response.status_code == 200:
                    progress.stop()
                    console.print("[success]✔ Model loaded & Server Ready![/]")
                    return True
            except requests.RequestException:
                pass
            
            time.sleep(2)
        
        progress.stop()
        console.print("[warning]⚠ Model loading timed out or status is unclear.[/]")
        console.print("[dim]The service might still be loading in the background.[/]")
        return False

def deploy_docling_verbose():
    console.print("\n[info]Initializing Docling Service...[/]")
    
    # 1. Check if container is already running and healthy
    inspect = subprocess.run(
        ["docker", "inspect", "--format", "{{.State.Status}}", "dicta-docling"],
        capture_output=True,
        text=True
    )
    if inspect.returncode == 0 and inspect.stdout.strip() == "running":
        console.print("[success]✔ Docling service is already running[/]")
        return

    # 2. Start docling specifically
    subprocess.run(["docker", "compose", "up", "-d", "docling"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # 3. Monitor logs for downloads OR immediate readiness
    console.print("[dim]Scanning Docling logs...[/]")
    try:
        process = subprocess.Popen(
            ["docker", "logs", "-f", "dicta-docling"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        start_time = time.time()
        download_patterns = [
            "Downloading layout model",
            "Downloading tableformer model",
            "Downloading picture classifier model",
            "Downloading code formula model",
            "Downloading easyocr models"
        ]
        
        is_downloading = False
        
        while True:
            line = process.stdout.readline()
            if not line:
                break
            
            line_str = line.strip()
            
            # Check for download patterns
            if any(p in line_str for p in download_patterns):
                 if not is_downloading:
                     console.print("[cyan]⬇ Downloading Docling models...[/]")
                     is_downloading = True
                 console.print(f"[cyan]  {line_str}[/]")
            
            # Rewrite 0.0.0.0 to localhost for user-friendly output
            if "http://0.0.0.0:5001" in line_str:
                line_str = line_str.replace("http://0.0.0.0:5001", "http://localhost:5001")
                console.print(f"[dim]  {line_str}[/]")

            # Break on startup success
            if "Application startup complete" in line_str or "Uvicorn running on" in line_str:
                console.print("[success]✔ Docling models deployed to container[/]")
                console.print("[success]✔ Docling service ready![/]")
                process.terminate()
                break
            
            # Timeout (120s)
            if time.time() - start_time > 120:
                process.terminate()
                console.print("[warning]⚠ Docling startup monitoring timed out (service might still be loading)[/]")
                break
    except Exception as e:
        console.print(f"[warning]⚠ Could not monitor docling logs: {e}[/]")

def deploy_retrieval_verbose():
    console.print("\n[info]Initializing Retrieval Services (Embeddings & Reranker)...[/]")
    
    # 1. Check if container is already running and healthy
    inspect = subprocess.run(
        ["docker", "inspect", "--format", "{{.State.Status}}", "dicta-retrieval"],
        capture_output=True,
        text=True
    )
    if inspect.returncode == 0 and inspect.stdout.strip() == "running":
        console.print("[success]✔ Retrieval service is already running[/]")
        return

    # 2. Start retrieval specifically
    subprocess.run(["docker", "compose", "up", "-d", "dicta-retrieval"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # 3. Monitor logs for downloads OR immediate readiness
    console.print("[dim]Scanning Retrieval logs...[/]")
    try:
        process = subprocess.Popen(
            ["docker", "logs", "-f", "dicta-retrieval"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        start_time = time.time()
        
        while True:
            line = process.stdout.readline()
            if not line:
                break
            
            line_str = line.strip()
            
            # Filter and style interesting logs
            if "Starting Embedding Service" in line_str:
                 console.print("[cyan]📊 Starting Embedding Service (Port 5005)...[/]")
            elif "Starting Reranking Service" in line_str:
                 console.print("[cyan]🔄 Starting Reranking Service (Port 5006)...[/]")
            elif "Loading Embedding routes" in line_str:
                 console.print("[dim]  Loading Embedding models...[/]")
            elif "Loading Reranker routes" in line_str:
                 console.print("[dim]  Loading Reranker models...[/]")
            
            # Show "All services running" as success
            if "All services running!" in line_str:
                console.print("[success]✔ Retrieval services ready![/]")
                process.terminate()
                break
            
            # Timeout (120s)
            if time.time() - start_time > 120:
                process.terminate()
                console.print("[warning]⚠ Retrieval startup monitoring timed out (service might still be loading)[/]")
                break
                
    except Exception as e:
        console.print(f"[warning]⚠ Could not monitor retrieval logs: {e}[/]")

def deploy_services():
    console.print("\n[step]Step 5: Deploying Services...[/]")
    
    # Deploy Docling first with verbose logs
    deploy_docling_verbose()
    
    # Deploy Retrieval second with verbose logs
    deploy_retrieval_verbose()
    
    with console.status("[bold green]Starting remaining services with Docker Compose...[/]"):
        if subprocess.run(["docker", "compose", "up", "-d"]).returncode == 0:
            console.print("[success]✔ Services started successfully[/]")
        else:
            console.print("[error]✘ Failed to start services[/]")
            sys.exit(1)
            
    # Update state file upon successful deployment
    state = {
        "last_successful_deployment": time.time(),
        "env_hash": get_file_hash(ENV_FILE),
        "compose_hash": get_file_hash(DOCKER_COMPOSE_FILE)
    }
    save_state(state)

def fast_track_deploy():
    console.print("\n[bold green]⚡ Fast-Track Mode Activated[/]")
    console.print("[dim]Skipping redundant checks based on previous successful state.[/]")
    
    # Basic system sanity check is still good (e.g. is docker running?)
    if shutil.which("docker") is None:
        console.print("[error]✘ Docker not found! Falling back to full check.[/]")
        return False

    with console.status("[bold green]🚀 Fast-tracking deployment...[/]"):
        # We still need to make sure the containers are up
        result = subprocess.run(["docker", "compose", "up", "-d"], capture_output=True)
        
        if result.returncode == 0:
            console.print("[success]✔ Services started successfully (Fast-Track)[/]")
            return True
        else:
            console.print("[warning]⚠ Fast-track deployment encountered an issue. Falling back to full checks.[/]")
            console.print(f"[dim]{result.stderr.decode()}[/]")
            return False

def main():
    parser = argparse.ArgumentParser(description="BricksLLM Deployment Script")
    parser.add_argument("--force", action="store_true", help="Force full checks, bypassing fast-track mode")
    args = parser.parse_args()

    clear_screen()
    
    state = load_state()
    is_eligible, reason = check_fast_track_eligibility(state, args.force)
    
    mode = "Fast-Track ⚡" if is_eligible else "Standard Setup"
    print_banner(mode)

    deployed = False
    if is_eligible:
        if fast_track_deploy():
            deployed = True
        else:
            console.print("\n[bold yellow]Falling back to standard deployment flow...[/]")
            check_system_requirements()
            env_vars = check_env_configuration()
            check_model_files(env_vars)
            check_docker_images()
            deploy_services()
            deployed = True
    else:
        if not args.force:
            console.print(f"[dim]Standard mode reason: {reason}[/]\n")
        
        check_system_requirements()
        env_vars = check_env_configuration()
        check_model_files(env_vars)
        check_docker_images()
        deploy_services()
        deployed = True
    
    if deployed:
        # Wait for model to actually load before showing success
        wait_for_model_loading()
        
        console.print("\n[bold green]DictaChat Stack Deployment Complete! 🚀[/]")
        console.print("Access the services at:")
        console.print("  • Frontend UI: http://localhost:8004                   • ")
        console.print("  • Admin Panel: http://localhost:8001                   • ")
        console.print("  • MCP Proxy:   http://localhost:3100                   • ")
        console.print("  • Document Engine UI:  http://localhost:5001/ui                • ")
        console.print("  • Embedding API:       http://localhost:5005                   • ")
        console.print("  • Reranking API:       http://localhost:5006                   • ")
        console.print("                                      ")
        console.print("  • Model Configuration (from .env):                     • ")
        console.print("  • Context Size: 32768 tokens (default)                 • ")
        console.print("  • Temperature:  0.4 (default) - moderate creativity    • ")
        console.print("  • Top P: 0.95       (default) - high diversity         • ")
        console.print("  • Num Predict: 2048 tokens (default) - response length • ")
        console.print("  • ==================================================== • ")
        console.print("  • To Stop & Unload the stack:                          • ")
        console.print("  •[bold red] [Use ./stop.sh]                          •[/]")
        console.print("                                      ")
    # Removed the log viewing prompt as requested

if __name__ == "__main__":
    main()
