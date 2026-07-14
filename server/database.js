const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(DB_PATH);

function initDb() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Create licenses table
      db.run(`
        CREATE TABLE IF NOT EXISTS licenses (
          key TEXT PRIMARY KEY,
          plan TEXT DEFAULT 'Premium',
          expires_at TEXT DEFAULT 'Lifetime',
          days_left INTEGER DEFAULT 99999,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return reject(err);
      });

      // 2. Create devices table
      db.run(`
        CREATE TABLE IF NOT EXISTS devices (
          udid TEXT PRIMARY KEY,
          license_key TEXT,
          activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(license_key) REFERENCES licenses(key)
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

// Admin: Create a new license key
function createLicenseKey(key, plan = 'Premium', expiresAt = 'Lifetime', daysLeft = 99999) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO licenses (key, plan, expires_at, days_left) VALUES (?, ?, ?, ?)`,
      [key, plan, expiresAt, daysLeft],
      function (err) {
        if (err) return reject(err);
        resolve({ key, plan, expires_at: expiresAt, days_left: daysLeft });
      }
    );
  });
}

// Client: Verify and activate device
function verifyLicenseKey(key, udid) {
  return new Promise((resolve, reject) => {
    // 1. Check if license key exists
    db.get(`SELECT * FROM licenses WHERE key = ?`, [key], (err, license) => {
      if (err) return reject(err);
      if (!license) {
        return reject(new Error('Key không tồn tại / Invalid key'));
      }

      // 2. Bind key to device UDID
      db.run(
        `INSERT OR REPLACE INTO devices (udid, license_key) VALUES (?, ?)`,
        [udid, key],
        function (err) {
          if (err) return reject(err);
          resolve(license);
        }
      );
    });
  });
}

// Client/Tweak: Check device license status
function checkDeviceLicense(udid) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT d.udid, l.plan, l.expires_at, l.days_left, d.activated_at 
       FROM devices d 
       JOIN licenses l ON d.license_key = l.key 
       WHERE d.udid = ?`,
      [udid],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

// Admin: List all licenses and active devices
function listLicenses() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT l.key, l.plan, l.expires_at, l.days_left, d.udid, d.activated_at 
       FROM licenses l 
       LEFT JOIN devices d ON l.key = d.license_key`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

module.exports = {
  initDb,
  createLicenseKey,
  verifyLicenseKey,
  checkDeviceLicense,
  listLicenses
};
