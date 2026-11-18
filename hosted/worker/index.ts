import { renderRequest, type RenderBuild } from "../renderer/server";

declare const __CAREER_BUILD__: RenderBuild;
declare const __CAREER_PREVIEW__: boolean;
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { handleApplications } from "../server/applications.mjs";
import { handleDiscovery } from "../server/discovery.mjs";
import { handleOAuth } from "../server/oauth.mjs";
import { resolveBrowserIdentity, stripInternalIdentityHeaders } from "../server/identity.mjs";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    request = stripInternalIdentityHeaders(request);
    const pathname = new URL(request.url).pathname;
    const authResponse = await handleOAuth(request, env);
    if (authResponse) return authResponse;
    if (pathname.startsWith("/api/discovery/")) {
      const response = await handleDiscovery(request, env);
      if (response) return response;
    }
    if (pathname.startsWith("/api/apply/") || pathname === "/api/phone" || pathname.startsWith("/api/phone/") || pathname === "/api/account" || pathname.startsWith("/api/account/") || pathname === "/api/health") {
      const response = await handleApplications(request, env, ctx);
      if (response) return response;
      return Response.json({ ok: false, error: { code: "not_found", message: "This service route does not exist." } }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (typeof __CAREER_PREVIEW__ !== "undefined" && __CAREER_PREVIEW__ && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    // Only this request's verified identity reaches SSR. Invalid Career Finder
    // cookies render the signed-out recovery UI, never a fallback Sites account.
    let identity = null;
    try { identity = await resolveBrowserIdentity(request, env); } catch { /* /api/auth/status supplies a safe recovery error. */ }
    if (typeof __CAREER_BUILD__ === "undefined") throw Error("The Worker build manifest is missing.");
    const response = await runWithConnectorBinding(binding, () => renderRequest(request, identity, __CAREER_BUILD__));
    const secured = new Response(response.body, response);
    secured.headers.set("Cache-Control", "no-store");
    secured.headers.set("Referrer-Policy", "no-referrer");
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return secured;
  },
};

export default worker;
