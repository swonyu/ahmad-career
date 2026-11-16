"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APIError, requestAPI } from "../components/api";

type Session = { id: string; createdAt: string; expiresAt: string };
type Document = { sha256: string; name: string; size: number; createdAt: string; state: "ready" | "uploading" | "failed" };
type Account = {
  workspaceId: string | null; email?: string; confirmedEmail: string; emailUpdateRequired: boolean; deleting: boolean;
  sessions: Session[]; documents: Document[];
  usage: { storedResumeBytes: number; jobs: number; plans: number; attempts: number };
  limits: { maxStoredResumeBytes: number; maxResumes: number; maxJobs: number; maxPlans: number; maxAttempts: number };
};
const date = (value: string) => new Date(value).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const size = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 2 })} MiB`;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Your workspace response could not be verified.");
  return value as Record<string, unknown>;
};
const count = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Your storage information could not be verified.");
  return value;
};
function parseAccount(data: Record<string, unknown>): Account {
  if (!(data.workspaceId === null || typeof data.workspaceId === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(data.workspaceId)) || typeof data.confirmedEmail !== "string" || data.confirmedEmail.length > 320 || typeof data.emailUpdateRequired !== "boolean" || !Array.isArray(data.sessions) || data.sessions.length > 10 || !Array.isArray(data.documents) || data.documents.length > 5 || typeof data.deleting !== "boolean") throw new Error("Your workspace response could not be verified.");
  const sessions: Session[] = data.sessions.map((value: unknown) => {
    const s = record(value);
    if (typeof s.id !== "string" || !/^[a-f0-9-]{36}$/.test(s.id) || typeof s.createdAt !== "string" || typeof s.expiresAt !== "string" || !Number.isFinite(Date.parse(s.createdAt)) || !Number.isFinite(Date.parse(s.expiresAt))) throw new Error("The phone connection list could not be verified.");
    return { id: s.id, createdAt: s.createdAt, expiresAt: s.expiresAt };
  });
  const documents: Document[] = data.documents.map((value: unknown) => {
    const d = record(value);
    if (typeof d.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(d.sha256) || typeof d.name !== "string" || d.name.length > 250 || typeof d.createdAt !== "string" || !Number.isFinite(Date.parse(d.createdAt)) || !["ready", "uploading", "failed"].includes(String(d.state))) throw new Error("The CV records could not be verified.");
    return { sha256: d.sha256, name: d.name, size: count(d.size), createdAt: d.createdAt, state: d.state as Document["state"] };
  });
  const u = record(data.usage), l = record(data.limits);
  return { workspaceId: data.workspaceId, email: typeof data.email === "string" ? data.email : undefined, confirmedEmail: data.confirmedEmail, emailUpdateRequired: data.emailUpdateRequired, deleting: data.deleting, sessions, documents,
    usage: { storedResumeBytes: count(u.storedResumeBytes), jobs: count(u.jobs), plans: count(u.plans), attempts: count(u.attempts) },
    limits: { maxStoredResumeBytes: count(l.maxStoredResumeBytes), maxResumes: count(l.maxResumes), maxJobs: count(l.maxJobs), maxPlans: count(l.maxPlans), maxAttempts: count(l.maxAttempts) } };
}
function DownloadIcon() { return <svg className="arrow-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3v10M4 9l4 4 4-4" /></svg>; }
async function loadAccount(signal?: AbortSignal): Promise<Account> {
  return parseAccount(await requestAPI("/api/account", { signal }));
}

export default function AccountPanel() {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false); const [confirmation, setConfirmation] = useState(""); const [deleted, setDeleted] = useState(false);
  const [deleteWorkspaceId, setDeleteWorkspaceId] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<{ session: Session; workspaceId: string; number: number } | null>(null);
  const [loading, setLoading] = useState(true); const [needsSignIn, setNeedsSignIn] = useState(false);
  const readRequest = useRef<AbortController | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const readGeneration = useRef(0);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const disconnectConfirm = useRef<HTMLButtonElement>(null);
  const observedWorkspace = useRef<string | null | undefined>(undefined);
  const refresh = useCallback(() => {
    readRequest.current?.abort();
    const controller = new AbortController(); readRequest.current = controller;
    const generation = ++readGeneration.current;
    return loadAccount(controller.signal).then(data => {
      if (controller.signal.aborted || generation !== readGeneration.current) return;
      if (observedWorkspace.current !== data.workspaceId) {
        if (observedWorkspace.current !== undefined) setNotice("Your workspace changed. Review its details before making another change.");
        setDeleteOpen(false); setDeleteWorkspaceId(null); setConfirmation(""); setDisconnectTarget(null);
      }
      observedWorkspace.current = data.workspaceId;
      setAccount(data); setError(""); setNeedsSignIn(false);
    }).catch(e => {
      if (controller.signal.aborted || generation !== readGeneration.current) return;
      if (e instanceof APIError && e.status === 401) { setAccount(null); setNeedsSignIn(true); setNotice(""); setDeleteOpen(false); setDeleteWorkspaceId(null); setConfirmation(""); setDisconnectTarget(null); }
      setError(e instanceof Error ? e.message : "Your workspace could not be loaded.");
    }).finally(() => {
      if (readRequest.current === controller) { readRequest.current = null; setLoading(false); }
    });
  }, []);
  useEffect(() => {
    void refresh();
    return () => { readRequest.current?.abort(); readRequest.current = null; mutation.current?.abort(); mutation.current = null; };
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
    if (!(body as { expectedWorkspaceId?: string }).expectedWorkspaceId) { setError("Reload your workspace before confirming this change."); return; }
    const controller = new AbortController(); mutation.current = controller;
    readGeneration.current++; readRequest.current?.abort(); readRequest.current = null;
    setLoading(false); setBusy(action); setError(""); setNotice("");
    try {
      const data = await requestAPI(path, { method, body, signal: controller.signal });
      if (controller.signal.aborted || mutation.current !== controller) return;
      if (action === "delete") {
        if (data.deleted !== true) throw new Error("Deletion has not been confirmed. Your workspace is still shown until the service confirms it.");
        setDeleted(true); setAccount(null); setConfirmation(""); setDeleteOpen(false); setDeleteWorkspaceId(null); setDisconnectTarget(null);
      } else {
        if (action === "recover") {
          const recovered = count(data.recovered), retryRequired = count(data.retryRequired);
          setNotice(`${recovered} ${recovered === 1 ? "file recovered" : "files recovered"}. ${retryRequired > 0 ? `${retryRequired} ${retryRequired === 1 ? "file needs" : "files need"} to be saved again from your phone.` : "Uploads still in progress can be checked again after one minute."} A recovered file is attached to your profile only when you explicitly save it from the phone app.`);
        } else { setDisconnectTarget(null); setNotice("The phone’s connection was revoked. Already dispatched applications cannot be recalled."); }
        setLoading(true); await refresh();
      }
    } catch (e) {
      if (controller.signal.aborted || mutation.current !== controller) return;
      if (e instanceof APIError && e.status === 401) { setAccount(null); setNeedsSignIn(true); }
      if (e instanceof APIError && (e.status === 401 || e.code === "workspace_changed" || e.code === "account_changed")) {
        setAccount(null); setDeleteOpen(false); setDeleteWorkspaceId(null); setConfirmation(""); setDisconnectTarget(null); setNotice("");
      }
      setError(e instanceof Error ? e.message : "This change could not be completed.");
    } finally { if (mutation.current === controller) { mutation.current = null; setBusy(""); } }
  }
  if (deleted) return <section className="card"><span className="pill">Deletion completed</span><h2>Your cloud workspace was deleted.</h2><p>Its phone connections, saved profiles, CV contents, opportunities, and application records have been removed from the active service.</p><p className="muted">Files already saved on your phones and applications received by employers remain in those places. The privacy page explains infrastructure recovery copies and empty upload markers.</p><a className="button secondary" href="/connect">Start a new workspace</a></section>;
  return <div className="account-sections" aria-busy={loading || Boolean(busy)}>
    {error && <div className="alert error" role="alert">{error}{needsSignIn ? <a className="text-link" href="/signin-with-chatgpt?return_to=%2Faccount" target="_top">Sign in again</a> : <button className="text-link" onClick={() => { setLoading(true); void refresh(); }} disabled={Boolean(busy) || loading}>{loading ? "Loading…" : "Reload current status"}</button>}</div>}
    {notice && <div className="alert" role="status">{notice}</div>}
    {!account && !error && <section className="card" aria-busy="true"><p role="status">Loading your private workspace…</p></section>}
    {account && <>
      <section className="card"><span className="eyebrow">SIGNED IN</span><h2 className="account-email">{account.email || "Your Career Finder account"}</h2><p className="muted">{account.workspaceId ? "Use this same account to recover your workspace on a new phone. Automatic applications must use the email confirmed for this workspace." : "You have not created a cloud workspace yet. Create a connection code to get started."}</p>{account.emailUpdateRequired && !account.deleting && <div className="alert" role="status"><strong>Confirm your changed email.</strong><p>Your workspace still uses <span className="account-email">{account.confirmedEmail}</span>. Create a fresh connection code to confirm your current sign-in email, then refresh and review your application profile in the phone app. Opening this page does not change an approved application.</p></div>}{account.deleting ? <p className="alert" role="status">Deletion is pending. New connections, saves, and applications are paused. Finish deleting below to confirm removal.</p> : <a className="button primary" href="/connect">Connect a phone <svg className="arrow-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg></a>}</section>
      {account.workspaceId && <>
        <section className="card"><div className="section-heading"><h2>Connected phones</h2><span className="count">{account.sessions.length}</span></div><p className="muted">Disconnect a lost phone or one that is no longer yours. Its locally saved draft is not erased.</p>{account.sessions.length === 0 ? <p className="empty-note">No active phone connections. Your saved workspace is still here.</p> : <ul className="session-list">{account.sessions.map((s, index) => <li key={s.id} className={disconnectTarget?.session.id === s.id ? "disconnecting" : undefined}><div><h3>Phone connection {index + 1}</h3><p className="small muted">Connected {date(s.createdAt)} · Expires {date(s.expiresAt)}</p></div>{disconnectTarget?.session.id === s.id ? <div className="inline-confirm" role="group" aria-label={`Confirm disconnecting phone connection ${disconnectTarget.number}`}><p className="small">Disconnect this phone? It will need a new connection code. Its local files stay on the device, and applications already dispatched cannot be recalled.</p><div className="action-row"><button ref={disconnectConfirm} className="button danger-outline" disabled={Boolean(busy) || loading} onClick={() => mutate(s.id, "/api/account/sessions/revoke", { sessionId: disconnectTarget.session.id, expectedWorkspaceId: disconnectTarget.workspaceId })}>{busy === s.id ? "Disconnecting…" : "Confirm disconnect"}</button><button className="button secondary" disabled={Boolean(busy) || loading} onClick={cancelDisconnect}>Keep connected</button></div></div> : <button id={`disconnect-${s.id}`} className="button secondary" disabled={Boolean(busy) || loading} onClick={() => { if (account.workspaceId) setDisconnectTarget({ session: s, workspaceId: account.workspaceId, number: index + 1 }); }}>Disconnect</button>}</li>)}</ul>}</section>
        <section className="card"><div className="section-heading"><h2>Your CV files</h2><span className="count">{account.documents.length} / {account.limits.maxResumes}</span></div><p className="muted">{size(account.usage.storedResumeBytes)} of {size(account.limits.maxStoredResumeBytes)} reserved. A PDF can be up to 5 MiB. Saved versions stay available until you delete the workspace, including versions kept for earlier application reviews.</p>{account.documents.length === 0 ? <p className="empty-note">No CV uploaded. Choose a PDF in the phone app when you are ready.</p> : <ul className="session-list document-list">{account.documents.map(d => <li key={d.sha256}><div><h3>{d.name}</h3><p className="small muted">{size(d.size)} · {date(d.createdAt)}</p><p className="small muted">{d.state === "ready" ? "Saved privately" : d.state === "uploading" ? "Upload in progress or awaiting recovery" : "Upload interrupted — recovery or a new save is needed"}</p></div>{d.state === "ready" && <a className="button secondary" href={`/api/account/resumes/${d.sha256}?expectedWorkspaceId=${encodeURIComponent(account.workspaceId ?? "")}`} download>Download <DownloadIcon /></a>}</li>)}</ul>}{account.documents.some(d => d.state !== "ready") && !account.deleting && <div className="upload-recovery"><p className="small muted">If an upload was interrupted, wait one minute, then check for a recoverable file. This does not replace your phone’s profile or submit an application.</p><button className="button secondary" disabled={Boolean(busy) || loading} onClick={() => mutate("recover", "/api/account/uploads/recover", { expectedWorkspaceId: account.workspaceId })}>{busy === "recover" ? "Checking uploads…" : "Recover interrupted uploads"}</button></div>}</section>
        <section className="card"><h2>A copy for you</h2><p className="muted">Download your profile, saved opportunities, and application records as JSON. CV files are separate downloads above; the JSON includes private download paths that work while you are signed in.</p><dl className="usage-grid"><div><dt>Opportunities</dt><dd>{account.usage.jobs} / {account.limits.maxJobs}</dd></div><div><dt>Reviews</dt><dd>{account.usage.plans} / {account.limits.maxPlans}</dd></div><div><dt>Application records</dt><dd>{account.usage.attempts} / {account.limits.maxAttempts}</dd></div></dl><a className="button secondary" href={`/api/account/export?expectedWorkspaceId=${encodeURIComponent(account.workspaceId ?? "")}`} download>Download account records <DownloadIcon /></a><p className="small muted">Keep these downloads private. They contain personal information.</p></section>
        <section className="card danger-zone"><p className="eyebrow">DELETE CLOUD DATA</p><h2>Leave on your terms.</h2><p className="muted">Permanently remove this workspace’s active cloud records and CV contents, and revoke its phone connections. Applications already received by employers cannot be withdrawn here. Deletion also removes duplicate-prevention history; check earlier employer applications before starting again.</p>{!deleteOpen ? <button ref={deleteButton} className="button danger-outline" onClick={() => { setDeleteWorkspaceId(account.workspaceId); setConfirmation(""); setDeleteOpen(true); }} disabled={Boolean(busy) || loading}>{account.deleting ? "Finish pending deletion" : "Delete cloud workspace"}</button> : <div className="delete-confirm"><label htmlFor="delete-confirmation">Type <strong>DELETE</strong> to confirm</label><input id="delete-confirmation" ref={confirmationInput} value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" spellCheck={false} /><div className="action-row"><button className="button danger" disabled={confirmation !== "DELETE" || !deleteWorkspaceId || Boolean(busy) || loading} onClick={() => mutate("delete", "/api/account", { confirmation, expectedWorkspaceId: deleteWorkspaceId }, "DELETE")}>{busy === "delete" ? "Deleting your workspace…" : "Permanently delete"}</button><button className="button secondary" disabled={Boolean(busy) || loading} onClick={closeDelete}>Keep workspace</button></div><p className="small muted">An application request already in progress may need to finish first. If deletion is interrupted, retry here until removal is confirmed.</p></div>}</section>
      </>}
      <a className="text-link" href="/signout-with-chatgpt?return_to=%2Fconnect" target="_top">Sign out of this browser</a>
    </>}
  </div>;
}
