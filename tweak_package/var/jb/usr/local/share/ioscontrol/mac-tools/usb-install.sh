#!/usr/bin/env bash
# usb-install.sh — Cài IOSControl USB daemon trên Mac
# Chạy: bash scripts/usb-install.sh  hoặc  make usb-install

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAEMON_SCRIPT="$SCRIPT_DIR/ioscontrol-usb.sh"
PLIST_TEMPLATE="$SCRIPT_DIR/com.tuanhungdz.ioscontrol-usb.plist"
LABEL="com.tuanhungdz.ioscontrol-usb"
PLIST_DEST="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "🔌 IOSControl USB Daemon — Installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Check prerequisites ─────────────────────────────────────────
if ! command -v brew &>/dev/null; then
    echo "❌ Homebrew not found. Install from https://brew.sh"
    exit 1
fi

if ! command -v iproxy &>/dev/null; then
    echo "📦 Installing libimobiledevice (iproxy, ideviceinfo)..."
    brew install libimobiledevice
    echo "✅ libimobiledevice installed"
else
    echo "✅ iproxy found: $(which iproxy)"
fi

# ── Prepare daemon script ───────────────────────────────────────
chmod +x "$DAEMON_SCRIPT"
echo "✅ Daemon script: $DAEMON_SCRIPT"

# ── Create registry directory ───────────────────────────────────
mkdir -p "$HOME/.ioscontrol"
echo '{"devices":[],"updated_at":0}' > "$HOME/.ioscontrol/usb-devices.json"

# ── Generate LaunchAgent plist ──────────────────────────────────
mkdir -p "$HOME/Library/LaunchAgents"
sed \
    -e "s|__SCRIPT_PATH__|$DAEMON_SCRIPT|g" \
    -e "s|__HOME__|$HOME|g" \
    "$PLIST_TEMPLATE" > "$PLIST_DEST"
echo "✅ LaunchAgent: $PLIST_DEST"

# ── Load LaunchAgent ────────────────────────────────────────────
# Unload first in case it was already installed
launchctl unload "$PLIST_DEST" 2>/dev/null || true
sleep 0.5
launchctl load "$PLIST_DEST"
echo "✅ LaunchAgent loaded and running"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ IOSControl USB daemon installed!"
echo ""
echo "📋 Registry : $HOME/.ioscontrol/usb-devices.json"
echo "📝 Logs     : $HOME/.ioscontrol/usb.log"
echo ""
echo "▶ Cắm iPhone vào Mac, chờ ~5s rồi:"
echo "  Web IDE slot 0: http://localhost:9898"
echo "  Web IDE slot 1: http://localhost:9891"
echo ""
echo "▶ Check status: make usb-status"
echo "▶ Uninstall   : make usb-uninstall"
