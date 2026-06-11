const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
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
    item.score?.extratime?.home !== null ||
    item.score?.penalty?.home !== null;
  const winner = item.teams?.home?.winner ? item.teams.home.name :
    item.teams?.away?.winner ? item.teams.away.name : null;

  return {
    sourceId: String(item.fixture?.id || ""),
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

module.exports = async function handler(req, res) {
  const apiKey = process.env.APISPORTS_KEY || process.env.API_FOOTBALL_KEY;
  const league = process.env.RESULTS_LEAGUE_ID || "1";
  const season = process.env.RESULTS_SEASON || "2026";

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=300");

  if (!apiKey) {
    sendJson(res, 501, {
      ok: false,
      error: "RESULTS_API_NOT_CONFIGURED",
      message: "Configure APISPORTS_KEY na Vercel para ativar resultados automaticos."
    });
    return;
  }

  try {
    const url = new URL("/fixtures", API_FOOTBALL_BASE_URL);
    url.searchParams.set("league", league);
    url.searchParams.set("season", season);

    const response = await fetch(url, {
      headers: { "x-apisports-key": apiKey }
    });
    const payload = await response.json();

    if (!response.ok || payload.errors?.length) {
      sendJson(res, 502, {
        ok: false,
        error: "RESULTS_API_ERROR",
        status: response.status,
        details: payload.errors || payload.message || null
      });
      return;
    }

    const matches = (payload.response || []).map(normalizeFixture);

    sendJson(res, 200, {
      ok: true,
      provider: "api-football",
      league,
      season,
      checkedAt: new Date().toISOString(),
      matchCount: matches.length,
      warning: matches.length ? "" : "NO_MATCHES_RETURNED",
      matches
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: "RESULTS_PROXY_ERROR",
      message: error.message
    });
  }
};
