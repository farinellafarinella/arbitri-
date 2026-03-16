const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginAsAdmin = document.getElementById("loginAsAdmin");
const registerName = document.getElementById("registerName");
const registerEmail = document.getElementById("registerEmail");
const registerPassword = document.getElementById("registerPassword");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const loginMessage = document.getElementById("loginMessage");

const auth = getFirebaseAuth();

function setMessage(text, isError = false) {
  loginMessage.textContent = text;
  loginMessage.classList.toggle("error", isError);
}

function emailValue() {
  return (loginEmail.value || "").trim();
}

function passwordValue() {
  return loginPassword.value || "";
}

function registerNameValue() {
  return (registerName.value || "").trim();
}

function registerEmailValue() {
  return (registerEmail.value || "").trim();
}

function registerPasswordValue() {
  return registerPassword.value || "";
}

function requestedRole() {
  return loginAsAdmin && loginAsAdmin.checked ? "admin" : "referee";
}

async function completeProfile(user) {
  const wantedRole = requestedRole();
  setRequestedLoginRole(wantedRole);
  const actualRole = await validateRequestedRole(user, auth, wantedRole);
  clearRequestedLoginRole();
  window.location.href = landingPageForRole(actualRole);
}

async function loginWithPassword() {
  if (!auth) return setMessage("Firebase Auth non disponibile.", true);
  try {
    setMessage("Accesso in corso...");
    setRequestedLoginRole(requestedRole());
    const result = await auth.signInWithEmailAndPassword(emailValue(), passwordValue());
    await completeProfile(result.user);
  } catch (error) {
    setMessage(error.message || "Login fallito.", true);
  }
}

async function registerWithPassword() {
  if (!auth) return setMessage("Firebase Auth non disponibile.", true);
  try {
    const name = registerNameValue();
    const email = registerEmailValue();
    const password = registerPasswordValue();
    if (!name) return setMessage("Inserisci il nome arbitro.", true);
    if (!email) return setMessage("Inserisci la email.", true);
    if (!password) return setMessage("Inserisci la password.", true);
    setMessage("Registrazione in corso...");
    setRequestedLoginRole("referee");
    const result = await auth.createUserWithEmailAndPassword(email, password);
    if (result.user && result.user.updateProfile) {
      await result.user.updateProfile({ displayName: name });
    }
    upsertRefereeAccountProfile(auth.currentUser || result.user, name);
    clearRequestedLoginRole();
    window.location.href = "referee.html";
  } catch (error) {
    setMessage(error.message || "Registrazione fallita.", true);
  }
}

if (loginBtn) loginBtn.addEventListener("click", loginWithPassword);
if (registerBtn) registerBtn.addEventListener("click", registerWithPassword);

if (auth) {
  auth.onAuthStateChanged((user) => {
    if (user) {
      const actualRole = getRequestedLoginRole() || getActiveUserRole();
      setActiveUserRole(actualRole);
      if (actualRole !== "admin") {
        upsertRefereeAccountProfile(user, registerNameValue() || user.displayName || "");
      }
      clearRequestedLoginRole();
      window.location.href = landingPageForRole(actualRole);
    }
  });
}
