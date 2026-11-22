"use client";
import { useI18n } from "../i18n/LocaleProvider";
import { formatDateTime, formatNumber, type Language } from "../i18n/core";

import { useCallback, useEffect, useRef, useState } from "react";
import { internalAuthRedirect } from "../components/provider-auth";
import { APIError, requestAPI } from "../components/api";
import ProviderConnections from "../components/ProviderConnections";
import SignOutButton from "../components/SignOutButton";
import SignInOptions from "../components/SignInOptions";

type AccountNotice = string | { kind: "recovered-uploads"; recovered: number; retryRequired: number };
function accountNoticeText(notice: AccountNotice, language: Language, t: (source: string, values?: readonly unknown[]) => string): string {
  if (typeof notice === "string") return t(notice);
  return [
    t("Recovered files: {0}.", [formatNumber(notice.recovered, language)]),
    notice.retryRequired > 0
      ? t("Files to save again from your phone: {0}.", [formatNumber(notice.retryRequired, language)])
      : t("Uploads still in progress can be checked again after one minute."),
    t("A recovered file is attached to your profile only when you explicitly save it from the phone app."),
  ].join(" ");
}

type Session = { id: string; createdAt: string; expiresAt: string };
type Document = { sha256: string; name: string; size: number; createdAt: string; state: "ready" | "uploading" | "failed" | "deleting"; removable: boolean; retentionReason?: string };
type Account = {
  accountId: string; workspaceId: string | null; email?: string; confirmedEmail: string; emailUpdateRequired: boolean; deleting: boolean;
  sessions: Session[]; documents: Document[];
  usage: { storedResumeBytes: number; jobs: number; plans: number; attempts: number };
  limits: { maxStoredResumeBytes: number; maxResumes: number; maxJobs: number; maxPlans: number; maxAttempts: number };
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Your workspace response could not be verified.");
  return value as Record<string, unknown>;
};
const count = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Your storage information could not be verified.");
  return value;
};
function parseAccount(data: Record<string, unknown>): Account {
  if (typeof data.accountId !== "string" || !data.accountId || data.accountId.length > 500) throw new Error("Your account identity could not be verified.");
  if (!(data.workspaceId === null || typeof data.workspaceId === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(data.workspaceId)) || typeof data.confirmedEmail !== "string" || data.confirmedEmail.length > 320 || typeof data.emailUpdateRequired !== "boolean" || !Array.isArray(data.sessions) || data.sessions.length > 10 || !Array.isArray(data.documents) || data.documents.length > 5 || typeof data.deleting !== "boolean") throw new Error("Your workspace response could not be verified.");
  const sessions: Session[] = data.sessions.map((value: unknown) => {
    const s = record(value);
    if (typeof s.id !== "string" || !/^[a-f0-9-]{36}$/.test(s.id) || typeof s.createdAt !== "string" || typeof s.expiresAt !== "string" || !Number.isFinite(Date.parse(s.createdAt)) || !Number.isFinite(Date.parse(s.expiresAt))) throw new Error("The phone connection list could not be verified.");
    return { id: s.id, createdAt: s.createdAt, expiresAt: s.expiresAt };
  });
  const documents: Document[] = data.documents.map((value: unknown) => {
    const d = record(value);
    if (typeof d.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(d.sha256) || typeof d.name !== "string" || d.name.length > 250 || typeof d.createdAt !== "string" || !Number.isFinite(Date.parse(d.createdAt)) || !["ready", "uploading", "failed", "deleting"].includes(String(d.state))) throw new Error("The CV records could not be verified.");
    return { sha256: d.sha256, name: d.name, size: count(d.size), createdAt: d.createdAt, state: d.state as Document["state"], removable: d.removable === true, retentionReason: typeof d.retentionReason === "string" ? d.retentionReason.slice(0, 500) : undefined };
  });
  const u = record(data.usage), l = record(data.limits);
  return { accountId: data.accountId, workspaceId: data.workspaceId, email: typeof data.email === "string" ? data.email : undefined, confirmedEmail: data.confirmedEmail, emailUpdateRequired: data.emailUpdateRequired, deleting: data.deleting, sessions, documents,
    usage: { storedResumeBytes: count(u.storedResumeBytes), jobs: count(u.jobs), plans: count(u.plans), attempts: count(u.attempts) },
    limits: { maxStoredResumeBytes: count(l.maxStoredResumeBytes), maxResumes: count(l.maxResumes), maxJobs: count(l.maxJobs), maxPlans: count(l.maxPlans), maxAttempts: count(l.maxAttempts) } };
}
function DownloadIcon() { return <svg className="arrow-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3v10M4 9l4 4 4-4" /></svg>; }
async function loadAccount(signal?: AbortSignal): Promise<Account> {
  return parseAccount(await requestAPI("/api/account", { signal }));
}

export default function AccountPanel({ expectedAccountId }: { expectedAccountId: string }) {
  const { t, language } = useI18n();
  const date = (value: string) => formatDateTime(value, language);
  const size = (bytes: number) => {
    // At two fractional MiB digits, a positive size below 0.005 MiB rounds to zero.
    if (bytes > 0 && bytes < 0.005 * 1024 * 1024) {
      return t("{0} bytes", [formatNumber(bytes, language)]);
    }
    return t("{0} MiB", [formatNumber(bytes / 1024 / 1024, language, { maximumFractionDigits: 2 })]);
  };
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState<AccountNotice>(""); const [busy, setBusy] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false); const [confirmation, setConfirmation] = useState(""); const [deleted, setDeleted] = useState(false);
  const [deletedRedirect, setDeletedRedirect] = useState("/signout-with-chatgpt?return_to=%2Faccount");
  const [deleteWorkspaceId, setDeleteWorkspaceId] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<{ session: Session; workspaceId: string; number: number } | null>(null);
  const [removeDocument, setRemoveDocument] = useState<{ sha256: string; name: string; workspaceId: string } | null>(null);
  const [loading, setLoading] = useState(true); const [needsSignIn, setNeedsSignIn] = useState(false); const [accountChanged, setAccountChanged] = useState(false);
  const readRequest = useRef<AbortController | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const readGeneration = useRef(0);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const disconnectConfirm = useRef<HTMLButtonElement>(null);
  const observedWorkspace = useRef<string | null | undefined>(undefined);
  const refresh = useCallback(() => {
    readRequest.current?.abort(); setAccount(null); setLoading(true); setDeleted(false);
    setDeleteOpen(false); setDeleteWorkspaceId(null); setConfirmation(""); setDisconnectTarget(null); setRemoveDocument(null);
    const controller = new AbortController(); readRequest.current = controller;
    const generation = ++readGeneration.current;
    return loadAccount(controller.signal).then(data => {
      if (controller.signal.aborted || generation !== readGeneration.current) return;
      if (data.accountId !== expectedAccountId) {
        // A status retry cannot replace this page's server-rendered identity.
        setAccountChanged(true); setNeedsSignIn(false);
        throw new Error("Your browser account changed. Reload this page before viewing or changing its workspace.");
      }
      if (observedWorkspace.current !== data.workspaceId) {
        if (observedWorkspace.current !== undefined) setNotice("Your workspace changed. Review its details before making another change.");
        setDeleteOpen(false); setDeleteWorkspaceId(null); setConfirmation(""); setDisconnectTarget(null);
      }
      observedWorkspace.current = data.workspaceId;
      setAccount(data); setError(""); setNeedsSignIn(false); setAccountChanged(false);
    }).catch(e => {
      if (controller.signal.aborted || generation !== readGeneration.current) return;
      if (e instanceof APIError && e.status === 401) { setAccount(null); setNeedsSignIn(true); setAccountChanged(false); setNotice(""); setDeleteOpen(false); setDeleteWorkspaceId(null); setConfirmation(""); setDisconnectTarget(null); }
      setError(e instanceof Error ? e.message : "Your workspace could not be loaded.");
    }).finally(() => {
      if (readRequest.current === controller) { readRequest.current = null; setLoading(false); }
    });
  }, [expectedAccountId]);
  useEffect(() => {
    const returned = () => {
      setAccount(null); setNotice(""); setDeleteOpen(false); setDeleteWorkspaceId(null); setConfirmation(""); setDisconnectTarget(null); setRemoveDocument(null);
      if (document.visibilityState === "visible") void refresh();
      else { readGeneration.current++; readRequest.current?.abort(); readRequest.current = null; setLoading(true); }
    };
    let disposed = false; queueMicrotask(() => { if (!disposed) void refresh(); }); document.addEventListener("visibilitychange", returned); window.addEventListener("pageshow", returned); window.addEventListener("focus", returned);
    return () => { disposed = true; readRequest.current?.abort(); readRequest.current = null; mutation.current?.abort(); mutation.current = null; document.removeEventListener("visibilitychange", returned); window.removeEventListener("pageshow", returned); window.removeEventListener("focus", returned); };
  }, [refresh]);
  useEffect(() => { if (deleteOpen) confirmationInput.current?.focus(); }, [deleteOpen]);
  useEffect(() => { if (disconnectTarget) disconnectConfirm.current?.focus(); }, [disconnectTarget]);
  function closeDelete() {
    setDeleteOpen(false); setDeleteWorkspaceId(null); setConfirmation("");
    requestAnimationFrame(() => deleteButton.current?.focus());
  }
  function cancelDisconnect() {
    const target = disconnectTarget;
    setDisconnectTarget(null);
    requestAnimationFrame(() => { if (target) document.getElementById(`disconnect-${target.session.id}`)?.focus(); });
  }
  async function mutate(action: string, path: string, body: object, method: "POST" | "DELETE" = "POST") {
    if (mutation.current) return;
    const target = body as { expectedWorkspaceId?: string | null; expectedAccountId?: string };
    if (!target.expectedWorkspaceId && !(action === "delete" && target.expectedWorkspaceId === null && target.expectedAccountId === expectedAccountId)) { setError("Reload your account before confirming this change."); return; }
    const controller = new AbortController(); mutation.current = controller;
    const generation = ++readGeneration.current; readRequest.current?.abort(); readRequest.current = null;
    setLoading(false); setBusy(action); setError(""); setNotice("");
    try {
      const data = await requestAPI(path, { method, body, signal: controller.signal });
      if (controller.signal.aborted || mutation.current !== controller || generation !== readGeneration.current) return;
      if (action === "delete") {
        if (data.deleted !== true) throw new Error("Deletion has not been confirmed. Your workspace is still shown until the service confirms it.");
        try { setDeletedRedirect(internalAuthRedirect(data.redirectTo, window.location.origin)); } catch { setDeletedRedirect("/signout-with-chatgpt?return_to=%2Faccount"); }
        setDeleted(true); setAccount(null); setConfirmation(""); setDeleteOpen(false); setDeleteWorkspaceId(null); setDisconnectTarget(null);
      } else {
        if (action === "recover") {
          const recovered = count(data.recovered), retryRequired = count(data.retryRequired);
          setNotice({ kind: "recovered-uploads", recovered, retryRequired });
        } else if (action === "remove-pdf") { if (data.removed !== true) throw new Error("PDF removal has not been confirmed. Refresh its current status."); setRemoveDocument(null); setNotice("The unused cloud PDF was removed. Your profile, application history, and duplicate protection were kept."); }
        else { setDisconnectTarget(null); setNotice("The phone’s connection was revoked. Already dispatched applications cannot be recalled."); }
        setLoading(true); await refresh();
      }
    } catch (e) {
      if (controller.signal.aborted || mutation.current !== controller || generation !== readGeneration.current) return;
      if (e instanceof APIError && e.status === 401) { setAccount(null); setNeedsSignIn(true); setAccountChanged(false); }
      else if (e instanceof APIError && e.code === "account_changed") { setAccountChanged(true); setNeedsSignIn(false); }
      if (e instanceof APIError && (e.status === 401 || e.code === "workspace_changed" || e.code === "account_changed")) {
        setAccount(null); setRemoveDocument(null); setDeleteOpen(false); setDeleteWorkspaceId(null); setConfirmation(""); setDisconnectTarget(null); setNotice("");
      }
      setError(e instanceof Error ? e.message : "This change could not be completed.");
    } finally { if (mutation.current === controller) { mutation.current = null; setBusy(""); } }
  }
  if (deleted) return <section className="card"><span className="pill">{t("Deletion completed")}</span><h2>{t("Your private service records were deleted.")}</h2><p>{t("Provider connections, browser sessions, and any cloud workspace, phone connections, saved profiles, CV contents, opportunities, and application records were removed from the active service.")}</p><p className="muted">{t("Files saved on your phones and applications received by employers remain in those places. Your provider may retain its own permission grant; you can remove that from Google or LinkedIn settings. The privacy page explains infrastructure recovery copies and empty upload markers.")}</p><a className="button primary" href={deletedRedirect} target="_top">{t("Finish signing out")}</a></section>;
  return <div className="account-sections" aria-busy={loading || Boolean(busy)}>
    {error && <div className="alert error"><p role="alert">{t(error)}</p>{needsSignIn ? <SignInOptions destination="account" /> : accountChanged ? <a className="text-link" href="/account">{t("Reload sign-in")}</a> : <button className="text-link" onClick={() => { setLoading(true); void refresh(); }} disabled={Boolean(busy) || loading}>{loading ? t("Loading…") : t("Reload current status")}</button>}</div>}
    {notice && <div className="alert" role="status">{accountNoticeText(notice, language, t)}</div>}
    {!account && !error && <section className="card" aria-busy="true"><p role="status">{t("Loading your private workspace…")}</p></section>}
    {account && <>
      <section className="card"><span className="eyebrow">{t("SIGNED IN")}</span><h2 className="account-email">{account.email || t("Your Career Finder account")}</h2><p className="muted">{account.workspaceId ? t("Use this same account to recover your workspace on a new phone. Automatic applications must use the email confirmed for this workspace.") : t("You have not created a cloud workspace yet. Create a connection code to get started.")}</p>{account.emailUpdateRequired && !account.deleting && <div className="alert" role="status"><strong>{t("Confirm your changed email.")}</strong><p>{t("Your workspace still uses ")}<span className="account-email">{account.confirmedEmail}</span>{t(". Create a fresh connection code to confirm your current sign-in email, then refresh and review your application profile in the phone app. Opening this page does not change an approved application.")}</p></div>}{account.deleting ? <p className="alert" role="status">{t("Deletion is pending. New connections, saves, and applications are paused. Finish deleting below to confirm removal.")}</p> : <a className="button primary" href="/connect">{t("Connect a phone ")}<svg className="arrow-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg></a>}</section>
      <ProviderConnections accountId={account.accountId} />
      {!account.workspaceId && <>
        <section className="card"><h2>{t("Your account connection data")}</h2><p className="muted">{t("You have no cloud workspace. You can still export or delete the provider connections and browser-session records associated with this account. Exports contain account metadata, never session credentials or provider tokens.")}</p><a className="button secondary" href={`/api/account/export?expectedAccountId=${encodeURIComponent(account.accountId)}`} download>{t("Download account connection records ")}<DownloadIcon /></a></section>
        <section className="card danger-zone"><h2>{t("Delete account connection data")}</h2><p className="muted">{t("Remove this account’s provider connections, browser sessions, and pending sign-in requests from Career Finder. Browser drafts and employer-held applications remain separate.")}</p>{!deleteOpen ? <button ref={deleteButton} className="button danger-outline" disabled={Boolean(busy) || loading} onClick={() => { setDeleteWorkspaceId(null); setConfirmation(""); setDeleteOpen(true); }}>{t("Delete account connection data")}</button> : <div className="delete-confirm"><label htmlFor="delete-confirmation">{t("Type ")}<strong>{t("DELETE")}</strong> {t(" to confirm")}</label><input id="delete-confirmation" ref={confirmationInput} value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} /><div className="action-row"><button className="button danger" disabled={confirmation !== "DELETE" || Boolean(busy) || loading} onClick={() => void mutate("delete", "/api/account", { confirmation, expectedWorkspaceId: null, expectedAccountId: account.accountId }, "DELETE")}>{busy === "delete" ? t("Deleting account records…") : t("Permanently delete")}</button><button className="button secondary" disabled={Boolean(busy) || loading} onClick={closeDelete}>{t("Keep account records")}</button></div></div>}</section>
      </>}
      {account.workspaceId && <>
        <section className="card"><div className="section-heading"><h2>{t("Connected phones")}</h2><span className="count">{account.sessions.length}</span></div><p className="muted">{t("Disconnect a lost phone or one that is no longer yours. Its locally saved draft is not erased.")}</p>{account.sessions.length === 0 ? <p className="empty-note">{t("No active phone connections. Your saved workspace is still here.")}</p> : <ul className="session-list">{account.sessions.map((s, index) => <li key={s.id} className={disconnectTarget?.session.id === s.id ? "disconnecting" : undefined}><div><h3>{t("Phone connection ")}{index + 1}</h3><p className="small muted">{t("Connected ")}{date(s.createdAt)} {t(" · Expires ")}{date(s.expiresAt)}</p></div>{disconnectTarget?.session.id === s.id ? <div className="inline-confirm" role="group" aria-label={t("Confirm disconnecting phone connection {0}", [disconnectTarget.number])}><p className="small">{t("Disconnect this phone? It will need a new connection code. Its local files stay on the device, and applications already dispatched cannot be recalled.")}</p><div className="action-row"><button ref={disconnectConfirm} className="button danger-outline" disabled={Boolean(busy) || loading} onClick={() => mutate(s.id, "/api/account/sessions/revoke", { sessionId: disconnectTarget.session.id, expectedWorkspaceId: disconnectTarget.workspaceId })}>{busy === s.id ? t("Disconnecting…") : t("Confirm disconnect")}</button><button className="button secondary" disabled={Boolean(busy) || loading} onClick={cancelDisconnect}>{t("Keep connected")}</button></div></div> : <button id={`disconnect-${s.id}`} className="button secondary" disabled={Boolean(busy) || loading} onClick={() => { if (account.workspaceId) setDisconnectTarget({ session: s, workspaceId: account.workspaceId, number: index + 1 }); }}>{t("Disconnect")}</button>}</li>)}</ul>}</section>
        <section className="card"><div className="section-heading"><h2>{t("Your CV files")}</h2><span className="count">{account.documents.length} / {account.limits.maxResumes}</span></div><p className="muted">{size(account.usage.storedResumeBytes)} {t(" of ")}{size(account.limits.maxStoredResumeBytes)} {t(" reserved. A PDF can be up to 5 MiB. You can remove an unused version below. Your current profile and active application reviews keep the PDFs they need; removing an unused file keeps your application history and duplicate protection.")}</p>{account.documents.length === 0 ? <p className="empty-note">{t("No CV uploaded. Choose a PDF in the phone app when you are ready.")}</p> : <ul className="session-list document-list">{account.documents.map(d => <li key={d.sha256}><div><h3 dir="auto">{d.name}</h3><p className="small muted">{size(d.size)} · {date(d.createdAt)}</p><p className="small muted">{d.state === "ready" ? t("Saved privately") : d.state === "uploading" ? t("Upload in progress or awaiting recovery") : d.state === "deleting" ? t("Removal is pending. Retry removing this PDF to finish erasing it.") : t("Upload interrupted — recovery or a new save is needed")}</p></div><div className="document-actions">{d.state === "ready" && !account.deleting && <a className="button secondary" href={`/api/account/resumes/${d.sha256}?expectedWorkspaceId=${encodeURIComponent(account.workspaceId ?? "")}`} download>{t("Download ")}<DownloadIcon /></a>}{!d.removable && <p className="small muted">{(d.retentionReason ? t(d.retentionReason) : "") || t("This file is retained while the service checks its current references.")}</p>}{d.removable && !account.deleting && (removeDocument?.sha256 === d.sha256 ? <div className="inline-confirm"><p>{t("Remove ")}<strong>{removeDocument.name}</strong> {t(" from cloud storage? Any copy already saved on a device or received by an employer stays there.")}</p><div className="action-row"><button className="button danger-outline" disabled={Boolean(busy) || loading} onClick={() => void mutate("remove-pdf", "/api/account/resumes/remove", { expectedWorkspaceId: removeDocument.workspaceId, sha256: removeDocument.sha256 })}>{busy === "remove-pdf" ? t("Removing…") : t("Remove unused PDF")}</button><button className="button secondary" disabled={Boolean(busy) || loading} onClick={() => setRemoveDocument(null)}>{t("Keep PDF")}</button></div></div> : <button className="button secondary" disabled={Boolean(busy) || loading} onClick={() => { if (account.workspaceId) setRemoveDocument({ sha256: d.sha256, name: d.name, workspaceId: account.workspaceId }); }}>{t("Remove unused PDF")}</button>)}</div></li>)}</ul>}{account.documents.some(d => d.state === "failed" || d.state === "uploading") && !account.deleting && <div className="upload-recovery"><p className="small muted">{t("If an upload was interrupted, wait one minute, then check for a recoverable file. This does not replace your phone’s profile or submit an application.")}</p><button className="button secondary" disabled={Boolean(busy) || loading} onClick={() => mutate("recover", "/api/account/uploads/recover", { expectedWorkspaceId: account.workspaceId })}>{busy === "recover" ? t("Checking uploads…") : t("Recover interrupted uploads")}</button></div>}</section>
        <section className="card"><h2>{t("Download your records")}</h2><p className="muted">{t("Download your profile, saved opportunities, and application records as JSON. CV files are separate downloads above; the JSON includes private download paths that work while you are signed in.")}</p><dl className="usage-grid"><div><dt>{t("Opportunities")}</dt><dd>{account.usage.jobs} / {account.limits.maxJobs}</dd></div><div><dt>{t("Reviews")}</dt><dd>{account.usage.plans} / {account.limits.maxPlans}</dd></div><div><dt>{t("Application records")}</dt><dd>{account.usage.attempts} / {account.limits.maxAttempts}</dd></div></dl><a className="button secondary" href={`/api/account/export?expectedWorkspaceId=${encodeURIComponent(account.workspaceId ?? "")}`} download>{t("Download account records ")}<DownloadIcon /></a><p className="small muted">{t("Keep these downloads private. They contain personal information.")}</p></section>
        <section className="card danger-zone"><p className="eyebrow">{t("DELETE CLOUD DATA")}</p><h2>{t("Delete cloud workspace")}</h2><p className="muted">{t("Permanently remove this workspace’s active cloud records and CV contents, revoke its phone connections, and remove this account’s provider connections and browser sessions. Applications already received by employers cannot be withdrawn here. Deletion also removes duplicate-prevention history; check earlier employer applications before starting again.")}</p>{!deleteOpen ? <button ref={deleteButton} className="button danger-outline" onClick={() => { setDeleteWorkspaceId(account.workspaceId); setConfirmation(""); setDeleteOpen(true); }} disabled={Boolean(busy) || loading}>{account.deleting ? t("Finish pending deletion") : t("Delete cloud workspace")}</button> : <div className="delete-confirm"><label htmlFor="delete-confirmation">{t("Type ")}<strong>{t("DELETE")}</strong> {t(" to confirm")}</label><input id="delete-confirmation" ref={confirmationInput} value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" spellCheck={false} /><div className="action-row"><button className="button danger" disabled={confirmation !== "DELETE" || !deleteWorkspaceId || Boolean(busy) || loading} onClick={() => mutate("delete", "/api/account", { confirmation, expectedWorkspaceId: deleteWorkspaceId, expectedAccountId: account.accountId }, "DELETE")}>{busy === "delete" ? t("Deleting your workspace…") : t("Permanently delete")}</button><button className="button secondary" disabled={Boolean(busy) || loading} onClick={closeDelete}>{t("Keep workspace")}</button></div><p className="small muted">{t("An application request already in progress may need to finish first. If deletion is interrupted, retry here until removal is confirmed.")}</p></div>}</section>
      </>}
      <SignOutButton accountId={account.accountId} />
    </>}
  </div>;
}
