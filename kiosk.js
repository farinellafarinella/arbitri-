const kioskTitle = document.getElementById("kioskTitle");
const kioskGrid = document.getElementById("kioskGrid");
const kioskBanner = document.getElementById("kioskBanner");

const params = new URLSearchParams(window.location.search);
const tournamentId = params.get("tid");

let state = loadState();
let tournament = findTournament(state, tournamentId);
let previousArenas = new Map();
let bannerTimer = null;

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

function resolveArenaMatchNames(arena) {
  const match = arena && arena.match;
  if (!match) return { player1Name: "", player2Name: "" };
  const participantMap = challongeParticipantNameMap();
  const player1Id = String(match.challongePlayer1Id || "").trim();
  const player2Id = String(match.challongePlayer2Id || "").trim();
  return {
    player1Name: participantMap.get(player1Id) || String(match.p1 || "").trim(),
    player2Name: participantMap.get(player2Id) || String(match.p2 || "").trim()
  };
}

function resolveArenaWinnerName(arena) {
  const participantMap = challongeParticipantNameMap();
  const winnerId = String(arena && (arena.winnerCandidateId || arena.lastWinnerId) || "").trim();
  const fallbackName = String(arena && (arena.winnerCandidate || arena.lastWinner) || "").trim();
  if (!winnerId) return fallbackName;
  return participantMap.get(winnerId) || fallbackName || `Partecipante ${winnerId}`;
}

function render() {
  if (!tournament) {
    kioskTitle.textContent = "Torneo non trovato";
    kioskGrid.innerHTML = "";
    return;
  }

  kioskTitle.textContent = `Stato Arene - ${tournament.name}`;
  kioskGrid.innerHTML = "";

  tournament.arenas.forEach((arena) => {
    const matchNames = resolveArenaMatchNames(arena);
    const prev = previousArenas.get(arena.id);
    if (prev) {
      if (prev.status !== "called" && arena.status === "called") {
        showBanner(
          `Arena chiamata: ${arena.name}`,
          arena.match ? `${matchNames.player1Name} vs ${matchNames.player2Name}` : "Match non disponibile"
        );
      }
      if (prev.refereeName && arena.refereeName && prev.refereeName !== arena.refereeName) {
        showBanner(
          `Cambio arbitro in corso - ${arena.name}`,
          `${prev.refereeName} → ${arena.refereeName}`
        );
      }
    }
    const card = document.createElement("div");
    card.className = `kiosk-card ${arena.status}`;
    const matchHtml = arena.match
      ? `
        <div class="kiosk-match">
          <div class="kiosk-player">${matchNames.player1Name}</div>
          <div class="kiosk-player">${matchNames.player2Name}</div>
        </div>
      `
      : `<div class="muted">Match: —</div>`;
    const timerClass = shouldFlash(arena.calledAt) ? "kiosk-timer flash" : "kiosk-timer";
    const timerHtml = arena.status === "called" && arena.calledAt
      ? `<div class="${timerClass}">${formatCountdown(arena.calledAt)}</div>`
      : "";
    const winnerName = resolveArenaWinnerName(arena);

    card.innerHTML = `
      <div class="kiosk-header">
        <div class="light ${arena.status}"></div>
        <div class="kiosk-name">${arena.name}</div>
        <div class="badge ${arena.status}">${statusLabel(arena.status)}</div>
      </div>
      <div class="kiosk-body">
        <div>Arbitro: <span class="referee-name">${arena.refereeName || "—"}</span></div>
        ${matchHtml}
        ${timerHtml}
        <div>Sorteggio: <span class="winner-name">${arena.coinTossResult || "—"}</span></div>
        <div>Vincitore: <span class="winner-name">${winnerName || "—"}</span></div>
      </div>
    `;
    kioskGrid.appendChild(card);
    previousArenas.set(arena.id, { status: arena.status, refereeName: arena.refereeName });
  });
}

function statusLabel(status) {
  if (status === "called") return "Chiamata";
  if (status === "occupied") return "Occupata";
  if (status === "standby") return "In attesa";
  if (status === "expired") return "Scaduta";
  return "Libera";
}

function showBanner(title, subtitle) {
  if (!kioskBanner) return;
  kioskBanner.innerHTML = `
    <div class="kiosk-banner-title">${title}</div>
    <div class="kiosk-banner-sub">${subtitle || ""}</div>
  `;
  kioskBanner.classList.remove("hidden");
  kioskBanner.classList.add("show");
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    kioskBanner.classList.remove("show");
    kioskBanner.classList.add("hidden");
  }, 8000);
}

function formatCountdown(calledAt) {
  const remaining = calledAt + callWindowMs() - Date.now();
  const ms = Math.max(0, remaining);
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `Tempo: ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function shouldFlash(calledAt) {
  const remaining = calledAt + callWindowMs() - Date.now();
  return remaining > 0 && remaining <= 30000;
}

subscribeState((newState) => {
  state = newState;
  tournament = findTournament(state, tournamentId);
  render();
});

render();

setInterval(() => {
  if (!tournament) return;
  render();
}, 1000);
