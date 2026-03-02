const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, "public")));

function defaultState() {
  return { tournaments: [] };
}

function loadState() {
  try {
    if (!fs.existsSync(DATA_FILE)) return defaultState();
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

function normalizeState(state) {
  if (!state || !Array.isArray(state.tournaments)) {
    return defaultState();
  }
  state.tournaments = state.tournaments.map((t) => normalizeTournament(t));
  normalizeCalls(state);
  return state;
}

function normalizeTournament(t) {
  return {
    id: t.id,
    name: t.name,
    arenas: Array.isArray(t.arenas) ? t.arenas.map(normalizeArena) : [],
    referees: Array.isArray(t.referees) ? t.referees : []
  };
}

function normalizeArena(a) {
  return {
    id: a.id,
    name: a.name,
    status: a.status || "free",
    refereeName: a.refereeName || "",
    winnerCandidate: a.winnerCandidate || "",
    lastWinner: a.lastWinner || a.winner || "",
    calledAt: a.calledAt || null
  };
}

const CALL_WINDOW_MS = 5 * 60 * 1000;
function normalizeCalls(state) {
  const now = Date.now();
  state.tournaments.forEach((t) => {
    t.arenas.forEach((a) => {
      if (a.status === "called" && a.calledAt && now - a.calledAt > CALL_WINDOW_MS) {
        a.status = "free";
        a.calledAt = null;
      }
    });
  });
}

let state = loadState();

io.on("connection", (socket) => {
  socket.emit("state:full", state);

  socket.on("state:get", () => {
    socket.emit("state:full", state);
  });

  socket.on("state:update", (nextState) => {
    state = normalizeState(nextState);
    saveState(state);
    io.emit("state:full", state);
  });
});

server.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});
