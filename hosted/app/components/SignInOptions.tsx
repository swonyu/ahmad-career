"use client";
import { useI18n } from "../i18n/LocaleProvider";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import GoogleSignInArtwork from "./GoogleSignInArtwork";
import SessionRecovery from "./SessionRecovery";
import { useAuthStatus } from "./provider-auth";

export default function SignInOptions({ destination }: { destination: "connect" | "account" | "phone" }) {
  const { t } = useI18n();
  const { status, checking, error, errorCode, refresh } = useAuthStatus();
  const google = Boolean(status?.providers.google.configured);
  // Older services only support linking LinkedIn after sign-in. A configured
  // basic connection alone must never expose a direct-login link.
  const linkedin = Boolean(status?.providers.linkedin.configured && "signInSupported" in status.providers.linkedin && status.providers.linkedin.signInSupported === true);
  const unavailable = checking ? "Checking availability…" : error || !status ? "Availability could not be confirmed" : "Awaiting service setup";
  return <div className="sign-in-options">
    {errorCode === "invalid_session" && <SessionRecovery />}
    <div className="provider-sign-in-grid">
      <div className="provider-sign-in-choice">{google ? <a className="google-sign-in-button" href={`/auth/google/start?return_to=%2F${destination}`} target="_top"><GoogleSignInArtwork /></a> : <><button className="google-sign-in-button" disabled aria-label={t("Google sign-in unavailable")}><GoogleSignInArtwork decorative /></button><p className="provider-availability">{t("Google · ")}{t(unavailable)}</p></>}</div>
      <div className="provider-sign-in-choice">{linkedin ? <a className="button linkedin-sign-in full" href={`/auth/linkedin/start?return_to=%2F${destination}`} target="_top"><span className="linkedin-monogram" lang="en" dir="ltr" aria-hidden="true">in</span>{t("Sign in with LinkedIn")}<ArrowUpRight size={16} aria-hidden="true" /></a> : <><button className="button linkedin-sign-in full" disabled><span className="linkedin-monogram" lang="en" dir="ltr" aria-hidden="true">in</span>{t("Sign in with LinkedIn")}</button><p className="provider-availability">{t("LinkedIn · ")}{t(unavailable)}</p></>}</div>
    </div>
    <div className="sign-in-divider"><span>{t("or")}</span></div>
    <a className="button secondary full chatgpt-sign-in" href={`/signin-with-chatgpt?return_to=%2F${destination}`} target="_top">{t("Continue with ChatGPT")}<ArrowUpRight size={17} aria-hidden="true" /></a>
    {checking && <p className="small muted" role="status">{t("Checking available sign-in methods…")}</p>}
    {error && <p className="small muted" role="status">{t("Provider availability could not be checked. ChatGPT sign-in remains available. ")}<button className="text-link" onClick={() => void refresh()}>{t("Check again")}</button></p>}
    <p className="small muted">{t("Return with the same account to recover your workspace. To add another sign-in method, open your existing workspace first and connect it in Settings.")}</p>
    <p className="sign-in-privacy"><ShieldCheck size={17} aria-hidden="true" /><span>{t("Your provider password stays with the provider. Career Finder does not read your ChatGPT conversations.")}</span></p>
  </div>;
}
