const STORAGE_KEY = "arena_state_v2";
const CALL_WINDOW_MS = 5 * 60 * 1000;

const hasFirebaseConfig = typeof window !== "undefined" && window.FIREBASE_CONFIG;
const hasFirebaseSdk = typeof window !== "undefined" && window.firebase && typeof window.firebase.initializeApp === "function";
let stateCache = { tournaments: [] };
const subscribers = [];
let db = null;
let stateDocRef = null;
let realtimeStatus = { online: false, connected: false };
let pendingWrite = null;
let pendingState = null;
let lastSerialized = "";

function loadState() {
  if (hasFirebaseConfig && hasFirebaseSdk) return stateCache;
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

function saveState(state) {
  if (hasFirebaseConfig && hasFirebaseSdk) {
    const normalized = normalizeState(state);
    const sanitized = sanitizeState(normalized);
    stateCache = sanitized;
    scheduleWrite(sanitized);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    players: [],
    arenas: [],
    referees: [],
    refereeIds: [],
    refereeRatings: {}
  };
}

function createReferee(name, level = 1) {
  return {
    id: `ref-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name,
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
  if (!state.refereesRegistry) state.refereesRegistry = [];
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

function normalizeTournament(tournament) {
  return {
    id: tournament.id,
    name: tournament.name,
    challongeUrl: tournament.challongeUrl || "",
    players: Array.isArray(tournament.players) ? tournament.players : [],
    arenas: (tournament.arenas || []).map(normalizeArena),
    referees: tournament.referees || [],
    refereeIds: Array.isArray(tournament.refereeIds) ? tournament.refereeIds : [],
    refereeRatings: normalizeRefereeRatings(tournament.refereeRatings || {})
  };
}

function normalizeRefereeRegistry(list) {
  return (list || []).map((ref) => ({
    id: ref.id,
    name: ref.name || "",
    level: Number.isFinite(ref.level) ? ref.level : 1,
    matchesArbitrated: Number.isFinite(ref.matchesArbitrated) ? ref.matchesArbitrated : 0,
    tournamentsArbitrated: Array.isArray(ref.tournamentsArbitrated) ? ref.tournamentsArbitrated : [],
    exp: Number.isFinite(ref.exp) ? ref.exp : 0,
    ratingTotal: Number.isFinite(ref.ratingTotal) ? ref.ratingTotal : 0,
    ratingCount: Number.isFinite(ref.ratingCount) ? ref.ratingCount : 0
  })).filter((ref) => ref.name);
}

function normalizeRefereeRatings(ratings) {
  const next = {};
  Object.keys(ratings || {}).forEach((refId) => {
    const entry = ratings[refId] || {};
    next[refId] = {
      total: Number.isFinite(entry.total) ? entry.total : 0,
      count: Number.isFinite(entry.count) ? entry.count : 0
    };
  });
  return next;
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
  const state = { tournaments: [tournament], refereesRegistry: [] };
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
  const app = firebase.initializeApp(window.FIREBASE_CONFIG);
  db = firebase.firestore(app);
  stateDocRef = db.collection("arena").doc("state");

  emitRealtimeStatus({ online: true, connected: false });
  stateDocRef.onSnapshot((doc) => {
    if (!doc.exists) {
      stateCache = { tournaments: [] };
      emitRealtimeStatus({ online: true, connected: true });
      notifySubscribers();
      return;
    }
    const data = doc.data();
    stateCache = normalizeState(data);
    lastSerialized = JSON.stringify(stateCache);
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
    return { tournaments: [] };
  }
}

function emitRealtimeStatus(next) {
  realtimeStatus = next;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("realtime:status", { detail: realtimeStatus }));
  }
}

function scheduleWrite(nextState) {
  if (!stateDocRef) return;
  const serialized = JSON.stringify(nextState);
  if (serialized === lastSerialized) return;
  pendingState = nextState;
  if (pendingWrite) return;
  pendingWrite = setTimeout(() => {
    const payload = pendingState;
    pendingState = null;
    pendingWrite = null;
    if (!payload) return;
    const nextSerialized = JSON.stringify(payload);
    if (nextSerialized === lastSerialized) return;
    stateDocRef.set(payload).then(() => {
      lastSerialized = nextSerialized;
    }).catch((err) => {
      console.error("Firestore write error:", err);
      emitRealtimeStatus({ online: true, connected: false });
    });
  }, 400);
}
