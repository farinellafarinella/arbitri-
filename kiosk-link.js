const kioskLink = document.getElementById("kioskLink");
if (kioskLink) {
  const params = new URLSearchParams(window.location.search);
  const tid = params.get("id");
  if (tid) {
    kioskLink.href = `kiosk.html?tid=${tid}`;
  } else {
    kioskLink.href = "kiosk.html";
  }
}
