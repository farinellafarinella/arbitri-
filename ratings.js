const ratingsTitle = document.getElementById("ratingsTitle");
const ratingsList = document.getElementById("ratingsList");
const ratingsMessage = document.getElementById("ratingsMessage");

const params = new URLSearchParams(window.location.search);
const tournamentId = params.get("tid");

let state = loadState();
let tournament = findTournament(state, tournamentId);

function voteKey() {
  return `ratings_voted_${tournamentId}`;
}

function hasVoted() {
  if (!tournamentId) return false;
  return localStorage.getItem(voteKey()) === "1";
}

function setVoted() {
  if (!tournamentId) return;
  localStorage.setItem(voteKey(), "1");
}

function average(total, count) {
  if (!count) return 0;
  return Math.round((total / count) * 10) / 10;
}

function render() {
  ratingsList.innerHTML = "";
  ratingsMessage.textContent = "";

  if (!tournamentId || !tournament) {
    ratingsTitle.textContent = "Torneo non trovato";
    ratingsMessage.textContent = "ID torneo mancante o non valido.";
    return;
  }

  ratingsTitle.textContent = `Valuta arbitri - ${tournament.name}`;

  const registry = state.refereesRegistry || [];
  const ids = Array.isArray(tournament.refereeIds) ? tournament.refereeIds : [];
  const refs = ids.map((id) => registry.find((ref) => ref.id === id)).filter(Boolean);

  if (refs.length === 0) {
    ratingsMessage.textContent = "Nessun arbitro associato al torneo.";
    return;
  }

  const voted = hasVoted();
  if (voted) {
    ratingsMessage.textContent = "Hai già votato da questo dispositivo.";
  }

  refs.forEach((ref) => {
    const ratings = (tournament.refereeRatings && tournament.refereeRatings[ref.id]) || { total: 0, count: 0 };
    const avgTournament = average(ratings.total, ratings.count);
    const avgGlobal = average(ref.ratingTotal || 0, ref.ratingCount || 0);
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <strong>${ref.name}</strong>
      <div class="muted">Media torneo: ${avgTournament || 0} / 5</div>
      <div class="muted">Media globale: ${avgGlobal || 0} / 5</div>
      <div class="row" style="gap:6px; margin-top:8px;">
        ${[1, 2, 3, 4, 5]
          .map((value) => `<button class="star-btn" data-id="${ref.id}" data-value="${value}" ${voted ? "disabled" : ""}>${value}★</button>`)
          .join("")}
      </div>
    `;
    ratingsList.appendChild(row);
  });
}

ratingsList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.classList.contains("star-btn")) return;
  if (hasVoted()) return;
  const refId = target.dataset.id;
  const value = Number(target.dataset.value);
  if (!refId || !Number.isFinite(value)) return;
  if (!tournament || !tournament.refereeRatings) return;
  const registry = state.refereesRegistry || [];
  const ref = registry.find((r) => r.id === refId);
  if (!ref) return;

  if (!tournament.refereeRatings[refId]) {
    tournament.refereeRatings[refId] = { total: 0, count: 0 };
  }
  tournament.refereeRatings[refId].total += value;
  tournament.refereeRatings[refId].count += 1;
  ref.ratingTotal = (ref.ratingTotal || 0) + value;
  ref.ratingCount = (ref.ratingCount || 0) + 1;

  setVoted();
  saveState(state);
  render();
});

subscribeState((newState) => {
  state = newState;
  tournament = findTournament(state, tournamentId);
  render();
});

render();
