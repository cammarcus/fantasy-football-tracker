import { Credentials, hasEspn, hasSleeper } from "./credentials";
import type { LeaguesResponse, NflWeek, Platform, WaiversResponse } from "./types";

// Same origin by default: Vercel routes /api/* to the backend, and `next dev` proxies it (next.config.ts).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface AccountsBody {
  espn?: { swid: string; espn_s2: string; league_ids?: number[] }[];
  sleeper?: { username: string }[];
}

function accountsBody(creds: Credentials, only?: { platform: Platform; leagueId: string }): AccountsBody {
  const body: AccountsBody = {};
  if (hasEspn(creds) && (!only || only.platform === "espn")) {
    body.espn = [
      {
        swid: creds.espnSwid.trim(),
        espn_s2: creds.espnS2.trim(),
        ...(only ? { league_ids: [Number(only.leagueId)] } : {}),
      },
    ];
  }
  if (hasSleeper(creds) && (!only || only.platform === "sleeper")) {
    body.sleeper = [{ username: creds.sleeperUsername.trim() }];
  }
  return body;
}

async function post<T>(path: string, body: object): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Couldn't reach the API at ${API_URL || "/api"}. Is the backend running?`);
  }
  if (!resp.ok) {
    throw new Error(`The API returned an error (HTTP ${resp.status}).`);
  }
  return resp.json() as Promise<T>;
}

export async function fetchNflWeek(refreshInjuries = false): Promise<NflWeek> {
  const query = refreshInjuries ? "?refresh_injuries=true" : "";
  let resp: Response;
  try {
    resp = await fetch(`${API_URL}/api/nfl/week${query}`);
  } catch {
    throw new Error(`Couldn't reach the API at ${API_URL || "/api"}. Is the backend running?`);
  }
  if (!resp.ok) throw new Error(`Couldn't load NFL schedule and injuries (HTTP ${resp.status}).`);
  return resp.json() as Promise<NflWeek>;
}

export function fetchLeagues(creds: Credentials): Promise<LeaguesResponse> {
  return post<LeaguesResponse>("/api/leagues", accountsBody(creds));
}

export async function fetchWaivers(
  creds: Credentials,
  platform: Platform,
  leagueId: string,
  position: string | null,
  limit = 25,
): Promise<WaiversResponse> {
  const body = { ...accountsBody(creds, { platform, leagueId }), limit, ...(position ? { position } : {}) };
  const data = await post<WaiversResponse>("/api/waivers", body);
  // Sleeper returns every league for the account; keep only the one asked for.
  return { ...data, waivers: data.waivers.filter((w) => w.league_id === leagueId) };
}
