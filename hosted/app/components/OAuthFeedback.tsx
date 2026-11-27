"use client";
import { useI18n } from "../i18n/LocaleProvider";
import { useEffect, useState } from "react";
import { requestAPI } from "./api";
import { authStatusSchema, oauthReturn } from "./provider-auth";

type Feedback = { text: string; tone: "alert" | "status" };

export default function OAuthFeedback() {
  const { t } = useI18n();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href), returned = oauthReturn(url.search);
    if (!returned) return;
    const { provider, result } = returned;
    // URL feedback never establishes identity or a successful connection. Verify
    // successful returns with the service, and never render provider error text.
    url.searchParams.delete("oauth_provider"); url.searchParams.delete("oauth_result"); window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    const controller = new AbortController(), label = provider === "google" ? "Google" : "LinkedIn";
    void (async () => {
      await Promise.resolve(); if (controller.signal.aborted) return;
      if (result === "already_linked") { setFeedback({ tone: "alert", text: `This ${label} account is already connected to another Career Finder account. To open that account, choose Sign out on Account, then sign in with ${label}. Any saved data stays with its original account.` }); return; }
      if (result === "email_required") { setFeedback({ tone: "alert", text: "LinkedIn did not provide a verified email address. Sign in with ChatGPT or Google, then connect your LinkedIn profile from Account. No new account or session was created." }); return; }
      if (result === "cancelled" || result === "failed") { setFeedback({ tone: result === "cancelled" ? "status" : "alert", text: result === "cancelled" ? `${label} connection was cancelled. You can try again when you are ready.` : `${label} sign-in or connection could not be completed. Check Account before trying again.` }); return; }
      try {
        const current = authStatusSchema.parse(await requestAPI("/api/auth/status", { signal: controller.signal }));
        if (controller.signal.aborted) return;
        const confirmed = current.account && (result === "connected" ? current.providers[provider].connected : current.account.method === provider && current.providers[provider].connected);
        setFeedback(confirmed ? { tone: "status", text: result === "connected" ? `${label} is connected to your current Career Finder account.` : `${label} sign-in is confirmed. You can open your Career Finder workspace.` } : { tone: "alert", text: `${label} returned to Career Finder. Open Account to check which connection is active.` });
      } catch { if (!controller.signal.aborted) setFeedback({ tone: "alert", text: `${label} returned, but the current account could not be checked. Open Account or retry when the service is available.` }); }
    })();
    return () => controller.abort();
  }, []);
  if (!feedback) return null;
  return <div className={`oauth-feedback alert${feedback.tone === "alert" ? " error" : ""}`} role={feedback.tone}><p>{t(feedback.text)} <a href="/account">{t("Open Account")}</a></p><button type="button" className="text-link" onClick={() => setFeedback(null)} aria-label={t("Dismiss sign-in update")}>{t("Dismiss")}</button></div>;
}
