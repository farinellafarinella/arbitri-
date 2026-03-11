const arenaNameInput = document.getElementById("arenaName");
const addArenaBtn = document.getElementById("addArenaBtn");
const arenaSelect = document.getElementById("arenaSelect");
const refereeSelect = document.getElementById("refereeSelect");
const tournamentRefereeSelect = document.getElementById("tournamentRefereeSelect");
const addTournamentRefereeBtn = document.getElementById("addTournamentRefereeBtn");
const tournamentRefereeList = document.getElementById("tournamentRefereeList");
const tournamentRefereeMessage = document.getElementById("tournamentRefereeMessage");
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
const ratingsLink = document.getElementById("ratingsLink");

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
  if (ratingsLink) {
    ratingsLink.href = tournamentId ? `ratings.html?tid=${tournamentId}` : "ratings.html";
  }
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
  const registry = state.refereesRegistry || [];
  const tournamentRefs = Array.isArray(tournament.refereeIds) ? tournament.refereeIds : [];
  const tournamentRefEntries = tournamentRefs
    .map((id) => registry.find((ref) => ref.id === id))
    .filter(Boolean);
  if (tournamentRefEntries.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Nessun arbitro nel torneo";
    refereeSelect.appendChild(option);
  } else {
    tournamentRefEntries.forEach((ref) => {
      const levelInfo = getRefereeLevelInfo(ref.exp || 0);
      const option = document.createElement("option");
      option.value = ref.name;
      option.textContent = `${ref.name} (Lv ${levelInfo.level})`;
      refereeSelect.appendChild(option);
    });
  }

  arenaList.innerHTML = "";
  tournament.arenas.forEach((arena) => {
    const expiredActions = arena.status === "expired"
      ? `<button class="restart-btn" data-id="${arena.id}">Riavvia chiamata</button>
         <button class="cancel-btn danger-btn" data-id="${arena.id}">Annulla match</button>`
      : "";
    const clearMatchAction = arena.match || arena.status !== "free"
      ? `<button class="clear-match-btn danger-btn" data-id="${arena.id}">Svuota match</button>`
      : "";
    const row = document.createElement("div");
    row.className = "arena-row";
    row.innerHTML = `
      <div class="light ${arena.status}" aria-hidden="true"></div>
      <div>
        <strong>${arena.name}</strong>
        <div class="muted">Arbitro: <span class="referee-name">${arena.refereeName || "—"}</span></div>
        <div class="muted">Vincitore: <span class="winner-name">${arena.winnerCandidate || "—"}</span></div>
        <div class="muted">Match: ${arena.match ? `<span class="match-players">${arena.match.p1} vs ${arena.match.p2}</span>` : "—"}</div>
      </div>
      <div class="badge ${arena.status}">${statusLabel(arena.status)}</div>
      <button class="call-btn" data-id="${arena.id}" ${arena.status === "free" && arena.match ? "" : "disabled"}>Chiama arena</button>
      <button class="confirm-btn" data-id="${arena.id}" ${arena.winnerCandidate ? "" : "disabled"}>Segna vincitore</button>
      <a class="arena-link" href="arena.html?tid=${tournament.id}&id=${arena.id}" target="_blank" rel="noopener">Apri pagina</a>
      ${expiredActions}
      ${clearMatchAction}
    `;
    arenaList.appendChild(row);
  });

  renderTournamentReferees();
  renderPlayers();
}

function renderTournamentReferees() {
  if (!tournamentRefereeSelect || !tournamentRefereeList) return;
  tournamentRefereeSelect.innerHTML = "";
  tournamentRefereeList.innerHTML = "";
  tournamentRefereeMessage.textContent = "";
  const registry = state.refereesRegistry || [];
  if (registry.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Albo vuoto";
    tournamentRefereeSelect.appendChild(option);
  } else {
    registry.forEach((ref) => {
      const levelInfo = getRefereeLevelInfo(ref.exp || 0);
      const option = document.createElement("option");
      option.value = ref.id;
      option.textContent = `${ref.name} (Lv ${levelInfo.level})`;
      tournamentRefereeSelect.appendChild(option);
    });
  }

  const ids = Array.isArray(tournament.refereeIds) ? tournament.refereeIds : [];
  if (ids.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Nessun arbitro associato al torneo.";
    tournamentRefereeList.appendChild(empty);
    return;
  }
  ids.forEach((id) => {
    const ref = registry.find((r) => r.id === id);
    if (!ref) return;
    const levelInfo = getRefereeLevelInfo(ref.exp || 0);
    const progressTotal = Math.max(1, levelInfo.progressMax - levelInfo.progressMin);
    const progressValue = Math.min(progressTotal, Math.max(0, (ref.exp || 0) - levelInfo.progressMin));
    const progressPercent = Math.round((progressValue / progressTotal) * 100);
    const expToNextText = levelInfo.nextLevel
      ? `EXP mancanti al prossimo livello: ${levelInfo.expToNext}`
      : "Livello massimo raggiunto";
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <strong>${ref.name}</strong>
      <div class="muted">Livello: Lv. ${levelInfo.level} - ${levelInfo.title}</div>
      <div class="muted">EXP: ${ref.exp || 0}</div>
      <div class="muted">${expToNextText}</div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${progressTotal}" aria-valuenow="${progressValue}">
        <div class="progress-bar" style="width:${progressPercent}%"></div>
      </div>
      <div class="row" style="margin-top:8px;">
        <button class="danger-btn remove-ref-btn" data-id="${ref.id}">Rimuovi</button>
      </div>
    `;
    tournamentRefereeList.appendChild(row);
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

if (addTournamentRefereeBtn) {
  addTournamentRefereeBtn.addEventListener("click", () => {
    if (!tournament) return;
    const refId = tournamentRefereeSelect.value;
    if (!refId) return;
    if (!Array.isArray(tournament.refereeIds)) tournament.refereeIds = [];
    if (tournament.refereeIds.includes(refId)) {
      tournamentRefereeMessage.textContent = "Arbitro già associato al torneo.";
      tournamentRefereeMessage.classList.add("error");
      return;
    }
    tournamentRefereeMessage.textContent = "";
    tournamentRefereeMessage.classList.remove("error");
    tournament.refereeIds.push(refId);
    saveState(state);
    render();
  });
}

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
  if (!(target instanceof HTMLElement)) return;
  if (target.classList.contains("call-btn")) {
    const arenaId = target.dataset.id;
    if (!tournament) return;
    const arena = tournament.arenas.find((a) => a.id === arenaId);
    if (!arena || arena.status !== "free" || !arena.match) return;
    arena.status = "called";
    arena.calledAt = Date.now();
    saveState(state);
    render();
    return;
  }
  if (target.classList.contains("restart-btn")) {
    const arenaId = target.dataset.id;
    if (!tournament) return;
    const arena = tournament.arenas.find((a) => a.id === arenaId);
    if (!arena || arena.status !== "expired") return;
    arena.status = "called";
    arena.calledAt = Date.now();
    saveState(state);
    render();
    return;
  }
  if (target.classList.contains("cancel-btn")) {
    const arenaId = target.dataset.id;
    if (!tournament) return;
    const arena = tournament.arenas.find((a) => a.id === arenaId);
    if (!arena || arena.status !== "expired") return;
    arena.status = "free";
    arena.calledAt = null;
    arena.match = null;
    arena.selectedWinner = "";
    arena.winnerCandidate = "";
    saveState(state);
    render();
    return;
  }
  if (target.classList.contains("clear-match-btn")) {
    const arenaId = target.dataset.id;
    if (!tournament) return;
    const arena = tournament.arenas.find((a) => a.id === arenaId);
    if (!arena) return;
    arena.status = "free";
    arena.calledAt = null;
    arena.match = null;
    arena.selectedWinner = "";
    arena.winnerCandidate = "";
    saveState(state);
    render();
    return;
  }
  if (!target.classList.contains("confirm-btn")) return;
  const arenaId = target.dataset.id;
  if (!tournament) return;
  const arena = tournament.arenas.find((a) => a.id === arenaId);
  if (!arena || !arena.winnerCandidate) return;
  const refereeName = arena.refereeName;
  arena.winnerCandidate = "";
  arena.status = "free";
  arena.calledAt = null;
  arena.match = null;
  arena.selectedWinner = "";
  if (refereeName && state.refereesRegistry) {
    const ref = state.refereesRegistry.find((r) => r.name === refereeName);
    if (ref) {
      ref.matchesArbitrated = (ref.matchesArbitrated || 0) + 1;
      ref.exp = (ref.exp || 0) + 1;
      const levelInfo = getRefereeLevelInfo(ref.exp);
      ref.level = levelInfo.level;
      if (!Array.isArray(ref.tournamentsArbitrated)) {
        ref.tournamentsArbitrated = [];
      }
      if (!ref.tournamentsArbitrated.includes(tournament.id)) {
        ref.tournamentsArbitrated.push(tournament.id);
      }
    }
  }
  saveState(state);
  render();
});

if (tournamentRefereeList) {
  tournamentRefereeList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("remove-ref-btn")) return;
    if (!tournament) return;
    const refId = target.dataset.id;
    if (!refId) return;
    tournament.refereeIds = (tournament.refereeIds || []).filter((id) => id !== refId);
    saveState(state);
    render();
  });
}

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
  if (status === "expired") return "Scaduta";
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
