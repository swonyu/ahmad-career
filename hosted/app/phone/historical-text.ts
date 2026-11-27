/** JSON can retain old unpaired UTF-16 units even though display engines cannot. */
export function hasUnpairedText(value: string): boolean { return /[\uD800-\uDFFF]/u.test(value); }

/** Presentation only. Never feed these escapes back into a stored field or payload. */
export function displayHistoricalText(value: string | null | undefined): string {
  if (!value) return value ?? "";
  return value.replace(/[\uD800-\uDFFF]/gu, unit => `\\u${unit.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`);
}

export type HistoricalTextField = { path: (string | number)[]; value: string };

/** Derivable from exact saved values, so browser recovery needs no display cache. */
export function historicalTextFields(value: unknown): HistoricalTextField[] {
  const fields: HistoricalTextField[] = [], seen = new WeakSet<object>();
  const pending: { value: unknown; path: (string | number)[] }[] = [{ value, path: [] }];
  while (pending.length) {
    const current = pending.pop()!;
    if (typeof current.value === "string") {
      if (hasUnpairedText(current.value)) fields.push({ path: current.path, value: current.value });
    } else if (current.value && typeof current.value === "object" && !seen.has(current.value)) {
      seen.add(current.value);
      if (Array.isArray(current.value)) current.value.forEach((item, index) => pending.push({ value: item, path: [...current.path, index] }));
      else for (const [key, item] of Object.entries(current.value)) {
        if (hasUnpairedText(key)) fields.push({ path: [...current.path, key], value: key });
        pending.push({ value: item, path: [...current.path, key] });
      }
    }
  }
  return fields;
}

export function hasHistoricalText(value: unknown): boolean {
  return historicalTextFields(value).length !== 0;
}
