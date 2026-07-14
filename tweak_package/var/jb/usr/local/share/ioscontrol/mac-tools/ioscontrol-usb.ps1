<# 
.SYNOPSIS
    IOSControl USB Daemon for Windows
.DESCRIPTION
    Auto-creates iproxy tunnels when iPhones are connected via USB.
    Supports multiple devices with slot-based port allocation.
    
    Port allocation per slot:
      Slot 0: HTTP=9898, VNC_RFB=15900, VNC_WS=5902
      Slot 1: HTTP=9991, VNC_RFB=15910, VNC_WS=5912
      Slot 2: HTTP=9992, VNC_RFB=15920, VNC_WS=5922
    
.REQUIREMENTS
    - iTunes or Apple Mobile Device Support (USB drivers)
    - libimobiledevice for Windows (iproxy.exe, idevice_id.exe)
      Download: https://github.com/libimobiledevice-win32/imobiledevice-net/releases
    - Add libimobiledevice bin/ to PATH
    
.USAGE
    .\ioscontrol-usb.ps1
    
    Or run minimized:
    Start-Process powershell -WindowStyle Minimized -ArgumentList "-File .\ioscontrol-usb.ps1"
#>

$ErrorActionPreference = "SilentlyContinue"

# ── Config ──────────────────────────────────────────────────────
$POLL_INTERVAL = 3     # seconds
$DATA_DIR = "$env:USERPROFILE\.ioscontrol"
$PIDS_DIR = "$DATA_DIR\pids"
$SLOTS_DIR = "$DATA_DIR\slots"
$ACTIVE_DIR = "$DATA_DIR\active"
$NAMES_DIR = "$DATA_DIR\names"
$REGISTRY_FILE = "$DATA_DIR\usb-devices.json"
$LOG_FILE = "$DATA_DIR\usb.log"

# Create directories
foreach ($dir in @($DATA_DIR, $PIDS_DIR, $SLOTS_DIR, $ACTIVE_DIR, $NAMES_DIR)) {
    if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

# ── Helpers ─────────────────────────────────────────────────────

function Log($msg) {
    $ts = Get-Date -Format "HH:mm:ss"
    $line = "[$ts] $msg"
    Write-Host $line
    Add-Content -Path $LOG_FILE -Value $line -ErrorAction SilentlyContinue
}

function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Get-HttpPort($slot) {
    if ($slot -eq 0) { return 9898 } else { return 9890 + $slot }
}

function Get-VncRfbPort($slot) {
    return 15900 + ($slot * 10)
}

function Get-VncWsPort($slot) {
    if ($slot -eq 0) { return 5902 } else { return 5902 + ($slot * 10) }
}

function Get-Devices {
    $output = & idevice_id -l 2>$null
    if ($output) {
        return $output | Where-Object { $_ -match '\S' }
    }
    return @()
}

function Get-Slot($udid) {
    $slotFile = "$SLOTS_DIR\$udid"
    if (Test-Path $slotFile) {
        return [int](Get-Content $slotFile -Raw).Trim()
    }
    
    # Find free slot
    $usedSlots = @()
    Get-ChildItem $SLOTS_DIR -File -ErrorAction SilentlyContinue | ForEach-Object {
        $usedSlots += [int](Get-Content $_.FullName -Raw).Trim()
    }
    
    for ($i = 0; $i -lt 10; $i++) {
        if ($i -notin $usedSlots) {
            Set-Content -Path $slotFile -Value $i
            return $i
        }
    }
    return 0
}

function Release-Slot($udid) {
    Remove-Item "$SLOTS_DIR\$udid" -Force -ErrorAction SilentlyContinue
}

function Kill-PortProcess($port) {
    $pids = netstat -ano 2>$null | Select-String ":$port\s" | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Where-Object { $_ -match '^\d+$' } | Select-Object -Unique
    
    foreach ($p in $pids) {
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
}

function Start-Device($udid) {
    $slot = Get-Slot $udid
    $httpPort = Get-HttpPort $slot
    $vncWs = Get-VncWsPort $slot
    $vncRfb = Get-VncRfbPort $slot
    
    # Get device name
    $devName = & ideviceinfo -u $udid -k DeviceName 2>$null
    if (!$devName) { $devName = "iPhone" }
    Set-Content -Path "$NAMES_DIR\$udid" -Value $devName
    
    $shortUdid = $udid.Substring(0, [Math]::Min(8, $udid.Length))
    Log "🔌 Connect: $devName (${shortUdid}...) slot=$slot"
    
    # Kill stale processes on these ports
    foreach ($port in @($httpPort, $vncWs, $vncRfb)) {
        Kill-PortProcess $port
    }
    Start-Sleep -Milliseconds 500
    
    # Start iproxy tunnels (background processes)
    $httpProc = Start-Process -FilePath "iproxy" -ArgumentList "${httpPort}:9898 -u $udid" `
        -WindowStyle Hidden -PassThru -ErrorAction SilentlyContinue
    if ($httpProc) { Set-Content -Path "$PIDS_DIR\${udid}_http" -Value $httpProc.Id }
    
    $wsProc = Start-Process -FilePath "iproxy" -ArgumentList "${vncWs}:5902 -u $udid" `
        -WindowStyle Hidden -PassThru -ErrorAction SilentlyContinue
    if ($wsProc) { Set-Content -Path "$PIDS_DIR\${udid}_ws" -Value $wsProc.Id }
    
    $vncProc = Start-Process -FilePath "iproxy" -ArgumentList "${vncRfb}:5900 -u $udid" `
        -WindowStyle Hidden -PassThru -ErrorAction SilentlyContinue
    if ($vncProc) { Set-Content -Path "$PIDS_DIR\${udid}_vnc" -Value $vncProc.Id }
    
    Update-Registry
    
    # Register USB port with iPhone (background job)
    Start-Job -ScriptBlock {
        param($port)
        Start-Sleep -Seconds 3
        try { Invoke-WebRequest -Uri "http://localhost:$port/api/usb/register?ide_url=http://localhost:$port" -TimeoutSec 5 -UseBasicParsing } catch {}
    } -ArgumentList $httpPort | Out-Null
    
    Log "✅ $devName → IDE: http://localhost:$httpPort | VNC: localhost:$vncRfb"
}

function Stop-Device($udid) {
    foreach ($suffix in @("http", "vnc", "ws")) {
        $pidFile = "$PIDS_DIR\${udid}_$suffix"
        if (Test-Path $pidFile) {
            $pid = [int](Get-Content $pidFile -Raw).Trim()
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            Remove-Item $pidFile -Force
        }
    }
    Release-Slot $udid
    Update-Registry
    $shortUdid = $udid.Substring(0, [Math]::Min(8, $udid.Length))
    Log "🔌 Disconnect: ${shortUdid}..."
}

function Update-Registry {
    $devices = @()
    
    Get-ChildItem "$PIDS_DIR\*_http" -File -ErrorAction SilentlyContinue | ForEach-Object {
        $udid = $_.Name -replace '_http$', ''
        $pid = [int](Get-Content $_.FullName -Raw).Trim()
        
        # Check if process is still running
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if (!$proc) { return }
        
        $slotFile = "$SLOTS_DIR\$udid"
        if (!(Test-Path $slotFile)) { return }
        $slot = [int](Get-Content $slotFile -Raw).Trim()
        
        $hp = Get-HttpPort $slot
        $vr = Get-VncRfbPort $slot
        $vw = Get-VncWsPort $slot
        $name = if (Test-Path "$NAMES_DIR\$udid") { (Get-Content "$NAMES_DIR\$udid" -Raw).Trim() } else { "iPhone" }
        
        $devices += @{
            udid = $udid
            name = $name
            slot = $slot
            http_port = $hp
            vnc_rfb_port = $vr
            vnc_ws_port = $vw
            ide_url = "http://localhost:$hp"
            vnc_ws_url = "ws://localhost:$vw"
        }
    }
    
    $json = @{ devices = $devices } | ConvertTo-Json -Depth 3
    Set-Content -Path $REGISTRY_FILE -Value $json -ErrorAction SilentlyContinue
}

function Cleanup {
    Log "🛑 USB daemon stopping..."
    Get-ChildItem $PIDS_DIR -File -ErrorAction SilentlyContinue | ForEach-Object {
        $pid = [int](Get-Content $_.FullName -Raw).Trim()
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Remove-Item $_.FullName -Force
    }
    Remove-Item "$ACTIVE_DIR\*" -Force -ErrorAction SilentlyContinue
    '{"devices":[]}' | Set-Content $REGISTRY_FILE
    Log "🛑 USB daemon stopped."
}

# ── Dependency check ────────────────────────────────────────────

if (!(Test-Command "iproxy")) {
    Write-Host "❌ iproxy.exe not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install libimobiledevice for Windows:" -ForegroundColor Yellow
    Write-Host "  1. Download from: https://github.com/libimobiledevice-win32/imobiledevice-net/releases"
    Write-Host "  2. Extract and add to PATH"
    Write-Host "  3. Or install via: choco install imobiledevice-net" -ForegroundColor Cyan
    exit 1
}

if (!(Test-Command "idevice_id")) {
    Write-Host "❌ idevice_id.exe not found!" -ForegroundColor Red
    Write-Host "  Install libimobiledevice (same package as iproxy)"
    exit 1
}

# ── Trap Ctrl+C ─────────────────────────────────────────────────
Register-EngineEvent PowerShell.Exiting -Action { Cleanup } | Out-Null

# ── Main loop ───────────────────────────────────────────────────

Log "🚀 IOSControl USB daemon started (Windows, poll: ${POLL_INTERVAL}s)"
Log "   Registry: $REGISTRY_FILE"
Log "   Logs:     $LOG_FILE"
'{"devices":[]}' | Set-Content $REGISTRY_FILE
Remove-Item "$ACTIVE_DIR\*" -Force -ErrorAction SilentlyContinue

try {
    while ($true) {
        $devs = Get-Devices
        
        # Detect new connections
        foreach ($udid in $devs) {
            if (!$udid -or !(Test-Path variable:udid)) { continue }
            $activeFile = "$ACTIVE_DIR\$udid"
            if (!(Test-Path $activeFile)) {
                New-Item -Path $activeFile -ItemType File -Force | Out-Null
                Start-Device $udid
            }
        }
        
        # Detect disconnections
        Get-ChildItem $ACTIVE_DIR -File -ErrorAction SilentlyContinue | ForEach-Object {
            $activeUdid = $_.Name
            if ($activeUdid -notin $devs) {
                Remove-Item $_.FullName -Force
                Stop-Device $activeUdid
            }
        }
        
        # Re-register USB port every poll cycle (keeps USB IDE visible after respring)
        Get-ChildItem $SLOTS_DIR -File -ErrorAction SilentlyContinue | ForEach-Object {
            $s = [int](Get-Content $_.FullName -Raw).Trim()
            $hp = Get-HttpPort $s
            Start-Job -ScriptBlock {
                param($port)
                try { Invoke-WebRequest -Uri "http://localhost:$port/api/usb/register?ide_url=http://localhost:$port" -TimeoutSec 2 -UseBasicParsing } catch {}
            } -ArgumentList $hp | Out-Null
        }
        
        # Clean up completed background jobs
        Get-Job -State Completed | Remove-Job -Force
        
        Start-Sleep -Seconds $POLL_INTERVAL
    }
}
finally {
    Cleanup
}
