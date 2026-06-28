const { fetchGeMatches, sendJson } = require("./results.js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://cvoyaykuhlfstpqgwzfd.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_x2IRZsjc6rBglzY9lOQ4vQ_xAyTN7DT";
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "bolao_state";
const SUPABASE_ROW_ID = process.env.SUPABASE_ROW_ID || "copa2026-familia";
const SYNC_VERSION = "2026.06.28.4";
const FINAL_STATUSES = new Set(["FT", "AET", "PEN"]);

function countNested(obj) {
  return obj ? Object.values(obj).reduce((total, value) => (
    total + (value && typeof value === "object" ? Object.keys(value).length : 0)
  ), 0) : 0;
}

function protectedCounts(data) {
  return {
    participants: (data.participants || []).length,
    predictions: countNested(data.predictions),
    archive: countNested(data.predictionArchive),
    results: (data.games || []).filter(game => game.result).length
  };
}

function assertProtectedCounts(before, after, phase) {
  if (
    before.participants !== after.participants ||
    before.predictions !== after.predictions ||
    before.archive !== after.archive
  ) {
    throw new Error(`PROTECTED_COUNTS_CHANGED_${phase} before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  }
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

function backendBaseUrl() {
  return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${encodeURIComponent(SUPABASE_TABLE)}`;
}

function normalizeTeamName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isPlaceholderTeam(name) {
  return /repescagem|grupo|vencedor|perdedor|adversario|colocado|^[123]o\b/i.test(normalizeTeamName(name));
}

function teamPairKey(homeTeam, awayTeam) {
  return [normalizeTeamName(homeTeam), normalizeTeamName(awayTeam)].sort().join("|");
}

function sign(value) {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

function gameWinner(game) {
  if (!game?.result) return null;
  if (game.type === "knockout" && game.advancedTeam) return game.advancedTeam;
  if (game.result.home > game.result.away) return game.homeTeam;
  if (game.result.away > game.result.home) return game.awayTeam;
  return null;
}

function gameLoser(game) {
  const winner = gameWinner(game);
  if (!winner) return null;
  return winner === game.homeTeam ? game.awayTeam : game.homeTeam;
}

function groupQualifiedTeams(data) {
  const result = {};
  const groups = {};
  (data.games || []).filter(game => game.type === "group").forEach(game => {
    groups[game.group] ||= [];
    groups[game.group].push(game);
  });

  Object.entries(groups).forEach(([group, games]) => {
    if (games.length < 6 || games.some(game => !game.result)) return;
    const table = {};
    const rowFor = team => table[team] ||= { team, pts: 0, wins: 0, gf: 0, ga: 0, gd: 0 };

    games.forEach(game => {
      const home = rowFor(game.homeTeam);
      const away = rowFor(game.awayTeam);
      home.gf += game.result.home;
      home.ga += game.result.away;
      away.gf += game.result.away;
      away.ga += game.result.home;
      home.gd = home.gf - home.ga;
      away.gd = away.gf - away.ga;
      if (game.result.home > game.result.away) {
        home.pts += 3;
        home.wins += 1;
      } else if (game.result.away > game.result.home) {
        away.pts += 3;
        away.wins += 1;
      } else {
        home.pts += 1;
        away.pts += 1;
      }
    });

    const sorted = Object.values(table).sort((a, b) =>
      b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || b.wins - a.wins || a.team.localeCompare(b.team)
    );
    if (sorted[0]) result[`1o Grupo ${group}`] = sorted[0].team;
    if (sorted[1]) result[`2o Grupo ${group}`] = sorted[1].team;
  });
  return result;
}

function resolveTeamSource(source, gameById, groupRanks) {
  const text = String(source || "").trim();
  let match = text.match(/^Vencedor\s+(.+)$/);
  if (match) return gameWinner(gameById.get(match[1]));
  match = text.match(/^Perdedor\s+(.+)$/);
  if (match) return gameLoser(gameById.get(match[1]));
  return groupRanks[text] || null;
}

function isDynamicTeamSource(source) {
  return /^(Vencedor|Perdedor)\s+/.test(source || "") ||
    /^[12]o Grupo [A-L]$/.test(source || "") ||
    /^3o [A-L/]+$/.test(source || "");
}

function updateDerivedTeamsFromResults(data) {
  const games = data.games || [];
  const gameById = new Map(games.map(game => [game.id, game]));
  const groupRanks = groupQualifiedTeams(data);
  const updates = [];

  games.forEach(game => {
    if (game.type !== "knockout" || game.result) return;
    [["homeTeam", "sourceHomeTeam"], ["awayTeam", "sourceAwayTeam"]].forEach(([teamKey, sourceKey]) => {
      game[sourceKey] ||= game[teamKey];
      const source = game[sourceKey];
      const resolved = resolveTeamSource(source, gameById, groupRanks);
      const nextTeam = resolved || (isDynamicTeamSource(source) ? source : game[teamKey]);
      if (nextTeam && game[teamKey] !== nextTeam && (!isPlaceholderTeam(nextTeam) || isPlaceholderTeam(game[teamKey]))) {
        updates.push(`${game.id}: ${game[teamKey]} -> ${nextTeam}`);
        game[teamKey] = nextTeam;
      }
    });
  });

  return updates;
}

function resultCanonicalTeam(name) {
  const aliases = {
    "czechia": "republica tcheca",
    "czech republic": "republica tcheca",
    "bosnia and herzegovina": "bosnia",
    "democratic republic of the congo": "rd congo",
    "dr congo": "rd congo",
    "congo dr": "rd congo",
    "iraq": "iraque",
    "sweden": "suecia"
  };
  const normalized = normalizeTeamName(name);
  return aliases[normalized] || normalized;
}

function findLocalGame(match, data) {
  if (match.localId) {
    const byId = (data.games || []).find(game => game.id === match.localId);
    if (byId) return byId;
  }

  const key = teamPairKey(match.homeTeam, match.awayTeam);
  const candidates = (data.games || []).filter(game => teamPairKey(game.homeTeam, game.awayTeam) === key);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const matchTime = match.date ? new Date(match.date).getTime() : 0;
  return candidates
    .map(game => ({ game, diff: Math.abs(new Date(game.datetime).getTime() - matchTime) }))
    .sort((a, b) => a.diff - b.diff)[0].game;
}

function applyTeamNames(matches, data) {
  const updates = [];
  (matches || []).filter(match => match.localId).forEach(match => {
    const game = (data.games || []).find(item => item.id === match.localId);
    if (!game || game.result) return;
    [["homeTeam", match.homeTeam], ["awayTeam", match.awayTeam]].forEach(([teamKey, nextTeam]) => {
      if (!nextTeam || isPlaceholderTeam(nextTeam) || game[teamKey] === nextTeam) return;
      updates.push(`${game.id}: ${game[teamKey]} -> ${nextTeam}`);
      game[teamKey] = nextTeam;
    });
  });
  return updates;
}

function resultsForAdminReview(matches, data) {
  const pending = [];
  const conflicts = [];

  (matches || []).filter(match => FINAL_STATUSES.has(match.statusShort)).forEach(match => {
    if (!Number.isInteger(match.home) || !Number.isInteger(match.away)) return;
    const game = findLocalGame(match, data);
    if (!game) return;

    const nextResult = { home: match.home, away: match.away };
    const existing = game.result;
    const differs = existing && (existing.home !== nextResult.home || existing.away !== nextResult.away);
    if (differs) {
      conflicts.push(`${game.id}: local ${existing.home}x${existing.away}, ge ${nextResult.home}x${nextResult.away}`);
      return;
    }

    if (!existing) {
      pending.push({
        id: game.id,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        home: nextResult.home,
        away: nextResult.away,
        winner: match.winner || null,
        wentOvertime: !!match.wentOvertime
      });
    }
  });

  return { pending, conflicts };
}

function applyMatches(matches, data) {
  const teamUpdates = applyTeamNames(matches, data);
  const resultReview = resultsForAdminReview(matches, data);
  const derivedUpdates = updateDerivedTeamsFromResults(data);

  return {
    updates: [...teamUpdates, ...derivedUpdates],
    conflicts: resultReview.conflicts,
    pendingResults: resultReview.pending
  };
}

async function fetchBackendData() {
  const url = `${backendBaseUrl()}?id=eq.${encodeURIComponent(SUPABASE_ROW_ID)}&select=data`;
  const response = await fetch(url, {
    headers: supabaseHeaders({ Accept: "application/json" }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Supabase GET ${response.status}: ${await response.text()}`);
  const rows = await response.json();
  return rows[0]?.data || null;
}

async function patchBackendData(data, oldUpdatedAt) {
  const field = encodeURIComponent("data->meta->>updatedAt");
  const url = `${backendBaseUrl()}?id=eq.${encodeURIComponent(SUPABASE_ROW_ID)}&${field}=eq.${encodeURIComponent(oldUpdatedAt || "")}&select=data`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: supabaseHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify({ data }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Supabase PATCH ${response.status}: ${await response.text()}`);
  const rows = await response.json();
  if (!rows.length) {
    const error = new Error("SYNC_ABORTED_CONCURRENT_UPDATE");
    error.code = "SYNC_ABORTED_CONCURRENT_UPDATE";
    throw error;
  }
  return rows[0].data;
}

module.exports = async function handler(req, res) {
  try {
    const matches = await fetchGeMatches();
    const data = await fetchBackendData();
    if (!data) {
      sendJson(res, 404, { ok: false, error: "BOLAO_STATE_NOT_FOUND" });
      return;
    }

    const before = protectedCounts(data);

    const oldUpdatedAt = data.meta?.updatedAt || "";
    const { updates, conflicts, pendingResults } = applyMatches(matches, data);

    if (!updates.length) {
      sendJson(res, 200, {
        ok: true,
        changed: false,
        provider: "ge.globo.com",
        matchCount: matches.length,
        mode: "admin-review",
        updates,
        conflicts,
        pendingResults,
        protected: before
      });
      return;
    }

    data.meta ||= {};
    data.meta.version = SYNC_VERSION;
    data.meta.updatedAt = new Date().toISOString();

    assertProtectedCounts(before, protectedCounts(data), "BEFORE_PATCH");

    const after = await patchBackendData(data, oldUpdatedAt);
    const protectedAfter = protectedCounts(after);
    assertProtectedCounts(before, protectedAfter, "AFTER_PATCH");

    sendJson(res, 200, {
      ok: true,
      changed: true,
      provider: "ge.globo.com",
      matchCount: matches.length,
      mode: "admin-review",
      updates,
      conflicts,
      pendingResults,
      protected: protectedAfter
    });
  } catch (error) {
    const status = error.code === "SYNC_ABORTED_CONCURRENT_UPDATE" ? 409 : 500;
    sendJson(res, status, {
      ok: false,
      error: error.code || "SYNC_RESULTS_ERROR",
      message: error.message
    });
  }
};
