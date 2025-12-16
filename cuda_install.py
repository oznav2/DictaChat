import os
import sys
import platform
import subprocess
from rich.console import Console

console = Console()

def install_cuda_wsl():
    console.print("[bold cyan]Starting CUDA Toolkit installation for WSL...[/]")
    
    # NOTE: This is a simplified example. A real installer would need to handle 
    # different distro versions, cleanup, and verification more robustly.
    commands = [
        "wget https://developer.download.nvidia.com/compute/cuda/repos/wsl-ubuntu/x86_64/cuda-wsl-ubuntu.pin",
        "sudo mv cuda-wsl-ubuntu.pin /etc/apt/preferences.d/cuda-repository-pin-600",
        "wget https://developer.download.nvidia.com/compute/cuda/12.3.2/local_installers/cuda-repo-wsl-ubuntu-12-3-local_12.3.2-1_amd64.deb",
        "sudo dpkg -i cuda-repo-wsl-ubuntu-12-3-local_12.3.2-1_amd64.deb",
        "sudo cp /var/cuda-repo-wsl-ubuntu-12-3-local/cuda-*-keyring.gpg /usr/share/keyrings/",
        "sudo apt-get update",
        "sudo apt-get -y install cuda-toolkit-12-3"
    ]
    
    for cmd in commands:
        console.print(f"[dim]Running: {cmd}[/]")
        try:
            subprocess.run(cmd, shell=True, check=True)
        except subprocess.CalledProcessError as e:
            console.print(f"[bold red]Error executing command: {cmd}[/]")
            console.print(f"[red]{str(e)}[/]")
            sys.exit(1)
            
    console.print("[bold green]CUDA Toolkit installation completed![/]")
    console.print("[yellow]You may need to restart your terminal or WSL instance.[/]")

def main():
    if platform.system() != "Linux" or "WSL" not in platform.uname().release:
        console.print("[red]This script is currently designed for WSL Ubuntu only.[/]")
        return

    install_cuda_wsl()

if __name__ == "__main__":
    main()
