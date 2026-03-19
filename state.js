const STORAGE_KEY = "arena_state_v2";
const REMOTE_CACHE_KEY = "arena_remote_cache_v1";
const CALL_WINDOW_MS = 5 * 60 * 1000;

const hasFirebaseConfig = typeof window !== "undefined" && window.FIREBASE_CONFIG;
const hasFirebaseSdk = typeof window !== "undefined" && window.firebase && typeof window.firebase.initializeApp === "function";
let stateCache = { tournaments: [], refereesRegistry: [], updatedAt: 0 };
const subscribers = [];
let db = null;
let stateDocRef = null;
let realtimeStatus = { online: false, connected: false };
let pendingWrite = null;
let pendingState = null;
let pendingStatePolicy = { allowEmptyTournaments: false };
let lastSerialized = "";
let hasInitialRemoteSnapshot = false;
let syncedStateCache = { tournaments: [], refereesRegistry: [], updatedAt: 0 };

function mergeReferees(baseList, incomingList) {
  const merged = [...(baseList || []).map((ref) => normalizeRefereeRegistry([ref])[0]).filter(Boolean)];
  (incomingList || []).forEach((incoming) => {
    const normalizedIncoming = normalizeRefereeRegistry([incoming])[0];
    if (!normalizedIncoming) return;
    const index = merged.findIndex((ref) =>
      (normalizedIncoming.id && ref.id === normalizedIncoming.id) ||
      (normalizedIncoming.authUid && ref.authUid === normalizedIncoming.authUid) ||
      (normalizedIncoming.email && normalizeEmailForMerge(ref.email) === normalizeEmailForMerge(normalizedIncoming.email)) ||
      ref.name.trim().toLowerCase() === normalizedIncoming.name.trim().toLowerCase()
    );
    if (index === -1) {
      merged.push(normalizedIncoming);
      return;
    }
    merged[index] = {
      ...merged[index],
      ...normalizedIncoming,
      id: merged[index].id || normalizedIncoming.id
    };
  });
  return merged;
}

function normalizeEmailForMerge(email) {
  return String(email || "").trim().toLowerCase();
}

function mergePendingState(baseState, nextState, options = {}) {
  const merged = sanitizeState(baseState);
  const normalizedNext = sanitizeState(nextState);
  const allowEmptyTournaments = Boolean(options.allowEmptyTournaments);
  merged.refereesRegistry = mergeReferees(merged.refereesRegistry || [], normalizedNext.refereesRegistry || []);

  const baseHasTournaments = Array.isArray(merged.tournaments) && merged.tournaments.length > 0;
  const nextHasTournaments = Array.isArray(normalizedNext.tournaments) && normalizedNext.tournaments.length > 0;
  if (allowEmptyTournaments || !baseHasTournaments || nextHasTournaments) {
    merged.tournaments = normalizedNext.tournaments;
  }

  merged.updatedAt = Math.max(merged.updatedAt || 0, normalizedNext.updatedAt || 0);
  return normalizeState(merged);
}

function loadPersistedRemoteCache() {
  try {
    const raw = localStorage.getItem(REMOTE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return null;
  }
}

function persistRemoteCache(state) {
  try {
    localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota and serialization failures for local cache
  }
}

function hasMeaningfulState(state) {
  if (!state) return false;
  if (Array.isArray(state.tournaments) && state.tournaments.length > 0) return true;
  return Array.isArray(state.refereesRegistry) && state.refereesRegistry.length > 0;
}

function loadState() {
  if (hasFirebaseConfig && hasFirebaseSdk) {
    if (!hasMeaningfulState(stateCache)) {
      const cached = loadPersistedRemoteCache();
      if (cached) {
        stateCache = cached;
        if (!hasMeaningfulState(syncedStateCache)) syncedStateCache = sanitizeState(cached);
      }
    }
    return stateCache;
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const legacyRaw = localStorage.getItem("arena_state_v1");
    if (legacyRaw) {
      try {
        const legacyParsed = JSON.parse(legacyRaw);
        return migrateLegacy(legacyParsed);
      } catch {
        return { tournaments: [] };
      }
    }
    return { tournaments: [] };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.tournaments) {
      return migrateLegacy(parsed);
    }
    parsed.tournaments = parsed.tournaments.map(normalizeTournament);
    parsed.refereesRegistry = normalizeRefereeRegistry(parsed.refereesRegistry || []);
    normalizeState(parsed);
    return parsed;
  } catch {
    return { tournaments: [] };
  }
}

function saveState(state, options = {}) {
  const normalized = normalizeState(state);
  if (hasFirebaseConfig && hasFirebaseSdk) {
    const baseState = hasMeaningfulState(syncedStateCache)
      ? syncedStateCache
      : (loadPersistedRemoteCache() || { tournaments: [], refereesRegistry: [], updatedAt: 0 });
    const sanitized = sanitizeState(normalized);
    if (sameMeaningfulState(baseState, sanitized)) {
      stateCache = sanitizeState(sanitized);
      persistRemoteCache(stateCache);
      pendingState = null;
      pendingStatePolicy = { allowEmptyTournaments: false };
      return;
    }
    const allowEmptyTournaments = options.allowEmptyTournaments == null
      ? hasInitialRemoteSnapshot
      : Boolean(options.allowEmptyTournaments);
    sanitized.updatedAt = Date.now();
    const mergedState = mergePendingState(baseState, sanitized, {
      allowEmptyTournaments
    });
    stateCache = mergedState;
    persistRemoteCache(mergedState);
    pendingState = mergedState;
    pendingStatePolicy = { allowEmptyTournaments };
    if (hasInitialRemoteSnapshot) scheduleWrite(mergedState);
    return;
  }
  normalized.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

function subscribeState(callback) {
  subscribers.push(callback);
  if (hasFirebaseConfig && hasFirebaseSdk) return;
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    callback(loadState());
  });
}

function createTournament(name, challongeUrl = "") {
  return {
    id: `tournament-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name,
    challongeUrl,
    challongeState: "",
    challongeSyncedAt: 0,
    challongeParticipants: [],
    challongeOpenMatches: [],
    players: [],
    arenas: [],
    referees: [],
    refereeIds: []
  };
}

function createReferee(name, level = 1) {
  return {
    id: `ref-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name,
    accountDisplayName: "",
    email: "",
    authUid: "",
    webPushToken: "",
    webPushTokens: [],
    webPushSubscriptions: [],
    level,
    matchesArbitrated: 0,
    tournamentsArbitrated: [],
    exp: 0
  };
}

function createArena(name) {
  return {
    id: `arena-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name,
    status: "free",
    refereeId: "",
    refereeName: "",
    winnerCandidate: "",
    lastWinner: "",
    calledAt: null,
    match: null,
    selectedWinner: "",
    coinTossResult: ""
  };
}

function normalizeState(state) {
  if (!Array.isArray(state.tournaments)) state.tournaments = [];
  state.tournaments = state.tournaments.map(normalizeTournament);
  if (!state.refereesRegistry) state.refereesRegistry = [];
  state.updatedAt = Number.isFinite(state.updatedAt) ? state.updatedAt : 0;
  state.refereesRegistry = normalizeRefereeRegistry(state.refereesRegistry);
  state.refereesRegistry.forEach((ref) => {
    const levelInfo = getRefereeLevelInfo(ref.exp);
    ref.level = levelInfo.level;
  });
  ensureTournamentRefereeIds(state);
  expireCalls(state);
  return state;
}

function callWindowMs() {
  return CALL_WINDOW_MS;
}

function isOnlineMode() {
  return hasFirebaseConfig && hasFirebaseSdk;
}

function isRemoteStateReady() {
  return !isOnlineMode() || hasInitialRemoteSnapshot;
}

function normalizeTournament(tournament) {
  return {
    id: tournament.id,
    name: tournament.name,
    challongeUrl: tournament.challongeUrl || "",
    challongeState: tournament.challongeState || "",
    challongeSyncedAt: Number.isFinite(tournament.challongeSyncedAt) ? tournament.challongeSyncedAt : 0,
    challongeParticipants: normalizeChallongeParticipants(tournament.challongeParticipants),
    challongeOpenMatches: normalizeChallongeOpenMatches(tournament.challongeOpenMatches),
    players: Array.isArray(tournament.players) ? tournament.players : [],
    arenas: (tournament.arenas || []).map(normalizeArena),
    referees: tournament.referees || [],
    refereeIds: Array.isArray(tournament.refereeIds) ? tournament.refereeIds : []
  };
}

function normalizePersonName(value, fallback = "") {
  const text = String(value || "").trim();
  if (!text) return String(fallback || "").trim();
  const lowered = text.toLowerCase();
  if (lowered === "undefined" || lowered === "null") {
    return String(fallback || "").trim();
  }
  return text;
}

function normalizeChallongeOpenMatches(list) {
  return (Array.isArray(list) ? list : []).map((match) => ({
    id: match.id,
    identifier: match.identifier || "",
    round: Number.isFinite(match.round) ? match.round : 0,
    state: match.state || "open",
    player1Id: match.player1Id || "",
    player2Id: match.player2Id || "",
    player1Name: normalizePersonName(match.player1Name, match.player1Id ? `Partecipante ${match.player1Id}` : ""),
    player2Name: normalizePersonName(match.player2Name, match.player2Id ? `Partecipante ${match.player2Id}` : "")
  })).filter((match) => match.id && match.player1Name && match.player2Name);
}

function normalizeChallongeParticipants(list) {
  return (Array.isArray(list) ? list : []).map((participant) => ({
    id: String(participant && participant.id || "").trim(),
    name: normalizePersonName(participant && participant.name, "")
  })).filter((participant) => participant.id && participant.name);
}

function normalizeRefereeRegistry(list) {
  return (list || []).map((ref) => ({
    id: ref.id,
    name: ref.name || "",
    accountDisplayName: ref.accountDisplayName || "",
    email: ref.email || "",
    authUid: ref.authUid || "",
    webPushToken: ref.webPushToken || "",
    webPushTokens: normalizePushTokens(ref.webPushTokens, ref.webPushToken),
    webPushSubscriptions: normalizePushSubscriptions(ref.webPushSubscriptions),
    level: Number.isFinite(ref.level) ? ref.level : 1,
    matchesArbitrated: Number.isFinite(ref.matchesArbitrated) ? ref.matchesArbitrated : 0,
    tournamentsArbitrated: Array.isArray(ref.tournamentsArbitrated) ? ref.tournamentsArbitrated : [],
    exp: Number.isFinite(ref.exp) ? ref.exp : 0
  })).filter((ref) => ref.name);
}

function normalizePushTokens(tokens, legacyToken = "") {
  const merged = [];
  (Array.isArray(tokens) ? tokens : []).forEach((token) => {
    const value = String(token || "").trim();
    if (value && !merged.includes(value)) merged.push(value);
  });
  const fallback = String(legacyToken || "").trim();
  if (fallback && !merged.includes(fallback)) merged.push(fallback);
  return merged;
}

function normalizePushSubscriptions(list) {
  const merged = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((subscription) => {
    if (!subscription || typeof subscription !== "object") return;
    const endpoint = String(subscription.endpoint || "").trim();
    const keys = subscription.keys && typeof subscription.keys === "object" ? subscription.keys : {};
    const p256dh = String(keys.p256dh || "").trim();
    const auth = String(keys.auth || "").trim();
    if (!endpoint || !p256dh || !auth || seen.has(endpoint)) return;
    seen.add(endpoint);
    const expirationTime = subscription.expirationTime == null ? null : Number(subscription.expirationTime);
    merged.push({
      endpoint,
      expirationTime: Number.isFinite(expirationTime) ? expirationTime : null,
      keys: { p256dh, auth }
    });
  });
  return merged;
}

function getRefereeLevelInfo(exp) {
  const thresholds = [
    { level: 8, title: "Master Judge", exp: 1200 },
    { level: 7, title: "Head Judge", exp: 750 },
    { level: 6, title: "Head Judge Candidate", exp: 500 },
    { level: 5, title: "Senior Judge II", exp: 300 },
    { level: 4, title: "Senior Judge I", exp: 150 },
    { level: 3, title: "Junior Judge II", exp: 75 },
    { level: 2, title: "Junior Judge I", exp: 25 },
    { level: 1, title: "Base", exp: 0 }
  ];
  const safeExp = Number.isFinite(exp) ? exp : 0;
  const currentIndex = thresholds.findIndex((t) => safeExp >= t.exp);
  const current = currentIndex === -1 ? thresholds[thresholds.length - 1] : thresholds[currentIndex];
  const next = currentIndex > 0 ? thresholds[currentIndex - 1] : null;
  const expToNext = next ? Math.max(0, next.exp - safeExp) : 0;
  const progressMax = next ? next.exp : current.exp;
  const progressMin = current.exp;
  const progressValue = next ? safeExp : current.exp;
  return {
    level: current.level,
    title: current.title,
    exp: current.exp,
    nextLevel: next ? next.level : null,
    nextTitle: next ? next.title : null,
    expToNext,
    progressMin,
    progressMax,
    progressValue
  };
}

function ensureTournamentRefereeIds(state) {
  state.tournaments.forEach((tournament) => {
    if (!Array.isArray(tournament.refereeIds)) tournament.refereeIds = [];
    const hasIds = tournament.refereeIds.length > 0;
    if (hasIds) return;
    if (!Array.isArray(tournament.referees) || tournament.referees.length === 0) return;
    tournament.referees.forEach((name) => {
      let ref = state.refereesRegistry.find((r) => r.name === name);
      if (!ref) {
        ref = createReferee(name);
        state.refereesRegistry.push(ref);
      }
      if (!tournament.refereeIds.includes(ref.id)) {
        tournament.refereeIds.push(ref.id);
      }
    });
  });
}

function normalizeArena(arena) {
  return {
    id: arena.id,
    name: arena.name,
    status: arena.status || "free",
    refereeId: arena.refereeId || "",
    refereeName: arena.refereeName || "",
    winnerCandidate: arena.winnerCandidate || "",
    lastWinner: arena.lastWinner || arena.winner || "",
    calledAt: arena.calledAt || null,
    match: arena.match || null,
    selectedWinner: arena.selectedWinner || "",
    coinTossResult: arena.coinTossResult || ""
  };
}

function migrateLegacy(parsed) {
  const legacyArenas = Array.isArray(parsed.arenas) ? parsed.arenas : [];
  const legacyReferees = Array.isArray(parsed.referees) ? parsed.referees : [];
  const tournament = createTournament("Torneo 1");
  tournament.arenas = legacyArenas.map(normalizeArena);
  tournament.referees = legacyReferees;
  const state = { tournaments: [tournament], refereesRegistry: [], updatedAt: Date.now() };
  normalizeState(state);
  return state;
}

function findTournament(state, tournamentId) {
  return state.tournaments.find((t) => t.id === tournamentId) || null;
}

function expireCalls(state) {
  const now = Date.now();
  let changed = false;
  state.tournaments.forEach((tournament) => {
    tournament.arenas.forEach((arena) => {
      if (arena.status === "called" && arena.calledAt) {
        if (now - arena.calledAt > CALL_WINDOW_MS) {
          arena.status = "expired";
          arena.calledAt = null;
          changed = true;
        }
      }
    });
  });
  return changed;
}

function notifySubscribers() {
  subscribers.forEach((cb) => cb(loadState()));
}

function initFirestoreSync() {
  if (!hasFirebaseConfig || !hasFirebaseSdk || db) return;
  const cached = loadPersistedRemoteCache();
  if (cached) {
    stateCache = cached;
    syncedStateCache = sanitizeState(cached);
    lastSerialized = JSON.stringify(stateCache);
  }
  const app = firebase.initializeApp(window.FIREBASE_CONFIG);
  db = firebase.firestore(app);
  stateDocRef = db.collection("arena").doc("state");

  emitRealtimeStatus({ online: true, connected: false });
  stateDocRef.onSnapshot((doc) => {
    if (!doc.exists) {
      hasInitialRemoteSnapshot = true;
      emitRealtimeStatus({ online: true, connected: true });
      if (!hasMeaningfulState(stateCache)) {
        stateCache = { tournaments: [], refereesRegistry: [], updatedAt: 0 };
        syncedStateCache = sanitizeState(stateCache);
        persistRemoteCache(stateCache);
      } else {
        pendingStatePolicy = { allowEmptyTournaments: true };
        scheduleWrite(stateCache);
      }
      if (pendingState) scheduleWrite(pendingState);
      notifySubscribers();
      return;
    }
    const data = doc.data();
    const remoteState = normalizeState(data);
    hasInitialRemoteSnapshot = true;
    stateCache = remoteState;
    syncedStateCache = sanitizeState(remoteState);
    persistRemoteCache(stateCache);
    lastSerialized = JSON.stringify(stateCache);
    if (pendingState && (pendingState.updatedAt || 0) > (remoteState.updatedAt || 0)) {
      const mergedPending = mergePendingState(remoteState, pendingState, pendingStatePolicy);
      pendingState = mergedPending;
      stateCache = mergedPending;
      persistRemoteCache(stateCache);
      scheduleWrite(mergedPending);
    } else {
      pendingState = null;
      pendingStatePolicy = { allowEmptyTournaments: false };
    }
    emitRealtimeStatus({ online: true, connected: true });
    notifySubscribers();
  }, (error) => {
    console.error("Firestore snapshot error:", error);
    emitRealtimeStatus({ online: true, connected: false });
  });
}

if (hasFirebaseConfig && hasFirebaseSdk) {
  initFirestoreSync();
}

function sanitizeState(state) {
  try {
    return JSON.parse(JSON.stringify(state));
  } catch (err) {
    console.error("State sanitize error:", err);
    return { tournaments: [], refereesRegistry: [], updatedAt: 0 };
  }
}

function comparableState(state) {
  const comparable = sanitizeState(state);
  comparable.updatedAt = 0;
  return comparable;
}

function sameMeaningfulState(left, right) {
  return JSON.stringify(comparableState(left)) === JSON.stringify(comparableState(right));
}

function emitRealtimeStatus(next) {
  realtimeStatus = next;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("realtime:status", { detail: realtimeStatus }));
  }
}

function scheduleWrite(nextState) {
  if (!stateDocRef || !hasInitialRemoteSnapshot) return;
  const serialized = JSON.stringify(nextState);
  if (serialized === lastSerialized) {
    pendingState = null;
    pendingStatePolicy = { allowEmptyTournaments: false };
    return;
  }
  pendingState = nextState;
  if (pendingWrite) return;
  pendingWrite = setTimeout(() => {
    const payload = pendingState;
    const payloadPolicy = pendingStatePolicy;
    pendingState = null;
    pendingStatePolicy = { allowEmptyTournaments: false };
    pendingWrite = null;
    if (!payload) return;
    const nextSerialized = JSON.stringify(payload);
    if (nextSerialized === lastSerialized) return;
    stateDocRef.set(payload).then(() => {
      lastSerialized = nextSerialized;
      stateCache = payload;
      syncedStateCache = sanitizeState(payload);
      persistRemoteCache(payload);
      pendingStatePolicy = payloadPolicy;
    }).catch((err) => {
      console.error("Firestore write error:", err);
      emitRealtimeStatus({ online: true, connected: false });
    });
  }, 400);
}
