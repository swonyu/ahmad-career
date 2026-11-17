"use client";
import { useI18n } from "../i18n/LocaleProvider";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import GoogleSignInArtwork from "./GoogleSignInArtwork";
import SessionRecovery from "./SessionRecovery";
import { requestAPI } from "./api";
import { useAuthStatus, type Provider } from "./provider-auth";
import { captureDisconnect, createProviderChanges, matchesDisconnect, type DisconnectTarget } from "./provider-change";

export default function ProviderConnections({ accountId }: { accountId: string }) {
  const { t } = useI18n();
  const { status, error, errorCode, checking, refresh, revision, currentRevision } = useAuthStatus(accountId);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [notice, setNotice] = useState<{ revision: number; text: string; error?: boolean } | null>(null);
  const [disconnect, setDisconnect] = useState<DisconnectTarget | null>(null);
  const confirmPromptRef = useRef<HTMLParagraphElement>(null);
  const restoreDisconnect = useRef<Provider | null>(null);
  const disconnectButtonRef = useRef<Partial<Record<Provider, HTMLButtonElement | null>>>({});
  const view = useMemo(() => ({ accountId, revision, verified: Boolean(status?.account?.id === accountId && !checking), connections: { google: status?.providers.google.connectionId ?? null, linkedin: status?.providers.linkedin.connectionId ?? null } }), [accountId, revision, status, checking]);
  const [changes] = useState(() => createProviderChanges(view, requestAPI, { currentRevision, visible: () => document.visibilityState === "visible" }));
  useLayoutEffect(() => { changes.update(view); }, [changes, view]);
  useEffect(() => {
    changes.open();
    const invalidated = () => { changes.cancel(); setBusy(null); setDisconnect(null); setNotice(null); };
    document.addEventListener("visibilitychange", invalidated); window.addEventListener("pageshow", invalidated); window.addEventListener("focus", invalidated);
    return () => { changes.close(); document.removeEventListener("visibilitychange", invalidated); window.removeEventListener("pageshow", invalidated); window.removeEventListener("focus", invalidated); };
  }, [changes]);
  async function change(provider: Provider, target?: DisconnectTarget) {
    if (changes.busyProvider() || !view.verified) return;
    const requestRevision = currentRevision();
    setBusy(provider); setNotice(null);
    try {
      const result = await changes.change(provider, target);
      if (!result || changes.isClosed() || currentRevision() !== requestRevision || document.visibilityState !== "visible") return;
      if (result.kind === "disconnect") {
        setDisconnect(null);
        // Confirm the service's resulting state before presenting success.
        const refreshResult = refresh(), confirmationRevision = currentRevision();
        const confirmed = await refreshResult;
        if (!changes.isClosed() && currentRevision() === confirmationRevision && document.visibilityState === "visible" && confirmed?.account?.id === accountId) {
          setNotice({ revision: confirmationRevision, error: confirmed.providers[provider].connected, text: confirmed.providers[provider].connected ? "This provider is currently connected. Review its current status before making another change." : `${provider === "google" ? "Google" : "LinkedIn"} disconnected. Your Career Finder profile and applications were kept.` });
        }
      } else window.location.assign(result.authorizationUrl);
    } catch (failure) {
      if (!changes.isClosed() && currentRevision() === requestRevision && document.visibilityState === "visible") {
        setDisconnect(null);
        setNotice({ revision: requestRevision, error: true, text: failure instanceof Error ? failure.message : "This connection could not be changed. Check its current status before trying again." });
      }
    } finally { if (!changes.isClosed()) setBusy(changes.busyProvider()); }
  }
  const activeDisconnect = disconnect && matchesDisconnect(view, disconnect) ? disconnect : null;
  useLayoutEffect(() => {
    if (activeDisconnect) { confirmPromptRef.current?.focus(); return; }
    const provider = restoreDisconnect.current;
    if (!provider) return;
    restoreDisconnect.current = null;
    disconnectButtonRef.current[provider]?.focus();
  }, [activeDisconnect]);
  return <section className="card"><h2>{t("Sign-in and professional connections")}</h2><p className="muted">{t("Connect only accounts you own. Connections never merge workspaces just because their email addresses match.")}</p>
    {checking && <p role="status">{t("Checking your account connections…")}</p>}{error && <div><p className="alert error" role="alert">{t(error)}</p>{errorCode === "invalid_session" && <SessionRecovery accountId={accountId} />}<button type="button" className="text-link" disabled={Boolean(busy)} onClick={() => { changes.cancel(); setDisconnect(null); setNotice(null); void refresh(); }}>{t("Check again")}</button></div>}
    {notice && notice.revision === revision && !checking && status?.account?.id === accountId && <p className={`alert${notice.error ? " error" : ""}`} role={notice.error ? "alert" : "status"}>{t(notice.text)}{notice.error && <button type="button" className="text-link" disabled={Boolean(busy)} onClick={() => { changes.cancel(); setDisconnect(null); setNotice(null); void refresh(); }}>{t("Check current connection")}</button>}</p>}
    {status && (["google", "linkedin"] as const).map(provider => { const value = status.providers[provider], label = provider === "google" ? "Google" : "LinkedIn"; return <div className="provider-row" key={provider}><h3>{t(label)}</h3><p className="small muted">{provider === "google" ? t("Use Google to sign in to this same Career Finder workspace.") : t("Connect your basic LinkedIn profile. This does not import your CV, search private LinkedIn data, verify your identity, or allow job applications through LinkedIn.")}</p>
      {value.connected ? <><p className="small">{t("Connected")}{value.displayName ? t(" as {0}", [value.displayName]) : ""}.</p>{activeDisconnect?.provider === provider ? <div className="inline-confirm"><p ref={confirmPromptRef} tabIndex={-1}>{t("Disconnect ")}{t(label)} {t(" from this workspace? Your saved profile and application history stay in Career Finder. Your only sign-in method cannot be removed.")}</p><div className="action-row"><button type="button" className="button danger-outline" disabled={Boolean(busy)} onClick={() => void change(provider, activeDisconnect)}>{t("Confirm disconnect")}</button><button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => { restoreDisconnect.current = provider; setDisconnect(null); }}>{t("Keep connected")}</button></div></div> : <button type="button" className="button secondary" ref={(node) => { disconnectButtonRef.current[provider] = node; }} disabled={Boolean(busy)} onClick={() => setDisconnect(captureDisconnect(view, provider))}>{t("Disconnect ")}{t(label)}</button>}</> : value.configured ? <button type="button" className={provider === "google" ? "google-sign-in-button" : "button secondary"} aria-label={busy === provider ? undefined : t("Connect {0} to this Career Finder account", [label])} disabled={Boolean(busy)} onClick={() => void change(provider)}>{busy === provider ? t("Opening secure sign-in…") : provider === "google" ? <GoogleSignInArtwork decorative /> : t("Connect {0}", [label])}</button> : <p className="small muted">{t(label)} {t(" connection is not available on this service yet. The service owner must finish provider setup before it can be offered here.")}</p>}
    </div>; })}
  </section>;
}
