const refereeTitle = document.getElementById("refereeTitle");
const refereeSubtitle = document.getElementById("refereeSubtitle");
const refereeProfileCard = document.getElementById("refereeProfileCard");
const enablePushBtn = document.getElementById("enablePushBtn");
const pushStatus = document.getElementById("pushStatus");
const assignedArenaList = document.getElementById("assignedArenaList");
const refereeMessage = document.getElementById("refereeMessage");
const logoutBtn = document.getElementById("logoutBtn");

let state = loadState();
let currentUser = null;
let currentReferee = null;
let redirectedArenaKey = "";

function getRegisteredPushTokens(referee = currentReferee) {
  if (!referee) return [];
  const tokens = Array.isArray(referee.webPushTokens) ? referee.webPushTokens : [];
  if (tokens.length > 0) return tokens.filter(Boolean);
  return [referee.webPushToken].filter(Boolean);
}

function renderRefereeHome() {
  renderProfile();
  renderPushStatus();
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

function pushSupported() {
  return Boolean(
    window.firebase &&
    typeof firebase.messaging === "function" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function vapidConfigured() {
  return Boolean(window.FCM_WEB_VAPID_KEY && window.FCM_WEB_VAPID_KEY !== "inserisci-vapid-public-key");
}

function renderPushStatus() {
  if (!pushStatus || !enablePushBtn) return;
  if (!pushSupported()) {
    pushStatus.textContent = "Questo dispositivo/browser non supporta le notifiche push web.";
    enablePushBtn.disabled = true;
    return;
  }
  if (!vapidConfigured()) {
    pushStatus.textContent = "Manca la VAPID key web in configurazione.";
    enablePushBtn.disabled = true;
    return;
  }
  if (!currentReferee) {
    pushStatus.textContent = "Profilo arbitro non disponibile.";
    enablePushBtn.disabled = true;
    return;
  }
  if (getRegisteredPushTokens().length > 0) {
    pushStatus.textContent = "Notifiche push attive su questo dispositivo/account.";
    enablePushBtn.disabled = false;
    enablePushBtn.textContent = "Aggiorna notifiche";
    return;
  }
  if (Notification.permission === "denied") {
    pushStatus.textContent = "Notifiche bloccate dal browser/dispositivo.";
    enablePushBtn.disabled = true;
    return;
  }
  pushStatus.textContent = "Attiva le notifiche push per ricevere la chiamata arena.";
  enablePushBtn.disabled = false;
  enablePushBtn.textContent = "Attiva notifiche sul telefono";
}

async function enablePushNotifications() {
  if (!currentReferee || !pushSupported() || !vapidConfigured()) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      renderPushStatus();
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const messaging = firebase.messaging();
    const token = await messaging.getToken({
      vapidKey: window.FCM_WEB_VAPID_KEY,
      serviceWorkerRegistration: registration
    });
    if (!token) {
      pushStatus.textContent = "Impossibile ottenere il token push.";
      return;
    }
    const latestState = loadState();
    const ref = (latestState.refereesRegistry || []).find((item) => item.id === currentReferee.id);
    if (!ref) {
      pushStatus.textContent = "Profilo arbitro non trovato.";
      return;
    }
    const tokens = getRegisteredPushTokens(ref);
    if (!tokens.includes(token)) tokens.push(token);
    ref.webPushToken = token;
    ref.webPushTokens = tokens;
    saveState(latestState);
    currentReferee = ref;
    renderPushStatus();
  } catch (error) {
    pushStatus.textContent = "Errore nell'attivazione delle notifiche push.";
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
  currentReferee = upsertRefereeAccountProfile(user) || currentReferee;
  renderRefereeHome();
}

function setupForegroundPushListener() {
  if (!pushSupported()) return;
  try {
    const messaging = firebase.messaging();
    if (!messaging || typeof messaging.onMessage !== "function") return;
    messaging.onMessage(async (payload) => {
      const title = (payload.notification && payload.notification.title) || "Nuova chiamata";
      const body = (payload.notification && payload.notification.body) || "Apri l'app per vedere i dettagli.";
      const data = payload.data || {};
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, { body, data });
    });
  } catch {
    // ignore foreground push setup failures
  }
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
    if (!currentReferee && isRemoteStateReady()) {
      currentReferee = upsertRefereeAccountProfile(currentUser, currentUser.displayName || "");
    }
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

if (enablePushBtn) {
  enablePushBtn.addEventListener("click", enablePushNotifications);
}

setupForegroundPushListener();
renderRefereeHome();
