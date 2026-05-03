const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 80;
const DATA_FILE = path.join(__dirname, "data.json");

// --- CONFIGURATION ---
const GIST_ID = "f926fbfffef9da78a46a62057b02404d";
const GITHUB_TOKEN = "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";
// ---------------------

// ─── Persistence Logic (Cloud Sync) ──────────────────────────────────────────

async function syncFromGist() {
  try {
    const res = await axios.get(`https://github.com{GIST_ID}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
    const remoteData = JSON.parse(res.data.files["data.json"].content);
    fs.writeFileSync(DATA_FILE, JSON.stringify(remoteData, null, 2));
    console.log(`[Cloud Sync] Data pulled from GitHub: ${remoteData.count}`);
    return remoteData;
  } catch (err) {
    console.log("[Cloud Sync] Error or first run, using local data.");
    return loadLocalData();
  }
}

async function syncToGist(data) {
  try {
    await axios.patch(`https://github.com{GIST_ID}`, {
      files: { "data.json": { content: JSON.stringify(data, null, 2) } }
    }, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
  } catch (err) {
    console.error("[Cloud Sync] Save failed:", err.message);
  }
}

function loadLocalData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (err) {
    console.error("Local read error:", err);
  }
  return { count: 0, firstSeen: null, lastSeen: null };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  syncToGist(data); // Sync to GitHub every time data changes
}

// ─── SSE Setup ───────────────────────────────────────────────────────────────

const clients = new Set();
function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch {}
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Routes ──────────────────────────────────────────────────────────────────

// Real-time Dashboard Stream
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const current = loadLocalData();
  res.write(`data: ${JSON.stringify(current)}\n\n`);

  clients.add(res);
  req.on("close", () => clients.delete(res));
});

// FIXED: Increase Route
// Usage: /increase?500
app.get("/increase", (req, res) => {
  const data = loadLocalData();
  
  // This logic correctly grabs the number even if there is no key (e.g., ?500)
  const queryString = req.url.split('?')[1];
  const amount = parseInt(queryString) || 0;
  
  data.count += amount;
  data.lastSeen = new Date().toISOString();
  if (!data.firstSeen) data.firstSeen = data.lastSeen;
  
  saveData(data);
  broadcast(data);
  
  console.log(`[increase] Added ${amount}. Total: ${data.count}`);
  res.send(`Successfully increased by ${amount}. Total is now ${data.count}`);
});

// Install Tracking (Original Logic)
app.get("/install", (req, res) => {
  const data = loadLocalData();
  data.count += 1;
  if (!data.firstSeen) data.firstSeen = new Date().toISOString();
  data.lastSeen = new Date().toISOString();
  saveData(data);
  broadcast(data);
  res.type("text/plain").send(String(data.count));
});

app.post("/install", (req, res) => {
  const data = loadLocalData();
  data.count += 1;
  if (!data.firstSeen) data.firstSeen = new Date().toISOString();
  data.lastSeen = new Date().toISOString();
  saveData(data);
  broadcast(data);
  res.json({ success: true, count: data.count });
});

// Simple Count Check
app.get("/count", (req, res) => {
  res.type("text/plain").send(String(loadLocalData().count));
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`Server live on port ${PORT}`);
  
  // 1. Pull latest data from GitHub on start
  await syncFromGist();
  
  // 2. Safety interval: Sync to GitHub every 10 mins even if no activity
  setInterval(() => {
    const data = loadLocalData();
    syncToGist(data);
  }, 600000);
});
