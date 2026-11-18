import { renderToReadableStream } from "react-dom/server.browser";
import type { AppRequestContext } from "../app/request-context";
import { PageRedirect } from "../app/chatgpt-auth";
import { cookiePreference, requestLanguage } from "../app/i18n/core";
import RootLayout from "../app/layout";
import PageContent from "./routes";
import { isPagePath, type DocumentAssets, type PageBootstrap } from "./bootstrap";
import { assetResponse, type AssetMap } from "./assets";

type VerifiedIdentity = Readonly<{ id: string; email: string; displayName: string; method: "chatgpt" | "google" | "linkedin" }> | null;
export type RenderBuild = Readonly<{ assets: AssetMap; document: DocumentAssets }>;

/** Identity is an explicit resolved capability argument, never caller-supplied SSR headers. */
export function requestContext(request: Request, identity: VerifiedIdentity): AppRequestContext {
  const cookie = request.headers.get("cookie") ?? "";
  return {
    user: identity ? { userId: identity.id, email: identity.email, displayName: identity.displayName, fullName: identity.displayName, method: identity.method } : null,
    language: requestLanguage(cookie, request.headers.get("accept-language") ?? ""),
    languagePreference: cookiePreference(cookie),
  };
}

export async function renderRequest(request: Request, identity: VerifiedIdentity, build: RenderBuild): Promise<Response> {
  const asset = assetResponse(request, build.assets);
  if (asset) return asset;
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  if (url.pathname !== "/" && url.pathname.endsWith("/") && isPagePath(url.pathname.slice(0, -1))) {
    return new Response(null, { status: 308, headers: { Location: url.pathname.slice(0, -1) + url.search } });
  }
  const context = requestContext(request, identity);
  const bootstrap: PageBootstrap = { version: 1, page: isPagePath(url.pathname) ? url.pathname : "not-found", context, assets: build.document };
  let failed = false;
  let renderingError: unknown;
  try {
    const stream = await renderToReadableStream(<RootLayout bootstrap={bootstrap}><PageContent page={bootstrap.page} context={context} /></RootLayout>, {
      onError(error) { failed = true; renderingError ??= error; },
      signal: request.signal,
    });
    await stream.allReady;
    if (failed) throw renderingError ?? Error("Page rendering failed.");
    return new Response(request.method === "HEAD" ? null : stream, { status: bootstrap.page === "not-found" ? 404 : 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error) {
    if (error instanceof PageRedirect) return new Response(null, { status: 307, headers: { Location: error.location } });
    return new Response(context.language === "ar" ? "تعذر فتح هذه الصفحة. أعد المحاولة." : "This page could not load. Please try again.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
