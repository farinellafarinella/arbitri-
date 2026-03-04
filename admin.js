const arenaNameInput = document.getElementById("arenaName");
const addArenaBtn = document.getElementById("addArenaBtn");
const refereeNameInput = document.getElementById("refereeName");
const addRefereeBtn = document.getElementById("addRefereeBtn");
const refereeList = document.getElementById("refereeList");
const arenaSelect = document.getElementById("arenaSelect");
const refereeSelect = document.getElementById("refereeSelect");
const assignBtn = document.getElementById("assignBtn");
const arenaList = document.getElementById("arenaList");
const tournamentTitle = document.getElementById("tournamentTitle");
const matchArenaSelect = document.getElementById("matchArenaSelect");
const player1Input = document.getElementById("player1Input");
const player2Input = document.getElementById("player2Input");
const setMatchBtn = document.getElementById("setMatchBtn");
const matchMessage = document.getElementById("matchMessage");

let state = loadState();
const params = new URLSearchParams(window.location.search);
const tournamentId = params.get("id");
let tournament = findTournament(state, tournamentId);

function render() {
  if (!tournament) {
    tournamentTitle.textContent = "Torneo non trovato";
    arenaList.innerHTML = "";
    return;
  }

  tournamentTitle.textContent = tournament.name;
  arenaSelect.innerHTML = "";
  matchArenaSelect.innerHTML = "";

  tournament.arenas.forEach((arena) => {
    const option = document.createElement("option");
    option.value = arena.id;
    option.textContent = arena.name;
    arenaSelect.appendChild(option);

    const matchOption = document.createElement("option");
    matchOption.value = arena.id;
    matchOption.textContent = arena.name;
    matchArenaSelect.appendChild(matchOption);
  });

  refereeSelect.innerHTML = "";
  tournament.referees.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    refereeSelect.appendChild(option);
  });

  refereeList.innerHTML = "";
  tournament.referees.forEach((name) => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.textContent = name;
    refereeList.appendChild(row);
  });

  arenaList.innerHTML = "";
  tournament.arenas.forEach((arena) => {
    const row = document.createElement("div");
    row.className = "arena-row";
    row.innerHTML = `
      <div class="light ${arena.status}" aria-hidden="true"></div>
      <div>
        <strong>${arena.name}</strong>
        <div class="muted">Arbitro: <span class="referee-name">${arena.refereeName || "—"}</span></div>
        <div class="muted">Vincitore: <span class="winner-name">${arena.winnerCandidate || "—"}</span></div>
        <div class="muted">Match: ${arena.match ? `${arena.match.p1} vs ${arena.match.p2}` : "—"}</div>
      </div>
      <div class="badge ${arena.status}">${statusLabel(arena.status)}</div>
      <button class="call-btn" data-id="${arena.id}" ${arena.status === "free" ? "" : "disabled"}>Chiama arena</button>
      <button class="confirm-btn" data-id="${arena.id}" ${arena.winnerCandidate ? "" : "disabled"}>Segna vincitore</button>
      <a class="arena-link" href="arena.html?tid=${tournament.id}&id=${arena.id}" target="_blank" rel="noopener">Apri pagina</a>
    `;
    arenaList.appendChild(row);
  });
}

addArenaBtn.addEventListener("click", () => {
  const name = arenaNameInput.value.trim();
  if (!name || !tournament) return;
  tournament.arenas.push(createArena(name));
  saveState(state);
  render();
  arenaNameInput.value = "";
});

addRefereeBtn.addEventListener("click", () => {
  const name = refereeNameInput.value.trim();
  if (!name || !tournament) return;
  if (tournament.referees.includes(name)) return;
  tournament.referees.push(name);
  saveState(state);
  render();
  refereeNameInput.value = "";
});

assignBtn.addEventListener("click", () => {
  const arenaId = arenaSelect.value;
  const refereeName = refereeSelect.value;
  if (!arenaId || !refereeName || !tournament) return;
  const arena = tournament.arenas.find((a) => a.id === arenaId);
  if (!arena) return;
  arena.refereeName = refereeName;
  saveState(state);
  render();
});

setMatchBtn.addEventListener("click", () => {
  const arenaId = matchArenaSelect.value;
  if (!arenaId || !tournament) return;
  const arena = tournament.arenas.find((a) => a.id === arenaId);
  if (!arena) return;
  if (arena.status !== "free" || arena.match) {
    matchMessage.textContent = `${arena.name} ha gia un match assegnato.`;
    matchMessage.classList.add("error");
    return;
  }
  const p1 = player1Input.value.trim();
  const p2 = player2Input.value.trim();
  if (!p1 || !p2) return;
  matchMessage.textContent = "";
  matchMessage.classList.remove("error");
  arena.match = { p1, p2 };
  saveState(state);
  render();
  player1Input.value = "";
  player2Input.value = "";
});

arenaList.addEventListener("click", (event) => {
  const target = event.target;
  if (target.classList.contains("call-btn")) {
    const arenaId = target.dataset.id;
    if (!tournament) return;
    const arena = tournament.arenas.find((a) => a.id === arenaId);
    if (!arena || arena.status !== "free") return;
    arena.status = "called";
    arena.calledAt = Date.now();
    saveState(state);
    render();
    return;
  }
  if (!target.classList.contains("confirm-btn")) return;
  const arenaId = target.dataset.id;
  if (!tournament) return;
  const arena = tournament.arenas.find((a) => a.id === arenaId);
  if (!arena || !arena.winnerCandidate) return;
  arena.winnerCandidate = "";
  arena.status = "free";
  arena.calledAt = null;
  arena.match = null;
  arena.selectedWinner = "";
  saveState(state);
  render();
});

subscribeState((newState) => {
  state = newState;
  tournament = findTournament(state, tournamentId);
  render();
});

render();

if (!isOnlineMode()) {
  setInterval(() => {
    state = loadState();
    tournament = findTournament(state, tournamentId);
    const changed = expireCalls(state);
    if (changed) saveState(state);
    render();
  }, 1000);
}

function statusLabel(status) {
  if (status === "called") return "Chiamata";
  if (status === "occupied") return "Occupata";
  if (status === "standby") return "In attesa";
  return "Libera";
}
