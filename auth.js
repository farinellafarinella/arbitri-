function getFirebaseApp() {
  if (!window.firebase || !window.FIREBASE_CONFIG) return null;
  if (firebase.apps && firebase.apps.length > 0) return firebase.apps[0];
  return firebase.initializeApp(window.FIREBASE_CONFIG);
}

function getFirebaseAuth() {
  const app = getFirebaseApp();
  if (!app || typeof firebase.auth !== "function") return null;
  return firebase.auth(app);
}

function requestedRoleKey() {
  return "requested_login_role";
}

function activeRoleKey() {
  return "active_user_role";
}

function setRequestedLoginRole(role) {
  try {
    sessionStorage.setItem(requestedRoleKey(), role || "referee");
  } catch {
    // ignore
  }
}

function getRequestedLoginRole() {
  try {
    return sessionStorage.getItem(requestedRoleKey()) || "referee";
  } catch {
    return "referee";
  }
}

function clearRequestedLoginRole() {
  try {
    sessionStorage.removeItem(requestedRoleKey());
  } catch {
    // ignore
  }
}

function setActiveUserRole(role) {
  try {
    sessionStorage.setItem(activeRoleKey(), role || "referee");
  } catch {
    // ignore
  }
}

function getActiveUserRole() {
  try {
    return sessionStorage.getItem(activeRoleKey()) || "referee";
  } catch {
    return "referee";
  }
}

function clearActiveUserRole() {
  try {
    sessionStorage.removeItem(activeRoleKey());
  } catch {
    // ignore
  }
}

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function getUserRole(user) {
  if (!user) return "referee";
  return getActiveUserRole();
}

function landingPageForRole(role) {
  return role === "admin" ? "index.html" : "referee.html";
}

async function validateRequestedRole(user, auth, requestedRole) {
  if (!user) return "referee";
  const actualRole = requestedRole || "referee";
  setActiveUserRole(actualRole);
  return actualRole;
}

function authEnabled() {
  return Boolean(getFirebaseAuth());
}

function setProtectedPageVisible(visible) {
  if (!document.body) return;
  document.body.style.visibility = visible ? "visible" : "hidden";
}

function requireAuthPage(elements) {
  const auth = getFirebaseAuth();
  setProtectedPageVisible(false);
  if (!auth) {
    if (elements.message) elements.message.textContent = "Firebase Auth non disponibile.";
    setProtectedPageVisible(true);
    return;
  }
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    runWhenRemoteStateReady(() => {
      setProtectedPageVisible(true);
      if (typeof elements.onUser === "function") {
        elements.onUser(user);
      }
    });
  });
}

function requireRole(options) {
  const auth = getFirebaseAuth();
  setProtectedPageVisible(false);
  if (!auth) {
    if (options.message) options.message.textContent = "Firebase Auth non disponibile.";
    setProtectedPageVisible(true);
    return;
  }
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    const role = getUserRole(user);
    const allowedRoles = options.roles || [];
    if (!allowedRoles.includes(role)) {
      window.location.href = role === "admin" ? "index.html" : "referee.html";
      return;
    }
    runWhenRemoteStateReady(() => {
      setProtectedPageVisible(true);
      if (typeof options.onUser === "function") {
        options.onUser(user, role);
      }
    });
  });
}

function runWhenRemoteStateReady(callback) {
  if (!isOnlineMode() || isRemoteStateReady()) {
    callback();
    return;
  }
  const handleReady = () => {
    if (!isRemoteStateReady()) return;
    window.removeEventListener("realtime:status", handleReady);
    callback();
  };
  window.addEventListener("realtime:status", handleReady);
}

function upsertRefereeAccountProfile(user, displayName) {
  if (!user) return null;
  if (getUserRole(user) === "admin") return null;
  const state = loadState();
  const registry = state.refereesRegistry || [];
  const normalizedEmail = normalizeEmail(user.email);
  const normalizedName = (displayName || user.displayName || "").trim();
  let changed = false;

  let referee = registry.find((ref) => ref.authUid === user.uid);
  if (!referee && normalizedEmail) {
    referee = registry.find((ref) => (ref.email || "").trim().toLowerCase() === normalizedEmail);
  }
  if (!referee && normalizedName) {
    referee = registry.find((ref) => ref.name.trim().toLowerCase() === normalizedName.toLowerCase());
  }

  if (!referee && isOnlineMode() && !isRemoteStateReady()) {
    return null;
  }

  if (!referee) {
    referee = createReferee(normalizedName || normalizedEmail || "Arbitro");
    registry.push(referee);
    changed = true;
  }

  if (referee.authUid !== user.uid) {
    referee.authUid = user.uid;
    changed = true;
  }
  const nextEmail = user.email || referee.email || "";
  if (referee.email !== nextEmail) {
    referee.email = nextEmail;
    changed = true;
  }
  if (normalizedName) {
    if (referee.accountDisplayName !== normalizedName) {
      referee.accountDisplayName = normalizedName;
      changed = true;
    }
    if (!referee.name) {
      referee.name = normalizedName;
      changed = true;
    }
  }

  if (changed) saveState(state);
  return referee;
}
