import { parseDiscoverySourceIdentity } from "../../shared/discovery-source-identity.mjs";

/** Match a catalog ID, employer-board URL or supported posting URL by board. */
export function discoverySourceKey(value: string): string {
  const input = value.trim();
  try { return parseDiscoverySourceIdentity(input).id; }
  catch { return input; } // Keep invalid restored values visible for validation.
}

/** Keep the first spelling and order; equivalent board aliases consume one slot. */
export function distinctDiscoverySources(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.map(value => value.trim()).filter(value => {
    if (!value) return false;
    const key = discoverySourceKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
