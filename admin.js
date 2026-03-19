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
const challongeUrlInput = document.getElementById("challongeUrlInput");
const saveChallongeUrlBtn = document.getElementById("saveChallongeUrlBtn");
const syncChallongeBtn = document.getElementById("syncChallongeBtn");
const loadNextChallongeMatchBtn = document.getElementById("loadNextChallongeMatchBtn");
const challongeStatus = document.getElementById("challongeStatus");
const challongeMatchList = document.getElementById("challongeMatchList");
const playersFile = document.getElementById("playersFile");
const importPlayersBtn = document.getElementById("importPlayersBtn");
const clearPlayersBtn = document.getElementById("clearPlayersBtn");
const playersCount = document.getElementById("playersCount");
const playersListView = document.getElementById("playersListView");
const playersList = document.getElementById("playersList");
const connectionStatus = document.getElementById("connectionStatus");

let state = loadState();
const params = new URLSearchParams(window.location.search);
const tournamentId = params.get("id");
let tournament = findTournament(state, tournamentId);
let currentUser = null;
let challongeAutoSyncKey = "";

function notifyEndpoint() {
  return String(window.NOTIFY_ENDPOINT || "/notify");
}

function challongeApiBase() {
  return new URL(notifyEndpoint(), window.location.href).origin;
}

function challongeTournamentEndpoint() {
  return `${challongeApiBase()}/challonge/tournament`;
}

function challongeReportEndpoint(matchId) {
  return `${challongeApiBase()}/challonge/matches/${encodeURIComponent(matchId)}/report`;
}

function challongeStateLabel(state) {
  const value = String(state || "").trim().toLowerCase();
  if (value === "underway") return "in corso";
  if (value === "pending") return "in attesa";
  if (value === "complete") return "completato";
  if (value === "checking_in") return "check-in aperto";
  if (value === "checked_in") return "check-in chiuso";
  return value || "sconosciuto";
}

function setChallongeStatus(text, isError = false) {
  if (!challongeStatus) return;
  challongeStatus.textContent = text;
  challongeStatus.classList.toggle("error", isError);
}

function getRegisteredPushSubscriptions(referee) {
  if (!referee) return [];
  return Array.isArray(referee.webPushSubscriptions) ? referee.webPushSubscriptions.filter(Boolean) : [];
}

function removeInvalidPushSubscriptions(refereeId, invalidEndpoints) {
  if (!refereeId || !Array.isArray(invalidEndpoints) || invalidEndpoints.length === 0) return;
  const latestState = loadState();
  const ref = (latestState.refereesRegistry || []).find((item) => item.id === refereeId);
  if (!ref) return;
  ref.webPushSubscriptions = getRegisteredPushSubscriptions(ref)
    .filter((subscription) => !invalidEndpoints.includes(subscription.endpoint));
  saveState(latestState);
  state = latestState;
}

async function notifyArenaCall(arena) {
  const ref = (state.refereesRegistry || []).find((item) => item.id === arena.refereeId);
  const subscriptions = getRegisteredPushSubscriptions(ref);
  if (!ref || subscriptions.length === 0) return;
  const url = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, "/")}arena.html?tid=${tournament.id}&id=${arena.id}`;
  try {
    const response = await fetch(notifyEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriptions,
        title: `Arena chiamata: ${arena.name}`,
        body: arena.match ? `${arena.match.p1} vs ${arena.match.p2}` : "Apri l'arena assegnata",
        data: { url }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      const errorText = payload.error || `Invio notifica fallito (${response.status})`;
      if (matchMessage) {
        matchMessage.textContent = errorText;
        matchMessage.classList.add("error");
      }
      console.error("Push notify error:", payload);
      return;
    }
    removeInvalidPushSubscriptions(ref.id, payload.invalidSubscriptions || []);
  } catch (error) {
    if (matchMessage) {
      matchMessage.textContent = "Errore di rete durante l'invio della notifica.";
      matchMessage.classList.add("error");
    }
    console.error("Push notify network error:", error);
  }
}

function assignedChallongeMatchIds() {
  const ids = new Set();
  (tournament && tournament.arenas || []).forEach((arena) => {
    const match = arena && arena.match;
    if (match && match.source === "challonge" && match.challongeMatchId) {
      ids.add(String(match.challongeMatchId));
    }
  });
  return ids;
}

function availableChallongeMatches() {
  if (!tournament) return [];
  const assigned = assignedChallongeMatchIds();
  return (Array.isArray(tournament.challongeOpenMatches) ? tournament.challongeOpenMatches : [])
    .filter((match) => !assigned.has(String(match.id)));
}

function syncTournamentPlayers(nextPlayers) {
  if (!tournament) return;
  const uniquePlayers = [];
  nextPlayers.forEach((name) => {
    const value = String(name || "").trim();
    if (value && !uniquePlayers.includes(value)) uniquePlayers.push(value);
  });
  tournament.players = uniquePlayers;
}

function renderChallongeMatches() {
  if (!challongeMatchList) return;
  challongeMatchList.innerHTML = "";
  if (!tournament || !tournament.challongeUrl) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Salva il link Challonge del torneo per abilitare l'importazione.";
    challongeMatchList.appendChild(empty);
    return;
  }
  const matches = availableChallongeMatches();
  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = tournament.challongeSyncedAt
      ? "Nessun match aperto disponibile da Challonge."
      : "Sincronizza Challonge per vedere i match aperti.";
    challongeMatchList.appendChild(empty);
    return;
  }
  matches.forEach((match) => {
    const row = document.createElement("div");
    row.className = "list-row";
    const label = match.identifier ? `Match ${match.identifier}` : `Match ${match.id}`;
    row.innerHTML = `
      <strong>${match.player1Name} vs ${match.player2Name}</strong>
      <div class="muted">${label} · Round ${match.round}</div>
      <div class="row" style="margin-top:8px;">
        <button class="load-challonge-match-btn" data-id="${match.id}" type="button">Carica su arena selezionata</button>
      </div>
    `;
    challongeMatchList.appendChild(row);
  });
}

function saveChallongeUrl() {
  if (!tournament || !challongeUrlInput) return;
  const nextUrl = String(challongeUrlInput.value || "").trim();
  const currentUrl = String(tournament.challongeUrl || "").trim();
  if (nextUrl === currentUrl) {
    setChallongeStatus(nextUrl ? "Link Challonge già salvato." : "Link Challonge rimosso.");
    return;
  }
  tournament.challongeUrl = nextUrl;
  tournament.challongeState = "";
  tournament.challongeSyncedAt = 0;
  tournament.challongeOpenMatches = [];
  challongeAutoSyncKey = "";
  saveState(state);
  render();
  setChallongeStatus(nextUrl ? "Link Challonge salvato." : "Link Challonge rimosso.");
}

async function syncChallongeTournament(options = {}) {
  if (!tournament || !tournament.challongeUrl) {
    setChallongeStatus("Manca il link Challonge su questo torneo.", true);
    return false;
  }
  try {
    if (!options.silent) {
      setChallongeStatus("Sincronizzazione Challonge in corso...");
    }
    const url = new URL(challongeTournamentEndpoint());
    url.searchParams.set("url", tournament.challongeUrl);
    const response = await fetch(url.toString());
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setChallongeStatus(payload.error || `Sync Challonge fallita (${response.status})`, true);
      return false;
    }
    syncTournamentPlayers((payload.participants || []).map((participant) => participant.name));
    tournament.challongeState = payload.state || "";
    tournament.challongeSyncedAt = Date.now();
    tournament.challongeOpenMatches = Array.isArray(payload.openMatches) ? payload.openMatches : [];
    saveState(state);
    render();
    if (!options.silent) {
      const challongeName = String(payload.name || tournament.name || "senza nome").trim();
      const challongeState = challongeStateLabel(payload.state);
      const challongeRef = String(payload.tournamentRef || "").trim();
      const refText = challongeRef ? ` Ref: ${challongeRef}.` : "";
      setChallongeStatus(`Challonge sincronizzato: ${tournament.challongeOpenMatches.length} match aperti. Torneo: ${challongeName}. Stato: ${challongeState}.${refText}`);
    }
    return true;
  } catch (error) {
    console.error("Challonge sync error:", error);
    setChallongeStatus("Errore di rete durante la sincronizzazione Challonge.", true);
    return false;
  }
}

function loadChallongeMatchIntoArena(matchId = "") {
  if (!tournament) return;
  const arenaId = matchArenaSelect && matchArenaSelect.value;
  if (!arenaId) {
    setChallongeStatus("Seleziona prima un'arena.", true);
    return;
  }
  const arena = tournament.arenas.find((item) => item.id === arenaId);
  if (!arena) {
    setChallongeStatus("Arena non trovata.", true);
    return;
  }
  if (arena.status !== "free" || arena.match) {
    setChallongeStatus(`${arena.name} ha già un match assegnato.`, true);
    return;
  }
  const matches = availableChallongeMatches();
  const selectedMatch = matchId
    ? matches.find((match) => String(match.id) === String(matchId))
    : matches[0];
  if (!selectedMatch) {
    setChallongeStatus("Nessun match Challonge disponibile da caricare.", true);
    return;
  }
  arena.match = {
    p1: selectedMatch.player1Name,
    p2: selectedMatch.player2Name,
    source: "challonge",
    challongeMatchId: String(selectedMatch.id),
    challongePlayer1Id: String(selectedMatch.player1Id),
    challongePlayer2Id: String(selectedMatch.player2Id),
    challongeIdentifier: selectedMatch.identifier || "",
    challongeRound: selectedMatch.round || 0
  };
  arena.selectedWinner = "";
  arena.winnerCandidate = "";
  arena.coinTossResult = "";
  saveState(state);
  render();
  setChallongeStatus(`Match caricato su ${arena.name}: ${selectedMatch.player1Name} vs ${selectedMatch.player2Name}.`);
}

async function reportChallongeResult(matchData, winnerName) {
  if (!tournament || !tournament.challongeUrl) {
    throw new Error("Manca il link Challonge del torneo.");
  }
  const winnerParticipantId = winnerName === matchData.p1
    ? matchData.challongePlayer1Id
    : matchData.challongePlayer2Id;
  if (!winnerParticipantId) {
    throw new Error("Impossibile determinare il vincitore Challonge.");
  }
  const scoresCsv = winnerName === matchData.p1 ? "1-0" : "0-1";
  const response = await fetch(challongeReportEndpoint(matchData.challongeMatchId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tournamentUrl: tournament.challongeUrl,
      winnerParticipantId,
      scoresCsv
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Report Challonge fallito (${response.status})`);
  }
}

function isChallongeReadOnlyError(error) {
  const message = String(error && error.message ? error.message : error || "").toLowerCase();
  return message.includes("only have read access") || message.includes("read access");
}

function maybeAutoSyncChallonge() {
  if (!tournament || !tournament.challongeUrl) return;
  const nextKey = `${tournament.id}:${tournament.challongeUrl}`;
  if (challongeAutoSyncKey === nextKey) return;
  challongeAutoSyncKey = nextKey;
  if (tournament.challongeSyncedAt) return;
  window.setTimeout(() => {
    syncChallongeTournament({ silent: false });
  }, 0);
}

function render() {
  if (!tournament) {
    tournamentTitle.textContent = "Torneo non trovato";
    arenaList.innerHTML = "";
    return;
  }

  tournamentTitle.textContent = tournament.name;
  arenaSelect.innerHTML = "";
  matchArenaSelect.innerHTML = "";
  if (challongeUrlInput) {
    challongeUrlInput.value = tournament.challongeUrl || "";
  }

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
  const registry = (state.refereesRegistry || []).filter((ref) => ref.authUid);
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
      option.value = ref.id;
      option.textContent = `${ref.name} (Lv ${levelInfo.level})`;
      refereeSelect.appendChild(option);
    });
  }

  arenaList.innerHTML = "";
  tournament.arenas.forEach((arena) => {
    const canConfirmWinner = Boolean(arena.winnerCandidate) || (arena.status === "standby" && arena.match && arena.match.p1 && arena.match.p2);
    const expiredActions = arena.status === "expired"
      ? `<button class="restart-btn" data-id="${arena.id}">Riavvia chiamata</button>
         <button class="cancel-btn danger-btn" data-id="${arena.id}">Annulla match</button>`
      : "";
    const clearRefAction = arena.refereeId || arena.refereeName
      ? `<button class="remove-arena-ref-btn danger-btn" data-id="${arena.id}">Togli arbitro</button>`
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
        <div class="muted">Sorteggio: <span class="winner-name">${arena.coinTossResult || "—"}</span></div>
        <div class="muted">Vincitore: <span class="winner-name">${arena.winnerCandidate || (arena.status === "standby" ? "Da confermare" : "—")}</span></div>
        <div class="muted">Match: ${arena.match ? `<span class="match-players">${arena.match.p1} vs ${arena.match.p2}</span>` : "—"}</div>
      </div>
      <div class="badge ${arena.status}">${statusLabel(arena.status)}</div>
      <button class="call-btn" data-id="${arena.id}" ${arena.status === "free" && arena.match ? "" : "disabled"}>Chiama arena</button>
      <button class="confirm-btn" data-id="${arena.id}" ${canConfirmWinner ? "" : "disabled"}>Segna vincitore</button>
      <a class="arena-link" href="arena.html?tid=${tournament.id}&id=${arena.id}" target="_blank" rel="noopener">Apri pagina</a>
      ${clearRefAction}
      ${expiredActions}
      ${clearMatchAction}
    `;
    arenaList.appendChild(row);
  });

  renderTournamentReferees();
  renderPlayers();
  renderChallongeMatches();
  if (challongeStatus && (!challongeStatus.textContent || challongeStatus.textContent === "Nessuna sincronizzazione eseguita.")) {
    if (!tournament.challongeUrl) {
      setChallongeStatus("Nessun link Challonge collegato.");
    } else if (tournament.challongeSyncedAt) {
      const openCount = Array.isArray(tournament.challongeOpenMatches) ? tournament.challongeOpenMatches.length : 0;
      setChallongeStatus(`Ultima sync Challonge: ${openCount} match aperti.`);
    } else {
      setChallongeStatus("Link Challonge salvato. Sincronizza per importare il torneo.");
    }
  }
  maybeAutoSyncChallonge();
}

function renderTournamentReferees() {
  if (!tournamentRefereeSelect || !tournamentRefereeList) return;
  tournamentRefereeSelect.innerHTML = "";
  tournamentRefereeList.innerHTML = "";
  tournamentRefereeMessage.textContent = "";
  const registry = (state.refereesRegistry || []).filter((ref) => ref.authUid);
  if (registry.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Nessun arbitro registrato via login";
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
      <div class="muted">Account: ${ref.authUid ? "collegato" : "non collegato"}</div>
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
  const refereeId = refereeSelect.value;
  if (!arenaId || !refereeId || !tournament) return;
  const arena = tournament.arenas.find((a) => a.id === arenaId);
  const ref = (state.refereesRegistry || []).find((item) => item.id === refereeId);
  if (!ref || !arena) return;
  arena.refereeId = ref.id;
  arena.refereeName = ref.name;
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
  arena.match = { p1, p2, source: "manual" };
  arena.selectedWinner = "";
  arena.winnerCandidate = "";
  arena.coinTossResult = "";
  saveState(state);
  render();
  player1Input.value = "";
  player2Input.value = "";
});

if (saveChallongeUrlBtn) {
  saveChallongeUrlBtn.addEventListener("click", saveChallongeUrl);
}

if (challongeUrlInput) {
  challongeUrlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveChallongeUrl();
    }
  });
}

if (syncChallongeBtn) {
  syncChallongeBtn.addEventListener("click", () => {
    syncChallongeTournament();
  });
}

if (loadNextChallongeMatchBtn) {
  loadNextChallongeMatchBtn.addEventListener("click", () => {
    loadChallongeMatchIntoArena();
  });
}

if (challongeMatchList) {
  challongeMatchList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("load-challonge-match-btn")) return;
    const matchId = target.dataset.id;
    if (!matchId) return;
    loadChallongeMatchIntoArena(matchId);
  });
}

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

arenaList.addEventListener("click", async (event) => {
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
    notifyArenaCall(arena);
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
    notifyArenaCall(arena);
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
    arena.coinTossResult = "";
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
    arena.coinTossResult = "";
    saveState(state);
    render();
    return;
  }
  if (target.classList.contains("remove-arena-ref-btn")) {
    const arenaId = target.dataset.id;
    if (!tournament) return;
    const arena = tournament.arenas.find((a) => a.id === arenaId);
    if (!arena) return;
    arena.refereeId = "";
    arena.refereeName = "";
    saveState(state);
    render();
    return;
  }
  if (!target.classList.contains("confirm-btn")) return;
  const arenaId = target.dataset.id;
  if (!tournament) return;
  const arena = tournament.arenas.find((a) => a.id === arenaId);
  if (!arena) return;
  const matchData = arena.match;
  const winnerName = resolveArenaWinnerChoice(arena);
  if (!winnerName) return;
  let challongeWriteMode = "";
  if (matchData && matchData.source === "challonge" && matchData.challongeMatchId) {
    try {
      matchMessage.textContent = "Invio risultato a Challonge...";
      matchMessage.classList.remove("error");
      await reportChallongeResult(matchData, winnerName);
      challongeWriteMode = "written";
    } catch (error) {
      if (isChallongeReadOnlyError(error)) {
        challongeWriteMode = "manual";
      } else {
        matchMessage.textContent = error.message || "Errore durante l'invio del risultato a Challonge.";
        matchMessage.classList.add("error");
        return;
      }
    }
  }
  const refereeId = arena.refereeId;
  const refereeName = arena.refereeName;
  arena.lastWinner = winnerName;
  arena.winnerCandidate = "";
  arena.status = "free";
  arena.calledAt = null;
  arena.match = null;
  arena.selectedWinner = "";
  arena.coinTossResult = "";
  if ((refereeId || refereeName) && state.refereesRegistry) {
    const ref = state.refereesRegistry.find((r) => r.id === refereeId) || state.refereesRegistry.find((r) => r.name === refereeName);
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
  if (matchData && matchData.source === "challonge" && matchData.challongeMatchId) {
    if (challongeWriteMode === "written") {
      await syncChallongeTournament({ silent: true });
      setChallongeStatus("Risultato inviato a Challonge e torneo aggiornato.");
    } else if (challongeWriteMode === "manual") {
      matchMessage.textContent = "Torneo Challonge in sola lettura: risultato segnato nell'app.";
      matchMessage.classList.remove("error");
      setChallongeStatus("Risultato segnato nell'app. Aggiorna Challonge manualmente per questo torneo.");
    }
  }
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

requireRole({
  roles: ["admin"],
  message: matchMessage,
  onUser(user) {
    currentUser = user;
    render();
  }
});

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

function resolveArenaWinnerChoice(arena) {
  if (!arena) return "";
  if (arena.winnerCandidate) return arena.winnerCandidate;
  if (!arena.match || !arena.match.p1 || !arena.match.p2) return "";
  const p1 = arena.match.p1;
  const p2 = arena.match.p2;
  const input = window.prompt(`Inserisci 1 per "${p1}" oppure 2 per "${p2}"`, "1");
  const value = String(input || "").trim().toLowerCase();
  if (!value) return "";
  if (value === "1" || value === p1.toLowerCase()) return p1;
  if (value === "2" || value === p2.toLowerCase()) return p2;
  return "";
}
