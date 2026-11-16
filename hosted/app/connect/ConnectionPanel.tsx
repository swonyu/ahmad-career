"use client";
import { useEffect, useState } from "react";
import { readAPI, apiMessage } from "../components/api";
const SERVICE_ORIGIN = "https://career-finder-service.jazzy-drake-8323.chatgpt.site";
type Pairing = { pairingCode: string; expiresAt: string; origin: string };
export default function ConnectionPanel({ signedIn, displayName }: { signedIn: boolean; displayName: string }) {
  const [busy, setBusy] = useState(false); const [pairing, setPairing] = useState<Pairing | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [now, setNow] = useState(0);
  useEffect(() => { if (!pairing) return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [pairing]);
  const remaining = pairing ? Math.max(0, Math.ceil((Date.parse(pairing.expiresAt) - now) / 1000)) : 0;
  const active = Boolean(pairing && remaining > 0);
  async function generate() {
    if (busy) return; setBusy(true); setError(""); setNotice(""); setPairing(null);
    try {
      const response = await fetch("/api/account/pairing", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", credentials: "same-origin", cache: "no-store", redirect: "error" });
      const result = await readAPI(response);
      if (!response.ok || result.ok !== true) throw new Error(apiMessage(result, "A connection code could not be created. Try again."));
      if (typeof result.pairingCode !== "string" || !/^[A-Z0-9 -]{16,24}$/.test(result.pairingCode) || typeof result.expiresAt !== "string" || !Number.isFinite(Date.parse(result.expiresAt)) || result.origin !== SERVICE_ORIGIN) throw new Error("The connection response could not be verified. Please try again.");
      setNow(Date.now()); setPairing({ pairingCode: result.pairingCode, expiresAt: result.expiresAt, origin: result.origin });
    } catch (e) { setError(e instanceof Error ? e.message : "The connection service is unavailable. Please try again."); } finally { setBusy(false); }
  }
  async function copy(value: string, label: string) { try { await navigator.clipboard.writeText(value); setNotice(`${label} copied.`); } catch { setNotice(`Select and copy the ${label.toLowerCase()} shown below.`); } }
  return <section className="card connection-card" aria-labelledby="connection-heading"><div className="card-heading"><span className="round-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="7" y="2" width="10" height="20" rx="3" stroke="currentColor" strokeWidth="1.7"/><path d="M10 5h4M11 19h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></span><span className="pill">Secure phone connection</span></div><h2 id="connection-heading">Connect your phone</h2><p className="muted">Your app stays on your phone. This page manages its secure connection.</p>
    {!signedIn ? <><a className="button primary full" href="/signin-with-chatgpt?return_to=%2Fconnect" target="_top">Continue with ChatGPT <svg className="arrow-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" /></svg></a><p className="small muted">Sign in with the account you want to use for recovery. Your ChatGPT conversations are not read by this service.</p></> : <><div className="signed-in"><span className="avatar" aria-hidden="true">✓</span><div><span className="small muted">Signed in securely</span><p>{displayName}</p></div><a className="small text-link" href="/signout-with-chatgpt?return_to=%2Fconnect" target="_top">Sign out</a></div><button className="button primary full" onClick={generate} disabled={busy} aria-busy={busy}>{busy ? "Creating your code…" : active ? "Replace connection code" : "Create connection code"}<svg className="arrow-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg></button><p className="small muted">A new code replaces your earlier unused code. Keep it private and enter it only in Career Finder.</p></>}
    {error && <div className="alert error" role="alert">{error}</div>}
    {pairing && <div className={`pairing ${active ? "" : "expired"}`}><div className="pairing-label"><h3>Your one-time code</h3><span className="small">{active ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} remaining` : "Expired"}</span></div><output className="pairing-code" aria-label="Your connection code">{pairing.pairingCode.replace(/[ -]/g, "").match(/.{1,4}/g)?.join(" ")}</output><button className="button secondary full" onClick={() => copy(pairing.pairingCode, "Connection code")} disabled={!active}>Copy code</button><p className="small muted">In the app, open Settings → Connect service and enter this code.</p></div>}
    <div className="origin-field"><label htmlFor="service-origin">Service address</label><div className="input-with-action"><input id="service-origin" value={SERVICE_ORIGIN} readOnly spellCheck={false} onFocus={e => e.currentTarget.select()} /><button onClick={() => copy(SERVICE_ORIGIN, "Service address")} aria-label="Copy service address">Copy</button></div><p className="small muted">The current phone preview fills this address for new connections.</p></div><p className="copy-status small" role="status" aria-live="polite">{notice}</p><div className="card-bottom"><a href="/privacy">How your data is used</a><a href="/support">Need a hand?</a></div></section>;
}
