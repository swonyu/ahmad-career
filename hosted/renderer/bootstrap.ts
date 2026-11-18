import type { AppRequestContext } from "../app/request-context";
import type { ChatGPTUser } from "../app/chatgpt-auth";

export const pagePaths = ["/", "/phone", "/connect", "/account", "/privacy", "/support"] as const;
export type PagePath = typeof pagePaths[number];
export type DocumentAssets = Readonly<{ client: string; styles: string; phoneStyles: string }>;
export type PageBootstrap = Readonly<{ version: 1; page: PagePath | "not-found"; context: AppRequestContext; assets: DocumentAssets }>;

export function isPagePath(value: string): value is PagePath {
  return pagePaths.some(path => path === value);
}

/** Escape the HTML parser boundary as well as JSON; no raw cookie/token enters this object. */
export function serializeBootstrap(value: PageBootstrap): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => {
    const replacements: Record<string, string> = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" };
    return replacements[character];
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function asset(value: unknown, extension: "js" | "css"): string {
  if (typeof value !== "string" || !/^\/_career\/[a-z0-9-]+\.(?:js|css)$/.test(value) || !value.endsWith("." + extension)) throw Error("Page assets are unavailable.");
  return value;
}

export function parseBootstrap(text: string): PageBootstrap {
  const value: unknown = JSON.parse(text);
  if (!record(value) || value.version !== 1 || typeof value.page !== "string" ||
      !(isPagePath(value.page) || value.page === "not-found") ||
      !record(value.context) || !record(value.assets)) throw Error("Page data is unavailable.");
  const context = value.context;
  if (!(context.language === "en" || context.language === "ar") ||
      !(context.languagePreference === "system" || context.languagePreference === "en" || context.languagePreference === "ar")) throw Error("Page language is unavailable.");
  const user = parseUser(context.user);
  return {
    version: 1, page: value.page,
    context: {
      language: context.language, languagePreference: context.languagePreference,
      user,
    },
    assets: { client: asset(value.assets.client, "js"), styles: asset(value.assets.styles, "css"), phoneStyles: asset(value.assets.phoneStyles, "css") },
  };
}

function parseUser(value: unknown): ChatGPTUser | null {
  if (value === null) return null;
  if (!record(value)) throw Error("Page account is unavailable.");
  const { userId, email, displayName, fullName, method } = value;
  if (typeof userId !== "string" || typeof email !== "string" || typeof displayName !== "string" ||
      !(fullName === null || typeof fullName === "string") ||
      !(method === "chatgpt" || method === "google" || method === "linkedin")) throw Error("Page account is unavailable.");
  return { userId, email, displayName, fullName, method };
}
