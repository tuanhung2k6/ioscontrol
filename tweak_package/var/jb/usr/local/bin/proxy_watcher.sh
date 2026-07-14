#!/var/jb/bin/sh
# proxy_watcher.sh — Runs as root via LaunchDaemon
export PATH="/var/jb/usr/bin:/var/jb/bin:/usr/bin:/bin:/usr/sbin:/sbin"

PREFS="/var/preferences/SystemConfiguration/preferences.plist"

while true; do
    # Check for SET trigger
    if [ -f /tmp/.proxy_set_trigger ]; then
        sleep 0.1
        SRC=$(cat /tmp/.proxy_set_trigger | tr -d '\n\r ')
        if [ -f "$SRC" ]; then
            killall -STOP configd 2>/dev/null
            sleep 0.1
            cp "$SRC" "$PREFS"
            chmod 644 "$PREFS"
            chown root:wheel "$PREFS"
            killall -9 configd 2>/dev/null
            echo "OK" > /tmp/.proxy_result
        else
            echo "FAIL: source not found [$SRC]" > /tmp/.proxy_result
        fi
        rm -f /tmp/.proxy_set_trigger
    fi
    
    # Check for CLEAR trigger
    if [ -f /tmp/.proxy_clear_trigger ]; then
        sleep 0.1
        SRC=$(cat /tmp/.proxy_clear_trigger | tr -d '\n\r ')
        if [ -f "$SRC" ]; then
            killall -STOP configd 2>/dev/null
            sleep 0.1
            cp "$SRC" "$PREFS"
            chmod 644 "$PREFS"
            chown root:wheel "$PREFS"
            killall -9 configd 2>/dev/null
            echo "OK" > /tmp/.proxy_result
        else
            echo "FAIL: source not found [$SRC]" > /tmp/.proxy_result
        fi
        rm -f /tmp/.proxy_clear_trigger
    fi
    
    sleep 0.5
done
