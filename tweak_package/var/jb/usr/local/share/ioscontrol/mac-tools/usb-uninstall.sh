#!/usr/bin/env bash
# usb-uninstall.sh — Gỡ IOSControl USB daemon

set -e

LABEL="com.tuanhungdz.ioscontrol-usb"
PLIST_DEST="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "🛑 Uninstalling IOSControl USB daemon..."

# Stop + unload
launchctl unload "$PLIST_DEST" 2>/dev/null && echo "✅ LaunchAgent unloaded" || echo "ℹ️  LaunchAgent was not loaded"

# Remove plist
if [ -f "$PLIST_DEST" ]; then
    rm -f "$PLIST_DEST"
    echo "✅ LaunchAgent plist removed"
fi

# Kill any stale iproxy processes
pkill -f "iproxy.*9898" 2>/dev/null || true
pkill -f "iproxy.*9891" 2>/dev/null || true
pkill -f "iproxy.*5900" 2>/dev/null || true
pkill -f "iproxy.*5901" 2>/dev/null || true
pkill -f "iproxy.*5902" 2>/dev/null || true
pkill -f "iproxy.*5903" 2>/dev/null || true

# Clear registry
echo '{"devices":[],"updated_at":0}' > "$HOME/.ioscontrol/usb-devices.json" 2>/dev/null || true

echo "✅ IOSControl USB daemon uninstalled"
