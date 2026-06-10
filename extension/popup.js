// Save to ReadStack — popup logic.
// Reads the active tab, POSTs its URL to {API}/add, shows a status line.

// Default backend for the demo. Override at runtime in the "Backend" field
// (persisted in chrome.storage.local). For prod, change DEFAULT_API and the
// host_permissions entry in manifest.json.
const DEFAULT_API = "http://localhost:8000";

const els = {
  title: document.getElementById("title"),
  url: document.getElementById("url"),
  save: document.getElementById("save"),
  status: document.getElementById("status"),
  api: document.getElementById("api"),
};

let activeTab = null;

function setStatus(msg, kind) {
  els.status.textContent = msg;
  els.status.className = "status" + (kind ? " " + kind : "");
}

function apiBase() {
  return (els.api.value || DEFAULT_API).trim().replace(/\/+$/, "");
}

async function loadActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  if (!activeTab || !activeTab.url) {
    els.title.textContent = "No active tab";
    els.url.textContent = "";
    els.save.disabled = true;
    return;
  }
  els.title.textContent = activeTab.title || activeTab.url;
  els.url.textContent = activeTab.url;
}

async function loadApiBase() {
  try {
    const { readstackApi } = await chrome.storage.local.get("readstackApi");
    els.api.value = readstackApi || DEFAULT_API;
  } catch {
    els.api.value = DEFAULT_API;
  }
}

async function save() {
  if (!activeTab || !activeTab.url) return;
  const url = activeTab.url;
  els.save.disabled = true;
  setStatus("Saving…");

  // Persist the chosen backend for next time.
  try { await chrome.storage.local.set({ readstackApi: apiBase() }); } catch {}

  try {
    const res = await fetch(`${apiBase()}/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    let topic = "";
    try {
      const data = await res.json();
      // Response shape may evolve — surface a topic label if present.
      topic = data?.topic?.label || data?.topic || data?.label || "";
    } catch { /* non-JSON 200 is still a success */ }
    setStatus(topic ? `Saved ✓ → ${topic}` : "Saved ✓", "ok");
  } catch (err) {
    setStatus(`Error: ${err.message}. Is the backend running?`, "err");
    els.save.disabled = false;
  }
}

els.save.addEventListener("click", save);

loadApiBase();
loadActiveTab();
