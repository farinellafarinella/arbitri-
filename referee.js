const refereeTitle = document.getElementById("refereeTitle");
const refereeSubtitle = document.getElementById("refereeSubtitle");
const refereeProfileCard = document.getElementById("refereeProfileCard");
const refereeNameInput = document.getElementById("refereeNameInput");
const saveRefereeNameBtn = document.getElementById("saveRefereeNameBtn");
const refereeProfileStatus = document.getElementById("refereeProfileStatus");
const pushCard = document.getElementById("pushCard");
const enablePushBtn = document.getElementById("enablePushBtn");
const pushStatus = document.getElementById("pushStatus");
const assignedArenaList = document.getElementById("assignedArenaList");
const refereeMessage = document.getElementById("refereeMessage");
const logoutBtn = document.getElementById("logoutBtn");

let state = loadState();
let currentUser = null;
let currentReferee = null;
let redirectedArenaKey = "";
let pushPublicKeyPromise = null;
let profileStatusMessage = "";
let profileStatusIsError = false;

function notifyEndpoint() {
  return String(window.NOTIFY_ENDPOINT || "/notify");
}

function pushConfigEndpoint() {
  const endpoint = new URL(notifyEndpoint(), window.location.href);
  return `${endpoint.origin}/push-public-key`;
}

function getRegisteredPushSubscriptions(referee = currentReferee) {
  if (!referee) return [];
  return Array.isArray(referee.webPushSubscriptions) ? referee.webPushSubscriptions.filter(Boolean) : [];
}

function normalizePushSubscription(subscription) {
  if (!subscription || typeof subscription !== "object") return null;
  const json = typeof subscription.toJSON === "function" ? subscription.toJSON() : subscription;
  if (!json || typeof json !== "object") return null;
  const endpoint = String(json.endpoint || "").trim();
  const keys = json.keys && typeof json.keys === "object" ? json.keys : {};
  const p256dh = String(keys.p256dh || "").trim();
  const auth = String(keys.auth || "").trim();
  if (!endpoint || !p256dh || !auth) return null;
  return {
    endpoint,
    expirationTime: json.expirationTime == null ? null : Number(json.expirationTime),
    keys: { p256dh, auth }
  };
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

async function getPushPublicKey() {
  if (pushPublicKeyPromise) return pushPublicKeyPromise;
  pushPublicKeyPromise = fetch(pushConfigEndpoint())
    .then((response) => response.json().catch(() => ({})).then((payload) => ({ response, payload })))
    .then(({ response, payload }) => {
      const publicKey = String(payload.publicKey || "").trim();
      if (!response.ok || !payload.ok || !publicKey) {
        throw new Error(payload.error || "Public key notifiche non disponibile.");
      }
      return publicKey;
    })
    .catch((error) => {
      pushPublicKeyPromise = null;
      throw error;
    });
  return pushPublicKeyPromise;
}

async function sendPushTest(subscription) {
  const response = await fetch(notifyEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription,
      title: "Test notifiche",
      body: "Le notifiche push sono attive su questo dispositivo.",
      data: { url: `${window.location.origin}${window.location.pathname}` }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Invio test fallito (${response.status})`);
  }
  return payload;
}

function setProfileStatus(text = "", isError = false) {
  profileStatusMessage = text;
  profileStatusIsError = isError;
  if (!refereeProfileStatus) return;
  refereeProfileStatus.textContent = text || "Usa qui il nome arbitro esatto usato su Challonge.";
  refereeProfileStatus.classList.toggle("error", Boolean(text) && isError);
}

function updateAssignedArenaNames(stateValue, refereeId, nextName, previousName) {
  (stateValue.tournaments || []).forEach((tournament) => {
    (tournament.arenas || []).forEach((arena) => {
      const sameReferee = arena.refereeId === refereeId;
      const legacySameName = !arena.refereeId && previousName && arena.refereeName === previousName;
      if (!sameReferee && !legacySameName) return;
      arena.refereeName = nextName;
      if (!arena.refereeId) arena.refereeId = refereeId;
    });
  });
}

function challongeParticipantNameMap(tournament) {
  const map = new Map();
  if (!tournament) return map;
  const mergedParticipants = [
    ...(Array.isArray(tournament.challongeParticipants) ? tournament.challongeParticipants : []),
    ...(Array.isArray(tournament.challongePlayerMap) ? tournament.challongePlayerMap : [])
  ];
  mergedParticipants.forEach((participant) => {
    const id = String(participant && participant.id || "").trim();
    const name = String(participant && participant.name || "").trim();
    if (!id || !name) return;
    map.set(id, name);
  });
  return map;
}

function resolveArenaMatchNames(tournament, arena) {
  const match = arena && arena.match;
  if (!match) return { player1Name: "", player2Name: "" };
  const participantMap = challongeParticipantNameMap(tournament);
  const player1Id = String(match.challongePlayer1Id || "").trim();
  const player2Id = String(match.challongePlayer2Id || "").trim();
  return {
    player1Name: participantMap.get(player1Id) || String(match.p1 || "").trim(),
    player2Name: participantMap.get(player2Id) || String(match.p2 || "").trim()
  };
}

async function saveRefereeName() {
  if (!currentReferee) return;
  const nextName = String(refereeNameInput && refereeNameInput.value || "").trim();
  if (!nextName) {
    setProfileStatus("Inserisci il nome arbitro esatto usato su Challonge.", true);
    return;
  }
  const latestState = loadState();
  const ref = (latestState.refereesRegistry || []).find((item) => item.id === currentReferee.id);
  if (!ref) {
    setProfileStatus("Profilo arbitro non trovato.", true);
    return;
  }
  const previousName = ref.name || "";
  ref.name = nextName;
  updateAssignedArenaNames(latestState, ref.id, nextName, previousName);
  saveState(latestState);
  state = latestState;
  currentReferee = ref;
  setProfileStatus("Nome arbitro aggiornato.");
  renderRefereeHome();
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
    const matchNames = resolveArenaMatchNames(tournament, arena);
    const row = document.createElement("div");
    row.className = "list-row";
    const actionHref = `arena.html?tid=${tournament.id}&id=${arena.id}`;
    const actionLabel = arena.status === "called" ? "Apri arena adesso" : "Apri arena";
    row.innerHTML = `
      <strong>${tournament.name}</strong>
      <div class="muted">Arena: ${arena.name}</div>
      <div class="muted">Stato: ${statusLabel(arena.status)}</div>
      <div class="muted">Match: ${arena.match ? `${matchNames.player1Name} vs ${matchNames.player2Name}` : "—"}</div>
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
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    window.isSecureContext
  );
}

function pushFeatureEnabled() {
  return false;
}

function vapidConfigured() {
  return false;
}

function renderPushStatus() {
  if (!pushStatus || !enablePushBtn) return;
  if (pushCard) pushCard.style.display = "none";
  if (!pushFeatureEnabled()) {
    pushStatus.textContent = "Notifiche push disattivate.";
    enablePushBtn.disabled = true;
    return;
  }
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
  if (getRegisteredPushSubscriptions().length > 0) {
    pushStatus.textContent = "Notifiche push attive per questo account.";
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
  if (!pushFeatureEnabled() || !currentReferee || !pushSupported() || !vapidConfigured()) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      renderPushStatus();
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const publicKey = await getPushPublicKey();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }
    const normalizedSubscription = normalizePushSubscription(subscription);
    if (!normalizedSubscription) {
      pushStatus.textContent = "Impossibile ottenere la subscription push.";
      return;
    }
    const latestState = loadState();
    const ref = (latestState.refereesRegistry || []).find((item) => item.id === currentReferee.id);
    if (!ref) {
      pushStatus.textContent = "Profilo arbitro non trovato.";
      return;
    }
    const subscriptions = getRegisteredPushSubscriptions(ref);
    const alreadyIndex = subscriptions.findIndex((item) => item.endpoint === normalizedSubscription.endpoint);
    if (alreadyIndex === -1) {
      subscriptions.push(normalizedSubscription);
    } else {
      subscriptions[alreadyIndex] = normalizedSubscription;
    }
    ref.webPushSubscriptions = subscriptions;
    saveState(latestState);
    currentReferee = ref;
    pushStatus.textContent = "Notifiche attive. Invio una notifica di test...";
    await sendPushTest(normalizedSubscription);
    pushStatus.textContent = "Notifiche attive. Test inviato.";
    window.setTimeout(() => {
      renderPushStatus();
    }, 2500);
  } catch (error) {
    pushStatus.textContent = `Errore notifiche push: ${error && error.message ? error.message : "attivazione fallita"}`;
    console.error("Push activation error:", error);
  }
}

async function showForegroundNotification(payload) {
  const title = String(payload && payload.title ? payload.title : "Nuova chiamata");
  const body = String(payload && payload.body ? payload.body : "Apri l'app per vedere i dettagli.");
  const data = payload && payload.data && typeof payload.data === "object" ? payload.data : {};
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, {
    body,
    data,
    icon: "icon.png",
    badge: "icon.png",
    requireInteraction: true
  });
}

function setupForegroundPushListener() {
  if (!pushSupported()) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    const payload = event.data && event.data.type === "push:received" ? event.data.payload : null;
    if (!payload || document.visibilityState !== "visible") return;
    showForegroundNotification(payload).catch(() => {});
  });
}

function renderProfile() {
  if (!refereeProfileCard) return;
  if (!currentReferee) {
    refereeProfileCard.innerHTML = `<div class="muted">Profilo non disponibile.</div>`;
    if (refereeNameInput) {
      refereeNameInput.value = "";
      refereeNameInput.disabled = true;
    }
    if (saveRefereeNameBtn) saveRefereeNameBtn.disabled = true;
    setProfileStatus("");
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
    <div class="muted">Nome account: ${currentReferee.accountDisplayName || currentUser && currentUser.displayName || "—"}</div>
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
  if (refereeNameInput) {
    refereeNameInput.disabled = false;
    refereeNameInput.value = currentReferee.name || "";
  }
  if (saveRefereeNameBtn) saveRefereeNameBtn.disabled = false;
  setProfileStatus(profileStatusMessage, profileStatusIsError);
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

if (saveRefereeNameBtn) {
  saveRefereeNameBtn.addEventListener("click", saveRefereeName);
}

if (refereeNameInput) {
  refereeNameInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    saveRefereeName();
  });
}

setupForegroundPushListener();
renderRefereeHome();
