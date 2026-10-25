// ESPN quick connect: on a computer a console snippet copies the two cookies on fantasy.espn.com and
// the user pastes the result; on a phone a bookmarklet sends them back to the app. Both rely on ESPN
// leaving espn_s2 readable by page scripts. The manual fields stay as a fallback.

// Kept short so users can read what they're pasting. The trailing string is what the console
// prints, since copy() itself returns undefined.
export const ESPN_CONSOLE_SNIPPET =
  'copy(document.cookie.split("; ").filter(c => /^(SWID|espn_s2)=/.test(c)).join("; ")); "Copied! Now paste it into the app."';

export interface EspnCookies {
  swid?: string;
  espnS2?: string;
}

// A SWID is a GUID in braces. People paste it without braces or dashes, in quotes, URL-encoded
// (%7B...%7D), or with a "SWID=" prefix; all of those normalize to {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}.
const HEX = "[0-9A-Fa-f]";
const GUID = `${HEX}{8}-?${HEX}{4}-?${HEX}{4}-?${HEX}{4}-?${HEX}{12}`;
const LABELED_SWID = new RegExp(`SWID["']?\\s*[=:\\s]\\s*["']?(?:\\{|%7B)?(${GUID})`, "i");
const BRACED_SWID = new RegExp(`(?:\\{|%7B)(${GUID})(?:\\}|%7D)`, "i");
const BARE_SWID = new RegExp(`^(${GUID})$`, "i");
const LABELED_S2 = /espn_s2["']?\s*[=:\s]\s*["']?([^;\s"']+)/i;
// espn_s2 is a long URL-encoded token. This is a sanity check for hints, not proof it works.
const S2_SHAPE = /^[A-Za-z0-9%+/=._-]{80,}$/;

function formatSwid(guid: string): string {
  const h = guid.replace(/-/g, "");
  return `{${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}}`;
}

const stripWrapping = (text: string) => text.trim().replace(/^["']+|["';]+$/g, "");

// From a blob that may hold both cookies: the snippet's output ("SWID={...}; espn_s2=..."), either
// order, or rows copied from DevTools' cookie table (name and value separated by tabs or spaces).
// Only labeled or braced SWIDs count here, so a hex run inside espn_s2 can't be mistaken for one.
export function parseEspnCookies(text: string): EspnCookies {
  const swid = (text.match(LABELED_SWID) ?? text.match(BRACED_SWID))?.[1];
  const espnS2 = text.match(LABELED_S2)?.[1];
  return { swid: swid && formatSwid(swid), espnS2 };
}

// What the user typed in the SWID field, cleaned up; undefined if it doesn't contain a SWID.
export function normalizeSwid(text: string): string | undefined {
  const guid = (text.match(LABELED_SWID) ?? text.match(BRACED_SWID) ?? stripWrapping(text).match(BARE_SWID))?.[1];
  return guid && formatSwid(guid);
}

// What the user typed in the espn_s2 field, cleaned up: prefix, quotes, trailing ";" and any line
// breaks from copying wrapped text are removed. Undefined if what's left doesn't look like espn_s2.
export function normalizeEspnS2(text: string): string | undefined {
  const value = (text.match(LABELED_S2)?.[1] ?? stripWrapping(text)).replace(/\s+/g, "");
  return S2_SHAPE.test(value) ? value : undefined;
}

// Phones have no console, so a bookmarklet does the copying: tapped on fantasy.espn.com, it opens
// the app with both cookies after "#". Browsers never send the fragment to a server, so the cookies
// only travel between the user's own tabs. The app asks before using them (see takeEspnHandoff).
export function espnBookmarklet(appUrl: string): string {
  const target = JSON.stringify(`${appUrl}#espn=`);
  return (
    "javascript:(function(){" +
    'if(!/(^|\\.)espn\\.com$/.test(location.hostname)){alert("Open fantasy.espn.com and log in, then tap this bookmark.");return}' +
    'var c={};document.cookie.split("; ").forEach(function(p){var i=p.indexOf("=");c[p.slice(0,i)]=p.slice(i+1)});' +
    'if(!c.SWID||!c.espn_s2){alert("Log in at fantasy.espn.com first, then tap this bookmark again.");return}' +
    `location.href=${target}+encodeURIComponent("SWID="+c.SWID+"; espn_s2="+c.espn_s2)` +
    "})()"
  );
}

const HANDOFF_PREFIX = "#espn=";
let handoff: EspnCookies | null | undefined;

// Reads cookies the bookmarklet put in the URL fragment, once per page load, and strips them from
// the address bar right away. Cached so a second call (React Strict Mode) returns the same result.
// The caller must ask before using them: any site could link here with someone else's cookies.
export function takeEspnHandoff(): Required<EspnCookies> | null {
  if (handoff === undefined) {
    handoff = null;
    const hash = window.location.hash;
    if (hash.startsWith(HANDOFF_PREFIX)) {
      let text = "";
      try {
        text = decodeURIComponent(hash.slice(HANDOFF_PREFIX.length));
      } catch {
        // Malformed fragment: ignore it.
      }
      const parsed = parseEspnCookies(text);
      if (parsed.swid && parsed.espnS2) handoff = parsed;
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }
  return handoff as Required<EspnCookies> | null;
}
