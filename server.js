const path = require("path");
const http = require("http");
const express = require("express");
const webpush = require("web-push");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  return next();
});
app.use(express.static(path.join(__dirname, "public")));

const WEB_PUSH_PUBLIC_KEY = String(process.env.WEB_PUSH_PUBLIC_KEY || "").trim();
const WEB_PUSH_PRIVATE_KEY = String(process.env.WEB_PUSH_PRIVATE_KEY || "").trim();
const WEB_PUSH_SUBJECT = String(process.env.WEB_PUSH_SUBJECT || "mailto:admin@example.com").trim();
const CHALLONGE_API_KEY = String(process.env.CHALLONGE_API_KEY || "").trim();
const PUSH_CONFIGURED = Boolean(WEB_PUSH_PUBLIC_KEY && WEB_PUSH_PRIVATE_KEY);

if (!PUSH_CONFIGURED) {
  console.warn("Push notifications disabled: missing WEB_PUSH_PUBLIC_KEY or WEB_PUSH_PRIVATE_KEY env var");
} else {
  webpush.setVapidDetails(WEB_PUSH_SUBJECT, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY);
}

function normalizeSubscriptions(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map((subscription) => {
    if (!subscription || typeof subscription !== "object") return null;
    const endpoint = String(subscription.endpoint || "").trim();
    const expirationTime = subscription.expirationTime == null ? null : Number(subscription.expirationTime);
    const keys = subscription.keys && typeof subscription.keys === "object" ? subscription.keys : {};
    const p256dh = String(keys.p256dh || "").trim();
    const auth = String(keys.auth || "").trim();
    if (!endpoint || !p256dh || !auth || seen.has(endpoint)) return null;
    seen.add(endpoint);
    return {
      endpoint,
      expirationTime: Number.isFinite(expirationTime) ? expirationTime : null,
      keys: { p256dh, auth }
    };
  }).filter(Boolean);
}

function stringifyData(data) {
  const payloadData = {};
  Object.keys(data || {}).forEach((key) => {
    payloadData[key] = String(data[key]);
  });
  return payloadData;
}

function parseChallongeReference(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) {
    return raw.replace(/^\/+|\/+$/g, "");
  }
  try {
    const url = new URL(raw);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length === 0) return "";
    const ignoredSegments = new Set([
      "tournaments",
      "tournament",
      "underway",
      "pending",
      "completed",
      "show",
      "matches",
      "participants",
      "standings",
      "bracket",
      "brackets"
    ]);
    let slug = pathParts[pathParts.length - 1] || "";
    while (pathParts.length > 1 && ignoredSegments.has(String(slug).toLowerCase())) {
      pathParts.pop();
      slug = pathParts[pathParts.length - 1] || "";
    }
    if (/^[a-z]{2}(?:-[a-z]{2})?$/i.test(slug) && pathParts.length > 1) {
      pathParts.pop();
      slug = pathParts[pathParts.length - 1] || "";
    }
    if (!slug) return "";
    const subdomain = url.hostname.endsWith(".challonge.com")
      ? url.hostname.replace(/\.challonge\.com$/i, "")
      : "";
    if (subdomain && subdomain !== "www" && subdomain !== "challonge") {
      return `${subdomain}-${slug}`;
    }
    return slug;
  } catch {
    return raw;
  }
}

async function challongeRequest(pathname, options = {}) {
  if (!CHALLONGE_API_KEY) {
    const error = new Error("Missing CHALLONGE_API_KEY env var");
    error.statusCode = 503;
    throw error;
  }
  const method = options.method || "GET";
  const search = new URLSearchParams(options.query || {});
  search.set("api_key", CHALLONGE_API_KEY);
  const url = `https://api.challonge.com/v1${pathname}.json?${search.toString()}`;
  const response = await fetch(url, {
    method,
    headers: options.headers || {},
    body: options.body
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload && payload.errors ? JSON.stringify(payload.errors) : `Challonge request failed (${response.status})`);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function normalizeChallongeTournamentPayload(payload) {
  const tournament = payload && payload.tournament ? payload.tournament : {};
  const participantRecords = Array.isArray(tournament.participants) ? tournament.participants : [];
  const matchRecords = Array.isArray(tournament.matches) ? tournament.matches : [];
  const participants = participantRecords.map((entry) => entry && entry.participant ? entry.participant : null).filter(Boolean);
  const participantById = new Map(participants.map((participant) => [String(participant.id), participant]));
  const participantName = (participant) => String(
    participant && (
      participant.name ||
      participant.display_name ||
      participant.display_name_with_invitation_email_address ||
      participant.username ||
      ""
    )
  ).trim();
  const openMatches = matchRecords
    .map((entry) => entry && entry.match ? entry.match : null)
    .filter(Boolean)
    .filter((match) => match.state === "open" && match.player1_id && match.player2_id)
    .map((match) => {
      const player1 = participantById.get(String(match.player1_id));
      const player2 = participantById.get(String(match.player2_id));
      return {
        id: String(match.id),
        identifier: String(match.identifier || ""),
        round: Number(match.round) || 0,
        state: String(match.state || "open"),
        player1Id: String(match.player1_id),
        player2Id: String(match.player2_id),
        player1Name: participantName(player1),
        player2Name: participantName(player2)
      };
    })
    .filter((match) => match.player1Name && match.player2Name);

  return {
    id: String(tournament.id || ""),
    name: String(tournament.name || ""),
    state: String(tournament.state || ""),
    participants: participants.map((participant) => ({
      id: String(participant.id),
      name: participantName(participant)
    })).filter((participant) => participant.name),
    openMatches
  };
}

app.get("/push-public-key", (req, res) => {
  if (!PUSH_CONFIGURED) {
    return res.status(503).json({ ok: false, error: "Push notifications disabled" });
  }
  res.json({ ok: true, publicKey: WEB_PUSH_PUBLIC_KEY });
});

app.get("/challonge/tournament", async (req, res) => {
  const tournamentRef = parseChallongeReference(req.query.url);
  if (!tournamentRef) {
    return res.status(400).json({ ok: false, error: "Missing Challonge tournament URL" });
  }
  try {
    const payload = await challongeRequest(`/tournaments/${encodeURIComponent(tournamentRef)}`, {
      query: {
        include_participants: "1",
        include_matches: "1"
      }
    });
    const normalized = normalizeChallongeTournamentPayload(payload);
    return res.json({ ok: true, tournamentRef, ...normalized });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message || "Unable to fetch Challonge tournament"
    });
  }
});

app.post("/challonge/matches/:matchId/report", async (req, res) => {
  const tournamentRef = parseChallongeReference(req.body && req.body.tournamentUrl);
  const matchId = String(req.params.matchId || "").trim();
  const winnerId = String(req.body && req.body.winnerParticipantId || "").trim();
  const scoresCsv = String(req.body && req.body.scoresCsv || "").trim();
  if (!tournamentRef || !matchId || !winnerId) {
    return res.status(400).json({ ok: false, error: "Missing Challonge match payload" });
  }
  try {
    const body = new URLSearchParams();
    body.set("match[winner_id]", winnerId);
    if (scoresCsv) body.set("match[scores_csv]", scoresCsv);
    const payload = await challongeRequest(`/tournaments/${encodeURIComponent(tournamentRef)}/matches/${encodeURIComponent(matchId)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
    const match = payload && payload.match ? payload.match : {};
    return res.json({
      ok: true,
      matchId: String(match.id || matchId),
      state: String(match.state || "")
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message || "Unable to report Challonge result"
    });
  }
});

app.post("/notify", async (req, res) => {
  if (!PUSH_CONFIGURED) {
    return res.json({
      ok: true,
      disabled: true,
      requested: 0,
      successCount: 0,
      failureCount: 0,
      invalidSubscriptions: [],
      responses: []
    });
  }
  const { subscription, subscriptions, title, body, data } = req.body || {};
  const targetSubscriptions = normalizeSubscriptions(
    Array.isArray(subscriptions) ? subscriptions : [subscription]
  );
  if (targetSubscriptions.length === 0) {
    return res.status(400).json({ error: "Missing subscription" });
  }
  try {
    const payloadData = stringifyData(data);
    const payload = JSON.stringify({
      title: title || "Nuova chiamata",
      body: body || "Sei stato chiamato",
      data: payloadData
    });
    const responses = await Promise.all(targetSubscriptions.map(async (target) => {
      try {
        await webpush.sendNotification(target, payload, {
          TTL: 60,
          urgency: "high"
        });
        return {
          endpoint: target.endpoint,
          success: true,
          statusCode: 201,
          error: ""
        };
      } catch (error) {
        return {
          endpoint: target.endpoint,
          success: false,
          statusCode: Number(error && error.statusCode) || 500,
          error: String((error && (error.body || error.message)) || error || "Unknown error")
        };
      }
    }));
    const successCount = responses.filter((item) => item.success).length;
    const invalidSubscriptions = responses
      .filter((item) => item.statusCode === 404 || item.statusCode === 410)
      .map((item) => item.endpoint);
    return res.json({
      ok: successCount > 0,
      requested: targetSubscriptions.length,
      successCount,
      failureCount: targetSubscriptions.length - successCount,
      invalidSubscriptions,
      responses
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});
