import { useState, useEffect } from "react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "./fetchWithRetry";

/**
 * SINGLE SOURCE OF TRUTH for tiers on the client.
 *
 * The server owns the ladder (see DEFAULT_TIER_CONFIG in
 * supabase/functions/server/index.tsx) and serves it from GET /tier-config, where admins can
 * edit it. This module fetches it once, caches it, and exposes the helpers every screen needs.
 *
 * Before this existed, four different screens each hardcoded their own thresholds and three
 * more hardcoded their own colours — a customer with 600 points read "Gold" on their Profile
 * and "Silver" on their Rewards page in the same session. If you need a tier name, threshold,
 * or colour, get it from here. Never inline a `points >= N` comparison again.
 */

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;
const CACHE_KEY = "tikka_tier_config";

export interface Tier {
  name: string;
  minLifetimePoints: number;
  color: string;
}

/**
 * Mirrors the server's DEFAULT_TIER_CONFIG. Only used before the first successful fetch, or if
 * the network is unavailable — the server value always wins once it arrives.
 */
export const FALLBACK_TIERS: Tier[] = [
  { name: "Gold", minLifetimePoints: 0, color: "#FFC107" },
  { name: "VIP Member", minLifetimePoints: 5000, color: "#9C27B0" },
];

let memoryCache: Tier[] | null = null;
let inFlight: Promise<Tier[]> | null = null;

function readLocalCache(): Tier[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalCache(tiers: Tier[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(tiers));
  } catch {
    // localStorage unavailable
  }
}

/**
 * Best-effort synchronous read, for render paths that cannot await.
 * Returns the cached ladder if we have one, otherwise the fallback.
 */
export function getTiersSync(): Tier[] {
  return memoryCache ?? readLocalCache() ?? FALLBACK_TIERS;
}

/** Fetch the ladder from the server, deduping concurrent callers. */
export async function fetchTiers(): Promise<Tier[]> {
  if (memoryCache) return memoryCache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetchWithRetry(`${API_BASE}/tier-config`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.tiers) && data.tiers.length > 0) {
          memoryCache = data.tiers;
          writeLocalCache(data.tiers);
          return data.tiers;
        }
      }
    } catch {
      // fall through to whatever we already have
    } finally {
      inFlight = null;
    }
    return getTiersSync();
  })();

  return inFlight;
}

/** Drop the cache so the next read re-fetches. Call after an admin edits the ladder. */
export function clearTierCache(): void {
  memoryCache = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // localStorage unavailable
  }
}

// ─── Classification ───────────────────────────────────────────────
// Tier is derived from LIFETIME points earned, never the spendable balance, so redeeming
// points can never demote a customer. This must match resolveUserTier on the server.

/** The lifetime total a user record should be classified by. */
export function lifetimePointsOf(user: any): number {
  return user?.totalPointsEarned ?? user?.points ?? 0;
}

export function tierForPoints(lifetimePoints: number, tiers: Tier[] = getTiersSync()): Tier {
  let match = tiers[0];
  for (const tier of tiers) {
    if ((lifetimePoints || 0) >= tier.minLifetimePoints) match = tier;
  }
  return match;
}

/** The tier a user record currently qualifies for. */
export function tierForUser(user: any, tiers: Tier[] = getTiersSync()): Tier {
  return tierForPoints(lifetimePointsOf(user), tiers);
}

/** Position in the ladder, or -1 if the name is not in the current config. */
export function tierRank(name: string, tiers: Tier[] = getTiersSync()): number {
  const needle = String(name ?? "").trim().toLowerCase();
  return tiers.findIndex((t) => t.name.toLowerCase() === needle);
}

/** Colour for a tier name, falling back to neutral grey for a renamed/removed tier. */
export function tierColor(name: string, tiers: Tier[] = getTiersSync()): string {
  const idx = tierRank(name, tiers);
  return idx >= 0 ? tiers[idx].color : "#9CA3AF";
}

/**
 * Progress toward the next tier. Returns null once the customer is in the top tier.
 * `pointsNeeded` is how many more LIFETIME points are required.
 */
export function nextTierProgress(
  user: any,
  tiers: Tier[] = getTiersSync()
): { next: Tier; pointsNeeded: number; percent: number } | null {
  const lifetime = lifetimePointsOf(user);
  const current = tierForPoints(lifetime, tiers);
  const currentIdx = tierRank(current.name, tiers);
  const next = tiers[currentIdx + 1];
  if (!next) return null;

  const span = next.minLifetimePoints - current.minLifetimePoints;
  const gained = lifetime - current.minLifetimePoints;
  return {
    next,
    pointsNeeded: Math.max(0, next.minLifetimePoints - lifetime),
    percent: span > 0 ? Math.min(100, Math.max(0, (gained / span) * 100)) : 100,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────

/**
 * Returns the tier ladder, seeded from cache so there is no flash, then refreshed from the
 * server. `loading` is only true on the very first fetch of a session with a cold cache.
 */
export function useTiers(): { tiers: Tier[]; loading: boolean; refresh: () => Promise<void> } {
  const [tiers, setTiers] = useState<Tier[]>(getTiersSync);
  const [loading, setLoading] = useState(memoryCache === null);

  useEffect(() => {
    let active = true;
    fetchTiers()
      .then((next) => {
        if (active) setTiers(next);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const refresh = async () => {
    clearTierCache();
    const next = await fetchTiers();
    setTiers(next);
  };

  return { tiers, loading, refresh };
}
