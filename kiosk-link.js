const kioskLink = document.getElementById("kioskLink");
const copyKioskLinkBtn = document.getElementById("copyKioskLinkBtn");
const copyKioskLinkMessage = document.getElementById("copyKioskLinkMessage");

function kioskUrl() {
  const params = new URLSearchParams(window.location.search);
  const tid = params.get("id");
  const path = tid ? `kiosk.html?tid=${tid}` : "kiosk.html";
  return new URL(path, window.location.href).toString();
}

if (kioskLink) {
  kioskLink.href = kioskUrl();
}

if (copyKioskLinkBtn) {
  copyKioskLinkBtn.addEventListener("click", async () => {
    const url = kioskUrl();
    try {
      await navigator.clipboard.writeText(url);
      if (copyKioskLinkMessage) {
        copyKioskLinkMessage.textContent = "Link kiosk copiato.";
      }
    } catch {
      if (copyKioskLinkMessage) {
        copyKioskLinkMessage.textContent = "Impossibile copiare il link.";
        copyKioskLinkMessage.classList.add("error");
      }
    }
  });
}
