// Credentials live only in this browser. "Remember" uses localStorage; otherwise
// sessionStorage, which is cleared when the tab closes. Nothing is stored server-side.

import type { Platform } from "./types";

export interface Credentials {
  sleeperUsername: string;
  espnSwid: string;
  espnS2: string;
}

const STORAGE_KEY = "fft-credentials";

export function hasEspn(creds: Credentials): boolean {
  return Boolean(creds.espnSwid.trim() && creds.espnS2.trim());
}

export function hasSleeper(creds: Credentials): boolean {
  return Boolean(creds.sleeperUsername.trim());
}

export function hasPlatform(creds: Credentials, platform: Platform): boolean {
  return platform === "espn" ? hasEspn(creds) : hasSleeper(creds);
}

export function withoutPlatform(creds: Credentials, platform: Platform): Credentials {
  return platform === "espn" ? { ...creds, espnSwid: "", espnS2: "" } : { ...creds, sleeperUsername: "" };
}

// Whether the saved credentials are in localStorage ("remember on this device").
export function isRemembered(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function loadCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials, remember: boolean): void {
  try {
    clearCredentials();
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(creds));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the app still works for this visit.
  }
}

export function clearCredentials(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
