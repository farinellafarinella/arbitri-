const tournamentNameInput = document.getElementById("tournamentName");
const addTournamentBtn = document.getElementById("addTournamentBtn");
const tournamentList = document.getElementById("tournamentList");

let state = loadState();
if (!state.tournaments) state = { tournaments: [] };

function render() {
  tournamentList.innerHTML = "";
  if (state.tournaments.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Nessun torneo creato.";
    tournamentList.appendChild(empty);
    return;
  }

  state.tournaments.forEach((tournament) => {
    const basePath = window.location.pathname.replace(/\/[^/]*$/, "/");
    const href = `${basePath}tournament.html?id=${tournament.id}`;
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <strong>${tournament.name}</strong>
      <div class="row" style="margin-top:8px;">
        <a class="arena-link" href="${href}">Apri gestione</a>
        <button class="danger-btn" data-id="${tournament.id}">Elimina</button>
      </div>
    `;
    tournamentList.appendChild(row);
  });
}

addTournamentBtn.addEventListener("click", () => {
  const name = tournamentNameInput.value.trim();
  if (!name) return;
  if (!state.tournaments) state.tournaments = [];
  state.tournaments.push(createTournament(name));
  saveState(state);
  render();
  tournamentNameInput.value = "";
});

tournamentList.addEventListener("click", (event) => {
  const target = event.target;
  if (!target.classList.contains("danger-btn")) return;
  const tournamentId = target.dataset.id;
  const tournament = state.tournaments.find((t) => t.id === tournamentId);
  if (!tournament) return;
  const ok = window.confirm(`Eliminare definitivamente il torneo \"${tournament.name}\"?`);
  if (!ok) return;
  state.tournaments = state.tournaments.filter((t) => t.id !== tournamentId);
  saveState(state);
  render();
});

subscribeState((newState) => {
  state = newState;
  if (!state.tournaments) state = { tournaments: [] };
  render();
});

render();
