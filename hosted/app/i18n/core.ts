import arabicMessages from "./messages.ar.json";

export type Language = "en" | "ar";
export type LanguagePreference = Language | "system";
export const LANGUAGE_KEY = "career-finder:language:v1";
export const LANGUAGE_COOKIE = "career_finder_language";
const catalog: Readonly<Record<string, string>> = arabicMessages;

export function parsePreference(value: unknown): LanguagePreference {
  return value === "en" || value === "ar" ? value : "system";
}

/** Only a language choice is read; account cookies never enter locale state. */
export function cookiePreference(cookie: string): LanguagePreference {
  const value = cookie.match(/(?:^|;)\s*career_finder_language=(en|ar|system)(?:;|$)/)?.[1];
  return parsePreference(value);
}

export function preferredLanguage(languages: readonly string[]): Language {
  for (const language of languages) {
    const base = language.trim().toLowerCase().split(/[-_]/, 1)[0];
    if (base === "ar" || base === "en") return base;
  }
  return "en";
}

export function requestLanguage(cookie: string, acceptLanguage: string): Language {
  const preference = cookiePreference(cookie);
  if (preference !== "system") return preference;
  const candidates = acceptLanguage.split(",").map((part, index) => {
    const [tag, quality] = part.trim().split(";");
    const q = quality?.trim().startsWith("q=") ? Number(quality.trim().slice(2)) : 1;
    return { tag, q: Number.isFinite(q) && q > 0 && q <= 1 ? q : 0, index };
  }).filter(value => value.q > 0).sort((a, b) => b.q - a.q || a.index - b.index);
  return preferredLanguage(candidates.map(value => value.tag));
}

function substitute(text: string, values: readonly unknown[], isolate = false): string {
  return text.replace(/\{(\d+)\}/g, (token, index: string) => {
    if (Number(index) >= values.length) return token;
    const value = String(values[Number(index)] ?? "");
    // Isolate opaque inserted text in Arabic sentences without changing its value
    // in forms, stored records, links, or requests. This string is display-only.
    return isolate && value ? `\u2068${value}\u2069` : value;
  });
}
const templates = Object.keys(catalog).filter(key => /\{\d+\}/.test(key)).map(key => {
  const indexes = [...key.matchAll(/\{(\d+)\}/g)].map(match => Number(match[1]));
  const literals = key.split(/\{\d+\}/g);
  return { indexes, literals, specificity: literals.join("").length, translation: catalog[key] };
}).filter(entry => entry.specificity >= 4 && entry.indexes.length <= 8 && entry.literals.slice(1, -1).every(Boolean))
  .sort((a, b) => b.specificity - a.specificity);

// A bounded, forward-only scan avoids running catalog-generated wildcard regexes
// against provider/error text. Ambiguous templates fail back to the original text.
function templateValues(source: string, entry: typeof templates[number]): string[] | null {
  if (!source.startsWith(entry.literals[0])) return null;
  let offset = entry.literals[0].length;
  const parameters: string[] = [];
  for (let i = 0; i < entry.indexes.length; i++) {
    const literal = entry.literals[i + 1];
    const last = i === entry.indexes.length - 1;
    const end = last ? source.length - literal.length : source.indexOf(literal, offset);
    if (end < offset || source.slice(end, end + literal.length) !== literal) return null;
    const index = entry.indexes[i], value = source.slice(offset, end);
    if (parameters[index] !== undefined && parameters[index] !== value) return null;
    parameters[index] = value;
    offset = end + literal.length;
  }
  return offset === source.length ? parameters : null;
}

/** Translate only explicitly app-owned text. Never call this on user/employer content. */
export function translate(source: string, language: Language, values: readonly unknown[] = []): string {
  if (language === "en") return substitute(source, values);
  const normalized = source.replace(/\s+/g, " ").trim();
  const translated = Object.hasOwn(catalog, normalized) ? catalog[normalized] : undefined;
  if (typeof translated === "string" && translated) {
    const leading = source.match(/^\s*/)?.[0] ?? "", trailing = source.match(/\s*$/)?.[0] ?? "";
    return leading + substitute(translated, values, true) + trailing;
  }
  // Error/status strings created asynchronously can arrive as already formatted English.
  // Only known app-owned templates are matched; captured data stays untranslated.
  if (!values.length && source.length <= 16384) {
    for (const entry of templates) {
      const parameters = templateValues(source, entry);
      if (parameters) return substitute(entry.translation, parameters, true);
    }
  }
  return substitute(source, values);
}

export function formatNumber(value: number, language: Language, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(language === "ar" ? "ar-u-nu-arab" : "en", options).format(value);
}
export function formatDateTime(value: string, language: Language, timeStyle: "short" | "medium" = "short"): string {
  if (!Number.isFinite(Date.parse(value))) return translate("Date unavailable", language);
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA-u-ca-gregory-nu-arab" : "en", { dateStyle: "medium", timeStyle }).format(new Date(value));
}
export function savedJobsLabel(count: number, language: Language): string {
  if (language === "en") return `${count} saved ${count === 1 ? "job" : "jobs"}`;
  const form = new Intl.PluralRules("ar").select(count), n = formatNumber(count, language);
  if (form === "zero") return "لا توجد وظائف محفوظة";
  if (form === "one") return "وظيفة محفوظة واحدة";
  if (form === "two") return "وظيفتان محفوظتان";
  if (form === "few") return `${n} وظائف محفوظة`;
  return `${n} وظيفة محفوظة`;
}

export function jobsLabel(count: number, language: Language): string {
  if (language === "en") return `${count} ${count === 1 ? "job" : "jobs"}`;
  const form = new Intl.PluralRules("ar").select(count), n = formatNumber(count, language);
  if (form === "zero") return "لا توجد وظائف";
  if (form === "one") return "وظيفة واحدة";
  if (form === "two") return "وظيفتان";
  return form === "few" ? `${n} وظائف` : `${n} وظيفة`;
}
