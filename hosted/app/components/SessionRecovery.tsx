"use client";
import { useI18n } from "../i18n/LocaleProvider";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { requestAPI } from "./api";
import { internalAuthRedirect } from "./provider-auth";

export default function SessionRecovery({ accountId = "" }: { accountId?: string }) {
  return <SessionRecoveryAction key={accountId} accountId={accountId} />;
}

function SessionRecoveryAction({ accountId }: { accountId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState({ accountId, busy: false, error: "" });
  const busy = state.accountId === accountId && state.busy, error = state.accountId === accountId ? state.error : "";
  const generation = useRef(0);
  const pending = useRef<{ controller: AbortController; generation: number } | null>(null);
  const descriptionId = useId();
  const actionRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const revision = ++generation.current;
    return () => {
      if (generation.current === revision) generation.current = revision + 1;
      const operation = pending.current;
      if (operation?.generation === revision) { operation.controller.abort(); pending.current = null; }
    };
  }, [accountId]);
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return;
    if (active && active !== document.body && active !== document.documentElement) return;
    actionRef.current?.focus();
  }, []);
  return <div className="session-recovery">
    <p className="small muted" id={descriptionId}>{t("Clear the expired Career Finder sign-in to choose your account again. Saved workspace records are not deleted.")}</p>
    <button ref={actionRef} type="button" className="button secondary" aria-describedby={descriptionId} disabled={busy} onClick={async () => {
      if (pending.current) return;
      const operation = { controller: new AbortController(), generation: generation.current };
      pending.current = operation;
      const current = () => pending.current === operation && generation.current === operation.generation && !operation.controller.signal.aborted;
      setState({ accountId, busy: true, error: "" });
      try {
        const result = await requestAPI("/api/auth/signout", { method: "POST", body: { expectedAccountId: accountId }, signal: operation.controller.signal });
        if (!current()) return;
        window.location.assign(internalAuthRedirect(result.redirectTo, window.location.origin));
      } catch (failure) {
        if (current()) setState({ accountId, busy: false, error: failure instanceof Error ? failure.message : "Sign-in recovery could not be completed." });
      } finally { if (pending.current === operation) pending.current = null; }
    }}>{busy ? t("Clearing expired sign-in…") : t("Clear expired sign-in")}</button>
    {error && <p className="small alert error" role="alert">{t(error)}</p>}
  </div>;
}
