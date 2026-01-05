# Check for Administrator privileges
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "Please run this script as Administrator!" -ForegroundColor Red
    Start-Sleep -Seconds 5
    Exit
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "      BricksLLM Windows Installer         " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Check/Enable WSL2
Write-Host "[+] Checking WSL2 status..." -ForegroundColor Yellow
$wslStatus = wsl --status 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "WSL is not installed. Installing WSL2..." -ForegroundColor Yellow
    wsl --install --no-distribution
    Write-Host "WSL installed. PLEASE REBOOT YOUR COMPUTER and run this script again." -ForegroundColor Red
    Pause
    Exit
} else {
    Write-Host "WSL is already installed." -ForegroundColor Green
}

# 2. Install Ubuntu Distro
$DistroName = "Ubuntu-22.04"
Write-Host "[+] Checking for $DistroName..." -ForegroundColor Yellow
if (!(wsl -l -v | Select-String $DistroName)) {
    Write-Host "Installing $DistroName..." -ForegroundColor Yellow
    wsl --install -d $DistroName
    # Wait a bit for initialization
    Start-Sleep -Seconds 10
} else {
    Write-Host "$DistroName is already installed." -ForegroundColor Green
}

# 3. Inject and Run Setup Script
Write-Host "[+] Preparing Setup Script..." -ForegroundColor Yellow
$SetupScriptSource = "$PSScriptRoot\setup_inner.sh"
# Convert to WSL path format (e.g., /mnt/c/...)
$WslSetupPath = "/tmp/setup_inner.sh"

# Copy script to WSL instance
# We use cat and redirection because direct path mapping can be tricky with permissions
Get-Content $SetupScriptSource | wsl -d $DistroName -u root -- sh -c "cat > $WslSetupPath"
wsl -d $DistroName -u root -- chmod +x $WslSetupPath

Write-Host "[+] Running Setup inside WSL2 (This will take some time)..." -ForegroundColor Yellow
wsl -d $DistroName -u root -- $WslSetupPath

# 4. Create Desktop Shortcut
Write-Host "[+] Creating Desktop Shortcut..." -ForegroundColor Yellow
$WscriptShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$Shortcut = $WscriptShell.CreateShortcut("$DesktopPath\BricksLLM.lnk")
$Shortcut.TargetPath = "wsl.exe"
$Shortcut.Arguments = "-d $DistroName --cd /home/$(wsl -d $DistroName -u root -- whoami)/BricksLLM -- exec ./start.sh"
$Shortcut.IconLocation = "shell32.dll,1" # Generic icon, can be improved
$Shortcut.Save()

Write-Host "==========================================" -ForegroundColor Green
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "You can now start BricksLLM using the shortcut on your Desktop." -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Pause
