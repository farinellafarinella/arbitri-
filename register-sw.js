if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const version = "20260320c";
    const basePath = window.location.pathname.replace(/\/[^/]*$/, "/");
    const serviceWorkerUrl = `${basePath}sw.js?v=${version}`;
    let reloadedForController = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadedForController) return;
      reloadedForController = true;
      window.location.reload();
    });
    navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: basePath,
      updateViaCache: "none"
    }).then((registration) => {
      registration.update().catch(() => {});
    }).catch(() => {});
  });
}
