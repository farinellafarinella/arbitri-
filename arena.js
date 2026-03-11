const arenaTitle = document.getElementById("arenaTitle");
const arenaStatus = document.getElementById("arenaStatus");
const arenaBadge = document.getElementById("arenaBadge");
const assignedReferee = document.getElementById("assignedReferee");
const startMatchBtn = document.getElementById("startMatchBtn");
const winnerOptions = document.getElementById("winnerOptions");
const confirmWinnerBtn = document.getElementById("confirmWinnerBtn");
const countdownEl = document.getElementById("countdown");
const matchDisplay = document.getElementById("matchDisplay");
const coinPageBtn = document.getElementById("coinPageBtn");
const replayStatus = document.getElementById("replayStatus");
const startReplayBtn = document.getElementById("startReplayBtn");
const markMomentBtn = document.getElementById("markMomentBtn");
const deleteClipBtn = document.getElementById("deleteClipBtn");
const replayVideo = document.getElementById("replayVideo");
const replayMeta = document.getElementById("replayMeta");

const params = new URLSearchParams(window.location.search);
const arenaId = params.get("id");
const tournamentId = params.get("tid");
const backToAdmin = document.getElementById("backToAdmin");
let state = loadState();
let currentArena = null;
let tournament = null;
let replayRecorder = null;
let replayStream = null;
let replayChunks = [];
let replayClipUrl = null;
let replayClip = null;
let replayCreatedAt = null;

function updateArenaUI() {
  if (!currentArena) {
    arenaTitle.textContent = "Arena non trovata";
    arenaStatus.textContent = "Stato: —";
    assignedReferee.textContent = "—";
    countdownEl.textContent = "—";
    return;
  }

  arenaTitle.textContent = currentArena.name;
  arenaStatus.textContent = `Stato: ${statusLabel(currentArena.status)}`;
  arenaBadge.textContent = statusLabel(currentArena.status);
  arenaBadge.className = `badge ${currentArena.status}`;
  assignedReferee.textContent = currentArena.refereeName || "Nessun arbitro assegnato";
  const enabled = Boolean(currentArena.refereeName);
  const canStart = currentArena.status === "called" && timeLeftMs() > 0;
  startMatchBtn.disabled = !enabled || !canStart;
  const hasMatch = currentArena.match && currentArena.match.p1 && currentArena.match.p2;
  startMatchBtn.disabled = !enabled || !canStart || !hasMatch;
  confirmWinnerBtn.disabled = !enabled || currentArena.status !== "occupied" || !hasMatch || !currentArena.selectedWinner;
  renderWinnerOptions();
  matchDisplay.textContent = hasMatch ? `${currentArena.match.p1} vs ${currentArena.match.p2}` : "—";
  updateCountdown();
}

function loadArena() {
  state = loadState();
  tournament = findTournament(state, tournamentId);
  if (!tournament) {
    currentArena = null;
  } else {
    currentArena = tournament.arenas.find((a) => a.id === arenaId) || null;
  }
  updateArenaUI();
}

startMatchBtn.addEventListener("click", () => {
  if (!currentArena) return;
  if (!currentArena.refereeName) return;
  if (currentArena.status !== "called") return;
  if (timeLeftMs() <= 0) return;
  currentArena.status = "occupied";
  currentArena.calledAt = null;
  saveArena();
});

confirmWinnerBtn.addEventListener("click", () => {
  if (!currentArena) return;
  if (!currentArena.refereeName) return;
  if (currentArena.status !== "occupied") return;
  const winner = currentArena.selectedWinner;
  if (!winner) return;
  currentArena.winnerCandidate = winner;
  currentArena.status = "standby";
  currentArena.selectedWinner = "";
  currentArena.match = null;
  saveArena();
  deleteReplayClip();
});


function saveArena() {
  if (!tournament) return;
  const index = tournament.arenas.findIndex((a) => a.id === currentArena.id);
  if (index !== -1) {
    tournament.arenas[index] = currentArena;
  }
  normalizeState(state);
  saveState(state);
  updateArenaUI();
}

subscribeState((newState) => {
  state = newState;
  tournament = findTournament(state, tournamentId);
  const updated = tournament ? tournament.arenas.find((a) => a.id === arenaId) : null;
  if (updated) {
    currentArena = updated;
    updateArenaUI();
  }
});

  if (!arenaId) {
    arenaTitle.textContent = "Arena non trovata";
    startMatchBtn.disabled = true;
    confirmWinnerBtn.disabled = true;
  } else {
    loadArena();
  }

if (backToAdmin) {
  backToAdmin.href = tournamentId ? `tournament.html?id=${tournamentId}` : "index.html";
}

if (!isOnlineMode()) {
  setInterval(() => {
    if (!currentArena) return;
    state = loadState();
    tournament = findTournament(state, tournamentId);
    const updated = tournament ? tournament.arenas.find((a) => a.id === arenaId) : null;
    if (updated) {
      currentArena = updated;
      const changed = expireCalls(state);
      if (changed) saveState(state);
      updateArenaUI();
    }
  }, 1000);
} else {
  setInterval(() => {
    if (!currentArena) return;
    updateArenaUI();
  }, 1000);
}

function timeLeftMs() {
  if (!currentArena || currentArena.status !== "called" || !currentArena.calledAt) return 0;
  const remaining = currentArena.calledAt + callWindowMs() - Date.now();
  return Math.max(0, remaining);
}

function updateCountdown() {
  if (!currentArena || currentArena.status !== "called" || !currentArena.calledAt) {
    if (currentArena && currentArena.status === "expired") {
      countdownEl.textContent = "Scaduto";
    } else {
      countdownEl.textContent = "—";
    }
    return;
  }
  const remaining = timeLeftMs();
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  countdownEl.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function statusLabel(status) {
  if (status === "called") return "Chiamata";
  if (status === "occupied") return "Occupata";
  if (status === "standby") return "In attesa";
  if (status === "expired") return "Scaduta";
  return "Libera";
}

function renderWinnerOptions() {
  winnerOptions.innerHTML = "";
  if (!currentArena || !currentArena.match) return;
  const options = [currentArena.match.p1, currentArena.match.p2].filter(Boolean);
  options.forEach((name) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `winner-btn ${currentArena.selectedWinner === name ? "active" : ""}`;
    btn.textContent = name;
    btn.addEventListener("click", () => {
      currentArena.selectedWinner = name;
      updateArenaUI();
    });
    winnerOptions.appendChild(btn);
  });
}

function replaySupported() {
  return Boolean(navigator.mediaDevices && window.MediaRecorder);
}

function replayEnabled() {
  return Boolean(replayStatus && startReplayBtn && markMomentBtn && replayVideo && deleteClipBtn && replayMeta);
}

function setReplayStatus(text) {
  if (!replayStatus) return;
  replayStatus.textContent = text;
}

function formatBytes(bytes) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function pickReplayMimeType() {
  const options = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  return options.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function openReplayDb() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("IndexedDB non disponibile"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("arena_replay_v1", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("clips")) {
        db.createObjectStore("clips", { keyPath: "arenaId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveReplayClipToDb(arenaKey, clipBlob, createdAt) {
  const db = await openReplayDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("clips", "readwrite");
    tx.objectStore("clips").put({
      arenaId: arenaKey,
      createdAt,
      blob: clipBlob,
      size: clipBlob.size,
      type: clipBlob.type
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadReplayClipFromDb(arenaKey) {
  const db = await openReplayDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("clips", "readonly");
    const request = tx.objectStore("clips").get(arenaKey);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function deleteReplayClipFromDb(arenaKey) {
  const db = await openReplayDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("clips", "readwrite");
    tx.objectStore("clips").delete(arenaKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function resetReplayPreview() {
  if (!replayEnabled()) return;
  if (replayClipUrl) {
    URL.revokeObjectURL(replayClipUrl);
    replayClipUrl = null;
  }
  replayVideo.pause();
  replayVideo.srcObject = null;
  replayVideo.src = "";
  replayVideo.hidden = true;
  replayMeta.hidden = true;
  replayMeta.textContent = "—";
  replayClip = null;
  replayCreatedAt = null;
}

function showReplayClip(clipBlob, createdAt) {
  if (!replayEnabled()) return;
  resetReplayPreview();
  replayClip = clipBlob;
  replayCreatedAt = createdAt;
  replayClipUrl = URL.createObjectURL(clipBlob);
  replayVideo.srcObject = null;
  replayVideo.src = replayClipUrl;
  replayVideo.controls = true;
  replayVideo.muted = false;
  replayVideo.hidden = false;
  replayMeta.hidden = false;
  const time = new Date(createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  replayMeta.textContent = `Clip salvato alle ${time} (${formatBytes(clipBlob.size)})`;
  replayVideo.play().catch(() => {});
  deleteClipBtn.disabled = false;
}

function stopReplayStream() {
  if (!replayStream) return;
  replayStream.getTracks().forEach((track) => track.stop());
  replayStream = null;
}

function stopReplayRecording() {
  if (replayRecorder && replayRecorder.state !== "inactive") {
    replayRecorder.stop();
  }
}

async function startReplayRecording() {
  if (!replayEnabled()) return;
  if (!arenaId) {
    setReplayStatus("Arena non valida.");
    return;
  }
  if (!replaySupported()) {
    setReplayStatus("Registrazione non supportata su questo browser.");
    return;
  }
  if (!window.isSecureContext) {
    setReplayStatus("Richiesta HTTPS per usare la videocamera.");
    return;
  }
  try {
    setReplayStatus("Richiedo accesso alla videocamera...");
    resetReplayPreview();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    replayStream = stream;
    replayChunks = [];
    // Show a small inline preview while recording.
    replayVideo.hidden = false;
    replayVideo.srcObject = stream;
    replayVideo.muted = true;
    replayVideo.controls = false;
    await replayVideo.play().catch(() => {});
    const mimeType = pickReplayMimeType();
    replayRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    replayRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) replayChunks.push(event.data);
    };
    replayRecorder.onstop = async () => {
      const clipBlob = new Blob(replayChunks, { type: replayRecorder.mimeType || "video/webm" });
      replayChunks = [];
      stopReplayStream();
      replayVideo.srcObject = null;
      if (clipBlob.size <= 0) {
        setReplayStatus("Clip vuoto, riprova.");
        return;
      }
      const createdAt = Date.now();
      try {
        await saveReplayClipToDb(arenaId, clipBlob, createdAt);
        showReplayClip(clipBlob, createdAt);
        setReplayStatus("Clip salvato. Rivedi subito il replay.");
      } catch (error) {
        setReplayStatus("Errore nel salvataggio del clip.");
      }
    };
    replayRecorder.start();
    markMomentBtn.disabled = false;
    startReplayBtn.disabled = true;
    deleteClipBtn.disabled = true;
    setReplayStatus("Camera attiva. Premi “Segna momento” per salvare il clip.");
  } catch (error) {
    setReplayStatus("Accesso videocamera negato o non disponibile.");
  }
}

function markReplayMoment() {
  if (!replayRecorder || replayRecorder.state !== "recording") return;
  markMomentBtn.disabled = true;
  startReplayBtn.disabled = false;
  setReplayStatus("Sto salvando il clip...");
  stopReplayRecording();
}

async function deleteReplayClip() {
  if (!replayEnabled() || !arenaId) return;
  try {
    await deleteReplayClipFromDb(arenaId);
  } catch (error) {
    // ignore
  }
  resetReplayPreview();
  deleteClipBtn.disabled = true;
  setReplayStatus("Clip eliminato.");
}

async function initReplay() {
  if (!replayEnabled()) return;
  if (!arenaId) {
    startReplayBtn.disabled = true;
    markMomentBtn.disabled = true;
    deleteClipBtn.disabled = true;
    setReplayStatus("Arena non valida.");
    return;
  }
  if (!replaySupported()) {
    startReplayBtn.disabled = true;
    markMomentBtn.disabled = true;
    deleteClipBtn.disabled = true;
    setReplayStatus("Registrazione non supportata su questo browser.");
    return;
  }
  if (!window.isSecureContext) {
    startReplayBtn.disabled = true;
    markMomentBtn.disabled = true;
    deleteClipBtn.disabled = true;
    setReplayStatus("Richiesta HTTPS per usare la videocamera.");
    return;
  }
  try {
    const stored = await loadReplayClipFromDb(arenaId);
    if (stored && stored.blob) {
      showReplayClip(stored.blob, stored.createdAt || Date.now());
      setReplayStatus("Clip pronto.");
    } else {
      setReplayStatus("Pronto.");
    }
  } catch (error) {
    setReplayStatus("Impossibile caricare il replay.");
  }
  startReplayBtn.addEventListener("click", startReplayRecording);
  markMomentBtn.addEventListener("click", markReplayMoment);
  deleteClipBtn.addEventListener("click", deleteReplayClip);
  window.addEventListener("beforeunload", () => {
    stopReplayRecording();
    stopReplayStream();
  });
}

if (coinPageBtn) {
  coinPageBtn.href = tournamentId ? `coin.html?tid=${tournamentId}&id=${arenaId}` : "coin.html";
}

initReplay();
