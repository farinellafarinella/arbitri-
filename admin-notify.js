const notificationBtn = document.getElementById("sendNotifyBtn");
const notificationMsg = document.getElementById("notifyMessage");

async function sendNotification(arena, token, message) {
  if (!arena || !arena.refereeName) return;
  if (!token) {
    notificationMsg.textContent = "Token arbitro non trovato.";
    notificationMsg.classList.add("error");
    return;
  }
  notificationMsg.textContent = "";
  notificationMsg.classList.remove("error");
  const res = await fetch("/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      title: "Chiamata Arena",
      body: message || `Sei stato chiamato in ${arena.name}`
    })
  });
  if (!res.ok) {
    notificationMsg.textContent = "Errore invio notifica";
    notificationMsg.classList.add("error");
  } else {
    notificationMsg.textContent = "Notifica inviata";
  }
}

window.AdminNotify = { sendNotification };
