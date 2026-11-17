"use client";
import { useState } from "react";
import { requestAPI } from "./api";
import { internalAuthRedirect } from "./provider-auth";

export default function SignOutButton({ accountId, className = "text-link" }: { accountId: string; className?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <span className="signout-control"><button className={className} disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const result = await requestAPI("/api/auth/signout", { method: "POST", body: { expectedAccountId: accountId } }); window.location.assign(internalAuthRedirect(result.redirectTo, window.location.origin)); } catch (failure) { setError(failure instanceof Error ? failure.message : "Sign-out could not be confirmed."); setBusy(false); } }}>{busy ? "Signing out…" : "Sign out"}</button>{error && <span className="small" role="alert">{error}</span>}</span>;
}
