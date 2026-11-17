"use client";
import { useI18n } from "../i18n/LocaleProvider";
import { useState } from "react";
import { requestAPI } from "./api";
import { internalAuthRedirect } from "./provider-auth";

export default function SignOutButton({ accountId, className = "text-link" }: { accountId: string; className?: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <span className="signout-control"><button className={className} disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const result = await requestAPI("/api/auth/signout", { method: "POST", body: { expectedAccountId: accountId } }); window.location.assign(internalAuthRedirect(result.redirectTo, window.location.origin)); } catch (failure) { setError(failure instanceof Error ? failure.message : "Sign-out could not be confirmed."); setBusy(false); } }}>{busy ? t("Signing out…") : t("Sign out")}</button>{error && <span className="small" role="alert">{t(error)}</span>}</span>;
}
