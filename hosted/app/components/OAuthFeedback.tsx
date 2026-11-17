"use client";
import { useEffect, useState } from "react";
import { requestAPI } from "./api";
import { authStatusSchema, oauthReturn } from "./provider-auth";

export default function OAuthFeedback() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const url = new URL(window.location.href), feedback = oauthReturn(url.search);
    if (!feedback) return;
    const { provider, result } = feedback;
    // URL feedback never establishes identity or a successful connection. Verify
    // successful returns with the service, and never render provider error text.
    url.searchParams.delete("oauth_provider"); url.searchParams.delete("oauth_result"); window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    const controller = new AbortController(), label = provider === "google" ? "Google" : "LinkedIn";
    void (async () => {
      await Promise.resolve(); if (controller.signal.aborted) return;
      if (result === "cancelled" || result === "failed") { setMessage(result === "cancelled" ? `${label} connection was cancelled. You can try again when you are ready.` : `${label} sign-in or connection could not be completed. Check Account before trying again.`); return; }
      try {
        const current = authStatusSchema.parse(await requestAPI("/api/auth/status", { signal: controller.signal }));
        if (controller.signal.aborted) return;
        const confirmed = current.account && (result === "connected" ? current.providers[provider].connected : provider === "google" && current.account.method === "google");
        setMessage(confirmed ? result === "connected" ? `${label} is connected to your current Career Finder account.` : "Google sign-in is confirmed. You can open your Career Finder workspace." : `${label} returned to Career Finder. Open Account to check which connection is active.`);
      } catch { if (!controller.signal.aborted) setMessage(`${label} returned, but the current account could not be checked. Open Account or retry when the service is available.`); }
    })();
    return () => controller.abort();
  }, []);
  return message ? <div className="oauth-feedback alert" role="status"><p>{message} <a href="/account">Open Account</a></p><button className="text-link" onClick={() => setMessage("")} aria-label="Dismiss sign-in update">Dismiss</button></div> : null;
}
