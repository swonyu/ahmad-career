"use client";
import { useI18n } from "../i18n/LocaleProvider";
import { formatNumber } from "../i18n/core";
import { useAuthStatus } from "../components/provider-auth";
import SessionRecovery from "../components/SessionRecovery";
import SignOutButton from "../components/SignOutButton";
import { useEffect, useRef, useState } from "react";
import { APIError, requestAPI } from "../components/api";
import SignInOptions from "../components/SignInOptions";
import { SERVICE_ORIGIN, parsePairingResponse, pairingSecondsRemaining, type Pairing } from "./pairing-response";
const copyMessages = {
  "Connection code": { success: "Connection code copied.", failure: "Select and copy the displayed connection code." },
  "Service address": { success: "Service address copied.", failure: "Select and copy the displayed service address." },
} as const;

export default function ConnectionPanel({ signedIn, displayName, accountId }: { signedIn: boolean; displayName: string; accountId: string }) {
  const { t, language } = useI18n();
  const { status: auth, checking: checkingIdentity, error: identityError, errorCode: identityErrorCode, refresh: checkIdentity, revision: identityRevision } = useAuthStatus(accountId || undefined);
  const identityVerified = Boolean(accountId && auth?.account?.id === accountId);
  const [busy, setBusy] = useState(false); const [pairing, setPairing] = useState<Pairing | null>(null);
  const [pairingRevision, setPairingRevision] = useState(-1);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [now, setNow] = useState(0);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [accountChanged, setAccountChanged] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  useEffect(() => { if (!pairing) return; const id = window.setInterval(() => setNow(performance.now()), 1000); return () => clearInterval(id); }, [pairing]);
  const remaining = pairingSecondsRemaining(pairing, now);
  const active = Boolean(pairing && remaining > 0 && identityVerified && !checkingIdentity && pairingRevision === identityRevision);
  async function generate() {
    if (pending.current || !accountId || accountChanged || needsSignIn || checkingIdentity || !identityVerified) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(""); setNotice(""); setPairing(null); setNeedsSignIn(false);
    const requestStarted = performance.now();
    try {
      const result = await requestAPI("/api/account/pairing", { method: "POST", body: { expectedAccountId: accountId }, signal: controller.signal });
      if (pending.current !== controller || controller.signal.aborted) return;
      const receivedAt = performance.now();
      const verified = parsePairingResponse(result, requestStarted, receivedAt);
      setNow(receivedAt); setPairing(verified); setPairingRevision(identityRevision);
    } catch (e) {
      if (pending.current !== controller || controller.signal.aborted) return;
      setNeedsSignIn(e instanceof APIError && e.status === 401);
      setAccountChanged(e instanceof APIError && e.code === "account_changed");
      setError(e instanceof Error ? e.message : "The connection service is unavailable. Please try again.");
    } finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }
  async function copy(value: string, label: keyof typeof copyMessages) {
    try { await navigator.clipboard.writeText(value); setNotice(copyMessages[label].success); }
    catch { setNotice(copyMessages[label].failure); }
  }
  async function copyCode() {
    const current = performance.now(); setNow(current);
    if (checkingIdentity || !identityVerified || pairingRevision !== identityRevision || document.visibilityState !== "visible") { setPairing(null); setNotice("Confirm your account before copying a connection code."); return; }
    if (!pairing || pairingSecondsRemaining(pairing, current) === 0) { setNotice("The code has expired. Create a new one before connecting."); return; }
    await copy(pairing.pairingCode, "Connection code");
  }
  return <section className="card connection-card" aria-labelledby="connection-heading"><div className="card-heading"><span className="round-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="7" y="2" width="10" height="20" rx="3" stroke="currentColor" strokeWidth="1.7"/><path d="M10 5h4M11 19h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></span><span className="pill">{t("Secure phone connection")}</span></div><h2 id="connection-heading">{t("Connect your phone")}</h2><p className="muted">{t("Sign in, create a code, then enter it in Career Finder. Your existing phone draft stays on your phone until you choose to save it online.")}</p>
    {checkingIdentity ? <p role="status">{t("Confirming your account before showing private connection details…")}</p> : identityError ? <div className="alert error" role="alert">{t(identityError)}{identityErrorCode === "invalid_session" && <SessionRecovery accountId={accountId} />}<button className="text-link" onClick={() => void checkIdentity()}>{t("Check account again")}</button><a className="text-link" href="/connect">{t("Reload sign-in")}</a></div> : !signedIn || needsSignIn || !identityVerified ? <SignInOptions destination="connect" /> : accountChanged ? <p className="alert" role="status">{t("Your browser account changed. Reload to confirm the account before creating a connection code.")}</p> : <><div className="signed-in"><span className="avatar" aria-hidden="true">✓</span><div><span className="small muted">{t("Signed in securely")}</span><p dir="auto">{auth?.account?.displayName || displayName}</p></div><SignOutButton accountId={accountId} className="small text-link" /></div><button className="button primary full" onClick={generate} disabled={busy || !accountId} aria-busy={busy}>{busy ? t("Creating your code…") : active ? t("Replace connection code") : t("Create connection code")}<svg className="arrow-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg></button><p className="small muted">{t("A new code replaces your earlier unused code. Keep it private and enter it only in Career Finder.")}</p></>}
    {error && <div className="alert error" role="alert">{t(error)}{accountChanged ? <a className="text-link" href="/connect">{t("Reload sign-in")}</a> : needsSignIn && <a className="text-link" href="/signin-with-chatgpt?return_to=%2Fconnect" target="_top">{t("Sign in again")}</a>}</div>}
    {pairing && identityVerified && !checkingIdentity && pairingRevision === identityRevision && <div className={`pairing ${active ? "" : "expired"}`}><div className="pairing-label"><h3>{t("Your one-time code")}</h3><span className="small">{active ? <><bdi dir="ltr">{formatNumber(Math.floor(remaining / 60), language)}:{formatNumber(remaining % 60, language, { minimumIntegerDigits: 2 })}</bdi> {t("remaining")}</> : t("Expired")}</span></div><output className="pairing-code" dir="ltr" aria-label={t("Your connection code")}>{pairing.pairingCode.replace(/[ -]/g, "").match(/.{1,4}/g)?.join(" ")}</output><button className="button secondary full" onClick={copyCode} disabled={!active}>{t("Copy code")}</button><p className="small muted">{t("Open the phone app’s connection settings and enter this code. ")}{active ? t("Keep the code private.") : t("Create a new code above to connect.")}</p></div>}
    <details className="connection-address"><summary>{t("Service address for older app versions")}</summary><div className="origin-field"><label htmlFor="service-origin">{t("Career Finder service address")}</label><div className="input-with-action"><input id="service-origin" dir="ltr" value={SERVICE_ORIGIN} readOnly spellCheck={false} onFocus={e => e.currentTarget.select()} /><button onClick={() => copy(SERVICE_ORIGIN, "Service address")} aria-label={t("Copy service address")}>{t("Copy")}</button></div><p className="small muted">{t("Current phone versions already use this address. Copy it only if your app asks for it.")}</p></div></details><p className="copy-status small" role="status" aria-live="polite">{t(notice)}</p><div className="card-bottom"><a href="/privacy">{t("How your data is used")}</a><a href="/support">{t("Need a hand?")}</a></div></section>;
}
