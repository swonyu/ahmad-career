"use client";
import { useI18n } from "../i18n/LocaleProvider";
import { useLayoutEffect, useRef, useState } from "react";
import { requestAPI } from "./api";
import { internalAuthRedirect } from "./provider-auth";

export default function SignOutButton({ accountId, className = "text-link" }: { accountId: string; className?: string }) {
  return <AccountSignOut key={accountId} accountId={accountId} className={className} />;
}

function AccountSignOut({ accountId, className }: { accountId: string; className: string }) {
  const { t } = useI18n();
  const [state, setState] = useState({ accountId, busy: false, error: "", next: "signout" as "signout" | "continue" | "account" });
  const busy = state.accountId === accountId && state.busy, error = state.accountId === accountId ? state.error : "";
  const next = state.accountId === accountId ? state.next : "signout";
  const generation = useRef(0);
  const pending = useRef<{ controller: AbortController; generation: number } | null>(null);
  const continuation = useRef<{ generation: number; destination: string | null } | null>(null);
  useLayoutEffect(() => {
    const revision = ++generation.current;
    const suspend = () => {
      const operation = pending.current, approved = continuation.current;
      if (operation?.generation !== revision && approved?.generation !== revision) return;
      if (operation?.generation === revision) { operation.controller.abort(); pending.current = null; }
      // A later account may have replaced this one while the page was inactive.
      // Check the current account instead of replaying a mutation or platform logout.
      continuation.current = { generation: revision, destination: null };
      setState({ accountId, busy: false, next: "account", error: "Sign-out may have completed. Check your current account before trying again." });
    };
    const visibility = () => { if (document.visibilityState !== "visible") suspend(); };
    window.addEventListener("blur", suspend); document.addEventListener("visibilitychange", visibility);
    return () => {
      if (generation.current === revision) generation.current = revision + 1;
      const operation = pending.current;
      if (operation?.generation === revision) { operation.controller.abort(); pending.current = null; }
      if (continuation.current?.generation === revision) continuation.current = null;
      window.removeEventListener("blur", suspend); document.removeEventListener("visibilitychange", visibility);
    };
  }, [accountId]);
  return <span className="signout-control"><button type="button" className={className} disabled={busy} onClick={async () => {
    if (pending.current) return;
    const approved = continuation.current;
    if (approved?.generation === generation.current) {
      // Reuse a confirmed destination after a cancelled unload. Do not POST again.
      // Neither this action nor the initial redirect suppresses unsaved-edit checks.
      try { window.location.assign(approved.destination ?? new URL("/account", window.location.origin).href); }
      catch { setState({ accountId, busy: false, next: approved.destination ? "continue" : "account", error: "Sign-out could not be confirmed." }); }
      return;
    }
    const operation = { controller: new AbortController(), generation: generation.current };
    pending.current = operation;
    const current = () => pending.current === operation && generation.current === operation.generation && !operation.controller.signal.aborted;
    setState({ accountId, busy: true, next: "signout", error: "" });
    try {
      const result = await requestAPI("/api/auth/signout", { method: "POST", body: { expectedAccountId: accountId }, signal: operation.controller.signal });
      if (!current()) return;
      const destination = internalAuthRedirect(result.redirectTo, window.location.origin);
      continuation.current = { generation: operation.generation, destination };
      setState({ accountId, busy: false, next: "continue", error: "" });
      window.location.assign(destination);
    } catch (failure) {
      if (current()) setState({ accountId, busy: false, next: continuation.current?.destination ? "continue" : "signout", error: failure instanceof Error ? failure.message : "Sign-out could not be confirmed." });
    } finally { if (pending.current === operation) pending.current = null; }
  }}>{busy ? t("Signing out…") : next === "continue" ? t("Continue signing out") : next === "account" ? t("Check current account") : t("Sign out")}</button>{error && <span className="small" role="alert">{t(error)}</span>}{next === "continue" && !error && <span className="small" role="status">{t("Your sign-out request was confirmed. Continue to finish signing out.")}</span>}</span>;
}
