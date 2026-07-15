/**
 * IOSControl - iPhone Automation IDE
 * Frontend Application Logic
 */

// ═══════════════════════════════════════════
// State
// ═══════════════════════════════════════════

const state = {
  currentDevice: null,
  devices: [],
  isStreaming: false,
  streamInterval: null,
  runningTaskId: null,
  logPollInterval: null,
  lastLogIndex: 0,
  screenScale: { x: 1, y: 1 },
  screenSize: { w: 390, h: 844 },
  wdaPoints: { w: 390, h: 844 }, // WDA point coordinates for tap mapping
  deviceScale: 3, // @3x for most modern iPhones
  editor: null, // Monaco editor instance
  // Helper tool state
  helperActive: false,
  helperMode: "single", // 'single', 'multi', 'region'
  pickedColors: [], // [{x, y, r, g, b, hex, int, intHex}]
  regionStart: null, // {x, y, clientX, clientY} for region selection
  currentFileName: null, // Track currently open file for overwrites
  recording: false, // Gesture recording mode
  recordedGestures: [], // [{type, time, x, y, ...}]
  // Multi-tab editor
  openTabs: [], // [{id, name, code, dirty}]
  activeTabId: null,
};

// Mock license API globally
(function() {
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = args[0];
    if (typeof url === 'string' && url.includes('/api/license')) {
      const mockData = {
        "licensed": true,
        "days_left": 9999,
        "expires_at": "Lifetime",
        "udid": "305d0d4b4fda9e886643bdfe73c07cf257f29d46",
        "plan": "premium",
        "key": "IOSC-A74A-12CE-FA7D",
        "max_runtime": 999999
      };
      return new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return originalFetch.apply(this, args);
  };
})();

const API = "";

// Screenshot: try daemon first, fall back to Mac proxy (pymobiledevice3)
const MAC_PROXY = `http://${window.location.hostname}:8889`;
let screenshotSource = null; // null = not tested, 'daemon' or 'proxy'

async function getScreenshotUrl(quality = 0.6) {
  const t = Date.now();
  // If we already know the source, use it
  if (screenshotSource === "daemon")
    return `${API}/screenshot?quality=${quality}&t=${t}`;
  if (screenshotSource === "proxy") return `${MAC_PROXY}/screenshot?t=${t}`;

  // Test daemon first
  try {
    const resp = await fetch(`${API}/screenshot?quality=0.3`, {
      signal: AbortSignal.timeout(2000),
    });
    if (resp.ok && resp.headers.get("content-type")?.includes("image")) {
      screenshotSource = "daemon";
      appendLog("📸 Screenshot: using iPhone daemon", "success");
      return `${API}/screenshot?quality=${quality}&t=${t}`;
    }
  } catch (e) {}

  // Test Mac proxy
  try {
    const resp = await fetch(`${MAC_PROXY}/ping`, {
      signal: AbortSignal.timeout(2000),
    });
    if (resp.ok) {
      screenshotSource = "proxy";
      appendLog("📸 Screenshot: using Mac proxy (:8889)", "success");
      return `${MAC_PROXY}/screenshot?t=${t}`;
    }
  } catch (e) {}

  appendLog("⚠️ No screenshot source available", "warning");
  return `${API}/screenshot?quality=${quality}&t=${t}`; // try anyway
}

// ═══════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
  const safeInit = (name, fn) => {
    try {
      fn();
    } catch (e) {
      console.warn(`⚠️ ${name} failed:`, e);
    }
  };
  safeInit("theme", initIDETheme);
  safeInit("lang", initIDELang);
  safeInit("tabs", initTabs);
  safeInit("monaco", initMonacoEditor);
  safeInit("screenPanel", initScreenPanel);
  safeInit("liveScreen", initLiveScreen);
  safeInit("zoomPopup", initZoomPopup);
  safeInit("console", initConsole);
  safeInit("modals", initModals);
  safeInit("shortcuts", initKeyboardShortcuts);
  safeInit("apiDocs", loadApiDocs);
  safeInit("converter", initConverter);
  safeInit("imageManager", initImageManager);
  refreshDevices();
  safeInit("setup", checkSystemSetup);
  checkRunningScript(); // Restore running state after reload
  if (typeof lucide !== "undefined") lucide.createIcons();

  // Auto-refresh devices every 5s
  setInterval(refreshDevices, 5000);
});

// ═══════════════════════════════════════════
// Clipboard Helper (works on HTTP)
// ═══════════════════════════════════════════
function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for HTTP
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

function showToast(message, duration = 1500) {
  const existing = document.getElementById("ideToast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "ideToast";
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 99999;
    background: var(--accent-gradient); color: #fff;
    padding: 10px 20px; border-radius: 8px;
    font-size: 13px; font-weight: 600; font-family: var(--font-sans);
    box-shadow: 0 4px 20px rgba(99,102,241,0.4);
    opacity: 0; transform: translateY(10px);
    transition: opacity 0.2s ease, transform 0.2s ease;
    pointer-events: none;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// ═══════════════════════════════════════════
// IDE Theme Toggle
// ═══════════════════════════════════════════
let ideTheme = localStorage.getItem("icontrol-theme") || "dark";

function initIDETheme() {
  applyIDETheme();
  document.getElementById("ideThemeToggle")?.addEventListener("click", () => {
    ideTheme = ideTheme === "dark" ? "light" : "dark";
    applyIDETheme();
  });
}

function applyIDETheme() {
  document.documentElement.setAttribute("data-theme", ideTheme);
  const icon = document.getElementById("ideThemeIcon");
  if (icon) {
    icon.innerHTML = `<i data-lucide="${ideTheme === "dark" ? "moon" : "sun"}" style="width:16px;height:16px;"></i>`;
    if (typeof lucide !== "undefined") lucide.createIcons();
  }
  localStorage.setItem("icontrol-theme", ideTheme);
  // Update Monaco theme if loaded
  if (window.monaco) {
    monaco.editor.setTheme(ideTheme === "dark" ? "icontrol-dark" : "vs");
  }
}

// ═══════════════════════════════════════════
// IDE i18n (EN/VI)
// ═══════════════════════════════════════════
let ideLang = localStorage.getItem("icontrol-lang") || "en";

const IDE_I18N = {
  en: {
    screen: "Screen",
    helper: "Helper",
    noDevice: "No device connected",
    scriptEditor: "Script Editor",
    apiDocs: "Function",
    files: "Files",
    images: "Images",
    flow: "Fast Design",
    converter: "Py→Lua",
    console: "Console",
    consoleLbl: "Console",
    run: "Run",
    stop: "Stop",
    save: "Save",
    clear: "Clear",
    quickCmd: "Quick command (e.g. tap 100 200)",
    screenPreview: "Screen Preview",
    connectDevice: "Connect a device to see screen",
    zoomTitle: "Zoom Screen",
    navDocs: "Docs",
    output: "Output",
    welcomeTitle: "Welcome to <strong>IOSControl IDE</strong>",
    welcomeConnect: "Connect an iPhone via USB to get started.",
    welcomeRun:
      "Write scripts in the editor and press <kbd>Run</kbd> or <kbd>Ctrl+Enter</kbd>.",
    saveScriptTitle: "Save Script",
    scriptName: "Script Name",
    saveBtn: "Save",
    imgGalleryTitle: "Image Gallery",
    imgGalleryDesc:
      "Manage images on iPhone · Crop & save · Copy path to script",
    imgOnDevice: "Images on device",
    imgNone: "No images yet",
    imgHint: "Press <b>Capture</b> or <b>Vol Up ×3</b> on iPhone",
    imgCrop: "Crop",
    imgCapture: "Capture",
    imgCropTitle: "Drag to select crop area",
    imgCancel: "Cancel",
    imgSaveToPhone: "Save to iPhone",
    // New keys
    helperPickColors: "Click on screen to pick colors",
    generate: "Generate",
    insert: "Insert",
    installedApps: "Installed Apps",
    searchApps: "Search apps...",
    loadingApps: "Loading apps...",
    clickConnect: "Click <b>Connect</b> to stream",
    vncLive: "VNC Live",
    helperTools: "Helper Tools",
    noScripts: "No saved scripts yet",
    flowBuilder: "Flow Builder",
    visual: "Visual",
    flowEmptyHint: "Click actions on the left to add steps",
    flowEmptyDesc: "No coding needed — select and fill",
    copy: "Copy",
    editor: "Editor",
    converterTitle: "Python → Lua Converter",
    smartConvert: "Smart Convert",
    pythonInput: "Python Input",
    paste: "Paste",
    luaOutput: "Lua Output",
    deviceInfo: "Device Information",
    noDeviceInfo: "No device connected",
    // Helper panel
    screenshot: "Screenshot",
    close: "Close",
    loadingScreenshot: "Loading screenshot...",
    hTabColor: "Color",
    hTabImage: "Image",
    hTabApps: "Apps",
    mode: "Mode",
    pick: "Pick",
    multi: "Multi",
    region: "Region",
    results: "Results",
    generateCode: "Generate Code",
    insertToEditor: "Insert to Editor",
    clearAll: "Clear All",
    cropRegion: "Crop Region",
    dragToCrop: "Drag on image to select area",
    fileName: "File name...",
    cropSave: "Crop & Save",
    gallery: "Gallery",
    searchImages: "Search images...",
    captureHint: "Take a screenshot then crop image",
    cropFromScreenshot: "Crop from Screenshot",
    searchApps2: "Search apps...",
    getForegroundApp: "Get Foreground App",
  },
  vi: {
    screen: "M.Hình",
    helper: "Trợ giúp",
    noDevice: "Chưa kết nối",
    scriptEditor: "Soạn Script",
    apiDocs: "Chức Năng",
    files: "Tệp",
    images: "Ảnh",
    flow: "Thiết kế nhanh",
    converter: "Py→Lua",
    console: "Bảng đk",
    consoleLbl: "Bảng đk",
    run: "Chạy",
    stop: "Dừng",
    save: "Lưu",
    clear: "Xoá",
    quickCmd: "Lệnh nhanh (ví dụ: tap 100 200)",
    screenPreview: "Xem màn hình",
    connectDevice: "Kết nối thiết bị để xem",
    zoomTitle: "Phóng to",
    navDocs: "Tài liệu",
    output: "Đầu ra",
    welcomeTitle: "Chào mừng đến <strong>IOSControl IDE</strong>",
    welcomeConnect: "Kết nối iPhone qua USB để bắt đầu.",
    welcomeRun:
      "Viết script trong trình soạn thảo và nhấn <kbd>Chạy</kbd> hoặc <kbd>Ctrl+Enter</kbd>.",
    saveScriptTitle: "Lưu Script",
    scriptName: "Tên Script",
    saveBtn: "Lưu",
    imgGalleryTitle: "Thư viện ảnh",
    imgGalleryDesc:
      "Quản lý ảnh trên iPhone · Cắt & lưu · Copy đường dẫn vào script",
    imgOnDevice: "Ảnh trên thiết bị",
    imgNone: "Chưa có ảnh",
    imgHint: "Bấm <b>Chụp</b> hoặc <b>Vol Up ×3</b> trên iPhone",
    imgCrop: "Cắt",
    imgCapture: "Chụp",
    imgCropTitle: "Kéo chọn vùng cần cắt",
    imgCancel: "Huỷ",
    imgSaveToPhone: "Lưu vào iPhone",
    // New keys
    helperPickColors: "Nhấn vào màn hình để chọn màu",
    generate: "Tạo code",
    insert: "Chèn",
    installedApps: "Ứng dụng đã cài",
    searchApps: "Tìm ứng dụng...",
    loadingApps: "Đang tải...",
    clickConnect: "Bấm <b>Kết nối</b> để xem",
    vncLive: "Trực tiếp",
    helperTools: "Công cụ hỗ trợ",
    noScripts: "Chưa có script nào",
    flowBuilder: "Trình tạo Flow",
    visual: "Trực quan",
    flowEmptyHint: "Chọn hành động bên trái để thêm bước",
    flowEmptyDesc: "Không cần code — chọn và điền",
    copy: "Sao chép",
    editor: "Editor",
    converterTitle: "Chuyển đổi Python → Lua",
    smartConvert: "Chuyển đổi thông minh",
    pythonInput: "Đầu vào Python",
    paste: "Dán",
    luaOutput: "Kết quả Lua",
    deviceInfo: "Thông tin thiết bị",
    noDeviceInfo: "Chưa kết nối thiết bị",
    // Helper panel
    screenshot: "Chụp màn hình",
    close: "Đóng",
    loadingScreenshot: "Đang tải ảnh...",
    hTabColor: "Màu",
    hTabImage: "Ảnh",
    hTabApps: "Ứng dụng",
    mode: "Chế độ",
    pick: "Chọn",
    multi: "Nhiều",
    region: "Vùng",
    results: "Kết quả",
    generateCode: "Tạo Code",
    insertToEditor: "Chèn vào Editor",
    clearAll: "Xoá tất cả",
    cropRegion: "Vùng cắt",
    dragToCrop: "Kéo chuột trên ảnh để chọn vùng",
    fileName: "Tên file...",
    cropSave: "Cắt & Lưu",
    gallery: "Thư viện",
    searchImages: "Tìm ảnh...",
    captureHint: "Chụp screenshot rồi crop ảnh",
    cropFromScreenshot: "Crop từ Screenshot",
    searchApps2: "Tìm ứng dụng...",
    getForegroundApp: "Lấy App đang chạy",
  },
};

function initIDELang() {
  applyIDELang();
  document.getElementById("ideLangToggle")?.addEventListener("click", () => {
    ideLang = ideLang === "en" ? "vi" : "en";
    applyIDELang();
  });
}

function applyIDELang() {
  const s = IDE_I18N[ideLang];
  const label = document.getElementById("ideLangLabel");
  if (label) label.textContent = ideLang.toUpperCase();
  localStorage.setItem("icontrol-lang", ideLang);

  // Update IDE labels
  document.querySelectorAll("[data-i18n-ide]").forEach((el) => {
    const key = el.getAttribute("data-i18n-ide");
    if (s[key]) {
      if (el.tagName === "INPUT") el.placeholder = s[key];
      else el.innerHTML = s[key];
    }
  });

  // Reload API docs with current language
  if (typeof loadApiDocs === "function") loadApiDocs();

  // Refresh flow builder palette with new language
  if (typeof refreshFlowPalette === "function") {
    refreshFlowPalette();
    if (typeof renderFlowCanvas === "function") renderFlowCanvas();
  }
}

// ═══════════════════════════════════════════
// Device Management (daemon runs ON the iPhone)
// ═══════════════════════════════════════════

async function refreshDevices() {
  try {
    const res = await fetch(`${API}/ping`);
    const data = await res.json();
    if (data.status === "ok") {
      // Store API token for authenticated requests
      if (data.token) {
        state.apiToken = data.token;
      }
      // Custom IDE title from Settings → Connection → IDE Title
      if (data.ide_title) {
        document.title = `${data.ide_title} — IOSControl`;
      } else {
        document.title = `IOSControl — ${data.ip || "iPhone"}`;
      }
      // Daemon is the device — always connected
      state.devices = [{ udid: "local", name: "iPhone", ip: data.ip }];
      const select = document.getElementById("deviceSelect");
      const indicator = document.getElementById("deviceIndicator");
      if (select) {
        select.innerHTML = `<option value="local">iPhone (${data.ip || "local"})</option>`;
      }
      // Auto-connect on first ping
      if (!state.currentDevice) {
        connectDevice("local");
      }
      if (indicator) indicator.classList.add("connected");
    }
  } catch (e) {
    const indicator = document.getElementById("deviceIndicator");
    if (indicator) indicator.classList.remove("connected");
    console.error("Daemon not reachable:", e);
  }
}

function updateDeviceUI() {
  // No-op: device UI is updated in refreshDevices
}

async function connectDevice(udid) {
  try {
    state.currentDevice = udid || "local";
    document.getElementById("deviceIndicator")?.classList.add("connected");
    appendLog("✅ Connected to iPhone", "success");

    // Fetch screen dimensions
    try {
      const screenRes = await fetch(`${API}/screen_info`);
      const screenData = await screenRes.json();
      if (screenData.width) {
        state.screenSize = { w: screenData.width, h: screenData.height };
        state.wdaPoints = { w: screenData.width, h: screenData.height };
        state.deviceScale = screenData.scale || 3;
        appendLog(
          `📐 Screen: ${screenData.width}x${screenData.height} (@${screenData.scale}x)`,
        );
      }
    } catch (e) {
      appendLog("⚠️ Could not detect screen size", "warning");
    }

    // Auto-take screenshot to show the screen immediately
    const statusEl = document.getElementById("screenStatus");
    const streamImg = document.getElementById("screenStream");
    const placeholder = document.getElementById("screenPlaceholder");
    if (streamImg && placeholder) {
      streamImg.src = `${API}/screenshot?quality=0.6&t=${Date.now()}`;
      streamImg.style.display = "block";
      streamImg.style.maxWidth = "100%";
      streamImg.style.maxHeight = "100%";
      placeholder.style.display = "none";
      if (statusEl) {
        statusEl.textContent = "🟢 Connected";
        statusEl.style.color = "var(--success-color)";
      }
    }
  } catch (e) {
    appendLog("❌ Connection failed: " + e.message, "error");
  }
}

document.getElementById("deviceSelect")?.addEventListener("change", (e) => {
  if (e.target.value) {
    connectDevice(e.target.value);
  }
});

document.getElementById("refreshDevicesBtn")?.addEventListener("click", () => {
  refreshDevices();
  appendLog("🔄 Refreshing devices...");
});

// ═══════════════════════════════════════════
// Screen Panel
// ═══════════════════════════════════════════

function initScreenPanel() {
  const wrapper = document.getElementById("screenWrapper");
  const img = document.getElementById("screenImage");
  const coordDisplay = document.getElementById("coordDisplay");
  const pixelColor = document.getElementById("pixelColor");

  // Sync wdaPoints from actual image dimensions when image loads
  img.addEventListener("load", () => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      state.wdaPoints = { w: img.naturalWidth, h: img.naturalHeight };
    }
  });

  // Helper: get actual image bounds within object-fit:contain container
  function getImageBounds(imgEl) {
    const rect = imgEl.getBoundingClientRect();
    const natW = imgEl.naturalWidth || 428;
    const natH = imgEl.naturalHeight || 926;
    const containerRatio = rect.width / rect.height;
    const imageRatio = natW / natH;

    let renderW, renderH, offsetX, offsetY;
    if (imageRatio > containerRatio) {
      // Image wider than container → padding top/bottom
      renderW = rect.width;
      renderH = rect.width / imageRatio;
      offsetX = 0;
      offsetY = (rect.height - renderH) / 2;
    } else {
      // Image taller → padding left/right
      renderH = rect.height;
      renderW = rect.height * imageRatio;
      offsetX = (rect.width - renderW) / 2;
      offsetY = 0;
    }
    return { renderW, renderH, offsetX, offsetY, natW, natH };
  }

  // Map click position to WDA point coordinates
  function mapToWDAPoints(e, imgEl) {
    const rect = imgEl.getBoundingClientRect();
    const bounds = getImageBounds(imgEl);

    // Position relative to actual rendered image (excluding contain padding)
    const relX = e.clientX - rect.left - bounds.offsetX;
    const relY = e.clientY - rect.top - bounds.offsetY;

    // Check if click is within actual image area
    if (
      relX < 0 ||
      relX > bounds.renderW ||
      relY < 0 ||
      relY > bounds.renderH
    ) {
      return null; // Click outside image
    }

    // Use image natural size as coordinate space (stream already resizes to WDA points)
    // This ensures perfect sync with actual device coordinates
    const targetW = imgEl.naturalWidth || state.wdaPoints.w;
    const targetH = imgEl.naturalHeight || state.wdaPoints.h;
    const wdaX = Math.round((relX / bounds.renderW) * targetW);
    const wdaY = Math.round((relY / bounds.renderH) * targetH);

    // Clamp to valid range
    return {
      x: Math.max(0, Math.min(wdaX, targetW)),
      y: Math.max(0, Math.min(wdaY, targetH)),
    };
  }

  wrapper.addEventListener("mousemove", (e) => {
    if (!img.classList.contains("visible")) return;
    const pt = mapToWDAPoints(e, img);
    if (pt) {
      // Display point coordinates (same as getColor/helper/tap input)
      const s = state.deviceScale || 3;
      coordDisplay.textContent = `x: ${Math.round(pt.x / s)}  y: ${Math.round(pt.y / s)}`;
    }
  });

  wrapper.addEventListener("click", async (e) => {
    if (!img.classList.contains("visible")) return;
    const pt = mapToWDAPoints(e, img);
    if (!pt) return; // Click outside image area

    // ═══ Helper Mode: Pick color instead of tap ═══
    if (state.helperActive) {
      e.preventDefault();
      e.stopPropagation();
      await helperPickColor(pt.x, pt.y, e);
      return;
    }
  });

  // ═══════════════════════════════════════════
  // Gesture System: Tap / Long Press / Swipe
  // ═══════════════════════════════════════════
  let gestureState = null; // { startX, startY, startTime, startPt, longPressTimer, ring, line }

  wrapper.addEventListener("mousedown", (e) => {
    if (!img.classList.contains("visible")) return;
    if (state.helperActive) return; // Let click handler handle helper
    if (e.button !== 0) return; // Left click only

    const pt = mapToWDAPoints(e, img);
    if (!pt) return;

    e.preventDefault();

    gestureState = {
      startX: e.clientX,
      startY: e.clientY,
      startPt: pt,
      startTime: Date.now(),
      moved: false,
      longPressTimer: null,
      ring: null,
      line: null,
    };

    // Start long press timer (400ms threshold)
    gestureState.longPressTimer = setTimeout(() => {
      if (!gestureState || gestureState.moved) return;
      // Show expanding ring animation
      const ring = document.createElement("div");
      ring.style.cssText = `position:fixed;left:${e.clientX - 20}px;top:${e.clientY - 20}px;width:40px;height:40px;border-radius:50%;border:3px solid rgba(255,165,0,0.8);background:rgba(255,165,0,0.15);pointer-events:none;z-index:9999;transition:all 0.6s ease-out;`;
      document.body.appendChild(ring);
      gestureState.ring = ring;
      setTimeout(() => {
        ring.style.width = "60px";
        ring.style.height = "60px";
        ring.style.left = `${e.clientX - 30}px`;
        ring.style.top = `${e.clientY - 30}px`;
      }, 10);
    }, 400);
  });

  wrapper.addEventListener("mousemove", (e) => {
    if (!gestureState) return;

    const dx = e.clientX - gestureState.startX;
    const dy = e.clientY - gestureState.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // If moved more than 8px, it's a swipe gesture
    if (dist > 8) {
      gestureState.moved = true;
      // Cancel long press
      if (gestureState.longPressTimer) {
        clearTimeout(gestureState.longPressTimer);
        gestureState.longPressTimer = null;
      }
      if (gestureState.ring) {
        gestureState.ring.remove();
        gestureState.ring = null;
      }

      // Draw swipe preview line
      if (!gestureState.line) {
        const line = document.createElement("div");
        line.style.cssText = `position:fixed;pointer-events:none;z-index:9999;height:3px;background:linear-gradient(90deg,rgba(0,200,255,0.8),rgba(0,200,255,0.3));transform-origin:0 50%;border-radius:2px;`;
        document.body.appendChild(line);
        gestureState.line = line;
      }
      // Update line position and rotation
      const angle = Math.atan2(dy, dx);
      gestureState.line.style.left = `${gestureState.startX}px`;
      gestureState.line.style.top = `${gestureState.startY}px`;
      gestureState.line.style.width = `${dist}px`;
      gestureState.line.style.transform = `rotate(${angle}rad)`;
    }
  });

  wrapper.addEventListener("mouseup", async (e) => {
    if (!gestureState) return;
    const gs = gestureState;
    gestureState = null;

    // Cleanup timers/visuals
    if (gs.longPressTimer) clearTimeout(gs.longPressTimer);
    if (gs.ring) {
      gs.ring.style.opacity = "0";
      setTimeout(() => gs.ring?.remove(), 300);
    }
    if (gs.line) {
      gs.line.style.opacity = "0";
      setTimeout(() => gs.line?.remove(), 300);
    }

    const elapsed = Date.now() - gs.startTime;
    const udid = state.currentDevice;
    if (!udid) return;

    const s = state.deviceScale;

    if (gs.moved) {
      // ─── SWIPE ───
      const endPt = mapToWDAPoints(e, img);
      if (!endPt) return;
      const dx = endPt.x - gs.startPt.x;
      const dy = endPt.y - gs.startPt.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Duration based on drag time, clamped to 0.1–2.0s
      const duration = Math.max(0.1, Math.min(2.0, elapsed / 1000));

      appendLog(
        `📱 Swipe (${gs.startPt.x * s},${gs.startPt.y * s}) → (${endPt.x * s},${endPt.y * s}) ${duration.toFixed(1)}s`,
      );
      try {
        await fetch(
          `${API}/swipe?x1=${gs.startPt.x}&y1=${gs.startPt.y}&x2=${endPt.x}&y2=${endPt.y}&duration=${duration}`,
          { method: "POST" },
        );
      } catch (err) {
        appendLog(`⚠️ Swipe failed: ${err.message}`, "error");
      }
      // Record gesture
      if (state.recording) {
        state.recordedGestures.push({
          type: "swipe",
          time: Date.now(),
          x1: gs.startPt.x * s,
          y1: gs.startPt.y * s,
          x2: endPt.x * s,
          y2: endPt.y * s,
          duration,
        });
      }
    } else if (elapsed >= 400) {
      // ─── LONG PRESS ───
      const holdDuration = Math.max(0.5, elapsed / 1000);
      appendLog(
        `📱 Long press at (${gs.startPt.x * s}, ${gs.startPt.y * s}) ${holdDuration.toFixed(1)}s`,
      );
      try {
        await fetch(
          `${API}/long_press?x=${gs.startPt.x}&y=${gs.startPt.y}&duration=${holdDuration}`,
          { method: "POST" },
        );
      } catch (err) {
        appendLog(`⚠️ Long press failed: ${err.message}`, "error");
      }
      if (state.recording) {
        state.recordedGestures.push({
          type: "long_press",
          time: Date.now(),
          x: gs.startPt.x * s,
          y: gs.startPt.y * s,
          duration: holdDuration,
        });
      }
    } else {
      // ─── TAP ───
      const dot = document.createElement("div");
      dot.style.cssText = `position:fixed;left:${e.clientX - 12}px;top:${e.clientY - 12}px;width:24px;height:24px;border-radius:50%;background:rgba(0,200,255,0.5);border:2px solid rgba(0,200,255,0.8);pointer-events:none;z-index:9999;transition:all 0.3s ease-out;`;
      document.body.appendChild(dot);
      setTimeout(() => {
        dot.style.transform = "scale(2)";
        dot.style.opacity = "0";
      }, 50);
      setTimeout(() => dot.remove(), 400);

      appendLog(`📍 Tap at (${gs.startPt.x * s}, ${gs.startPt.y * s})`);
      try {
        await fetch(`${API}/tap?x=${gs.startPt.x}&y=${gs.startPt.y}`, {
          method: "POST",
        });
      } catch (err) {
        appendLog(`⚠️ Tap failed: ${err.message}`, "error");
      }
      if (state.recording) {
        state.recordedGestures.push({
          type: "tap",
          time: Date.now(),
          x: gs.startPt.x * s,
          y: gs.startPt.y * s,
        });
      }
    }

    if (!state.isStreaming) setTimeout(takeScreenshot, 300);
  });

  // Cancel gesture if mouse leaves wrapper
  wrapper.addEventListener("mouseleave", () => {
    if (gestureState) {
      if (gestureState.longPressTimer)
        clearTimeout(gestureState.longPressTimer);
      if (gestureState.ring) gestureState.ring.remove();
      if (gestureState.line) gestureState.line.remove();
      gestureState = null;
    }
  });

  document
    .getElementById("streamToggle")
    ?.addEventListener("click", toggleStream);

  // USB/WiFi mode toggle
  document.getElementById("wdaModeBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("wdaModeBtn");
    const currentMode = btn.textContent.includes("USB") ? "wifi" : "usb";
    try {
      const res = await fetch(`${API}/api/wda/mode?mode=${currentMode}`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        btn.textContent = `🔌 ${data.mode.toUpperCase()}`;
        appendLog(
          `🔌 Switched to ${data.mode.toUpperCase()} mode (${data.url})`,
        );
        // Restart stream if active
        if (state.isStreaming) {
          toggleStream(); // stop
          setTimeout(toggleStream, 500); // restart
        }
      }
    } catch (err) {
      appendLog(`⚠️ Mode switch failed: ${err.message}`, "error");
    }
  });
}

async function takeScreenshot() {
  try {
    const img = document.getElementById("screenImage");
    const url = await getScreenshotUrl(0.6);
    img.src = url;
    img.style.display = "";
    img.classList.add("visible");
    document.getElementById("screenPlaceholder").style.display = "none";
  } catch (e) {
    console.error("Screenshot failed:", e);
  }
}

function toggleStream() {
  const icon = document.getElementById("streamIcon");
  const img = document.getElementById("screenImage");
  const udid = state.currentDevice;

  if (state.isStreaming) {
    // Stop streaming
    clearInterval(state.streamInterval);
    state.isStreaming = false;
    if (icon) icon.textContent = "▶";
    // If using MJPEG, switch back to static screenshot
    takeScreenshot();
    appendLog("⏹️ Screen stream stopped");
  } else {
    state.isStreaming = true;
    if (icon) icon.textContent = "⏸";

    // Use MJPEG stream if Mac proxy is available (much smoother)
    if (screenshotSource === "proxy") {
      img.src = `${MAC_PROXY}/mjpeg?t=${Date.now()}`;
      img.style.display = "";
      img.classList.add("visible");
      document.getElementById("screenPlaceholder").style.display = "none";
      appendLog("▶️ MJPEG stream started (~4 FPS)");
    } else {
      // Polling fallback
      const refreshScreen = async () => {
        if (!state.isStreaming) return;
        try {
          const url = await getScreenshotUrl(0.45);
          img.src = url;
          img.style.display = "";
          img.classList.add("visible");
          document.getElementById("screenPlaceholder").style.display = "none";
        } catch (e) {}
      };
      refreshScreen();
      state.streamInterval = setInterval(refreshScreen, 300);
      appendLog("▶️ Live stream started (polling)");
    }
  }
}

async function sendPress(button) {
  const udid = state.currentDevice;
  if (!udid) return;
  // TODO: add press_button to daemon
  appendLog(`⌨️ press_button not yet supported on daemon`, "warning");
}

function quickSwipe(direction) {
  const udid = state.currentDevice;
  if (!udid) return;

  const w = state.wdaPoints.w;
  const h = state.wdaPoints.h;
  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);

  let x1, y1, x2, y2, duration;
  switch (direction) {
    case "up":
      // Scroll up: start from lower-middle, swipe to upper-middle
      x1 = cx;
      y1 = Math.round(h * 0.7);
      x2 = cx;
      y2 = Math.round(h * 0.3);
      duration = 0.4;
      break;
    case "down":
      // Scroll down: start from upper-middle, swipe to lower-middle
      x1 = cx;
      y1 = Math.round(h * 0.3);
      x2 = cx;
      y2 = Math.round(h * 0.7);
      duration = 0.4;
      break;
    case "left":
      // Swipe left: start from right side, swipe to left
      x1 = Math.round(w * 0.8);
      y1 = cy;
      x2 = Math.round(w * 0.2);
      y2 = cy;
      duration = 0.3;
      break;
    case "right":
      // Swipe right: start from left side, swipe to right
      x1 = Math.round(w * 0.2);
      y1 = cy;
      x2 = Math.round(w * 0.8);
      y2 = cy;
      duration = 0.3;
      break;
  }

  fetch(
    `${API}/swipe?x1=${x1}&y1=${y1}&x2=${x2}&y2=${y2}&duration=${duration}`,
    { method: "POST" },
  );
  appendLog(`📱 Swipe ${direction} (${duration}s)`);
}

// ═══════════════════════════════════════════
// Screen Zoom Popup
// ═══════════════════════════════════════════
let zoomSyncInterval = null;

function initZoomPopup() {
  document.getElementById("zoomBtn")?.addEventListener("click", openZoomPopup);
  document
    .getElementById("zoomCloseBtn")
    ?.addEventListener("click", closeZoomPopup);
  document.getElementById("zoomModal")?.addEventListener("click", (e) => {
    if (e.target.id === "zoomModal") closeZoomPopup();
  });
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      document.getElementById("zoomModal")?.classList.contains("visible")
    ) {
      closeZoomPopup();
    }
  });

  // Helper for zoom image bounds (same logic as main screen panel)
  function getZoomImageBounds(imgEl) {
    const rect = imgEl.getBoundingClientRect();
    const natW = imgEl.naturalWidth || 428;
    const natH = imgEl.naturalHeight || 926;
    const containerRatio = rect.width / rect.height;
    const imageRatio = natW / natH;
    let renderW, renderH, offsetX, offsetY;
    if (imageRatio > containerRatio) {
      renderW = rect.width;
      renderH = rect.width / imageRatio;
      offsetX = 0;
      offsetY = (rect.height - renderH) / 2;
    } else {
      renderH = rect.height;
      renderW = rect.height * imageRatio;
      offsetX = (rect.width - renderW) / 2;
      offsetY = 0;
    }
    return { renderW, renderH, offsetX, offsetY };
  }

  function zoomMapToWDA(e, imgEl) {
    const rect = imgEl.getBoundingClientRect();
    const bounds = getZoomImageBounds(imgEl);
    const relX = e.clientX - rect.left - bounds.offsetX;
    const relY = e.clientY - rect.top - bounds.offsetY;
    if (relX < 0 || relX > bounds.renderW || relY < 0 || relY > bounds.renderH)
      return null;
    const targetW = imgEl.naturalWidth || state.wdaPoints.w;
    const targetH = imgEl.naturalHeight || state.wdaPoints.h;
    const wdaX = Math.round((relX / bounds.renderW) * targetW);
    const wdaY = Math.round((relY / bounds.renderH) * targetH);
    return {
      x: Math.max(0, Math.min(wdaX, targetW)),
      y: Math.max(0, Math.min(wdaY, targetH)),
    };
  }

  const zoomImg = document.getElementById("zoomScreenImage");
  if (zoomImg) {
    // Coordinate tracking
    zoomImg.addEventListener("mousemove", (e) => {
      const pt = zoomMapToWDA(e, zoomImg);
      const coordsEl = document.getElementById("zoomCoords");
      if (coordsEl && pt) {
        const s2 = state.deviceScale || 3;
        coordsEl.textContent = `x: ${Math.round(pt.x / s2)}  y: ${Math.round(pt.y / s2)}`;
      }
    });

    // Click to tap (or Helper pick color)
    zoomImg.addEventListener("click", async (e) => {
      const pt = zoomMapToWDA(e, zoomImg);
      if (!pt) return;

      // Helper mode: pick color instead of tap
      if (state.helperActive) {
        e.preventDefault();
        e.stopPropagation();
        await helperPickColor(pt.x, pt.y, e);
        return;
      }

      const udid = state.currentDevice;
      if (!udid) return;

      // Visual feedback
      const dot = document.createElement("div");
      dot.style.cssText = `position:fixed;left:${e.clientX - 12}px;top:${e.clientY - 12}px;width:24px;height:24px;border-radius:50%;background:rgba(0,200,255,0.5);border:2px solid rgba(0,200,255,0.8);pointer-events:none;z-index:9999;transition:all 0.3s ease-out;`;
      document.body.appendChild(dot);
      setTimeout(() => {
        dot.style.transform = "scale(2)";
        dot.style.opacity = "0";
      }, 50);
      setTimeout(() => dot.remove(), 400);

      appendLog(
        `📍 Zoom tap: (${pt.x * state.deviceScale}, ${pt.y * state.deviceScale}) [pixel]`,
      );
      try {
        await fetch(`${API}/tap?x=${pt.x}&y=${pt.y}`, { method: "POST" });
      } catch (err) {
        appendLog(`⚠️ Tap error: ${err.message}`, "error");
      }
      if (!state.isStreaming) setTimeout(takeScreenshot, 300);
    });
  }

  // Screenshot button in zoom
  document
    .getElementById("zoomScreenshotBtn")
    ?.addEventListener("click", () => {
      takeScreenshot();
      setTimeout(() => {
        const screenImg = document.getElementById("screenImage");
        const zi = document.getElementById("zoomScreenImage");
        if (screenImg && zi) zi.src = screenImg.src;
      }, 500);
    });

  // Stream toggle in zoom
  document.getElementById("zoomStreamBtn")?.addEventListener("click", () => {
    toggleStream();
    setTimeout(() => {
      const screenImg = document.getElementById("screenImage");
      const zi = document.getElementById("zoomScreenImage");
      if (screenImg && zi) zi.src = screenImg.src;
      const btn = document.getElementById("zoomStreamBtn");
      if (btn) btn.textContent = state.isStreaming ? "⏸" : "▶";
    }, 300);
  });

  // Helper toggle in zoom — show/hide zoom helper column
  document.getElementById("zoomHelperBtn")?.addEventListener("click", () => {
    state.helperActive = !state.helperActive;
    const col = document.getElementById("zoomHelperCol");
    const mainPanel = document.getElementById("helperPanel");
    const mainToggle = document.getElementById("helperToggle");
    if (col) col.classList.toggle("visible", state.helperActive);
    if (mainPanel)
      mainPanel.style.display = state.helperActive ? "flex" : "none";
    if (mainToggle) mainToggle.classList.toggle("active", state.helperActive);
    const btn = document.getElementById("zoomHelperBtn");
    if (btn) btn.classList.toggle("active", state.helperActive);
    const wrapper = document.getElementById("zoomScreenImage");
    if (wrapper)
      wrapper.style.cursor = state.helperActive ? "crosshair" : "default";
  });

  // Zoom helper mode buttons
  document
    .getElementById("zoomPickSingle")
    ?.addEventListener("click", () => setHelperMode("single"));
  document
    .getElementById("zoomPickMulti")
    ?.addEventListener("click", () => setHelperMode("multi"));
  document
    .getElementById("zoomRegion")
    ?.addEventListener("click", () => setHelperMode("region"));
  document.getElementById("zoomHelperClear")?.addEventListener("click", () => {
    state.pickedColors = [];
    state.regionStart = null;
    renderPickedColors();
    const wrapper = document.getElementById("screenWrapper");
    if (wrapper)
      wrapper
        .querySelectorAll(".pick-marker, .region-overlay")
        .forEach((m) => m.remove());
    appendLog("🗑️ Helper: cleared all picks");
  });

  // Zoom Generate / Insert code
  document.getElementById("zoomGenCode")?.addEventListener("click", () => {
    const code = generateHelperCode();
    if (code) {
      copyToClipboard(code);
      appendLog("📋 Code copied to clipboard");
    }
  });
  document.getElementById("zoomInsertCode")?.addEventListener("click", () => {
    const code = generateHelperCode();
    if (code && state.editor) {
      const pos = state.editor.getPosition();
      state.editor.executeEdits("helper", [
        {
          range: new monaco.Range(
            pos.lineNumber,
            pos.column,
            pos.lineNumber,
            pos.column,
          ),
          text: code + "\n",
        },
      ]);
      state.editor.focus();
      appendLog("⬇️ Code inserted into editor");
    }
  });
}

function openZoomPopup() {
  const zoomModal = document.getElementById("zoomModal");
  const zoomImg = document.getElementById("zoomScreenImage");
  const screenStream = document.getElementById("screenStream");
  const screenImg = document.getElementById("screenImage");

  // Try MJPEG stream first, then old screenImage, then take fresh screenshot
  if (
    screenStream &&
    screenStream.src &&
    screenStream.style.display !== "none"
  ) {
    // Use MJPEG stream — set the same source for zoom
    zoomImg.src = `${API}/mjpeg_stream?quality=0.7&fps=8&t=${Date.now()}`;
  } else if (
    screenImg &&
    screenImg.src &&
    screenImg.src !== window.location.href
  ) {
    zoomImg.src = screenImg.src;
  } else {
    // Take a fresh screenshot
    zoomImg.src = `${API}/screenshot?quality=0.9&t=${Date.now()}`;
  }

  zoomModal.classList.add("visible");
  zoomModal.style.display = "flex";

  // Update stream button state
  const btn = document.getElementById("zoomStreamBtn");
  if (btn) btn.textContent = "⏸";

  // Sync source periodically (for non-stream mode)
  zoomSyncInterval = setInterval(() => {
    if (
      screenImg &&
      screenImg.src &&
      screenImg.src !== zoomImg.src &&
      !zoomImg.src.includes("stream")
    ) {
      zoomImg.src = screenImg.src;
    }
  }, 300);
}

function closeZoomPopup() {
  const zoomModal = document.getElementById("zoomModal");
  if (!zoomModal) return;
  zoomModal.classList.remove("visible");
  zoomModal.style.display = "none";
  document.getElementById("zoomScreenImage").src = "";
  if (zoomSyncInterval) {
    clearInterval(zoomSyncInterval);
    zoomSyncInterval = null;
  }
}

// Make these accessible from HTML onclick
window.sendPress = sendPress;
window.quickSwipe = quickSwipe;

// ═══════════════════════════════════════════
// Tabs
// ═══════════════════════════════════════════

function initTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;

      // Update tab active state
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // Update content
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));
      document.getElementById(`${target}Tab`)?.classList.add("active");

      if (target === "files") loadScriptFiles();
      if (target === "imagetools" && typeof imgGalleryRefresh === "function")
        imgGalleryRefresh();
      if (target === "flow" && typeof initFlowBuilder === "function")
        initFlowBuilder();
      if (target === "console") {
        const badge = document.getElementById("consoleBadge");
        if (badge) {
          badge.textContent = "0";
          badge.style.display = "none";
        }
      }
    });
  });
}

// ═══════════════════════════════════════════
// Monaco Editor (VSCode Engine)
// ═══════════════════════════════════════════

function initMonacoEditor() {
  // Configure AMD loader for Monaco
  require.config({
    paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" },
  });

  // Define custom IOSControl dark theme
  require(["vs/editor/editor.main"], function () {
    // Register custom theme matching our IDE
    monaco.editor.defineTheme("icontrol-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6A9955", fontStyle: "italic" },
        { token: "keyword", foreground: "C586C0" },
        { token: "string", foreground: "CE9178" },
        { token: "number", foreground: "B5CEA8" },
        { token: "type", foreground: "4EC9B0" },
        { token: "identifier", foreground: "9CDCFE" },
        { token: "delimiter", foreground: "D4D4D4" },
      ],
      colors: {
        "editor.background": "#0D1117",
        "editor.foreground": "#E6EDF3",
        "editor.lineHighlightBackground": "#161B22",
        "editor.selectionBackground": "#264F78",
        "editorLineNumber.foreground": "#484F58",
        "editorLineNumber.activeForeground": "#E6EDF3",
        "editor.inactiveSelectionBackground": "#1A2332",
        "editorCursor.foreground": "#79C0FF",
        "editorIndentGuide.background": "#21262D",
        "editorIndentGuide.activeBackground": "#30363D",
        "editorWidget.background": "#161B22",
        "editorWidget.border": "#30363D",
        "editorSuggestWidget.background": "#161B22",
        "editorSuggestWidget.border": "#30363D",
        "editorSuggestWidget.selectedBackground": "#1F6FEB33",
        "minimap.background": "#0D1117",
        "scrollbar.shadow": "#00000000",
        "scrollbarSlider.background": "#484F5833",
        "scrollbarSlider.hoverBackground": "#484F5855",
        "scrollbarSlider.activeBackground": "#484F5888",
      },
    });

    // Get default code from the embedded script tag
    const defaultCode =
      document.getElementById("defaultCode")?.textContent?.trim() ||
      "-- Write your script here\n";

    // Register custom Python completions for IOSControl API
    // ═══════════════════════════════════════════
    // API Function Registry with full docs
    // ═══════════════════════════════════════════
    const apiFunctions = [
      // ── Touch ──
      {
        label: "tap",
        insert: "tap(${1:x}, ${2:y})",
        detail: "📍 Tap at coordinates",
        doc: "Tap at (x, y) in point coordinates.",
        sig: "tap(x, y)",
        params: ["x — X point", "y — Y point"],
      },
      {
        label: "swipe",
        insert: "swipe(${1:x1}, ${2:y1}, ${3:x2}, ${4:y2}, ${5:0.5})",
        detail: "👆 Swipe gesture",
        doc: "Swipe from (x1,y1) to (x2,y2).",
        sig: "swipe(x1, y1, x2, y2, duration)",
        params: ["x1,y1 — Start", "x2,y2 — End", "duration — Seconds (0.5)"],
      },
      {
        label: "longPress",
        insert: "longPress(${1:x}, ${2:y}, ${3:1.0})",
        detail: "👇 Long press",
        doc: "Long press at point.",
        sig: "longPress(x, y, duration)",
        params: ["x,y — Point", "duration — Hold time"],
      },
      {
        label: "touchDown",
        insert: "touchDown(${1:0}, ${2:x}, ${3:y})",
        detail: "⬇️ Touch down",
        doc: "Press finger (multi-touch).",
        sig: "touchDown(finger, x, y)",
        params: ["finger — 0-9", "x,y — Point"],
      },
      {
        label: "touchMove",
        insert: "touchMove(${1:0}, ${2:x}, ${3:y})",
        detail: "↔️ Touch move",
        doc: "Move finger.",
        sig: "touchMove(finger, x, y)",
        params: ["finger — 0-9", "x,y — Point"],
      },
      {
        label: "touchUp",
        insert: "touchUp(${1:0}, ${2:x}, ${3:y})",
        detail: "⬆️ Touch up",
        doc: "Lift finger.",
        sig: "touchUp(finger, x, y)",
        params: ["finger — 0-9", "x,y — Point"],
      },
      {
        label: "pinch",
        insert: "pinch(${1:x}, ${2:y}, ${3:2.0}, ${4:0.5})",
        detail: "🤏 Pinch",
        doc: "Pinch gesture.",
        sig: "pinch(x, y, scale, duration)",
        params: ["x,y — Center", "scale — >1 zoom in", "duration — Seconds"],
      },
      {
        label: "rotate",
        insert: "rotate(${1:x}, ${2:y}, ${3:90}, ${4:0.5})",
        detail: "🔄 Rotate",
        doc: "Rotation gesture.",
        sig: "rotate(x, y, angle, duration)",
        params: ["x,y — Center", "angle — Degrees", "duration — Seconds"],
      },
      // ── Keyboard ──
      {
        label: "keyDown",
        insert: "keyDown(${1:key})",
        detail: "⬇️ Key down",
        doc: "Press physical key.",
        sig: "keyDown(key)",
        params: ["key — Key code"],
      },
      {
        label: "keyUp",
        insert: "keyUp(${1:key})",
        detail: "⬆️ Key up",
        doc: "Release physical key.",
        sig: "keyUp(key)",
        params: ["key — Key code"],
      },
      // ── Color ──
      {
        label: "getColor",
        insert: "getColor(${1:x}, ${2:y})",
        detail: "🎨 Get pixel color",
        doc: "Get color at point as integer.",
        sig: "getColor(x, y)",
        params: ["x,y — Point"],
      },
      {
        label: "getColors",
        insert: "getColors({{${1:x1}, ${2:y1}}, {${3:x2}, ${4:y2}}})",
        detail: "🎨 Multiple colors",
        doc: "Get colors at multiple points.",
        sig: "getColors(locations)",
        params: ["locations — {{x1,y1}, ...}"],
      },
      {
        label: "findColor",
        insert: "findColor(${1:0xFF0000}, ${2:1})",
        detail: "🔍 Find color",
        doc: "Find pixels matching color.",
        sig: "findColor(color, count, region)",
        params: [
          "color — 0xRRGGBB",
          "count — Max results",
          "region — Optional",
        ],
      },
      {
        label: "findColors",
        insert:
          "findColors({{${1:0}, ${2:0}, ${3:0xFF0000}}, {${4:10}, ${5:0}, ${6:0x00FF00}}})",
        detail: "🔍 Multi-color",
        doc: "Find multi-point color pattern.",
        sig: "findColors(colors, count, region)",
        params: ["colors — {{dx,dy,color}, ...}"],
      },
      {
        label: "waitForColor",
        insert: "waitForColor(${1:x}, ${2:y}, ${3:0xFF0000}, ${4:30})",
        detail: "⏳ Wait for color",
        doc: "Wait until pixel matches.",
        sig: "waitForColor(x, y, color, timeout)",
        params: ["x,y — Point", "color — 0xRRGGBB", "timeout — Seconds"],
      },
      {
        label: "intToRgb",
        insert: "intToRgb(${1:color})",
        detail: "🔄 Int → RGB",
        doc: "Returns r, g, b.",
        sig: "intToRgb(color)",
        params: ["color — Integer"],
      },
      {
        label: "rgbToInt",
        insert: "rgbToInt(${1:255}, ${2:0}, ${3:0})",
        detail: "🔄 RGB → Int",
        doc: "Convert RGB to integer.",
        sig: "rgbToInt(r, g, b)",
        params: ["r,g,b — 0-255"],
      },
      // ── Image / OCR ──
      {
        label: "findImage",
        insert: 'findImage("${1:image.png}", ${2:1}, ${3:0.9})',
        detail: "🔍 Find image",
        doc: "Find image on screen.\ncount=1: returns x, y. count>1: returns {{x,y},...}. nil if not found.",
        sig: "findImage(path, count, threshold, region)",
        params: ["path — Image filename", "count — Max matches (default 1)", "threshold — 0-1 (default 0.9)", "region — {x,y,w,h} POINT"],
      },
      {
        label: "waitForImage",
        insert: 'waitForImage("${1:image.png}", ${2:10})',
        detail: "⏳ Wait for image",
        doc: "Wait until image appears on screen.\nReturns {x=, y=} if found, false if timeout.",
        sig: "waitForImage(path, timeout)",
        params: ["path — Image filename", "timeout — Seconds (default 10)"],
      },
      {
        label: "screenshot",
        insert: 'screenshot("${1:name}")',
        detail: "📸 Screenshot",
        doc: "Save screenshot as JPEG to images/ dir.",
        sig: "screenshot(name, region)",
        params: ["name — Filename", "region — Optional {x,y,w,h}"],
      },
      {
        label: "deleteScreenshot",
        insert: 'deleteScreenshot("${1:name.jpg}")',
        detail: "🗑️ Delete Screenshot",
        doc: "Delete screenshot from images/ directory.",
        sig: "deleteScreenshot(name)",
        params: ["name — Filename to delete"],
      },
      {
        label: "convertBase64",
        insert: 'convertBase64("${1:file}")',
        detail: "🔄 Convert to Base64",
        doc: "Read file and return base64 string.",
        sig: "convertBase64(path)",
        params: ["path — Filename or absolute path"],
      },
      {
        label: "ocr",
        insert: "ocr({region = {${1:0}, ${2:0}, ${3:414}, ${4:736}}})",
        detail: "📖 OCR (table)",
        doc: "Recognize text on screen. Returns table of {text, x, y, confidence}.\nRegion must use key syntax: {region = {x, y, w, h}}.",
        sig: "ocr({region = {x, y, w, h}})",
        params: ["region — {region = {x, y, w, h}} in points"],
      },
      {
        label: "ocrText",
        insert: "ocrText(${1:x}, ${2:y}, ${3:w}, ${4:h})",
        detail: "📖 OCR (string)",
        doc: "Recognize text in a region and return as plain string.\nSimpler than ocr() — no need to parse table.",
        sig: "ocrText(x, y, w, h)",
        params: ["x, y — Top-left corner in points", "w, h — Width and height in points"],
      },
      {
        label: "findText",
        insert: 'findText("${1:text}")',
        detail: "🔍 Find text (OCR)",
        doc: "Find text on screen via OCR.\nReturns x, y, text (3 values) or nil. Alias: ocrFind()",
        sig: "findText(text, region)",
        params: ["text — String to find", "region — Optional {x,y,w,h} POINT"],
      },
      {
        label: "waitForText",
        insert: 'waitForText("${1:text}", ${2:10})',
        detail: "⏳ Wait for text (OCR)",
        doc: "Wait until text appears on screen.\nReturns {x=, y=, text=} if found, false if timeout.",
        sig: "waitForText(text, timeout)",
        params: ["text — String", "timeout — Seconds (default 10)"],
      },
      // ── App / System ──
      {
        label: "home",
        insert: "home()",
        detail: "🏠 Home button",
        doc: "Press home.",
        sig: "home()",
        params: [],
      },
      {
        label: "appRun",
        insert: 'appRun("${1:com.apple.mobilesafari}")',
        detail: "🚀 Launch app",
        doc: "Launch by bundle ID.",
        sig: "appRun(bundleId)",
        params: ["bundleId — App ID"],
      },
      {
        label: "appKill",
        insert: 'appKill("${1:com.apple.mobilesafari}")',
        detail: "❌ Kill app",
        doc: "Kill app.",
        sig: "appKill(bundleId)",
        params: ["bundleId — App ID"],
      },
      {
        label: "appState",
        insert: 'appState("${1:com.apple.mobilesafari}")',
        detail: "📊 App state",
        doc: "1=Off, 2=BG, 4=FG.",
        sig: "appState(bundleId)",
        params: ["bundleId — App ID"],
      },
      {
        label: "appInfo",
        insert: 'appInfo("${1:com.apple.mobilesafari}")',
        detail: "ℹ️ App info",
        doc: "Get app details.",
        sig: "appInfo(bundleId)",
        params: ["bundleId — App ID"],
      },
      {
        label: "appClear",
        insert: 'appClear("${1:com.facebook.Facebook}")',
        detail: "🧹 Clear app data",
        doc: "Full wipe: kills app, clears keychain, data container, shared containers, system caches. Returns true/false.",
        sig: "appClear(bundleId)",
        params: ["bundleId — App bundle ID to wipe"],
      },
      {
        label: "openURL",
        insert: 'openURL("${1:https://example.com}")',
        detail: "🌐 Open URL",
        doc: "Open URL on device.",
        sig: "openURL(url)",
        params: ["url — URL"],
      },
      {
        label: "frontMostAppId",
        insert: "frontMostAppId()",
        detail: "📱 Foreground app",
        doc: "Get foreground bundle ID.",
        sig: "frontMostAppId()",
        params: [],
      },
      // ── Text ──
      {
        label: "inputText",
        insert: 'inputText("${1:hello}")',
        detail: "⌨️ Type text",
        doc: "Type into focused field.",
        sig: "inputText(text)",
        params: ["text — String"],
      },
      {
        label: "copyText",
        insert: 'copyText("${1:text}")',
        detail: "📋 Copy",
        doc: "Copy to clipboard.",
        sig: "copyText(text)",
        params: ["text — String"],
      },
      {
        label: "clipText",
        insert: "clipText()",
        detail: "📋 Paste",
        doc: "Get clipboard.",
        sig: "clipText()",
        params: [],
      },
      // ── HTTP ──
      {
        label: "httpGet",
        insert: 'httpGet("${1:https://api.example.com}")',
        detail: "🌐 HTTP GET",
        doc: "GET request. Returns body, statusCode.\nDefault timeout: 15s.\n\nhttpGet(url)\nhttpGet(url, headers)\nhttpGet(url, headers, 30)  -- 30s timeout\nhttpGet(url, nil, 60)     -- 60s timeout, no headers\nhttpGet(url, 60)          -- shorthand: 60s timeout",
        sig: "httpGet(url [, headers] [, timeout])",
        params: ["url — URL", "headers — Optional {key=value}", "timeout — Seconds (default 15)"],
      },
      {
        label: "httpPost",
        insert: 'httpPost("${1:url}", ${2:body}, {["Content-Type"] = "application/json"})',
        detail: "🌐 HTTP POST",
        doc: "POST request. body can be string or jsonEncode({key=value}).\nDefault timeout: 15s.\n\nhttpPost(url, body, headers)\nhttpPost(url, body, headers, 30)  -- 30s timeout\nhttpPost(url, body, nil, 60)      -- 60s timeout\nhttpPost(url, body, 60)           -- shorthand: 60s timeout",
        sig: "httpPost(url, body [, headers] [, timeout])",
        params: ["url — URL", "body — String or jsonEncode(table)", "headers — Optional {key=value}", "timeout — Seconds (default 15)"],
      },
      // ── Proxy ──
      {
        label: "setProxySystem",
        insert: 'setProxySystem("${1:host}", ${2:port})',
        detail: "🔌 System Proxy On",
        doc: "Set device-wide Wi-Fi proxy. Only IP:Port supported.",
        sig: "setProxySystem(host, port)",
        params: ["host — Proxy host", "port — Proxy port"],
      },
      {
        label: "clearProxySystem",
        insert: "clearProxySystem()",
        detail: "🔌 System Proxy Off",
        doc: "Disable device-wide Wi-Fi proxy.",
        sig: "clearProxySystem()",
        params: [],
      },
      // ── JSON ──
      {
        label: "jsonDecode",
        insert: "jsonDecode(${1:str})",
        detail: "📦 JSON → Table",
        doc: "Parse JSON.",
        sig: "jsonDecode(str)",
        params: ["str — JSON string"],
      },
      {
        label: "jsonEncode",
        insert: "jsonEncode(${1:tbl})",
        detail: "📦 Table → JSON",
        doc: "Encode to JSON.",
        sig: "jsonEncode(tbl)",
        params: ["tbl — Lua table"],
      },
      // ── File ──
      {
        label: "readFile",
        insert: 'readFile("${1:path}")',
        detail: "📄 Read file",
        doc: "Read file content.",
        sig: "readFile(path)",
        params: ["path — File path"],
      },
      {
        label: "writeFile",
        insert: 'writeFile("${1:path}", "${2:data}")',
        detail: "💾 Write file",
        doc: "Write to file.",
        sig: "writeFile(path, content)",
        params: ["path — File path", "content — String"],
      },
      {
        label: "appendFile",
        insert: 'appendFile("${1:path}", "${2:data}")',
        detail: "➕ Append file",
        doc: "Append text to file (creates if not exists).",
        sig: "appendFile(path, content)",
        params: ["path — File path", "content — String to append"],
      },
      // ── Random ──
      {
        label: "randomSleep",
        insert: "randomSleep(${1:1.0}, ${2:3.0})",
        detail: "🎲 Random sleep",
        doc: "Sleep random duration.",
        sig: "randomSleep(min, max)",
        params: ["min — Min sec", "max — Max sec"],
      },
      {
        label: "randomInt",
        insert: "randomInt(${1:1}, ${2:100})",
        detail: "🎲 Random int",
        doc: "Random integer.",
        sig: "randomInt(min, max)",
        params: ["min — Min", "max — Max"],
      },
      {
        label: "randomFloat",
        insert: "randomFloat(${1:0}, ${2:1})",
        detail: "🎲 Random float",
        doc: "Random float.",
        sig: "randomFloat(min, max)",
        params: ["min — Min", "max — Max"],
      },
      // ── UI ──
      {
        label: "toast",
        insert: 'toast("${1:msg}")',
        detail: "💬 Toast",
        doc: "Show message.",
        sig: "toast(msg)",
        params: ["msg — Text"],
      },
      {
        label: "alert",
        insert: 'alert("${1:msg}")',
        detail: "⚠️ Alert",
        doc: "Show alert.",
        sig: "alert(msg)",
        params: ["msg — Text"],
      },
      {
        label: "vibrate",
        insert: "vibrate()",
        detail: "📳 Vibrate",
        doc: "Vibrate device.",
        sig: "vibrate()",
        params: [],
      },
      // ── Timing ──
      {
        label: "sleep",
        insert: "sleep(${1:1})",
        detail: "⏱️ Sleep",
        doc: "Pause seconds.",
        sig: "sleep(sec)",
        params: ["sec — Seconds"],
      },
      {
        label: "usleep",
        insert: "usleep(${1:500000})",
        detail: "⏱️ Microsleep",
        doc: "Pause microseconds.",
        sig: "usleep(us)",
        params: ["us — Microseconds"],
      },
      // ── Utility ──
      {
        label: "log",
        insert: 'log(${1:"msg"})',
        detail: "📝 Log",
        doc: "Print to console.",
        sig: "log(msg)",
        params: ["msg — Value"],
      },
      {
        label: "execute",
        insert: 'execute("${1:cmd}")',
        detail: "💻 Shell",
        doc: "Run shell command.",
        sig: "execute(cmd)",
        params: ["cmd — Command"],
      },
      {
        label: "getScreenResolution",
        insert: "getScreenResolution()",
        detail: "📐 Screen size",
        doc: "Get w, h.",
        sig: "getScreenResolution()",
        params: [],
      },
      {
        label: "getOrientation",
        insert: "getOrientation()",
        detail: "🔄 Orientation",
        doc: "Get orientation.",
        sig: "getOrientation()",
        params: [],
      },
      {
        label: "deviceInfo",
        insert: "deviceInfo()",
        detail: "ℹ️ Device",
        doc: "Get device info.",
        sig: "deviceInfo()",
        params: [],
      },
      {
        label: "getSN",
        insert: "getSN()",
        detail: "🔢 Serial",
        doc: "Get serial number.",
        sig: "getSN()",
        params: [],
      },
      {
        label: "getLocalIP",
        insert: "getLocalIP()",
        detail: "🌐 Local IP",
        doc: "Get WiFi IP.",
        sig: "getLocalIP()",
        params: [],
      },
      {
        label: "keepAwake",
        insert: "keepAwake(${1:true})",
        detail: "☀️ Keep awake",
        doc: "Prevent sleep.",
        sig: "keepAwake(flag)",
        params: ["flag — true/false"],
      },
      {
        label: "rootDir",
        insert: "rootDir()",
        detail: "📁 Root dir",
        doc: "Scripts root.",
        sig: "rootDir()",
        params: [],
      },
      {
        label: "currentDir",
        insert: "currentDir()",
        detail: "📁 Current dir",
        doc: "Script dir.",
        sig: "currentDir()",
        params: [],
      },
      {
        label: "wifiInfo",
        insert: "wifiInfo()",
        detail: "📶 WiFi",
        doc: "WiFi info.",
        sig: "wifiInfo()",
        params: [],
      },
      {
        label: "setCellularData",
        insert: 'setCellularData(${1:false}, ${2:5})',
        detail: "📶 Cellular Data",
        doc: "Toggle cellular data on/off with optional auto-restore timer.",
        sig: "setCellularData(enabled, delay)",
        params: ["enabled — true/false", "delay — Auto-restore after N seconds (optional)"],
      },
      {
        label: "setAirplaneMode",
        insert: 'setAirplaneMode(${1:true}, ${2:5})',
        detail: "✈️ Airplane Mode",
        doc: "Toggle airplane mode with optional auto-restore timer.",
        sig: "setAirplaneMode(enabled, delay)",
        params: ["enabled — true/false", "delay — Auto-restore after N seconds (optional)"],
      },
      {
        label: "getIP",
        insert: "getIP()",
        detail: "🌐 Public IP",
        doc: "Get public IP address via api.ipify.org.",
        sig: "getIP()",
        params: [],
      },
      {
        label: "tapImage",
        insert: 'tapImage("${1:image.png}", ${2:10}, ${3:0.85})',
        detail: "🎯 Tap Image",
        doc: "Find image on screen and tap it. timeout=wait seconds, threshold=match accuracy 0~1.\n\nOptional region {x,y,w,h} to limit search area.\n\nVí dụ:\n  tapImage(\"btn.png\", 10, 0.85)\n  tapImage(\"btn.png\", 10, 0.85, {0, 400, 414, 200})",
        sig: "tapImage(path, timeout, threshold, region)",
        params: ["path — Image filename", "timeout — Seconds (default 5)", "threshold — Match 0-1 (default 0.8)", "region — Optional {x,y,w,h} search area (POINT)"],
      },
      {
        label: "tapText",
        insert: 'tapText("${1:text}", ${2:10}, ${3:1})',
        detail: "🎯 Tap Text",
        doc: "OCR: tìm chữ và tap vào.\n\n• index=1 → cái đầu tiên (mặc định)\n• index=2 → cái thứ hai từ trên xuống\n• Kết quả sắp theo top→bottom, left→right\n• region: giới hạn vùng tìm (tuỳ chọn)\n\nVí dụ:\n  tapText(\"Login\")          -- tap \"Login\" đầu tiên\n  tapText(\"Delete\", 5, 2)  -- tap \"Delete\" thứ 2\n  tapText(\"OK\", 5, 1, {0, 600, 414, 200})",
        sig: "tapText(text, timeout, index, region)",
        params: ["text — Chữ cần tìm", "timeout — Giây chờ (mặc định 5)", "index — Thứ tự xuất hiện cần tap: 1=đầu tiên, 2=thứ hai... (mặc định 1)", "region — Tuỳ chọn {x,y,w,h} vùng tìm kiếm (POINT)"],
      },
      {
        label: "swipeUntilImage",
        insert: 'swipeUntilImage("${1:image.png}", "${2:up}", ${3:10}, ${4:0.9}, ${5:0.5})',
        detail: "🔍 Swipe Until Image",
        doc: "Swipe until image appears. Returns ok, x, y.",
        sig: "swipeUntilImage(path, direction, maxSwipes, threshold, speed)",
        params: ["path — Image filename", "direction — up/down/left/right", "maxSwipes — Max tries (default 10)", "threshold — Match threshold 0-1 (default 0.9)", "speed — Swipe duration in seconds (default 0.5)"],
      },
      {
        label: "swipeUntilText",
        insert: 'swipeUntilText("${1:text}", "${2:up}", ${3:10}, ${4:0.3})',
        detail: "🔍 Swipe Until Text",
        doc: "Swipe until text appears (OCR). Returns ok, x, y.",
        sig: "swipeUntilText(text, direction, maxSwipes, speed)",
        params: ["text — Text to find", "direction — up/down/left/right", "maxSwipes — Max tries (default 10)", "speed — Swipe duration in seconds (default 0.3)"],
      },
      {
        label: "dialogInput",
        insert: 'dialogInput("${1:Title}", "${2:Message}")',
        detail: "📝 Dialog Input",
        doc: "Show input dialog, returns user text or nil.",
        sig: "dialogInput(title, message, default)",
        params: ["title — Dialog title", "message — Description", "default — Default text"],
      },
      {
        label: "dialogChoice",
        insert: 'dialogChoice("${1:Title}", "${2:Option1}", "${3:Option2}")',
        detail: "📝 Dialog Choice",
        doc: "Show choice dialog, returns selected option or nil.",
        sig: "dialogChoice(title, ...options)",
        params: ["title — Dialog title", "options — Variable number of option strings"],
      },
      {
        label: "timestamp",
        insert: "timestamp()",
        detail: "⏰ Timestamp",
        doc: "Current unix timestamp in milliseconds.",
        sig: "timestamp()",
        params: [],
      },
      {
        label: "md5",
        insert: 'md5("${1:string}")',
        detail: "🔒 MD5 Hash",
        doc: "Returns MD5 hex hash of string.",
        sig: "md5(string)",
        params: ["string — Input string"],
      },
      {
        label: "showOverlay",
        insert: 'showOverlay({["Runs"] = "0", ["Success"] = "0"})',
        detail: "📊 Overlay HUD",
        doc: "Show transparent stats overlay on screen.",
        sig: "showOverlay(data)",
        params: ["data — Table {key=value, ...}"],
      },
      {
        label: "updateOverlay",
        insert: 'updateOverlay("${1:key}", ${2:value})',
        detail: "📊 Update Overlay",
        doc: "Update a single overlay entry.",
        sig: "updateOverlay(key, value)",
        params: ["key — Stat name", "value — New value"],
      },
      {
        label: "hideOverlay",
        insert: "hideOverlay()",
        detail: "📊 Hide Overlay",
        doc: "Remove the stats overlay.",
        sig: "hideOverlay()",
        params: [],
      },
      // ── Crane — Container Management ──
      {
        label: "crane.list",
        insert: 'crane.list("${1:com.facebook.Facebook}")',
        detail: "🏗️ List containers",
        doc: "List Crane containers for an app. Returns table of {name, id, isDefault}.\nWithout bundleId: lists all apps with containers.\n\ncrane.list() → all apps\ncrane.list(\"com.facebook.Facebook\") → containers for FB",
        sig: "crane.list(bundleId?)",
        params: ["bundleId — App bundle ID (optional)"],
      },
      {
        label: "crane.switch",
        insert: 'crane.switch("${1:com.facebook.Facebook}", "${2:Account1}")',
        detail: "🏗️ Switch container",
        doc: "Switch active Crane container. Accepts name or UUID.\n\ncrane.switch(\"com.facebook.Facebook\", \"Account1\")\ncrane.switch(\"com.facebook.Facebook\", \"UUID-...\")",
        sig: "crane.switch(bundleId, name_or_uuid)",
        params: ["bundleId — App bundle ID", "name_or_uuid — Container name or UUID"],
      },
      {
        label: "crane.create",
        insert: 'crane.create("${1:com.facebook.Facebook}", "${2:NewAccount}")',
        detail: "🏗️ Create container",
        doc: "Create a new Crane container for an app.\nReturns boolean success, string error.",
        sig: "crane.create(bundleId, name)",
        params: ["bundleId — App bundle ID", "name — New container name"],
      },
      {
        label: "crane.delete",
        insert: 'crane.delete("${1:com.facebook.Facebook}", "${2:Account1}")',
        detail: "🏗️ Delete container",
        doc: "Delete a Crane container. Data will be lost.",
        sig: "crane.delete(bundleId, name_or_uuid)",
        params: ["bundleId — App bundle ID", "name_or_uuid — Container name or UUID"],
      },
      {
        label: "crane.wipe",
        insert: 'crane.wipe("${1:com.facebook.Facebook}", "${2:Account1}")',
        detail: "🏗️ Wipe container",
        doc: "Full wipe including keychain data. Container structure preserved.",
        sig: "crane.wipe(bundleId, name_or_uuid)",
        params: ["bundleId — App bundle ID", "name_or_uuid — Container name or UUID"],
      },
      {
        label: "crane.rename",
        insert: 'crane.rename("${1:com.facebook.Facebook}", "${2:OldName}", "${3:NewName}")',
        detail: "🏗️ Rename container",
        doc: "Rename a Crane container. Updates Crane preferences and notifies daemon to reload.",
        sig: "crane.rename(bundleId, oldName, newName)",
        params: ["bundleId — App bundle ID", "oldName — Current name", "newName — New name"],
      },
      {
        label: "crane.clearData",
        insert: 'crane.clearData("${1:com.facebook.Facebook}")',
        detail: "🧹 Clear data (keep login)",
        doc: "Clear caches, WebKit, tmp, SplashBoard but KEEP keychain & preferences.\nPerfect for reducing storage without logging out.\n\nClears: Library/Caches, Library/WebKit, Library/SplashBoard, tmp\nKeeps: Keychain (securityd), Preferences, Cookies\n\nReturns: boolean success, int cleared_count",
        sig: "crane.clearData(bundleId)",
        params: ["bundleId — App bundle ID"],
      },
      {
        label: "crane.backup",
        insert: 'crane.backup("${1:com.facebook.Facebook}", nil, "${2:fb_backup}")',
        detail: "💾 Backup container",
        doc: "Create tar.gz backup of app container data.\nSaved to /var/mobile/Library/IOSControl/Backups/\n\nReturns: boolean success, string path",
        sig: "crane.backup(bundleId, containerName?, backupName?)",
        params: ["bundleId — App bundle ID", "containerName — Container (optional)", "backupName — Backup filename prefix (optional)"],
      },
      {
        label: "crane.restore",
        insert: 'crane.restore("${1:com.facebook.Facebook}", "${2:/var/mobile/Library/IOSControl/Backups/fb_backup.tar.gz}")',
        detail: "📦 Restore backup",
        doc: "Restore app data from a tar.gz backup. Kills app first.",
        sig: "crane.restore(bundleId, backupPath)",
        params: ["bundleId — App bundle ID", "backupPath — Full path to .tar.gz backup"],
      },
      {
        label: "crane.size",
        insert: 'crane.size("${1:com.facebook.Facebook}")',
        detail: "📊 Container size",
        doc: "Get detailed size breakdown of app container.\nReturns table: {total, caches, documents, webkit, tmp, path}\nAll sizes in bytes.\n\nlocal s = crane.size(\"com.facebook.Facebook\")\nlog(s.total / 1024 / 1024 .. \" MB\")",
        sig: "crane.size(bundleId)",
        params: ["bundleId — App bundle ID"],
      },
      // ── Spoof — Device Identity ──
      {
        label: "spoof.app",
        insert: 'spoof.app("${1:com.facebook.Facebook}")',
        detail: "🎭 Quick spoof (random)",
        doc: "Quick-spoof: random device profile for target app.\nSets model + iOS version + name + target bundle automatically.\nRequires paid license.\n\nReturns table: {model, version, name, target}\nOr nil + error if free user.\n\nlocal info = spoof.app(\"com.facebook.Facebook\")\nlog(info.name .. \" iOS \" .. info.version)",
        sig: 'spoof.app(bundleID)',
        params: ["bundleID — Target app bundle ID"],
      },
      {
        label: "spoof.app (specific)",
        insert: 'spoof.app("${1:com.facebook.Facebook}", "${2:18.3.1}", "${3:iPhone17,2}")',
        detail: "🎭 Specific spoof",
        doc: "Specific-spoof: set exact iOS version and model for target app.\nRequires paid license.\n\nModels: iPhone14,2 (13 Pro), iPhone15,2 (14 Pro), iPhone16,1 (15 Pro),\niPhone16,2 (15 Pro Max), iPhone17,1 (16 Pro), iPhone17,2 (16 Pro Max)\n\nAlso accepts names: \"iPhone 15 Pro Max\", \"iPhone 16 Pro\"\n\nspoof.app(\"com.facebook.Facebook\", \"18.3.1\", \"iPhone17,2\")\nspoof.app(\"com.facebook.Facebook\", \"18.0\", \"iPhone 15 Pro\")",
        sig: 'spoof.app(bundleID, ios, model)',
        params: ["bundleID — Target app bundle ID", "ios — iOS version (e.g. 18.3.1)", "model — ProductType or name (e.g. iPhone17,2)"],
      },
    ];

    // ═══════════════════════════════════════════
    // Snippet Templates (Lua)
    // ═══════════════════════════════════════════
    const snippetTemplates = [
      {
        label: "⚡ while true loop",
        insert: "while true do\n    ${1:-- code}\n    sleep(${2:1})\nend",
        detail: "Infinite loop",
        doc: "Lua infinite loop with sleep.",
      },
      {
        label: "⚡ for loop",
        insert:
          "for ${1:i} = 1, ${2:10} do\n    log(${1:i})\n    sleep(${3:0.5})\nend",
        detail: "For loop",
        doc: "Lua for loop.",
      },
      {
        label: "⚡ find and tap",
        insert:
          'local x, y = findImage("${1:btn.png}")\nif x then\n    tap(x, y)\n    log("Tapped!")\nelse\n    log("Not found")\nend',
        detail: "Find → tap",
        doc: "Find image and tap.",
      },
      {
        label: "⚡ wait and tap",
        insert:
          'local x, y = waitForImage("${1:btn.png}", ${2:30})\nif x then\n    tap(x, y)\n    log("OK")\nelse\n    log("Timeout")\nend',
        detail: "Wait → tap",
        doc: "Wait for image then tap.",
      },
      {
        label: "⚡ color check",
        insert:
          "while true do\n    local c = getColor(${1:100}, ${2:200})\n    if c == ${3:0xFF0000} then\n        tap(${1:100}, ${2:200})\n        break\n    end\n    sleep(0.5)\nend",
        detail: "Color check",
        doc: "Wait for color match.",
      },
      {
        label: "⚡ app launch",
        insert:
          'appRun("${1:com.apple.mobilesafari}")\nsleep(2)\nlog("App: " .. frontMostAppId())',
        detail: "Launch app",
        doc: "Launch and verify.",
      },
      {
        label: "⚡ if / else",
        insert:
          "if ${1:cond} then\n    ${2:-- true}\nelse\n    ${3:-- false}\nend",
        detail: "If/else",
        doc: "Lua conditional.",
      },
      {
        label: "⚡ function",
        insert: "function ${1:myFunc}(${2:})\n    ${3:-- body}\nend",
        detail: "Function",
        doc: "Lua function.",
      },
      {
        label: "⚡ HTTP + JSON",
        insert:
          'local resp = httpGet("${1:https://api.example.com}")\nlocal data = jsonDecode(resp)\nlog(data)',
        detail: "HTTP + JSON",
        doc: "GET and parse JSON.",
      },
      {
        label: "⚡ scroll down",
        insert:
          "for i = 1, ${1:3} do\n    swipe(207, 600, 207, 300, 0.3)\n    sleep(0.5)\nend",
        detail: "Scroll down",
        doc: "Swipe up to scroll.",
      },
      {
        label: "⚡ multi-step",
        insert:
          '-- Step 1: Launch\nappRun("${1:com.apple.mobilesafari}")\nsleep(2)\n\n-- Step 2: Tap\ntap(${2:207}, ${3:400})\nsleep(1)\n\n-- Step 3: Input\ninputText("${4:hello}")\n\nlog("Done!")',
        detail: "Multi-step",
        doc: "Multi-step automation template.",
      },
      {
        label: "⚡ crane multi-account",
        insert:
          '-- Crane: Multi-account automation\nlocal bid = "${1:com.facebook.Facebook}"\nlocal accounts = crane.list(bid)\nfor _, acc in ipairs(accounts) do\n    log("Switching to: " .. acc.name)\n    crane.switch(bid, acc.name)\n    sleep(2)\n    appRun(bid)\n    sleep(3)\n    -- TODO: your per-account logic here\n    appKill(bid)\n    sleep(1)\nend\nlog("All accounts processed!")',
        detail: "Crane accounts",
        doc: "Loop through all Crane containers for an app.",
      },
      {
        label: "⚡ crane clear + size",
        insert:
          '-- Crane: Check size → auto-clear if too large\nlocal bid = "${1:com.facebook.Facebook}"\nlocal s = crane.size(bid)\nlog("Size: " .. string.format("%.1f", s.total/1024/1024) .. " MB")\nif s.total > ${2:100} * 1024 * 1024 then\n    crane.clearData(bid)\n    log("Cleared! Kept login.")\n    local after = crane.size(bid)\n    log("After: " .. string.format("%.1f", after.total/1024/1024) .. " MB")\nend',
        detail: "Size + clear",
        doc: "Check container size, auto-clear if exceeds threshold.",
      },
      {
        label: "⚡ spoof + launch app",
        insert:
          '-- Spoof device then launch app\nlocal bid = "${1:com.facebook.Facebook}"\nlocal info = spoof.app(bid)\nif info then\n    log("Spoofed: " .. info.name .. " iOS " .. info.version)\n    sleep(1)\n    appRun(bid)\n    sleep(3)\n    -- TODO: your automation here\nelse\n    log("Spoof failed (need paid license)")\nend',
        detail: "Spoof + launch",
        doc: "Random spoof device identity then launch target app.",
      },
    ];


    // ═══════════════════════════════════════════
    // Completion Provider
    // ═══════════════════════════════════════════
    monaco.languages.registerCompletionItemProvider("lua", {
      triggerCharacters: [".", "(", '"', "'"],
      provideCompletionItems: function (model, position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions = [];

        // API functions
        apiFunctions.forEach((fn, i) => {
          suggestions.push({
            label: fn.label,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: fn.insert,
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: fn.detail,
            documentation: { value: "```\n" + fn.sig + "\n```\n\n" + fn.doc },
            sortText: "0" + String(i).padStart(3, "0"),
            range,
          });
        });

        // Snippet templates
        snippetTemplates.forEach((tpl, i) => {
          // Extract filter text from label (after ⚡ )
          const filterText = tpl.label.replace(/^⚡\s*/, "");
          suggestions.push({
            label: tpl.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: tpl.insert,
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: tpl.detail,
            documentation: { value: tpl.doc },
            filterText: filterText,
            sortText: "1" + String(i).padStart(3, "0"),
            range,
          });
        });

        // Key constants
        ["KEY_HOME", "KEY_POWER", "KEY_VOLUME_UP", "KEY_VOLUME_DOWN"].forEach(
          (k) => {
            suggestions.push({
              label: k,
              kind: monaco.languages.CompletionItemKind.Constant,
              insertText: k,
              detail: "Key constant",
              sortText: "2" + k,
              range,
            });
          },
        );

        // ── User-defined functions from current editor ──
        const fullText = model.getValue();
        const funcRegex = /(?:local\s+)?function\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)/g;
        let match;
        const seen = new Set();
        while ((match = funcRegex.exec(fullText)) !== null) {
          const fname = match[1];
          const params = match[2].trim();
          if (seen.has(fname)) continue;
          seen.add(fname);
          // Extract comment above the function as doc
          const beforeFunc = fullText.substring(0, match.index);
          const lines = beforeFunc.split('\n');
          let docLines = [];
          for (let i = lines.length - 1; i >= 0; i--) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith('--')) {
              docLines.unshift(trimmed.replace(/^--\s?/, ''));
            } else if (trimmed === '') {
              if (docLines.length > 0) break;
            } else {
              break;
            }
          }
          const doc = docLines.length > 0 ? docLines.join('\n') : 'User-defined function';
          // Build snippet insert text
          const paramList = params ? params.split(',').map((p, idx) => `\${${idx + 1}:${p.trim()}}`).join(', ') : '';
          suggestions.push({
            label: fname,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: fname + '(' + paramList + ')',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: `${fname}(${params}) — script`,
            documentation: { value: '```lua\nfunction ' + fname + '(' + params + ')\n```\n\n' + doc },
            sortText: '00' + fname,
            range,
          });
        }

        // ── User-defined variables from current editor ──
        const varRegex = /(?:^|[\n;])\s*(?:local\s+)?([a-zA-Z_]\w*)\s*=/g;
        while ((match = varRegex.exec(fullText)) !== null) {
          const vname = match[1];
          if (seen.has(vname) || ['if', 'then', 'end', 'else', 'elseif', 'for', 'while', 'do', 'repeat', 'until', 'return', 'local', 'function', 'true', 'false', 'nil', 'and', 'or', 'not'].includes(vname)) continue;
          seen.add(vname);
          suggestions.push({
            label: vname,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: vname,
            detail: 'variable',
            sortText: '01' + vname,
            range,
          });
        }

        return { suggestions };
      },
    });

    // ═══════════════════════════════════════════
    // Hover Provider — show docs on hover
    // ═══════════════════════════════════════════
    monaco.languages.registerHoverProvider("python", {
      provideHover: function (model, position) {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        const fn = apiFunctions.find((f) => f.label === word.word);
        if (!fn) return null;
        return {
          range: new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn,
          ),
          contents: [
            { value: "```python\n" + fn.sig + "\n```" },
            { value: fn.doc },
          ],
        };
      },
    });

    // ═══════════════════════════════════════════
    // Signature Help — parameter hints on (
    // ═══════════════════════════════════════════
    monaco.languages.registerSignatureHelpProvider("python", {
      signatureHelpTriggerCharacters: ["(", ","],
      provideSignatureHelp: function (model, position) {
        // Walk back to find the function name
        const lineContent = model.getLineContent(position.lineNumber);
        const textBefore = lineContent.substring(0, position.column - 1);

        // Find the last unclosed (
        let depth = 0;
        let parenPos = -1;
        for (let i = textBefore.length - 1; i >= 0; i--) {
          if (textBefore[i] === ")") depth++;
          else if (textBefore[i] === "(") {
            if (depth === 0) {
              parenPos = i;
              break;
            }
            depth--;
          }
        }
        if (parenPos < 0) return null;

        // Extract function name before (
        const beforeParen = textBefore.substring(0, parenPos).trimEnd();
        const funcMatch = beforeParen.match(/(\w+)$/);
        if (!funcMatch) return null;

        const fn = apiFunctions.find((f) => f.label === funcMatch[1]);
        if (!fn || !fn.params.length) return null;

        // Count commas to determine active parameter
        const insideParen = textBefore.substring(parenPos + 1);
        let commaCount = 0;
        let d = 0;
        for (const ch of insideParen) {
          if (ch === "(") d++;
          else if (ch === ")") d--;
          else if (ch === "," && d === 0) commaCount++;
        }

        return {
          value: {
            signatures: [
              {
                label: fn.sig,
                documentation: fn.doc,
                parameters: fn.params.map((p) => ({
                  label: p.split(" — ")[0],
                  documentation: p,
                })),
              },
            ],
            activeSignature: 0,
            activeParameter: Math.min(commaCount, fn.params.length - 1),
          },
          dispose: () => {},
        };
      },
    });

    // Create the editor
    state.editor = monaco.editor.create(document.getElementById("codeEditor"), {
      value: defaultCode,
      language: "lua",
      theme: ideTheme === "dark" ? "icontrol-dark" : "vs",
      fontSize: 13,
      fontFamily:
        "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      fontLigatures: true,
      lineNumbers: "on",
      minimap: { enabled: true, scale: 1, size: "proportional" },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 4,
      insertSpaces: true,
      wordWrap: "off",
      renderWhitespace: "selection",
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      suggestOnTriggerCharacters: true,
      quickSuggestions: { other: "on", comments: false, strings: false },
      quickSuggestionsDelay: 10,
      wordBasedSuggestions: "off",
      suggest: {
        filterGraceful: true,
        snippetsPreventQuickSuggestions: false,
        localityBonus: true,
        shareSuggestSelections: true,
      },
      acceptSuggestionOnCommitCharacter: true,
      autoClosingBrackets: "always",
      autoClosingQuotes: "always",
      autoIndent: "full",
      formatOnPaste: true,
      formatOnType: true,
      smoothScrolling: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      padding: { top: 12, bottom: 12 },
      roundedSelection: true,
      renderLineHighlight: "all",
      occurrencesHighlight: "singleFile",
      folding: true,
      foldingHighlight: true,
      showFoldingControls: "mouseover",
      matchBrackets: "always",
      contextmenu: true,
      mouseWheelZoom: true,
    });

    // Ctrl+Enter → Run script
    state.editor.addAction({
      id: "run-script",
      label: "Run Script",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => {
        if (state.runningTaskId) stopScript();
        else runScript();
      },
    });

    // Auto-trigger suggest on typing (workaround for wordBasedSuggestions:off)
    let suggestTimer = null;
    state.editor.onDidChangeModelContent((e) => {
      if (suggestTimer) clearTimeout(suggestTimer);
      // Only trigger for insertions (typing), not deletions
      if (e.changes.some(c => c.text.length > 0 && /[a-zA-Z_]/.test(c.text))) {
        suggestTimer = setTimeout(() => {
          state.editor.trigger('auto', 'editor.action.triggerSuggest', {});
        }, 50);
      }
    });

    // Ctrl+S → Save
    state.editor.addAction({
      id: "save-script",
      label: "Save Script",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => {
        document.getElementById("saveModal").classList.add("visible");
        const inp = document.getElementById("scriptNameInput");
        if (!inp.value) { const d = new Date(); inp.value = `script_${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`; }
        setTimeout(() => { inp.focus(); inp.select(); }, 100);
      },
    });

    // Run & Stop buttons
    document.getElementById("runBtn")?.addEventListener("click", runScript);
    document.getElementById("stopBtn")?.addEventListener("click", stopScript);
    document.getElementById("newScriptBtn")?.addEventListener("click", () => {
      const defaultCode =
        document.getElementById("defaultCode")?.textContent?.trim() ||
        "-- New script\n";
      const d = new Date();
      const autoName = `script_${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}.lua`;
      openTab(autoName, defaultCode);
      document.getElementById("scriptNameInput").value = autoName;
      document.querySelector('.tab[data-tab="editor"]')?.click();
      appendLog("📝 New script created");
    });
    document.getElementById("saveBtn")?.addEventListener("click", () => {
      document.getElementById("saveModal").classList.add("visible");
      const inp = document.getElementById("scriptNameInput");
      if (!inp.value) { const d = new Date(); inp.value = `script_${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`; }
      setTimeout(() => { inp.focus(); inp.select(); }, 100);
    });

    // Track unsaved changes
    state._dirty = false;
    state._initDone = false;
    setTimeout(() => {
      state._initDone = true;
      state.editor.onDidChangeModelContent(() => {
        if (state._initDone) state._dirty = true;
      });
    }, 2000);

    // ═══ Gesture Recording ═══
    document.getElementById("recordBtn")?.addEventListener("click", () => {
      const btn = document.getElementById("recordBtn");
      if (state.recording) {
        // Stop recording — generate script
        state.recording = false;
        btn.textContent = "⏺";
        btn.style.background = "";
        btn.style.animation = "";
        btn.title = "Record Gestures";

        if (state.recordedGestures.length === 0) {
          appendLog("⏹️ Recording stopped — no gestures captured");
          return;
        }

        // Generate Python script from recorded gestures
        let code = "-- Recorded gestures\n";
        let lastTime = state.recordedGestures[0].time;

        for (const g of state.recordedGestures) {
          const delay = (g.time - lastTime) / 1000;
          if (delay > 0.1) {
            code += `sleep(${delay.toFixed(1)})\n`;
          }
          lastTime = g.time;

          if (g.type === "tap") {
            code += `tap(${g.x}, ${g.y})\n`;
          } else if (g.type === "swipe") {
            code += `swipe(${g.x1}, ${g.y1}, ${g.x2}, ${g.y2}, ${g.duration.toFixed(1)})\n`;
          } else if (g.type === "long_press") {
            code += `long_press(${g.x}, ${g.y}, ${g.duration.toFixed(1)})\n`;
          }
        }

        insertAtCursor(code);
        document.querySelector('.tab[data-tab="editor"]')?.click();
        appendLog(
          `⏹️ Recording stopped — ${state.recordedGestures.length} gestures → script inserted`,
        );
        state.recordedGestures = [];
      } else {
        // Start recording
        state.recording = true;
        state.recordedGestures = [];
        btn.textContent = "⏹";
        btn.style.background = "#e53e3e";
        btn.style.animation = "pulse 1s infinite";
        btn.title = "Stop Recording";
        appendLog("🔴 Recording gestures... Tap/Swipe/Long press on screen");
      }
    });
  });
}

// Helper: get editor value (works before Monaco loads too)
function getEditorValue() {
  if (state.editor) return state.editor.getValue();
  return "";
}

// Helper: set editor value
function setEditorValue(code) {
  if (state.editor) {
    state.editor.setValue(code);
    state._dirty = false; // programmatic change, not user edit
  }
}

// ═══════════════════════════════════════════
// Multi-Tab Editor (Chrome-style)
// ═══════════════════════════════════════════

function generateTabId() {
  return 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

function openTab(name, code) {
  // If file already open, switch to it
  const existing = state.openTabs.find(t => t.name === name);
  if (existing) {
    switchTab(existing.id);
    return;
  }
  // Save current tab's view state before switching
  saveCurrentTabState();
  // Create Monaco model for this tab
  const model = monaco.editor.createModel(code, 'lua');
  const tab = { id: generateTabId(), name, code, dirty: false, viewState: null, model };
  state.openTabs.push(tab);
  state.activeTabId = tab.id;
  state.currentFileName = name;
  if (state.editor) {
    state.editor.setModel(model);
  }
  state._dirty = false;
  renderEditorTabs();
}

function switchTab(tabId) {
  if (state.activeTabId === tabId) return;
  // Save current view state (scroll, cursor, selections)
  saveCurrentTabState();
  // Switch
  const tab = state.openTabs.find(t => t.id === tabId);
  if (!tab) return;
  state.activeTabId = tabId;
  state.currentFileName = tab.name;
  if (state.editor) {
    state.editor.setModel(tab.model);
    // Restore scroll position, cursor, selections
    if (tab.viewState) {
      state.editor.restoreViewState(tab.viewState);
    }
    state.editor.focus();
  }
  state._dirty = tab.dirty;
  document.getElementById('scriptNameInput').value = tab.name || '';
  renderEditorTabs();
}

function closeTab(tabId, evt) {
  if (evt) evt.stopPropagation();
  const idx = state.openTabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;
  // Save current state before closing
  if (state.activeTabId === tabId) saveCurrentTabState();
  const closedTab = state.openTabs[idx];
  // Dispose the Monaco model to free memory
  if (closedTab.model) closedTab.model.dispose();
  // Remove tab
  state.openTabs.splice(idx, 1);
  // If closing active tab, switch to neighbor
  if (state.activeTabId === tabId) {
    if (state.openTabs.length > 0) {
      const newIdx = Math.min(idx, state.openTabs.length - 1);
      const newTab = state.openTabs[newIdx];
      state.activeTabId = newTab.id;
      state.currentFileName = newTab.name;
      if (state.editor) {
        state.editor.setModel(newTab.model);
        if (newTab.viewState) state.editor.restoreViewState(newTab.viewState);
        state.editor.focus();
      }
      state._dirty = newTab.dirty;
      document.getElementById('scriptNameInput').value = newTab.name || '';
    } else {
      // No tabs left — show empty editor
      state.activeTabId = null;
      state.currentFileName = null;
      if (state.editor) state.editor.setModel(monaco.editor.createModel('', 'lua'));
      state._dirty = false;
      document.getElementById('scriptNameInput').value = '';
    }
  }
  renderEditorTabs();
}

function saveCurrentTabState() {
  if (!state.activeTabId) return;
  const tab = state.openTabs.find(t => t.id === state.activeTabId);
  if (tab && state.editor) {
    tab.code = state.editor.getValue();
    tab.dirty = state._dirty;
    // Save scroll position, cursor, selections
    tab.viewState = state.editor.saveViewState();
  }
}

function renderEditorTabs() {
  const bar = document.getElementById('editorTabBar');
  if (!bar) return;
  if (state.openTabs.length === 0) {
    bar.innerHTML = '<div style="padding:5px 12px; font-size:11px; color:var(--text-secondary); opacity:0.5;">No files open</div>';
    return;
  }
  bar.innerHTML = state.openTabs.map(t => {
    const isActive = t.id === state.activeTabId;
    const isRunning = state.runningFileName === t.name;
    const icon = isRunning ? 'flame' : 'file-code';
    const iconColor = isRunning ? 'color:#f97316;' : 'opacity:0.4;';
    return `<div class="editor-tab ${isActive ? 'active' : ''}" onclick="switchTab('${t.id}')">
      <i data-lucide="${icon}" style="width:12px;height:12px;flex-shrink:0;${iconColor}"></i>
      <span class="tab-name">${t.name}</span>
      <span class="tab-dot ${t.dirty ? 'dirty' : ''}"></span>
      <span class="tab-close" onclick="closeTab('${t.id}', event)">×</span>
    </div>`;
  }).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.switchTab = switchTab;
window.closeTab = closeTab;

// Helper: insert text at cursor
function insertAtCursor(text) {
  if (state.editor) {
    const position = state.editor.getPosition();
    state.editor.executeEdits("insert", [
      {
        range: new monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column,
        ),
        text: text + "\n",
      },
    ]);
    state.editor.focus();
  }
}

// Unused now but keep for compatibility
function updateLineNumbers() {}
function syncScroll() {}

// ═══════════════════════════════════════════
// Script Execution
// ═══════════════════════════════════════════

async function checkRunningScript() {
  try {
    const res = await fetch(`${API}/api/scripts/running`);
    const data = await res.json();
    if (data.running) {
      state.runningTaskId = data.taskId || '__quickpanel__';
      state.runningFileName = data.scriptName || null;
      state.lastLogIndex = 0;
      document.getElementById("runBtn").style.display = "none";
      document.getElementById("stopBtn").style.display = "flex";
      const source = data.source === 'quickpanel' ? ' (Quick Panel)' : '';
      appendLog(`🔄 Script "${data.scriptName || 'unknown'}" is running${source}`);
      if (data.taskId) {
        state.logPollInterval = setInterval(() => pollLogs(data.taskId), 300);
      }
    }
  } catch (e) {
    // Silent — server not ready yet
  }
}

async function runScript() {
  if (state.runningTaskId) {
    appendLog(`⚠️ Script "${state.runningFileName || 'unknown'}" is still running. Stop it first!`, "error");
    return;
  }
  const code = getEditorValue();
  if (!code.trim()) {
    appendLog("⚠️ No code to run", "error");
    return;
  }

  // Auto-open console panel when running
  if (typeof toggleConsolePanel === "function") toggleConsolePanel(true);

  // Auto-close Helper & Functions panels — remember state for restore on stop
  const apiPanel = document.getElementById("apiPanel");
  const helperModal = document.getElementById("helperModal");
  state._panelStateBeforeRun = {
    apiWasOpen: apiPanel && apiPanel.dataset.collapsed !== "true",
    helperWasOpen: helperModal && helperModal.classList.contains("helper-open"),
  };
  if (state._panelStateBeforeRun.apiWasOpen) toggleApiPanel();
  if (state._panelStateBeforeRun.helperWasOpen) {
    const closeBtn = document.getElementById("helperCloseBtn");
    if (closeBtn) closeBtn.click();
  }

  // If dirty, save first
  if (state._dirty) {
    if (state.currentFileName) {
      // Already has a name → auto-save silently, then run
      try {
        const res = await fetch(`${API}/api/scripts/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: state.currentFileName, code }),
        });
        const data = await res.json();
        if (data.success) {
          state._dirty = false;
          appendLog(`💾 Auto-saved: ${state.currentFileName}`, "success");
        }
      } catch (e) {
        appendLog("⚠️ Auto-save failed: " + e.message, "warn");
      }
    } else {
      // New file → prompt for name
      state._runAfterSave = true;
      document.getElementById("saveModal").classList.add("visible");
      const inp = document.getElementById("scriptNameInput");
      if (!inp.value) { const d = new Date(); inp.value = `script_${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`; }
      setTimeout(() => { inp.focus(); inp.select(); }, 100);
      appendLog("💾 Đặt tên file trước khi chạy...", "info");
      return;
    }
  }

  // Editor is Lua-only — send code directly
  let luaCode = code;

  const udid =
    state.currentDevice || document.getElementById("deviceSelect").value;

  try {
    // If current file is .lue, run by filename
    const isLue = state.currentFileName && state.currentFileName.endsWith('.lue');
    const bodyObj = isLue
      ? { code: '-- encrypted', udid, scriptName: state.currentFileName, scriptFile: state.currentFileName }
      : { code: luaCode, udid, scriptName: state.currentFileName || '' };

    // If .lue needs password, ask first
    if (isLue && state.currentFileNeedsPassword) {
      const pw = await askPassword(state.currentFileName);
      if (pw === null) return; // cancelled
      bodyObj.password = pw;
    }

    const res = await fetch(`${API}/api/scripts/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
    });
    const data = await res.json();

    if (data.success) {
      state.runningTaskId = data.taskId;
      state.lastLogIndex = 0;
      state.runningFileName = state.currentFileName || null;

      document.getElementById("runBtn").style.display = "none";
      document.getElementById("stopBtn").style.display = "flex";

      appendLog(`▶️ Script started (task: ${data.taskId})`);

      loadScriptFiles();
      state.logPollInterval = setInterval(() => pollLogs(data.taskId), 300);
      if (window._consoleSetFast) window._consoleSetFast();
    } else {
      if (data.error === 'password_required') {
        const pw = await askPassword(state.currentFileName);
        if (pw !== null) {
          bodyObj.password = pw;
          const retry = await fetch(`${API}/api/scripts/run`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyObj),
          });
          const retryData = await retry.json();
          if (retryData.success) {
            state.runningTaskId = retryData.taskId;
            state.lastLogIndex = 0;
            state.runningFileName = state.currentFileName || null;
            document.getElementById("runBtn").style.display = "none";
            document.getElementById("stopBtn").style.display = "flex";
            appendLog(`▶️ Script started (task: ${retryData.taskId})`);
            loadScriptFiles();
            state.logPollInterval = setInterval(() => pollLogs(retryData.taskId), 300);
            return;
          }
          appendLog("❌ " + (retryData.error || "Wrong password"), "error");
        }
      } else {
        appendLog("❌ " + (data.detail || data.error || "Failed to start"), "error");
      }
    }
  } catch (e) {
    appendLog("❌ " + e.message, "error");
  }
}

async function runFileScript(fileName) {
  if (state.runningTaskId) {
    appendLog(`⚠️ Script "${state.runningFileName || 'unknown'}" is still running. Stop it first!`, "error");
    return;
  }

  // Auto-open console, auto-close Helper & Functions panels
  if (typeof toggleConsolePanel === "function") toggleConsolePanel(true);
  const apiPanel = document.getElementById("apiPanel");
  const helperModal = document.getElementById("helperModal");
  state._panelStateBeforeRun = {
    apiWasOpen: apiPanel && apiPanel.dataset.collapsed !== "true",
    helperWasOpen: helperModal && helperModal.classList.contains("helper-open"),
  };
  if (state._panelStateBeforeRun.apiWasOpen) toggleApiPanel();
  if (state._panelStateBeforeRun.helperWasOpen) {
    const closeBtn = document.getElementById("helperCloseBtn");
    if (closeBtn) closeBtn.click();
  }

  try {
    const isLue = fileName.endsWith('.lue');
    const res = await fetch(`${API}/api/scripts/load?name=${encodeURIComponent(fileName)}`);
    const data = await res.json();
    if (!data.success) {
      appendLog(`❌ Failed to load ${fileName}`, "error");
      return;
    }
    // Set as current file — open in tab
    state.currentFileName = fileName;
    state.runningFileName = fileName;
    state.currentFileNeedsPassword = data.needsPassword || false;
    openTab(fileName, data.code);
    document.getElementById("scriptNameInput").value = fileName;
    if (data.encrypted) {
      window._monacoEditor?.updateOptions?.({ readOnly: true });
    }

    // Build run request
    const udid = state.currentDevice || document.getElementById("deviceSelect").value;
    let bodyObj;
    if (isLue) {
      bodyObj = { code: '-- encrypted', udid, scriptName: fileName, scriptFile: fileName };
      // Ask for password if needed
      if (data.needsPassword) {
        const pw = await askPassword(fileName);
        if (pw === null) return;
        bodyObj.password = pw;
      }
    } else {
      bodyObj = { code: data.code, udid, scriptName: fileName };
    }

    const runRes = await fetch(`${API}/api/scripts/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
    });
    const runData = await runRes.json();
    if (runData.success) {
      state.runningTaskId = runData.taskId;
      state.lastLogIndex = 0;
      document.getElementById("runBtn").style.display = "none";
      document.getElementById("stopBtn").style.display = "flex";
      appendLog(`▶️ Running: ${fileName} (task: ${runData.taskId})`);
      loadScriptFiles();
      // SSE handles log streaming — just poll status
      state.logPollInterval = setInterval(() => pollLogs(runData.taskId), 300);
    } else {
      appendLog("❌ " + (runData.detail || runData.error || "Failed to start"), "error");
    }
  } catch (e) {
    appendLog("❌ " + e.message, "error");
  }
}

async function stopScript() {
  try {
    await fetch(`${API}/api/scripts/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: state.runningTaskId }),
    });
    appendLog("⏹️ Stop signal sent");
    // Auto-collapse console after 2s delay, restore panels
    setTimeout(() => {
      if (typeof toggleConsolePanel === "function") toggleConsolePanel(false);
      // Restore Helper & Functions panels to pre-run state
      if (state._panelStateBeforeRun) {
        if (state._panelStateBeforeRun.apiWasOpen) {
          const ap = document.getElementById("apiPanel");
          if (ap && ap.dataset.collapsed === "true") toggleApiPanel();
        }
        if (state._panelStateBeforeRun.helperWasOpen) {
          const toggle = document.getElementById("helperToggle");
          if (toggle) toggle.click();
        }
        state._panelStateBeforeRun = null;
      }
    }, 2000);
  } catch (e) {
    appendLog("❌ " + e.message, "error");
  }
}

async function encryptScript(fileName) {
  if (!fileName) {
    fileName = state.currentFileName;
  }
  if (!fileName || !fileName.endsWith('.lua')) {
    appendLog("⚠️ Can only encrypt .lua files", "error");
    return;
  }

  // Show encrypt modal
  document.getElementById('encryptFileName').textContent = '📄 ' + fileName;
  document.getElementById('encryptPasswordInput').value = '';
  document.getElementById('encryptModal').classList.add('visible');
  document.getElementById('encryptPasswordInput').focus();

  // Wait for confirm
  return new Promise((resolve) => {
    const btn = document.getElementById('confirmEncryptBtn');
    const handler = async () => {
      btn.removeEventListener('click', handler);
      document.getElementById('encryptModal').classList.remove('visible');
      const password = document.getElementById('encryptPasswordInput').value || null;

      try {
        const res = await fetch(`${API}/api/scripts/encrypt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fileName, password }),
        });
        const data = await res.json();
        if (data.success) {
          const pwInfo = data.hasPassword ? ' (password-protected)' : ' (no password)';
          appendLog(`🔒 Encrypted: ${fileName} → ${data.name}${pwInfo}`, "success");
          loadScriptFiles();
        } else {
          appendLog("❌ Encrypt failed: " + (data.error || "Unknown error"), "error");
        }
      } catch (e) {
        appendLog("❌ Encrypt failed: " + e.message, "error");
      }
      resolve();
    };
    btn.addEventListener('click', handler);
  });
}
window.encryptScript = encryptScript;

// ── Password Modal Helper ──
function askPassword(fileName) {
  return new Promise((resolve) => {
    document.getElementById('passwordFileName').textContent = '🔒 ' + (fileName || 'Encrypted Script');
    document.getElementById('runPasswordInput').value = '';
    document.getElementById('passwordModal').classList.add('visible');
    document.getElementById('runPasswordInput').focus();
    window._passwordResolve = resolve;

    const btn = document.getElementById('confirmPasswordBtn');
    const input = document.getElementById('runPasswordInput');
    const handler = () => {
      btn.removeEventListener('click', handler);
      input.removeEventListener('keydown', keyHandler);
      document.getElementById('passwordModal').classList.remove('visible');
      window._passwordResolve = null;
      resolve(document.getElementById('runPasswordInput').value || '');
    };
    const keyHandler = (e) => {
      if (e.key === 'Enter') handler();
    };
    btn.addEventListener('click', handler);
    input.addEventListener('keydown', keyHandler);
  });
}

async function pollLogs(taskId) {
  try {
    const res = await fetch(`${API}/api/scripts/${taskId}/status`);
    const data = await res.json();

    if (data.success) {
      if (data.status !== "running") {
        clearInterval(state.logPollInterval);
        state.runningTaskId = null;
        state.runningFileName = null;
        document.getElementById("runBtn").style.display = "flex";
        document.getElementById("stopBtn").style.display = "none";
        loadScriptFiles();
        if (window._consoleSetSlow) window._consoleSetSlow();

        // ── Display completion logs (errors, timing) from status endpoint ──
        // These are NOT in the console.log file, so the continuous poll misses them.
        // Wait 300ms first to let the file-based poll catch up before showing final lines.
        if (data.logs && data.logs.length > 0) {
          setTimeout(() => {
            for (const logEntry of data.logs) {
              const msg = logEntry.message || '';
              // Only show lines not already visible (error ❌ and timing ⏱️)
              if (msg.includes('❌') || msg.includes('⏱️') || msg.includes('✅ Done')) {
                appendLog(msg);
              }
            }
          }, 400);
        }
      }
    }
  } catch (e) {
    // Silent fail for polling
  }
}

// ═══════════════════════════════════════════
// Console
// ═══════════════════════════════════════════

function initConsole() {
  document.getElementById("clearConsole")?.addEventListener("click", () => {
    const output = document.getElementById("consoleOutput");
    output.innerHTML = "";
    state._consoleLogCount = 0;
    state._consoleTotalLines = 0;  // ← BUGFIX: reset offset so next poll fetches from start
    // Clear shared log file on daemon
    fetch(`${API}/api/console/clear`, { method: 'POST' }).catch(() => {});
    appendLog("🗑️ Console cleared");
  });

  // ── SSE: Server-Sent Events for realtime console streaming ──
  state._consoleLogCount = 0;
  state._consoleRunId = 0;
  let _ssePending = [];
  let _sseRafScheduled = false;

  function _sseFlush() {
    _sseRafScheduled = false;
    if (_ssePending.length === 0) return;

    const output = document.getElementById("consoleOutput");
    const welcome = output.querySelector(".console-welcome");
    if (welcome) welcome.remove();

    const frag = document.createDocumentFragment();
    const now = new Date();
    const ts = `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}:${now.getSeconds().toString().padStart(2,"0")}`;

    for (const msg of _ssePending) {
      if (typeof msg === "string" && msg.includes("__TOAST__|")) {
        const parts = msg.split("__TOAST__|")[1].split("|");
        showScreenToast(parts[0] || "Toast", parseFloat(parts[1]) || 2.0);
        continue;
      }

      const line = document.createElement("div");
      let type = "";
      if (msg.includes("❌") || msg.includes("Error")) type = "error";
      else if (msg.includes("✅")) type = "success";
      else if (msg.includes("▶️") || msg.includes("📋")) type = "info";
      line.className = `console-line ${type}`;

      let displayMsg = escapeHtml(msg);
      const emojiMap = {
        '📱':'smartphone','📐':'ruler','📺':'monitor',
        '✅':'check-circle','❌':'x-circle','⚠️':'alert-triangle',
        '▶️':'play','⏹️':'square','🔄':'refresh-cw',
        '⬇️':'arrow-down-to-line','💾':'save','🗑️':'trash-2',
        '📂':'folder-open','📋':'clipboard','📸':'camera',
        '🔧':'wrench','⏱️':'timer','✏️':'pencil',
        '🎯':'crosshair','⌨️':'keyboard','🔥':'flame',
        '🔍':'search','🎨':'palette','💡':'lightbulb',
      };
      for (const [emoji, icon] of Object.entries(emojiMap)) {
        if (displayMsg.includes(emoji)) {
          displayMsg = displayMsg.replace(emoji, `<i data-lucide="${icon}" style="width:13px;height:13px;display:inline-block;vertical-align:-2px;margin-right:2px;"></i>`);
        }
      }
      line.innerHTML = `<span class="timestamp">${ts}</span>${displayMsg}`;
      frag.appendChild(line);
    }

    const batchSize = _ssePending.length;
    _ssePending = [];
    output.appendChild(frag);

    // Cap DOM to prevent memory growth
    const MAX = 300;
    const allLines = output.querySelectorAll(".console-line");
    if (allLines.length > MAX) {
      const toRemove = allLines.length - MAX;
      for (let i = 0; i < toRemove; i++) allLines[i].remove();
    }

    // Single Lucide init for entire batch
    if (typeof lucide !== "undefined") lucide.createIcons({ attrs: {}, nameAttr: "data-lucide" });
    output.scrollTop = output.scrollHeight;

    // Badge if collapsed
    const panel = document.getElementById("consolePanel");
    if (panel && panel.dataset.collapsed === "true") {
      const badge = document.getElementById("consoleBadge");
      if (badge) {
        const count = parseInt(badge.textContent || "0") + batchSize;
        badge.textContent = count > 99 ? "99+" : count;
        badge.style.display = "inline";
      }
    }
  }

  function _sseSchedule(msg) {
    _ssePending.push(msg);
    if (!_sseRafScheduled) {
      _sseRafScheduled = true;
      requestAnimationFrame(_sseFlush);
    }
  }

  // ── Simple HTTP polling for console logs ──
  // Polls /api/console/output every 200ms (reads from in-memory array)
  // No SSE, no EventSource, no connection issues
  let _pollIndex = 0;
  let _pollRunId = 0;
  let _polling = false;

  async function _pollConsole() {
    if (_polling) return;
    _polling = true;
    try {
      const res = await fetch(`${API}/api/console/output?from=${_pollIndex}`);
      const data = await res.json();
      if (data.success) {
        // Detect new run → clear console
        if (data.runId !== undefined && data.runId !== _pollRunId) {
          _pollRunId = data.runId;
          _pollIndex = 0;
          // Re-fetch from index 0 for new run
          _polling = false;
          _pollConsole();
          return;
        }
        if (data.logs && data.logs.length > 0) {
          for (const entry of data.logs) {
            _sseSchedule(entry.message);
          }
        }
        if (data.totalLines !== undefined) {
          _pollIndex = data.totalLines;
        }
      }
    } catch (_) {}
    _polling = false;
  }

  setInterval(_pollConsole, 200);

  // Expose for runScript/stopScript compatibility
  window._consoleSetFast = () => {};
  window._consoleSetSlow = () => {};

  // Poll running status every 2s — sync file list & buttons with daemon
  setInterval(async () => {
    try {
      const res = await fetch(`${API}/api/scripts/running`);
      const data = await res.json();
      const wasRunning = !!state.runningTaskId;
      const oldName = state.runningFileName;
      if (data.running) {
        const newName = data.scriptName || null;
        if (!wasRunning || oldName !== newName) {
          state.runningFileName = newName;
          state.runningTaskId = data.taskId || '__quickpanel__';
          document.getElementById("runBtn").style.display = "none";
          document.getElementById("stopBtn").style.display = "flex";
          loadScriptFiles();
        }
      } else if (wasRunning) {
        state.runningFileName = null;
        state.runningTaskId = null;
        document.getElementById("runBtn").style.display = "flex";
        document.getElementById("stopBtn").style.display = "none";
        loadScriptFiles();
      }
    } catch (e) { /* silent */ }
  }, 2000);

  // Refresh file list every 5s for realtime updates (recordings from Quick Panel)
  setInterval(() => {
    const filesTab = document.querySelector('.tab[data-tab="files"]');
    if (filesTab && filesTab.classList.contains('active')) {
      loadScriptFiles();
    }
  }, 5000);

  // Quick command
  const input = document.getElementById("quickCommand");
  const quickRunBtn = document.getElementById("quickRunBtn");

  const runQuick = () => {
    const cmd = input.value.trim();
    if (!cmd) return;

    // Parse simple commands
    let code = cmd;
    const match = cmd.match(/^(tap|swipe|sleep|log)\s+(.+)$/i);
    if (match) {
      const fn = match[1].toLowerCase();
      const args = match[2];
      code = `${fn}(${args})`;
    }

    // Run as single-line script
    fetch(`${API}/api/scripts/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        udid:
          state.currentDevice || document.getElementById("deviceSelect").value,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          appendLog(`⚡ ${code}`);
          // Poll once for result
          setTimeout(() => pollLogs(data.taskId), 500);
        } else {
          appendLog("❌ " + (data.detail || "Error"), "error");
        }
      });

    input.value = "";
  };

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runQuick();
  });
  quickRunBtn?.addEventListener("click", runQuick);
}

function appendLog(message, type = "") {
  const output = document.getElementById("consoleOutput");

  // ═══ Toast overlay on iPhone screen ═══
  if (typeof message === "string" && message.includes("__TOAST__|")) {
    const parts = message.split("__TOAST__|")[1].split("|");
    const toastMsg = parts[0] || "Toast";
    const toastDelay = parseFloat(parts[1]) || 2.0;
    showScreenToast(toastMsg, toastDelay);
    return; // Don't show in console
  }

  // Remove welcome message
  const welcome = output.querySelector(".console-welcome");
  if (welcome) welcome.remove();

  const line = document.createElement("div");
  line.className = `console-line ${type}`;

  const now = new Date();
  const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

  // Detect type from message
  if (message.includes("❌") || message.includes("Error")) type = "error";
  else if (message.includes("✅")) type = "success";
  else if (message.includes("▶️") || message.includes("📋")) type = "info";

  line.className = `console-line ${type}`;

  // Replace emojis with Lucide inline SVG icons
  let displayMsg = escapeHtml(message);
  const emojiMap = {
    '📱': 'smartphone', '📐': 'ruler', '📺': 'monitor',
    '✅': 'check-circle', '❌': 'x-circle', '⚠️': 'alert-triangle',
    '▶️': 'play', '⏹️': 'square', '🔄': 'refresh-cw',
    '⬇️': 'arrow-down-to-line', '💾': 'save', '🗑️': 'trash-2',
    '📂': 'folder-open', '📋': 'clipboard', '📸': 'camera',
    '🔧': 'wrench', '⏱️': 'timer', '✏️': 'pencil',
    '🎯': 'crosshair', '⌨️': 'keyboard', '🔥': 'flame',
    '🔍': 'search', '🎨': 'palette', '💡': 'lightbulb',
  };
  for (const [emoji, icon] of Object.entries(emojiMap)) {
    if (displayMsg.includes(emoji)) {
      displayMsg = displayMsg.replace(emoji, `<i data-lucide="${icon}" style="width:13px;height:13px;display:inline-block;vertical-align:-2px;margin-right:2px;"></i>`);
    }
  }

  line.innerHTML = `<span class="timestamp">${timestamp}</span>${displayMsg}`;

  output.appendChild(line);

  // ── Cap DOM to MAX_CONSOLE_LINES to prevent browser freeze on heavy logging ──
  const MAX_CONSOLE_LINES = 500;
  const allLines = output.querySelectorAll('.console-line');
  if (allLines.length > MAX_CONSOLE_LINES) {
    // Remove oldest lines in batch (remove 50 at a time, not 1 by 1)
    const toRemove = allLines.length - MAX_CONSOLE_LINES;
    for (let i = 0; i < toRemove; i++) allLines[i].remove();
  }

  // Activate Lucide icons in the new log line
  if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: {}, nameAttr: 'data-lucide' });
  output.scrollTop = output.scrollHeight;

  // Update badge if console panel is collapsed
  const consolePanel = document.getElementById("consolePanel");
  if (consolePanel && consolePanel.dataset.collapsed === "true") {
    const badge = document.getElementById("consoleBadge");
    if (badge) {
      const count = parseInt(badge.textContent || "0") + 1;
      badge.textContent = count > 99 ? "99+" : count;
      badge.style.display = "inline";
    }
  }
}

function showScreenToast(message, delay = 2.0) {
  const wrapper = document.getElementById("screenWrapper");
  if (!wrapper) return;

  // Remove existing toast
  wrapper.querySelectorAll(".screen-toast").forEach((t) => t.remove());

  const toast = document.createElement("div");
  toast.className = "screen-toast";
  toast.textContent = message;
  toast.style.cssText = `
        position: absolute;
        top: 40px;
        left: 50%;
        transform: translateX(-50%) translateY(-20px);
        background: rgba(30, 30, 30, 0.92);
        color: white;
        padding: 10px 20px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        letter-spacing: 0.3px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.4);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        z-index: 20;
        pointer-events: none;
        opacity: 0;
        transition: all 0.3s ease-out;
        max-width: 85%;
        text-align: center;
        white-space: nowrap;
    `;
  wrapper.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(0)";
  });

  // Animate out and remove
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(-10px)";
    setTimeout(() => toast.remove(), 300);
  }, delay * 1000);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ═══════════════════════════════════════════
// Keyboard Shortcuts
// ═══════════════════════════════════════════

function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Ctrl/Cmd + Enter → Run
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (state.runningTaskId) {
        stopScript();
      } else {
        runScript();
      }
    }

    // Ctrl/Cmd + S → Save
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      if (state.currentFileName) {
        // Editing existing file → overwrite
        saveScriptAs(state.currentFileName);
      } else {
        // New file → auto-generate timestamp name
        const now = new Date();
        const ts =
          now.getFullYear().toString() +
          String(now.getMonth() + 1).padStart(2, "0") +
          String(now.getDate()).padStart(2, "0") +
          "_" +
          String(now.getHours()).padStart(2, "0") +
          String(now.getMinutes()).padStart(2, "0") +
          String(now.getSeconds()).padStart(2, "0");
        const autoName = `script_${ts}.py`;
        saveScriptAs(autoName);
      }
    }
  });
}

// ═══════════════════════════════════════════
// Modals
// ═══════════════════════════════════════════

function initModals() {
  // Device Info Modal
  document
    .getElementById("deviceInfoBtn")
    ?.addEventListener("click", showDeviceInfo);
  document.getElementById("closeDeviceInfo")?.addEventListener("click", () => {
    document.getElementById("deviceInfoModal").classList.remove("visible");
  });

  // Save Modal
  document.getElementById("closeSaveModal")?.addEventListener("click", () => {
    document.getElementById("saveModal").classList.remove("visible");
  });
  document
    .getElementById("confirmSaveBtn")
    ?.addEventListener("click", saveScript);

  // Close modals on overlay click
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("visible");
    });
  });
}

async function showDeviceInfo() {
  const udid =
    state.currentDevice || document.getElementById("deviceSelect").value;
  if (!udid) {
    appendLog("⚠️ No device connected", "error");
    return;
  }

  const modal = document.getElementById("deviceInfoModal");
  const body = document.getElementById("deviceInfoBody");
  body.innerHTML = '<p style="color: var(--text-dim)">Loading...</p>';
  modal.classList.add("visible");

  try {
    const res = await fetch(`${API}/screen_info`);
    const data = await res.json();
    if (data.success) {
      const info = data.info;
      body.innerHTML = `
                <div class="device-info-grid">
                    ${Object.entries(info)
                      .map(
                        ([key, val]) => `
                        <div class="device-info-item">
                            <div class="label">${key}</div>
                            <div class="value">${val || "—"}</div>
                        </div>
                    `,
                      )
                      .join("")}
                </div>
            `;
    }
  } catch (e) {
    body.innerHTML = `<p style="color:var(--red)">Failed to load: ${e.message}</p>`;
  }
}

async function saveScript() {
  const folder = document.getElementById("saveFolderSelect")?.value || "";
  const baseName = document.getElementById("scriptNameInput").value || "untitled.lua";
  const name = folder ? `${folder}/${baseName}` : baseName;
  const code = getEditorValue();

  try {
    const res = await fetch(`${API}/api/scripts/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code }),
    });
    const data = await res.json();
    if (data.success) {
      state.currentFileName = data.name || name;
      state._dirty = false;
      appendLog(`💾 Saved: ${state.currentFileName}`, "success");
      document.getElementById("saveModal").classList.remove("visible");
      loadScriptFiles();
      // Auto-run if save was triggered by Run button
      if (state._runAfterSave) {
        state._runAfterSave = false;
        runScript();
      }
    }
  } catch (e) {
    appendLog("❌ Save failed: " + e.message, "error");
  }
}

// Populate folder dropdown when save modal opens
function populateFolderPicker() {
  const sel = document.getElementById("saveFolderSelect");
  if (!sel) return;
  const folders = state._folders || [];
  sel.innerHTML = '<option value="">/ (root)</option>' +
    folders.map(f => `<option value="${f}">${f}</option>`).join('');
  // Auto-select folder if editing a file in a subfolder
  if (state.currentFileName && state.currentFileName.includes('/')) {
    const folder = state.currentFileName.substring(0, state.currentFileName.lastIndexOf('/'));
    sel.value = folder;
    // Show only filename in input
    document.getElementById("scriptNameInput").value = state.currentFileName.split('/').pop();
  }
}

// Hook into save modal open — observe class changes
const _saveModalEl = document.getElementById("saveModal");
if (_saveModalEl) {
  const _saveMo = new MutationObserver(() => {
    if (_saveModalEl.classList.contains("visible")) populateFolderPicker();
  });
  _saveMo.observe(_saveModalEl, { attributes: true, attributeFilter: ["class"] });
}

async function saveScriptAs(fileName) {
  const code = getEditorValue();
  try {
    const res = await fetch(`${API}/api/scripts/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fileName, code }),
    });
    const data = await res.json();
    if (data.success) {
      state.currentFileName = data.name || fileName;
      state._dirty = false;
      document.getElementById("scriptNameInput").value = state.currentFileName;
      appendLog(`💾 Saved: ${state.currentFileName}`, "success");
    }
  } catch (e) {
    appendLog("❌ Save failed: " + e.message, "error");
  }
}

// ═══════════════════════════════════════════
// Script Files
// ═══════════════════════════════════════════

// Track expanded folders
if (!window._expandedFolders) window._expandedFolders = new Set();

function renderFileItem(f, indent = 0) {
  if (f.type === 'folder') {
    const expanded = window._expandedFolders.has(f.path);
    const childrenHtml = expanded ? f.children
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return (b.modified || 0) - (a.modified || 0);
      })
      .map(c => renderFileItem(c, indent + 1)).join('') : '';
    // Wrap children in a visual group with left border
    const childWrapper = expanded && childrenHtml ? `
      <div class="folder-children" style="margin-left:${12 + indent * 12}px; padding-left:12px; border-left:2px solid rgba(96,165,250,0.25); margin-bottom:6px;">
        ${childrenHtml}
      </div>` : '';
    return `
      <div class="folder-item" style="margin-left:${indent * 12}px" onclick="toggleFolder('${f.path}')">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
          <i data-lucide="${expanded ? 'folder-open' : 'folder'}" style="width:16px;height:16px;flex-shrink:0;color:#60a5fa;"></i>
          <div style="min-width:0;">
            <div class="file-name" style="font-weight:600;">${f.name}</div>
            <div class="file-meta">${f.count || 0} items</div>
          </div>
        </div>
        <div class="file-actions">
          <i data-lucide="${expanded ? 'chevron-down' : 'chevron-right'}" style="width:14px;height:14px;opacity:0.4;"></i>
          <button class="file-action-btn file-delete-btn" onclick="event.stopPropagation(); deleteFile('${f.path}')" title="Delete Folder"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
        </div>
      </div>
      ${childWrapper}`;
  }
  // File
  const date = new Date(f.modified * 1000);
  const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  const isRunning = state.runningFileName === f.path;
  const isTxt = f.name.endsWith('.txt');
  const isLua = f.name.endsWith('.lua');
  const isLue = f.name.endsWith('.lue') || f.encrypted;
  const isLockable = isTxt || isLua || isLue;
  const isLocked = isLockable && f.locked === true;
  const fileIcon = isLue ? 'file-lock' : (isTxt ? 'file-text' : (isRunning ? 'flame' : 'file-code'));
  const iconStyle = isLue ? 'color:#f59e0b;' : (isRunning ? 'color:#f97316;' : (isTxt ? 'color:#94a3b8;' : 'opacity:0.5;'));
  const playStopBtn = isTxt ? '' : (isRunning
    ? `<button class="file-action-btn file-stop-btn" onclick="event.stopPropagation(); stopScript()" title="Stop"><i data-lucide="square" style="width:14px;height:14px;"></i></button>`
    : `<button class="file-action-btn file-play-btn" onclick="event.stopPropagation(); runFileScript('${f.path}')" title="Run"><i data-lucide="play" style="width:14px;height:14px;"></i></button>`);
  const moveBtn = !isLocked ? `<button class="file-action-btn" onclick="event.stopPropagation(); moveFileToFolder('${f.path}')" title="Move" style="color:#60a5fa;"><i data-lucide="folder-input" style="width:14px;height:14px;"></i></button>` : '';
  const lockBtn = isLockable
    ? `<button class="file-action-btn" onclick="event.stopPropagation(); toggleFileLock('${f.path}', ${isLocked})" title="${isLocked ? 'Mở khoá' : 'Khoá (chống xóa nhầm)'}" style="color:${isLocked ? '#22c55e' : '#94a3b8'};"><i data-lucide="${isLocked ? 'lock-keyhole' : 'unlock'}" style="width:14px;height:14px;"></i></button>`
    : '';
  const lockedBadge = isLocked
    ? `<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(34,197,94,0.12);color:#22c55e;padding:1px 6px;border-radius:6px;font-size:9px;font-weight:600;margin-left:6px;text-transform:uppercase;letter-spacing:0.3px;"><i data-lucide="lock-keyhole" style="width:9px;height:9px;"></i>locked</span>`
    : '';
  const renameBtn = (!isLue && !isLocked) ? `<button class="file-action-btn file-rename-btn" onclick="event.stopPropagation(); renameFile('${f.path}')" title="Rename"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>` : '';
  const deleteBtn = isLocked
    ? `<button class="file-action-btn" disabled title="Đã khoá, mở khoá để xóa" style="opacity:0.3;cursor:not-allowed;"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>`
    : `<button class="file-action-btn file-delete-btn" onclick="event.stopPropagation(); deleteFile('${f.path}')" title="Delete"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>`;
  const encryptBtn = (isLua && !isLocked) ? `<button class="file-action-btn" onclick="event.stopPropagation(); encryptScript('${f.path}')" title="Encrypt" style="color:#f59e0b;"><i data-lucide="shield" style="width:14px;height:14px;"></i></button>` : '';
  return `
    <div class="file-item ${isRunning ? 'file-running' : ''}" onclick="loadFile('${f.path}')">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
        <i data-lucide="${fileIcon}" style="width:16px;height:16px;flex-shrink:0;${iconStyle}"></i>
        <div style="min-width:0;">
          <div class="file-name">${f.name}${lockedBadge}</div>
          <div class="file-meta">${dateStr} · ${(f.size / 1024).toFixed(1)}KB${isRunning ? ' · <span style="color:#22c55e;font-weight:600;">Running</span>' : ''}</div>
        </div>
      </div>
      <div class="file-actions">
        ${playStopBtn}
        ${moveBtn}
        ${encryptBtn}
        ${lockBtn}
        <button class="file-action-btn" onclick="event.stopPropagation(); downloadFile('${f.path}')" title="Download"><i data-lucide="download" style="width:14px;height:14px;"></i></button>
        ${renameBtn}
        ${deleteBtn}
      </div>
    </div>`;
}

// ─── File lock helper (server-side persistence) ───
async function toggleFileLock(name, currentlyLocked) {
  try {
    const res = await fetch(`${API}/api/scripts/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, locked: !currentlyLocked }),
    });
    const data = await res.json();
    if (data.success) {
      appendLog(currentlyLocked ? `🔓 Đã mở khoá: ${name}` : `🔒 Đã khoá: ${name}`);
      loadScriptFiles();
    } else {
      appendLog(`❌ Lock failed: ${data.error || 'unknown'}`, "error");
    }
  } catch (e) {
    appendLog("❌ Lock failed: " + e.message, "error");
  }
}
window.toggleFileLock = toggleFileLock;

function toggleFolder(path) {
  if (window._expandedFolders.has(path)) window._expandedFolders.delete(path);
  else window._expandedFolders.add(path);
  loadScriptFiles();
}
window.toggleFolder = toggleFolder;

async function createFolder() {
  const name = prompt('Folder name:');
  if (!name || !name.trim()) return;
  try {
    const res = await fetch(`${API}/api/scripts/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: name.trim() }),
    });
    const data = await res.json();
    if (data.success) {
      appendLog(`📁 Created folder: ${data.path}`, 'success');
      loadScriptFiles();
    } else {
      appendLog(`❌ ${data.error}`, 'error');
    }
  } catch (e) {
    appendLog('❌ Create folder failed: ' + e.message, 'error');
  }
}
window.createFolder = createFolder;

async function moveFileToFolder(filePath) {
  // Get current folders
  const folders = state._folders || [];
  const options = ['/ (root)', ...folders];
  const current = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
  const choice = prompt(`Move "${filePath.split('/').pop()}" to folder:\n\nAvailable: ${options.join(', ')}\n\nEnter folder name (empty for root):`, current);
  if (choice === null) return; // cancelled
  const targetFolder = choice.trim();
  const fileName = filePath.split('/').pop();
  const newPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;
  if (newPath === filePath) return;
  try {
    // Load file
    const loadRes = await fetch(`${API}/api/scripts/load?name=${encodeURIComponent(filePath)}`);
    const loadData = await loadRes.json();
    if (!loadData.success) { appendLog('❌ Move failed: cannot load', 'error'); return; }
    // Save to new location
    const saveRes = await fetch(`${API}/api/scripts/save`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newPath, code: loadData.code }),
    });
    const saveData = await saveRes.json();
    if (!saveData.success) { appendLog('❌ Move failed: cannot save', 'error'); return; }
    // Delete old
    await fetch(`${API}/api/scripts/delete?name=${encodeURIComponent(filePath)}`, { method: 'POST' });
    appendLog(`📁 Moved: ${filePath} → ${newPath}`, 'success');
    if (state.currentFileName === filePath) {
      state.currentFileName = newPath;
      document.getElementById('scriptNameInput').value = newPath;
    }
    loadScriptFiles();
  } catch (e) {
    appendLog('❌ Move failed: ' + e.message, 'error');
  }
}
window.moveFileToFolder = moveFileToFolder;

async function loadScriptFiles() {
  try {
    const res = await fetch(`${API}/api/scripts/files`);
    const data = await res.json();
    const container = document.getElementById("filesList");

    // Store folders for save picker
    state._folders = data.folders || [];

    if (!data.success || data.files.length === 0) {
      container.innerHTML =
        '<div class="files-empty">No saved scripts yet.<br>Press 💾 to save your first script.</div>';
      return;
    }

    // Sort: folders first, then files by modified date
    const sorted = data.files.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return (b.modified || 0) - (a.modified || 0);
    });

    // New Folder button + file list
    container.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
        <button onclick="createFolder()" style="display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6);cursor:pointer;font-size:11px;font-weight:500;transition:all 0.15s;" onmouseover="this.style.background='rgba(96,165,250,0.15)';this.style.color='#60a5fa';this.style.borderColor='rgba(96,165,250,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.color='rgba(255,255,255,0.6)';this.style.borderColor='rgba(255,255,255,0.1)'">
          <i data-lucide="folder-plus" style="width:13px;height:13px;"></i> New Folder
        </button>
      </div>
      ${sorted.map(f => renderFileItem(f)).join('')}
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (e) {
    console.error("Load files failed:", e);
  }
}

async function deleteFile(name) {
  if (!confirm(`Xóa file "${name}"?\n\nKhông thể hoàn tác.`)) return;
  try {
    const res = await fetch(
      `${API}/api/scripts/delete?name=${encodeURIComponent(name)}`,
      {
        method: "POST",
      },
    );
    const data = await res.json();
    if (data.success) {
      appendLog(`🗑️ Deleted: ${name}`);
      loadScriptFiles();
    } else if (data.error === 'file_locked') {
      appendLog(`🔒 ${data.reason || 'File đang khoá, mở khoá trước khi xóa'}`, "error");
    } else {
      appendLog(`❌ Delete failed: ${data.error || 'unknown'}`, "error");
    }
  } catch (e) {
    appendLog("❌ Delete failed: " + e.message, "error");
  }
}

async function loadFile(name) {
  try {
    const res = await fetch(
      `${API}/api/scripts/load?name=${encodeURIComponent(name)}`,
    );
    const data = await res.json();
    if (data.success) {
      const isEncrypted = data.encrypted || false;
      state.currentFileNeedsPassword = data.needsPassword || false;
      // Open in tab (or switch if already open)
      openTab(name, data.code);
      document.getElementById("scriptNameInput").value = name;
      // Switch to editor tab
      document.querySelector('.tab[data-tab="editor"]').click();
      // Make editor readonly for encrypted files
      if (window._monacoEditor) {
        window._monacoEditor.updateOptions({ readOnly: isEncrypted });
      }
      appendLog(`📂 Loaded: ${name}${isEncrypted ? ' 🔒' : ''}`);
    }
  } catch (e) {
    appendLog("❌ Load failed: " + e.message, "error");
  }
}

async function renameFile(oldName) {
  // Find the file row and replace the name with an editable input
  const fileRows = document.querySelectorAll(".file-item");
  let targetRow = null;
  for (const row of fileRows) {
    if (row.textContent.includes(oldName)) {
      targetRow = row;
      break;
    }
  }

  if (!targetRow) {
    // Fallback: use a simple approach
    const newName = window.prompt("Rename file:", oldName.replace(/\.py$/, ""));
    if (!newName || newName === oldName.replace(/\.py$/, "")) return;
    await doRename(oldName, newName);
    return;
  }

  // Create inline input
  const nameEl = targetRow.querySelector(".file-name");
  if (!nameEl) return;
  const origText = nameEl.textContent;
  const input = document.createElement("input");
  input.type = "text";
  input.value = oldName.replace(/\.py$/, "");
  input.className = "rename-input";
  input.style.cssText =
    "padding:2px 6px; font-size:12px; border-radius:4px; border:1px solid var(--accent); background:var(--bg-primary); color:var(--text-primary); width:120px; outline:none;";
  nameEl.textContent = "";
  nameEl.appendChild(input);
  input.focus();
  input.select();

  const finish = async (confirmed) => {
    if (confirmed) {
      const val = input.value.trim();
      if (val && val !== oldName.replace(/\.py$/, "")) {
        await doRename(oldName, val);
        return;
      }
    }
    nameEl.textContent = origText;
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(false));
}

async function doRename(oldName, newName) {
  // Preserve original extension
  const ext = oldName.match(/\.[^.]+$/);
  const origExt = ext ? ext[0] : '.lua';
  const finalName = newName.match(/\.[^.]+$/) ? newName : newName + origExt;
  try {
    const loadRes = await fetch(
      `${API}/api/scripts/load?name=${encodeURIComponent(oldName)}`,
    );
    const loadData = await loadRes.json();
    if (!loadData.success) {
      appendLog("❌ Rename failed: cannot load", "error");
      return;
    }
    const saveRes = await fetch(`${API}/api/scripts/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: finalName, code: loadData.code }),
    });
    const saveData = await saveRes.json();
    if (!saveData.success) {
      appendLog("❌ Rename failed: cannot save", "error");
      return;
    }
    await fetch(
      `${API}/api/scripts/delete?name=${encodeURIComponent(oldName)}`,
      { method: "POST" },
    );
    if (state.currentFileName === oldName) {
      state.currentFileName = finalName;
      document.getElementById("scriptNameInput").value = finalName;
    }
    appendLog(`✏️ Renamed: ${oldName} → ${finalName}`);
    loadScriptFiles();
  } catch (e) {
    appendLog("❌ Rename failed: " + e.message, "error");
  }
}
window.renameFile = renameFile;

window.loadFile = loadFile;
window.deleteFile = deleteFile;
window.downloadFile = downloadFile;

async function downloadFile(name) {
  try {
    const ext = name.split('.').pop().toLowerCase();
    
    if (ext === "lue") {
      // .lue → download raw binary file directly
      const a = document.createElement("a");
      a.href = `${API}/api/scripts/download?name=${encodeURIComponent(name)}`;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      appendLog(`⬇️ Downloaded: ${name} 🔒`, "success");
    } else {
      // .lua → download as raw text file
      const res = await fetch(`${API}/api/scripts/download?name=${encodeURIComponent(name)}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        appendLog(`⬇️ Downloaded: ${name}`, "success");
      } else {
        appendLog(`❌ Download failed`, "error");
      }
    }
  } catch (e) {
    appendLog("❌ Download failed: " + e.message, "error");
  }
}

// ═══════════════════════════════════════════
// Backup / Restore
// ═══════════════════════════════════════════

async function exportBackup() {
  const btn = document.getElementById("exportBackupBtn");
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader" style="width:12px;height:12px;animation:spin 1s linear infinite;"></i> Exporting...';
  btn.disabled = true;
  try {
    const res = await fetch(`${API}/api/backup/export`);
    const data = await res.json();
    if (!data.success) throw new Error("Export failed");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const now = new Date();
    const ts = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") + "_" +
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0");
    a.href = url;
    a.download = `ioscontrol_backup_${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    appendLog(`✅ Exported: ${data.script_count} scripts, ${data.image_count} images`, "success");
  } catch (e) {
    appendLog("❌ Export failed: " + e.message, "error");
  } finally {
    btn.innerHTML = origHTML;
    btn.disabled = false;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

async function importBackup(file) {
  const btn = document.getElementById("importBackupBtn");
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader" style="width:12px;height:12px;animation:spin 1s linear infinite;"></i> Importing...';
  btn.disabled = true;
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    if (!backup.scripts && !backup.images) throw new Error("Invalid backup file");
    const res = await fetch(`${API}/api/backup/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: text,
    });
    const data = await res.json();
    if (data.success) {
      appendLog(`✅ Imported: ${data.scripts_imported} scripts, ${data.images_imported} images`, "success");
      loadScriptFiles();
    } else {
      throw new Error(data.error || "Import failed");
    }
  } catch (e) {
    appendLog("❌ Import failed: " + e.message, "error");
  } finally {
    btn.innerHTML = origHTML;
    btn.disabled = false;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

// Wire up backup buttons
document.getElementById("exportBackupBtn")?.addEventListener("click", exportBackup);
document.getElementById("importBackupBtn")?.addEventListener("click", () => {
  document.getElementById("importFileInput").click();
});
document.getElementById("importFileInput")?.addEventListener("change", async (e) => {
  if (!e.target.files[0]) return;
  const file = e.target.files[0];
  const ext = file.name.split('.').pop().toLowerCase();
  
  if (ext === "json") {
    // JSON backup import (existing flow)
    importBackup(file);
  } else if (ext === "lua") {
    // Direct .lua script upload
    try {
      const code = await file.text();
      const res = await fetch(`${API}/api/scripts/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, code }),
      });
      const data = await res.json();
      if (data.success) {
        appendLog(`✅ Imported script: ${file.name}`, "success");
        loadScriptFiles();
      } else {
        appendLog(`❌ Import failed: ${data.error}`, "error");
      }
    } catch (err) {
      appendLog(`❌ Import error: ${err.message}`, "error");
    }
  } else if (ext === "lue") {
    // Binary .lue upload (base64 encoded)
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const res = await fetch(`${API}/api/scripts/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, data: b64 }),
      });
      const data = await res.json();
      if (data.success) {
        appendLog(`✅ Imported encrypted script: ${file.name} 🔒`, "success");
        loadScriptFiles();
      } else {
        appendLog(`❌ Import failed: ${data.error}`, "error");
      }
    } catch (err) {
      appendLog(`❌ Import error: ${err.message}`, "error");
    }
  } else {
    appendLog(`❌ Unsupported file type: .${ext}`, "error");
  }
  e.target.value = "";
});

// ═══════════════════════════════════════════
// API Documentation
// ═══════════════════════════════════════════

function loadApiDocs() {
  const docs = document.getElementById("apiDocs");
  if (!docs) return;

  const apiRef = [
    {
      section: "Touch",
      icon: "pointer",
      vi: "Chạm",
      funcs: [
        {
          name: "tap(x, y)",
          desc: "Tap at point coordinates",
          desc_vi: "Chạm tại toạ độ (point)",
          example: "tap(207, 400)\n-- Point coords, not pixels",
          example_vi: "tap(207, 400)\n-- Toạ độ point, không phải pixel",
        },
        {
          name: "swipe(x1, y1, x2, y2, duration)",
          desc: "Swipe from (x1,y1) to (x2,y2) in duration seconds",
          desc_vi: "Vuốt từ (x1,y1) đến (x2,y2) trong duration giây",
          example: "-- Swipe up (scroll down)\nswipe(207, 600, 207, 200, 0.3)\n\n-- Swipe left\nswipe(350, 400, 50, 400, 0.5)",
          example_vi: "-- Vuốt lên (scroll down)\nswipe(207, 600, 207, 200, 0.3)\n\n-- Vuốt sang trái\nswipe(350, 400, 50, 400, 0.5)",
        },
        {
          name: "longPress(x, y, duration)",
          desc: "Long press",
          desc_vi: "Nhấn giữ",
          example: "longPress(207, 400, 2.0)\n-- Hold for 2 seconds",
          example_vi: "longPress(207, 400, 2.0)\n-- Nhấn giữ 2 giây",
        },
        {
          name: "touchDown(finger, x, y)",
          desc: "Press finger down (multi-touch). finger: 0-9",
          desc_vi: "Nhấn ngón tay xuống (multi-touch). finger: 0-9",
          example: "-- Custom drag gesture\ntouchDown(0, 100, 200)\nsleep(0.1)\ntouchMove(0, 200, 300)\nsleep(0.1)\ntouchUp(0, 200, 300)",
          example_vi: "-- Kéo thả tuỳ chỉnh\ntouchDown(0, 100, 200)\nsleep(0.1)\ntouchMove(0, 200, 300)\nsleep(0.1)\ntouchUp(0, 200, 300)",
        },
        {
          name: "touchMove(finger, x, y)",
          desc: "Move finger to new position",
          desc_vi: "Di chuyển ngón tay đến vị trí mới",
          example: "touchMove(0, 200, 300)",
        },
        {
          name: "touchUp(finger, x, y)",
          desc: "Lift finger up",
          desc_vi: "Nhấc ngón tay lên",
          example: "touchUp(0, 200, 300)",
        },
        {
          name: "pinch(x, y, scale, duration)",
          desc: "Pinch zoom. scale>1 zoom in, <1 zoom out",
          desc_vi: "Zoom. scale>1 phóng to, <1 thu nhỏ",
          example: "-- Zoom in 2x\npinch(207, 368, 2.0, 0.5)\n\n-- Zoom out\npinch(207, 368, 0.5, 0.5)",
          example_vi: "-- Phóng to 2x\npinch(207, 368, 2.0, 0.5)\n\n-- Thu nhỏ\npinch(207, 368, 0.5, 0.5)",
        },
        {
          name: "rotate(x, y, angle, duration)",
          desc: "Rotate gesture. angle in degrees",
          desc_vi: "Xoay. angle tính bằng độ",
          example: "-- Rotate 90 degrees\nrotate(207, 368, 90, 0.5)",
          example_vi: "-- Xoay 90 độ\nrotate(207, 368, 90, 0.5)",
        },
      ],
    },
    {
      section: "Color",
      icon: "palette",
      vi: "Màu sắc",
      funcs: [
        {
          name: "getColor(x, y)",
          desc: "Get pixel color as integer (0xRRGGBB)",
          desc_vi: "Lấy màu pixel dạng integer (0xRRGGBB)",
          example: "local c = getColor(100, 200)\nlog(string.format(\"0x%06X\", c))\n-- Output: 0xFF5500",
        },
        {
          name: "getColors(locations)",
          desc: "Get colors at multiple points — returns table",
          desc_vi: "Lấy màu nhiều điểm — trả về table",
          example: "local colors = getColors({{100,200}, {200,300}})\nfor i, c in ipairs(colors) do\n    log(\"Point \" .. i .. \": \" .. string.format(\"0x%06X\", c))\nend",
        },
        {
          name: "findColor(color, count, region)",
          desc: "Find pixels matching color. Returns table of {{x,y}, ...} (indexed). count=0 means find all.",
          desc_vi: "Tìm pixel theo màu. Trả về bảng {{x,y}, ...} (theo chỉ mục). count=0 nghĩa là tìm tất cả.",
          example: '-- Find red pixels\nlocal pts = findColor(0xFF0000, 5)\nfor _, p in ipairs(pts) do\n    tap(p[1], p[2])  -- p[1]=x, p[2]=y\n    sleep(0.3)\nend\n\n-- Search in region {x, y, w, h}\nlocal pts = findColor(0xFF0000, 1, {0, 0, 200, 400})\nif #pts > 0 then tap(pts[1][1], pts[1][2]) end',
          example_vi: '-- Tìm pixel đỏ\nlocal pts = findColor(0xFF0000, 5)\nfor _, p in ipairs(pts) do\n    tap(p[1], p[2])  -- p[1]=x, p[2]=y\n    sleep(0.3)\nend\n\n-- Tìm trong vùng {x, y, w, h}\nlocal pts = findColor(0xFF0000, 1, {0, 0, 200, 400})\nif #pts > 0 then tap(pts[1][1], pts[1][2]) end',
        },
        {
          name: "findColors(colors, count, region)",
          desc: "Find multi-color pattern. colors: {{color, dx, dy}, ...} — indexed format. dx/dy in points.",
          desc_vi: "Tìm mẫu nhiều màu. colors: {{color, dx, dy}, ...} — theo chỉ mục. dx/dy tính bằng point.",
          example: '-- Find: red pixel + green 10pt right\nlocal pts = findColors({\n    {0xFF0000, 0, 0},\n    {0x00FF00, 10, 0}\n}, 1)\nif #pts > 0 then\n    tap(pts[1][1], pts[1][2])\nend',
          example_vi: '-- Tìm: pixel đỏ + xanh cách 10pt bên phải\nlocal pts = findColors({\n    {0xFF0000, 0, 0},\n    {0x00FF00, 10, 0}\n}, 1)\nif #pts > 0 then\n    tap(pts[1][1], pts[1][2])\nend',
        },
        {
          name: "waitForColor(x, y, color, timeout)",
          desc: "Wait until pixel matches color. Returns true/false",
          desc_vi: "Đợi pixel khớp màu. Trả về true/false",
          example: "-- Wait for button to turn red, max 30s\nlocal ok = waitForColor(100, 200, 0xFF0000, 30)\nif ok then\n    tap(100, 200)\nelse\n    log(\"Timeout!\")\nend",
          example_vi: "-- Đợi nút chuyển đỏ, tối đa 30s\nlocal ok = waitForColor(100, 200, 0xFF0000, 30)\nif ok then\n    tap(100, 200)\nelse\n    log(\"Hết giờ!\")\nend",
        },
        {
          name: "intToRgb(color)",
          desc: "Convert int → R, G, B values (0-255)",
          desc_vi: "Chuyển int → R, G, B (0-255)",
          example: "local r, g, b = intToRgb(0xFF5500)\nlog(\"R=\" .. r .. \" G=\" .. g .. \" B=\" .. b)\n-- R=255 G=85 B=0",
        },
        {
          name: "rgbToInt(r, g, b)",
          desc: "Convert R, G, B → int color",
          desc_vi: "Chuyển R, G, B → int",
          example: "local c = rgbToInt(255, 85, 0)\nlog(string.format(\"0x%06X\", c))\n-- 0xFF5500",
        },
      ],
    },
    {
      section: "Image / OCR",
      icon: "image",
      vi: "Hình ảnh / OCR",
      funcs: [
        {
          name: "findImage(path, count, threshold, region)",
          desc: "Find image on screen. threshold 0~1 (default 0.9). Returns x, y or nil",
          desc_vi: "Tìm hình. threshold 0~1 (mặc định 0.9). Trả về x, y hoặc nil",
          example: '-- Find 1 result, 90% match\nlocal x, y = findImage("btn.png", 1, 0.9)\nif x then\n    tap(x, y)\nend\n\n-- Search in region\nlocal x, y = findImage("icon.png", 1, 0.85, {0, 0, 200, 400})',
          example_vi: '-- Tìm 1 kết quả, match 90%\nlocal x, y = findImage("btn.png", 1, 0.9)\nif x then\n    tap(x, y)\nend\n\n-- Tìm trong vùng\nlocal x, y = findImage("icon.png", 1, 0.85, {0, 0, 200, 400})',
        },
        {
          name: "waitForImage(path, timeout)",
          desc: "Wait for image on screen. Returns table {x=, y=} or false on timeout. Polls every 500ms.",
          desc_vi: "Đợi hình xuất hiện. Trả về bảng {x=, y=} hoặc false khi hết giờ. Kiểm tra mỗi 500ms.",
          example: '-- Wait 15s for dialog\nlocal result = waitForImage("dialog.png", 15)\nif result then\n    tap(result.x, result.y)\nelse\n    log("Timeout!")\nend',
          example_vi: '-- Đợi 15s cho dialog\nlocal result = waitForImage("dialog.png", 15)\nif result then\n    tap(result.x, result.y)\nelse\n    log("Hết giờ!")\nend',
        },
        {
          name: "screenshot(name, region)",
          desc: "Save screenshot JPEG to images/. Optional region {x,y,w,h}",
          desc_vi: "Chụp JPEG vào images/. Tuỳ chọn region {x,y,w,h}",
          example: '-- Full screen\nscreenshot("full")\n\n-- Header region only\nscreenshot("header", {0, 0, 414, 100})',
          example_vi: '-- Toàn màn hình\nscreenshot("full")\n\n-- Chỉ vùng header\nscreenshot("header", {0, 0, 414, 100})',
        },
        {
          name: "deleteScreenshot(name)",
          desc: "Delete from images/",
          desc_vi: "Xoá từ images/",
          example: 'deleteScreenshot("old.jpg")',
        },
        {
          name: "convertBase64(path)",
          desc: "File to base64 string",
          desc_vi: "Chuyển file sang base64",
          example: 'local b64 = convertBase64("img.jpg")',
        },
        {
          name: "ocr({region={x,y,w,h}})",
          desc: "Text recognition — returns table of {text, x, y}",
          desc_vi: "Nhận diện chữ — trả về table {text, x, y}",
          example: '-- Full screen OCR\nlocal results = ocr({region = {0, 0, 414, 736}})\nfor _, r in ipairs(results) do\n    log(r.text .. " at " .. r.x .. "," .. r.y)\nend',
          example_vi: '-- Nhận diện toàn màn hình\nlocal results = ocr({region = {0, 0, 414, 736}})\nfor _, r in ipairs(results) do\n    log(r.text .. " tại " .. r.x .. "," .. r.y)\nend',
        },
        {
          name: "findText(text, region)",
          desc: "Find text on screen via OCR. Returns x, y, text (3 values) or nil. Alias: ocrFind()",
          desc_vi: "Tìm chữ trên màn hình qua OCR. Trả về x, y, text (3 giá trị) hoặc nil. Bí danh: ocrFind()",
          example: 'local x, y, text = findText("OK")\nif x then\n    tap(x, y)\n    log("Found: " .. text .. " at " .. x .. "," .. y)\nend\n\n-- Search in region\nlocal x, y = findText("OK", {0, 600, 414, 200})',
          example_vi: 'local x, y, text = findText("OK")\nif x then\n    tap(x, y)\n    log("Tìm thấy: " .. text .. " tại " .. x .. "," .. y)\nend\n\n-- Tìm trong vùng\nlocal x, y = findText("OK", {0, 600, 414, 200})',
        },
        {
          name: "waitForText(text, timeout)",
          desc: "Wait for text on screen via OCR. Returns table {x=, y=, text=} or false on timeout.",
          desc_vi: "Đợi chữ xuất hiện qua OCR. Trả về bảng {x=, y=, text=} hoặc false khi hết giờ.",
          example: 'local result = waitForText("OK", 15)\nif result then\n    tap(result.x, result.y)\n    log("Found: " .. result.text)\nelse\n    log("Not found after 15s")\nend',
          example_vi: 'local result = waitForText("OK", 15)\nif result then\n    tap(result.x, result.y)\n    log("Tìm thấy: " .. result.text)\nelse\n    log("Không tìm thấy sau 15s")\nend',
        },
        {
          name: "tapImage(path, timeout, threshold, region)",
          desc: "Find image + tap. timeout=seconds, threshold=0~1. Optional region to limit search area.",
          desc_vi: "Tìm hình + chạm. timeout=giây, threshold=0~1. Tuỳ chọn region để giới hạn vùng tìm.",
          example: 'tapImage("btn_ok.png", 10, 0.85)\n-- timeout 10s, match 85%\n\n-- Search only bottom half\ntapImage("btn.png", 10, 0.85, {0, 400, 414, 200})',
          example_vi: 'tapImage("btn_ok.png", 10, 0.85)\n-- timeout 10s, match 85%\n\n-- Tìm chỉ nửa dưới màn hình\ntapImage("btn.png", 10, 0.85, {0, 400, 414, 200})',
        },
        {
          name: "tapText(text, timeout, index, region)",
          desc: "Find text via OCR + tap. index = which occurrence (1=first, 2=second...), sorted top→bottom. Optional region {x,y,w,h} to limit search area.",
          desc_vi: "Tìm chữ OCR + chạm. index = thứ tự xuất hiện (1=đầu tiên, 2=thứ hai...), sắp xếp trên→dưới. Tuỳ chọn region {x,y,w,h} để giới hạn vùng tìm.",
          example: 'tapText("Login", 10)\n-- Tap first "Login"\ntapText("Delete", 5, 2)\n-- Tap 2nd "Delete"\n\n-- Search only in header area\ntapText("Back", 5, 1, {0, 0, 200, 80})',
          example_vi: 'tapText("Login", 10)\n-- Chạm "Login" đầu tiên\ntapText("Delete", 5, 2)\n-- Chạm "Delete" thứ 2\n\n-- Tìm chỉ trong vùng header\ntapText("Back", 5, 1, {0, 0, 200, 80})',
        },
        {
          name: "swipeUntilImage(path, dir, maxSwipes, threshold, speed)",
          desc: "Swipe until image found. Returns ok, x, y. speed = swipe duration (s)",
          desc_vi: "Vuốt cho đến khi thấy hình. Trả ok, x, y. speed = tốc độ vuốt (giây)",
          example: 'local ok, x, y = swipeUntilImage("target.png", "up", 10, 0.9, 0.3)\n-- Fast swipe, max 10 times',
          example_vi: 'local ok, x, y = swipeUntilImage("target.png", "up", 10, 0.9, 0.3)\n-- Vuốt nhanh, tối đa 10 lần',
        },
        {
          name: "swipeUntilText(text, dir, maxSwipes, speed)",
          desc: "Swipe until text found via OCR. Returns ok, x, y. speed = swipe duration (s)",
          desc_vi: "Vuốt cho đến khi thấy chữ qua OCR. Trả ok, x, y. speed = tốc độ vuốt (giây)",
          example: 'local ok, x, y = swipeUntilText("Settings", "down", 5, 0.5)\n-- Slow swipe down max 5 times',
          example_vi: 'local ok, x, y = swipeUntilText("Settings", "down", 5, 0.5)\n-- Vuốt chậm xuống tối đa 5 lần',
        },
      ],
    },
    {
      section: "Interaction",
      icon: "message-square",
      vi: "Tương tác",
      funcs: [
        {
          name: "dialogInput(title, msg, default)",
          desc: "Input dialog — returns text or nil if cancelled",
          desc_vi: "Hộp thoại nhập — trả về text hoặc nil nếu huỷ",
          example: 'local name = dialogInput("Name?", "Enter username", "admin")\nif name then\n    log("Input: " .. name)\nelse\n    log("Cancelled")\nend',
          example_vi: 'local name = dialogInput("Tên?", "Nhập username", "admin")\nif name then\n    log("Nhập: " .. name)\nelse\n    log("Đã huỷ")\nend',
        },
        {
          name: "dialogChoice(title, ...options)",
          desc: "Choice dialog — returns selected option or nil",
          desc_vi: "Hộp thoại chọn — trả về lựa chọn hoặc nil",
          example: 'local mode = dialogChoice("Mode", "Fast", "Safe", "Custom")\nif mode then\n    log("Selected: " .. mode)\nend',
          example_vi: 'local mode = dialogChoice("Chế độ", "Nhanh", "An toàn", "Tuỳ chỉnh")\nif mode then\n    log("Chọn: " .. mode)\nend',
        },
        {
          name: "timestamp()",
          desc: "Unix time (ms)",
          desc_vi: "Thời gian Unix (ms)",
          example: 'local t = timestamp()',
        },
        {
          name: "md5(string)",
          desc: "MD5 hash",
          desc_vi: "Mã băm MD5",
          example: 'local h = md5("hello")',
        },
        {
          name: "showOverlay(data)",
          desc: "Show transparent stats HUD on screen",
          desc_vi: "Hiển bảng thống kê trong suốt trên màn hình",
          example: 'showOverlay({\n    ["Runs"] = "0",\n    ["Success"] = "0",\n    ["Fail"] = "0"\n})',
          example_vi: 'showOverlay({\n    ["Lượt"] = "0",\n    ["Thành công"] = "0",\n    ["Thất bại"] = "0"\n})',
        },
        {
          name: "updateOverlay(key, value)",
          desc: "Update overlay entry",
          desc_vi: "Cập nhật giá trị overlay",
          example: 'updateOverlay("Runs", runs)',
        },
        {
          name: "hideOverlay()",
          desc: "Hide overlay",
          desc_vi: "Ẩn overlay",
          example: 'hideOverlay()',
        },
      ],
    },
    {
      section: "App / System",
      icon: "smartphone",
      vi: "Ứng dụng / Hệ thống",
      funcs: [
        {
          name: "home()",
          desc: "Press Home button — go to springboard",
          desc_vi: "Nhấn nút Home — về màn hình chính",
          example: "home()\nsleep(1)\nlog(\"Back to Home\")",
          example_vi: "home()\nsleep(1)\nlog(\"Đã về Home\")",
        },
        {
          name: "appRun(bundleId)",
          desc: "Launch app by bundle ID",
          desc_vi: "Mở ứng dụng bằng bundle ID",
          example: 'appRun("com.apple.mobilesafari")\nsleep(2)\nlog("App: " .. frontMostAppId())',
        },
        {
          name: "appKill(bundleId)",
          desc: "Force kill app",
          desc_vi: "Đóng ứng dụng cưỡng bức",
          example: 'appKill("com.apple.mobilesafari")\nsleep(1)\nlog("Killed Safari")',
        },
        {
          name: "appClear(bundleId)",
          desc: "Clear all app data — keychain, container, caches. Returns to fresh-install state.",
          desc_vi: "Xóa toàn bộ dữ liệu app — keychain, container, caches. Trở về trạng thái mới cài.",
          example: 'appClear("com.facebook.Facebook")\nsleep(2)\nappRun("com.facebook.Facebook")\nlog("Reset done!")',
          example_vi: 'appClear("com.facebook.Facebook")\nsleep(2)\nappRun("com.facebook.Facebook")\nlog("Đã reset xong!")',
        },
        {
          name: "appState(bundleId)",
          desc: "Get app state: 1=Not running, 2=Background, 4=Foreground",
          desc_vi: "Trạng thái app: 1=Không chạy, 2=Nền, 4=Hiện tại",
          example: 'local s = appState("com.apple.mobilesafari")\nif s == 4 then\n    log("Safari is open")\nelseif s == 2 then\n    log("Background")\nelse\n    log("Not running")\nend',
          example_vi: 'local s = appState("com.apple.mobilesafari")\nif s == 4 then\n    log("Safari đang mở")\nelseif s == 2 then\n    log("Chạy nền")\nelse\n    log("Không chạy")\nend',
        },
        {
          name: "appInfo(bundleId)",
          desc: "Get app details — name, version, data path",
          desc_vi: "Lấy thông tin app — tên, version, đường dẫn",
          example: 'local info = appInfo("com.apple.mobilesafari")\nlog("Name: " .. info.name)\nlog("Ver: " .. info.version)',
        },
        {
          name: "frontMostAppId()",
          desc: "Get foreground app bundle ID",
          desc_vi: "Lấy bundle ID app đang chạy",
          example: 'local bid = frontMostAppId()\nlog("Current app: " .. bid)',
          example_vi: 'local bid = frontMostAppId()\nlog("App hiện tại: " .. bid)',
        },
        {
          name: "openURL(url)",
          desc: "Open URL (Safari, deep links)",
          desc_vi: "Mở URL (Safari, deep link)",
          example: 'openURL("https://google.com")\n\n-- Deep link\nopenURL("instagram://user?username=abc")',
        },
      ],
    },
    {
      section: "Text / Keyboard",
      icon: "keyboard",
      vi: "Văn bản / Bàn phím",
      funcs: [
        {
          name: "inputText(text)",
          desc: "Type text into focused field",
          desc_vi: "Gõ chữ vào ô đang focus",
          example: '-- Tap field then type\ntap(207, 300)\nsleep(0.5)\ninputText("Hello World!")',
          example_vi: '-- Tap vào ô rồi gõ\ntap(207, 300)\nsleep(0.5)\ninputText("Hello World!")',
        },
        {
          name: "copyText(text)",
          desc: "Copy text to clipboard",
          desc_vi: "Copy text vào clipboard",
          example: 'copyText("https://example.com")\nlog("Link copied")',
          example_vi: 'copyText("https://example.com")\nlog("Đã copy link")',
        },
        {
          name: "clipText()",
          desc: "Get current clipboard text",
          desc_vi: "Lấy nội dung clipboard",
          example: 'local text = clipText()\nif text then\n    log("Clipboard: " .. text)\nend',
        },
        {
          name: "keyDown(key) / keyUp(key)",
          desc: "Press/release key. KEY_HOME, KEY_POWER, KEY_VOLUME_UP/DOWN",
          desc_vi: "Nhấn/thả phím. KEY_HOME, KEY_POWER, KEY_VOLUME_UP/DOWN",
          example: "keyDown(KEY_HOME)\nsleep(0.1)\nkeyUp(KEY_HOME)\n\n-- Volume up\nkeyDown(KEY_VOLUME_UP)\nsleep(0.1)\nkeyUp(KEY_VOLUME_UP)",
          example_vi: "keyDown(KEY_HOME)\nsleep(0.1)\nkeyUp(KEY_HOME)\n\n-- Tăng âm lượng\nkeyDown(KEY_VOLUME_UP)\nsleep(0.1)\nkeyUp(KEY_VOLUME_UP)",
        },
      ],
    },
    {
      section: "HTTP / JSON",
      icon: "globe",
      vi: "HTTP / JSON",
      funcs: [
        {
          name: "httpGet(url, headers, timeout)",
          desc: "HTTP GET. Returns body, statusCode. Timeout default 15s.",
          desc_vi: "Gửi GET. Trả về body, statusCode. Timeout mặc định 15s.",
          example: 'local resp = httpGet("https://api.example.com/data")\nlocal data = jsonDecode(resp)\nlog(data.name)\n\n-- With headers\nlocal resp = httpGet("https://api.example.com", {\n    ["Authorization"] = "Bearer token123"\n})\n\n-- Custom timeout 30s\nlocal resp = httpGet("https://slow-api.com", nil, 30)',
          example_vi: 'local resp = httpGet("https://api.example.com/data")\nlocal data = jsonDecode(resp)\nlog(data.name)\n\n-- Có headers\nlocal resp = httpGet("https://api.example.com", {\n    ["Authorization"] = "Bearer token123"\n})\n\n-- Timeout 30s\nlocal resp = httpGet("https://slow-api.com", nil, 30)',
        },
        {
          name: "httpPost(url, body, headers, timeout)",
          desc: "HTTP POST. body is string/jsonEncode(). Timeout default 15s.",
          desc_vi: "Gửi POST. body là chuỗi/jsonEncode(). Timeout mặc định 15s.",
          example: 'local body = jsonEncode({\n    username = "admin",\n    password = "123"\n})\nlocal resp = httpPost(\n    "https://api.example.com/login",\n    body,\n    {["Content-Type"] = "application/json"}\n)\nlog(resp)\n\n-- Custom timeout 60s\nlocal resp = httpPost(url, body, headers, 60)',
          example_vi: 'local body = jsonEncode({\n    username = "admin",\n    password = "123"\n})\nlocal resp = httpPost(\n    "https://api.example.com/login",\n    body,\n    {["Content-Type"] = "application/json"}\n)\nlog(resp)\n\n-- Timeout 60s\nlocal resp = httpPost(url, body, headers, 60)',
        },
        {
          name: "jsonDecode(str)",
          desc: "JSON string → Lua table",
          desc_vi: "Chuỗi JSON → table",
          example: 'local json = \'{"name":"Trieu","age":25}\'\nlocal t = jsonDecode(json)\nlog(t.name)  -- "Trieu"\nlog(t.age)   -- 25',
        },
        {
          name: "jsonEncode(tbl)",
          desc: "Lua table → JSON string",
          desc_vi: "Table → chuỗi JSON",
          example: 'local t = {name = "Trieu", items = {1, 2, 3}}\nlocal json = jsonEncode(t)\nlog(json)  -- {"name":"Trieu","items":[1,2,3]}',
        },
      ],
    },
    {
      section: "Proxy",
      icon: "shield",
      vi: "Proxy",
      funcs: [
        {
          name: "setProxySystem(host, port)",
          desc: "Set device-wide Wi-Fi proxy. Only IP:Port supported currently.",
          desc_vi: "Đặt proxy toàn thiết bị qua Wi-Fi. Hiện tại chỉ hỗ trợ IP:Port.",
          example: '-- System proxy\nsetProxySystem("160.25.77.31", 8770)\n\n-- Recommended: toggle Airplane Mode to force reset connections\nsetAirplaneMode(true)\nsleep(1)\nsetAirplaneMode(false)\n\n-- Turn off when done\nclearProxySystem()',
          example_vi: '-- Proxy hệ thống\nsetProxySystem("160.25.77.31", 8770)\n\n-- Nên làm: Bật/tắt chế độ máy bay để reset kết nối\nsetAirplaneMode(true)\nsleep(1)\nsetAirplaneMode(false)\n\n-- Tắt khi xong\nclearProxySystem()',
        },
        {
          name: "clearProxySystem()",
          desc: "Disable device-wide Wi-Fi proxy. Restores direct connection.",
          desc_vi: "Tắt proxy hệ thống Wi-Fi. Khôi phục kết nối trực tiếp.",
          example: 'clearProxySystem()\nlog("System proxy disabled")',
          example_vi: 'clearProxySystem()\nlog("Đã tắt proxy hệ thống")',
        },
      ],
    },
    {
      section: "File I/O",
      icon: "folder-open",
      vi: "Đọc/Ghi file",
      funcs: [
        {
          name: "readFile(path)",
          desc: "Read file content as string",
          desc_vi: "Đọc file thành chuỗi",
          example: '-- Read from scripts dir\nlocal data = readFile("accounts.txt")\nlog(data)\n\n-- Absolute path\nlocal data = readFile("/tmp/test.txt")',
          example_vi: '-- Đọc từ thư mục scripts\nlocal data = readFile("accounts.txt")\nlog(data)\n\n-- Đường dẫn tuyệt đối\nlocal data = readFile("/tmp/test.txt")',
        },
        {
          name: "writeFile(path, content)",
          desc: "Write string to file (creates/overwrites)",
          desc_vi: "Ghi chuỗi vào file (tạo mới/ghi đè)",
          example: 'writeFile("result.txt", "Success\\nCount: 5")\nlog("File saved!")',
        },
        {
          name: "appendFile(path, content)",
          desc: "Append to file (creates if not exists)",
          desc_vi: "Ghi thêm vào file (tạo nếu chưa có)",
          example: 'appendFile("log.txt", "Run #1: OK\\n")\nappendFile("log.txt", "Run #2: Error\\n")',
        },
        {
          name: "saveToSystemAlbum(path)",
          desc: "Save image to Photos app",
          desc_vi: "Lưu ảnh vào app Photos",
          example: 'screenshot("capture")\nsaveToSystemAlbum(rootDir() .. "/images/capture.jpg")',
        },
      ],
    },
    {
      section: "Timing / Random",
      icon: "timer",
      vi: "Thời gian / Ngẫu nhiên",
      funcs: [
        {
          name: "sleep(seconds)",
          desc: "Wait in seconds",
          desc_vi: "Đợi (giây)",
          example: "sleep(1.5)",
        },
        {
          name: "usleep(microseconds)",
          desc: "Wait in microseconds",
          desc_vi: "Đợi (µs)",
          example: "usleep(500000)",
        },
        {
          name: "randomSleep(min, max)",
          desc: "Random delay",
          desc_vi: "Đợi ngẫu nhiên",
          example: "randomSleep(0.5, 2.0)",
        },
        {
          name: "randomInt(min, max)",
          desc: "Random integer",
          desc_vi: "Số nguyên ngẫu nhiên",
          example: "local n = randomInt(1, 100)",
        },
        {
          name: "randomFloat(min, max)",
          desc: "Random float",
          desc_vi: "Số thực ngẫu nhiên",
          example: "local f = randomFloat(0.0, 1.0)",
        },
      ],
    },
    {
      section: "Device Info",
      icon: "monitor-smartphone",
      vi: "Thông tin thiết bị",
      funcs: [
        {
          name: "getScreenResolution()",
          desc: "Screen size (w, h)",
          desc_vi: "Kích thước màn hình",
          example: "local w, h = getScreenResolution()",
        },
        {
          name: "getOrientation()",
          desc: "Screen orientation",
          desc_vi: "Hướng màn hình",
          example: "local o = getOrientation()",
        },
        {
          name: "deviceInfo()",
          desc: "Full device info",
          desc_vi: "Thông tin thiết bị",
          example: "local info = deviceInfo()",
        },
        {
          name: "getSN()",
          desc: "Serial number",
          desc_vi: "Số serial",
          example: "local sn = getSN()",
        },
        {
          name: "getLocalIP()",
          desc: "WiFi IP address",
          desc_vi: "Địa chỉ IP WiFi",
          example: "local ip = getLocalIP()",
        },
        {
          name: "wifiInfo()",
          desc: "WiFi network info",
          desc_vi: "Thông tin WiFi",
          example: "local w = wifiInfo()",
        },
        {
          name: "setCellularData(enabled, delay)",
          desc: "Toggle 4G/cellular on/off",
          desc_vi: "Bật/tắt 4G",
          example: 'setCellularData(false, 5) -- Off 5s then on',
        },
        {
          name: "setAirplaneMode(enabled, delay)",
          desc: "Toggle airplane mode",
          desc_vi: "Bật/tắt chế độ máy bay",
          example: 'setAirplaneMode(true, 3) -- On 3s then off',
        },
        {
          name: "getIP()",
          desc: "Get public IP address",
          desc_vi: "Lấy IP công cộng",
          example: 'local ip = getIP()\nlog("Public IP: " .. ip)',
        },
      ],
    },
    {
      section: "Utilities",
      icon: "wrench",
      vi: "Tiện ích",
      funcs: [
        {
          name: "log(msg)",
          desc: "Print to Web IDE console",
          desc_vi: "In ra console Web IDE",
          example: 'log("Hello World!")\nlog("Count: " .. 42)\nlog("Table: " .. jsonEncode({a=1}))',
        },
        {
          name: "toast(msg)",
          desc: "Show toast on device screen (auto-hide)",
          desc_vi: "Hiện toast trên màn hình (tự ẩn)",
          example: 'toast("Step 1 done!")\nsleep(2)\ntoast("Processing...")',
          example_vi: 'toast("Bước 1 hoàn thành!")\nsleep(2)\ntoast("Đang xử lý...")',
        },
        {
          name: "alert(msg)",
          desc: "Show alert dialog (blocks until OK)",
          desc_vi: "Hiện alert (chặn cho đến khi nhấn OK)",
          example: 'alert("Press OK to continue!")',
          example_vi: 'alert("Nhấn OK để tiếp tục!")',
        },
        {
          name: "vibrate()",
          desc: "Vibrate device once",
          desc_vi: "Rung thiết bị 1 lần",
          example: "-- Vibrate on completion\nvibrate()\nlog(\"Done!\")",
          example_vi: "-- Rung khi hoàn thành\nvibrate()\nlog(\"Xong!\")",
        },
        {
          name: "execute(cmd)",
          desc: "Run shell command — returns stdout",
          desc_vi: "Chạy lệnh shell — trả về stdout",
          example: 'local out = execute("ls -la /tmp")\nlog(out)\n\n-- Check process\nlocal ps = execute("ps aux | grep Safari")',
          example_vi: 'local out = execute("ls -la /tmp")\nlog(out)\n\n-- Kiểm tra process\nlocal ps = execute("ps aux | grep Safari")',
        },
        {
          name: "keepAwake(flag)",
          desc: "Prevent screen from dimming/sleeping",
          desc_vi: "Giữ màn hình sáng, không tắt",
          example: "-- Enable at start\nkeepAwake(true)\n\n-- Disable when done\nkeepAwake(false)",
          example_vi: "-- Bật khi bắt đầu\nkeepAwake(true)\n\n-- Tắt khi xong\nkeepAwake(false)",
        },
        {
          name: "rootDir()",
          desc: "Scripts root directory path",
          desc_vi: "Đường dẫn thư mục gốc scripts",
          example: 'local dir = rootDir()\nlog(dir)\n-- /var/mobile/Library/IOSControl/Scripts',
        },
        {
          name: "currentDir()",
          desc: "Current script's directory path",
          desc_vi: "Đường dẫn thư mục script hiện tại",
          example: 'local dir = currentDir()\nlocal data = readFile(dir .. "/data.txt")',
        },
      ],
    },
    {
      section: "Record & Playback",
      icon: "circle-dot",
      vi: "Ghi & Phát lại",
      funcs: [
        {
          name: "recordStart()",
          desc: "Start recording touch events",
          desc_vi: "Bắt đầu ghi thao tác chạm",
          example: "recordStart()\n-- Interact with phone...\nsleep(10)\nlocal events = recordStop()\nrecordSave(\"my_recording\")",
          example_vi: "recordStart()\n-- Thao tác trên điện thoại...\nsleep(10)\nlocal events = recordStop()\nrecordSave(\"my_recording\")",
        },
        {
          name: "recordStop()",
          desc: "Stop recording — returns events table",
          desc_vi: "Dừng ghi — trả về table events",
          example: 'local events = recordStop()\nlog("Recorded " .. #events .. " events")',
        },
        {
          name: "recordPlay(events)",
          desc: "Play back recorded events",
          desc_vi: "Phát lại thao tác đã ghi",
          example: 'local events = recordLoad("my_rec")\nrecordPlay(events)\nlog("Playback done!")',
        },
        {
          name: "recordSave(name)",
          desc: "Save recording to file",
          desc_vi: "Lưu bản ghi vào file",
          example: 'recordSave("login_flow")',
        },
        {
          name: "recordLoad(name)",
          desc: "Load recording from file",
          desc_vi: "Tải bản ghi từ file",
          example: 'local events = recordLoad("login_flow")\nif events then\n    recordPlay(events)\nelse\n    log("Not found!")\nend',
          example_vi: 'local events = recordLoad("login_flow")\nif events then\n    recordPlay(events)\nelse\n    log("Không tìm thấy!")\nend',
        },
      ],
    },
    {
      section: "Crane Containers",
      icon: "box",
      vi: "Crane Containers",
      funcs: [
        {
          name: 'crane.list(bundleId?)',
          desc: "List containers — returns {name, id, isDefault}",
          desc_vi: "Liệt kê container — trả về {name, id, isDefault}",
          example: 'local c = crane.list("com.facebook.Facebook")\nfor i, v in ipairs(c) do\n    log(v.name .. " (" .. v.id .. ")")\nend',
          example_vi: 'local c = crane.list("com.facebook.Facebook")\nfor i, v in ipairs(c) do\n    log(v.name .. " (" .. v.id .. ")")\nend',
        },
        {
          name: 'crane.switch(bundleId, name)',
          desc: "Switch active container (name or UUID)",
          desc_vi: "Chuyển container (tên hoặc UUID)",
          example: 'crane.switch("com.facebook.Facebook", "Account1")\nsleep(2)\nappRun("com.facebook.Facebook")',
        },
        {
          name: 'crane.create(bundleId, name)',
          desc: "Create a new container",
          desc_vi: "Tạo container mới",
          example: 'crane.create("com.facebook.Facebook", "NewAccount")',
        },
        {
          name: 'crane.delete(bundleId, name)',
          desc: "Delete container (data lost!)",
          desc_vi: "Xóa container (mất dữ liệu!)",
          example: 'crane.delete("com.facebook.Facebook", "OldAccount")',
        },
        {
          name: 'crane.wipe(bundleId, name)',
          desc: "Full wipe — data + keychain",
          desc_vi: "Xoá toàn bộ — data + keychain",
          example: 'crane.wipe("com.facebook.Facebook", "Account1")',
        },
        {
          name: 'crane.rename(bundleId, old, new)',
          desc: "Rename container",
          desc_vi: "Đổi tên container",
          example: 'crane.rename("com.facebook.Facebook", "Test1", "MainAccount")',
        },
        {
          name: 'crane.clearData(bundleId)',
          desc: "Clear caches, keep login! Removes Caches/WebKit/tmp, preserves keychain",
          desc_vi: "Xóa cache, giữ đăng nhập! Xoá Caches/WebKit/tmp, giữ keychain",
          example: '-- Reduce FB storage without logging out\nlocal ok, count = crane.clearData("com.facebook.Facebook")\nlog("Cleared " .. count .. " directories")',
          example_vi: '-- Giảm dung lượng FB mà không bị logout\nlocal ok, count = crane.clearData("com.facebook.Facebook")\nlog("Đã xoá " .. count .. " thư mục")',
        },
        {
          name: 'crane.backup(bundleId, container?, name?)',
          desc: "Backup container as tar.gz",
          desc_vi: "Backup container thành tar.gz",
          example: 'local ok, path = crane.backup("com.facebook.Facebook", nil, "fb")\nlog("Backup: " .. path)',
        },
        {
          name: 'crane.restore(bundleId, path)',
          desc: "Restore from backup tar.gz",
          desc_vi: "Khôi phục từ backup tar.gz",
          example: 'crane.restore("com.facebook.Facebook",\n    "/var/mobile/Library/IOSControl/Backups/fb.tar.gz")',
        },
        {
          name: 'crane.size(bundleId)',
          desc: "Size breakdown — {total, caches, documents, webkit, tmp, path} in bytes",
          desc_vi: "Chi tiết dung lượng — {total, caches, documents, webkit, tmp, path} tính bằng bytes",
          example: 'local s = crane.size("com.facebook.Facebook")\nlog("Total: " .. string.format("%.1f", s.total/1024/1024) .. " MB")\nlog("Caches: " .. string.format("%.1f", s.caches/1024/1024) .. " MB")',
          example_vi: 'local s = crane.size("com.facebook.Facebook")\nlog("Tổng: " .. string.format("%.1f", s.total/1024/1024) .. " MB")\nlog("Cache: " .. string.format("%.1f", s.caches/1024/1024) .. " MB")',
        },
      ],
    },
    {
      section: "Device Spoofing",
      icon: "shield",
      vi: "Giả lập thiết bị",
      funcs: [
        {
          name: 'spoof.app(bundleID)',
          desc: "Quick-spoof: random device profile for target app (paid only). Returns {model, version, name, target}",
          desc_vi: "Spoof nhanh: random profile cho app (cần license). Trả về {model, version, name, target}",
          example: 'local info = spoof.app("com.facebook.Facebook")\nlog("Spoofed: " .. info.name .. " iOS " .. info.version)\nappRun("com.facebook.Facebook")',
          example_vi: 'local info = spoof.app("com.facebook.Facebook")\nlog("Đã spoof: " .. info.name .. " iOS " .. info.version)\nappRun("com.facebook.Facebook")',
        },
        {
          name: 'spoof.app(bundleID, ios, model)',
          desc: "Specific-spoof: set exact iOS + model. Model accepts ProductType (iPhone17,2) or name (iPhone 16 Pro Max)",
          desc_vi: "Spoof cụ thể: chọn iOS + model. Chấp nhận ProductType (iPhone17,2) hoặc tên (iPhone 16 Pro Max)",
          example: 'spoof.app("com.facebook.Facebook", "18.3.1", "iPhone17,2")\n-- Or by name:\nspoof.app("com.facebook.Facebook", "18.0", "iPhone 15 Pro")',
          example_vi: 'spoof.app("com.facebook.Facebook", "18.3.1", "iPhone17,2")\n-- Hoặc theo tên:\nspoof.app("com.facebook.Facebook", "18.0", "iPhone 15 Pro")',
        },
      ],
    },
  ];
  const isVi = ideLang === "vi";
  window._apiExamples = [];

  // Inject compact CSS for API docs
  if (!document.getElementById("apiDocsStyles")) {
    const style = document.createElement("style");
    style.id = "apiDocsStyles";
    style.textContent = `
      .func .func-example {
        max-height: 0;
        opacity: 0;
        overflow: hidden;
        transition: max-height 0.25s ease, opacity 0.2s ease, margin 0.25s ease;
        margin-top: 0;
      }
      .func:hover .func-example {
        max-height: 300px;
        opacity: 1;
        margin-top: 6px;
      }
    `;
    document.head.appendChild(style);
  }

  // Render docs
  docs.innerHTML = apiRef
    .map(
      (section) => `
        <h2><i data-lucide="${section.icon}" style="width:18px;height:18px;vertical-align:-3px;margin-right:6px;"></i>${isVi && section.vi ? section.vi : section.section}</h2>
        ${section.funcs
          .map((f) => {
            const ex = isVi && f.example_vi ? f.example_vi : f.example;
            const idx = window._apiExamples.length;
            window._apiExamples.push(ex);
            return `
            <div class="func" data-idx="${idx}" data-search="${f.name.toLowerCase()} ${(f.desc || '').toLowerCase()} ${(f.desc_vi || '').toLowerCase()}">
                <div class="func-name">${f.name}</div>
                <div class="func-desc">${isVi && f.desc_vi ? f.desc_vi : f.desc}</div>
                <div class="func-example">${escapeHtml(ex)}</div>
            </div>
            `;
          })
          .join("")}
    `,
    )
    .join("");


  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Search functionality
  document.getElementById("apiSearchInput")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    docs.querySelectorAll(".func").forEach((el) => {
      const searchText = el.dataset.search || "";
      el.style.display = !q || searchText.includes(q) ? "" : "none";
    });
    // Hide empty section headers
    docs.querySelectorAll("h2").forEach((h2) => {
      let next = h2.nextElementSibling;
      let hasVisible = false;
      while (next && next.tagName !== "H2") {
        if (next.classList.contains("func") && next.style.display !== "none") {
          hasVisible = true;
          break;
        }
        next = next.nextElementSibling;
      }
      h2.style.display = !q || hasVisible ? "" : "none";
    });
  });

  // Event delegation — add listener ONLY once
  if (!docs._listenerAdded) {
    docs._listenerAdded = true;
    docs.addEventListener("click", (e) => {
      const funcEl = e.target.closest(".func");
      if (funcEl && funcEl.dataset.idx !== undefined) {
        const code = window._apiExamples[parseInt(funcEl.dataset.idx)];
        if (code) insertFunc(code);
      }
    });
  }
}

function insertFunc(code) {
  insertAtCursor(code);
  showToast("✅ Code inserted");
}

window.insertFunc = insertFunc;

// Toggle API Panel collapse/expand
function toggleApiPanel() {
  const panel = document.getElementById("apiPanel");
  const icon = document.getElementById("apiToggleIcon");
  const label = document.getElementById("apiToggleLabel");
  if (!panel) return;

  const isCollapsed = panel.dataset.collapsed === "true";
  if (isCollapsed) {
    // Expand
    panel.style.width = panel.dataset.prevWidth || "500px";
    panel.style.minWidth = "200px";
    panel.style.borderLeftWidth = "1px";
    panel.style.overflow = "hidden";
    panel.dataset.collapsed = "false";
    if (icon) icon.style.transform = "rotate(0deg)";
    if (label) label.textContent = "Close";
  } else {
    // Collapse
    panel.dataset.prevWidth = panel.style.width || "500px";
    panel.style.width = "0px";
    panel.style.minWidth = "0px";
    panel.style.borderLeftWidth = "0px";
    panel.style.overflow = "hidden";
    panel.dataset.collapsed = "true";
    if (icon) icon.style.transform = "rotate(180deg)";
    if (label) label.textContent = "Open Functions";
  }
  // Re-layout Monaco
  setTimeout(() => { if (state.editor) state.editor.layout(); }, 350);
}
window.toggleApiPanel = toggleApiPanel;

// ═══════════════════════════════════════════
// Console Bottom Panel
// ═══════════════════════════════════════════

function toggleConsolePanel(forceOpen) {
  const panel = document.getElementById("consolePanel");
  const icon = document.getElementById("consoleToggleIcon");
  if (!panel) return;

  const isCollapsed = panel.dataset.collapsed === "true";
  const shouldOpen = forceOpen !== undefined ? forceOpen : isCollapsed;

  // Ensure transition is enabled for smooth animation
  panel.style.transition = "height 0.3s cubic-bezier(0.4, 0, 0.2, 1)";

  if (shouldOpen) {
    panel.style.height = panel.dataset.prevHeight || "180px";
    panel.dataset.collapsed = "false";
    if (icon) icon.style.transform = "rotate(180deg)";
  } else {
    const h = panel.offsetHeight;
    if (h > 40) panel.dataset.prevHeight = h + "px";
    panel.style.height = "32px";
    panel.dataset.collapsed = "true";
    if (icon) icon.style.transform = "rotate(0deg)";
  }
  setTimeout(() => { if (state.editor) state.editor.layout(); }, 350);
}
window.toggleConsolePanel = toggleConsolePanel;

// Console header: drag to resize + click to toggle
(function initConsoleDrag() {
  const cPanel = document.getElementById("consolePanel");
  const cHeader = document.querySelector("#consolePanel .console-tab-header");
  if (!cPanel || !cHeader) {
    // If DOM not ready, retry
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initConsoleDrag);
    }
    return;
  }

  let cStartY, cStartH, hasDragged, dragOverlay;

  cHeader.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;

    cStartY = e.clientY;
    cStartH = cPanel.offsetHeight;
    hasDragged = false;

    // Disable transition during drag
    cPanel.style.transition = "none";

    // Overlay prevents Monaco from stealing mouse events
    dragOverlay = document.createElement("div");
    dragOverlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;cursor:row-resize;";
    document.body.appendChild(dragOverlay);

    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", onDragEnd);
    e.preventDefault();
  });

  function onDrag(e) {
    const delta = Math.abs(e.clientY - cStartY);
    if (delta < 5) return;

    hasDragged = true;
    const newH = cStartH - (e.clientY - cStartY);
    if (newH >= 32 && newH <= 400) {
      cPanel.style.height = newH + "px";
      cPanel.dataset.collapsed = newH <= 36 ? "true" : "false";
      const icon = document.getElementById("consoleToggleIcon");
      if (icon) icon.style.transform = newH <= 36 ? "rotate(0deg)" : "rotate(180deg)";
      if (state.editor) state.editor.layout();
    }
  }

  function onDragEnd() {
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", onDragEnd);

    if (dragOverlay && dragOverlay.parentNode) {
      dragOverlay.parentNode.removeChild(dragOverlay);
      dragOverlay = null;
    }

    cPanel.style.transition = "height 0.3s cubic-bezier(0.4, 0, 0.2, 1)";

    if (!hasDragged) {
      toggleConsolePanel();
    }
  }

  console.log("[Console] Drag handler initialized");
})();

// ═══════════════════════════════════════════
// Setup & System Check
// ═══════════════════════════════════════════

async function checkSystemSetup() {
  try {
    const res = await fetch(`${API}/api/setup/check`);
    const data = await res.json();

    if (data.success) {
      if (data.issues && data.issues.length > 0) {
        appendLog(`⚠️ Setup issues: ${data.issues.join(", ")}`, "error");
      }
      if (!data.pymobiledevice3) {
        appendLog("📦 pymobiledevice3 not installed — using mock mode");
      }
      if (data.os === "Windows" && !data.apple_drivers) {
        appendLog("⚠️ Install iTunes for iPhone USB support", "error");
      }
    }
  } catch (e) {
    // Silent fail — server might not have setup endpoint yet
  }
}

// Settings button
document.getElementById("settingsBtn")?.addEventListener("click", async () => {
  const modal = document.getElementById("deviceInfoModal");
  const body = document.getElementById("deviceInfoBody");
  const header = modal.querySelector(".modal-header h3");
  header.textContent = "⚙️ System Setup";
  body.innerHTML = '<p style="color: var(--text-dim)">Checking system...</p>';
  modal.classList.add("visible");

  try {
    const res = await fetch(`${API}/api/setup/check`);
    const data = await res.json();

    let html = '<div class="device-info-grid">';
    html += renderInfoItem("OS", `${data.os || "?"} ${data.arch || ""}`);
    html += renderInfoItem("Python", data.python || "?");
    html += renderInfoItem(
      "pymobiledevice3",
      data.pymobiledevice3
        ? `✅ ${data.pymobiledevice3_version || ""}`
        : "❌ Not installed",
    );
    html += renderInfoItem(
      "OpenCV",
      data.opencv ? "✅ Installed" : "❌ Not installed",
    );
    html += renderInfoItem(
      "Tesseract OCR",
      data.tesseract ? "✅ Installed" : "⚠️ Optional",
    );

    if (data.os === "Windows") {
      html += renderInfoItem(
        "Apple Drivers",
        data.apple_drivers ? "✅ Installed" : "❌ Install iTunes",
      );
    }

    html += "</div>";

    // Issues
    if (data.issues && data.issues.length > 0) {
      html +=
        '<div style="margin-top:16px; padding:12px; background:var(--red-bg); border-radius:var(--radius-sm); border:1px solid rgba(248,113,113,0.2)">';
      html +=
        '<div style="font-size:12px;font-weight:600;color:var(--red);margin-bottom:6px">Issues Found:</div>';
      data.issues.forEach((issue) => {
        html += `<div style="font-size:12px;color:var(--text-secondary);margin:4px 0">• ${issue}</div>`;
      });
      html += "</div>";
    }

    // Actions
    if (data.actions && data.actions.length > 0) {
      html +=
        '<div style="margin-top:12px; padding:12px; background:var(--bg-primary); border-radius:var(--radius-sm); border:1px solid var(--border)">';
      html +=
        '<div style="font-size:12px;font-weight:600;color:var(--yellow);margin-bottom:6px">Fix Commands:</div>';
      data.actions.forEach((action) => {
        html += `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);margin:4px 0;cursor:pointer" onclick="copyToClipboard('${action}');this.style.color='var(--green)'">${action} (click to copy)</div>`;
      });
      html += "</div>";
    }

    // Setup DDI button
    const udid = state.currentDevice;
    if (udid) {
      html += `<div style="margin-top:16px;display:flex;gap:8px">`;
      html += `<button class="btn-primary" onclick="setupDDI('${udid}')" style="flex:1">📀 Setup DDI</button>`;
      html += `<button class="btn-primary" onclick="setupWDA('${udid}')" style="flex:1">🔧 Setup WDA</button>`;
      html += `</div>`;
    }

    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = `<p style="color:var(--red)">❌ Failed: ${e.message}</p>`;
  }
});

function renderInfoItem(label, value) {
  return `<div class="device-info-item"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

async function setupDDI(udid) {
  appendLog("📀 Setting up Developer Disk Image...");
  try {
    const res = await fetch(`${API}/api/setup/ddi/${udid}`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      appendLog(`✅ DDI ready for iOS ${data.ios_version}`, "success");
    } else {
      appendLog(
        `❌ DDI setup failed: ${data.error || "Unknown error"}`,
        "error",
      );
    }
  } catch (e) {
    appendLog(`❌ DDI setup error: ${e.message}`, "error");
  }
}

async function setupWDA(udid) {
  appendLog("🔧 Setting up WebDriverAgent...");
  try {
    const res = await fetch(`${API}/api/setup/wda/${udid}`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      appendLog(
        `✅ WDA ready${data.session_id ? " (session: " + data.session_id + ")" : ""}`,
        "success",
      );
    } else {
      appendLog(`⚠️ WDA: ${data.error || "Not available"}`, "error");
      // Show installation guide
      const guideRes = await fetch(`${API}/api/setup/wda/guide`);
      const guide = await guideRes.json();
      if (guide.methods) {
        appendLog("📖 WDA Installation Guide:");
        guide.methods.forEach((m) => {
          appendLog(`  ${m.name}`);
        });
      }
    }
  } catch (e) {
    appendLog(`❌ WDA setup error: ${e.message}`, "error");
  }
}

window.setupDDI = setupDDI;
window.setupWDA = setupWDA;

// ═══════════════════════════════════════════
// Helper Tool - Color Picker & Code Generator
// ═══════════════════════════════════════════

function initHelper() {
  const toggle = document.getElementById("helperToggle");
  const modal = document.getElementById("helperModal");
  const closeBtn = document.getElementById("helperModalClose");
  const overlay = document.getElementById("helperScreenOverlay");
  const screenImg = document.getElementById("helperScreenImg");
  const screenCanvas = document.getElementById("helperScreenCanvas");
  const loadingEl = document.getElementById("helperScreenLoading");

  if (!toggle || !modal) return;

  let canvasCtx = null;

  // ═══ Take screenshot and load into image + canvas ═══
  async function captureScreen() {
    if (loadingEl) loadingEl.style.display = "block";
    if (screenImg) screenImg.style.display = "none";

    try {
      // Use PNG for lossless color accuracy (matches getColor exactly)
      const url = `${API}/screenshot?format=png&t=${Date.now()}`;
      const img = screenImg;

      await new Promise((resolve, reject) => {
        img.onload = () => {
          // Draw to canvas for pixel reading
          screenCanvas.width = img.naturalWidth;
          screenCanvas.height = img.naturalHeight;
          canvasCtx = screenCanvas.getContext("2d", {
            willReadFrequently: true,
          });
          canvasCtx.drawImage(img, 0, 0);

          if (loadingEl) loadingEl.style.display = "none";
          img.style.display = "block";

          // Store dimensions
          state.screenSize = { w: img.naturalWidth, h: img.naturalHeight };
          resolve();
        };
        img.onerror = reject;
        img.src = url;
      });

      appendLog(
        `📸 Screenshot: ${screenCanvas.width}x${screenCanvas.height}`,
        "info",
      );
    } catch (e) {
      if (loadingEl)
        loadingEl.textContent = "❌ Screenshot failed. Click Refresh.";
      appendLog("❌ Screenshot failed: " + e.message, "error");
    }
  }

  // ═══ Map overlay mouse → pixel coords on image ═══
  function overlayToPixel(e) {
    if (!screenImg || screenImg.style.display === "none") return null;

    const imgRect = screenImg.getBoundingClientRect();
    const relX = e.clientX - imgRect.left;
    const relY = e.clientY - imgRect.top;

    if (relX < 0 || relX > imgRect.width || relY < 0 || relY > imgRect.height)
      return null;

    // Map display coords → pixel coords (image natural dimensions)
    const pixelX = Math.round((relX / imgRect.width) * screenImg.naturalWidth);
    const pixelY = Math.round(
      (relY / imgRect.height) * screenImg.naturalHeight,
    );

    return {
      x: Math.max(0, Math.min(pixelX, screenImg.naturalWidth - 1)),
      y: Math.max(0, Math.min(pixelY, screenImg.naturalHeight - 1)),
    };
  }

  // ═══ Read color from canvas at pixel coords ═══
  function getColorAtPixel(x, y) {
    if (!canvasCtx) return null;
    const pixel = canvasCtx.getImageData(x, y, 1, 1).data;
    const r = pixel[0],
      g = pixel[1],
      b = pixel[2];
    const intColor = (r << 16) | (g << 8) | b;
    return {
      r,
      g,
      b,
      hex: `#${r.toString(16).padStart(2, "0").toUpperCase()}${g.toString(16).padStart(2, "0").toUpperCase()}${b.toString(16).padStart(2, "0").toUpperCase()}`,
      intHex: `0x${intColor.toString(16).padStart(6, "0").toUpperCase()}`,
      int: intColor,
    };
  }

  // ═══ Toggle helper panel (slide in/out) ═══
  const screenView = document.getElementById("screenView");
  const helperScreenSection = document.getElementById("helperScreenSection");
  const helperInner = modal.querySelector(".helper-inner");

  toggle.addEventListener("click", () => {
    const isOpen = modal.classList.contains("helper-open");
    if (isOpen) {
      closeHelper();
    } else {
      state.helperActive = true;
      // Move screenshot section into VNC panel as overlay
      if (helperScreenSection && screenView) {
        screenView.appendChild(helperScreenSection);
        helperScreenSection.classList.add("overlaying-vnc");
      }
      modal.classList.add("helper-open");
      captureScreen();
      if (typeof lucide !== "undefined") lucide.createIcons();
      // Re-layout Monaco after slide animation
      setTimeout(() => { if (state.editor) state.editor.layout(); }, 380);
    }
  });

  // ═══ Refresh button ═══
  document
    .getElementById("hm_refresh")
    ?.addEventListener("click", () => captureScreen());

  // ═══ Close helper panel ═══
  function closeHelper() {
    state.helperActive = false;
    // First: hide screenshot overlay immediately (fade out)
    if (helperScreenSection) {
      helperScreenSection.style.opacity = "0";
      helperScreenSection.style.transition = "opacity 0.15s ease";
    }
    // Slide tools panel closed
    modal.classList.remove("helper-open");
    // After animation completes, move screenshot back and restore
    setTimeout(() => {
      if (helperScreenSection && helperInner) {
        helperScreenSection.classList.remove("overlaying-vnc");
        helperScreenSection.style.opacity = "";
        helperScreenSection.style.transition = "";
        helperInner.insertBefore(helperScreenSection, helperInner.firstChild);
      }
      if (state.editor) state.editor.layout();
    }, 380);
  }

  closeBtn?.addEventListener("click", closeHelper);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("helper-open")) closeHelper();
  });

  // ═══ Mousemove: live coords + color ═══
  overlay?.addEventListener("mousemove", (e) => {
    const pos = overlayToPixel(e);
    if (!pos) return;

    // Show POINT coords (pixel / scale) — matches tap() and getColor()
    const s = state.deviceScale || 3;
    const ptX = Math.round(pos.x / s);
    const ptY = Math.round(pos.y / s);
    const ct = document.getElementById("helperCoordText");
    if (ct) ct.textContent = `x: ${ptX}  y: ${ptY}`;

    // Read color from canvas directly — instant, no API call
    const color = getColorAtPixel(pos.x, pos.y);
    if (color) {
      const sw = document.getElementById("helperColorSwatch");
      const it = document.getElementById("helperColorInt");
      if (sw) sw.style.background = color.hex;
      if (it) it.textContent = color.int;
    }

    // Draw region rectangle while selecting
    if (state.helperMode === "region" && state.regionStart && screenImg) {
      const regionRect = document.getElementById("helperRegionRect");
      if (regionRect) {
        const imgRect = screenImg.getBoundingClientRect();
        const container = document.getElementById("helperScreenContainer");
        const containerRect = container ? container.getBoundingClientRect() : imgRect;
        const s = state.deviceScale || 3;

        // Convert pixel coords to display coords
        const scaleX = imgRect.width / screenImg.naturalWidth;
        const scaleY = imgRect.height / screenImg.naturalHeight;
        const offsetX = imgRect.left - containerRect.left;
        const offsetY = imgRect.top - containerRect.top;

        // regionStart stores point coords (already divided by scale s)
        // pos.x/pos.y are pixel coords; regionStart was stored as ptX = px / s, so multiply back
        const startPixX = state.regionStart.x * s;
        const startPixY = state.regionStart.y * s;

        const startDispX = startPixX * scaleX + offsetX;
        const startDispY = startPixY * scaleY + offsetY;
        const curDispX = pos.x * scaleX + offsetX;
        const curDispY = pos.y * scaleY + offsetY;

        const rx = Math.min(startDispX, curDispX);
        const ry = Math.min(startDispY, curDispY);
        const rw = Math.abs(curDispX - startDispX);
        const rh = Math.abs(curDispY - startDispY);

        regionRect.style.left = rx + "px";
        regionRect.style.top = ry + "px";
        regionRect.style.width = rw + "px";
        regionRect.style.height = rh + "px";
        regionRect.style.display = "block";
      }
    }
  });

  // ═══ Click: pick color from canvas (same source as mousemove) ═══
  overlay?.addEventListener("click", async (e) => {
    // Skip color pick if crop mode is active (Image tab)
    if (state._hmCropMode) return;

    const pos = overlayToPixel(e);
    if (!pos) return;
    e.preventDefault();
    e.stopPropagation();

    // Convert to POINT coords (matches tap/getColor coordinate system)
    const s = state.deviceScale || 3;
    const px = Math.round(pos.x / s);
    const py = Math.round(pos.y / s);

    // Read color from canvas (same screenshot data as mousemove, no stale data)
    let colorInt = 0;
    let hex = "#000000";
    const c = getColorAtPixel(pos.x, pos.y);
    if (c) {
      colorInt = c.int;
      hex = c.hex;
    }

    // Update bottom bar
    const sw = document.getElementById("helperColorSwatch");
    const it = document.getElementById("helperColorInt");
    if (sw) sw.style.background = hex;
    if (it) it.textContent = colorInt;

    const colorInfo = {
      x: px,
      y: py,
      hex: hex,
      int: colorInt,
    };

    if (state.helperMode === "single") {
      state.pickedColors = [colorInfo];
    } else if (state.helperMode === "multi") {
      state.pickedColors.push(colorInfo);
    } else if (state.helperMode === "region") {
      if (!state.regionStart) {
        state.regionStart = { x: px, y: py };
        // Create visual rectangle overlay
        let regionRect = document.getElementById("helperRegionRect");
        if (!regionRect) {
          regionRect = document.createElement("div");
          regionRect.id = "helperRegionRect";
          regionRect.style.cssText = "position:absolute; border:2px dashed #6366f1; background:rgba(99,102,241,0.15); pointer-events:none; z-index:10; display:none; border-radius:3px;";
          const container = document.getElementById("helperScreenContainer");
          if (container) container.appendChild(regionRect);
        }
        appendLog(`Region start: (${px}, ${py})`);
        renderModalResults();
        return;
      } else {
        const rx = Math.min(state.regionStart.x, px);
        const ry = Math.min(state.regionStart.y, py);
        const rw = Math.abs(px - state.regionStart.x);
        const rh = Math.abs(py - state.regionStart.y);
        state.pickedColors = [{ region: [rx, ry, rw, rh] }];
        state.regionStart = null;
        // Hide rectangle
        const regionRect = document.getElementById("helperRegionRect");
        if (regionRect) regionRect.style.display = "none";
        appendLog(`Region: {${rx}, ${ry}, ${rw}, ${rh}}`);
      }
    }

    appendLog(`Color at (${px}, ${py}): ${colorInt}`, "success");
    renderModalResults();
  });

  // ═══ Mode buttons ═══
  document
    .getElementById("hm_pick")
    ?.addEventListener("click", () => setHelperMode("single"));
  document
    .getElementById("hm_multi")
    ?.addEventListener("click", () => setHelperMode("multi"));
  document
    .getElementById("hm_region")
    ?.addEventListener("click", () => setHelperMode("region"));

  // ═══ Clear ═══
  document.getElementById("hm_clear")?.addEventListener("click", () => {
    state.pickedColors = [];
    state.regionStart = null;
    renderModalResults();
    // Remove markers
    document
      .querySelectorAll(".pick-marker, .region-overlay")
      .forEach((m) => m.remove());
    appendLog("🗑️ Helper: cleared", "info");
  });

  // ═══ Generate Code ═══
  document.getElementById("hm_genCode")?.addEventListener("click", () => {
    const code = generateHelperCode();
    if (code) {
      copyToClipboard(code);
      appendLog("📋 Code copied: " + code.split("\n")[0], "success");
    }
  });

  // ═══ Insert to Editor ═══
  document.getElementById("hm_insertCode")?.addEventListener("click", () => {
    const code = generateHelperCode();
    if (code && state.editor) {
      const pos = state.editor.getPosition();
      state.editor.executeEdits("helper", [
        {
          range: new monaco.Range(
            pos.lineNumber,
            pos.column,
            pos.lineNumber,
            pos.column,
          ),
          text: code + "\n",
        },
      ]);
      state.editor.focus();
      appendLog("⬇️ Code inserted into editor", "success");
    }
  });

  // ═══ Home button ═══

  // ═══ Get App Package ═══
  document.getElementById("hm_getApp")?.addEventListener("click", async () => {
    const results = document.getElementById("helperModalResults");
    if (results)
      results.innerHTML =
        '<div style="color:#888; text-align:center; padding:16px;">Loading apps...</div>';
    try {
      // Fetch foreground app + all apps in parallel
      const [fgRes, appsRes] = await Promise.all([
        fetch(`${API}/foreground_app`)
          .then((r) => r.json())
          .catch(() => ({})),
        fetch(`${API}/apps`).then((r) => r.json()),
      ]);
      const fgBid = fgRes.bundleId || fgRes.bundle_id || "";
      const apps = appsRes.apps || [];

      if (!results) return;
      let html = `<div style="margin-bottom:8px;">
        <input id="appSearchInput" type="text" placeholder="Search apps..." style="width:100%; padding:6px 10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:6px; color:#fff; font-size:12px; outline:none;">
      </div>
      <div id="appListContainer" style="max-height:300px; overflow-y:auto; display:flex; flex-direction:column; gap:2px;">`;

      apps.forEach((app) => {
        const isFg = app.bundleId === fgBid;
        const bgStyle = isFg
          ? "background:rgba(99,102,241,0.2); border:1px solid rgba(99,102,241,0.4);"
          : "background:rgba(255,255,255,0.04); border:1px solid transparent;";
        html += `<div class="app-list-item" data-bid="${app.bundleId}" data-name="${(app.name || "").toLowerCase()}" style="${bgStyle} padding:6px 10px; border-radius:6px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition:background 0.15s;" onmouseenter="this.style.background='rgba(99,102,241,0.15)'" onmouseleave="this.style.background='${isFg ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)"}'">
          <div style="display:flex; flex-direction:column; gap:1px; min-width:0; flex:1;">
            <span style="color:#e2e8f0; font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${isFg ? "▶ " : ""}${app.name || app.bundleId}</span>
            <span style="color:#64748b; font-size:10px; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${app.bundleId}</span>
          </div>
          <span style="color:#4ade80; font-size:10px; opacity:0.6; flex-shrink:0; margin-left:8px;">📋</span>
        </div>`;
      });
      html += `</div>
      <div style="color:#64748b; font-size:10px; text-align:center; margin-top:6px;">${apps.length} apps — click to copy bundle ID</div>`;
      results.innerHTML = html;

      // Search filter
      document
        .getElementById("appSearchInput")
        ?.addEventListener("input", (e) => {
          const q = e.target.value.toLowerCase();
          document.querySelectorAll(".app-list-item").forEach((el) => {
            const name = el.dataset.name || "";
            const bid = el.dataset.bid || "";
            el.style.display =
              name.includes(q) || bid.includes(q) ? "flex" : "none";
          });
        });

      // Click to copy
      document.querySelectorAll(".app-list-item").forEach((el) => {
        el.addEventListener("click", () => {
          const bid = el.dataset.bid;
          copyToClipboard(bid);
          appendLog(`📱 Copied: ${bid}`, "success");
          // Flash effect
          el.style.background = "rgba(74, 222, 128, 0.2)";
          setTimeout(() => {
            el.style.background = "rgba(255,255,255,0.04)";
          }, 500);
        });
      });

      appendLog(`📱 Found ${apps.length} installed apps`, "info");
    } catch (e) {
      appendLog("❌ Get apps failed: " + e.message, "error");
      if (results)
        results.innerHTML = `<div style="color:#f87171; text-align:center; padding:16px;">Failed to load apps</div>`;
    }
  });

  // ═══════════════════════════════════════
  // Helper Tab Switching
  // ═══════════════════════════════════════
  document.querySelectorAll(".helper-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.htab;
      // Update tab buttons
      document.querySelectorAll(".helper-tab-btn").forEach((b) => {
        b.classList.remove("active");
        b.style.background = "transparent";
        b.style.color = "#666";
      });
      btn.classList.add("active");
      btn.style.background = "rgba(99,102,241,0.2)";
      btn.style.color = "#a5b4fc";
      // Show/hide tab content
      document.querySelectorAll(".helper-tab-content").forEach((tc) => {
        tc.style.display = "none";
      });
      const target = document.getElementById(
        "htab" + tab.charAt(0).toUpperCase() + tab.slice(1),
      );
      if (target) target.style.display = "flex";
      // Auto-load data on tab switch
      if (tab === "image") hmLoadGallery();
      if (tab === "apps") hmLoadApps();
      // Cursor mode
      const overlay = document.getElementById("helperScreenOverlay");
      if (overlay)
        overlay.style.cursor =
          tab === "image" && state._hmCropMode ? "crosshair" : "crosshair";
    });
  });

  // ═══════════════════════════════════════
  // Image Tab — Crop & Gallery
  // ═══════════════════════════════════════
  let hmCropState = { active: false, startX: 0, startY: 0, rect: null };

  document.getElementById("hmCropStart")?.addEventListener("click", () => {
    hmCropState.active = true;
    document.getElementById("hmCropArea").style.display = "block";
    document.getElementById("hmCropCoords").textContent =
      "Kéo chuột trên ảnh để chọn vùng";
    document.getElementById("hmCropName").value = "crop_" + Date.now();
    // Change overlay cursor
    state._hmCropMode = true;
  });

  document.getElementById("hmCropCancel")?.addEventListener("click", () => {
    hmCropState.active = false;
    state._hmCropMode = false;
    document.getElementById("hmCropArea").style.display = "none";
    // Remove selection overlay
    const sel = document.getElementById("hmCropSelection");
    if (sel) sel.remove();
  });

  // Crop drag on overlay (reuse helperScreenOverlay)
  const hmOverlay = document.getElementById("helperScreenOverlay");
  if (hmOverlay) {
    hmOverlay.addEventListener("mousedown", (e) => {
      if (!state._hmCropMode) return;
      const containerRect = hmOverlay.getBoundingClientRect();
      hmCropState.startX = e.clientX - containerRect.left;
      hmCropState.startY = e.clientY - containerRect.top;
      hmCropState.dragging = true;
      // Create/reset selection div
      let sel = document.getElementById("hmCropSelection");
      if (!sel) {
        sel = document.createElement("div");
        sel.id = "hmCropSelection";
        sel.style.cssText =
          "position:absolute; border:2px dashed #6366f1; background:rgba(99,102,241,0.15); z-index:10; pointer-events:none;";
        hmOverlay.appendChild(sel);
      }
      sel.style.left = hmCropState.startX + "px";
      sel.style.top = hmCropState.startY + "px";
      sel.style.width = "0px";
      sel.style.height = "0px";
      sel.style.display = "block";
    });

    hmOverlay.addEventListener("mousemove", (e) => {
      if (!hmCropState.dragging) return;
      const containerRect = hmOverlay.getBoundingClientRect();
      const cx = e.clientX - containerRect.left;
      const cy = e.clientY - containerRect.top;
      const sel = document.getElementById("hmCropSelection");
      if (!sel) return;
      const x = Math.min(cx, hmCropState.startX);
      const y = Math.min(cy, hmCropState.startY);
      const w = Math.abs(cx - hmCropState.startX);
      const h = Math.abs(cy - hmCropState.startY);
      sel.style.left = x + "px";
      sel.style.top = y + "px";
      sel.style.width = w + "px";
      sel.style.height = h + "px";
    });

    hmOverlay.addEventListener("mouseup", (e) => {
      if (!hmCropState.dragging) return;
      hmCropState.dragging = false;
      const containerRect = hmOverlay.getBoundingClientRect();
      const cx = e.clientX - containerRect.left;
      const cy = e.clientY - containerRect.top;

      // Convert to pixel coords
      const img = document.getElementById("helperScreenImg");
      if (!img || !img.naturalWidth) return;
      const dispW = img.clientWidth;
      const dispH = img.clientHeight;
      const imgRect = img.getBoundingClientRect();
      const offsetX = imgRect.left - containerRect.left;
      const offsetY = imgRect.top - containerRect.top;
      const scaleX = img.naturalWidth / dispW;
      const scaleY = img.naturalHeight / dispH;

      const x1 = Math.min(hmCropState.startX, cx) - offsetX;
      const y1 = Math.min(hmCropState.startY, cy) - offsetY;
      const w = Math.abs(cx - hmCropState.startX);
      const h = Math.abs(cy - hmCropState.startY);

      const px = Math.round(x1 * scaleX);
      const py = Math.round(y1 * scaleY);
      const pw = Math.round(w * scaleX);
      const ph = Math.round(h * scaleY);

      hmCropState.rect = { x: px, y: py, w: pw, h: ph };
      const coordsEl = document.getElementById("hmCropCoords");
      if (coordsEl) coordsEl.textContent = `Region: ${px},${py} ${pw}×${ph}px`;
    });
  }

  // Save crop
  document.getElementById("hmCropSave")?.addEventListener("click", async () => {
    const rect = hmCropState.rect;
    if (!rect || rect.w < 5 || rect.h < 5) {
      appendLog("⚠️ Chọn vùng crop trước", "warning");
      return;
    }
    const name =
      document.getElementById("hmCropName")?.value.trim() ||
      "crop_" + Date.now();
    try {
      const res = await fetch(`${API}/images/crop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: rect.h,
        }),
      });
      const data = await res.json();
      if (data.success) {
        appendLog(`✂️ Saved ${data.name} (${rect.w}×${rect.h}px)`, "success");
        hmCropState.active = false;
        state._hmCropMode = false;
        document.getElementById("hmCropArea").style.display = "none";
        const sel = document.getElementById("hmCropSelection");
        if (sel) sel.remove();
        hmLoadGallery();
      } else {
        appendLog("❌ Crop failed: " + (data.error || "unknown"), "error");
      }
    } catch (e) {
      appendLog("❌ Crop error: " + e.message, "error");
    }
  });

  // Load gallery
  async function hmLoadGallery() {
    const gallery = document.getElementById("hmGallery");
    const countEl = document.getElementById("hmGalleryCount");
    if (!gallery) return;
    try {
      const res = await fetch(`${API}/images/list`);
      const data = await res.json();
      const images = data.images || [];
      if (countEl) countEl.textContent = `(${images.length})`;
      if (images.length === 0) {
        gallery.innerHTML =
          '<div style="color:#555; text-align:center; padding:20px 0; font-size:11px;">Chưa có ảnh</div>';
        return;
      }
      let html = "";
      images.forEach((img) => {
        const name = typeof img === "string" ? img : img.name;
        const eName = name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        html += `<div class="hm-gallery-item" data-name="${name}" style="display:flex; align-items:center; gap:8px; padding:6px 8px; background:rgba(255,255,255,0.04); border-radius:6px; cursor:pointer; transition:background 0.15s;" onmouseenter="this.style.background='rgba(99,102,241,0.12)'" onmouseleave="this.style.background='rgba(255,255,255,0.04)'" onclick="hmEditImg('${eName}')">
          <img src="${API}/images/get?name=${encodeURIComponent(name)}&t=${Date.now()}" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid rgba(255,255,255,0.1); flex-shrink:0;" onerror="this.style.display='none'">
          <div style="flex:1; min-width:0;">
            <div style="font-size:11px; color:#e2e8f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
          </div>
          <div style="display:flex; gap:2px; flex-shrink:0;">
            <button onclick="event.stopPropagation(); hmCopyName('${eName}')" style="background:none; border:none; color:#888; cursor:pointer; padding:3px;" title="Copy name"><i data-lucide="copy" style="width:11px;height:11px;"></i></button>
            <button onclick="event.stopPropagation(); hmRenameImg('${eName}')" style="background:none; border:none; color:#f0a030; cursor:pointer; padding:3px;" title="Rename"><i data-lucide="pencil" style="width:11px;height:11px;"></i></button>
            <button onclick="event.stopPropagation(); hmDeleteImg('${eName}')" style="background:none; border:none; color:#f87171; cursor:pointer; padding:3px;" title="Delete"><i data-lucide="trash-2" style="width:11px;height:11px;"></i></button>
          </div>
        </div>`;
      });
      gallery.innerHTML = html;
      if (typeof lucide !== "undefined") lucide.createIcons();
    } catch (e) {
      gallery.innerHTML = `<div style="color:#f87171; text-align:center; padding:16px; font-size:11px;">Failed to load</div>`;
    }
  }

  // Gallery search
  document.getElementById("hmImgSearch")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(".hm-gallery-item").forEach((el) => {
      el.style.display = (el.dataset.name || "").toLowerCase().includes(q)
        ? "flex"
        : "none";
    });
  });

  document
    .getElementById("hmRefreshGallery")
    ?.addEventListener("click", () => hmLoadGallery());

  // ═══ Custom Modal (replaces browser confirm/prompt) ═══
  function hmShowModal(opts) {
    return new Promise((resolve) => {
      // Remove previous
      const old = document.getElementById("hmCustomModal");
      if (old) old.remove();

      const overlay = document.createElement("div");
      overlay.id = "hmCustomModal";
      overlay.style.cssText =
        "position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.7); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; animation:fadeIn 0.15s;";

      const box = document.createElement("div");
      box.style.cssText =
        "background:#1e1e2e; border:1px solid rgba(255,255,255,0.15); border-radius:12px; padding:20px; width:300px; box-shadow:0 20px 60px rgba(0,0,0,0.5);";

      let html = `<div style="font-size:14px; font-weight:700; color:#fff; margin-bottom:12px;">${opts.title}</div>`;
      if (opts.message)
        html += `<div style="font-size:12px; color:#a0a0a0; margin-bottom:14px;">${opts.message}</div>`;
      if (opts.input) {
        html += `<input id="hmModalInput" type="text" value="${opts.inputValue || ""}" placeholder="${opts.placeholder || ""}" style="width:100%; padding:8px 12px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.2); border-radius:6px; color:#fff; font-size:12px; outline:none; margin-bottom:14px; box-sizing:border-box;">`;
      }
      html += `<div style="display:flex; gap:8px; justify-content:flex-end;">`;
      html += `<button id="hmModalCancel" style="padding:7px 16px; border:1px solid rgba(255,255,255,0.15); border-radius:6px; background:transparent; color:#aaa; font-size:12px; font-weight:600; cursor:pointer;">Huỷ</button>`;
      const btnColor = opts.danger
        ? "linear-gradient(135deg,#dc2626,#ef4444)"
        : "linear-gradient(135deg,#6366f1,#8b5cf6)";
      html += `<button id="hmModalConfirm" style="padding:7px 16px; border:none; border-radius:6px; background:${btnColor}; color:#fff; font-size:12px; font-weight:600; cursor:pointer;">${opts.confirmText || "OK"}</button>`;
      html += `</div>`;

      box.innerHTML = html;
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      const inputEl = document.getElementById("hmModalInput");
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }

      const close = (val) => {
        overlay.remove();
        resolve(val);
      };
      document.getElementById("hmModalCancel").onclick = () => close(null);
      document.getElementById("hmModalConfirm").onclick = () => {
        if (opts.input) close(inputEl?.value || "");
        else close(true);
      };
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close(null);
      });
      if (inputEl)
        inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter")
            document.getElementById("hmModalConfirm").click();
        });
    });
  }

  // ═══ Gallery Actions ═══
  // Copy just filename (not full path)
  window.hmCopyName = function (name) {
    copyToClipboard(name);
    appendLog("📋 Copied: " + name, "success");
  };

  // Click image → load for edit/re-crop (show in left screenshot area)
  window.hmEditImg = function (name) {
    appendLog("🖼️ " + name + " — use crop to edit", "info");
    // Could load the image in the left panel for re-cropping in future
  };

  // Delete with custom modal
  window.hmDeleteImg = async function (name) {
    const confirmed = await hmShowModal({
      title: "🗑️ Xoá ảnh",
      message: `Bạn có chắc muốn xoá <b style="color:#f87171">${name}</b>?`,
      confirmText: "Xoá",
      danger: true,
    });
    if (!confirmed) return;
    try {
      const res = await fetch(
        `${API}/images/delete?name=${encodeURIComponent(name)}`,
      );
      const data = await res.json();
      if (data.success) {
        appendLog("🗑️ Deleted: " + name, "info");
        hmLoadGallery();
      } else {
        appendLog("❌ Delete failed: " + (data.error || "unknown"), "error");
      }
    } catch (e) {
      appendLog("❌ " + e.message, "error");
    }
  };

  // Rename with custom modal
  window.hmRenameImg = async function (name) {
    const baseName = name.replace(/\.[^.]+$/, "");
    const ext = name.includes(".") ? "." + name.split(".").pop() : ".png";
    const newName = await hmShowModal({
      title: "✏️ Đổi tên",
      message: `Tên mới cho <b>${name}</b>:`,
      input: true,
      inputValue: baseName,
      placeholder: "Nhập tên mới...",
      confirmText: "Đổi tên",
    });
    if (!newName || newName === baseName) return;
    const fullNewName = newName.endsWith(ext) ? newName : newName + ext;
    try {
      const res = await fetch(`${API}/images/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName: name, newName: fullNewName }),
      });
      const data = await res.json();
      if (data.success) {
        appendLog("✏️ Renamed: " + name + " → " + fullNewName, "success");
        hmLoadGallery();
      } else {
        appendLog("❌ Rename failed: " + (data.error || "unknown"), "error");
      }
    } catch (e) {
      appendLog("❌ " + e.message, "error");
    }
  };

  // ═══════════════════════════════════════
  // Apps Tab
  // ═══════════════════════════════════════
  async function hmLoadApps() {
    const list = document.getElementById("hmAppList");
    if (!list) return;
    list.innerHTML =
      '<div style="color:#555; text-align:center; padding:20px 0; font-size:11px;">Loading...</div>';
    try {
      const [fgRes, appsRes] = await Promise.all([
        fetch(`${API}/foreground_app`)
          .then((r) => r.json())
          .catch(() => ({})),
        fetch(`${API}/apps`).then((r) => r.json()),
      ]);
      const fgBid = fgRes.bundleId || fgRes.bundle_id || "";
      const apps = appsRes.apps || [];
      let html = "";
      apps.forEach((app) => {
        const isFg = app.bundleId === fgBid;
        const bg = isFg ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)";
        html += `<div class="hm-app-item" data-bid="${app.bundleId}" data-name="${(app.name || "").toLowerCase()}" style="padding:5px 8px; border-radius:5px; cursor:pointer; background:${bg}; transition:background 0.15s;" onclick="hmCopyBid('${app.bundleId}')" onmouseenter="this.style.background='rgba(99,102,241,0.12)'" onmouseleave="this.style.background='${bg}'">
          <div style="font-size:11px; color:#e2e8f0; font-weight:${isFg ? "700" : "500"}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${isFg ? "▶ " : ""}${app.name || app.bundleId}</div>
          <div style="font-size:9px; color:#64748b; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${app.bundleId}</div>
        </div>`;
      });
      list.innerHTML = html;
    } catch (e) {
      list.innerHTML = `<div style="color:#f87171; text-align:center; padding:16px; font-size:11px;">Failed</div>`;
    }
  }

  window.hmCopyBid = function (bid) {
    copyToClipboard(bid);
    showToast("✅ Copied: " + bid);
    appendLog("📱 Copied: " + bid, "success");
  };

  document.getElementById("hmAppSearch")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(".hm-app-item").forEach((el) => {
      const name = el.dataset.name || "";
      const bid = el.dataset.bid || "";
      el.style.display = name.includes(q) || bid.includes(q) ? "block" : "none";
    });
  });

  document
    .getElementById("hmRefreshApps")
    ?.addEventListener("click", () => hmLoadApps());

  document.getElementById("hmGetApp")?.addEventListener("click", async () => {
    try {
      const res = await fetch(`${API}/foreground_app`);
      const data = await res.json();
      const bid = data.bundleId || data.bundle_id || "unknown";
      copyToClipboard(bid);
      appendLog(`📱 Foreground: ${bid}`, "success");
    } catch (e) {
      appendLog("❌ " + e.message, "error");
    }
  });
}

function setHelperMode(mode) {
  state.helperMode = mode;
  // Update modal mode buttons
  document
    .querySelectorAll(".helper-modal-btn")
    .forEach((btn) => btn.classList.remove("active"));
  if (mode === "single")
    document.getElementById("hm_pick")?.classList.add("active");
  if (mode === "multi")
    document.getElementById("hm_multi")?.classList.add("active");
  if (mode === "region")
    document.getElementById("hm_region")?.classList.add("active");
}

function renderModalResults() {
  const container = document.getElementById("helperModalResults");
  if (!container) return;

  if (state.pickedColors.length === 0) {
    container.innerHTML =
      '<div style="color:#555; text-align:center; padding:16px 0;">Click on screen to pick colors</div>';
    return;
  }

  let html = "";
  state.pickedColors.forEach((c, i) => {
    if (c.region) {
      html += `<div class="hm-result-item">
        <span style="color:#818cf8;">#${i + 1}</span>
        <span>⬜</span>
        <span class="hm-result-coords">region {${c.region.join(", ")}}</span>
      </div>`;
    } else {
      html += `<div class="hm-result-item">
        <span style="color:#666;">#${i + 1}</span>
        <span class="hm-result-swatch" style="background:${c.hex}"></span>
        <span class="hm-result-coords">(${c.x}, ${c.y})</span>
        <span class="hm-result-int" style="color:#f0a030; cursor:pointer;" title="Click to copy" onclick="copyToClipboard('${c.int}')">${c.int}</span>
      </div>`;
    }
  });
  container.innerHTML = html;
}

async function helperPickColor(x, y, event) {
  if (!state.currentDevice) return;

  try {
    // mapToWDAPoints returns PIXEL coords (0-1242 for @3x)
    // /color endpoint expects POINT coords (0-414) and multiplies by scale internally
    const s = state.deviceScale || 3;
    const pointX = Math.round(x / s);
    const pointY = Math.round(y / s);
    const res = await fetch(`${API}/color?x=${pointX}&y=${pointY}`);
    const data = await res.json();
    if (!data.success) {
      appendLog(`⚠️ Color pick failed`, "error");
      return;
    }

    // pointX, pointY already computed as POINT coords above
    const colorInfo = {
      x: pointX,
      y: pointY,
      r: data.r,
      g: data.g,
      b: data.b,
      hex: data.hex,
      int: data.int,
      intHex: data.intHex,
      clientX: event.clientX,
      clientY: event.clientY,
    };

    if (state.helperMode === "single") {
      // Single mode: replace
      state.pickedColors = [colorInfo];
    } else if (state.helperMode === "multi") {
      // Multi mode: append
      state.pickedColors.push(colorInfo);
    } else if (state.helperMode === "region") {
      if (!state.regionStart) {
        state.regionStart = { x: pointX, y: pointY };
        appendLog(`⬜ Region start: (${pointX}, ${pointY})`);
        return;
      } else {
        const rx = Math.min(state.regionStart.x, pointX);
        const ry = Math.min(state.regionStart.y, pointY);
        const rw = Math.abs(pointX - state.regionStart.x);
        const rh = Math.abs(pointY - state.regionStart.y);
        state.pickedColors = [{ region: [rx, ry, rw, rh] }];
        state.regionStart = null;
        appendLog(`⬜ Region: {${rx}, ${ry}, ${rw}, ${rh}}`);
      }
    }

    // Show visual marker on screen
    addPickMarker(event, data.hex);

    // Show in info bar (both main and zoom)
    ["", "zoom"].forEach((prefix) => {
      const sid = prefix ? "zoomColorSwatch" : "liveColorSwatch";
      const pid = prefix ? "zoomPixelColor" : "pixelColor";
      const swatch = document.getElementById(sid);
      if (swatch) {
        swatch.style.display = "inline-block";
        swatch.style.backgroundColor = data.hex;
      }
      const pc = document.getElementById(pid);
      if (pc) {
        pc.textContent = `${data.intHex}`;
        pc.style.color = data.hex;
      }
    });

    appendLog(
      `🎨 Color at (${x * state.deviceScale}, ${y * state.deviceScale}): ${data.intHex} ${data.hex} RGB(${data.r},${data.g},${data.b})`,
    );

    renderPickedColors();
  } catch (err) {
    appendLog(`⚠️ Color pick error: ${err.message}`, "error");
  }
}

function addPickMarker(event, color) {
  const screenView = document.getElementById("screenView");
  const viewRect = screenView.getBoundingClientRect();

  // If single mode, remove old markers
  if (state.helperMode === "single") {
    screenView.querySelectorAll(".pick-marker").forEach((m) => m.remove());
    const wrapper = document.getElementById("screenWrapper");
    if (wrapper)
      wrapper.querySelectorAll(".pick-marker").forEach((m) => m.remove());
  }

  const marker = document.createElement("div");
  marker.className = "pick-marker";
  marker.style.left = event.clientX - viewRect.left + "px";
  marker.style.top = event.clientY - viewRect.top + "px";
  marker.style.borderColor = color;
  marker.style.boxShadow = `0 0 6px ${color}`;

  // Add index label for multi mode
  if (state.helperMode === "multi") {
    marker.textContent = state.pickedColors.length;
    marker.style.width = "16px";
    marker.style.height = "16px";
    marker.style.fontSize = "9px";
    marker.style.display = "flex";
    marker.style.alignItems = "center";
    marker.style.justifyContent = "center";
    marker.style.color = "#fff";
    marker.style.fontWeight = "bold";
    marker.style.textShadow = "0 0 3px #000";
  }

  screenView.appendChild(marker);
}

function renderPickedColors() {
  const containers = [
    document.getElementById("helperResults"),
    document.getElementById("zoomHelperResults"),
  ];

  const emptyHtml =
    '<div class="helper-empty">Click on screen to pick colors</div>';
  if (state.pickedColors.length === 0) {
    containers.forEach((c) => {
      if (c) c.innerHTML = emptyHtml;
    });
    return;
  }

  let html = "";
  state.pickedColors.forEach((c, i) => {
    if (c.region) {
      html += `<div class="helper-color-item">
                <span class="index">#${i + 1}</span>
                <span>⬜</span>
                <span class="coords">region {${c.region.join(", ")}}</span>
                <span class="remove-pick" onclick="removePickedColor(${i})">✕</span>
            </div>`;
    } else {
      html += `<div class="helper-color-item">
                <span class="index">#${i + 1}</span>
                <span class="swatch" style="background:${c.hex}"></span>
                <span class="coords">(${c.x}, ${c.y})</span>
                <span class="color-hex">${c.intHex}</span>
                <span class="color-int">RGB(${c.r},${c.g},${c.b})</span>
                <span class="remove-pick" onclick="removePickedColor(${i})">✕</span>
            </div>`;
    }
  });
  containers.forEach((c) => {
    if (c) c.innerHTML = html;
  });
}

function removePickedColor(index) {
  state.pickedColors.splice(index, 1);
  renderPickedColors();
  // Refresh markers
  const wrapper = document.getElementById("screenWrapper");
  const markers = wrapper.querySelectorAll(".pick-marker");
  if (markers[index]) markers[index].remove();
}
window.removePickedColor = removePickedColor;

function generateHelperCode() {
  if (state.pickedColors.length === 0) {
    appendLog("⚠️ No colors picked yet", "error");
    return "";
  }

  // Region only
  if (state.pickedColors.length === 1 && state.pickedColors[0].region) {
    const r = state.pickedColors[0].region;
    return `region = {${r.join(", ")}}`;
  }

  // Single color → findColor with region around clicked point
  if (state.pickedColors.length === 1) {
    const c = state.pickedColors[0];
    const regionW = 60, regionH = 60;
    const rx = Math.max(0, c.x - regionW / 2);
    const ry = Math.max(0, c.y - regionH / 2);
    return [
      `-- Find color ${c.int} near (${c.x}, ${c.y})`,
      `local result = findColor(${c.int}, 1, {${rx}, ${ry}, ${regionW}, ${regionH}})`,
      `if result and #result > 0 then`,
      `  tap(result[1][1], result[1][2])`,
      `end`,
    ].join("\n");
  }

  // Multiple colors → multi-point check using findColor for each
  const anchor = state.pickedColors[0];
  const regionW = 40, regionH = 40;
  const lines = [`-- Multi-color check (${state.pickedColors.length} points)`];
  lines.push(`local allFound = true`);
  state.pickedColors.forEach((c, i) => {
    const rx = Math.max(0, c.x - regionW / 2);
    const ry = Math.max(0, c.y - regionH / 2);
    lines.push(`local r${i + 1} = findColor(${c.int}, 1, {${rx}, ${ry}, ${regionW}, ${regionH}})`);
    lines.push(`if not r${i + 1} or #r${i + 1} == 0 then allFound = false end`);
  });
  lines.push(`if allFound then`);
  lines.push(`  tap(${anchor.x}, ${anchor.y})`);
  lines.push(`end`);

  return lines.join("\n");
}

// Initialize helper when DOM ready
document.addEventListener("DOMContentLoaded", initHelper);

// ═══════════════════════════════════════════
// Apps List Modal
// ═══════════════════════════════════════════

let cachedApps = [];

async function showAppsModal() {
  const modal = document.getElementById("appsModal");
  const list = document.getElementById("appsList");
  modal.style.display = "flex";
  list.innerHTML = '<div class="helper-empty">Loading apps...</div>';

  if (!state.currentDevice) {
    list.innerHTML = '<div class="helper-empty">⚠️ No device connected</div>';
    return;
  }

  try {
    // TODO: add app listing to daemon
    appendLog("App listing not yet supported on daemon", "warning");
    return;
    const data = await res.json();
    cachedApps = data.apps || data || [];
    renderApps(cachedApps);

    // Setup search
    const search = document.getElementById("appsSearch");
    search.value = "";
    search.focus();
    search.oninput = () => {
      const q = search.value.toLowerCase();
      const filtered = cachedApps.filter(
        (a) =>
          (a.name || "").toLowerCase().includes(q) ||
          (a.bundle_id || "").toLowerCase().includes(q),
      );
      renderApps(filtered);
    };
  } catch (e) {
    list.innerHTML = `<div class="helper-empty">❌ Error: ${e.message}</div>`;
  }
}

function renderApps(apps) {
  const list = document.getElementById("appsList");
  if (!apps.length) {
    list.innerHTML = '<div class="helper-empty">No apps found</div>';
    return;
  }

  // Sort alphabetically
  apps.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  list.innerHTML = apps
    .map((app) => {
      const name = app.name || app.bundle_id;
      const bid = app.bundle_id;
      const icon = getAppEmoji(bid);
      return `<div class="app-item" title="${bid}">
            <div class="app-icon">${icon}</div>
            <div class="app-details">
                <div class="app-name">${escapeHtml(name)}</div>
                <div class="app-bundle">${escapeHtml(bid)}</div>
            </div>
            <div class="app-actions">
                <button onclick="event.stopPropagation();copyBundleId('${bid}')">📋 Copy</button>
                <button onclick="event.stopPropagation();insertAppRun('${bid}')">⬇️ Insert</button>
            </div>
        </div>`;
    })
    .join("");
}

function getAppEmoji(bundleId) {
  const map = {
    "com.apple.Preferences": "⚙️",
    "com.apple.mobilesafari": "🧭",
    "com.apple.MobileSMS": "💬",
    "com.apple.mobilephone": "📞",
    "com.apple.camera": "📷",
    "com.apple.mobileslideshow": "🖼️",
    "com.apple.AppStore": "🏪",
    "com.apple.Maps": "🗺️",
    "com.apple.mobiletimer": "⏰",
    "com.apple.mobilenotes": "📝",
    "com.apple.mobilecal": "📅",
    "com.apple.mobilemail": "📧",
    "com.apple.Music": "🎵",
    "com.apple.Health": "❤️",
    "com.apple.weather": "🌤️",
    "com.apple.calculator": "🔢",
    "com.apple.Fitness": "🏃",
    "com.apple.shortcuts": "⚡",
  };
  return map[bundleId] || "📦";
}

function copyBundleId(bundleId) {
  copyToClipboard(bundleId);
  appendLog(`📋 Copied: ${bundleId}`);
}

function insertAppRun(bundleId) {
  if (state.editor) {
    const pos = state.editor.getPosition();
    state.editor.executeEdits("apps", [
      {
        range: new monaco.Range(
          pos.lineNumber,
          pos.column,
          pos.lineNumber,
          pos.column,
        ),
        text: `app_run('${bundleId}')\n`,
      },
    ]);
    state.editor.focus();
    appendLog(`⬇️ Inserted: app_run('${bundleId}')`);
  }
  closeAppsModal();
}

function closeAppsModal() {
  document.getElementById("appsModal").style.display = "none";
}

// Close modal on overlay click
document.addEventListener("click", (e) => {
  if (e.target.id === "appsModal") closeAppsModal();
});

// Close modal on Escape
document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    document.getElementById("appsModal").style.display !== "none"
  ) {
    closeAppsModal();
  }
});

window.showAppsModal = showAppsModal;
window.closeAppsModal = closeAppsModal;
window.copyBundleId = copyBundleId;
window.insertAppRun = insertAppRun;

// ═══════════════════════════════════════════
// Python → Lua Converter
// ═══════════════════════════════════════════

function initConverter() {
  const convertBtn = document.getElementById("convertBtn");
  const copyBtn = document.getElementById("convertCopyBtn");
  const insertBtn = document.getElementById("convertInsertBtn");
  const pasteBtn = document.getElementById("convertPasteBtn");
  const statsEl = document.getElementById("converterStats");

  if (!convertBtn) return;

  let converterReady = false;

  function ensureEditors() {
    if (converterReady) return true;
    if (typeof monaco === 'undefined') return false;

    const pyContainer = document.getElementById("pythonInput");
    const luaContainer = document.getElementById("luaOutput");
    if (!pyContainer || !luaContainer || pyContainer.offsetWidth === 0) return false;

    const ideTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const editorTheme = ideTheme === "dark" ? "icontrol-dark" : "vs";
    const editorOpts = {
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      lineNumbers: "on",
      tabSize: 4,
      renderWhitespace: "selection",
      padding: { top: 8, bottom: 8 },
      scrollbar: { vertical: "auto", horizontal: "auto" },
      wordWrap: "off",
      folding: true,
      bracketPairColorization: { enabled: true },
    };

    state.pyEditor = monaco.editor.create(pyContainer, {
      ...editorOpts,
      value: "# Paste your Python script here\nfor i in range(3):\n    tap(100 + i * 50, 200)\n    sleep(0.5)\nlog('Done!')",
      language: "python",
      theme: editorTheme,
    });

    state.luaEditor = monaco.editor.create(luaContainer, {
      ...editorOpts,
      value: "-- Converted Lua code will appear here...",
      language: "lua",
      theme: editorTheme,
      readOnly: true,
    });

    // Auto-convert on typing (debounced)
    let convertTimer = null;
    state.pyEditor.onDidChangeModelContent(() => {
      clearTimeout(convertTimer);
      convertTimer = setTimeout(doConvert, 500);
    });

    converterReady = true;
    return true;
  }

  function doConvert() {
    if (!ensureEditors()) return;
    const py = state.pyEditor.getValue();
    if (!py.trim()) {
      state.luaEditor.setValue("-- No Python code to convert");
      return;
    }
    const lua = Py2Lua.convert(py);
    state.luaEditor.setValue(lua);
    const stats = Py2Lua.getStats(py, lua);
    statsEl.textContent = `${stats.pyLines}→${stats.luaLines} lines | ${stats.apiCalls} API calls`;
  }

  // Init editors when Py→Lua tab is shown
  const converterTab = document.querySelector('.tab[data-tab="converter"]');
  if (converterTab) {
    converterTab.addEventListener("click", () => {
      setTimeout(ensureEditors, 50);
    });
  }

  // Convert button
  convertBtn.addEventListener("click", () => {
    if (!ensureEditors()) return;
    doConvert();
    appendLog("🔄 Python → Lua converted", "success");
  });

  // Copy Lua output
  copyBtn.addEventListener("click", () => {
    if (!state.luaEditor) return;
    const lua = state.luaEditor.getValue();
    if (!lua.trim()) return;
    copyToClipboard(lua)
      .then(() => appendLog("📋 Lua code copied to clipboard", "success"))
      .catch(() => appendLog("❌ Failed to copy", "error"));
  });

  // Insert into editor
  insertBtn.addEventListener("click", () => {
    if (!ensureEditors()) return;
    const lua = state.luaEditor.getValue();
    if (!lua.trim()) return;
    // Switch to editor tab first
    document.querySelector('.tab[data-tab="editor"]')?.click();
    // Then set value after tab is visible
    setTimeout(() => {
      if (state.editor) {
        state.editor.setValue(lua);
        state.editor.focus();
      }
    }, 100);
    appendLog("⬇️ Lua code inserted into editor", "success");
  });

  // Paste from clipboard
  pasteBtn.addEventListener("click", async () => {
    if (!ensureEditors()) return;
    try {
      const text = await navigator.clipboard.readText();
      state.pyEditor.setValue(text);
      doConvert();
    } catch (e) {
      appendLog("❌ Cannot access clipboard", "error");
    }
  });
}
// ═══════════════════════════════════════════
// VNC View-Only Toggle
// ═══════════════════════════════════════════

function setVncViewOnly(viewOnly) {
  const vncFrame = document.getElementById("vncFrame");
  if (!vncFrame || vncFrame.style.display === "none") return;
  
  const host = window.location.hostname;
  if (!host) return;
  
  // Reload VNC with updated view_only param
  // USB multi-device: detect slot from IDE port → compute VNC ports
  const isUSB = (host === 'localhost' || host === '127.0.0.1');
  let vncHtmlPort = 5902; // noVNC HTML server port
  let vncWsPort = 5900;   // VNC WebSocket port
  if (isUSB) {
    const idePort = parseInt(window.location.port) || 9898;
    const slot = (idePort === 9898) ? 0 : (idePort - 9890);
    vncHtmlPort = 5902 + slot * 10;  // 5902, 5912, 5922...
    vncWsPort = 15900 + slot * 10;   // 15900, 15910, 15920...
  }
  const vncUrl = `http://${host}:${vncHtmlPort}/novnc/vnc.html?autoconnect=true&host=${host}&port=${vncWsPort}&encrypt=0&resize=scale&view_only=${viewOnly}&show_dot=false&reconnect=true&reconnect_delay=5000`;
  vncFrame.src = vncUrl;
  
  // Overlay always visible for coordinates, but pointer-events controls interaction
  const coordOverlay = document.getElementById("vncCoordOverlay");
  if (coordOverlay) {
    coordOverlay.style.display = "block";
    coordOverlay.style.pointerEvents = viewOnly ? "auto" : "none";
  }
  
  const statusEl = document.getElementById("screenStatus");
  if (statusEl) statusEl.textContent = "🟢 Connected";
}

// ═══════════════════════════════════════════
// iPhone Live Screen Panel
// ═══════════════════════════════════════════

function initLiveScreen() {
  const connectBtn = document.getElementById("screenConnectBtn");
  const disconnectBtn = document.getElementById("screenDisconnectBtn");

  const homeBtn = document.getElementById("screenHomeBtn");
  const streamImg = document.getElementById("screenStream");
  const placeholder = document.getElementById("screenPlaceholder");
  const statusEl = document.getElementById("screenStatus");
  const coordText = document.getElementById("coordText");
  const colorSwatch = document.getElementById("colorSwatch");
  const colorHex = document.getElementById("colorHex");
  const touchIndicator = document.getElementById("touchIndicator");
  const screenView = document.getElementById("screenView");

  if (!connectBtn) return; // Elements don't exist

  let screenInfo = {
    width: 1170,
    height: 2532,
    scale: 3,
    pointWidth: 390,
    pointHeight: 844,
  };
  let isStreaming = false;
  let streamPollInterval = null;
  let dragStart = null;
  let dragStartTime = null;

  // Fetch screen info on init + auto-connect VNC
  (async function () {
    try {
      const res = await fetch(`${API}/screen_info`);
      const data = await res.json();
      if (data.width) {
        screenInfo = {
          width: data.width, // already pixel dimensions from API
          height: data.height, // already pixel dimensions
          scale: data.scale || 3,
          pointWidth:
            data.pointWidth || Math.round(data.width / (data.scale || 3)),
          pointHeight:
            data.pointHeight || Math.round(data.height / (data.scale || 3)),
        };
        state.screenSize = { w: data.width, h: data.height };
        state.wdaPoints = {
          w: screenInfo.pointWidth,
          h: screenInfo.pointHeight,
        };
        state.deviceScale = data.scale || 3;
      }
      // Auto-connect VNC after a short delay (prevents split-screen buffer issue)
      setTimeout(() => {
        if (connectBtn) connectBtn.click();
      }, 2000);
    } catch (e) {}
  })();

  // Connect — use VNC if available, fallback to screenshot polling
  connectBtn.addEventListener("click", () => {
    const vncFrame = document.getElementById("vncFrame");
    const host = window.location.hostname;

    placeholder.style.display = "none";
    connectBtn.style.display = "none";
    disconnectBtn.style.display = "flex";

    if (homeBtn) homeBtn.style.display = "flex";
    isStreaming = true;

    // Try VNC first (TrollVNC on iPhone)
    if (vncFrame && host) {
      const viewOnly = 'false';
      // USB multi-device: detect slot from IDE port → compute VNC ports
      const isUSB = (host === 'localhost' || host === '127.0.0.1');
      let vncHtmlPort = 5902;
      let vncWsPort = 5900;
      if (isUSB) {
        const idePort = parseInt(window.location.port) || 9898;
        const slot = (idePort === 9898) ? 0 : (idePort - 9890);
        vncHtmlPort = 5902 + slot * 10;
        vncWsPort = 15900 + slot * 10;
      }
      const vncUrl = `http://${host}:${vncHtmlPort}/novnc/vnc.html?autoconnect=true&host=${host}&port=${vncWsPort}&encrypt=0&resize=scale&view_only=${viewOnly}&show_dot=false&reconnect=true&reconnect_delay=5000`;
      vncFrame.src = vncUrl;
      vncFrame.style.display = "block";
      streamImg.style.display = "none";
      // Always show overlay for coordinates, use pointer-events to control interaction
      const coordOverlay = document.getElementById("vncCoordOverlay");
      if (coordOverlay) {
        coordOverlay.style.display = "block";
        coordOverlay.style.pointerEvents = state.runningTaskId ? "auto" : "none";
      }

      statusEl.textContent = "🟢 Connected";
      statusEl.style.color = "var(--success-color)";
      appendLog("📺 VNC screen connected", "success");
    } else {
      // Fallback: screenshot polling
      streamImg.style.display = "block";
      streamImg.style.maxWidth = "100%";
      streamImg.style.maxHeight = "100%";
      streamImg.src = `${API}/screenshot?quality=0.5&t=${Date.now()}`;
      statusEl.textContent = "🟢 Live";
      statusEl.style.color = "var(--success-color)";
      streamPollInterval = setInterval(() => {
        if (!isStreaming) return;
        const img = new Image();
        img.onload = () => {
          streamImg.src = img.src;
        };
        img.src = `${API}/screenshot?quality=0.45&t=${Date.now()}`;
      }, 350);
      appendLog("📺 Live screen started (polling ~3fps)", "success");
    }
  });

  // Disconnect
  disconnectBtn.addEventListener("click", () => {
    if (streamPollInterval) {
      clearInterval(streamPollInterval);
      streamPollInterval = null;
    }
    const vncFrame = document.getElementById("vncFrame");
    if (vncFrame) {
      vncFrame.src = "";
      vncFrame.style.display = "none";
    }
    const coordOverlay = document.getElementById("vncCoordOverlay");
    if (coordOverlay) coordOverlay.style.display = "none";

    streamImg.src = "";
    streamImg.style.display = "none";
    placeholder.style.display = "";
    statusEl.textContent = "Disconnected";
    statusEl.style.color = "var(--text-secondary)";

    connectBtn.style.display = "flex";
    disconnectBtn.style.display = "none";

    if (homeBtn) homeBtn.style.display = "none";
    isStreaming = false;
  });

  // Auto-connect on page load
  setTimeout(() => connectBtn.click(), 3000);

  // Home button — press Home on device
  if (homeBtn) {
    homeBtn.addEventListener("click", async () => {
      try {
        await fetch(`${API}/key?key=home`);
      } catch (e) {}
    });
  }

  // Get image/vnc bounds for coordinate mapping
  function getStreamBounds() {
    const vncFrame = document.getElementById("vncFrame");
    const useVnc = vncFrame && vncFrame.style.display !== "none";
    // For VNC: use screenView container rect (iframe has internal offsets)
    const el = useVnc ? screenView : streamImg;
    const rect = el.getBoundingClientRect();
    const natW = useVnc
      ? screenInfo.width
      : streamImg.naturalWidth || screenInfo.width;
    const natH = useVnc
      ? screenInfo.height
      : streamImg.naturalHeight || screenInfo.height;
    const containerRatio = rect.width / rect.height;
    const imageRatio = natW / natH;

    let renderW, renderH, offsetX, offsetY;
    if (imageRatio > containerRatio) {
      renderW = rect.width;
      renderH = rect.width / imageRatio;
      offsetX = 0;
      offsetY = (rect.height - renderH) / 2;
    } else {
      renderH = rect.height;
      renderW = rect.height * imageRatio;
      offsetX = (rect.width - renderW) / 2;
      offsetY = 0;
    }
    return { renderW, renderH, offsetX, offsetY, natW, natH, rect };
  }

  // Map mouse position to iPhone pixel coordinates
  function mapToiPhoneCoords(e) {
    const bounds = getStreamBounds();
    const relX = e.clientX - bounds.rect.left - bounds.offsetX;
    const relY = e.clientY - bounds.rect.top - bounds.offsetY;

    if (relX < 0 || relX > bounds.renderW || relY < 0 || relY > bounds.renderH)
      return null;

    const x = Math.round((relX / bounds.renderW) * bounds.natW);
    const y = Math.round((relY / bounds.renderH) * bounds.natH);
    return { x: Math.max(0, x), y: Math.max(0, y) };
  }

  // Mouse tracking for coordinates
  screenView.addEventListener("mousemove", (e) => {
    if (!isStreaming) return;
    const pos = mapToiPhoneCoords(e);
    if (pos) {
      coordText.textContent = `x: ${pos.x}  y: ${pos.y}`;
      statusEl.textContent = "🟢 Connected";
    }
  });

  // VNC overlay coordinate tracking (point coords = pixel / scale)
  const vncCoordOverlay = document.getElementById("vncCoordOverlay");
  if (vncCoordOverlay) {
    vncCoordOverlay.addEventListener("mousemove", (e) => {
      const bounds = getStreamBounds();
      const relX = e.clientX - bounds.rect.left - bounds.offsetX;
      const relY = e.clientY - bounds.rect.top - bounds.offsetY;
      if (relX < 0 || relX > bounds.renderW || relY < 0 || relY > bounds.renderH) return;
      const pixelX = Math.round((relX / bounds.renderW) * bounds.natW);
      const pixelY = Math.round((relY / bounds.renderH) * bounds.natH);
      const s = screenInfo.scale || 3;
      const x = Math.round(pixelX / s);
      const y = Math.round(pixelY / s);
      if (coordText) coordText.textContent = `x: ${x}  y: ${y}`;
      if (statusEl) statusEl.textContent = "🟢 Connected";
    });
  }

  // Document-level coordinate tracking — works even when overlay has pointer-events: none
  document.addEventListener("mousemove", (e) => {
    if (!isStreaming) return;
    const sv = document.getElementById("screenView");
    if (!sv) return;
    const svRect = sv.getBoundingClientRect();
    if (e.clientX < svRect.left || e.clientX > svRect.right ||
        e.clientY < svRect.top || e.clientY > svRect.bottom) return;
    const bounds = getStreamBounds();
    const relX = e.clientX - bounds.rect.left - bounds.offsetX;
    const relY = e.clientY - bounds.rect.top - bounds.offsetY;
    if (relX < 0 || relX > bounds.renderW || relY < 0 || relY > bounds.renderH) return;
    const pixelX = Math.round((relX / bounds.renderW) * bounds.natW);
    const pixelY = Math.round((relY / bounds.renderH) * bounds.natH);
    const s = screenInfo.scale || 3;
    const x = Math.round(pixelX / s);
    const y = Math.round(pixelY / s);
    if (coordText) coordText.textContent = `x: ${x}  y: ${y}`;
    if (statusEl) statusEl.textContent = "🟢 Connected";
  });



  // Panel resizer
  const resizer = document.getElementById("screenResizer");
  const panel = document.getElementById("liveScreenPanel");
  if (resizer && panel) {
    let startX, startWidth;

    resizer.addEventListener("mousedown", (e) => {
      startX = e.clientX;
      startWidth = panel.offsetWidth;
      document.addEventListener("mousemove", onResize);
      document.addEventListener("mouseup", stopResize);
      e.preventDefault();
    });

    function onResize(e) {
      const newWidth = startWidth + (e.clientX - startX);
      if (newWidth >= 200 && newWidth <= 600) {
        panel.style.width = newWidth + "px";
        // Relayout Monaco editor
        if (state.editor) state.editor.layout();
      }
    }

    function stopResize() {
      document.removeEventListener("mousemove", onResize);
      document.removeEventListener("mouseup", stopResize);
    }
  }

  // API Panel resizer
  const apiResizer = document.getElementById("apiResizer");
  const apiPanel = document.getElementById("apiPanel");
  if (apiResizer && apiPanel) {
    let apiStartX, apiStartWidth;

    apiResizer.addEventListener("mousedown", (e) => {
      apiStartX = e.clientX;
      apiStartWidth = apiPanel.offsetWidth;
      document.addEventListener("mousemove", onApiResize);
      document.addEventListener("mouseup", stopApiResize);
      e.preventDefault();
    });

    function onApiResize(e) {
      // Dragging left = wider panel (reverse delta)
      const newWidth = apiStartWidth - (e.clientX - apiStartX);
      if (newWidth >= 200 && newWidth <= 500) {
        apiPanel.style.width = newWidth + "px";
        if (state.editor) state.editor.layout();
      }
    }

    function stopApiResize() {
      document.removeEventListener("mousemove", onApiResize);
      document.removeEventListener("mouseup", stopApiResize);
    }
  }

  appendLog(
    "📱 Live Screen panel ready — click Connect to start streaming",
    "info",
  );
}

// ═══════════════════════════════════════════
// Image Processing Tools
// ═══════════════════════════════════════════

// Sync color picker with text input
document.addEventListener("DOMContentLoaded", () => {
  const picker = document.getElementById("imgFindColorPicker");
  const input = document.getElementById("imgFindColor");
  if (picker && input) {
    picker.addEventListener("input", () => {
      input.value = "0x" + picker.value.slice(1).toUpperCase();
    });
  }
});

async function imgToolPixelColor() {
  const x = parseInt(document.getElementById("imgPixelX")?.value || "0");
  const y = parseInt(document.getElementById("imgPixelY")?.value || "0");
  try {
    const resp = await fetch(`${API}/color?x=${x}&y=${y}`);
    const data = await resp.json();
    if (data.error) {
      appendLog("❌ " + data.error, "error");
      return;
    }

    const swatch = document.getElementById("imgPixelSwatch");
    const result = document.getElementById("imgPixelResult");
    swatch.style.background = data.hex;
    result.style.display = "block";
    result.textContent = `RGB(${data.r}, ${data.g}, ${data.b})  HEX: ${data.hex}  INT: ${data.intHex}`;
    appendLog(`🎯 Pixel (${x},${y}): ${data.hex} = ${data.intHex}`, "info");
  } catch (e) {
    appendLog("❌ Get color failed: " + e.message, "error");
  }
}

async function imgToolFindColor() {
  const colorStr = document.getElementById("imgFindColor")?.value || "";
  const regionStr = document.getElementById("imgFindColorRegion")?.value || "";
  if (!colorStr) {
    appendLog("⚠️ Enter a color value", "warning");
    return;
  }

  const params = new URLSearchParams({ color: colorStr });
  if (regionStr) params.set("region", regionStr);

  try {
    const resp = await fetch(`${API}/api/image/find_color?${params}`);
    const data = await resp.json();
    appendLog(
      `🎨 Find color ${colorStr}: ${JSON.stringify(data)}`,
      data.found ? "info" : "warning",
    );
  } catch (e) {
    appendLog("❌ Find color failed: " + e.message, "error");
  }
}

async function imgToolFindColors() {
  const text = document.getElementById("imgFindColors")?.value || "";
  if (!text.trim()) {
    appendLog("⚠️ Enter color patterns", "warning");
    return;
  }

  try {
    const resp = await fetch(`${API}/api/image/find_colors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pattern: text }),
    });
    const data = await resp.json();
    appendLog(
      `🌈 Find colors: ${JSON.stringify(data)}`,
      data.found ? "info" : "warning",
    );
  } catch (e) {
    appendLog("❌ Find colors failed: " + e.message, "error");
  }
}

async function imgToolFindImage() {
  const fileInput = document.getElementById("imgTemplateFile");
  const threshold = document.getElementById("imgThreshold")?.value || "0.8";
  if (!fileInput?.files?.length) {
    appendLog("⚠️ Select a template image", "warning");
    return;
  }

  const formData = new FormData();
  formData.append("template", fileInput.files[0]);
  formData.append("threshold", threshold);

  try {
    const resp = await fetch(`${API}/api/image/find`, {
      method: "POST",
      body: formData,
    });
    const data = await resp.json();
    appendLog(
      `🔎 Find image (threshold=${threshold}): ${JSON.stringify(data)}`,
      data.found ? "info" : "warning",
    );
  } catch (e) {
    appendLog("❌ Find image failed: " + e.message, "error");
  }
}

async function imgToolOCR() {
  const regionStr = document.getElementById("imgOCRRegion")?.value || "";
  const params = regionStr ? `?region=${regionStr}` : "";

  try {
    const resp = await fetch(`${API}/api/image/ocr${params}`);
    const data = await resp.json();
    const result = document.getElementById("imgOCRResult");
    if (result) {
      result.style.display = "block";
      result.textContent = data.text || data.error || "No text found";
    }
    appendLog(
      `📝 OCR: ${data.text || data.error}`,
      data.text ? "info" : "warning",
    );
  } catch (e) {
    appendLog("❌ OCR failed: " + e.message, "error");
  }
}

async function imgToolCrop() {
  const regionStr = document.getElementById("imgCropRegion")?.value || "";
  const name = document.getElementById("imgCropName")?.value || "crop.png";
  if (!regionStr) {
    appendLog("⚠️ Enter region x,y,w,h", "warning");
    return;
  }

  const [x, y, w, h] = regionStr.split(",").map((s) => parseInt(s.trim()));
  try {
    const resp = await fetch(`${API}/screenshot?quality=1.0`);
    const blob = await resp.blob();

    // Use canvas to crop
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await new Promise((r) => (img.onload = r));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

    canvas.toBlob(async (croppedBlob) => {
      // Download
      const url = URL.createObjectURL(croppedBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      appendLog(`✂️ Cropped (${x},${y},${w},${h}) → saved as ${name}`, "info");
    }, "image/png");
  } catch (e) {
    appendLog("❌ Crop failed: " + e.message, "error");
  }
}

function imgToolGenCode(tool) {
  let code = "";
  switch (tool) {
    case "findColor": {
      const color =
        document.getElementById("imgFindColor")?.value || "0xFF0000";
      const region = document.getElementById("imgFindColorRegion")?.value || "";
      if (region) {
        const [x, y, w, h] = region.split(",").map((s) => s.trim());
        code = `-- Find color in region\nlocal result = findColor(${color}, {${x}, ${y}, ${w}, ${h}})\nif result then\n    log("Found at: " .. result.x .. ", " .. result.y)\n    tap(result.x, result.y)\nelse\n    log("Color not found")\nend`;
      } else {
        code = `-- Find color on screen\nlocal result = findColor(${color})\nif result then\n    log("Found at: " .. result.x .. ", " .. result.y)\n    tap(result.x, result.y)\nelse\n    log("Color not found")\nend`;
      }
      break;
    }
    case "findColors": {
      const text = document.getElementById("imgFindColors")?.value || "";
      const lines = text
        .trim()
        .split("\n")
        .map((l) => {
          const [x, y, c] = l.split("|").map((s) => s.trim());
          return `    {${x}, ${y}, ${c}}`;
        })
        .join(",\n");
      code = `-- Find multi-color pattern\nlocal pattern = {\n${lines}\n}\nlocal result = findColors(pattern)\nif result then\n    log("Pattern found at: " .. result.x .. ", " .. result.y)\n    tap(result.x, result.y)\nelse\n    log("Pattern not found")\nend`;
      break;
    }
    case "findImage": {
      const threshold = document.getElementById("imgThreshold")?.value || "0.8";
      code = `-- Find image on screen\nlocal result = findImage("template.png", ${threshold})\nif result then\n    log("Found at: " .. result.x .. ", " .. result.y .. " score: " .. result.score)\n    tap(result.x, result.y)\nelse\n    log("Image not found")\nend`;
      break;
    }
    case "ocr": {
      const region = document.getElementById("imgOCRRegion")?.value || "";
      if (region) {
        const [x, y, w, h] = region.split(",").map((s) => s.trim());
        code = `-- OCR in region\nlocal text = ocr(${x}, ${y}, ${w}, ${h})\nlog("Text: " .. text)`;
      } else {
        code = `-- OCR full screen\nlocal text = ocr()\nlog("Text: " .. text)`;
      }
      break;
    }
    case "crop": {
      const region =
        document.getElementById("imgCropRegion")?.value || "0,0,100,100";
      const name =
        document.getElementById("imgCropName")?.value || "template.png";
      const [x, y, w, h] = region.split(",").map((s) => s.trim());
      code = `-- Crop screen region and save\ncrop(${x}, ${y}, ${w}, ${h}, "${name}")`;
      break;
    }
    case "pixel": {
      const x = document.getElementById("imgPixelX")?.value || "0";
      const y = document.getElementById("imgPixelY")?.value || "0";
      code = `-- Get pixel color\nlocal color = getColor(${x}, ${y})\nlog("Color: " .. color.hex .. " (" .. color.intHex .. ")")`;
      break;
    }
  }

  if (code && state.editor) {
    // Insert at cursor position
    const position = state.editor.getPosition();
    state.editor.executeEdits("imgTool", [
      {
        range: new monaco.Range(position.lineNumber, 1, position.lineNumber, 1),
        text: code + "\n\n",
      },
    ]);
    // Switch to editor tab
    document.querySelector('[data-tab="editor"]')?.click();
    appendLog(`📋 Code inserted for ${tool}`, "info");
  }
}

// ═══════════════════════════════════════════
// Image Manager
// ═══════════════════════════════════════════

function initImageManager() {
  // Legacy image tools have been moved to Helper Modal or removed
  
  // ── Setup hmDropZone for drag and drop to Helper Modal Image tab ──
  const hmDrop = document.getElementById("hmDropZone");
  if (hmDrop) {
    ["dragenter", "dragover"].forEach(ev => {
      hmDrop.addEventListener(ev, (e) => {
        e.preventDefault();
        hmDrop.style.borderColor = "#7c7fdb";
        hmDrop.style.background = "rgba(124,127,219,0.1)";
        hmDrop.style.color = "#a5b4fc";
      });
    });
    ["dragleave", "dragend"].forEach(ev => {
      hmDrop.addEventListener(ev, () => {
        hmDrop.style.borderColor = "rgba(139,148,200,0.3)";
        hmDrop.style.background = "";
        hmDrop.style.color = "#666";
      });
    });

    hmDrop.addEventListener("drop", async (e) => {
      e.preventDefault();
      hmDrop.style.borderColor = "rgba(139,148,200,0.3)";
      hmDrop.style.background = "";
      hmDrop.style.color = "#666";
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
      if (!files.length) { appendLog("⚠️ Chỉ chấp nhận file ảnh (PNG/JPG/...)", "warning"); return; }
      await ic_importImageFiles(files);
    });
  }

  // File picker button
  const fileInput = document.getElementById("hmFileInput");
  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files);
      if (files.length) await ic_importImageFiles(files);
      e.target.value = "";
    });
  }
}

async function imgRefreshGallery() {
  const gallery = document.getElementById("imgGallery");
  const countEl = document.getElementById("imgGalleryCount");
  if (!gallery) return;
  gallery.innerHTML =
    '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-secondary); font-size:11px;">Loading...</div>';

  try {
    const resp = await fetch(`${API}/images/list`);
    const data = await resp.json();
    const images = data.images || [];
    if (countEl) countEl.textContent = `${images.length} ảnh`;

    if (images.length === 0) {
      gallery.innerHTML =
        '<div style="grid-column:1/-1; text-align:center; padding:30px 0; color:var(--text-secondary); font-size:12px;">Chưa có ảnh. Bấm <b>Chụp</b> rồi cắt vùng.</div>';
      return;
    }

    gallery.innerHTML = images
      .map((img) => {
        const sizeStr =
          img.size > 1024
            ? `${(img.size / 1024).toFixed(1)}KB`
            : `${img.size}B`;
        const eName = img.name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        return `<div class="img-card" data-name="${img.name.toLowerCase()}" style="background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:8px; overflow:hidden; transition:border-color 0.15s;" onmouseenter="this.style.borderColor='var(--accent-color)'" onmouseleave="this.style.borderColor='var(--border-color)'">
        <div style="aspect-ratio:4/3; overflow:hidden; background:#111; display:flex; align-items:center; justify-content:center; cursor:pointer;" onclick="imgEditCrop('${eName}')" title="Click để cắt lại">
          <img src="${API}/images/get?name=${encodeURIComponent(img.name)}" style="width:100%; height:100%; object-fit:contain; pointer-events:none;" loading="lazy">
        </div>
        <div style="padding:6px 8px;">
          <div style="font-size:11px; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${img.name}">${img.name}</div>
          <div style="font-size:9px; color:var(--text-secondary); margin-top:1px;">${sizeStr}</div>
          <div style="display:flex; gap:3px; margin-top:5px;">
            <button class="img-action-btn" onclick="imgCopyPath('${eName}')" data-tip="Copy path"><i data-lucide="copy" style="width:13px;height:13px;"></i></button>
            <button class="img-action-btn" onclick="imgInsertCode('${eName}')" data-tip="Chèn code"><i data-lucide="file-code" style="width:13px;height:13px;"></i></button>
            <button class="img-action-btn" onclick="imgRename('${eName}')" data-tip="Đổi tên"><i data-lucide="pencil" style="width:13px;height:13px;"></i></button>
            <button class="img-action-btn img-action-danger" onclick="imgDelete('${eName}')" data-tip="Xoá ảnh"><i data-lucide="trash-2" style="width:13px;height:13px;"></i></button>
          </div>
        </div>
      </div>`;
      })
      .join("");
    if (typeof lucide !== "undefined") lucide.createIcons();
  } catch (e) {
    gallery.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:20px; color:#f87171; font-size:11px;">Failed: ${e.message}</div>`;
  }
}

function imgCopyPath(name) {
  copyToClipboard(name);
  appendLog(`📋 Copied: "${name}"`, "success");
}

function imgEditCrop(name) {
  const cropArea = document.getElementById("imgCropArea");
  const cropCanvas = document.getElementById("imgCropCanvas");
  const cropContainer = document.getElementById("imgCropContainer");
  const cropCoords = document.getElementById("imgCropCoords");
  const cropNameInput = document.getElementById("imgCropName");
  if (!cropArea || !cropCanvas) return;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const nativeW = img.width,
      nativeH = img.height;
    const containerW = cropContainer?.parentElement?.clientWidth || 700;
    const dw = containerW;
    const dh = Math.round((nativeH * dw) / nativeW);
    window._cropScale = nativeW / dw;
    window._cropImg = img;
    cropCanvas.width = dw;
    cropCanvas.height = dh;
    cropCanvas.style.width = dw + "px";
    cropCanvas.style.height = dh + "px";
    if (cropContainer) cropContainer.style.maxHeight = dh + "px";
    const ctx = cropCanvas.getContext("2d");
    ctx.drawImage(img, 0, 0, dw, dh);
    cropArea.style.display = "block";
    window._cropMode = "edit";
    if (cropCoords) cropCoords.textContent = "chưa chọn";
    if (cropNameInput)
      cropNameInput.value = name.replace(/\.[^.]+$/, "") + "_crop";
    cropArea.scrollIntoView({ behavior: "smooth", block: "start" });
    appendLog(`🖼️ Đang chỉnh sửa: ${name} — kéo chuột chọn vùng cắt`, "info");
  };
  img.src = `${API}/images/get?name=${encodeURIComponent(name)}`;
}

function imgInsertCode(name) {
  const code = `local x, y = findImage("${name}", 1, 0.9)\nif x then tap(x, y) end`;
  if (state.editor) {
    const codeTab =
      document.querySelector('[data-tab="tabContent"]') ||
      document.querySelector('[onclick*="tabContent"]');
    if (codeTab) codeTab.click();
    setTimeout(() => {
      const pos = state.editor.getPosition();
      state.editor.executeEdits("imgInsert", [
        {
          range: new monaco.Range(
            pos.lineNumber,
            pos.column,
            pos.lineNumber,
            pos.column,
          ),
          text: code + "\n",
        },
      ]);
      state.editor.focus();
      appendLog(`➡️ Inserted findImage("${name}")`, "success");
    }, 100);
  } else {
    copyToClipboard(code);
    appendLog(`📋 Copied code for "${name}"`, "success");
  }
}

// ═══ Custom Modal (replaces prompt/confirm) ═══
function showImgModal({ title, body, input, inputValue, danger }) {
  return new Promise((resolve) => {
    const modal = document.getElementById("imgModal");
    const titleEl = document.getElementById("imgModalTitle");
    const bodyEl = document.getElementById("imgModalBody");
    const inputEl = document.getElementById("imgModalInput");
    const okBtn = document.getElementById("imgModalOk");
    const cancelBtn = document.getElementById("imgModalCancel");
    if (!modal) {
      resolve(null);
      return;
    }

    titleEl.innerHTML = title || "";
    bodyEl.innerHTML = body || "";
    if (input) {
      inputEl.style.display = "block";
      inputEl.value = inputValue || "";
    } else {
      inputEl.style.display = "none";
    }
    okBtn.className = danger ? "danger" : "";
    okBtn.textContent = danger ? "Xóa" : "OK";
    modal.style.display = "flex";

    // Focus input or ok button
    setTimeout(() => {
      input ? inputEl.focus() : okBtn.focus();
    }, 100);

    function cleanup() {
      modal.style.display = "none";
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      inputEl.removeEventListener("keydown", onKey);
    }
    function onOk() {
      cleanup();
      resolve(input ? inputEl.value : true);
    }
    function onCancel() {
      cleanup();
      resolve(null);
    }
    function onKey(e) {
      if (e.key === "Enter") onOk();
      if (e.key === "Escape") onCancel();
    }

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    if (input) inputEl.addEventListener("keydown", onKey);
  });
}

async function imgRename(oldName) {
  const newName = await showImgModal({
    title:
      '<i data-lucide="pencil" style="width:18px;height:18px;"></i> Đổi tên ảnh',
    body: `Tên hiện tại: <b>${oldName}</b>`,
    input: true,
    inputValue: oldName,
  });
  if (typeof lucide !== "undefined") lucide.createIcons();
  if (!newName || newName === oldName) return;
  try {
    const resp = await fetch(`${API}/images/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldName, newName }),
    });
    const data = await resp.json();
    if (data.success) {
      appendLog(`✏️ Renamed: ${oldName} → ${data.name}`, "success");
      imgRefreshGallery();
    } else {
      appendLog("❌ " + (data.error || "Rename failed"), "error");
    }
  } catch (e) {
    appendLog("❌ Rename error: " + e.message, "error");
  }
}

async function imgDelete(name) {
  const ok = await showImgModal({
    title:
      '<i data-lucide="trash-2" style="width:18px;height:18px;color:#f87171;"></i> Xóa ảnh',
    body: `Bạn chắc chắn muốn xóa <b>"${name}"</b>?<br><span style="font-size:11px;color:#888;">Hành động này không thể hoàn tác.</span>`,
    danger: true,
  });
  if (typeof lucide !== "undefined") lucide.createIcons();
  if (!ok) return;
  try {
    const resp = await fetch(
      `${API}/images/delete?name=${encodeURIComponent(name)}`,
    );
    const data = await resp.json();
    if (data.success) {
      appendLog(`🗑️ Deleted: ${name}`, "success");
      imgRefreshGallery();
    } else {
      appendLog("❌ " + (data.error || "Delete failed"), "error");
    }
  } catch (e) {
    appendLog("❌ Delete error: " + e.message, "error");
  }
}

// ═══════════════════════════════════════════
// Flow Builder — Visual Automation
// ═══════════════════════════════════════════

let _flowInitialized = false;
const flowSteps = [];

// Dropdown options for "then/else" actions
function getThenOptions() {
  return ideLang === 'vi' ? [
    { v: "tap_it", l: "Tap vị trí tìm thấy" },
    { v: "tap_xy", l: "Tap toạ độ..." },
    { v: "log", l: "Log" },
    { v: "toast", l: "Toast" },
    { v: "skip", l: "Bỏ qua" },
    { v: "stop", l: "Dừng script" },
  ] : [
    { v: "tap_it", l: "Tap found location" },
    { v: "tap_xy", l: "Tap coordinates..." },
    { v: "log", l: "Log" },
    { v: "toast", l: "Toast" },
    { v: "skip", l: "Skip" },
    { v: "stop", l: "Stop script" },
  ];
}
function getElseOptions() {
  return ideLang === 'vi' ? [
    { v: "skip", l: "Bỏ qua" },
    { v: "log", l: "Log" },
    { v: "toast", l: "Toast" },
    { v: "stop", l: "Dừng script" },
    { v: "tap_xy", l: "Tap toạ độ..." },
  ] : [
    { v: "skip", l: "Skip" },
    { v: "log", l: "Log" },
    { v: "toast", l: "Toast" },
    { v: "stop", l: "Stop script" },
    { v: "tap_xy", l: "Tap coordinates..." },
  ];
}

function getFlowActions() {
  const isVi = ideLang === 'vi';
  return {
    // Simple actions
    tap:        { icon: "pointer", label: "Tap",         cat: "simple", fields: [{n:"x",w:50},{n:"y",w:50}] },
    swipe:      { icon: "move-horizontal", label: "Swipe", cat: "simple", fields: [{n:"x1",w:40},{n:"y1",w:40},{n:"→",t:"label"},{n:"x2",w:40},{n:"y2",w:40},{n:"dur",w:35,v:"0.3"}] },
    longpress:  { icon: "hand", label: "Long Press",  cat: "simple", fields: [{n:"x",w:50},{n:"y",w:50},{n:"dur",w:35,v:"1.0"}] },
    sleep:      { icon: "clock", label: "Sleep",       cat: "simple", fields: [{n:"sec",w:50,v:"1.0"}] },
    openapp:    { icon: "play", label: isVi ? "Mở App" : "Open App",  cat: "simple", fields: [{n:"bundleId",w:150,v:"com.apple.mobilesafari"}] },
    closeapp:   { icon: "square", label: isVi ? "Đóng App" : "Close App", cat: "simple", fields: [{n:"bundleId",w:150,v:"com.apple.mobilesafari"}] },
    home:       { icon: "home", label: "Home",        cat: "simple", fields: [] },
    typetext:   { icon: "type", label: isVi ? "Nhập chữ" : "Type Text",   cat: "simple", fields: [{n:"text",w:150,v:"Hello"}] },
    toast:      { icon: "message-square", label: "Toast", cat: "simple", fields: [{n:"msg",w:150,v:"Done!"}] },
    log:        { icon: "file-text", label: "Log",     cat: "simple", fields: [{n:"msg",w:150,v:"Step done"}] },

    // Conditional actions (with then/else)
    findimage:  { icon: "image", label: isVi ? "Tìm hình" : "Find Image",   cat: "cond", fields: [{n:"image",w:80,v:"icon.png"}],
                  then_label: isVi ? "Tìm thấy →" : "Found →", else_label: isVi ? "Không thấy →" : "Not found →", then_default: "tap_it", else_default: "skip" },
    waitimage:  { icon: "image-plus", label: isVi ? "Chờ hình" : "Wait Image",   cat: "cond", fields: [{n:"image",w:80,v:"icon.png"},{n:"timeout",w:35,v:"10"}],
                  then_label: isVi ? "Xuất hiện →" : "Appeared →", else_label: isVi ? "Hết giờ →" : "Timeout →", then_default: "tap_it", else_default: "log" },
    waitcolor:  { icon: "palette", label: isVi ? "Chờ màu" : "Wait Color",   cat: "cond", fields: [{n:"x",w:40},{n:"y",w:40},{n:"color",w:65},{n:"timeout",w:35,v:"10"}],
                  then_label: isVi ? "Đúng màu →" : "Color matched →", else_label: isVi ? "Hết giờ →" : "Timeout →", then_default: "log", else_default: "skip" },
    checkcolor: { icon: "crosshair", label: isVi ? "Kiểm tra màu" : "Check Color", cat: "cond", fields: [{n:"x",w:40},{n:"y",w:40},{n:"color",w:65}],
                  then_label: isVi ? "Khớp màu →" : "Match →", else_label: isVi ? "Không khớp →" : "No match →", then_default: "log", else_default: "skip" },
    ifcolor:    { icon: "help-circle", label: isVi ? "Nếu màu" : "If Color",     cat: "cond", fields: [{n:"x",w:40},{n:"y",w:40},{n:"color",w:65}],
                  then_label: isVi ? "Đúng →" : "True →", else_label: isVi ? "Sai →" : "False →", then_default: "log", else_default: "skip" },

    // Loop
    loop:       { icon: "repeat", label: isVi ? "Lặp lại" : "Repeat",      cat: "loop", fields: [{n:"times",w:40,v:"3"}] },
  };
}

function refreshFlowPalette() {
  const palette = document.getElementById("flowPalette");
  if (!palette) return;
  const isVi = ideLang === 'vi';
  const actions = getFlowActions();
  const icon = (name) => `<i data-lucide="${name}" style="width:12px;height:12px;vertical-align:-2px;margin-right:3px;"></i>`;
  const sIcon = (name) => `<i data-lucide="${name}" style="width:10px;height:10px;vertical-align:-1px;margin-right:2px;"></i>`;
  const sec = (ic, label) => `<div style="font-size:10px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; padding:4px 6px; margin-top:8px;">${sIcon(ic)} ${label}</div>`;
  const item = (action) => `<div class="flow-action-item" data-action="${action}">${icon(actions[action].icon)}${actions[action].label}</div>`;

  palette.innerHTML = `
    ${sec("hand", "Touch")}
    ${item("tap")}${item("swipe")}${item("longpress")}
    ${sec("clock", isVi ? "Chờ" : "Wait")}
    ${item("sleep")}${item("waitcolor")}${item("waitimage")}
    ${sec("smartphone", "App")}
    ${item("openapp")}${item("closeapp")}${item("home")}
    ${sec("search", isVi ? "Màn hình" : "Screen")}
    ${item("findimage")}${item("checkcolor")}
    ${sec("git-branch", "Flow")}
    ${item("loop")}${item("ifcolor")}
    ${sec("edit-3", isVi ? "Nhập" : "Input")}
    ${item("typetext")}${item("toast")}${item("log")}
  `;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function initFlowBuilder() {
  if (_flowInitialized) return;
  _flowInitialized = true;

  refreshFlowPalette();

  const canvas = document.getElementById("flowCanvas");
  const palette = document.getElementById("flowPalette");
  if (!canvas || !palette) return;

  palette.addEventListener("click", (e) => {
    const item = e.target.closest(".flow-action-item");
    if (!item) return;
    const action = item.dataset.action;
    if (!getFlowActions()[action]) return;
    addFlowStep(action);
  });

  document.getElementById("flowRunBtn")?.addEventListener("click", runFlow);
  document.getElementById("flowCopyBtn")?.addEventListener("click", () => {
    const code = generateFlowCode();
    if (code) { copyToClipboard(code); appendLog("📋 Flow code copied", "success"); }
  });
  document.getElementById("flowInsertBtn")?.addEventListener("click", () => {
    const code = generateFlowCode();
    if (!code) return;
    if (state.editor) {
      // Switch to Editor tab first
      const editorTab = document.querySelector('[data-tab="editor"]');
      if (editorTab) editorTab.click();
      setTimeout(() => {
        const pos = state.editor.getPosition();
        state.editor.executeEdits("flow", [{ range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: code + "\n" }]);
        state.editor.focus();
        appendLog("📝 Flow code inserted into editor", "success");
      }, 100);
    } else {
      appendLog("⚠️ Editor not ready", "warn");
    }
  });
  document.getElementById("flowClearBtn")?.addEventListener("click", () => {
    flowSteps.length = 0;
    renderFlowCanvas();
  });
}

function addFlowStep(action) {
  const def = getFlowActions()[action];
  const step = { action, values: {} };
  def.fields.forEach(f => {
    if (f.t === "label") return;
    step.values[f.n] = f.v || "";
  });
  // Conditional defaults
  if (def.cat === "cond") {
    step.values._then = def.then_default || "skip";
    step.values._else = def.else_default || "skip";
    step.values._then_x = ""; step.values._then_y = "";
    step.values._else_x = ""; step.values._else_y = "";
  }
  // Loop defaults (repeat all previous steps)
  if (def.cat === "loop") {
    step.values._from = "1";
    step.values._to = String(Math.max(1, flowSteps.length));
  }
  flowSteps.push(step);
  renderFlowCanvas();
}

function makeSelect(options, selected, onChange) {
  const sel = document.createElement("select");
  sel.style.cssText = "background:var(--bg-primary);border:1px solid var(--border-color);border-radius:3px;color:var(--text-primary);font-size:10px;padding:2px 4px;outline:none;max-width:150px;";
  options.forEach(o => {
    const opt = document.createElement("option");
    opt.value = o.v;
    opt.textContent = o.l;
    if (o.v === selected) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

function renderFlowCanvas() {
  const canvas = document.getElementById("flowCanvas");
  const emptyEl = document.getElementById("flowEmpty");
  if (!canvas) return;

  canvas.querySelectorAll(".flow-step-card, .flow-step-arrow").forEach(el => el.remove());

  if (flowSteps.length === 0) {
    if (emptyEl) emptyEl.style.display = "flex";
    updateFlowCode();
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  flowSteps.forEach((step, i) => {
    if (i > 0) {
      const arrow = document.createElement("div");
      arrow.className = "flow-step-arrow";
      arrow.textContent = "↓";
      canvas.appendChild(arrow);
    }

    const def = getFlowActions()[step.action];
    if (!def) return; // skip unknown actions
    const card = document.createElement("div");
    card.className = "flow-step-card";
    card.dataset.type = step.action;

    // Step number
    const num = document.createElement("span");
    num.className = "flow-step-num";
    num.textContent = i + 1;
    card.appendChild(num);

    // Icon (Lucide)
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", def.icon);
    icon.style.cssText = "width:14px;height:14px;flex-shrink:0;color:var(--accent);";
    card.appendChild(icon);

    // Fields container
    const fields = document.createElement("div");
    fields.className = "flow-step-fields";
    fields.style.flexDirection = "column";
    fields.style.alignItems = "flex-start";
    fields.style.gap = "3px";

    // Row 1: main fields
    const row1 = document.createElement("div");
    row1.style.cssText = "display:flex; align-items:center; gap:4px; flex-wrap:wrap;";

    def.fields.forEach(f => {
      if (f.t === "label") {
        const lbl = document.createElement("span");
        lbl.textContent = f.n;
        lbl.style.cssText = "font-size:11px; color:var(--text-secondary); margin:0 2px;";
        row1.appendChild(lbl);
        return;
      }
      const lbl = document.createElement("label");
      lbl.textContent = f.n + ":";
      row1.appendChild(lbl);
      const inp = document.createElement("input");
      inp.value = step.values[f.n] || "";
        inp.style.width = (f.w || 50) + "px";
      inp.addEventListener("input", () => { step.values[f.n] = inp.value; updateFlowCode(); });
      row1.appendChild(inp);
    });

    // Loop: from/to step selectors
    if (def.cat === "loop" && i > 0) {
      const stepsAbove = [];
      for (let s = 0; s < i; s++) {
        const sd = getFlowActions()[flowSteps[s].action];
        if (sd) stepsAbove.push({ v: String(s+1), l: `${s+1}. ${sd.icon} ${sd.label}` });
      }
      if (stepsAbove.length > 0) {
        const lbl1 = document.createElement("span");
        lbl1.textContent = "lần, từ bước";
        lbl1.style.cssText = "font-size:10px; color:var(--text-secondary);";
        row1.appendChild(lbl1);
        row1.appendChild(makeSelect(stepsAbove, step.values._from || "1", sv => { step.values._from = sv; updateFlowCode(); }));
        const lbl2 = document.createElement("span");
        lbl2.textContent = "→";
        lbl2.style.cssText = "font-size:10px; color:var(--text-secondary);";
        row1.appendChild(lbl2);
        row1.appendChild(makeSelect(stepsAbove, step.values._to || String(i), sv => { step.values._to = sv; updateFlowCode(); }));
      }
    } else if (def.cat === "loop" && i === 0) {
      const hint = document.createElement("span");
      hint.textContent = "lần (thêm bước trước Repeat)";
      hint.style.cssText = "font-size:10px; color:var(--text-secondary); opacity:0.7;";
      row1.appendChild(hint);
    }

    fields.appendChild(row1);

    // Row 2 & 3: then/else for conditional
    if (def.cat === "cond") {
      // Then row
      const row2 = document.createElement("div");
      row2.style.cssText = "display:flex; align-items:center; gap:4px; flex-wrap:wrap;";
      const thenLbl = document.createElement("span");
      thenLbl.textContent = def.then_label;
      thenLbl.style.cssText = "font-size:10px; color:#4ade80; min-width:100px;";
      row2.appendChild(thenLbl);
      row2.appendChild(makeSelect(getThenOptions(), step.values._then, v => { step.values._then = v; renderFlowCanvas(); }));
      // Extra fields for tap_xy
      if (step.values._then === "tap_xy") {
        const tx = document.createElement("input"); tx.placeholder = "x"; tx.value = step.values._then_x || "";
        tx.style.width = "40px"; tx.addEventListener("input", () => { step.values._then_x = tx.value; updateFlowCode(); });
        const ty = document.createElement("input"); ty.placeholder = "y"; ty.value = step.values._then_y || "";
        ty.style.width = "40px"; ty.addEventListener("input", () => { step.values._then_y = ty.value; updateFlowCode(); });
        row2.appendChild(tx); row2.appendChild(ty);
      }
      fields.appendChild(row2);

      // Else row
      const row3 = document.createElement("div");
      row3.style.cssText = "display:flex; align-items:center; gap:4px; flex-wrap:wrap;";
      const elseLbl = document.createElement("span");
      elseLbl.textContent = def.else_label;
      elseLbl.style.cssText = "font-size:10px; color:#f87171; min-width:100px;";
      row3.appendChild(elseLbl);
      row3.appendChild(makeSelect(getElseOptions(), step.values._else, v => { step.values._else = v; renderFlowCanvas(); }));
      if (step.values._else === "tap_xy") {
        const ex = document.createElement("input"); ex.placeholder = "x"; ex.value = step.values._else_x || "";
        ex.style.width = "40px"; ex.addEventListener("input", () => { step.values._else_x = ex.value; updateFlowCode(); });
        const ey = document.createElement("input"); ey.placeholder = "y"; ey.value = step.values._else_y || "";
        ey.style.width = "40px"; ey.addEventListener("input", () => { step.values._else_y = ey.value; updateFlowCode(); });
        row3.appendChild(ex); row3.appendChild(ey);
      }
      fields.appendChild(row3);
    }

    card.appendChild(fields);

    // Delete
    const del = document.createElement("span");
    del.className = "flow-step-delete";
    del.innerHTML = "✕";
    del.title = "Remove step";
    del.addEventListener("click", () => { flowSteps.splice(i, 1); renderFlowCanvas(); });
    card.appendChild(del);

    canvas.appendChild(card);
  });

  updateFlowCode();
  canvas.scrollTop = canvas.scrollHeight;
  // Render Lucide icons in dynamically created cards
  if (typeof lucide !== "undefined") lucide.createIcons();
}

function genThenElse(action, v, varName) {
  switch (action) {
    case "tap_it": return `tap(${varName}_x, ${varName}_y)`;
    case "tap_xy": return `tap(${v._then_x || v._else_x || 0}, ${v._then_y || v._else_y || 0})`;
    case "log": return `log("${varName} result")`;
    case "toast": return `toast("${varName}!")`;
    case "stop": return `stop()`;
    case "skip": default: return null;
  }
}

function generateFlowCode() {
  // Step 1: Generate code lines for each step (except loops)
  const stepCode = []; // array of { lines: string[], isLoop: bool, from, to, times }
  flowSteps.forEach((step) => {
    const v = step.values;
    const code = [];
    switch (step.action) {
      case "tap": code.push(`tap(${v.x||0}, ${v.y||0})`); break;
      case "swipe": code.push(`swipe(${v.x1||0}, ${v.y1||0}, ${v.x2||0}, ${v.y2||0}, ${v.dur||0.3})`); break;
      case "longpress": code.push(`longPress(${v.x||0}, ${v.y||0}, ${v.dur||1.0})`); break;
      case "sleep": code.push(`sleep(${v.sec||1})`); break;
      case "openapp": code.push(`appRun("${v.bundleId||""}")`); break;
      case "closeapp": code.push(`appKill("${v.bundleId||""}")`); break;
      case "home": code.push(`home()`); break;
      case "typetext": code.push(`inputText("${(v.text||"").replace(/"/g, '\\"')}")`); break;
      case "toast": code.push(`toast("${(v.msg||"").replace(/"/g, '\\"')}")`); break;
      case "log": code.push(`log("${(v.msg||"").replace(/"/g, '\\"')}")`); break;
      case "findimage":
        code.push(`local fi_x, fi_y = findImage("${v.image||"icon.png"}", 1, 0.9)`);
        code.push(`if fi_x then`);
        { const a = genCondAction(v._then, v, "fi", "  ", "found"); if (a) code.push(a); }
        { const a = genCondAction(v._else, v, "fi", "  ", "not_found"); if (a) { code.push("else"); code.push(a); } }
        code.push("end");
        break;
      case "waitimage":
        code.push(`local wi_ok = waitForImage("${v.image||"icon.png"}", ${v.timeout||10})`);
        code.push(`if wi_ok then`);
        { const a = genCondAction(v._then, v, "wi", "  ", "appeared"); if (a) code.push(a); }
        { const a = genCondAction(v._else, v, "wi", "  ", "timeout"); if (a) { code.push("else"); code.push(a); } }
        code.push("end");
        break;
      case "waitcolor":
        code.push(`local wc_ok = waitForColor(${v.x||0}, ${v.y||0}, ${v.color||0}, ${v.timeout||10})`);
        code.push(`if wc_ok then`);
        { const a = genCondAction(v._then, v, "wc", "  ", "color_matched"); if (a) code.push(a); }
        { const a = genCondAction(v._else, v, "wc", "  ", "timeout"); if (a) { code.push("else"); code.push(a); } }
        code.push("end");
        break;
      case "checkcolor":
      case "ifcolor":
        code.push(`if getColor(${v.x||0}, ${v.y||0}) == ${v.color||0} then`);
        { const a = genCondAction(v._then, v, "cc", "  ", "color_match"); if (a) code.push(a); }
        { const a = genCondAction(v._else, v, "cc", "  ", "no_match"); if (a) { code.push("else"); code.push(a); } }
        code.push("end");
        break;
      case "loop":
        stepCode.push({
          isLoop: true,
          times: v.times || 3,
          from: parseInt(v._from || "1") - 1,
          to: parseInt(v._to || "1") - 1,
          lines: []
        });
        return;
    }
    stepCode.push({ isLoop: false, lines: code });
  });

  // Step 2: Build final code, handling loops
  const output = [];
  const processed = new Set();

  stepCode.forEach((item, idx) => {
    if (processed.has(idx)) return;
    if (item.isLoop) {
      const from = Math.max(0, Math.min(item.from, idx - 1));
      const to = Math.max(from, Math.min(item.to, idx - 1));
      output.push(`for i = 1, ${item.times} do`);
      for (let s = from; s <= to; s++) {
        if (!stepCode[s].isLoop) {
          stepCode[s].lines.forEach(l => output.push("  " + l));
          processed.add(s);
        }
      }
      output.push("end");
    } else {
      item.lines.forEach(l => output.push(l));
    }
  });

  return output.join("\n");
}

function genCondAction(action, v, prefix, indent, context) {
  switch (action) {
    case "tap_it": return `${indent}tap(${prefix}_x, ${prefix}_y)`;
    case "tap_xy": {
      const key = context.includes("match") || context.includes("found") || context.includes("appeared") || context.includes("color_match");
      const x = key ? (v._then_x || 0) : (v._else_x || 0);
      const y = key ? (v._then_y || 0) : (v._else_y || 0);
      return `${indent}tap(${x}, ${y})`;
    }
    case "log": return `${indent}log("${context}")`;
    case "toast": return `${indent}toast("${context}")`;
    case "stop": return `${indent}stop()`;
    case "skip": default: return null;
  }
}

function updateFlowCode() {
  const codeArea = document.getElementById("flowCodeArea");
  if (codeArea) {
    const code = generateFlowCode();
    codeArea.textContent = code || "-- Thêm bước để tạo code";
  }
}

async function runFlow() {
  const code = generateFlowCode();
  if (!code.trim()) { appendLog("⚠️ Flow is empty", "warn"); return; }

  // Insert flow code into editor
  if (state.editor) {
    setEditorValue(code);
    state._dirty = true; // mark as unsaved flow code
    state.currentFileName = null; // new flow = new file
  }

  // Switch to Editor tab and run (triggers save-before-run)
  const editorTab = document.querySelector('[data-tab="editor"]');
  if (editorTab) editorTab.click();
  setTimeout(() => runScript(), 200);
}


// ── Helper: import array of image Files ──────────────────────────────────────
async function ic_importImageFiles(files) {
  const saveToPhotos = true;
  let ok = 0, fail = 0;
  appendLog(`📥 Đang nhập ${files.length} ảnh vào Album…`, "info");

  for (const file of files) {
    try {
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Ensure proper extension
      let name = file.name;
      const ext = name.split(".").pop().toLowerCase();
      if (!["png","jpg","jpeg","gif","webp"].includes(ext)) name += ".png";

      const resp = await fetch(`${API}/images/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data: b64, saveToPhotos }),
      });
      const data = await resp.json();
      if (data.success) {
        ok++;
        appendLog(`✅ ${data.name}${data.savedToPhotos ? " · 📸 Photos" : ""}`, "success");
      } else {
        fail++;
        appendLog(`❌ ${name}: ${data.error || "unknown error"}`, "error");
      }
    } catch (e) {
      fail++;
      appendLog(`❌ ${file.name}: ${e.message}`, "error");
    }
  }

  const summary = fail === 0
    ? `✅ Import ${ok}/${files.length} ảnh thành công`
    : `⚠️ ${ok} thành công · ${fail} lỗi`;
  appendLog(summary, fail === 0 ? "success" : "warning");
  
  // Refresh the Helper Modal gallery
  document.getElementById("hmRefreshGallery")?.click();
  
  // Call global refresh if user exists old UI
  if (typeof imgRefreshGallery === "function") {
    imgRefreshGallery();
  }
}
