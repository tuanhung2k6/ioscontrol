const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static Web IDE files
const STATIC_PATH = path.join(__dirname, '..', 'static');
app.use(express.static(STATIC_PATH));

// Helper: Generate random key in format: IOSC-XXXX-XXXX-XXXX
function generateRandomKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `IOSC-${part()}-${part()}-${part()}`;
}

// ----------------------------------------------------
// 1. License Client APIs
// ----------------------------------------------------

// GET /api/license - Check license by UDID
app.get('/api/license', async (req, res) => {
  try {
    const udid = req.query.udid || req.headers['x-device-udid'];
    if (!udid) {
      return res.json({
        success: true,
        licensed: false,
        expires_at: '—',
        days_left: 0,
        udid: ''
      });
    }

    const license = await db.checkDeviceLicense(udid);
    if (license) {
      res.json({
        success: true,
        licensed: true,
        expires_at: license.expires_at,
        days_left: license.days_left,
        udid: license.udid
      });
    } else {
      res.json({
        success: true,
        licensed: false,
        expires_at: '—',
        days_left: 0,
        udid: udid
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/license/verify - Verify and activate Key for device UDID
app.post('/api/license/verify', async (req, res) => {
  try {
    const { key, udid } = req.body;
    if (!key || !udid) {
      return res.status(400).json({ success: false, error: 'Thiếu thông tin Key hoặc UDID / Missing Key or UDID' });
    }

    const license = await db.verifyLicenseKey(key, udid);
    res.json({
      success: true,
      licensed: true,
      expires_at: license.expires_at,
      days_left: license.days_left,
      udid: udid,
      _sig: `MOCKED_SIG_FOR_${udid}_KEY_${key}` // mock signature
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 2. Announcements API
// ----------------------------------------------------

// GET /api/announcements
app.get('/api/announcements', (req, res) => {
  res.json({
    announcements: [
      {
        id: 1,
        title: "TuanHungDZ License Server",
        message: "Your custom license server is successfully running!",
        message_vi: "Máy chủ quản lý bản quyền cá nhân đang hoạt động tốt!",
        created_at: new Date().toISOString()
      },
      {
        id: 2,
        title: "Repository Clean Mode",
        message: "Static assets and source code are successfully structured for GitHub.",
        message_vi: "Mã nguồn và tệp Web tĩnh đã được sắp xếp gọn gàng cho GitHub.",
        created_at: new Date().toISOString()
      }
    ]
  });
});

// ----------------------------------------------------
// 3. Admin APIs (Key Management Dashboard)
// ----------------------------------------------------

// POST /admin/keys/create - Create a new license key
app.post('/admin/keys/create', async (req, res) => {
  try {
    const { plan, expires_at, days_left } = req.body;
    const key = generateRandomKey();
    const newKey = await db.createLicenseKey(
      key, 
      plan || 'Premium', 
      expires_at || 'Lifetime', 
      days_left !== undefined ? days_left : 99999
    );
    res.json({ success: true, message: 'Tạo key mới thành công / License key created', license: newKey });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /admin/keys/list - List all created keys and associated devices
app.get('/admin/keys/list', async (req, res) => {
  try {
    const list = await db.listLicenses();
    res.json({ success: true, licenses: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 4. Fallbacks
// ----------------------------------------------------

// Fallback to settings.html for UI settings path
app.get('/settings', (req, res) => {
  res.sendFile(path.join(STATIC_PATH, 'settings.html'));
});

// Start Server
db.initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🚀 iOSControl Custom License Server is running!`);
    console.log(`💻 Web IDE UI: http://localhost:${PORT}`);
    console.log(`🔧 Admin List Keys API: http://localhost:${PORT}/admin/keys/list`);
    console.log(`🔧 Admin Create Key API (POST): http://localhost:${PORT}/admin/keys/create`);
    console.log(`=================================================`);
  });
}).catch(err => {
  console.error("Database initialization failed:", err);
});
