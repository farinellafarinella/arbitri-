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
  const targetTokens = Array.isArray(tokens) ? tokens.filter(Boolean) : [token].filter(Boolean);
  if (targetTokens.length === 0) return res.status(400).json({ error: "Missing token" });
  try {
    const payloadData = {};
    Object.keys(data || {}).forEach((key) => {
      payloadData[key] = String(data[key]);
    });
    const sendResults = await Promise.all(targetTokens.map((targetToken) => {
      const message = {
        token: targetToken,
        notification: {
          title: title || "Nuova chiamata",
          body: body || "Sei stato chiamato"
        },
        data: payloadData
      };
      return admin.messaging().send(message);
    }));
    return res.json({ ok: true, result: sendResults });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});
