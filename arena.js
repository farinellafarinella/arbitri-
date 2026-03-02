const arenaTitle = document.getElementById("arenaTitle");
const arenaStatus = document.getElementById("arenaStatus");
const assignedReferee = document.getElementById("assignedReferee");
const startMatchBtn = document.getElementById("startMatchBtn");
const winnerInput = document.getElementById("winnerInput");
const setWinnerBtn = document.getElementById("setWinnerBtn");
const countdownEl = document.getElementById("countdown");

const params = new URLSearchParams(window.location.search);
const arenaId = params.get("id");
const tournamentId = params.get("tid");
let state = loadState();
let currentArena = null;
let tournament = null;

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
  assignedReferee.textContent = currentArena.refereeName || "Nessun arbitro assegnato";
  const enabled = Boolean(currentArena.refereeName);
  const canStart = currentArena.status === "called" && timeLeftMs() > 0;
  startMatchBtn.disabled = !enabled || !canStart;
  setWinnerBtn.disabled = !enabled || currentArena.status !== "occupied";
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

setWinnerBtn.addEventListener("click", () => {
  if (!currentArena) return;
  if (!currentArena.refereeName) return;
  if (currentArena.status !== "occupied") return;
  const winner = winnerInput.value.trim();
  if (!winner) return;
  currentArena.winnerCandidate = winner;
  saveArena();
  winnerInput.value = "";
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
  setWinnerBtn.disabled = true;
} else {
  loadArena();
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
    countdownEl.textContent = "—";
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
  return "Libera";
}
