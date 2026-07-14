# IOSControl Lua API Reference
> Dùng file này làm context cho AI (ChatGPT, Claude, Gemini...) để viết script Lua cho IOSControl.
> Version: 1.7.1 | Lua 5.4
> Hỗ trợ: iOS 15+ jailbreak bằng **Dopamine** (rootless). Chạy tốt nhất trên iPhone 6s, 7, 8 (bản thường và Plus).

## Coordinate System
Tọa độ dùng **POINT** (logical), KHÔNG phải pixel.
```
iPhone 14 Pro Max: 430×932 | iPhone X~13: 390×844 | iPhone 6s~8: 375×667
```
Dùng `getScreenResolution()` để lấy kích thước chính xác.

---

## Touch

```lua
tap(x, y)                                -- Tap tại tọa độ
longPress(x, y [, duration])             -- Nhấn giữ. duration mặc định 1.0s
swipe(x1, y1, x2, y2 [, duration])       -- Vuốt. duration mặc định 0.3s
pinch(x, y, scale [, duration])          -- Zoom. scale>1 phóng to, <1 thu nhỏ
rotate(x, y, angle [, duration])         -- Xoay (radian)

-- Multi-touch raw:
touchDown(finger, x, y)
touchMove(finger, x, y)
touchUp(finger, x, y)
```

## Physical Keys

```lua
pressKey(keyType)     -- Nhấn và thả
keyDown(keyType)      -- Giữ
keyUp(keyType)        -- Thả

-- Hằng số: KEY_HOME, KEY_POWER, KEY_VOLUME_UP, KEY_VOLUME_DOWN, KEY_MUTE
-- Hoặc string: "home", "power", "volume_up", "volume_down", "mute", "return"
home()                -- Shortcut pressKey(KEY_HOME)
```

## Color

```lua
getColor(x, y)                     -- → int (0xRRGGBB)
getColors({{x1,y1}, {x2,y2}})      -- → {int, int, ...}
intToRgb(colorInt)                  -- → r, g, b (0-255)
rgbToInt(r, g, b)                   -- → int

keepScreen()       -- Lock 1 frame cho batch đọc color/findColor
releaseScreen()    -- Giải phóng frame

findColor(color, count, region, tolerance)
-- color: int | count: số kết quả max | region: {x,y,w,h} hoặc nil | tolerance: 0-255
-- → x, y hoặc nil

findColors(mainColor, offsets, similarity, region)
-- offsets: {{dx,dy,color}, ...} | similarity: 0.0-1.0
-- → {{x,y}, ...}
```

## Image

> ⚠️ **Về ảnh template**: AI không thể tạo ảnh crop từ màn hình. Khi script cần `findImage("button.png")`, bạn phải **tự crop ảnh** từ screenshot rồi upload vào tab **Images** trong Web IDE. AI chỉ giúp viết logic code, phần ảnh do người dùng cung cấp.

```lua
findImage(imageName [, count, threshold, region])
-- imageName: tên file đã upload trong Images (vd: "button.png")
-- threshold: 0.0-1.0, mặc định 0.8 | region: {x,y,w,h} hoặc nil
-- → {{x, y, score}, ...} hoặc {} (x,y là tâm ảnh)

screenshot(name [, quality])        -- Lưu vào Images. quality 0.0-1.0
deleteScreenshot(name)              -- Xóa file ảnh
```

## OCR

```lua
ocr({region={x,y,w,h}, lang="en-US"})
-- region: optional | lang: "en-US", "vi", "ja", "ko", "zh-Hans"...
-- → {{text, x, y, width, height, confidence}, ...}

ocrText(x, y, w, h)                -- → string (tất cả chữ trong vùng)

findText("keyword")
-- Case-insensitive. → x, y, text (3 giá trị) hoặc nil
```

## Combo Helpers

> ⚠️ **tapImage** cần ảnh template do người dùng crop. Khi viết script, dùng tên file placeholder và ghi chú rõ: *"Người dùng cần crop ảnh nút/element và đặt tên file này vào tab Images"*.

```lua
tapImage(imageName [, timeout, threshold, region])
-- Tìm ảnh + tap tâm. Tự retry đến hết timeout.
-- → true/false, x, y

tapText(text [, timeout, index, region])
-- OCR tìm chữ + tap. index: lần xuất hiện thứ mấy (mặc định 1)
-- → true/false, x, y

swipeUntilImage(imageName [, direction, maxSwipes, threshold, speed])
-- direction: "up"/"down"/"left"/"right" | maxSwipes mặc định 10
-- → true/false

swipeUntilText(text [, direction, maxSwipes, speed])
-- → true/false
```

## Wait

```lua
waitForColor(x, y, targetColor [, timeout])   -- → true/false. timeout mặc định 10s
waitForImage(imageName [, timeout])            -- → {x, y} hoặc false
waitForText(text [, timeout])                  -- → {x, y, text} hoặc false
```

## App

```lua
appRun("com.apple.Preferences")         -- Mở app
appKill("com.facebook.Facebook")        -- Đóng app
appState("com.apple.mobilesafari")      -- → "running"/"suspended"/"not_running"
appInfo("com.apple.Preferences")        -- → {name, bundleId, version, ...}
appClear("com.facebook.Facebook")       -- Xóa toàn bộ dữ liệu app (keychain + container + caches). Tự kill app trước.
frontMostAppId()                        -- → bundleID app foreground
openURL("https://google.com")
```

## Text Input

```lua
inputText("Hello")        -- Paste vào ô input đang focus
typeKeys("abc123")         -- Gõ từng phím HID (không dùng clipboard)
copyText("text")           -- Ghi clipboard (alias: setClipboard)
clipText()                 -- Đọc clipboard (alias: getClipboard)
clearPasteboard()          -- Xóa clipboard
```

## UI Feedback

```lua
toast("Thông báo")                -- Toast overlay
alert("Nội dung" [, timeout])     -- Alert popup
vibrate()
log("message")                    -- In ra console Web IDE

showOverlay({key1 = "val1", key2 = "val2"})   -- HUD góc màn hình
updateOverlay("key", "newValue")
hideOverlay()
```

## Dialog (User Input)

```lua
dialogInput("Title", "Message", "default")     -- → string hoặc nil
dialogChoice("Title", {"A", "B", "C"})          -- → string hoặc nil
```

## HTTP

```lua
httpGet(url [, headers, timeout])              -- → body, status
httpPost(url, body [, headers, timeout])       -- → body, status
-- headers: {["Content-Type"] = "application/json"}
-- timeout: giây, mặc định 15. Truyền nil cho headers nếu chỉ cần timeout:
--   httpGet(url, nil, 30)          -- 30s timeout, không headers
--   httpPost(url, body, nil, 60)   -- 60s timeout
-- Tự dùng proxy nếu đã setProxy()
```

## Proxy

```lua
setProxy(host, port [, type, user, pass])         -- type: "http"/"socks"
clearProxy()
getProxy()                                         -- → {host,port,type} hoặc nil
setProxySystem(host, port [, type, user, pass])    -- Device-wide proxy
clearProxySystem()
```

## JSON

```lua
jsonDecode(jsonString)    -- → table
jsonEncode(table)         -- → string
```

## File I/O

```lua
readFile("data.txt")              -- → string hoặc nil (relative = Scripts/)
writeFile("data.txt", "content")  -- → true/false
appendFile("log.txt", "line\n")   -- → true/false
```

## Random & Timing

```lua
sleep(1.5)                -- Giây
usleep(500000)            -- Microseconds
randomSleep(1.0, 3.0)     -- Random trong khoảng (giây)
randomInt(1, 100)          -- → int
randomFloat(0.5, 1.5)     -- → float
timestamp()                -- → unix ms
md5("text")                -- → hex string
```

## Device & Screen

```lua
getScreenResolution()             -- → width, height (POINT)
screenSize()                      -- → {width, height}
getOrientation()                  -- → 0=portrait, 1=upside, 2=left, 3=right
frontMostAppOrientation()
deviceInfo()                      -- → {model, name, udid, systemVersion, ...}
getLocalIP()                      -- → WiFi IP
getIP()                           -- → Public IP
wifiInfo()                        -- → {ip, ssid}
getVersion()                      -- → IOSControl version string
getSN()                           -- → Serial number
```

## System

```lua
execute("shell command")           -- → output string
keepAwake(true/false)
setCellularData(true/false)
setAirplaneMode(true/false)
saveToSystemAlbum("photo.png" [, "Album"])
stop()                             -- Dừng script ngay
```

## Recording

```lua
recordStart()                      -- Bắt đầu ghi touch
local events = recordStop()        -- → table events
recordPlay(events)                 -- Phát lại
recordSave("name", events)         -- Lưu JSON
local events = recordLoad("name")  -- Load
```

## Modules (require)

```lua
-- Scripts/config.lua
local M = {}
M.delay = 1.5
return M

-- Scripts/main.lua
local config = require("config")
sleep(config.delay)
```

---

## Script Mẫu

### Mở app, tìm chữ và tap
```lua
appRun("com.apple.Preferences")
sleep(2)
local ok = tapText("General", 5)
if ok then
    log("✅ Tapped General")
    sleep(1)
    tapText("About")
else
    log("❌ Không tìm thấy")
end
```

### Tìm ảnh và tap
> ⚠️ Người dùng cần tự crop ảnh "accept_btn.png" từ screenshot rồi upload vào tab Images.
```lua
local found = tapImage("accept_btn.png", 5, 0.85)
if found then
    log("✅ Đã tap")
else
    log("❌ Không tìm thấy ảnh")
end
```

### Scroll tìm element
> ⚠️ Người dùng cần cung cấp ảnh "target.png" — crop element cần tìm từ screenshot.
```lua
local ok = swipeUntilImage("target.png", "up", 15, 0.85)
if ok then
    tapImage("target.png", 3)
end
```

### HTTP + JSON
```lua
local body = httpGet("https://api.example.com/data")
local data = jsonDecode(body)
log("Result: " .. tostring(data.message))
```

### Loop với overlay tracking
```lua
local count = dialogInput("Số lần", "Nhập:", "10")
if not count then stop() end
count = tonumber(count)

showOverlay({task = "Running", done = "0", total = tostring(count)})
for i = 1, count do
    updateOverlay("done", tostring(i))
    tap(200, 400)
    randomSleep(1, 2)
end
hideOverlay()
toast("Done!")
```

---

## Debug — AI đọc console log trực tiếp

Khi debug script, **KHÔNG cần** yêu cầu user copy paste log. Chỉ cần hỏi **IP thiết bị** rồi gọi API:

```
GET http://<IP>:9999/api/console/output
```
→ Trả về toàn bộ console log của lần chạy script gần nhất (plain text).

```
GET http://<IP>:9999/api/scripts/status
```
→ Trả về JSON: `{running: true/false, taskId, fileName, elapsed}` — biết script đang chạy hay đã dừng.

**Quy trình debug:**
1. Hỏi user: "Cho tôi IP thiết bị (ví dụ 192.168.1.20)"
2. Fetch `http://<IP>:9999/api/console/output` để đọc log
3. Fetch `http://<IP>:9999/api/scripts/status` để xem trạng thái
4. Phân tích lỗi và sửa script

---

## Lưu ý
1. **Tọa độ dùng POINT** — không nhân scale
2. **findText** trả 3 giá trị (x, y, text) hoặc nil
3. **tapImage/tapText** trả 3 giá trị (bool, x, y)
4. **sleep()** nhận giây, **usleep()** nhận microseconds
5. **Ảnh template** (findImage, tapImage, waitForImage, swipeUntilImage): AI không thể tạo — **người dùng phải tự crop** từ screenshot và upload vào tab Images
6. **Scripts path**: `/var/mobile/Library/IOSControl/Scripts/`
7. **print() = log()**: đều xuất ra console
