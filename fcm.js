/* global firebase */
let messaging = null;
let currentToken = "";

function initMessaging() {
  if (!window.FIREBASE_CONFIG || !window.FCM_VAPID_KEY) return;
  if (!firebase.apps.length) {
    firebase.initializeApp(window.FIREBASE_CONFIG);
  }
  messaging = firebase.messaging();
}

async function requestPushPermission() {
  if (!messaging) initMessaging();
  if (!messaging) return;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;
  const token = await messaging.getToken({ vapidKey: window.FCM_VAPID_KEY });
  currentToken = token || "";
  return currentToken;
}

function onMessage(callback) {
  if (!messaging) initMessaging();
  if (!messaging) return;
  messaging.onMessage((payload) => {
    callback(payload);
  });
}

window.FCM = {
  initMessaging,
  requestPushPermission,
  onMessage,
  getToken: () => currentToken
};
