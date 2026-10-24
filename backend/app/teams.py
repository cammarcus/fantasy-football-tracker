# ESPN and Sleeper mostly agree on NFL team abbreviations; these are the exceptions.
# Everything the API returns uses the Sleeper spelling so teams match across platforms.
TEAM_ALIASES = {
    "WSH": "WAS",
}


def normalize_team(abbrev: str | None) -> str:
    if not abbrev or abbrev == "None":
        return "FA"
    abbrev = abbrev.upper()
    return TEAM_ALIASES.get(abbrev, abbrev)
