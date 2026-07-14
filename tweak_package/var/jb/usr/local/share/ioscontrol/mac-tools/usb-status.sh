#!/bin/bash
# usb-status.sh — Hiển thị danh sách iPhone đang kết nối USB
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$PATH"

REGISTRY="$HOME/.ioscontrol/usb-devices.json"
LOG="$HOME/.ioscontrol/usb.log"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║            🔌 IOSControl USB — Device Status              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check daemon
if launchctl list 2>/dev/null | grep -q "ioscontrol-usb"; then
    echo "  Daemon: ✅ Running"
else
    echo "  Daemon: ❌ Not running (run: make usb-install)"
    exit 0
fi

# Parse registry
if [ ! -f "$REGISTRY" ]; then
    echo "  Devices: No registry file"
    exit 0
fi

# Count devices
count=$(python3 -c "import json; d=json.load(open('$REGISTRY')); print(len(d.get('devices',[])))" 2>/dev/null || echo "0")

if [ "$count" = "0" ]; then
    echo "  Devices: No iPhones connected via USB"
    echo ""
    echo "  💡 Cắm iPhone vào Mac qua USB, đợi ~5s"
    exit 0
fi

echo "  Devices: $count connected"
echo ""
echo "  ┌──────┬──────────────────┬───────────────────────────────────┐"
echo "  │ Slot │ Device           │ URLs                              │"
echo "  ├──────┼──────────────────┼───────────────────────────────────┤"

python3 -c "
import json
d = json.load(open('$REGISTRY'))
for dev in d.get('devices', []):
    name = dev.get('name', 'iPhone')[:16]
    slot = dev.get('slot', '?')
    ide = dev.get('ide_url', '?')
    vnc_ws = dev.get('vnc_ws_url', '?')
    udid_short = dev.get('udid', '?')[:8]
    print(f'  │  {slot}   │ {name:<16} │ IDE: {ide:<29}│')
    print(f'  │      │ {udid_short}...        │ VNC: {vnc_ws:<29}│')
    print(f'  ├──────┼──────────────────┼───────────────────────────────────┤')
" 2>/dev/null

echo "  └──────┴──────────────────┴───────────────────────────────────┘"
echo ""
echo "  📋 Registry: $REGISTRY"
echo "  📝 Logs:     $LOG"
echo ""
