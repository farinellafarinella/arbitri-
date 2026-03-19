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

function challongeParticipantNameMap() {
  const map = new Map();
  if (!tournament) return map;
  const mergedParticipants = [
    ...(Array.isArray(tournament.challongeParticipants) ? tournament.challongeParticipants : []),
    ...(Array.isArray(tournament.challongePlayerMap) ? tournament.challongePlayerMap : [])
  ];
  mergedParticipants.forEach((participant) => {
    const id = String(participant && participant.id || "").trim();
    const name = String(participant && participant.name || "").trim();
    if (!id || !name) return;
    map.set(id, name);
  });
  return map;
}

function currentWinnerOptions() {
  const match = currentArena && currentArena.match;
  if (!match) return [];
  const matchNames = resolvedCurrentMatchNames();
  return [
    {
      id: String(match.challongePlayer1Id || "").trim(),
      name: matchNames.player1Name
    },
    {
      id: String(match.challongePlayer2Id || "").trim(),
      name: matchNames.player2Name
    }
  ].filter((entry) => entry.name);
}

function resolvedCurrentMatchNames() {
  const match = currentArena && currentArena.match;
  if (!match) return { player1Name: "", player2Name: "" };
  const participantMap = challongeParticipantNameMap();
  const player1Id = String(match.challongePlayer1Id || "").trim();
  const player2Id = String(match.challongePlayer2Id || "").trim();
  return {
    player1Name: participantMap.get(player1Id) || String(match.p1 || "").trim(),
    player2Name: participantMap.get(player2Id) || String(match.p2 || "").trim()
  };
}

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
  const matchNames = resolvedCurrentMatchNames();
  const hasMatch = Boolean(matchNames.player1Name && matchNames.player2Name);
  startMatchBtn.disabled = !enabled || !canStart || !hasMatch;
  confirmWinnerBtn.disabled = !enabled || currentArena.status !== "occupied" || !hasMatch || !(currentArena.selectedWinnerId || currentArena.selectedWinner);
  renderWinnerOptions();
  matchDisplay.textContent = hasMatch ? `${matchNames.player1Name} vs ${matchNames.player2Name}` : "—";
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
  const winnerId = String(currentArena.selectedWinnerId || "").trim();
  if (!winner && !winnerId) return;
  currentArena.winnerCandidate = winner;
  currentArena.winnerCandidateId = winnerId;
  currentArena.status = "standby";
  currentArena.selectedWinner = "";
  currentArena.selectedWinnerId = "";
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
  const options = currentWinnerOptions();
  options.forEach((option) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isActive = option.id
      ? currentArena.selectedWinnerId === option.id
      : currentArena.selectedWinner === option.name;
    btn.className = `winner-btn ${isActive ? "active" : ""}`;
    btn.textContent = option.name;
    btn.addEventListener("click", () => {
      currentArena.selectedWinner = option.name;
      currentArena.selectedWinnerId = option.id || "";
      updateArenaUI();
    });
    winnerOptions.appendChild(btn);
  });
}

if (coinPageBtn) {
  coinPageBtn.href = tournamentId ? `coin.html?tid=${tournamentId}&id=${arenaId}` : "coin.html";
}
