if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const version = "20260319p";
    const basePath = window.location.pathname.replace(/\/[^/]*$/, "/");
    const serviceWorkerUrl = `${basePath}sw.js?v=${version}`;
    navigator.serviceWorker.register(serviceWorkerUrl, { scope: basePath }).then((registration) => {
      registration.update().catch(() => {});
    }).catch(() => {});
  });
}
