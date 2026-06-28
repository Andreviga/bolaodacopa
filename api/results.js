const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
const GE_COMPETITION_ID = "b5ff9c28-476e-4816-a699-7645acc94cd0";
const GE_BASE_URL = `https://api.globoesporte.globo.com/tabela/${GE_COMPETITION_ID}`;
const GE_GROUP_PHASE = "fase-de-grupos-copa-do-mundo-2026";
const TZ_OFFSET = "-03:00";

const GE_KNOCKOUT_PHASES = [
  { slug: "segunda-fase-copa-do-mundo-2026", prefix: "R32", count: 16 },
  { slug: "oitavas-copa-do-mundo-2026", prefix: "OF", count: 8 },
  { slug: "quartas-copa-do-mundo-2026", prefix: "QF", count: 4 },
  { slug: "semifinal-copa-do-mundo-2026", prefix: "SF", count: 2 },
  { slug: "terceiro-copa-do-mundo-2026", ids: ["3PL"] },
  { slug: "final-copa-do-mundo-2026", ids: ["FIN"] }
];

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

function intOrNull(value) {
  return Number.isInteger(value) ? value : null;
}

function finalScore(fixture) {
  const fulltime = fixture.score?.fulltime || {};
  const goals = fixture.goals || {};
  return {
    home: Number.isInteger(fulltime.home) ? fulltime.home : goals.home,
    away: Number.isInteger(fulltime.away) ? fulltime.away : goals.away
  };
}

function normalizeFixture(item) {
  const status = item.fixture?.status || {};
  const score = finalScore(item);
  const statusShort = status.short || "";
  const wentOvertime = ["AET", "PEN"].includes(statusShort) ||
    Number.isInteger(item.score?.extratime?.home) ||
    Number.isInteger(item.score?.extratime?.away) ||
    Number.isInteger(item.score?.penalty?.home) ||
    Number.isInteger(item.score?.penalty?.away);
  const winner = item.teams?.home?.winner ? item.teams.home.name :
    item.teams?.away?.winner ? item.teams.away.name : null;

  return {
    sourceId: String(item.fixture?.id || ""),
    localId: null,
    date: item.fixture?.date || null,
    round: item.league?.round || "",
    statusShort,
    statusLong: status.long || "",
    elapsed: status.elapsed || null,
    homeTeam: item.teams?.home?.name || "",
    awayTeam: item.teams?.away?.name || "",
    home: score.home,
    away: score.away,
    winner,
    wentOvertime
  };
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function localIdForPhase(phase, index) {
  if (phase.ids) return phase.ids[index] || null;
  if (!phase.prefix || index >= phase.count) return null;
  return `${phase.prefix}-${pad2(index + 1)}`;
}

function geDate(item) {
  if (!item.data_realizacao) return null;
  const rawTime = String(item.hora_realizacao || "00:00").slice(0, 5);
  let iso = String(item.data_realizacao).includes("T")
    ? String(item.data_realizacao)
    : `${item.data_realizacao}T${rawTime}`;
  if (/T\d{2}:\d{2}$/.test(iso)) iso += ":00";
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(iso)) iso += TZ_OFFSET;
  return iso;
}

function geLabelToSource(label) {
  const text = String(label || "").trim();
  let match = text.match(/^([12])\D?\s*([A-L])$/i);
  if (match) return `${match[1]}o Grupo ${match[2].toUpperCase()}`;

  match = text.match(/^3\D?\s*([A-L]+)$/i);
  if (match) return `3o ${match[1].toUpperCase().split("").join("/")}`;

  match = text.match(/^Venc\.?\s+Segunda fase\s+(\d+)$/i);
  if (match) return `Vencedor R32-${pad2(match[1])}`;

  match = text.match(/^Venc\.?\s+Oitavas\s+(\d+)$/i);
  if (match) return `Vencedor OF-${pad2(match[1])}`;

  match = text.match(/^Venc\.?\s+Quartas\s+(\d+)$/i);
  if (match) return `Vencedor QF-${pad2(match[1])}`;

  match = text.match(/^Venc\.?\s+Semifinal\s+(\d+)$/i);
  if (match) return `Vencedor SF-${pad2(match[1])}`;

  match = text.match(/^Perd\.?\s+Semifinal\s+(\d+)$/i);
  if (match) return `Perdedor SF-${pad2(match[1])}`;

  return text.replace(/º/g, "o");
}

function geTeamName(team) {
  return team?.nome_popular || geLabelToSource(team?.label || "");
}

function geWinner(homeTeam, awayTeam, home, away, homePen, awayPen) {
  if (!Number.isInteger(home) || !Number.isInteger(away)) return null;
  if (home > away) return homeTeam;
  if (away > home) return awayTeam;
  if (Number.isInteger(homePen) && Number.isInteger(awayPen)) {
    if (homePen > awayPen) return homeTeam;
    if (awayPen > homePen) return awayTeam;
  }
  return null;
}

function normalizeGeGame(item, round, localId = null) {
  const homeTeam = geTeamName(item.equipes?.mandante);
  const awayTeam = geTeamName(item.equipes?.visitante);
  const home = intOrNull(item.placar_oficial_mandante);
  const away = intOrNull(item.placar_oficial_visitante);
  const homePen = intOrNull(item.placar_penaltis_mandante);
  const awayPen = intOrNull(item.placar_penaltis_visitante);
  const broadcastId = item.transmissao?.broadcast?.id || "";
  const finished = broadcastId === "ENCERRADA";

  return {
    sourceId: String(item.id || localId || ""),
    localId,
    date: geDate(item),
    round,
    statusShort: finished ? (Number.isInteger(homePen) || Number.isInteger(awayPen) ? "PEN" : "FT") : (item.jogo_ja_comecou ? "LIVE" : "NS"),
    statusLong: finished ? "Encerrada" : (item.jogo_ja_comecou ? "Em andamento" : "Nao iniciada"),
    elapsed: null,
    homeTeam,
    awayTeam,
    home,
    away,
    winner: geWinner(homeTeam, awayTeam, home, away, homePen, awayPen),
    wentOvertime: Number.isInteger(homePen) || Number.isInteger(awayPen)
  };
}

async function fetchGeGroupMatches() {
  const rounds = [1, 2, 3];
  const payloads = await Promise.all(rounds.map(round =>
    fetchJson(`${GE_BASE_URL}/fase/${GE_GROUP_PHASE}/rodada/${round}/jogos/`)
      .then(items => (items || []).map(item => normalizeGeGame(item, `Grupo rodada ${round}`)))
  ));
  return payloads.flat();
}

function knockoutGamesFromPayload(payload, phase) {
  const games = [];
  (payload.secao || []).forEach(section => {
    (section.chave || []).forEach(key => {
      (key.jogos || []).forEach(game => {
        const localId = localIdForPhase(phase, games.length);
        games.push(normalizeGeGame(game, key.nome || payload.fase?.slug || phase.slug, localId));
      });
    });
  });
  return games;
}

async function fetchGeKnockoutMatches() {
  const payloads = await Promise.all(GE_KNOCKOUT_PHASES.map(phase =>
    fetchJson(`${GE_BASE_URL}/fase/${phase.slug}/classificacao/`)
      .then(payload => knockoutGamesFromPayload(payload, phase))
  ));
  return payloads.flat();
}

async function fetchGeMatches() {
  const [groupMatches, knockoutMatches] = await Promise.all([
    fetchGeGroupMatches(),
    fetchGeKnockoutMatches()
  ]);
  return [...groupMatches, ...knockoutMatches];
}

async function fetchApiFootballMatches() {
  const apiKey = process.env.APISPORTS_KEY || process.env.API_FOOTBALL_KEY;
  const league = process.env.RESULTS_LEAGUE_ID || "1";
  const season = process.env.RESULTS_SEASON || "2026";

  if (!apiKey) {
    return {
      ok: false,
      status: 501,
      body: {
        ok: false,
        error: "RESULTS_API_NOT_CONFIGURED",
        message: "Configure APISPORTS_KEY na Vercel para ativar resultados automaticos."
      }
    };
  }

  const url = new URL("/fixtures", API_FOOTBALL_BASE_URL);
  url.searchParams.set("league", league);
  url.searchParams.set("season", season);

  const response = await fetch(url, {
    headers: { "x-apisports-key": apiKey }
  });
  const payload = await response.json();

  if (!response.ok || payload.errors?.length) {
    return {
      ok: false,
      status: 502,
      body: {
        ok: false,
        error: "RESULTS_API_ERROR",
        status: response.status,
        details: payload.errors || payload.message || null
      }
    };
  }

  return {
    ok: true,
    provider: "api-football",
    league,
    season,
    matches: (payload.response || []).map(normalizeFixture)
  };
}

module.exports = async function handler(req, res) {
  const provider = process.env.RESULTS_PROVIDER || "ge";
  const league = process.env.RESULTS_LEAGUE_ID || "1";
  const season = process.env.RESULTS_SEASON || "2026";

  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=120");

  try {
    if (provider !== "api-football") {
      const matches = await fetchGeMatches();
      sendJson(res, 200, {
        ok: true,
        provider: "ge.globo.com",
        league: "copa-do-mundo-2026",
        season,
        checkedAt: new Date().toISOString(),
        matchCount: matches.length,
        warning: matches.length ? "" : "NO_MATCHES_RETURNED",
        matches
      });
      return;
    }

    const apiFootball = await fetchApiFootballMatches();
    if (!apiFootball.ok) {
      sendJson(res, apiFootball.status, apiFootball.body);
      return;
    }

    sendJson(res, 200, {
      ok: true,
      provider: apiFootball.provider,
      league,
      season,
      checkedAt: new Date().toISOString(),
      matchCount: apiFootball.matches.length,
      warning: apiFootball.matches.length ? "" : "NO_MATCHES_RETURNED",
      matches: apiFootball.matches
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: "RESULTS_PROXY_ERROR",
      message: error.message
    });
  }
};

module.exports.fetchGeMatches = fetchGeMatches;
module.exports.sendJson = sendJson;
