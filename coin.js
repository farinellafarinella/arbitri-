const coinTitle = document.getElementById("coinTitle");
const coinStatus = document.getElementById("coinStatus");
const coinToss = document.getElementById("coinToss");
const coinLeft = document.getElementById("coinLeft");
const coinRight = document.getElementById("coinRight");
const tossBtn = document.getElementById("tossBtn");
const tossMessage = document.getElementById("tossMessage");
const backToArena = document.getElementById("backToArena");

const params = new URLSearchParams(window.location.search);
const arenaId = params.get("id");
const tournamentId = params.get("tid");

let state = loadState();
let tournament = null;
let currentArena = null;

function updateUI() {
  if (!currentArena) {
    coinTitle.textContent = "Arena non trovata";
    coinStatus.textContent = "Stato: —";
    coinLeft.textContent = "—";
    coinRight.textContent = "—";
    tossBtn.disabled = true;
    return;
  }

  coinTitle.textContent = currentArena.name;
  coinStatus.textContent = `Stato: ${statusLabel(currentArena.status)}`;

  if (!currentArena.match) {
    coinLeft.textContent = "—";
    coinRight.textContent = "—";
    tossBtn.disabled = true;
    tossMessage.textContent = "Nessun match caricato.";
    return;
  }

  coinLeft.textContent = currentArena.match.p1;
  coinRight.textContent = currentArena.match.p2;

  const canToss = currentArena.status === "occupied";
  tossBtn.disabled = !canToss;
  tossMessage.textContent = canToss ? "" : "La partita deve essere iniziata.";
}

function loadArena() {
  state = loadState();
  tournament = findTournament(state, tournamentId);
  currentArena = tournament ? tournament.arenas.find((a) => a.id === arenaId) : null;
  updateUI();
}

function saveArena() {
  if (!tournament || !currentArena) return;
  const index = tournament.arenas.findIndex((a) => a.id === currentArena.id);
  if (index !== -1) {
    tournament.arenas[index] = currentArena;
  }
  normalizeState(state);
  saveState(state);
  updateUI();
}

function clearSelection() {
  coinLeft.classList.remove("winner");
  coinRight.classList.remove("winner");
}

function toss() {
  if (!currentArena || !currentArena.match) return;
  const p1 = currentArena.match.p1;
  const p2 = currentArena.match.p2;
  if (!p1 || !p2) return;
  clearSelection();
  coinToss.classList.remove("tossing");
  void coinToss.offsetWidth;
  coinToss.classList.add("tossing");

  const flashes = 8;
  let step = 0;
  const interval = setInterval(() => {
    step += 1;
    if (step % 2 === 0) {
      coinLeft.classList.add("winner");
      coinRight.classList.remove("winner");
    } else {
      coinRight.classList.add("winner");
      coinLeft.classList.remove("winner");
    }
    if (step >= flashes) {
      clearInterval(interval);
      setTimeout(() => {
        const side = Math.random() < 0.5 ? p1 : p2;
        currentArena.coinTossResult = side;
        if (side === p1) {
          coinLeft.classList.add("winner");
          coinRight.classList.remove("winner");
        } else {
          coinRight.classList.add("winner");
          coinLeft.classList.remove("winner");
        }
        coinToss.classList.remove("tossing");
        saveArena();
      }, 250);
    }
  }, 160);
}

function statusLabel(status) {
  if (status === "called") return "Chiamata";
  if (status === "occupied") return "Occupata";
  if (status === "standby") return "In attesa";
  return "Libera";
}

if (backToArena) {
  backToArena.href = tournamentId ? `arena.html?tid=${tournamentId}&id=${arenaId}` : "arena.html";
}

tossBtn.addEventListener("click", toss);

subscribeState((newState) => {
  state = newState;
  tournament = findTournament(state, tournamentId);
  currentArena = tournament ? tournament.arenas.find((a) => a.id === arenaId) : null;
  updateUI();
});

loadArena();
