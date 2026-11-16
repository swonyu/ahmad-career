export const SERVICE_ORIGIN = "https://career-finder-service.jazzy-drake-8323.chatgpt.site";
export type Pairing = { pairingCode: string; expiresAt: string; origin: string; deadline: number };

/** Use server-relative validity and a monotonic clock; a phone's wall clock may be wrong. */
export function parsePairingResponse(data: Record<string, unknown>, requestStarted: number, receivedAt: number): Pairing {
  const expires = typeof data.expiresAt === "string" ? Date.parse(data.expiresAt) : NaN;
  const issued = typeof data.serverTime === "string" ? Date.parse(data.serverTime) : NaN;
  const elapsed = receivedAt - requestStarted;
  const lifetime = expires - issued;
  if (typeof data.pairingCode !== "string" || !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}(?:-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}){3}$/.test(data.pairingCode)
      || data.origin !== SERVICE_ORIGIN || !Number.isFinite(expires) || !Number.isFinite(issued)
      || !Number.isFinite(requestStarted) || !Number.isFinite(receivedAt) || elapsed < 0
      || lifetime <= 0 || lifetime > 300_000) {
    throw new Error("The connection response could not be verified. Reload this page before creating another code.");
  }
  // Conservatively deduct the whole request duration, including time spent before issuance.
  const remaining = lifetime - elapsed;
  if (remaining <= 0) throw new Error("This connection code expired before it arrived. Create a new code to connect.");
  return { pairingCode: data.pairingCode, expiresAt: data.expiresAt as string, origin: data.origin as string, deadline: receivedAt + remaining };
}

export function pairingSecondsRemaining(pairing: Pairing | null, monotonicNow: number): number {
  return pairing ? Math.max(0, Math.ceil((pairing.deadline - monotonicNow) / 1000)) : 0;
}
