if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const basePath = window.location.pathname.replace(/\/[^/]*$/, "/");
    const serviceWorkerUrl = `${basePath}sw.js`;
    navigator.serviceWorker.register(serviceWorkerUrl, { scope: basePath }).then((registration) => {
      registration.update().catch(() => {});
    }).catch(() => {});
  });
}
