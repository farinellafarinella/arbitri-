(function () {
  const el = document.getElementById("connectionStatus");
  if (!el) return;

  function setStatus({ online, connected }) {
    if (!online) {
      el.textContent = "Locale";
      el.classList.add("ok");
      return;
    }
    el.textContent = connected ? "Online" : "Online";
    el.classList.add("ok");
  }

  window.addEventListener("realtime:status", (event) => {
    setStatus(event.detail || { online: false, connected: false });
  });

  const online = typeof window.FIREBASE_CONFIG !== "undefined";
  setStatus({ online, connected: false });
})();
