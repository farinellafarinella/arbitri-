const arenaNameInput = document.getElementById("arenaName");
const addArenaBtn = document.getElementById("addArenaBtn");
const refereeNameInput = document.getElementById("refereeName");
const addRefereeBtn = document.getElementById("addRefereeBtn");
const refereeList = document.getElementById("refereeList");
const refereeMessage = document.getElementById("refereeMessage");
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
const playersFile = document.getElementById("playersFile");
const importPlayersBtn = document.getElementById("importPlayersBtn");
const clearPlayersBtn = document.getElementById("clearPlayersBtn");
const playersCount = document.getElementById("playersCount");
const playersListView = document.getElementById("playersListView");
const playersList = document.getElementById("playersList");

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
    const basePath = window.location.pathname.replace(/\/[^/]*$/, "/");
    const link = `${basePath}referee.html?tid=${tournament.id}&ref=${encodeURIComponent(name)}`;
    row.innerHTML = `
      <strong>${name}</strong>
      <button class="notify-btn" data-link="${link}">Attiva notifiche</button>
    `;
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
      <button class="call-btn" data-id="${arena.id}" ${arena.status === "free" && arena.match ? "" : "disabled"}>Chiama arena</button>
      <button class="confirm-btn" data-id="${arena.id}" ${arena.winnerCandidate ? "" : "disabled"}>Segna vincitore</button>
      <a class="arena-link" href="arena.html?tid=${tournament.id}&id=${arena.id}" target="_blank" rel="noopener">Apri pagina</a>
    `;
    arenaList.appendChild(row);
  });

  renderPlayers();
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

importPlayersBtn.addEventListener("click", () => {
  if (!tournament) return;
  const file = playersFile.files && playersFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    const names = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (!tournament.players) tournament.players = [];
    names.forEach((name) => {
      if (!tournament.players.includes(name)) tournament.players.push(name);
    });
    saveState(state);
    render();
    playersFile.value = "";
  };
  reader.readAsText(file);
});

clearPlayersBtn.addEventListener("click", () => {
  if (!tournament) return;
  const ok = window.confirm("Svuotare la lista giocatori?");
  if (!ok) return;
  tournament.players = [];
  saveState(state);
  render();
});

arenaList.addEventListener("click", (event) => {
  const target = event.target;
  if (target.classList.contains("call-btn")) {
    const arenaId = target.dataset.id;
    if (!tournament) return;
    const arena = tournament.arenas.find((a) => a.id === arenaId);
    if (!arena || arena.status !== "free" || !arena.match) return;
    arena.status = "called";
    arena.calledAt = Date.now();
    saveState(state);
    render();
    if (window.AdminNotify) {
      const token = tournament.refereeTokens ? tournament.refereeTokens[arena.refereeName] : "";
      window.AdminNotify.sendNotification(arena, token, `Sei stato chiamato in ${arena.name}`);
    }
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

refereeList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!target.classList.contains("notify-btn")) return;
  const link = target.dataset.link;
  try {
    await navigator.clipboard.writeText(link);
    refereeMessage.textContent = "Link copiato. Aprilo sul telefono dell'arbitro.";
  } catch {
    refereeMessage.textContent = `Apri questo link sul telefono dell'arbitro: ${link}`;
  }
});

function statusLabel(status) {
  if (status === "called") return "Chiamata";
  if (status === "occupied") return "Occupata";
  if (status === "standby") return "In attesa";
  return "Libera";
}

function renderPlayers() {
  if (!tournament) return;
  const list = tournament.players || [];
  playersCount.textContent = `Totale giocatori: ${list.length}`;
  playersListView.innerHTML = "";
  playersList.innerHTML = "";
  list.forEach((name) => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.textContent = name;
    playersListView.appendChild(row);

    const opt = document.createElement("option");
    opt.value = name;
    playersList.appendChild(opt);
  });
}
