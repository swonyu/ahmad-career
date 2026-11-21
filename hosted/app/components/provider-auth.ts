"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { APIError, requestAPI } from "./api";

const providerSchema = z.object({ configured: z.boolean(), signInSupported: z.boolean().default(false), connected: z.boolean(), displayName: z.string().max(500).optional(), connectionId: z.string().regex(/^[a-f0-9]{64}$/).optional() }).refine(value => !value.connected || Boolean(value.connectionId), "The connected account could not be verified. Check its current status.");
export const authStatusSchema = z.object({ ok: z.literal(true), account: z.object({ id: z.string().min(1).max(500), email: z.string().max(320), displayName: z.string().max(500), method: z.enum(["chatgpt", "google", "linkedin"]) }).nullable(), providers: z.object({ google: providerSchema, linkedin: providerSchema }) });
export type AuthStatus = z.infer<typeof authStatusSchema>;
export type Provider = "google" | "linkedin";
export function oauthReturn(search: string): { provider: Provider; result: "connected" | "signed_in" | "cancelled" | "failed" | "already_linked" | "email_required" } | null {
  const query = new URLSearchParams(search), provider = query.get("oauth_provider"), result = query.get("oauth_result");
  if (query.getAll("oauth_provider").length !== 1 || query.getAll("oauth_result").length !== 1 || !provider || !["google", "linkedin"].includes(provider) || !result || !["connected", "signed_in", "cancelled", "failed", "already_linked", "email_required"].includes(result)) return null;
  if (result === "email_required" && provider !== "linkedin") return null;
  return { provider: provider as Provider, result: result as "connected" | "signed_in" | "cancelled" | "failed" | "already_linked" | "email_required" };
}
export function internalAuthRedirect(value: unknown, origin: string): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) throw Error("The sign-in destination could not be verified.");
  const url = new URL(value, origin);
  if (url.origin !== new URL(origin).origin || !["/connect", "/account", "/phone", "/signout-with-chatgpt"].includes(url.pathname)) throw Error("The sign-in destination could not be verified.");
  if (url.pathname === "/signout-with-chatgpt" && !["/connect", "/account", "/phone"].includes(url.searchParams.get("return_to") ?? "")) throw Error("The sign-out destination could not be verified.");
  return url.href;
}
export function authorizationTarget(provider: Provider, value: unknown): string {
  if (typeof value !== "string" || value.length > 8192) throw Error("The sign-in address could not be verified.");
  const url = new URL(value);
  const allowed = provider === "google" ? url.hostname === "accounts.google.com" && url.pathname === "/o/oauth2/v2/auth" : url.hostname === "www.linkedin.com" && url.pathname === "/oauth/v2/authorization";
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || !allowed) throw Error("The sign-in address could not be verified.");
  return url.href;
}
export function useAuthStatus(expectedAccountId?: string) {
  const [status, setStatus] = useState<AuthStatus | null>(null), [error, setError] = useState(""), [checking, setChecking] = useState(true);
  const [errorCode, setErrorCode] = useState("");
  const pending = useRef<AbortController | null>(null);
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(0);
  const currentRevision = useCallback(() => revisionRef.current, []);
  const invalidateRevision = useCallback(() => { revisionRef.current++; }, []);
  const refresh = useCallback(async () => {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setStatus(null); setChecking(true); setError(""); setErrorCode(""); setRevision(++revisionRef.current);
    try {
      const value = authStatusSchema.parse(await requestAPI("/api/auth/status", { signal: controller.signal }));
      if (pending.current !== controller || controller.signal.aborted) return;
      if (expectedAccountId && value.account?.id !== expectedAccountId) throw Error("Your browser account changed. Reload to open the current account.");
      setStatus(value);
      return value;
    } catch (failure) { if (pending.current === controller && !controller.signal.aborted) { setError(failure instanceof Error ? failure.message : "Account connections could not be checked."); setErrorCode(failure instanceof APIError ? failure.code : ""); } }
    finally { if (pending.current === controller) { pending.current = null; setChecking(false); } }
  }, [expectedAccountId]);
  useEffect(() => {
    const returned = () => { if (document.visibilityState === "visible") void refresh(); else { setStatus(null); setChecking(true); setRevision(++revisionRef.current); pending.current?.abort(); } };
    let disposed = false; queueMicrotask(() => { if (!disposed) void refresh(); }); document.addEventListener("visibilitychange", returned); window.addEventListener("pageshow", returned); window.addEventListener("focus", returned);
    return () => { disposed = true; invalidateRevision(); pending.current?.abort(); pending.current = null; document.removeEventListener("visibilitychange", returned); window.removeEventListener("pageshow", returned); window.removeEventListener("focus", returned); };
  }, [refresh, invalidateRevision]);
  return { status, error, errorCode, checking, refresh, revision, currentRevision };
}
