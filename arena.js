const arenaTitle = document.getElementById("arenaTitle");
const arenaStatus = document.getElementById("arenaStatus");
const arenaBadge = document.getElementById("arenaBadge");
const assignedReferee = document.getElementById("assignedReferee");
const startMatchBtn = document.getElementById("startMatchBtn");
const winnerOptions = document.getElementById("winnerOptions");
const confirmWinnerBtn = document.getElementById("confirmWinnerBtn");
const countdownEl = document.getElementById("countdown");
const matchDisplay = document.getElementById("matchDisplay");
const coinResultDisplay = document.getElementById("coinResultDisplay");
const coinPageBtn = document.getElementById("coinPageBtn");

const params = new URLSearchParams(window.location.search);
const arenaId = params.get("id");
const tournamentId = params.get("tid");
const backToAdmin = document.getElementById("backToAdmin");
let state = loadState();
let currentArena = null;
let tournament = null;
let currentUser = null;
let currentRole = "";

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
  if (coinResultDisplay) {
    coinResultDisplay.textContent = currentArena.coinTossResult || "—";
  }
  updateCountdown();
}

function userCanAccessArena() {
  if (!currentUser || !currentArena) return false;
  if (currentRole === "admin") return true;
  const referee = (state.refereesRegistry || []).find((ref) => ref.authUid === currentUser.uid);
  if (!referee) return false;
  return currentArena.refereeId === referee.id;
}

function loadArena() {
  state = loadState();
  tournament = findTournament(state, tournamentId);
  if (!tournament) {
    currentArena = null;
  } else {
    currentArena = tournament.arenas.find((a) => a.id === arenaId) || null;
  }
  if (currentArena && currentUser && !userCanAccessArena()) {
    window.location.href = currentRole === "admin" ? "index.html" : "referee.html";
    return;
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
  saveArena();
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
    if (currentUser && !userCanAccessArena()) {
      window.location.href = currentRole === "admin" ? "index.html" : "referee.html";
      return;
    }
    updateArenaUI();
  }
});

requireRole({
  roles: ["admin", "referee"],
  message: countdownEl,
  onUser(user, role) {
    currentUser = user;
    currentRole = role;
    if (!arenaId) {
      arenaTitle.textContent = "Arena non trovata";
      startMatchBtn.disabled = true;
      confirmWinnerBtn.disabled = true;
      return;
    }
    loadArena();
  }
});

if (backToAdmin) {
  backToAdmin.href = currentRole === "admin"
    ? (tournamentId ? `tournament.html?id=${tournamentId}` : "index.html")
    : "referee.html";
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

if (coinPageBtn) {
  coinPageBtn.href = tournamentId ? `coin.html?tid=${tournamentId}&id=${arenaId}` : "coin.html";
}
