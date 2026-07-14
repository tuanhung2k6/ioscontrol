#!/bin/bash
# ioscontrol-usb.sh — IOSControl USB Daemon
# Tự động tạo iproxy tunnels khi iPhone cắm USB, hỗ trợ nhiều device.
#
# Port allocation per slot:
#   Slot 0: HTTP=9898, VNC_RFB=5900, VNC_WS=5902  (same as iPhone — zero Web IDE changes)
#   Slot 1: HTTP=9991, VNC_RFB=5910, VNC_WS=5912
#   Slot 2: HTTP=9992, VNC_RFB=5920, VNC_WS=5922
#
# Registry: ~/.ioscontrol/usb-devices.json
# Log:      ~/.ioscontrol/usb.log
#
# IMPORTANT: bash 3.2 compatible (macOS default /bin/bash)
# - NO declare -A, NO mapfile, NO local outside functions

# ── PATH fix: LaunchAgent has minimal PATH ──
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin:$PATH"

REGISTRY_DIR="$HOME/.ioscontrol"
REGISTRY_FILE="$REGISTRY_DIR/usb-devices.json"
PIDS_DIR="$REGISTRY_DIR/pids"
SLOTS_DIR="$REGISTRY_DIR/slots"
ACTIVE_DIR="$REGISTRY_DIR/active"
LOG_FILE="$REGISTRY_DIR/usb.log"
POLL_INTERVAL=3

mkdir -p "$REGISTRY_DIR" "$PIDS_DIR" "$SLOTS_DIR" "$ACTIVE_DIR" "$REGISTRY_DIR/names"

log() {
    echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

check_deps() {
    if ! command -v iproxy &>/dev/null; then
        log "❌ iproxy not found. Install: brew install libimobiledevice"
        exit 1
    fi
    if ! command -v idevice_id &>/dev/null; then
        log "❌ idevice_id not found. Install: brew install libimobiledevice"
        exit 1
    fi
}

get_devices() {
    idevice_id -l 2>/dev/null | grep -v "^$" || true
}

http_port_for_slot() {
    if [ "$1" -eq 0 ]; then echo 9898; else echo "$((9890 + $1))"; fi
}
vnc_rfb_port_for_slot() {
    # Slot 0: 15900, Slot 1: 15910, etc. (avoids macOS Screen Sharing on 5900)
    echo "$((15900 + $1 * 10))"
}
vnc_ws_port_for_slot() {
    # Slot 0: 5902 (same as iPhone noVNC port), Slot N: 5902 + N*10
    if [ "$1" -eq 0 ]; then echo 5902; else echo "$((5902 + $1 * 10))"; fi
}

assign_slot() {
    local udid="$1"
    local slot_file="$SLOTS_DIR/$udid"
    if [ -f "$slot_file" ]; then
        cat "$slot_file"
        return
    fi
    local i=0
    while [ "$i" -lt 10 ]; do
        local in_use=0
        for f in "$SLOTS_DIR"/*; do
            [ -f "$f" ] || continue
            if [ "$(cat "$f" 2>/dev/null)" = "$i" ]; then
                in_use=1
                break
            fi
        done
        if [ "$in_use" = "0" ]; then
            echo "$i" > "$slot_file"
            echo "$i"
            return
        fi
        i=$((i + 1))
    done
    echo "0"
}

release_slot() {
    rm -f "$SLOTS_DIR/$1"
}

start_device() {
    local udid="$1"
    local slot http_port vnc_ws vnc_rfb dev_name
    slot=$(assign_slot "$udid")
    http_port=$(http_port_for_slot "$slot")
    vnc_ws=$(vnc_ws_port_for_slot "$slot")
    vnc_rfb=$(vnc_rfb_port_for_slot "$slot")
    # Get device name (e.g. "iPhone 8 Plus")
    dev_name=$(ideviceinfo -u "$udid" -k DeviceName 2>/dev/null || echo "iPhone")
    echo "$dev_name" > "$REGISTRY_DIR/names/${udid}"

    log "🔌 Connect: $dev_name (${udid:0:8}...) slot=$slot"

    # Kill stale on these ports
    local port
    for port in "$http_port" "$vnc_ws" "$vnc_rfb"; do
        lsof -ti tcp:"$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
    done
    sleep 0.5

    # iproxy v2 syntax: iproxy LOCAL:REMOTE -u UDID
    iproxy "$http_port:9898" -u "$udid" &>/dev/null &
    echo $! > "$PIDS_DIR/${udid}_http"

    iproxy "$vnc_ws:5902" -u "$udid" &>/dev/null &
    echo $! > "$PIDS_DIR/${udid}_ws"

    iproxy "$vnc_rfb:5900" -u "$udid" &>/dev/null &
    echo $! > "$PIDS_DIR/${udid}_vnc"

    update_registry

    # Register USB port with iPhone's HTTP server (for native app display)
    # Wait for iproxy to be ready, then POST
    (sleep 3 && curl -s -m 5 "http://localhost:$http_port/api/usb/register?ide_url=http://localhost:$http_port" >/dev/null 2>&1) &

    log "✅ $dev_name → IDE: http://localhost:$http_port | VNC WS: localhost:$vnc_rfb"
}

stop_device() {
    local udid="$1"
    local suffix pid_file pid
    for suffix in http vnc ws; do
        pid_file="$PIDS_DIR/${udid}_${suffix}"
        if [ -f "$pid_file" ]; then
            pid=$(cat "$pid_file" 2>/dev/null) || true
            [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
            rm -f "$pid_file"
        fi
    done
    release_slot "$udid"
    update_registry
    log "🔌 Disconnect: ${udid:0:8}..."
}

update_registry() {
    local json='{"devices":['
    local first=1 pid_file udid pid slot_file slot hp vr vw name

    for pid_file in "$PIDS_DIR"/*_http; do
        [ -f "$pid_file" ] || continue
        udid=$(basename "$pid_file" | sed 's/_http$//')
        pid=$(cat "$pid_file" 2>/dev/null) || continue
        kill -0 "$pid" 2>/dev/null || continue
        slot_file="$SLOTS_DIR/$udid"
        [ -f "$slot_file" ] || continue
        slot=$(cat "$slot_file")
        hp=$(http_port_for_slot "$slot")
        vr=$(vnc_rfb_port_for_slot "$slot")
        vw=$(vnc_ws_port_for_slot "$slot")
        name=$(cat "$REGISTRY_DIR/names/$udid" 2>/dev/null || echo "iPhone")
        [ "$first" = "0" ] && json+=","
        json+="{\"udid\":\"$udid\",\"name\":\"$name\",\"slot\":$slot,\"http_port\":$hp,\"vnc_rfb_port\":$vr,\"vnc_ws_port\":$vw,\"ide_url\":\"http://localhost:$hp\",\"vnc_ws_url\":\"ws://localhost:$vw\"}"
        first=0
    done
    json+="]}"
    echo "$json" > "$REGISTRY_FILE"
}

cleanup() {
    log "🛑 USB daemon stopping..."
    for pid_file in "$PIDS_DIR"/*; do
        [ -f "$pid_file" ] || continue
        pid=$(cat "$pid_file" 2>/dev/null) || true
        [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
        rm -f "$pid_file"
    done
    rm -f "$ACTIVE_DIR"/*
    echo '{"devices":[]}' > "$REGISTRY_FILE"
    log "🛑 USB daemon stopped."
}
trap cleanup EXIT INT TERM

# ── Main ───────────────────────────────────────────────────────────
check_deps
log "🚀 IOSControl USB daemon started (poll interval: ${POLL_INTERVAL}s)"
log "   Registry: $REGISTRY_FILE"
log "   Logs:     $LOG_FILE"
echo '{"devices":[]}' > "$REGISTRY_FILE"
rm -f "$ACTIVE_DIR"/*

while true; do
    # Get current devices (bash 3.2 compatible — no mapfile)
    devs=$(get_devices)

    # Detect new connections (NO pipe — avoid subshell killing background processes)
    if [ -n "$devs" ]; then
        while IFS= read -r udid; do
            [ -z "$udid" ] && continue
            if [ ! -f "$ACTIVE_DIR/$udid" ]; then
                touch "$ACTIVE_DIR/$udid"
                start_device "$udid"
            fi
        done <<< "$devs"
    fi

    # Detect disconnections
    for active_file in "$ACTIVE_DIR"/*; do
        [ -f "$active_file" ] || continue
        active_udid=$(basename "$active_file")
        if ! echo "$devs" | grep -q "^${active_udid}$"; then
            rm -f "$active_file"
            stop_device "$active_udid"
        fi
    done

    # Re-register USB port with active devices every poll cycle
    # Lightweight curl ensures USB IDE shows within 5s after respring
    for slot_file in "$SLOTS_DIR"/*; do
        [ -f "$slot_file" ] || continue
        s=$(basename "$slot_file")
        hp=$(http_port_for_slot "$s")
        curl -s -m 2 "http://localhost:$hp/api/usb/register?ide_url=http://localhost:$hp" >/dev/null 2>&1 &
    done

    sleep "$POLL_INTERVAL"
done
