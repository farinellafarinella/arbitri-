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

function createTournament(name) {
  return {
    id: `tournament-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name,
    arenas: [],
    referees: []
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
    selectedWinner: ""
  };
}

function normalizeState(state) {
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
    arenas: (tournament.arenas || []).map(normalizeArena),
    referees: tournament.referees || []
  };
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
    selectedWinner: arena.selectedWinner || ""
  };
}

function migrateLegacy(parsed) {
  const legacyArenas = Array.isArray(parsed.arenas) ? parsed.arenas : [];
  const legacyReferees = Array.isArray(parsed.referees) ? parsed.referees : [];
  const tournament = createTournament("Torneo 1");
  tournament.arenas = legacyArenas.map(normalizeArena);
  tournament.referees = legacyReferees;
  const state = { tournaments: [tournament] };
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
          arena.status = "free";
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
