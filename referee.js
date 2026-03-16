const refereeTitle = document.getElementById("refereeTitle");
const refereeSubtitle = document.getElementById("refereeSubtitle");
const refereeProfileCard = document.getElementById("refereeProfileCard");
const assignedArenaList = document.getElementById("assignedArenaList");
const refereeMessage = document.getElementById("refereeMessage");
const logoutBtn = document.getElementById("logoutBtn");

let state = loadState();
let currentUser = null;
let currentReferee = null;
let redirectedArenaKey = "";

function renderRefereeHome() {
  renderProfile();
  assignedArenaList.innerHTML = "";
  refereeMessage.textContent = "";

  if (!currentUser || !currentReferee) {
    refereeTitle.textContent = "Home Arbitro";
    refereeSubtitle.textContent = "Profilo non collegato.";
    refereeMessage.textContent = "Questo account non è ancora associato a un arbitro.";
    return;
  }

  refereeTitle.textContent = `Home Arbitro - ${currentReferee.name}`;
  refereeSubtitle.textContent = currentUser.email || "Account attivo";

  const items = [];
  (state.tournaments || []).forEach((tournament) => {
    (tournament.arenas || []).forEach((arena) => {
      if (arena.refereeId === currentReferee.id) {
        items.push({ tournament, arena });
      }
    });
  });

  if (items.length === 0) {
    refereeMessage.textContent = "Nessuna arena assegnata al momento.";
    return;
  }

  items.forEach(({ tournament, arena }) => {
    const row = document.createElement("div");
    row.className = "list-row";
    const actionHref = `arena.html?tid=${tournament.id}&id=${arena.id}`;
    const actionLabel = arena.status === "called" ? "Apri arena adesso" : "Apri arena";
    row.innerHTML = `
      <strong>${tournament.name}</strong>
      <div class="muted">Arena: ${arena.name}</div>
      <div class="muted">Stato: ${statusLabel(arena.status)}</div>
      <div class="muted">Match: ${arena.match ? `${arena.match.p1} vs ${arena.match.p2}` : "—"}</div>
      <div class="row" style="margin-top:8px;">
        <a class="arena-link" href="${actionHref}">${actionLabel}</a>
      </div>
    `;
    assignedArenaList.appendChild(row);
  });

  const calledItems = items.filter(({ arena }) => arena.status === "called");
  if (calledItems.length === 1) {
    refereeMessage.textContent = `Sei stato chiamato su ${calledItems[0].arena.name}.`;
    const arenaKey = `${calledItems[0].tournament.id}:${calledItems[0].arena.id}`;
    if (redirectedArenaKey !== arenaKey) {
      redirectedArenaKey = arenaKey;
      window.location.href = `arena.html?tid=${calledItems[0].tournament.id}&id=${calledItems[0].arena.id}`;
    }
  } else if (calledItems.length > 1) {
    refereeMessage.textContent = "Hai piu arene chiamate nello stesso momento.";
    redirectedArenaKey = "";
  } else {
    redirectedArenaKey = "";
  }
}

function renderProfile() {
  if (!refereeProfileCard) return;
  if (!currentReferee) {
    refereeProfileCard.innerHTML = `<div class="muted">Profilo non disponibile.</div>`;
    return;
  }

  const levelInfo = getRefereeLevelInfo(currentReferee.exp || 0);
  const progressTotal = Math.max(1, levelInfo.progressMax - levelInfo.progressMin);
  const progressValue = Math.min(progressTotal, Math.max(0, (currentReferee.exp || 0) - levelInfo.progressMin));
  const progressPercent = Math.round((progressValue / progressTotal) * 100);
  const tournamentsCount = Array.isArray(currentReferee.tournamentsArbitrated)
    ? currentReferee.tournamentsArbitrated.length
    : 0;
  const expToNextText = levelInfo.nextLevel
    ? `EXP mancanti al prossimo livello: ${levelInfo.expToNext}`
    : "Livello massimo raggiunto";

  refereeProfileCard.innerHTML = `
    <strong>${currentReferee.name}</strong>
    <div class="muted">Email: ${currentUser && currentUser.email ? currentUser.email : "—"}</div>
    <div class="muted">Livello: Lv. ${levelInfo.level} - ${levelInfo.title}</div>
    <div class="muted">EXP: ${currentReferee.exp || 0}</div>
    <div class="muted">${expToNextText}</div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${progressTotal}" aria-valuenow="${progressValue}">
      <div class="progress-bar" style="width:${progressPercent}%"></div>
    </div>
    <div class="muted" style="margin-top:8px;">Partite arbitrate: ${currentReferee.matchesArbitrated || 0}</div>
    <div class="muted">Tornei arbitrati: ${tournamentsCount}</div>
  `;
}

function statusLabel(status) {
  if (status === "called") return "Chiamata";
  if (status === "occupied") return "Occupata";
  if (status === "standby") return "In attesa";
  if (status === "expired") return "Scaduta";
  return "Libera";
}

function syncReferee(user) {
  currentUser = user;
  if (getUserRole(user) === "admin") {
    window.location.href = "index.html";
    return;
  }
  currentReferee = upsertRefereeAccountProfile(user);
  renderRefereeHome();
}

requireAuthPage({
  message: refereeMessage,
  onUser(user) {
    syncReferee(user);
  }
});

subscribeState((newState) => {
  state = newState;
  if (currentUser) {
    currentReferee = (state.refereesRegistry || []).find((ref) => ref.authUid === currentUser.uid) || currentReferee;
  }
  renderRefereeHome();
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    clearActiveUserRole();
    clearRequestedLoginRole();
    await auth.signOut();
    window.location.href = "login.html";
  });
}

renderRefereeHome();
