const arenaNameInput = document.getElementById("arenaName");
const addArenaBtn = document.getElementById("addArenaBtn");
const arenaSelect = document.getElementById("arenaSelect");
const refereeSelect = document.getElementById("refereeSelect");
const tournamentRefereeSelect = document.getElementById("tournamentRefereeSelect");
const addTournamentRefereeBtn = document.getElementById("addTournamentRefereeBtn");
const tournamentRefereeList = document.getElementById("tournamentRefereeList");
const tournamentRefereeMessage = document.getElementById("tournamentRefereeMessage");
const toggleRefereePanelBtn = document.getElementById("toggleRefereePanelBtn");
const refereePanelBody = document.getElementById("refereePanelBody");
const generateRefereeLineupBtn = document.getElementById("generateRefereeLineupBtn");
const refereeLineupStatus = document.getElementById("refereeLineupStatus");
const activeRefereeList = document.getElementById("activeRefereeList");
const reserveRefereeList = document.getElementById("reserveRefereeList");
const assignBtn = document.getElementById("assignBtn");
const arenaList = document.getElementById("arenaList");
const tournamentTitle = document.getElementById("tournamentTitle");
const matchArenaSelect = document.getElementById("matchArenaSelect");
const matchArenaBoard = document.getElementById("matchArenaBoard");
const player1Input = document.getElementById("player1Input");
const player2Input = document.getElementById("player2Input");
const setMatchBtn = document.getElementById("setMatchBtn");
const matchMessage = document.getElementById("matchMessage");
const matchSwitchBanner = document.getElementById("matchSwitchBanner");
const challongeUrlInput = document.getElementById("challongeUrlInput");
const saveChallongeUrlBtn = document.getElementById("saveChallongeUrlBtn");
const syncChallongeBtn = document.getElementById("syncChallongeBtn");
const loadNextChallongeMatchBtn = document.getElementById("loadNextChallongeMatchBtn");
const autoAssignChallongeBtn = document.getElementById("autoAssignChallongeBtn");
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
const selectedChallongeArenaByMatch = {};

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

function normalizeNameKey(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function refereePanelStorageKey() {
  return `admin_referee_panel_hidden:${tournamentId || "default"}`;
}

function setTournamentRefereeMessage(text = "", isError = false) {
  if (!tournamentRefereeMessage) return;
  tournamentRefereeMessage.textContent = text;
  tournamentRefereeMessage.classList.toggle("error", Boolean(text) && isError);
}

function setRefereePanelCollapsed(collapsed) {
  if (!refereePanelBody || !toggleRefereePanelBtn) return;
  refereePanelBody.hidden = collapsed;
  toggleRefereePanelBtn.textContent = collapsed ? "Mostra" : "Nascondi";
  toggleRefereePanelBtn.setAttribute("aria-expanded", String(!collapsed));
  try {
    localStorage.setItem(refereePanelStorageKey(), collapsed ? "1" : "0");
  } catch {
    // ignore local storage failures
  }
}

function restoreRefereePanelState() {
  if (!refereePanelBody || !toggleRefereePanelBtn) return;
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(refereePanelStorageKey()) === "1";
  } catch {
    collapsed = false;
  }
  setRefereePanelCollapsed(collapsed);
}

function challongeStateLabel(state) {
  const value = String(state || "").trim().toLowerCase();
  if (value === "underway") return "in corso";
  if (value === "pending") return "in attesa";
  if (value === "complete") return "completato";
  if (value === "group_stages_underway") return "svizzera in corso";
  if (value === "group_stages_finalized") return "svizzera completata, top non avviata";
  if (value === "checking_in") return "check-in aperto";
  if (value === "checked_in") return "check-in chiuso";
  return value || "sconosciuto";
}

function setChallongeStatus(text, isError = false) {
  if (!challongeStatus) return;
  challongeStatus.textContent = text;
  challongeStatus.classList.toggle("error", isError);
}

function setRefereeLineupStatus(text = "", isError = false) {
  if (!refereeLineupStatus) return;
  refereeLineupStatus.textContent = text;
  refereeLineupStatus.classList.toggle("error", Boolean(text) && isError);
}

function tournamentRegistryReferees() {
  if (!tournament) return [];
  const registry = (state.refereesRegistry || []).filter((ref) => ref.authUid);
  const ids = Array.isArray(tournament.refereeIds) ? tournament.refereeIds : [];
  return ids
    .map((id) => registry.find((ref) => ref.id === id))
    .filter(Boolean);
}

function tournamentRefereePlayerLinks() {
  return Array.isArray(tournament && tournament.refereePlayerLinks) ? tournament.refereePlayerLinks : [];
}

function tournamentPlayerNameMap() {
  const map = new Map();
  if (!tournament) return map;
  const names = [
    ...(Array.isArray(tournament.players) ? tournament.players : []),
    ...(Array.isArray(tournament.challongeParticipants) ? tournament.challongeParticipants.map((participant) => participant && participant.name) : []),
    ...(Array.isArray(tournament.challongePlayerMap) ? tournament.challongePlayerMap.map((participant) => participant && participant.name) : [])
  ];
  names.forEach((entry) => {
    const name = String(entry || "").trim();
    const key = normalizeNameKey(name);
    if (!key || map.has(key)) return;
    map.set(key, name);
  });
  return map;
}

function resolveTournamentPlayerName(playerName) {
  const playerKey = normalizeNameKey(playerName);
  if (!playerKey) return "";
  return tournamentPlayerNameMap().get(playerKey) || "";
}

function linkedPlayerNameForReferee(refereeId) {
  const refId = String(refereeId || "").trim();
  if (!refId) return "";
  const link = tournamentRefereePlayerLinks().find((item) => String(item && item.refereeId || "").trim() === refId);
  return String(link && link.playerName || "").trim();
}

function findTournamentReferee(refereeId) {
  const refId = String(refereeId || "").trim();
  if (!refId) return null;
  return tournamentRegistryReferees().find((ref) => ref.id === refId)
    || (state.refereesRegistry || []).find((ref) => ref.id === refId)
    || null;
}

function updateRefereePlayerLink(refereeId, playerName) {
  if (!tournament) return { ok: false };
  const refId = String(refereeId || "").trim();
  if (!refId) return { ok: false };
  if (!Array.isArray(tournament.refereePlayerLinks)) tournament.refereePlayerLinks = [];
  const nextName = String(playerName || "").trim();
  const currentIndex = tournament.refereePlayerLinks.findIndex((item) => String(item && item.refereeId || "").trim() === refId);
  if (!nextName) {
    if (currentIndex !== -1) {
      tournament.refereePlayerLinks.splice(currentIndex, 1);
    }
    return { ok: true, cleared: true, switchPlan: [] };
  }
  const resolvedPlayerName = resolveTournamentPlayerName(nextName);
  if (!resolvedPlayerName) {
    return {
      ok: false,
      error: "Giocatore non trovato nel torneo. Importa i giocatori o sincronizza Challonge prima di collegarlo a un arbitro."
    };
  }
  const duplicateLink = tournament.refereePlayerLinks.find((item) =>
    String(item && item.refereeId || "").trim() !== refId
    && normalizeNameKey(item && item.playerName) === normalizeNameKey(resolvedPlayerName)
  );
  if (duplicateLink) {
    return {
      ok: false,
      error: `Giocatore già collegato a ${findTournamentReferee(duplicateLink.refereeId)?.name || "un altro arbitro"}.`
    };
  }
  const conflictResolution = resolveImmediateRefereePlayerConflict(refId, resolvedPlayerName);
  if (!conflictResolution.ok) {
    return conflictResolution;
  }
  const nextLink = { refereeId: refId, playerName: resolvedPlayerName };
  if (currentIndex === -1) {
    tournament.refereePlayerLinks.push(nextLink);
  } else {
    tournament.refereePlayerLinks[currentIndex] = nextLink;
  }
  return {
    ok: true,
    cleared: false,
    playerName: resolvedPlayerName,
    switchPlan: conflictResolution.switchPlan || []
  };
}

function assignedArenaForReferee(refereeId) {
  const refId = String(refereeId || "").trim();
  if (!refId || !tournament) return null;
  return (tournament.arenas || []).find((arena) => String(arena && arena.refereeId || "").trim() === refId) || null;
}

function playerNamesForArenaMatch(arena) {
  const match = arena && arena.match;
  if (!match) return [];
  return [String(match.p1 || "").trim(), String(match.p2 || "").trim()].filter(Boolean);
}

function findArenaWithPlayerName(playerName) {
  const playerKey = normalizeNameKey(playerName);
  if (!playerKey || !tournament) return null;
  return (tournament.arenas || []).find((arena) =>
    playerNamesForArenaMatch(arena).some((name) => normalizeNameKey(name) === playerKey)
  ) || null;
}

function refereePlayingConflict(refereeId) {
  const playerName = linkedPlayerNameForReferee(refereeId);
  const playerKey = normalizeNameKey(playerName);
  if (!playerKey || !tournament) return null;
  const arena = findArenaWithPlayerName(playerName);
  if (!arena || !arena.match) return null;
  return {
    playerName,
    arenaName: arena.name,
    matchLabel: `${arena.match.p1} vs ${arena.match.p2}`
  };
}

function linkedRefereeForPlayerName(playerName) {
  const playerKey = normalizeNameKey(playerName);
  if (!playerKey) return null;
  const link = tournamentRefereePlayerLinks().find((item) => normalizeNameKey(item && item.playerName) === playerKey);
  if (!link) return null;
  const referee = findTournamentReferee(link.refereeId);
  if (!referee) return null;
  return {
    playerName: String(link.playerName || playerName).trim(),
    referee
  };
}

function freeReserveReferees(excludedRefereeIds = new Set(), excludedPlayerKeys = new Set()) {
  const assignedRefereeIds = new Set((tournament && tournament.arenas || [])
    .map((arena) => String(arena && arena.refereeId || "").trim())
    .filter(Boolean));
  return tournamentRegistryReferees().filter((ref) => {
    const refId = String(ref.id || "").trim();
    if (!refId || assignedRefereeIds.has(refId) || excludedRefereeIds.has(refId)) return false;
    const linkedPlayerKey = normalizeNameKey(linkedPlayerNameForReferee(refId));
    if (linkedPlayerKey && excludedPlayerKeys.has(linkedPlayerKey)) return false;
    return !refereePlayingConflict(refId);
  });
}

function analyzeMatchRefereeSwitches(playerNames = []) {
  const requiredSwitches = [];
  const seen = new Set();
  const relevantPlayerKeys = new Set((Array.isArray(playerNames) ? playerNames : []).map((name) => normalizeNameKey(name)).filter(Boolean));
  (Array.isArray(playerNames) ? playerNames : []).forEach((playerName) => {
    const linked = linkedRefereeForPlayerName(playerName);
    if (!linked) return;
    const arena = assignedArenaForReferee(linked.referee.id);
    if (!arena) return;
    const key = `${linked.referee.id}:${arena.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    requiredSwitches.push({
      playerName: linked.playerName,
      referee: linked.referee,
      arena
    });
  });
  if (requiredSwitches.length === 0) {
    return { switchPlan: [], unresolved: [] };
  }
  const excludedRefereeIds = new Set(requiredSwitches.map((item) => item.referee.id));
  const reservePool = freeReserveReferees(excludedRefereeIds, relevantPlayerKeys).slice();
  const switchPlan = [];
  const unresolved = [];
  requiredSwitches.forEach((item) => {
    const replacement = reservePool.shift();
    if (!replacement) {
      unresolved.push(item);
      return;
    }
    switchPlan.push({ ...item, replacement });
  });
  return { switchPlan, unresolved };
}

function resolveImmediateRefereePlayerConflict(refereeId, playerName) {
  const refId = String(refereeId || "").trim();
  const resolvedPlayerName = String(playerName || "").trim();
  if (!refId || !resolvedPlayerName) {
    return { ok: true, switchPlan: [] };
  }
  const referee = findTournamentReferee(refId);
  const assignedArena = assignedArenaForReferee(refId);
  const playingArena = findArenaWithPlayerName(resolvedPlayerName);
  if (!referee || !assignedArena || !playingArena) {
    return { ok: true, switchPlan: [] };
  }
  const replacement = freeReserveReferees(
    new Set([refId]),
    new Set([normalizeNameKey(resolvedPlayerName)])
  )[0];
  if (!replacement) {
    return {
      ok: false,
      error: `${resolvedPlayerName} sta già giocando su ${playingArena.name} e ${referee.name} è assegnato a ${assignedArena.name}. Serve una riserva libera per completare il collegamento.`
    };
  }
  const switchPlan = [{
    playerName: resolvedPlayerName,
    referee,
    arena: assignedArena,
    replacement
  }];
  applyMatchRefereeSwitchPlan(switchPlan);
  return { ok: true, switchPlan };
}

function refereePlayerLinkSuccessMessage(result) {
  if (!result || !result.ok) return "";
  const baseMessage = result.cleared ? "Giocatore scollegato." : "Giocatore collegato salvato.";
  if (!Array.isArray(result.switchPlan) || result.switchPlan.length === 0) {
    return baseMessage;
  }
  return `${baseMessage} Cambio automatico: ${matchSwitchSummary(result.switchPlan)}.`;
}

function switchPreviewMessage(switchPlan = []) {
  if (!Array.isArray(switchPlan) || switchPlan.length === 0) return "";
  return `Se carichi questo match, cambierò l'arbitro in automatico: ${matchSwitchSummary(switchPlan)}.`;
}

function blockedSwitchPreviewMessage(unresolved = []) {
  if (!Array.isArray(unresolved) || unresolved.length === 0) return "";
  return `Per caricare questo match devo cambiare arbitro, ma ${unresolvedMatchSwitchMessage(unresolved)}.`;
}

function setSwitchBanner(element, text = "", options = {}) {
  if (!element) return;
  const message = String(text || "").trim();
  if (!message) {
    element.hidden = true;
    element.classList.remove("is-error");
    element.innerHTML = "";
    return;
  }
  const title = String(options.title || "Cambio arbitro automatico").trim();
  element.hidden = false;
  element.classList.toggle("is-error", Boolean(options.isError));
  element.innerHTML = `
    <div class="switch-banner-title">${escapeHtml(title)}</div>
    <div class="switch-banner-copy">${escapeHtml(message)}</div>
  `;
}

function updateManualMatchSwitchBanner() {
  if (!matchSwitchBanner) return;
  const player1Name = String(player1Input && player1Input.value || "").trim();
  const player2Name = String(player2Input && player2Input.value || "").trim();
  if (!tournament || !player1Name || !player2Name) {
    setSwitchBanner(matchSwitchBanner, "");
    return;
  }
  const switchAnalysis = analyzeMatchRefereeSwitches([player1Name, player2Name]);
  if (switchAnalysis.unresolved.length > 0) {
    setSwitchBanner(matchSwitchBanner, blockedSwitchPreviewMessage(switchAnalysis.unresolved), {
      title: "Cambio arbitro richiesto",
      isError: true
    });
    return;
  }
  if (switchAnalysis.switchPlan.length > 0) {
    setSwitchBanner(matchSwitchBanner, switchPreviewMessage(switchAnalysis.switchPlan), {
      title: "Cambio arbitro automatico"
    });
    return;
  }
  setSwitchBanner(matchSwitchBanner, "");
}

function matchSwitchSummary(switchPlan = []) {
  return switchPlan.map((item) =>
    `${item.replacement.name} prende il posto di ${item.referee.name} su ${item.arena.name}`
  ).join(" · ");
}

function unresolvedMatchSwitchMessage(unresolved = []) {
  return unresolved.map((item) =>
    `${item.playerName} è collegato all'arbitro ${item.referee.name}, ma ${item.arena.name} non ha una riserva libera per il cambio automatico`
  ).join(" · ");
}

function applyMatchRefereeSwitchPlan(switchPlan = []) {
  switchPlan.forEach((item) => {
    item.arena.refereeId = item.replacement.id;
    item.arena.refereeName = item.replacement.name;
  });
}

function compactArenaLabel(arena) {
  const name = String(arena && arena.name || "").trim();
  const numericMatch = name.match(/(\d+)(?!.*\d)/);
  return numericMatch ? numericMatch[1] : name || "Arena";
}

function canLoadMatchIntoArena(arena) {
  return Boolean(arena) && arena.status === "free" && !arena.match;
}

function assignRefereeToArena(refereeId, arenaId, options = {}) {
  if (!tournament) return false;
  const arena = (tournament.arenas || []).find((item) => item.id === arenaId);
  const ref = (state.refereesRegistry || []).find((item) => item.id === refereeId);
  if (!arena || !ref) return false;
  const playingConflict = refereePlayingConflict(ref.id);
  if (playingConflict) {
    setRefereeLineupStatus(
      `${ref.name} è collegato al giocatore ${playingConflict.playerName} e sta già giocando su ${playingConflict.arenaName} (${playingConflict.matchLabel}).`,
      true
    );
    return false;
  }
  const replacingOther = arena.refereeId && arena.refereeId !== ref.id;
  if (replacingOther && !options.skipConfirm) {
    const ok = window.confirm(`Sostituire ${arena.refereeName || "l'arbitro attuale"} con ${ref.name} in ${arena.name}?`);
    if (!ok) return false;
  }
  arena.refereeId = ref.id;
  arena.refereeName = ref.name;
  setRefereeLineupStatus("");
  saveState(state);
  render();
  return true;
}

function tournamentChallongeParticipantMap() {
  const map = new Map();
  if (!tournament) return map;
  const mergedParticipants = [
    ...(Array.isArray(tournament.challongeParticipants) ? tournament.challongeParticipants : []),
    ...(Array.isArray(tournament.challongePlayerMap) ? tournament.challongePlayerMap : [])
  ];
  mergedParticipants.forEach((participant) => {
    const id = String(participant && participant.id || "").trim();
    const name = String(participant && participant.name || "").trim();
    if (!id || !name || challongePlaceholderName(name, id)) return;
    map.set(id, name);
  });
  return map;
}

function resolvedFallbackPlayerName(fallbackNames = [], participant = {}, index = 0) {
  const safeFallbacks = Array.isArray(fallbackNames) ? fallbackNames : [];
  const seed = Number(participant && participant.seed) || 0;
  const seedBased = seed > 0 ? String(safeFallbacks[seed - 1] || "").trim() : "";
  if (seedBased && !challongePlaceholderName(seedBased)) return seedBased;
  const indexBased = String(safeFallbacks[index] || "").trim();
  if (indexBased && !challongePlaceholderName(indexBased)) return indexBased;
  return "";
}

function resolveChallongeParticipants(participants = [], fallbackNames = []) {
  return (Array.isArray(participants) ? participants : []).map((participant, index) => {
    const id = String(participant && participant.id || "").trim();
    const seed = Number(participant && participant.seed) || 0;
    const rawName = String(participant && participant.name || "").trim();
    const fallbackName = resolvedFallbackPlayerName(fallbackNames, participant, index);
    const resolvedName = challongePlaceholderName(rawName, id) ? fallbackName || rawName : rawName;
    return { id, seed, name: resolvedName };
  }).filter((participant) => participant.id && participant.name);
}

function mergeChallongePlayerMaps(currentList = [], incomingList = []) {
  const merged = new Map();
  [...(Array.isArray(currentList) ? currentList : []), ...(Array.isArray(incomingList) ? incomingList : [])].forEach((participant) => {
    const id = String(participant && participant.id || "").trim();
    const name = String(participant && participant.name || "").trim();
    if (!id || !name || challongePlaceholderName(name, id)) return;
    merged.set(id, {
      id,
      seed: Number(participant && participant.seed) || 0,
      name
    });
  });
  return Array.from(merged.values());
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

function renderRefereeLineup() {
  if (!activeRefereeList || !reserveRefereeList) return;
  activeRefereeList.innerHTML = "";
  reserveRefereeList.innerHTML = "";
  if (!tournament) return;

  const tournamentRefs = tournamentRegistryReferees();
  const assignedIds = new Set();
  const assignedNames = new Set();
  const activeAssignments = [];

  (tournament.arenas || []).forEach((arena) => {
    if (!arena.refereeId && !arena.refereeName) return;
    const ref = tournamentRefs.find((item) => item.id === arena.refereeId)
      || (state.refereesRegistry || []).find((item) => item.id === arena.refereeId)
      || tournamentRefs.find((item) => item.name === arena.refereeName);
    const refereeName = ref ? ref.name : String(arena.refereeName || "").trim();
    if (arena.refereeId) assignedIds.add(arena.refereeId);
    if (refereeName) assignedNames.add(refereeName.toLowerCase());
    activeAssignments.push({
      arenaName: arena.name,
      refereeName: refereeName || "Arbitro non trovato",
      status: arena.status,
      linkedPlayerName: ref ? linkedPlayerNameForReferee(ref.id) : ""
    });
  });

  const reserves = tournamentRefs.filter((ref) =>
    !assignedIds.has(ref.id) && !assignedNames.has(ref.name.trim().toLowerCase())
  );

  if (activeAssignments.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Nessun arbitro assegnato alle arene.";
    activeRefereeList.appendChild(empty);
  } else {
    activeAssignments.forEach((assignment) => {
      const row = document.createElement("div");
      row.className = "list-row roster-item";
      row.innerHTML = `
        <strong>${assignment.refereeName}</strong>
        <div class="muted">${assignment.arenaName}</div>
        <div class="muted">Stato arena: ${statusLabel(assignment.status)}</div>
        <div class="muted">Giocatore collegato: ${assignment.linkedPlayerName || "—"}</div>
      `;
      activeRefereeList.appendChild(row);
    });
  }

  if (reserves.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Nessuna riserva disponibile.";
    reserveRefereeList.appendChild(empty);
  } else {
    reserves.forEach((ref) => {
      const linkedPlayerName = linkedPlayerNameForReferee(ref.id);
      const playingConflict = refereePlayingConflict(ref.id);
      const row = document.createElement("div");
      row.className = "list-row roster-item";
      const arenaOptions = (tournament.arenas || []).map((arena) => {
        return `<option value="${arena.id}">${compactArenaLabel(arena)}</option>`;
      }).join("");
      row.innerHTML = `
        <strong>${ref.name}</strong>
        <div class="muted">Giocatore collegato: ${linkedPlayerName || "—"}</div>
        ${playingConflict ? `<div class="error">Sta giocando su ${playingConflict.arenaName}: ${playingConflict.matchLabel}</div>` : ""}
        <div class="reserve-assign-row">
          <select class="reserve-arena-select" data-ref-id="${ref.id}" ${playingConflict ? "disabled" : ""}>
            ${arenaOptions || '<option value="">Nessuna arena disponibile</option>'}
          </select>
          <button type="button" class="assign-reserve-btn" data-ref-id="${ref.id}" ${(arenaOptions && !playingConflict) ? "" : "disabled"}>Assegna arena</button>
        </div>
      `;
      reserveRefereeList.appendChild(row);
    });
  }

  const unstaffedArenaCount = (tournament.arenas || []).filter((arena) => !arena.refereeId && !arena.refereeName).length;
  setRefereeLineupStatus(`${activeAssignments.length} arbitri in arena, ${reserves.length} riserve, ${unstaffedArenaCount} arene senza arbitro.`);
}

function renderMatchArenaBoard() {
  if (!matchArenaBoard) return;
  matchArenaBoard.innerHTML = "";
  if (!tournament) return;
  const selectedArenaId = matchArenaSelect ? String(matchArenaSelect.value || "") : "";
  const participantNameMap = tournamentChallongeParticipantMap();
  (tournament.arenas || []).forEach((arena) => {
    const isReady = arena.status === "free" && !arena.match;
    const matchNames = arena.match && arena.match.source === "challonge"
      ? resolveChallongeMatchNames(arena.match, participantNameMap)
      : {
          player1Name: arena.match ? String(arena.match.p1 || "").trim() : "",
          player2Name: arena.match ? String(arena.match.p2 || "").trim() : ""
        };
    const boardBadge = isReady
      ? "Libera"
      : arena.status === "free" && arena.match
        ? "Con match"
        : statusLabel(arena.status);
    const note = isReady
      ? "Pronta per caricare un match"
      : arena.match
        ? `${matchNames.player1Name} vs ${matchNames.player2Name}`
        : `Stato: ${statusLabel(arena.status)}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `quick-arena-btn${selectedArenaId === arena.id ? " is-selected" : ""}`;
    button.dataset.id = arena.id;
    button.innerHTML = `
      <span class="light ${arena.status}" aria-hidden="true"></span>
      <span class="quick-arena-copy">
        <strong>${arena.name}</strong>
        <span class="muted">Arbitro: ${arena.refereeName || "—"}</span>
        <span class="quick-arena-note">${note}</span>
      </span>
      <span class="badge ${arena.status}">${boardBadge}</span>
    `;
    matchArenaBoard.appendChild(button);
  });
}

function assignAvailableRefereesToEmptyArenas() {
  if (!tournament) return;
  const availableRefs = tournamentRegistryReferees();
  const usedIds = new Set();
  const usedNames = new Set();
  (tournament.arenas || []).forEach((arena) => {
    if (arena.refereeId) usedIds.add(arena.refereeId);
    if (arena.refereeName) usedNames.add(String(arena.refereeName).trim().toLowerCase());
  });

  let skippedPlayingCount = 0;
  const queue = availableRefs.filter((ref) => {
    if (usedIds.has(ref.id) || usedNames.has(ref.name.trim().toLowerCase())) return false;
    if (refereePlayingConflict(ref.id)) {
      skippedPlayingCount += 1;
      return false;
    }
    return true;
  });

  let assignedCount = 0;
  (tournament.arenas || []).forEach((arena) => {
    if (arena.refereeId || arena.refereeName) return;
    const nextRef = queue.shift();
    if (!nextRef) return;
    arena.refereeId = nextRef.id;
    arena.refereeName = nextRef.name;
    assignedCount += 1;
  });

  return {
    availableRefs,
    assignedCount,
    skippedPlayingCount,
    remainingEmptyCount: (tournament.arenas || []).filter((arena) => !arena.refereeId && !arena.refereeName).length
  };
}

function generateRefereeLineup() {
  if (!tournament) return { assignedCount: 0, skippedPlayingCount: 0, remainingEmptyCount: 0 };
  const assignment = assignAvailableRefereesToEmptyArenas();
  if (!assignment || assignment.availableRefs.length === 0) {
    setRefereeLineupStatus("Aggiungi prima arbitri al torneo.", true);
    return { assignedCount: 0, skippedPlayingCount: 0, remainingEmptyCount: 0 };
  }

  if (assignment.assignedCount === 0) {
    const skippedText = assignment.skippedPlayingCount > 0
      ? ` ${assignment.skippedPlayingCount} arbitri saltati perché stanno giocando.`
      : "";
    setRefereeLineupStatus(`Nessuna arena libera da riempire oppure nessuna riserva disponibile.${skippedText}`, true);
    renderRefereeLineup();
    return assignment;
  }

  saveState(state);
  render();
  const skippedText = assignment.skippedPlayingCount > 0
    ? ` ${assignment.skippedPlayingCount} riserve saltate perché stanno giocando.`
    : "";
  setRefereeLineupStatus(`Lista aggiornata: ${assignment.assignedCount} arbitri assegnati alle arene libere.${skippedText}`);
  return assignment;
}

function challongePlaceholderName(name, participantId = "") {
  const text = String(name || "").trim();
  const id = String(participantId || "").trim();
  if (!text) return true;
  return Boolean(id) && text === `Partecipante ${id}`;
}

function buildChallongeParticipantNameMap(participants = []) {
  const map = new Map();
  (Array.isArray(participants) ? participants : []).forEach((participant) => {
    const id = String(participant && participant.id || "").trim();
    const name = String(participant && participant.name || "").trim();
    if (!id || !name || challongePlaceholderName(name, id)) return;
    map.set(id, name);
  });
  return map;
}

function normalizeChallongeMatchesWithParticipants(matches = [], participantNameMap = new Map()) {
  return (Array.isArray(matches) ? matches : []).map((match) => {
    const player1Id = String(match && match.player1Id || "").trim();
    const player2Id = String(match && match.player2Id || "").trim();
    const mappedPlayer1 = participantNameMap.get(player1Id) || "";
    const mappedPlayer2 = participantNameMap.get(player2Id) || "";
    return {
      ...match,
      player1Name: mappedPlayer1 || String(match && match.player1Name || "").trim() || (player1Id ? `Partecipante ${player1Id}` : ""),
      player2Name: mappedPlayer2 || String(match && match.player2Name || "").trim() || (player2Id ? `Partecipante ${player2Id}` : "")
    };
  }).filter((match) => match.id && match.player1Name && match.player2Name);
}

function resolveChallongeMatchNames(match, participantNameMap = tournamentChallongeParticipantMap()) {
  if (!match) {
    return { player1Name: "", player2Name: "" };
  }
  const player1Id = String(match.player1Id || match.challongePlayer1Id || "").trim();
  const player2Id = String(match.player2Id || match.challongePlayer2Id || "").trim();
  const currentPlayer1 = String(match.player1Name || match.p1 || "").trim();
  const currentPlayer2 = String(match.player2Name || match.p2 || "").trim();
  return {
    player1Name: participantNameMap.get(player1Id) || currentPlayer1 || (player1Id ? `Partecipante ${player1Id}` : ""),
    player2Name: participantNameMap.get(player2Id) || currentPlayer2 || (player2Id ? `Partecipante ${player2Id}` : "")
  };
}

function resolveArenaWinnerDisplayName(arena, participantNameMap = tournamentChallongeParticipantMap()) {
  if (!arena) return "";
  const winnerId = String(arena.winnerCandidateId || arena.selectedWinnerId || "").trim();
  const fallbackName = String(arena.winnerCandidate || arena.selectedWinner || "").trim();
  if (!winnerId) return fallbackName;
  return participantNameMap.get(winnerId) || fallbackName || `Partecipante ${winnerId}`;
}

function refreshAssignedChallongeArenaNames(participantNameMap = new Map(), normalizedMatches = []) {
  if (!tournament) return;
  const matchesById = new Map((Array.isArray(normalizedMatches) ? normalizedMatches : []).map((match) => [String(match.id), match]));
  (tournament.arenas || []).forEach((arena) => {
    const match = arena && arena.match;
    if (!match || match.source !== "challonge") return;
    const syncedMatch = matchesById.get(String(match.challongeMatchId || ""));
    if (syncedMatch) {
      match.p1 = syncedMatch.player1Name;
      match.p2 = syncedMatch.player2Name;
      return;
    }
    const player1Id = String(match.challongePlayer1Id || "").trim();
    const player2Id = String(match.challongePlayer2Id || "").trim();
    const player1Name = participantNameMap.get(player1Id);
    const player2Name = participantNameMap.get(player2Id);
    if (player1Name) match.p1 = player1Name;
    if (player2Name) match.p2 = player2Name;
  });
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
    if (!tournament.challongeSyncedAt) {
      empty.textContent = "Sincronizza Challonge per vedere i match aperti.";
    } else if (String(tournament.challongeState || "").trim().toLowerCase() === "group_stages_finalized") {
      empty.textContent = "La top è stata generata, ma la fase finale non è ancora partita su Challonge. Avviala su Challonge e poi risincronizza.";
    } else {
      empty.textContent = "Nessun match aperto disponibile da Challonge.";
    }
    challongeMatchList.appendChild(empty);
    return;
  }
  const participantNameMap = tournamentChallongeParticipantMap();
  const arenaTargets = (tournament.arenas || []).map((arena) => ({
    id: arena.id,
    name: arena.name,
    compactName: compactArenaLabel(arena),
    status: arena.status,
    refereeName: arena.refereeName || "",
    ready: canLoadMatchIntoArena(arena)
  }));
  matches.forEach((match) => {
    const names = resolveChallongeMatchNames(match, participantNameMap);
    const switchAnalysis = analyzeMatchRefereeSwitches([names.player1Name, names.player2Name]);
    const blockedReason = unresolvedMatchSwitchMessage(switchAnalysis.unresolved);
    const blockedBanner = blockedReason
      ? `
        <div class="switch-banner is-error">
          <div class="switch-banner-title">Cambio arbitro richiesto</div>
          <div class="switch-banner-copy">${escapeHtml(blockedSwitchPreviewMessage(switchAnalysis.unresolved))}</div>
        </div>
      `
      : "";
    const autoSwitchBanner = switchAnalysis.switchPlan.length > 0 && !blockedReason
      ? `
        <div class="switch-banner">
          <div class="switch-banner-title">Cambio arbitro automatico</div>
          <div class="switch-banner-copy">${escapeHtml(switchPreviewMessage(switchAnalysis.switchPlan))}</div>
        </div>
      `
      : "";
    const selectedArenaId = String(selectedChallongeArenaByMatch[String(match.id)] || "").trim();
    const selectedArena = arenaTargets.find((arena) => arena.id === selectedArenaId) || null;
    const row = document.createElement("div");
    row.className = "list-row";
    const label = match.identifier ? `Match ${match.identifier}` : `Match ${match.id}`;
    const arenaButtons = arenaTargets.length === 0
      ? '<div class="muted">Nessuna arena creata.</div>'
      : `<div class="match-arena-picker">${arenaTargets.map((arena) => `
          <button
            type="button"
            class="match-arena-btn${selectedArenaId === arena.id ? " is-selected" : ""}"
            data-match-id="${match.id}"
            data-arena-id="${arena.id}"
            ${arena.ready && !blockedReason ? "" : "disabled"}
          >
            <span class="light ${arena.status}" aria-hidden="true"></span>
            <span>
              <strong>${arena.compactName}</strong>
              <span class="quick-arena-note">${arena.ready ? "Libera" : statusLabel(arena.status)}</span>
            </span>
          </button>
        `).join("")}</div>`;
    const selectedArenaText = selectedArena
      ? `Arena selezionata: ${selectedArena.compactName}`
      : "Seleziona l'arena qui sotto";
    row.innerHTML = `
      <strong>${names.player1Name} vs ${names.player2Name}</strong>
      <div class="muted">${label} · Round ${match.round}</div>
      <div class="match-arena-actions">
        <div class="row" style="margin-top:0;">
          <button class="load-challonge-match-btn" data-id="${match.id}" type="button" ${selectedArena && selectedArena.ready && !blockedReason ? "" : "disabled"}>Assegna match a questa arena</button>
        </div>
        ${blockedBanner}
        ${autoSwitchBanner}
        <div class="muted">${selectedArenaText}</div>
        ${arenaButtons}
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
  tournament.challongeParticipants = [];
  tournament.challongePlayerMap = [];
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
    const fallbackPlayerNames = Array.isArray(tournament.players) ? [...tournament.players] : [];
    const existingResolvedPlayers = Array.isArray(tournament.challongePlayerMap) ? tournament.challongePlayerMap : [];
    const resolvedParticipants = resolveChallongeParticipants(payload.participants || [], fallbackPlayerNames);
    const mergedResolvedPlayers = mergeChallongePlayerMaps(existingResolvedPlayers, resolvedParticipants);
    const participantNameMap = buildChallongeParticipantNameMap(mergedResolvedPlayers);
    const normalizedOpenMatches = normalizeChallongeMatchesWithParticipants(payload.openMatches || [], participantNameMap);
    tournament.challongeParticipants = resolvedParticipants;
    tournament.challongePlayerMap = mergeChallongePlayerMaps(existingResolvedPlayers, [
      ...resolvedParticipants,
      ...normalizedOpenMatches.flatMap((match) => ([
        { id: match.player1Id, name: match.player1Name },
        { id: match.player2Id, name: match.player2Name }
      ]))
    ]);
    syncTournamentPlayers(resolvedParticipants.map((participant) => participant.name));
    tournament.challongeState = payload.state || "";
    tournament.challongeSyncedAt = Date.now();
    tournament.challongeOpenMatches = normalizedOpenMatches;
    refreshAssignedChallongeArenaNames(participantNameMap, normalizedOpenMatches);
    saveState(state);
    render();
    if (!options.silent) {
      const challongeName = String(payload.name || tournament.name || "senza nome").trim();
      const challongeState = challongeStateLabel(payload.state);
      const challongeRef = String(payload.tournamentRef || "").trim();
      const refText = challongeRef ? ` Ref: ${challongeRef}.` : "";
      const finalStageHint = String(payload.state || "").trim().toLowerCase() === "group_stages_finalized"
        ? " La top è pronta ma la fase finale non è ancora avviata su Challonge."
        : "";
      setChallongeStatus(`Challonge sincronizzato: ${tournament.challongeOpenMatches.length} match aperti. Torneo: ${challongeName}. Stato: ${challongeState}.${refText}${finalStageHint}`);
    }
    return true;
  } catch (error) {
    console.error("Challonge sync error:", error);
    setChallongeStatus("Errore di rete durante la sincronizzazione Challonge.", true);
    return false;
  }
}

function prepareChallongeMatchAssignment(selectedMatch) {
  if (!selectedMatch) {
    return { ok: false, error: "Nessun match Challonge disponibile da caricare." };
  }
  const names = resolveChallongeMatchNames(selectedMatch);
  const switchAnalysis = analyzeMatchRefereeSwitches([names.player1Name, names.player2Name]);
  if (switchAnalysis.unresolved.length > 0) {
    return {
      ok: false,
      error: unresolvedMatchSwitchMessage(switchAnalysis.unresolved)
    };
  }
  return {
    ok: true,
    names,
    switchPlan: switchAnalysis.switchPlan,
    match: selectedMatch
  };
}

function applyPreparedChallongeMatchToArena(arena, preparedMatch) {
  if (!arena || !preparedMatch || !preparedMatch.ok) return { ok: false };
  if (preparedMatch.switchPlan.length > 0) {
    applyMatchRefereeSwitchPlan(preparedMatch.switchPlan);
  }
  const selectedMatch = preparedMatch.match;
  arena.match = {
    p1: preparedMatch.names.player1Name,
    p2: preparedMatch.names.player2Name,
    source: "challonge",
    challongeMatchId: String(selectedMatch.id),
    challongePlayer1Id: String(selectedMatch.player1Id),
    challongePlayer2Id: String(selectedMatch.player2Id),
    challongeIdentifier: selectedMatch.identifier || "",
    challongeRound: selectedMatch.round || 0
  };
  arena.selectedWinner = "";
  arena.selectedWinnerId = "";
  arena.winnerCandidate = "";
  arena.winnerCandidateId = "";
  arena.coinTossResult = "";
  return {
    ok: true,
    names: preparedMatch.names,
    switchPlan: preparedMatch.switchPlan
  };
}

function autoAssignChallongeMatches() {
  if (!tournament || !tournament.challongeUrl) {
    setChallongeStatus("Collega prima un torneo Challonge.", true);
    return;
  }
  const refereeAssignment = assignAvailableRefereesToEmptyArenas() || {
    availableRefs: [],
    assignedCount: 0,
    skippedPlayingCount: 0,
    remainingEmptyCount: 0
  };
  const tournamentState = String(tournament.challongeState || "").trim().toLowerCase();
  if (tournamentState === "group_stages_finalized") {
    setChallongeStatus("La top è stata generata, ma la fase finale non è ancora partita su Challonge. Avviala su Challonge e poi usa il pilota automatico.", true);
    return;
  }

  let assignedMatches = 0;
  let automaticSwitches = 0;
  let skippedWithoutReferee = 0;

  while (true) {
    const nextArena = (tournament.arenas || []).find((arena) =>
      canLoadMatchIntoArena(arena) && Boolean(arena.refereeId || arena.refereeName)
    );
    if (!nextArena) break;
    const nextPreparedMatch = availableChallongeMatches()
      .map((match) => prepareChallongeMatchAssignment(match))
      .find((result) => result.ok);
    if (!nextPreparedMatch) break;
    const applied = applyPreparedChallongeMatchToArena(nextArena, nextPreparedMatch);
    if (!applied.ok) break;
    assignedMatches += 1;
    automaticSwitches += nextPreparedMatch.switchPlan.length;
    delete selectedChallongeArenaByMatch[String(nextPreparedMatch.match.id)];
  }

  skippedWithoutReferee = (tournament.arenas || []).filter((arena) =>
    canLoadMatchIntoArena(arena) && !arena.refereeId && !arena.refereeName
  ).length;

  if (assignedMatches === 0 && refereeAssignment.assignedCount === 0) {
    const noMatchesText = availableChallongeMatches().length === 0
      ? "Nessun match Challonge aperto da assegnare."
      : "Nessun match Challonge caricabile automaticamente con gli arbitri disponibili.";
    setChallongeStatus(noMatchesText, true);
    render();
    return;
  }

  saveState(state);
  render();
  const switchText = automaticSwitches > 0
    ? ` Cambio automatico arbitri: ${automaticSwitches}.`
    : "";
  const refereeText = refereeAssignment.assignedCount > 0
    ? ` Arbitri assegnati automaticamente: ${refereeAssignment.assignedCount}.`
    : "";
  const skippedRefText = skippedWithoutReferee > 0
    ? ` Arene rimaste senza arbitro: ${skippedWithoutReferee}.`
    : "";
  setChallongeStatus(`Pilota automatico: ${assignedMatches} match Challonge assegnati.${refereeText}${switchText}${skippedRefText}`);
}

function loadChallongeMatchIntoArena(matchId = "", forcedArenaId = "") {
  if (!tournament) return;
  const rememberedArenaId = matchId ? String(selectedChallongeArenaByMatch[String(matchId)] || "").trim() : "";
  const arenaId = String(forcedArenaId || rememberedArenaId || (matchArenaSelect && matchArenaSelect.value) || "").trim();
  if (!arenaId) {
    setChallongeStatus("Seleziona prima un'arena.", true);
    return;
  }
  if (matchArenaSelect) {
    matchArenaSelect.value = arenaId;
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
    : matches.find((match) => {
        const names = resolveChallongeMatchNames(match);
        return analyzeMatchRefereeSwitches([names.player1Name, names.player2Name]).unresolved.length === 0;
      });
  if (!selectedMatch) {
    setChallongeStatus(matchId
      ? "Nessun match Challonge disponibile da caricare."
      : "Nessun match Challonge caricabile: i prossimi match richiedono una riserva libera per sostituire arbitri-giocatori.", true);
    return;
  }
  const preparedMatch = prepareChallongeMatchAssignment(selectedMatch);
  if (!preparedMatch.ok) {
    setChallongeStatus(preparedMatch.error || "Impossibile preparare il match Challonge.", true);
    return;
  }
  applyPreparedChallongeMatchToArena(arena, preparedMatch);
  if (matchId) {
    delete selectedChallongeArenaByMatch[String(matchId)];
  }
  saveState(state);
  render();
  const switchText = preparedMatch.switchPlan.length > 0
    ? ` Cambio automatico: ${matchSwitchSummary(preparedMatch.switchPlan)}.`
    : "";
  setChallongeStatus(`Match caricato su ${arena.name}: ${preparedMatch.names.player1Name} vs ${preparedMatch.names.player2Name}.${switchText}`);
}

async function reportChallongeResult(matchData, winnerChoice = {}) {
  if (!tournament || !tournament.challongeUrl) {
    throw new Error("Manca il link Challonge del torneo.");
  }
  const winnerName = String(winnerChoice && winnerChoice.name || "").trim();
  const explicitWinnerId = String(winnerChoice && winnerChoice.id || "").trim();
  const winnerParticipantId = explicitWinnerId || (
    winnerName === matchData.p1
      ? matchData.challongePlayer1Id
      : matchData.challongePlayer2Id
  );
  if (!winnerParticipantId) {
    throw new Error("Impossibile determinare il vincitore Challonge.");
  }
  const scoresCsv = winnerParticipantId === matchData.challongePlayer1Id ? "1-0" : "0-1";
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
  return message.includes("only have read access")
    || message.includes("read access")
    || message.includes("puo scrivere risultati")
    || message.includes("può scrivere risultati")
    || message.includes("accesso in scrittura");
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
  const previousArenaId = arenaSelect ? String(arenaSelect.value || "") : "";
  const previousMatchArenaId = matchArenaSelect ? String(matchArenaSelect.value || "") : "";
  const previousRefereeId = refereeSelect ? String(refereeSelect.value || "") : "";
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

  if (previousArenaId && Array.from(arenaSelect.options).some((option) => option.value === previousArenaId)) {
    arenaSelect.value = previousArenaId;
  }
  if (previousMatchArenaId && Array.from(matchArenaSelect.options).some((option) => option.value === previousMatchArenaId)) {
    matchArenaSelect.value = previousMatchArenaId;
  }

  refereeSelect.innerHTML = "";
  const tournamentRefEntries = tournamentRegistryReferees();
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

  if (previousRefereeId && Array.from(refereeSelect.options).some((option) => option.value === previousRefereeId)) {
    refereeSelect.value = previousRefereeId;
  }

  arenaList.innerHTML = "";
  const participantNameMap = tournamentChallongeParticipantMap();
  tournament.arenas.forEach((arena) => {
    const canConfirmWinner = Boolean(arena.winnerCandidateId || arena.winnerCandidate) || (arena.status === "standby" && arena.match && arena.match.p1 && arena.match.p2);
    const matchNames = arena.match && arena.match.source === "challonge"
      ? resolveChallongeMatchNames(arena.match, participantNameMap)
      : {
          player1Name: arena.match ? String(arena.match.p1 || "").trim() : "",
          player2Name: arena.match ? String(arena.match.p2 || "").trim() : ""
        };
    const winnerDisplay = resolveArenaWinnerDisplayName(arena, participantNameMap);
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
        <div class="muted">Vincitore: <span class="winner-name">${winnerDisplay || (arena.status === "standby" ? "Da confermare" : "—")}</span></div>
        <div class="muted">Match: ${arena.match ? `<span class="match-players">${matchNames.player1Name} vs ${matchNames.player2Name}</span>` : "—"}</div>
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
  renderRefereeLineup();
  renderPlayers();
  renderChallongeMatches();
  renderMatchArenaBoard();
  updateManualMatchSwitchBanner();
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
  setTournamentRefereeMessage("");
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

  const entries = tournamentRegistryReferees();
  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Nessun arbitro associato al torneo.";
    tournamentRefereeList.appendChild(empty);
    return;
  }
  entries.forEach((ref) => {
    const linkedPlayerName = linkedPlayerNameForReferee(ref.id);
    const playingConflict = refereePlayingConflict(ref.id);
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
      <div class="muted">Giocatore collegato: ${linkedPlayerName || "—"}</div>
      <div class="muted">Livello: Lv. ${levelInfo.level} - ${levelInfo.title}</div>
      <div class="muted">EXP: ${ref.exp || 0}</div>
      <div class="muted">${expToNextText}</div>
      ${playingConflict ? `<div class="error">Sta giocando su ${playingConflict.arenaName}: ${playingConflict.matchLabel}</div>` : ""}
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${progressTotal}" aria-valuenow="${progressValue}">
        <div class="progress-bar" style="width:${progressPercent}%"></div>
      </div>
      <div class="ref-player-link-row" style="margin-top:8px;">
        <input
          class="ref-player-link-input"
          data-id="${ref.id}"
          list="playersList"
          placeholder="Nome giocatore associato"
          value="${escapeHtml(linkedPlayerName)}"
        />
        <button type="button" class="save-ref-player-link-btn" data-id="${ref.id}">Salva giocatore</button>
        <button type="button" class="clear-ref-player-link-btn danger-btn" data-id="${ref.id}" ${linkedPlayerName ? "" : "disabled"}>Scollega</button>
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
  assignRefereeToArena(refereeId, arenaId, { skipConfirm: false });
});

if (addTournamentRefereeBtn) {
  addTournamentRefereeBtn.addEventListener("click", () => {
    if (!tournament) return;
    const refId = tournamentRefereeSelect.value;
    if (!refId) return;
    if (!Array.isArray(tournament.refereeIds)) tournament.refereeIds = [];
    if (tournament.refereeIds.includes(refId)) {
      setTournamentRefereeMessage("Arbitro già associato al torneo.", true);
      return;
    }
    setTournamentRefereeMessage("");
    tournament.refereeIds.push(refId);
    saveState(state);
    render();
  });
}

if (generateRefereeLineupBtn) {
  generateRefereeLineupBtn.addEventListener("click", () => {
    generateRefereeLineup();
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
  const switchAnalysis = analyzeMatchRefereeSwitches([p1, p2]);
  if (switchAnalysis.unresolved.length > 0) {
    matchMessage.textContent = unresolvedMatchSwitchMessage(switchAnalysis.unresolved);
    matchMessage.classList.add("error");
    return;
  }
  matchMessage.textContent = "";
  matchMessage.classList.remove("error");
  if (switchAnalysis.switchPlan.length > 0) {
    applyMatchRefereeSwitchPlan(switchAnalysis.switchPlan);
  }
  arena.match = { p1, p2, source: "manual" };
  arena.selectedWinner = "";
  arena.selectedWinnerId = "";
  arena.winnerCandidate = "";
  arena.winnerCandidateId = "";
  arena.coinTossResult = "";
  player1Input.value = "";
  player2Input.value = "";
  saveState(state);
  render();
  updateManualMatchSwitchBanner();
  if (switchAnalysis.switchPlan.length > 0) {
    matchMessage.textContent = `Cambio automatico: ${matchSwitchSummary(switchAnalysis.switchPlan)}.`;
    matchMessage.classList.remove("error");
  }
});

if (matchArenaSelect) {
  matchArenaSelect.addEventListener("change", () => {
    renderMatchArenaBoard();
  });
}

if (player1Input) {
  player1Input.addEventListener("input", updateManualMatchSwitchBanner);
  player1Input.addEventListener("change", updateManualMatchSwitchBanner);
}

if (player2Input) {
  player2Input.addEventListener("input", updateManualMatchSwitchBanner);
  player2Input.addEventListener("change", updateManualMatchSwitchBanner);
}

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

if (autoAssignChallongeBtn) {
  autoAssignChallongeBtn.addEventListener("click", () => {
    autoAssignChallongeMatches();
  });
}

if (challongeMatchList) {
  challongeMatchList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const directArenaButton = target.closest(".match-arena-btn");
    if (directArenaButton instanceof HTMLElement) {
      const matchId = directArenaButton.dataset.matchId;
      const arenaId = directArenaButton.dataset.arenaId;
      if (!matchId || !arenaId) return;
      selectedChallongeArenaByMatch[String(matchId)] = arenaId;
      if (matchArenaSelect) {
        matchArenaSelect.value = arenaId;
      }
      renderChallongeMatches();
      renderMatchArenaBoard();
      return;
    }
    if (!target.classList.contains("load-challonge-match-btn")) return;
    const matchId = target.dataset.id;
    if (!matchId) return;
    loadChallongeMatchIntoArena(matchId);
  });
}

if (reserveRefereeList) {
  reserveRefereeList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest(".assign-reserve-btn");
    if (!(button instanceof HTMLElement)) return;
    const refereeId = button.dataset.refId;
    if (!refereeId) return;
    const row = button.closest(".reserve-assign-row");
    const select = row ? row.querySelector(".reserve-arena-select") : null;
    const arenaId = select instanceof HTMLSelectElement ? String(select.value || "").trim() : "";
    if (!arenaId) {
      setRefereeLineupStatus("Seleziona prima un'arena per la riserva.", true);
      return;
    }
    const assigned = assignRefereeToArena(refereeId, arenaId, { skipConfirm: false });
    if (assigned) {
      setRefereeLineupStatus("Arbitro di riserva assegnato all'arena selezionata.");
    }
  });
}

if (matchArenaBoard) {
  matchArenaBoard.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest(".quick-arena-btn");
    if (!button || !matchArenaSelect) return;
    const arenaId = button.dataset.id;
    if (!arenaId) return;
    matchArenaSelect.value = arenaId;
    renderMatchArenaBoard();
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
    arena.selectedWinnerId = "";
    arena.winnerCandidate = "";
    arena.winnerCandidateId = "";
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
    arena.selectedWinnerId = "";
    arena.winnerCandidate = "";
    arena.winnerCandidateId = "";
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
  const winnerChoice = resolveArenaWinnerChoice(arena);
  const winnerName = String(winnerChoice && winnerChoice.name || "").trim();
  if (!winnerName && !String(winnerChoice && winnerChoice.id || "").trim()) return;
  let challongeWriteMode = "";
  if (matchData && matchData.source === "challonge" && matchData.challongeMatchId) {
    try {
      matchMessage.textContent = "Invio risultato a Challonge...";
      matchMessage.classList.remove("error");
      await reportChallongeResult(matchData, winnerChoice);
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
  arena.lastWinnerId = String(winnerChoice && winnerChoice.id || "").trim();
  arena.winnerCandidate = "";
  arena.winnerCandidateId = "";
  arena.status = "free";
  arena.calledAt = null;
  arena.match = null;
  arena.selectedWinner = "";
  arena.selectedWinnerId = "";
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
    if (!tournament) return;
    const refId = target.dataset.id;
    if (!refId) return;
    if (target.classList.contains("remove-ref-btn")) {
      tournament.refereeIds = (tournament.refereeIds || []).filter((id) => id !== refId);
      tournament.refereePlayerLinks = tournamentRefereePlayerLinks().filter((link) => link.refereeId !== refId);
      saveState(state);
      render();
      return;
    }
    if (target.classList.contains("save-ref-player-link-btn")) {
      const row = target.closest(".list-row");
      const input = row ? row.querySelector(".ref-player-link-input") : null;
      const nextName = input instanceof HTMLInputElement ? input.value.trim() : "";
      const result = updateRefereePlayerLink(refId, nextName);
      if (!result.ok) {
        setTournamentRefereeMessage(result.error || "Impossibile salvare il giocatore collegato.", true);
        return;
      }
      saveState(state);
      render();
      setTournamentRefereeMessage(refereePlayerLinkSuccessMessage(result));
      return;
    }
    if (target.classList.contains("clear-ref-player-link-btn")) {
      const result = updateRefereePlayerLink(refId, "");
      if (!result.ok) {
        setTournamentRefereeMessage("Impossibile scollegare il giocatore.", true);
        return;
      }
      saveState(state);
      render();
      setTournamentRefereeMessage("Giocatore scollegato.");
    }
  });
}

if (tournamentRefereeList) {
  tournamentRefereeList.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains("ref-player-link-input") || event.key !== "Enter") return;
    event.preventDefault();
    const refId = target.dataset.id;
    if (!refId) return;
    const result = updateRefereePlayerLink(refId, target.value.trim());
    if (!result.ok) {
      setTournamentRefereeMessage(result.error || "Impossibile salvare il giocatore collegato.", true);
      return;
    }
    saveState(state);
    render();
    setTournamentRefereeMessage(refereePlayerLinkSuccessMessage(result));
  });
}

if (toggleRefereePanelBtn) {
  toggleRefereePanelBtn.addEventListener("click", () => {
    setRefereePanelCollapsed(!(refereePanelBody && refereePanelBody.hidden));
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
    restoreRefereePanelState();
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

restoreRefereePanelState();

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
  if (!arena) return { name: "", id: "" };
  if (arena.winnerCandidateId || arena.winnerCandidate) {
    return {
      name: resolveArenaWinnerDisplayName(arena),
      id: String(arena.winnerCandidateId || "").trim()
    };
  }
  if (!arena.match || !arena.match.p1 || !arena.match.p2) return { name: "", id: "" };
  const matchNames = arena.match.source === "challonge"
    ? resolveChallongeMatchNames(arena.match)
    : { player1Name: arena.match.p1, player2Name: arena.match.p2 };
  const p1 = matchNames.player1Name;
  const p2 = matchNames.player2Name;
  const input = window.prompt(`Inserisci 1 per "${p1}" oppure 2 per "${p2}"`, "1");
  const value = String(input || "").trim().toLowerCase();
  if (!value) return { name: "", id: "" };
  if (value === "1" || value === p1.toLowerCase()) {
    return {
      name: p1,
      id: String(arena.match.challongePlayer1Id || "").trim()
    };
  }
  if (value === "2" || value === p2.toLowerCase()) {
    return {
      name: p2,
      id: String(arena.match.challongePlayer2Id || "").trim()
    };
  }
  return { name: "", id: "" };
}
