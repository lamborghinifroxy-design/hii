const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 80;
const DATA_FILE = path.join(__dirname, "data.json");

// ─── Persistence ─────────────────────────────────────────────────────────────

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { count: 0, firstSeen: null };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── SSE broadcast to all connected dashboard clients ────────────────────────

const clients = new Set();

function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch {}
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Real-time SSE stream ─────────────────────────────────────────────────────

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const current = loadData();
  res.write(`data: ${JSON.stringify(current)}\n\n`);

  clients.add(res);
  req.on("close", () => clients.delete(res));
});

// ─── POST /install — called by app on first open ──────────────────────────────

app.get("/install", (req, res) => {
  const data = loadData();
  data.count += 1;
  if (!data.firstSeen) data.firstSeen = new Date().toISOString();
  data.lastSeen = new Date().toISOString();
  saveData(data);
  broadcast(data);
  console.log(`[install] count is now ${data.count}`);
  res.type("text/plain").send(String(data.count));
});

app.post("/install", (req, res) => {
  const data = loadData();
  data.count += 1;
  if (!data.firstSeen) data.firstSeen = new Date().toISOString();
  data.lastSeen = new Date().toISOString();
  saveData(data);
  broadcast(data);
  console.log(`[install] count is now ${data.count}`);
  res.json({ success: true, count: data.count });
});

// ─── GET /count — simple JSON read ───────────────────────────────────────────

app.get("/count", (req, res) => {
  res.type("text/plain").send(String(loadData().count));
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Discord Tools install tracker running on port ${PORT}`);
  if (!fs.existsSync(DATA_FILE)) saveData({ count: 0, firstSeen: null, lastSeen: null });
});
