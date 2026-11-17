"use client";
import { useState } from "react";
import GoogleSignInArtwork from "./GoogleSignInArtwork";
import SessionRecovery from "./SessionRecovery";
import { requestAPI } from "./api";
import { authorizationTarget, useAuthStatus, type Provider } from "./provider-auth";

export default function ProviderConnections({ accountId }: { accountId: string }) {
  const { status, error, errorCode, checking, refresh } = useAuthStatus(accountId);
  const [busy, setBusy] = useState<Provider | null>(null), [notice, setNotice] = useState("");
  const [disconnect, setDisconnect] = useState<Provider | null>(null);
  async function change(provider: Provider, removing: boolean) {
    if (busy || !status?.account || checking) return;
    setBusy(provider); setNotice("");
    try {
      const response = await requestAPI(`/api/auth/${removing ? "disconnect" : "connect"}`, { method: "POST", body: { provider, expectedAccountId: accountId } });
      if (removing) { setDisconnect(null); setNotice(`${provider === "google" ? "Google" : "LinkedIn"} disconnected. Your Career Finder profile and applications were kept.`); await refresh(); }
      else window.location.assign(authorizationTarget(provider, response.authorizationUrl));
    } catch (failure) { setNotice(failure instanceof Error ? failure.message : "This connection could not be changed. Check its current status before trying again."); }
    finally { setBusy(null); }
  }
  return <section className="card"><h2>Sign-in and professional connections</h2><p className="muted">Connect only accounts you own. Connections never merge workspaces just because their email addresses match.</p>
    {checking && <p role="status">Checking your account connections…</p>}{error && <div className="alert error" role="alert">{error}{errorCode === "invalid_session" && <SessionRecovery accountId={accountId} />}<button className="text-link" onClick={() => void refresh()}>Check again</button></div>}
    {notice && <p className="alert" role="status">{notice}</p>}
    {status && (["google", "linkedin"] as const).map(provider => { const value = status.providers[provider], label = provider === "google" ? "Google" : "LinkedIn"; return <div className="provider-row" key={provider}><h3>{label}</h3><p className="small muted">{provider === "google" ? "Use Google to sign in to this same Career Finder workspace." : "Connect your basic LinkedIn profile. This does not import your CV, search private LinkedIn data, verify your identity, or allow job applications through LinkedIn."}</p>
      {value.connected ? <><p className="small">Connected{value.displayName ? ` as ${value.displayName}` : ""}.</p>{disconnect === provider ? <div className="inline-confirm"><p>Disconnect {label} from this workspace? Your saved profile and application history stay in Career Finder. Your only sign-in method cannot be removed.</p><div className="action-row"><button className="button danger-outline" disabled={Boolean(busy)} onClick={() => void change(provider, true)}>Confirm disconnect</button><button className="button secondary" disabled={Boolean(busy)} onClick={() => setDisconnect(null)}>Keep connected</button></div></div> : <button className="button secondary" disabled={Boolean(busy)} onClick={() => setDisconnect(provider)}>Disconnect {label}</button>}</> : value.configured ? <button className={provider === "google" ? "google-sign-in-button" : "button secondary"} aria-label={`Connect ${label} to this Career Finder account`} disabled={Boolean(busy)} onClick={() => void change(provider, false)}>{busy === provider ? "Opening secure sign-in…" : provider === "google" ? <GoogleSignInArtwork decorative /> : `Connect ${label}`}</button> : <p className="small muted">{label} connection is not available on this service yet. The service owner must finish provider setup before it can be offered here.</p>}
    </div>; })}
  </section>;
}
