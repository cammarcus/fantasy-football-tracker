"""Call the local API with credentials from backend/.env and print your leagues.

Usage (from backend/, with the server running):
    python scripts/fetch_leagues.py            # readable summary
    python scripts/fetch_leagues.py --json     # full JSON response
    python scripts/fetch_leagues.py --season 2025
    python scripts/fetch_leagues.py --waivers                   # waiver wire, all positions
    python scripts/fetch_leagues.py --waivers --position RB --limit 10

.env keys used: ESPN_SWID, ESPN_S2, SLEEPER_USERNAME (any can be left out).
"""

import argparse
import json
import sys
from pathlib import Path

import httpx

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def load_env(path: Path) -> dict[str, str]:
    env = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def build_request(env: dict[str, str], season: int | None) -> dict:
    body: dict = {}
    if season:
        body["season"] = season
    if env.get("ESPN_SWID") and env.get("ESPN_S2"):
        body["espn"] = [{"swid": env["ESPN_SWID"], "espn_s2": env["ESPN_S2"]}]
    if env.get("SLEEPER_USERNAME"):
        body["sleeper"] = [{"username": env["SLEEPER_USERNAME"]}]
    return body


def print_summary(data: dict) -> None:
    for lg in data["leagues"]:
        teams = {t["team_id"]: t for t in lg["teams"]}
        me = teams.get(lg["my_team_id"])
        print(f"\n[{lg['platform'].upper()}] {lg['name']}  (week {lg['current_week']}, {len(lg['teams'])} teams)")
        if not me:
            print("  Your team wasn't found in this league.")
            continue
        print(f"  {me['name']}  {me['wins']}-{me['losses']}-{me['ties']}  PF {me['points_for']}  PA {me['points_against']}")

        matchup = next(
            (m for m in lg["matchups"] if me["team_id"] in (m["home_team_id"], m["away_team_id"])), None
        )
        if matchup:
            home = me["team_id"] == matchup["home_team_id"]
            opp_id = matchup["away_team_id"] if home else matchup["home_team_id"]
            my_score = matchup["home_score"] if home else matchup["away_score"]
            opp_score = matchup["away_score"] if home else matchup["home_score"]
            opp = teams[opp_id]["name"] if opp_id in teams else "BYE"
            print(f"  This week: {my_score} vs {opp} {opp_score}")

        bench_slots = ("BE", "IR", "TAXI")
        starters = [p for p in me["roster"] if p["slot"] not in bench_slots]
        bench = [p for p in me["roster"] if p["slot"] in bench_slots]
        print("  Starters:")
        for p in starters:
            print_player(p)
        print("  Bench:")
        for p in bench:
            print_player(p)

    print_errors(data)


def print_player(p: dict) -> None:
    injury = f"  ({p['injury_status']})" if p["injury_status"] else ""
    print(f"    {p['slot']:<9} {p['name']} - {p['position']}, {p['nfl_team']}{injury}")


def print_waivers(data: dict) -> None:
    for lg in data["waivers"]:
        print(f"\n[{lg['platform'].upper()}] {lg['name']} - waiver wire")
        for p in lg["players"]:
            if lg["platform"] == "espn":
                detail = f"{p['percent_owned']}% owned, proj {p['projected_points']}"
            else:
                detail = f"{p['trending_adds']} adds (24h)" if p["trending_adds"] else ""
            injury = f" ({p['injury_status']})" if p["injury_status"] else ""
            print(f"    {p['position']:<5} {p['name']} - {p['nfl_team']}{injury}  {detail}")
    print_errors(data)


def print_errors(data: dict) -> None:
    for err in data["errors"]:
        league = f" league {err['league_id']}" if err["league_id"] else ""
        print(f"\n[ERROR] {err['platform']}{league}: {err['message']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default="http://127.0.0.1:8000", help="API base URL")
    parser.add_argument("--season", type=int, help="season year (defaults to current)")
    parser.add_argument("--json", action="store_true", help="print the full JSON response")
    parser.add_argument("--waivers", action="store_true", help="show the waiver wire instead of rosters")
    parser.add_argument("--position", help="waiver wire position filter: QB, RB, WR, TE, K, DEF")
    parser.add_argument("--limit", type=int, default=15, help="waiver wire players per league (default 15)")
    args = parser.parse_args()

    body = build_request(load_env(ENV_PATH), args.season)
    if "espn" not in body and "sleeper" not in body:
        sys.exit(f"No credentials found in {ENV_PATH}. Set ESPN_SWID + ESPN_S2 and/or SLEEPER_USERNAME.")

    endpoint = "/api/leagues"
    if args.waivers:
        endpoint = "/api/waivers"
        body["limit"] = args.limit
        if args.position:
            body["position"] = args.position

    try:
        resp = httpx.post(f"{args.url}{endpoint}", json=body, timeout=120)
        resp.raise_for_status()
    except httpx.ConnectError:
        sys.exit(f"Couldn't reach {args.url}. Is the server running? (uvicorn app.main:app --reload)")
    except httpx.HTTPStatusError as e:
        sys.exit(f"API returned {e.response.status_code}: {e.response.text}")

    data = resp.json()
    if args.json:
        print(json.dumps(data, indent=2))
    elif args.waivers:
        print_waivers(data)
    else:
        print_summary(data)


if __name__ == "__main__":
    main()
