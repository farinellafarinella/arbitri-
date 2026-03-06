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
    card.innerHTML = `
      <div class="kiosk-header">
        <div class="light ${arena.status}"></div>
        <div class="kiosk-name">${arena.name}</div>
        <div class="badge ${arena.status}">${statusLabel(arena.status)}</div>
      </div>
      <div class="kiosk-body">
        <div>Arbitro: <span class="referee-name">${arena.refereeName || "—"}</span></div>
        <div>Match: ${arena.match ? `${arena.match.p1} vs ${arena.match.p2}` : "—"}</div>
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

subscribeState((newState) => {
  state = newState;
  tournament = findTournament(state, tournamentId);
  render();
});

render();
