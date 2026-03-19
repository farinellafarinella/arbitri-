const tournamentNameInput = document.getElementById("tournamentName");
const tournamentLinkInput = document.getElementById("tournamentLink");
const addTournamentBtn = document.getElementById("addTournamentBtn");
const tournamentList = document.getElementById("tournamentList");
const registryRefereeList = document.getElementById("registryRefereeList");
const registryRefereeMessage = document.getElementById("registryRefereeMessage");
const toggleRegistryBtn = document.getElementById("toggleRegistryBtn");
const registryPanelBody = document.getElementById("registryPanelBody");

let state = loadState();
if (!state.tournaments) state = { tournaments: [] };
let currentUser = null;

function renderRegistry() {
  if (!registryRefereeList) return;
  registryRefereeList.innerHTML = "";
  registryRefereeMessage.textContent = "";
  const list = (state.refereesRegistry || []).filter((ref) => ref.authUid);
  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Nessun arbitro ha ancora fatto login.";
    registryRefereeList.appendChild(empty);
    return;
  }
  list.forEach((ref) => {
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
      <div class="muted">Account: collegato</div>
      <div class="muted">Livello: Lv. ${levelInfo.level} - ${levelInfo.title}</div>
      <div class="muted">Partite arbitrate: ${ref.matchesArbitrated || 0}</div>
      <div class="muted">Tornei arbitrati: ${Array.isArray(ref.tournamentsArbitrated) ? ref.tournamentsArbitrated.length : 0}</div>
      <div class="muted">EXP: ${ref.exp || 0}</div>
      <div class="muted">${expToNextText}</div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${progressTotal}" aria-valuenow="${progressValue}">
        <div class="progress-bar" style="width:${progressPercent}%"></div>
      </div>
      <div class="row" style="margin-top:8px;">
        <button type="button" class="danger-btn remove-registry-ref" data-id="${ref.id}">Rimuovi</button>
      </div>
    `;
    registryRefereeList.appendChild(row);
  });
}

function render() {
  renderRegistry();
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
      <div class="muted">Challonge: ${tournament.challongeUrl ? tournament.challongeUrl : "—"}</div>
      <div class="row" style="margin-top:8px;">
        <a class="arena-link" href="${href}">Apri gestione</a>
        <button type="button" class="danger-btn remove-tournament-btn" data-id="${tournament.id}">Elimina</button>
      </div>
    `;
    tournamentList.appendChild(row);
  });

}

addTournamentBtn.addEventListener("click", () => {
  const name = tournamentNameInput.value.trim();
  if (!name) return;
  if (!state.tournaments) state.tournaments = [];
  const challongeUrl = tournamentLinkInput.value.trim();
  state.tournaments.push(createTournament(name, challongeUrl));
  saveState(state);
  render();
  tournamentNameInput.value = "";
  tournamentLinkInput.value = "";
});

if (toggleRegistryBtn && registryPanelBody) {
  toggleRegistryBtn.addEventListener("click", () => {
    const isHidden = registryPanelBody.classList.contains("hidden");
    registryPanelBody.classList.toggle("hidden");
    toggleRegistryBtn.textContent = isHidden ? "Nascondi albo" : "Mostra albo";
  });
}

if (registryRefereeList) {
  registryRefereeList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("remove-registry-ref")) return;
    const refId = target.dataset.id;
    if (!refId) return;
    const ok = window.confirm("Rimuovere l'arbitro dall'albo?");
    if (!ok) return;
    const removedRef = (state.refereesRegistry || []).find((ref) => ref.id === refId);
    state.refereesRegistry = (state.refereesRegistry || []).filter((ref) => ref.id !== refId);
    state.tournaments = (state.tournaments || []).map((tournament) => {
      const ids = Array.isArray(tournament.refereeIds) ? tournament.refereeIds : [];
      tournament.refereeIds = ids.filter((id) => id !== refId);
      tournament.arenas.forEach((arena) => {
        if (removedRef && (arena.refereeId === removedRef.id || arena.refereeName === removedRef.name)) {
          arena.refereeId = "";
          arena.refereeName = "";
        }
      });
      return tournament;
    });
    saveState(state);
    render();
  });
}

tournamentList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest(".remove-tournament-btn");
  if (!button) return;
  event.preventDefault();
  const tournamentId = button.dataset.id;
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
  if (!state.refereesRegistry) state.refereesRegistry = [];
  render();
});

requireRole({
  roles: ["admin"],
  message: registryRefereeMessage,
  onUser(user) {
    currentUser = user;
    render();
  }
});
