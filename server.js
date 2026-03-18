const path = require("path");
const http = require("http");
const express = require("express");
const admin = require("firebase-admin");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT env var");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

app.post("/notify", async (req, res) => {
  const { token, tokens, title, body, data } = req.body || {};
  const targetTokens = Array.from(new Set(
    (Array.isArray(tokens) ? tokens : [token])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));
  if (targetTokens.length === 0) return res.status(400).json({ error: "Missing token" });
  try {
    const payloadData = {};
    Object.keys(data || {}).forEach((key) => {
      payloadData[key] = String(data[key]);
    });
    const link = payloadData.url || "/";
    const message = {
      tokens: targetTokens,
      data: payloadData,
      webpush: {
        headers: {
          Urgency: "high"
        },
        notification: {
          title: title || "Nuova chiamata",
          body: body || "Sei stato chiamato",
          icon: "/icon.png",
          badge: "/icon.png",
          requireInteraction: true,
          data: payloadData
        },
        fcmOptions: {
          link
        }
      }
    };
    const result = await admin.messaging().sendEachForMulticast(message);
    const responses = result.responses.map((item, index) => ({
      token: targetTokens[index],
      success: item.success,
      messageId: item.success ? item.messageId : "",
      error: item.success ? "" : (item.error && item.error.message) || "Unknown error",
      code: item.success ? "" : (item.error && item.error.code) || ""
    }));
    const invalidTokens = responses
      .filter((item) => item.code === "messaging/registration-token-not-registered" || item.code === "messaging/invalid-registration-token")
      .map((item) => item.token);
    return res.json({
      ok: result.successCount > 0,
      requested: targetTokens.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
      invalidTokens,
      responses
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});
