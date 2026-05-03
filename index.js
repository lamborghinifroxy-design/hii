const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 80;
const DATA_FILE = path.join(__dirname, "data.json");

// --- CONFIGURATION ---
const GITHUB_TOKEN = "ghp_XdpOkFIopQdxqNxatc7Xwhmlm3P8Et31AOWw";
const GIST_ID = "f926fbfffef9da78a46a62057b02404d";
// ---------------------

async function syncFromGist() {
  try {
    const res = await axios.get(`https://github.com{GIST_ID}`, {
      headers: { 
        Authorization: `token ${GITHUB_TOKEN}`,
        "User-Agent": "Discord-Tracker"
      }
    });
    const remoteData = JSON.parse(res.data.files["data.json"].content);
    fs.writeFileSync(DATA_FILE, JSON.stringify(remoteData, null, 2));
    console.log("[Cloud Sync] Success! Data loaded from Gist.");
    return remoteData;
  } catch (err) {
    console.log("[Cloud Sync] Fetch failed. Check if Gist is Public and Token has 'gist' scope.");
    return loadLocalData();
  }
}

async function syncToGist(data) {
  try {
    await axios.patch(`https://github.com{GIST_ID}`, {
      files: { "data.json": { content: JSON.stringify(data, null, 2) } }
    }, {
      headers: { 
        Authorization: `token ${GITHUB_TOKEN}`,
        "User-Agent": "Discord-Tracker",
        "Accept": "application/vnd.github+json"
      }
    });
    console.log("[Cloud Sync] Gist updated successfully!");
  } catch (err) {
    console.error("[Cloud Sync] Save failed. Status:", err.response ? err.response.status : err.message);
  }
}

function loadLocalData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (err) { }
  return { count: 0, firstSeen: null, lastSeen: null };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  syncToGist(data);
}

const clients = new Set();
function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) { try { res.write(payload); } catch {} }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(loadLocalData())}\n\n`);
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

// Route: /increase?500
app.get("/increase", (req, res) => {
  const data = loadLocalData();
  const amount = parseInt(req.url.split("?")[1]) || 0;
  
  data.count += amount;
  data.lastSeen = new Date().toISOString();
  if (!data.firstSeen) data.firstSeen = data.lastSeen;
  
  saveData(data);
  broadcast(data);
  res.send(`Added ${amount}. Total: ${data.count}`);
});

app.all("/install", (req, res) => {
  const data = loadLocalData();
  data.count += 1;
  data.lastSeen = new Date().toISOString();
  if (!data.firstSeen) data.firstSeen = data.lastSeen;
  saveData(data);
  broadcast(data);
  if (req.method === "POST") res.json({ success: true, count: data.count });
  else res.type("text/plain").send(String(data.count));
});

app.get("/count", (req, res) => {
  res.type("text/plain").send(String(loadLocalData().count));
});

app.listen(PORT, async () => {
  console.log(`Server live on port ${PORT}`);
  await syncFromGist();
  setInterval(() => syncToGist(loadLocalData()), 600000);
});
