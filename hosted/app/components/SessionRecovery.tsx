"use client";
import { useI18n } from "../i18n/LocaleProvider";
import { useState } from "react";
import { requestAPI } from "./api";
import { internalAuthRedirect } from "./provider-auth";

export default function SessionRecovery({ accountId = "" }: { accountId?: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <div className="session-recovery"><p className="small muted">{t("Clear the expired Career Finder sign-in to choose your account again. Saved workspace records are not deleted.")}</p><button className="button secondary" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const result = await requestAPI("/api/auth/signout", { method: "POST", body: { expectedAccountId: accountId } }); window.location.assign(internalAuthRedirect(result.redirectTo, window.location.origin)); } catch (failure) { setError(failure instanceof Error ? failure.message : "Sign-in recovery could not be completed."); setBusy(false); } }}>{busy ? t("Clearing expired sign-in…") : t("Clear expired sign-in")}</button>{error && <p className="small" role="alert">{t(error)}</p>}</div>;
}
