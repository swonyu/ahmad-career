// Preserve the provider's entire waiting period. An unreadable or unrepresentable
// value is a reconciliation hold, never permission to retry sooner.
export function retryAfterDelay(value, now = Date.now()) {
  if (value === null || value === undefined || value === '') return 30_000;
  const header = value.trim();
  if (!header || header.length > 128 || !Number.isFinite(now)) return null;
  let delay;
  if (/^\d+$/.test(header)) {
    const seconds = Number(header);
    if (!Number.isSafeInteger(seconds)) return null;
    delay = seconds * 1000;
  } else {
    // HTTP-date, not JavaScript's permissive interpretation of bare numbers.
    if (!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(header)) return null;
    delay = Date.parse(header) - now;
  }
  if (!Number.isSafeInteger(delay) || delay < 0 || now + delay > 253402300799999) return null;
  return Math.max(delay, 1000);
}
