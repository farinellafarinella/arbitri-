const kioskTitle = document.getElementById("kioskTitle");
const kioskGrid = document.getElementById("kioskGrid");

const params = new URLSearchParams(window.location.search);
const tournamentId = params.get("tid");

let state = loadState();
let tournament = findTournament(state, tournamentId);

function render() {
  if (!tournament) {
    kioskTitle.textContent = "Torneo non trovato";
    kioskGrid.innerHTML = "";
    return;
  }

  kioskTitle.textContent = `Stato Arene - ${tournament.name}`;
  kioskGrid.innerHTML = "";

  tournament.arenas.forEach((arena) => {
    const card = document.createElement("div");
    card.className = `kiosk-card ${arena.status}`;
    const matchHtml = arena.match
      ? `
        <div class="kiosk-match">
          <div class="kiosk-player">${arena.match.p1}</div>
          <div class="kiosk-player">${arena.match.p2}</div>
        </div>
      `
      : `<div class="muted">Match: —</div>`;
    const timerClass = shouldFlash(arena.calledAt) ? "kiosk-timer flash" : "kiosk-timer";
    const timerHtml = arena.status === "called" && arena.calledAt
      ? `<div class="${timerClass}">${formatCountdown(arena.calledAt)}</div>`
      : "";

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
        <div>Vincitore: <span class="winner-name">${arena.winnerCandidate || "—"}</span></div>
      </div>
    `;
    kioskGrid.appendChild(card);
  });
}

function statusLabel(status) {
  if (status === "called") return "Chiamata";
  if (status === "occupied") return "Occupata";
  if (status === "standby") return "In attesa";
  return "Libera";
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
