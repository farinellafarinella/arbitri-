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
const PUSH_CONFIGURED = Boolean(WEB_PUSH_PUBLIC_KEY && WEB_PUSH_PRIVATE_KEY);

function parseChallongeApiKeys() {
  const rawCombined = [
    process.env.CHALLONGE_API_KEYS,
    process.env.CHALLONGE_API_KEY
  ].filter(Boolean).join("\n");
  const seen = new Set();
  return String(rawCombined || "")
    .split(/[\n,;]+/)
    .map((value) => String(value || "").trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

const CHALLONGE_API_KEYS = parseChallongeApiKeys();

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
    if (ignoredSegments.has(String(slug).toLowerCase())) return "";
    if (/^[a-z]{2}(?:-[a-z]{2})?$/i.test(slug)) return "";
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

function pickDisplayText(...values) {
  for (const value of values) {
    const text = String(value == null ? "" : value).trim();
    if (!text) continue;
    const lowered = text.toLowerCase();
    if (lowered === "undefined" || lowered === "null") continue;
    return text;
  }
  return "";
}

function unwrapChallongeList(payload, key) {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((entry) => entry && entry[key] ? entry[key] : null)
    .filter(Boolean);
}

function normalizePairKey(left, right) {
  return [String(left || "").trim(), String(right || "").trim()].sort().join("::");
}

function sortNumericStringIds(list) {
  return (Array.isArray(list) ? list : []).slice().sort((left, right) => {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }
    return String(left).localeCompare(String(right), undefined, { numeric: true });
  });
}

function buildRoundRobinSchedule(size) {
  if (!Number.isInteger(size) || size < 2) return [];
  const totalSlots = size % 2 === 0 ? size : size + 1;
  const byeSlot = totalSlots > size ? String(totalSlots) : "";
  let order = Array.from({ length: totalSlots }, (_, index) => String(index + 1));
  const rounds = [];
  for (let roundIndex = 0; roundIndex < totalSlots - 1; roundIndex += 1) {
    const pairs = [];
    for (let index = 0; index < totalSlots / 2; index += 1) {
      const left = order[index];
      const right = order[totalSlots - 1 - index];
      if (left === byeSlot || right === byeSlot) continue;
      pairs.push(normalizePairKey(left, right));
    }
    rounds.push(pairs.sort());
    order = [order[0], order[order.length - 1], ...order.slice(1, -1)];
  }
  return rounds;
}

function buildObservedRounds(matches) {
  const roundMap = new Map();
  (Array.isArray(matches) ? matches : []).forEach((match) => {
    const round = Number(match && match.round);
    const player1Id = String(match && match.player1_id || "").trim();
    const player2Id = String(match && match.player2_id || "").trim();
    if (!Number.isFinite(round) || !player1Id || !player2Id) return;
    const key = normalizePairKey(player1Id, player2Id);
    if (!roundMap.has(round)) roundMap.set(round, []);
    roundMap.get(round).push(key);
  });
  const orderedRounds = Array.from(roundMap.keys()).sort((left, right) => left - right);
  return orderedRounds.map((round) => ({
    round,
    pairs: (roundMap.get(round) || []).sort()
  }));
}

function *permute(list, start = 0) {
  if (start >= list.length - 1) {
    yield list.slice();
    return;
  }
  for (let index = start; index < list.length; index += 1) {
    [list[start], list[index]] = [list[index], list[start]];
    yield* permute(list, start + 1);
    [list[start], list[index]] = [list[index], list[start]];
  }
}

function inferRoundRobinPlayerMap(participants, matches) {
  const seededParticipants = (Array.isArray(participants) ? participants : [])
    .filter((participant) => participant && participant.id && Number.isFinite(Number(participant.seed)))
    .slice()
    .sort((left, right) => Number(left.seed) - Number(right.seed));
  if (seededParticipants.length < 2) return new Map();
  if (seededParticipants.length > 8) return new Map();

  const observedRounds = buildObservedRounds(matches);
  if (observedRounds.length === 0) return new Map();

  const uniqueMatchPlayerIds = Array.from(new Set(
    observedRounds.flatMap((round) => round.pairs.flatMap((pairKey) => pairKey.split("::")))
  ));
  const playerCount = seededParticipants.length;
  if (uniqueMatchPlayerIds.length !== playerCount) return new Map();

  const canonicalRounds = buildRoundRobinSchedule(playerCount);
  if (canonicalRounds.length === 0) return new Map();

  for (const permutation of permute(uniqueMatchPlayerIds.slice())) {
    const candidateRounds = canonicalRounds.map((pairs) =>
      pairs.map((pairKey) => {
        const [leftSeed, rightSeed] = pairKey.split("::").map((value) => Number(value) - 1);
        return normalizePairKey(permutation[leftSeed], permutation[rightSeed]);
      }).sort()
    );
    const matchesSchedule = observedRounds.every((round, index) => {
      const roundIndex = Number.isFinite(round.round) && round.round > 0 && round.round <= candidateRounds.length
        ? round.round - 1
        : index;
      const expectedPairs = candidateRounds[roundIndex];
      return Array.isArray(expectedPairs) && JSON.stringify(round.pairs) === JSON.stringify(expectedPairs);
    });
    if (!matchesSchedule) continue;

    const inferred = new Map();
    permutation.forEach((matchPlayerId, index) => {
      const participant = seededParticipants[index];
      if (!participant || !matchPlayerId) return;
      inferred.set(String(matchPlayerId), participant);
    });
    return inferred;
  }

  return new Map();
}

function inferGroupStagePlayerMap(participants, matches) {
  const safeParticipants = Array.isArray(participants) ? participants : [];
  const safeMatches = Array.isArray(matches) ? matches : [];
  const participantGroups = new Map();
  const matchGroups = new Map();

  safeParticipants.forEach((participant) => {
    const groupKey = String(participant && participant.group_id || "").trim() || "__ungrouped__";
    if (!participantGroups.has(groupKey)) participantGroups.set(groupKey, []);
    participantGroups.get(groupKey).push(participant);
  });

  safeMatches.forEach((match) => {
    const groupKey = String(match && match.group_id || "").trim() || "__ungrouped__";
    if (!matchGroups.has(groupKey)) matchGroups.set(groupKey, []);
    matchGroups.get(groupKey).push(match);
  });

  const hasExplicitGroups = Array.from(participantGroups.keys()).some((key) => key !== "__ungrouped__")
    || Array.from(matchGroups.keys()).some((key) => key !== "__ungrouped__");
  if (!hasExplicitGroups) {
    return inferRoundRobinPlayerMap(safeParticipants, safeMatches);
  }

  const inferred = new Map();
  participantGroups.forEach((groupParticipants, groupKey) => {
    const groupMatches = matchGroups.get(groupKey) || [];
    if (groupParticipants.length < 2 || groupMatches.length === 0) return;
    const firstRoundGroupMap = inferSwissFirstRoundPlayerMap(groupParticipants, groupMatches);
    const groupMap = firstRoundGroupMap.size > 0
      ? firstRoundGroupMap
      : inferRoundRobinPlayerMap(groupParticipants, groupMatches);
    groupMap.forEach((participant, matchPlayerId) => {
      inferred.set(matchPlayerId, participant);
    });
  });
  return inferred;
}

function inferSwissFirstRoundPlayerMap(participants, matches) {
  const seededParticipants = (Array.isArray(participants) ? participants : [])
    .filter((participant) => participant && participant.id && Number.isFinite(Number(participant.seed)))
    .slice()
    .sort((left, right) => Number(left.seed) - Number(right.seed));
  const safeMatches = (Array.isArray(matches) ? matches : [])
    .filter((match) => match && match.player1_id && match.player2_id);
  const firstRoundMatches = safeMatches.filter((match) => Number(match.round) === 1);
  if (seededParticipants.length < 2 || firstRoundMatches.length === 0) return new Map();

  const matchPlayerIds = sortNumericStringIds(Array.from(new Set(
    firstRoundMatches.flatMap((match) => [String(match.player1_id), String(match.player2_id)])
  )));
  const participantCount = seededParticipants.length;
  const expectedMatchCount = Math.floor(participantCount / 2);
  if (firstRoundMatches.length !== expectedMatchCount) return new Map();
  if (matchPlayerIds.length !== participantCount && matchPlayerIds.length !== participantCount - 1) return new Map();

  const half = firstRoundMatches.length;
  const expectedPairs = [];
  for (let index = 0; index < half; index += 1) {
    expectedPairs.push(normalizePairKey(matchPlayerIds[index], matchPlayerIds[index + half]));
  }
  const actualPairs = firstRoundMatches
    .map((match) => normalizePairKey(match.player1_id, match.player2_id))
    .sort();
  if (JSON.stringify(expectedPairs.sort()) !== JSON.stringify(actualPairs)) {
    return new Map();
  }

  const inferred = new Map();
  matchPlayerIds.forEach((matchPlayerId, index) => {
    const participant = seededParticipants[index];
    if (!participant) return;
    inferred.set(String(matchPlayerId), participant);
  });

  // With an odd number of players, Challonge can omit the bye player from round 1
  // and only introduce that internal player id from round 2 onward.
  if (matchPlayerIds.length === participantCount - 1) {
    const mappedParticipantIds = new Set(Array.from(inferred.values()).map((participant) => String(participant && participant.id || "").trim()));
    const missingParticipants = seededParticipants.filter((participant) => !mappedParticipantIds.has(String(participant.id)));
    const allMatchPlayerIds = sortNumericStringIds(Array.from(new Set(
      safeMatches.flatMap((match) => [String(match && match.player1_id || ""), String(match && match.player2_id || "")])
        .filter(Boolean)
    )));
    const unseenMatchPlayerIds = allMatchPlayerIds.filter((matchPlayerId) => !inferred.has(String(matchPlayerId)));
    if (missingParticipants.length === 1 && unseenMatchPlayerIds.length === 1) {
      inferred.set(String(unseenMatchPlayerIds[0]), missingParticipants[0]);
    }
  }

  return inferred;
}

function buildKnownPlayerMap(participants, matches) {
  const known = new Map();
  (Array.isArray(participants) ? participants : []).forEach((participant) => {
    const id = String(participant && participant.id || "").trim();
    if (!id) return;
    known.set(id, participant);
  });
  (Array.isArray(matches) ? matches : []).forEach((match) => {
    const player1Id = String(match && match.player1_id || "").trim();
    const player2Id = String(match && match.player2_id || "").trim();
    const player1Name = pickDisplayText(match && match.player1_name, match && match.player1_display_name);
    const player2Name = pickDisplayText(match && match.player2_name, match && match.player2_display_name);
    if (player1Id && player1Name && !known.has(player1Id)) {
      known.set(player1Id, { id: player1Id, name: player1Name });
    }
    if (player2Id && player2Name && !known.has(player2Id)) {
      known.set(player2Id, { id: player2Id, name: player2Name });
    }
  });
  return known;
}

async function challongeRequest(pathname, options = {}) {
  if (CHALLONGE_API_KEYS.length === 0) {
    const error = new Error("Missing CHALLONGE_API_KEY or CHALLONGE_API_KEYS env var");
    error.statusCode = 503;
    throw error;
  }
  const method = options.method || "GET";
  const accessMode = String(options.accessMode || "read").trim().toLowerCase();
  let lastError = null;
  const attemptErrors = [];

  for (const [index, apiKey] of CHALLONGE_API_KEYS.entries()) {
    const search = new URLSearchParams(options.query || {});
    search.set("api_key", apiKey);
    const url = `https://api.challonge.com/v1${pathname}.json?${search.toString()}`;
    const response = await fetch(url, {
      method,
      headers: options.headers || {},
      body: options.body
    });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      return payload;
    }
    const error = new Error(payload && payload.errors ? JSON.stringify(payload.errors) : `Challonge request failed (${response.status})`);
    error.statusCode = response.status;
    error.payload = payload;
    lastError = error;
    attemptErrors.push({
      index: index + 1,
      statusCode: response.status,
      message: error.message
    });
  }

  const allNotFound = attemptErrors.length > 0 && attemptErrors.every((item) => item.statusCode === 404);
  const allUnauthorized = attemptErrors.length > 0 && attemptErrors.every((item) => item.statusCode === 401);
  const summary = attemptErrors.map((item) => `key ${item.index}: ${item.statusCode}`).join(", ");
  const writeMode = accessMode === "write";
  const error = new Error(
    writeMode
      ? (
          allNotFound || allUnauthorized
            ? `Nessuna delle ${attemptErrors.length} API key Challonge configurate può scrivere risultati su questo torneo.`
            : `Scrittura Challonge fallita con tutte le API key configurate (${summary}).`
        )
      : (
          allNotFound
            ? `Nessuna delle ${attemptErrors.length} API key Challonge configurate trova questo torneo. Controlla slug/link e che almeno una key abbia accesso.`
            : allUnauthorized
              ? `Tutte le ${attemptErrors.length} API key Challonge configurate sono non valide o non autorizzate.`
              : `Tutte le API key Challonge configurate hanno fallito (${summary}).`
        )
  );
  error.statusCode = writeMode
    ? (allUnauthorized ? 403 : allNotFound ? 403 : (lastError && lastError.statusCode) || 500)
    : (allNotFound ? 404 : allUnauthorized ? 401 : (lastError && lastError.statusCode) || 500);
  error.payload = attemptErrors;
  throw error;
}

async function fetchChallongeTournamentBundle(tournamentRef) {
  const encodedRef = encodeURIComponent(tournamentRef);
  const [tournamentPayload, participantsPayload, matchesPayload] = await Promise.all([
    challongeRequest(`/tournaments/${encodedRef}`),
    challongeRequest(`/tournaments/${encodedRef}/participants`),
    challongeRequest(`/tournaments/${encodedRef}/matches`)
  ]);
  return {
    tournament: tournamentPayload && tournamentPayload.tournament ? tournamentPayload.tournament : {},
    participants: unwrapChallongeList(participantsPayload, "participant"),
    matches: unwrapChallongeList(matchesPayload, "match")
  };
}

function normalizeChallongeTournamentPayload(bundle) {
  const tournament = bundle && bundle.tournament ? bundle.tournament : {};
  const participants = Array.isArray(bundle && bundle.participants) ? bundle.participants : [];
  const matches = Array.isArray(bundle && bundle.matches) ? bundle.matches : [];
  const participantById = new Map(participants.map((participant) => [String(participant.id), participant]));
  const inferredPlayerMap = inferGroupStagePlayerMap(participants, matches);
  const inferredSwissPlayerMap = inferSwissFirstRoundPlayerMap(participants, matches);
  const knownPlayerMap = buildKnownPlayerMap(participants, matches);
  const participantName = (participant, fallback = "") => pickDisplayText(
    participant && participant.name,
    participant && participant.display_name,
    participant && participant.display_name_with_invitation_email_address,
    participant && participant.invite_email,
    participant && participant.username,
    participant && participant.challonge_username,
    participant && participant.misc,
    participant && participant.invitation_email,
    participant && participant.email,
    fallback
  );
  const openMatches = matches
    .filter((match) => match && match.state === "open" && match.player1_id && match.player2_id)
    .map((match) => {
      const player1 = participantById.get(String(match.player1_id))
        || inferredPlayerMap.get(String(match.player1_id))
        || inferredSwissPlayerMap.get(String(match.player1_id))
        || knownPlayerMap.get(String(match.player1_id));
      const player2 = participantById.get(String(match.player2_id))
        || inferredPlayerMap.get(String(match.player2_id))
        || inferredSwissPlayerMap.get(String(match.player2_id))
        || knownPlayerMap.get(String(match.player2_id));
      const player1Name = participantName(player1, match.player1_id ? `Partecipante ${match.player1_id}` : "");
      const player2Name = participantName(player2, match.player2_id ? `Partecipante ${match.player2_id}` : "");
      return {
        id: String(match.id),
        identifier: String(match.identifier || ""),
        round: Number(match.round) || 0,
        state: String(match.state || "open"),
        player1Id: String(match.player1_id),
        player2Id: String(match.player2_id),
        player1Name,
        player2Name
      };
    })
    .filter((match) => match.player1Name && match.player2Name);

  return {
    id: String(tournament.id || ""),
    name: String(tournament.name || ""),
    state: String(tournament.state || ""),
    participants: participants.map((participant) => ({
      id: String(participant.id),
      seed: Number(participant.seed) || 0,
      name: participantName(participant, participant && participant.id ? `Partecipante ${participant.id}` : "")
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
    return res.status(400).json({
      ok: false,
      error: "Link Challonge non valido. Incolla il link diretto del torneo, ad esempio https://challonge.com/tuo_slug"
    });
  }
  try {
    const bundle = await fetchChallongeTournamentBundle(tournamentRef);
    const normalized = normalizeChallongeTournamentPayload(bundle);
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
      accessMode: "write",
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
