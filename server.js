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
  const { token, title, body } = req.body || {};
  if (!token) return res.status(400).json({ error: "Missing token" });
  try {
    const message = {
      token,
      notification: {
        title: title || "Nuova chiamata",
        body: body || "Sei stato chiamato"
      }
    };
    const result = await admin.messaging().send(message);
    return res.json({ ok: true, result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});
