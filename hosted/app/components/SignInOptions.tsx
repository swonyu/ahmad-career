"use client";
import GoogleSignInArtwork from "./GoogleSignInArtwork";
import SessionRecovery from "./SessionRecovery";
import { useAuthStatus } from "./provider-auth";

export default function SignInOptions({ destination }: { destination: "connect" | "account" | "phone" }) {
  const { status, checking, error, errorCode, refresh } = useAuthStatus();
  return <div className="sign-in-options">
    {errorCode === "invalid_session" && <SessionRecovery />}
    {status?.providers.google.configured && <a className="google-sign-in-button" href={`/auth/google/start?return_to=%2F${destination}`} target="_top"><GoogleSignInArtwork /></a>}
    <a className={`button ${status?.providers.google.configured ? "secondary" : "primary"} full`} href={`/signin-with-chatgpt?return_to=%2F${destination}`} target="_top">Continue with ChatGPT</a>
    <p className="small muted">Use the same account to recover your existing workspace. You can also choose Google on the secure ChatGPT sign-in screen. To add a different sign-in method to an existing workspace, sign in first and connect it from Account.</p>
    {checking && <p className="small muted" role="status">Checking available sign-in methods…</p>}
    {error && <p className="small muted" role="status">Additional sign-in methods could not be checked. ChatGPT sign-in remains available. <button className="text-link" onClick={() => void refresh()}>Check again</button></p>}
    {status && !status.providers.google.configured && <p className="small muted">Direct Google sign-in is awaiting service-owner setup.</p>}
    <p className="small muted">Career Finder does not receive your provider passwords or read your ChatGPT conversations. Browsing jobs does not require an account.</p>
  </div>;
}
