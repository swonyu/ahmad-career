"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { z } from "zod";
import { ArrowRight, ArrowUpRight, Bookmark, Check, ChevronRight, Download, HelpCircle, LoaderCircle, Plus, RefreshCw, Search, Send, ShieldCheck, SlidersHorizontal, Trash2, UserRound, X } from "lucide-react";
import { APIError } from "../components/api";
import { BrandMark } from "../components/SiteFrame";
import SignInOptions from "../components/SignInOptions";
import SignOutButton from "../components/SignOutButton";
import OAuthFeedback from "../components/OAuthFeedback";
import { phoneSafety, heldPlan } from "./safety";
import { phoneAPI } from "./api";
import { continueApprovedPlan } from "./dispatch";
import { stopBatchOnce as stopCapturedBatch, type BatchContext } from "./batch-stop";
import { JobCard, Modal, ProfileEditor, Readiness, RecordEditor, RecordSummary, ReviewDetails } from "./components";
import { MAX_PDF_BYTES, blankEmployerAnswer, receiptLabel, blankProfile, blankRecord, blankSnapshot, catalogSchema, checkReview, discoveryPageSchema, discoveryPath, draftProfileSchema, emptyFilters, jobIdentity, jobSchema, linkedInSearch, parseSnapshot, planSchema, profileEssentials, profileRequest, profileSchema, publicURL, reviewRequest, today, updateRecord, workspaceSchema, type ApplicationRecord, type EmployerAnswer, type PhoneSafety, type RecoveryDraft, type Catalog, type DiscoveryPage, type Filters, type Job, type PhoneSnapshot, type Plan, type Profile, type Workspace } from "./model";
import { PhoneVaultError, exportPhoneSnapshot, listPhoneSnapshots, loadPhoneSnapshot, removePhoneSnapshot, savePhoneSnapshot } from "./vault";

type Account = { id: string; email: string; name: string } | null;
type Tab = "search" | "saved" | "apply" | "profile";
type Dialog = { kind: "details"; job: Job } | { kind: "record"; job: Job; record: ApplicationRecord; existed: boolean; scope: string; editorId: string; initialDraft?: ApplicationRecord } | { kind: "remove"; job: Job; scope: string } | { kind: "add" } | { kind: "delete-record"; record: ApplicationRecord; scope: string } | { kind: "clear" } | { kind: "clear-old"; scope: string; updatedAt: string } | { kind: "recover"; draft: RecoveryDraft } | { kind: "versions" } | { kind: "signin" } | null;
type Notice = { text: string; error?: boolean } | null;
type InstallPrompt = Event & { prompt: () => Promise<{ outcome: "accepted" | "dismissed" }>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const tabs = [{ id: "search", label: "Search", icon: Search }, { id: "saved", label: "Saved", icon: Bookmark }, { id: "apply", label: "Apply", icon: Send }, { id: "profile", label: "Profile", icon: UserRound }] as const;
const titles = { search: "Find your next step.", saved: "Your shortlist.", apply: "Apply with confidence.", profile: "A little about you." };
const subtitles = { search: "A good opportunity starts with a simple search.", saved: "Keep the jobs you like and know what comes next.", apply: "Review what you share. Keep a clear record.", profile: "Your details, ready when the right job comes along." };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const displayTime = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "date unavailable";

function message(error: unknown): string {
  if (error instanceof z.ZodError) return "Some information could not be verified. " + error.issues.slice(0, 2).map(issue => `${issue.path.join(" · ") || "Details"}: ${issue.message}`).join(". ");
  return error instanceof Error ? error.message : "This could not be completed. Your earlier information is still here.";
}
function withPDF(online: Profile, local?: Profile): Profile {
  return online.resume && local?.resume?.sha256 === online.resume.sha256 && local.resume.dataBase64 ? { ...online, resume: { ...online.resume, dataBase64: local.resume.dataBase64 } } : online;
}
function mergeJobs(local: Job[] | null, online: Job[]): Job[] {
  const remote = new Map(online.map(job => [jobIdentity(job.url), job]));
  if (!local) return online.map(job => ({ ...job, remoteId: job.id }));
  return local.map(job => { const match = remote.get(jobIdentity(job.url)); return match ? { ...job, remoteId: match.id } : { ...job, remoteId: undefined }; });
}
function download(value: string, filename: string) {
  const url = URL.createObjectURL(new Blob([value], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}


export default function PhoneApp({ account }: { account: Account }) {
  const [tab, setTab] = useState<Tab>("search"), [notice, setNotice] = useState<Notice>(null), [busy, setBusy] = useState("");
  const [snapshot, setSnapshot] = useState<PhoneSnapshot | null>(null), [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [profile, setProfile] = useState<Profile>(blankProfile), [formChanged, setFormChanged] = useState(false);
  const [loading, setLoading] = useState(true), [locked, setLocked] = useState(false), [storageProblem, setStorageProblem] = useState("");
  const [checkingIdentity, setCheckingIdentity] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null), [catalogError, setCatalogError] = useState("");
  const [boardsTouched, setBoardsTouched] = useState(false), [customBoard, setCustomBoard] = useState("");
  const [filters, setFilters] = useState<Filters>({ ...emptyFilters }), [searchPage, setSearchPage] = useState<DiscoveryPage | null>(null), [searchedFilters, setSearchedFilters] = useState<Filters | null>(null), [restored, setRestored] = useState(false);
  const [savedFilter, setSavedFilter] = useState<"all" | "applied" | "followups">("all"), [savedQuery, setSavedQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null), [selected, setSelected] = useState<string[]>([]), [plan, setPlan] = useState<Plan | null>(null);
  const [employerAnswers, setEmployerAnswers] = useState<Record<string, EmployerAnswer>>({}), [reviewAccepted, setReviewAccepted] = useState(false);
  const [batchPlanId, setBatchPlanId] = useState<string | null>(null), [stopRequested, setStopRequested] = useState(false);
  const stopRequestedRef = useRef(false);
  const [editorDraft, setEditorDraft] = useState<ApplicationRecord | null>(null);
  const [safetyState, setSafetyState] = useState<PhoneSafety>({ holds: [], recovery: [] });
  const [safetyError, setSafetyError] = useState(""), [storageCode, setStorageCode] = useState(""), [recoveryStatus, setRecoveryStatus] = useState("");
  const profileRecoveryId = useRef<string | null>(null), recordRecoveryId = useRef<string | null>(null);
  const holdPromises = useRef(new Map<string, Promise<void>>()), stopHoldsInMemory = useRef(new Set<string>());
  const quarantine = useRef<{ snapshot: PhoneSnapshot; profile: Profile; formChanged: boolean; dialog: Dialog; editorDraft: ApplicationRecord | null } | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const [hasQuarantinedEdits, setHasQuarantinedEdits] = useState(false);
  const [dialogDirty, setDialogDirty] = useState(false), [confirmDialogDiscard, setConfirmDialogDiscard] = useState(false);
  const discardHeading = useRef<HTMLHeadingElement>(null);
  const [olderDrafts, setOlderDrafts] = useState<Array<{ scope: string; updatedAt: string }>>([]);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const snapshotRef = useRef<PhoneSnapshot | null>(null), workspaceRef = useRef<Workspace | null>(null), busyRef = useRef(false), epoch = useRef(0), searchAbort = useRef<AbortController | null>(null), heading = useRef<HTMLHeadingElement>(null);
  const identityCheckRef = useRef<() => void>(() => {}), identityCheckPending = useRef(false), identityUnverified = useRef(false);

  const putSnapshot = (value: PhoneSnapshot) => { snapshotRef.current = value; setSnapshot(value); };
  const putWorkspace = (value: Workspace) => { workspaceRef.current = value; setWorkspace(value); };
  function unfinished(): RecoveryDraft[] {
    const drafts: RecoveryDraft[] = [], savedAt = new Date().toISOString();
    if (formChanged) { profileRecoveryId.current ??= crypto.randomUUID(); drafts.push({ id: profileRecoveryId.current, savedAt, profile }); }
    if (dialog?.kind === "record" && editorDraft && !same(editorDraft, dialog.record)) { recordRecoveryId.current ??= crypto.randomUUID(); drafts.push({ id: recordRecoveryId.current, savedAt, record: { job: dialog.job, original: dialog.record, draft: editorDraft, existed: dialog.existed } }); }
    return drafts;
  }
  function adoptSafety(scope: string, value: PhoneSafety) { if (snapshotRef.current?.scope === scope && !identityUnverified.current) { setSafetyState(value); setSafetyError(""); } }
  async function preserveUnfinished(scope: string, drafts: RecoveryDraft[]) {
    for (const draft of drafts) adoptSafety(scope, await phoneSafety.recover(scope, draft));
  }
  function storageFailure(error: unknown) {
    if (error instanceof PhoneVaultError && !["invalid_snapshot", "invalid_scope"].includes(error.code)) { setStorageCode(error.code); setStorageProblem(message(error)); }
  }
  const lock = () => {
    const current = snapshotRef.current, drafts = unfinished();
    if (current) {
      quarantine.current = { snapshot: current, profile, formChanged, dialog, editorDraft }; setHasQuarantinedEdits(true);
      if (drafts.length) { setRecoveryStatus("Keeping unfinished edits private for the original account…"); void preserveUnfinished(current.scope, drafts).then(() => setRecoveryStatus("Unfinished edits were saved privately for the original account. Sign in with that account to recover them.")).catch(() => setRecoveryStatus("Unfinished edits are kept on this page. Sign in with the original account and recover or export them before reloading.")); }
    }
    setSafetyState({ holds: [], recovery: [] }); setSafetyError(""); setEditorDraft(null); setStorageCode(""); epoch.current++; identityUnverified.current = false; snapshotRef.current = null; workspaceRef.current = null; setSnapshot(null); setWorkspace(null); setProfile(blankProfile()); setFormChanged(false); setPlan(null); setSelected([]); setDialog(null); setDialogDirty(false); setConfirmDialogDiscard(false); setOlderDrafts([]); setStorageProblem(""); setSearchPage(null); setSearchedFilters(null); setFilters({ ...emptyFilters }); setEmployerAnswers({}); setReviewAccepted(false); setCheckingIdentity(false); setLocked(true); };
  const lockFromEffect = useEffectEvent(() => lock());

  useEffect(() => {
    let cancelled = false; const generation = ++epoch.current;
    async function start() {
      try {
        let remote = account ? workspaceSchema.parse(await phoneAPI("/api/phone/workspace")) : null;
        if (cancelled || generation !== epoch.current) return;
        if (remote && remote.accountId !== account?.id) { lock(); throw Error("The signed-in account changed. Reload to open the correct workspace."); }
        if (remote) {
          const confirmed = workspaceRef.current;
          if (confirmed && (confirmed.accountId !== remote.accountId || confirmed.workspaceId !== remote.workspaceId)) { lock(); throw Error("Your workspace changed while this page was opening. Reload to continue."); }
          // A later visibility check may finish before this first request.
          // Keep its confirmed workspace instead of reopening an older scope.
          remote = confirmed ?? remote;
          putWorkspace(remote);
        }
        const scope = account ? `account:${encodeURIComponent(account.id)}:${remote?.workspaceId ?? "new"}` : "guest";
        let local: PhoneSnapshot | null;
        try { local = await loadPhoneSnapshot(scope); } catch (error) { if (!cancelled) { setStorageProblem(message(error)); if (error instanceof PhoneVaultError) setStorageCode(error.code); } throw error; }
        if (cancelled || generation !== epoch.current) return;
        if (remote) {
          const confirmed = workspaceRef.current;
          if (!confirmed || confirmed.accountId !== remote.accountId || confirmed.workspaceId !== remote.workspaceId) { lock(); throw Error("Your workspace changed while its saved data was opening. Reload to continue."); }
          remote = confirmed;
        }
        const data = local ?? blankSnapshot(scope);
        const savedProfile = remote && !data.profileDirty ? withPDF(remote.profile, data.profile) : data.profile;
        const next = { ...data, profile: savedProfile, jobs: remote ? mergeJobs(local?.jobs ?? null, remote.jobs) : data.jobs };
        putSnapshot(next); setProfile(savedProfile); setFilters(next.filters);
        try { const safety = await phoneSafety.load(scope); if (!cancelled && generation === epoch.current) setSafetyState(safety); } catch (error) { if (!cancelled) setSafetyError(message(error)); }
        if (next.lastSearch) { setSearchPage({ ...next.lastSearch.page, nextCursor: null }); setSearchedFilters(next.lastSearch.filters); setRestored(true); }
        if (account) {
          const prefix = `account:${encodeURIComponent(account.id)}:`;
          const mainRows = await listPhoneSnapshots(prefix), recoveryRows = await phoneSafety.list(prefix);
          const old = [...new Map([...recoveryRows, ...mainRows].map(row => [row.scope, row])).values()];
          if (!cancelled && generation === epoch.current) setOlderDrafts(old.filter(row => row.scope !== scope));
        }
      } catch (error) { if (!cancelled) setNotice({ text: message(error), error: true }); }
      finally { if (!cancelled) setLoading(false); }
    }
    void start();
    void phoneAPI("/api/discovery/sources").then(value => { if (!cancelled) setCatalog(catalogSchema.parse(value)); }).catch(error => { if (!cancelled) setCatalogError(message(error)); });
    return () => { cancelled = true; epoch.current = generation + 1; searchAbort.current?.abort(); };
    // The platform identity is fixed for this server-rendered page. A changed account requires a fresh page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  useEffect(() => {
    if (!snapshot?.scope || locked || loading) return;
    const scope = snapshot.scope, drafts = unfinished();
    if (!drafts.length) return;
    const timer = setTimeout(() => { void preserveUnfinished(scope, drafts).catch(error => { if (snapshotRef.current?.scope === scope) setSafetyError("Unfinished edits could not be saved for recovery. Keep this page open or export them. " + message(error)); }); }, 600);
    return () => clearTimeout(timer);
    // The captured draft is saved only to its original owner and workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, formChanged, dialog, editorDraft, snapshot?.scope, locked, loading]);
  useEffect(() => {
    const nav = navRef.current; if (!nav) return;
    const resize = () => nav.parentElement?.style.setProperty("--phone-nav-height", `${nav.getBoundingClientRect().height}px`);
    resize(); if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }
    const observer = new ResizeObserver(resize); observer.observe(nav); return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!formChanged && !(dialog && dialogDirty)) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent); return () => window.removeEventListener("beforeunload", prevent);
  }, [formChanged, dialog, dialogDirty]);

  useEffect(() => { if (confirmDialogDiscard) { discardHeading.current?.focus(); discardHeading.current?.scrollIntoView({ block: "nearest" }); } }, [confirmDialogDiscard]);

  useEffect(() => {
    const available = (event: Event) => {
      if ("prompt" in event && typeof event.prompt === "function") { event.preventDefault(); setInstallPrompt(event as InstallPrompt); }
    };
    const installed = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", available); window.addEventListener("appinstalled", installed);
    return () => { window.removeEventListener("beforeinstallprompt", available); window.removeEventListener("appinstalled", installed); };
  }, []);

  useEffect(() => {
    if (!account) return;
    let disposed = false, inFlight = false;
    const check = () => {
      identityUnverified.current = true; setCheckingIdentity(true);
      if (document.visibilityState !== "visible") return;
      if (busyRef.current || inFlight) { identityCheckPending.current = true; return; }
      identityCheckPending.current = false; inFlight = true;
      const generation = epoch.current;
      void phoneAPI("/api/phone/workspace").then(data => {
        const current = workspaceSchema.parse(data), previous = workspaceRef.current;
        if (disposed || generation !== epoch.current) return;
        if (current.accountId !== account.id || previous && current.workspaceId !== previous.workspaceId) { lockFromEffect(); setNotice({ text: "Your account or workspace changed in another page. Reload to continue.", error: true }); }
        else { putWorkspace(current); identityUnverified.current = false; setCheckingIdentity(false); }
      }).catch(error => {
        if (disposed || generation !== epoch.current) return;
        if (error instanceof APIError && error.status === 401) { lockFromEffect(); setNotice({ text: "Your sign-in has ended. Sign in again to open this private workspace.", error: true }); }
        else setNotice({ text: "Your account could not be confirmed. Your unfinished edits are kept on this page; retry when the connection is available.", error: true });
      }).finally(() => { inFlight = false; if (!disposed && identityCheckPending.current && !busyRef.current) check(); });
    };
    identityCheckRef.current = check;
    document.addEventListener("visibilitychange", check); window.addEventListener("pageshow", check); window.addEventListener("focus", check);
    return () => { disposed = true; identityCheckRef.current = () => {}; identityCheckPending.current = false; document.removeEventListener("visibilitychange", check); window.removeEventListener("pageshow", check); window.removeEventListener("focus", check); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  function assertCurrent(generation: number, scope?: string) {
    if (identityUnverified.current) throw Error("Your account needs to be confirmed before this result can be shown. Your saved information is still here.");
    if (generation !== epoch.current || scope && scope !== snapshotRef.current?.scope) throw Error("This page changed while the request was running. Reload before continuing.");
  }
  async function persist(next: PhoneSnapshot, generation = epoch.current) {
    assertCurrent(generation, next.scope);
    try { await savePhoneSnapshot(next.scope, parseSnapshot(next, next.scope)); }
    catch (error) { storageFailure(error); throw error; }
    assertCurrent(generation, next.scope); putSnapshot(next);
  }
  async function run(label: string, action: (generation: number) => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(label); setNotice(null); const generation = epoch.current;
    try { await action(generation); }
    catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setNotice({ text: "Search cancelled. Your earlier results are still here." });
      else {
        if (error instanceof APIError && (error.status === 401 || ["account_changed", "workspace_changed", "sign_in_required"].includes(error.code))) lock();
        setNotice({ text: message(error), error: true });
      }
    } finally { busyRef.current = false; setBusy(""); if (identityCheckPending.current) identityCheckRef.current(); }
  }
  function local(): PhoneSnapshot {
    if (locked || checkingIdentity || identityUnverified.current || !snapshotRef.current) throw Error("Confirm this page’s account before changing your saved information.");
    if (storageProblem) throw Error("This phone’s saved data needs attention. Export or reload it before making changes.");
    return snapshotRef.current;
  }
  function online(): Workspace & { workspaceId: string } {
    const current = workspaceRef.current;
    if (locked || checkingIdentity || identityUnverified.current || !current?.workspaceId || current.accountId !== account?.id) throw Error("Open your private workspace from Profile first.");
    if (current.deleting) throw Error("This account is being deleted. Finish deletion in Account before making changes.");
    if (current.emailUpdateRequired) throw Error("Confirm your connected email in Profile before applying.");
    return current as Workspace & { workspaceId: string };
  }
  const navigate = (next: Tab) => { setTab(next); setNotice(null); requestAnimationFrame(() => { heading.current?.focus(); window.scrollTo({ top: 0, behavior: "instant" }); }); };

  const searchJobs = (more = false) => run(more ? "Loading more jobs" : "Searching employer boards", async generation => {
    const requested = more && searchedFilters ? searchedFilters : { ...filters, sources: [...new Set(searchSources.map(value => value.trim()).filter(Boolean))] };
    if (!requested.sources.length) throw Error("Choose an employer board under Search options first.");
    const cursor = more && !restored ? searchPage?.nextCursor : null;
    if (more && !cursor) throw Error("Search again to refresh these results.");
    const controller = new AbortController(); searchAbort.current = controller;
    const page = discoveryPageSchema.parse(await phoneAPI(discoveryPath(requested, cursor), { signal: controller.signal }));
    assertCurrent(generation);
    let result = page;
    if (more && searchPage) {
      const jobs = new Map(searchPage.jobs.map(job => [jobIdentity(job.url), job])); page.jobs.forEach(job => jobs.set(jobIdentity(job.url), job));
      if (jobs.size > 200) throw Error("You have viewed 200 results. Refine the job title, location, or employer boards to narrow your search.");
      result = { ...page, jobs: [...jobs.values()] };
    }
    setSearchPage(result); setSearchedFilters(requested); setRestored(false); setFilters(requested); searchAbort.current = null;
    if (snapshotRef.current && !storageProblem) await persist({ ...local(), filters: requested, lastSearch: { filters: requested, page: { ...result, nextCursor: null } } }, generation);
  });

  function exportUnfinished() {
    if (!snapshotRef.current || locked || identityUnverified.current) throw Error("Confirm this account before exporting private edits.");
    const drafts = unfinished(); if (!drafts.length) throw Error("There are no unfinished profile or application-record edits on this page.");
    download(JSON.stringify({ format: "Career Finder unfinished edits", version: 1, scope: snapshotRef.current.scope, exportedAt: new Date().toISOString(), drafts }, null, 2), "Career-Finder-unfinished-edits.json");
    setNotice({ text: "The download contains your unfinished edits, including a CV when present. Keep it private. It is a readable record, not an automatic restore file." });
  }
  async function discardRecovery(scope: string, id: string | null) {
    if (!id) return;
    try { adoptSafety(scope, await phoneSafety.discard(scope, id)); }
    catch (error) { setSafetyError("Your saved change was kept, but its recovery copy could not be removed. " + message(error)); }
  }
  const retryStorage = () => run("Checking saved browser data", async generation => {
    const current = snapshotRef.current; if (!current) throw Error("Reload this account before opening its saved browser data.");
    await preserveUnfinished(current.scope, unfinished());
    const latest = await loadPhoneSnapshot(current.scope); assertCurrent(generation, current.scope);
    putSnapshot(latest ?? blankSnapshot(current.scope)); setStorageProblem(""); setStorageCode("");
    if (dialog?.kind === "record" && editorDraft) { const record = latest?.records.find(value => value.identity === dialog.record.identity); setDialog({ ...dialog, record: record ?? blankRecord(dialog.job), existed: Boolean(record), initialDraft: editorDraft }); }
    setNotice({ text: "Saved data checked. Your unfinished edits are still on this page. Compare the saved version before choosing Save again." });
  });
  const recoverLocked = (exportOnly = false) => run("Confirming the original account", async () => {
    const saved = quarantine.current; if (!account || !saved) throw Error("Sign in with your original account and reload to open its saved recovery drafts.");
    const current = workspaceSchema.parse(await phoneAPI("/api/phone/workspace"));
    if (current.accountId !== account.id) throw Error("Sign in with the original account before recovering these private edits.");
    if (exportOnly) { download(JSON.stringify({ format: "Career Finder unfinished edits", version: 1, scope: saved.snapshot.scope, profile: saved.formChanged ? saved.profile : undefined, record: saved.dialog?.kind === "record" ? { job: saved.dialog.job, original: saved.dialog.record, draft: saved.editorDraft } : undefined }, null, 2), "Career-Finder-unfinished-edits.json"); setRecoveryStatus("Your unfinished edits were exported. Keep the downloaded file private."); return; }
    const scope = `account:${encodeURIComponent(account.id)}:${current.workspaceId ?? "new"}`;
    if (scope !== saved.snapshot.scope) throw Error("This account now uses a different workspace. Export these unfinished edits first; earlier workspace drafts stay separate.");
    const latest = await loadPhoneSnapshot(scope); const safety = await phoneSafety.load(scope);
    putSnapshot(latest ?? saved.snapshot); putWorkspace(current); setProfile(saved.profile); setFormChanged(saved.formChanged); setEditorDraft(saved.editorDraft);
    setDialog(saved.dialog?.kind === "record" ? { ...saved.dialog, initialDraft: saved.editorDraft ?? undefined } : saved.dialog);
    setSafetyState(safety); setSafetyError(""); setStorageProblem(""); setStorageCode(""); identityUnverified.current = false; setCheckingIdentity(false); setLocked(false); quarantine.current = null; setHasQuarantinedEdits(false); setRecoveryStatus("");
    setNotice({ text: "Original account confirmed. Your unfinished edits are back; review the saved version before saving them." });
  });
  async function holdStop(scope: string, planId: string): Promise<void> {
    const key = `${scope}:${planId}`; stopHoldsInMemory.current.add(key);
    const previous = holdPromises.current.get(key); if (previous) return previous;
    const task = phoneSafety.hold(scope, planId).then(value => { adoptSafety(scope, value); });
    holdPromises.current.set(key, task);
    void task.catch(error => { holdPromises.current.delete(key); setSafetyError("Stop intent could not be saved. No further applications will be sent by this page. Keep it open and confirm Stop again. " + message(error)); });
    return task;
  }
  async function confirmStopped(result: Record<string, unknown>, scope: string, planId: string) {
    const stopped = planSchema.parse(result.plan);
    if (stopped.id !== planId || !stopped.stopped) throw Error("Stop could not be confirmed. This review remains held on this browser.");
    adoptSafety(scope, await phoneSafety.confirm(scope, planId));
  }

  const saveJob = (job: Job) => run("Saving job", async generation => {
    const data = local(), identity = jobIdentity(job.url);
    if (data.jobs.some(saved => jobIdentity(saved.url) === identity)) { setNotice({ text: "This job is already in Saved." }); return; }
    if (data.jobs.length >= 200) throw Error("Your shortlist holds up to 200 jobs. Remove a bookmark to make room; its private application record will stay.");
    await persist({ ...data, jobs: [job, ...data.jobs] }, generation); setNotice({ text: "Saved on this phone. Find it in Saved whenever you need it." }); setDialog(null);
  });
  const requestDialogClose = () => { if (dialogDirty) setConfirmDialogDiscard(true); else setDialog(null); };
  const editRecord = (job: Job) => { const data = local(), existing = data.records.find(record => record.identity === jobIdentity(job.url)); setDialogDirty(false); setConfirmDialogDiscard(false); const record = existing ?? blankRecord(job); recordRecoveryId.current = crypto.randomUUID(); setEditorDraft(record); setDialog({ kind: "record", job, record, existed: Boolean(existing), scope: data.scope, editorId: recordRecoveryId.current }); };
  const saveRecord = (draft: ApplicationRecord, clearApplied: boolean) => run("Saving application record", async generation => {
    if (dialog?.kind !== "record") return;
    const data = local(); if (data.scope !== dialog.scope) throw Error("This record belongs to a different workspace. Open it again.");
    const current = data.records.find(row => row.identity === dialog.record.identity);
    if (dialog.existed ? !current || !same(current, dialog.record) : current) throw Error("This application record changed. Close it and reopen the latest version.");
    const updated = updateRecord(current ?? dialog.record, draft, clearApplied);
    const connected = workspaceRef.current;
    if (updated.appliedElsewhere !== dialog.record.appliedElsewhere && connected?.activePlanIds.some(id => { const active = connected.recoverablePlans.find(item => item.id === id); return !active || active.items.some(job => jobIdentity(job.job.url) === updated.identity); })) throw Error("Stop the approved application in Apply before changing its applied mark.");
    if (!current && data.records.length >= 500) throw Error("This browser holds up to 500 private application records. Export your records and remove an older record before adding another.");
    const records = data.records.filter(row => row.identity !== updated.identity); records.unshift(updated);
    await persist({ ...data, records }, generation); await discardRecovery(data.scope, recordRecoveryId.current); recordRecoveryId.current = null; setEditorDraft(null); setPlan(null); setReviewAccepted(false); setDialog(null); setNotice({ text: "Application record saved on this phone. Your private notes were not uploaded." });
  });
  const removeBookmark = () => run("Removing bookmark", async generation => {
    if (dialog?.kind !== "remove") return;
    const data = local(); if (data.scope !== dialog.scope) throw Error("Your workspace changed. Open the saved job again.");
    const identity = jobIdentity(dialog.job.url);
    await persist({ ...data, jobs: data.jobs.filter(job => jobIdentity(job.url) !== identity) }, generation);
    setSelected(previous => previous.filter(id => id !== identity)); setDialog(null); setNotice({ text: "Bookmark removed. Any application record and follow-up date were kept." });
  });

  const readPDF = async (file: File) => { await run("Checking PDF", async generation => {
    if (file.size < 8 || file.size > MAX_PDF_BYTES || !/\.pdf$/i.test(file.name) || file.name.length > 180 || file.name.startsWith(".") || /[\x00-\x1f\x7f/\\:]/.test(file.name)) throw Error("Choose a PDF with a simple filename, up to 5 MiB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0,5)) !== "%PDF-") throw Error("This file does not look like a PDF. Export your CV as a PDF and choose it again.");
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2,"0")).join("");
    let binary = ""; for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    assertCurrent(generation); setProfile(previous => ({ ...previous, resume: { name: file.name, mime: "application/pdf", size: bytes.byteLength, sha256: hash, dataBase64: btoa(binary) } })); setFormChanged(true);
    setNotice({ text: "PDF checked. Save on this phone to keep it, or Save profile online to upload it to your private workspace." });
  }); };
  const saveLocalProfile = () => run("Saving phone draft", async generation => {
    const data = local(), value = draftProfileSchema.parse({ ...profile, skills: [...new Set(profile.skills.map(skill => skill.trim()).filter(Boolean))] });
    await persist({ ...data, profile: value, profileDirty: true }, generation); await discardRecovery(data.scope, profileRecoveryId.current); profileRecoveryId.current = null; setProfile(value); setFormChanged(false); setPlan(null); setReviewAccepted(false); setNotice({ text: "Profile saved on this phone. This save did not upload your CV." });
  });
  const saveOnlineProfile = () => run("Saving profile online", async generation => {
    const data = local(), current = online();
    if (profile.revision !== current.profile.revision) { setDialog({ kind: "versions" }); throw Error("Your online profile has changed. Compare the two versions before saving."); }
    if (profile.resume && !profile.resume.dataBase64 && (profile.resume.sha256 !== current.profile.resume?.sha256 || profile.resume.name !== current.profile.resume?.name || profile.resume.size !== current.profile.resume?.size)) throw Error("Choose this CV’s original PDF again before replacing the online CV. A filename alone cannot restore its contents.");
    const request = profileRequest(profile);
    profileSchema.parse({ ...profile, ...request, resume: profile.resume });
    const result = await phoneAPI("/api/phone/profile", { method: "PUT", body: { expectedWorkspaceId: current.workspaceId, expectedRevision: profile.revision, profile: request } });
    const saved = withPDF(profileSchema.parse(result.profile), profile); assertCurrent(generation, data.scope);
    putWorkspace({ ...current, profile: saved, activePlanIds: [], recoverablePlans: [] }); setProfile(saved); setFormChanged(false); setPlan(null); setReviewAccepted(false);
    try { await persist({ ...data, profile: saved, profileDirty: false }, generation); }
    catch (error) { throw Error("Your profile was saved online, but this phone could not save its copy. " + message(error)); }
    await discardRecovery(data.scope, profileRecoveryId.current); profileRecoveryId.current = null;
    setNotice({ text: "Profile saved to your private workspace. You can review these details before an application is sent." });
  });
  const refreshWorkspace = () => run("Checking workspace", async generation => {
    if (!account) return;
    const current = workspaceSchema.parse(await phoneAPI("/api/phone/workspace")); assertCurrent(generation);
    const previous = workspaceRef.current;
    if (current.accountId !== account.id || previous && current.workspaceId !== previous.workspaceId) { lock(); throw Error("Your account or workspace changed. Reload to open the current one."); }
    putWorkspace(current); if (snapshotRef.current) adoptSafety(snapshotRef.current.scope, await phoneSafety.load(snapshotRef.current.scope)); setNotice({ text: "Online records refreshed. Your phone draft is still here." });
  });
  const openWorkspace = () => run("Opening private workspace", async generation => {
    if (!account || locked) throw Error("Sign in again to open your workspace.");
    if (formChanged) throw Error("Save your phone draft first so your unfinished profile stays available when the workspace opens.");
    const current = workspaceSchema.parse(await phoneAPI("/api/phone/workspace", { method: "POST", body: { expectedAccountId: account.id } })); assertCurrent(generation);
    if (current.accountId !== account.id) { lock(); throw Error("Your account changed. Reload before continuing."); }
    // A newly created workspace gets its own scope. Existing drafts remain recoverable; they are never adopted silently.
    if (current.workspaceId !== workspaceRef.current?.workspaceId) { window.location.reload(); return; }
    putWorkspace(current); setNotice({ text: "Connected email confirmed. Compare your phone draft with the online profile before saving." });
  });

  const prepare = () => run("Preparing application review", async generation => {
    const data = local(), current = online();
    if (!current.capabilities.liveEnabled) throw Error("Auto Apply is not available on this service yet. Open the employer’s job page and record your application in Saved.");
    if (formChanged || data.profileDirty || data.profile.revision !== current.profile.revision) throw Error("Save or compare your profile online in Profile before preparing an application.");
    const essentials = profileEssentials(current.profile); if (!Object.values(essentials).every(Boolean)) throw Error("Add your name, a valid email, and a PDF CV in Profile first.");
    if (!selected.length || selected.length > 20) throw Error("Select between one and twenty saved jobs.");
    const previewIds = selected.map((_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
    reviewRequest(current.workspaceId, previewIds, "", false, false, Object.fromEntries(selected.map((identity, index) => [previewIds[index], employerAnswers[identity] ?? blankEmployerAnswer()])));
    const jobs: Job[] = [];
    for (const identity of selected) {
      const job = data.jobs.find(row => jobIdentity(row.url) === identity); if (!job) throw Error("A selected bookmark changed. Select your jobs again.");
      if (data.records.some(record => record.identity === identity && record.appliedElsewhere)) throw Error("A selected job is already marked applied. Check its record before applying again.");
      const result = await phoneAPI("/api/phone/jobs", { method: "POST", body: { expectedWorkspaceId: current.workspaceId, url: job.url, title: job.title, company: job.company, location: job.location, country: job.country } });
      const saved = jobSchema.parse(result.job); assertCurrent(generation, data.scope); jobs.push({ ...job, remoteId: saved.id });
    }
    const map = new Map(jobs.map(job => [jobIdentity(job.url), job]));
    const updated = { ...data, jobs: data.jobs.map(job => map.get(jobIdentity(job.url)) ?? job) }; await persist(updated, generation);
    const ids = jobs.map(job => job.remoteId!);
    const result = await phoneAPI("/api/phone/prepare", { method: "POST", body: reviewRequest(current.workspaceId, ids, "", false, false, Object.fromEntries(jobs.map(job => [job.remoteId!, employerAnswers[jobIdentity(job.url)] ?? blankEmployerAnswer()]))) });
    const review = planSchema.parse(result.plan); assertCurrent(generation, data.scope); checkReview(review, current.profile, updated.jobs, updated.records); setPlan(review); setReviewAccepted(false); setNotice({ text: "Review prepared. Nothing has been sent. Check every detail below before approving." });
  });
  async function acceptPlanResult(result: Record<string, unknown>, current: Workspace, generation: number, expectedPlanId: string): Promise<Workspace> {
    const nextPlan = planSchema.parse(result.plan);
    if (nextPlan.id !== expectedPlanId) throw Error("The service returned a different application review. Refresh before continuing.");
    assertCurrent(generation); setPlan(nextPlan); setReviewAccepted(false);
    const refreshed = workspaceSchema.parse(await phoneAPI("/api/phone/workspace")); assertCurrent(generation);
    if (refreshed.accountId !== current.accountId || refreshed.workspaceId !== current.workspaceId) { lock(); throw Error("Your workspace changed. Reload to continue."); }
    putWorkspace(refreshed); return refreshed;
  }
  async function beginBatch(current: Workspace & { workspaceId: string }, planId: string, generation: number, scope: string): Promise<BatchContext> {
    const safety = await phoneSafety.checkWritable(scope); assertCurrent(generation, scope); adoptSafety(scope, safety);
    if (heldPlan(safety.holds, planId) || stopHoldsInMemory.current.has(`${scope}:${planId}`)) throw Error("You requested Stop for this review. Confirm Stop with the service, then prepare a new review. Its earlier approval cannot be resumed.");
    stopRequestedRef.current = false; setStopRequested(false); setBatchPlanId(planId);
    return { generation, scope, accountId: current.accountId, workspaceId: current.workspaceId, planId, stopAttempted: false };
  }
  async function stopBatchOnce(batch: BatchContext, current: Workspace): Promise<Workspace> {
    return stopCapturedBatch(batch, current, {
      readState: () => ({ generation: epoch.current, workspace: workspaceRef.current, identityUnverified: identityUnverified.current }),
      persistHold: () => holdStop(batch.scope, batch.planId),
      confirmHold: async () => { adoptSafety(batch.scope, await phoneSafety.confirm(batch.scope, batch.planId)); },
      post: body => phoneAPI("/api/phone/stop", { method: "POST", body }),
      accept: response => acceptPlanResult(response, current, batch.generation, batch.planId),
      deferRefresh: () => { identityCheckPending.current = true; },
    });
  }
  async function finishBatch(batch: BatchContext, current: Workspace) {
    try { if (stopRequestedRef.current && !batch.stopAttempted) await stopBatchOnce(batch, current); }
    finally { setBatchPlanId(null); }
  }
  async function runApprovedBatch(current: Workspace, batch: BatchContext) {
    const { generation, scope, planId } = batch;
    const result = await continueApprovedPlan(current, planId, {
      advance: async value => {
        assertCurrent(generation, scope);
        const response = await phoneAPI("/api/phone/advance", { method: "POST", body: { expectedWorkspaceId: value.workspaceId, planId } });
        return acceptPlanResult(response, value, generation, planId);
      },
      stop: value => stopBatchOnce(batch, value),
      validate: value => {
        assertCurrent(generation, scope);
        const data = local(), review = value.recoverablePlans.find(item => item.id === planId);
        if (!review || formChanged || data.profileDirty) throw Error("Open the current application review before continuing.");
        if (!value.capabilities.liveEnabled) throw Error("This employer integration is no longer available. Check the current receipts before trying again.");
        checkReview(review, value.profile, [...data.jobs, ...value.jobs], data.records);
      },
      isVisible: () => document.visibilityState === "visible" && !identityUnverified.current,
      shouldStop: () => stopRequestedRef.current,
    });
    const explanations = {
      complete: "This batch has no more queued work. Check each receipt below; an uncertain or rejected outcome is not a confirmed submission.",
      paused: "Processing paused. Return to Apply, refresh the workspace, and continue the approved review when you are ready.",
      waiting: "Processing is waiting for an outcome or employer cooldown. Check the receipts before taking another action.",
      stopped: "Unsent applications stopped. A request already sent may still finish; its outcome will be recorded.",
      limit: "This processing pass is finished. Check the receipts and choose Continue if approved work remains.",
    };
    setNotice({ text: explanations[result.reason] });
  }
  const approve = () => run("Submitting approved applications", async generation => {
    const data = local(), current = online();
    if (!plan || !reviewAccepted || formChanged || data.profileDirty) throw Error("Review the saved profile and the exact application details before approving.");
    if (!current.capabilities.liveEnabled) throw Error("This service does not have an active employer integration.");
    checkReview(plan, current.profile, [...data.jobs, ...current.jobs], data.records);
    const batch = await beginBatch(current, plan.id, generation, data.scope);
    try {
      const result = await phoneAPI("/api/phone/submit", { method: "POST", body: { expectedWorkspaceId: current.workspaceId, planId: plan.id, digest: plan.digest, approved: true, reviewSchema: 3 } });
      assertCurrent(generation, data.scope);
      const refreshed = await acceptPlanResult(result, current, generation, plan.id);
      await runApprovedBatch(refreshed, batch);
    } catch (error) {
      if (error instanceof APIError && (error.status === 401 || ["account_changed", "workspace_changed", "sign_in_required"].includes(error.code))) lock();
      throw error;
    } finally { await finishBatch(batch, current); }
  });
  const continuePlan = (review: Plan) => run("Continuing approved applications", async generation => {
    const data = local(), current = online(); checkReview(review, current.profile, [...data.jobs, ...current.jobs], data.records);
    if (!current.activePlanIds.includes(review.id)) throw Error("This review needs a new approval. Open it and check the details first.");
    const batch = await beginBatch(current, review.id, generation, data.scope);
    try { await runApprovedBatch(current, batch); }
    catch (error) {
      if (error instanceof APIError && (error.status === 401 || ["account_changed", "workspace_changed", "sign_in_required"].includes(error.code))) lock();
      throw error;
    } finally { await finishBatch(batch, current); }
  });
  const stopPlan = (review: Plan) => run("Stopping unsent applications", async generation => {
    const current = online(), scope = snapshotRef.current?.scope; if (!scope) throw Error("Open this workspace before stopping its review."); await holdStop(scope, review.id); const result = await phoneAPI("/api/phone/stop", { method: "POST", body: { expectedWorkspaceId: current.workspaceId, planId: review.id, onlyIfUnapproved: !review.approvedAt } });
    await confirmStopped(result, scope, review.id); await acceptPlanResult(result, current, generation, review.id); setNotice({ text: "Unsent applications stopped. Any request already in flight will still have its outcome recorded." });
  });
  const stopAndCheckReceipt = (planId: string) => run("Stopping and checking pending work", async generation => {
    const current = online();
    if (!current.attempts.some(receipt => receipt.planId === planId && receipt.state === "dispatching")) throw Error("Refresh the receipts to check the current outcome.");
    const scope = snapshotRef.current?.scope; if (!scope) throw Error("Open this workspace before stopping its pending work."); await holdStop(scope, planId);
    const result = await phoneAPI("/api/phone/stop", { method: "POST", body: { expectedWorkspaceId: current.workspaceId, planId, onlyIfUnapproved: false } });
    await confirmStopped(result, scope, planId);
    await acceptPlanResult(result, current, generation, planId);
    setNotice({ text: "Unsent work stopped. A recent request may still finish. If the service can no longer confirm an older request, its receipt says Outcome needs checking and it will not be resent automatically." });
  });

  const confirmHeldStop = (planId: string) => run("Confirming Stop with the service", async generation => {
    const current = online(), scope = snapshotRef.current?.scope; if (!scope) throw Error("Open this workspace before checking Stop.");
    await holdStop(scope, planId);
    const result = await phoneAPI("/api/phone/stop", { method: "POST", body: { expectedWorkspaceId: current.workspaceId, planId, onlyIfUnapproved: false } });
    await confirmStopped(result, scope, planId); await acceptPlanResult(result, current, generation, planId);
    setNotice({ text: "Stop confirmed for this review. Any previously dispatched request keeps its recorded outcome. Prepare a new review if you later choose to apply." });
  });
  async function exportScope(scope: string) {
    if (identityUnverified.current || locked || (account ? !scope.startsWith(`account:${encodeURIComponent(account.id)}:`) : scope !== "guest")) throw Error("Confirm the owner of this browser draft before exporting it.");
    const read = async (action: () => Promise<string>) => { try { return JSON.parse(await action()); } catch (error) { if (error instanceof PhoneVaultError && error.code === "invalid_snapshot") return null; throw error; } };
    const saved = await read(() => exportPhoneSnapshot(scope)), recovery = await read(() => phoneSafety.export(scope));
    if (!saved && !recovery) throw Error("No saved browser data remains for this workspace.");
    return JSON.stringify({ format: "Career Finder browser records", version: 2, scope, exportedAt: new Date().toISOString(), saved, recovery }, null, 2);
  }
  const restoreRecovery = (draft: RecoveryDraft) => run("Opening recovered edits", async generation => {
    const data = local(); await preserveUnfinished(data.scope, unfinished()); assertCurrent(generation, data.scope);
    if (draft.profile) { profileRecoveryId.current = draft.id; setProfile(draft.profile); setFormChanged(true); setDialog(null); navigate("profile"); }
    else if (draft.record) { const saved = data.records.find(value => value.identity === draft.record!.original.identity); recordRecoveryId.current = draft.id; setEditorDraft(draft.record.draft); setDialog({ kind: "record", job: draft.record.job, record: saved ?? blankRecord(draft.record.job), existed: Boolean(saved), scope: data.scope, editorId: draft.id, initialDraft: draft.record.draft }); }
    setReviewAccepted(false); setNotice({ text: "Recovered edits are open. Your saved information is unchanged until you choose Save. Compare the saved version first." });
  });

  const discardConfirmation = confirmDialogDiscard && <section className="phone-warning" role="alert"><h3 ref={discardHeading} tabIndex={-1}>Discard these unsaved changes?</h3><p>Your earlier saved information will stay. The unfinished changes in this form will be lost.</p><div className="phone-dialog-actions"><button className="button secondary" onClick={() => setConfirmDialogDiscard(false)}>Keep editing</button><button className="button danger" onClick={() => void run("Discarding unfinished record", async () => { if (snapshotRef.current) await discardRecovery(snapshotRef.current.scope, recordRecoveryId.current); recordRecoveryId.current = null; setEditorDraft(null); setDialogDirty(false); setConfirmDialogDiscard(false); setDialog(null); })}>Discard changes</button></div></section>;

  const jobs = snapshot?.jobs ?? [], records = snapshot?.records ?? [], recordsByID = new Map(records.map(record => [record.identity, record]));
  const recordJobs = records.filter(record => !jobs.some(job => jobIdentity(job.url) === record.identity)).map(record => ({ id: record.identity, title: record.title, company: record.company, url: record.identity, location: "", country: "" }));
  const shownJobs = [...jobs, ...recordJobs].filter(job => {
    const record = recordsByID.get(jobIdentity(job.url));
    return (!savedQuery.trim() || `${job.title} ${job.company} ${job.location}`.toLocaleLowerCase().includes(savedQuery.trim().toLocaleLowerCase())) && (savedFilter === "all" || savedFilter === "applied" && record?.appliedElsewhere || savedFilter === "followups" && record?.followUpDate && record.stage !== "closed");
  }).sort((a,b) => savedFilter === "followups" ? (recordsByID.get(jobIdentity(a.url))?.followUpDate ?? "").localeCompare(recordsByID.get(jobIdentity(b.url))?.followUpDate ?? "") : 0);
  const onlineOnlyJobs = workspace?.jobs.filter(job => !jobs.some(localJob => jobIdentity(localJob.url) === jobIdentity(job.url))) ?? [];
  const recoverableDrafts = safetyState.recovery;
  const due = records.filter(record => record.followUpDate && record.followUpDate <= today() && record.stage !== "closed").length;
  const ready = Object.values(profileEssentials(profile)).every(Boolean);
  const cannotSave = Boolean(busy || loading || locked || checkingIdentity || storageProblem || !snapshot);
  const profilesDiffer = workspace && (profile.revision !== workspace.profile.revision || snapshot?.profileDirty);
  const searchSources = boardsTouched ? filters.sources : filters.sources.length ? filters.sources : catalog?.defaults ?? [];

  return <div className="phone-shell">
    <a className="skip-link" href="#phone-main">Skip to content</a>
    <header className="phone-header"><a className="phone-brand" href="/phone"><span className="brand-icon"><BrandMark /></span><span>Career Finder</span></a><a className="icon-button" href="/support" aria-label="Help and support"><HelpCircle size={23} aria-hidden="true" /></a></header>
    <main id="phone-main" className="phone-main"><OAuthFeedback />
      <div className="phone-page-heading"><p className="phone-kicker">{tab === "search" ? "YOUR NEXT CHAPTER" : tab === "saved" ? "ONE STEP AT A TIME" : tab === "apply" ? "YOU STAY IN CONTROL" : "MADE FOR YOU"}</p><h1 ref={heading} tabIndex={-1}>{titles[tab]}</h1><p>{subtitles[tab]}</p></div>
      {notice && !checkingIdentity && !locked && <div className={`phone-notice ${notice.error ? "is-error" : ""}`} role={notice.error ? "alert" : "status"}><p>{notice.text}</p><button className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={18} aria-hidden="true" /></button></div>}
      {busy && <div className="phone-progress" role="status"><LoaderCircle className="spin" size={18} aria-hidden="true" /><span>{busy}…</span>{batchPlanId ? <button className="text-button danger-text" disabled={stopRequested} onClick={() => { stopRequestedRef.current = true; setStopRequested(true); const scope = snapshotRef.current?.scope; if (scope && batchPlanId) void holdStop(scope, batchPlanId).catch(() => undefined); }}>{stopRequested ? "Stopping after this request…" : "Stop after current request"}</button> : busy.includes("Searching") || busy.includes("Loading more") ? <button className="text-button" onClick={() => searchAbort.current?.abort()}>Cancel</button> : null}</div>}
      {checkingIdentity && <section className="phone-warning" role="status"><h2>Confirming your account</h2><p>Your private details stay hidden while we check this page’s connection. Any unfinished edits remain here.</p>{notice?.error && <p role="alert">{notice.text}</p>}<button className="button secondary full" disabled={Boolean(busy)} onClick={() => identityCheckRef.current()}>Check account again</button></section>}
      {locked && <section className="phone-warning"><h2>Open your current account</h2><p>This page is no longer connected to the account it opened with. Its private details are hidden.</p><a className="text-button" href="/connect" target="_blank" rel="noopener noreferrer">Open sign-in in another tab</a>{recoveryStatus && <p role="status">{recoveryStatus}</p>}{notice?.error && <p role="alert">{notice.text}</p>}{hasQuarantinedEdits && <><p>Sign in with the original account in another tab, then recover or export your unfinished edits here.</p><div className="phone-actions"><button className="button secondary" disabled={Boolean(busy)} onClick={() => void recoverLocked()}>Recover original account edits</button><button className="button secondary" disabled={Boolean(busy)} onClick={() => void recoverLocked(true)}>Export original account edits</button></div></>}<button className="text-button" onClick={() => window.location.reload()}>Reload current account</button></section>}
      {!checkingIdentity && !locked && workspace?.deleting && <section className="phone-warning"><h2>Account deletion is in progress</h2><p>New online changes are paused. Finish deletion in Account; your phone records stay separate.</p><a className="button secondary full" href="/account">Open Account</a></section>}
      {storageProblem && !checkingIdentity && !locked && <section className="phone-warning"><h2>Your saved data needs attention</h2><p>{storageProblem}</p><p>Your last successfully saved draft has been preserved. Unfinished edits are separate. Export a recovery copy and keep this browser’s data until recovery is complete. An encrypted recovery file may still need the key stored in this browser.</p><div className="phone-actions"><button className="button secondary" disabled={Boolean(busy)} onClick={() => void run("Exporting recovery copy", async generation => { assertCurrent(generation); if (locked || account && workspaceRef.current?.accountId !== account.id) throw Error("Confirm this account before exporting its saved data."); const scope = snapshotRef.current?.scope ?? (account ? `account:${encodeURIComponent(account.id)}:${workspaceRef.current?.workspaceId ?? "new"}` : "guest"); const value = await exportPhoneSnapshot(scope); assertCurrent(generation); download(value, "Career-Finder-phone-recovery.json"); })}>Export saved recovery copy</button><button className="button secondary" disabled={Boolean(busy)} onClick={() => void run("Exporting unfinished edits", async () => exportUnfinished())}>Export unfinished edits</button>{!["damaged", "unsupported"].includes(storageCode) && <button className="button secondary" disabled={Boolean(busy)} onClick={() => void retryStorage()}>Check saved data and keep edits</button>}<button className="text-button" onClick={() => window.location.reload()}>Reload page</button><button className="text-button danger-text" onClick={() => setDialog({ kind: "clear" })}>Reset this phone’s data</button></div></section>}
      {loading && <p className="phone-note" role="status">Opening your private saved information…</p>}
      {!checkingIdentity && !locked && safetyError && <section className="phone-warning" role="alert"><h2>Private recovery needs attention</h2><p>{safetyError}</p><div className="phone-actions"><button className="button secondary" disabled={Boolean(busy)} onClick={() => void run("Exporting unfinished edits", async () => exportUnfinished())}>Export unfinished edits</button><button className="button secondary" disabled={Boolean(busy)} onClick={() => void run("Checking private recovery", async generation => { const data = local(); await preserveUnfinished(data.scope, unfinished()); const value = await phoneSafety.load(data.scope); assertCurrent(generation, data.scope); adoptSafety(data.scope, value); })}>Check recovery again</button></div></section>}
      {!checkingIdentity && !locked && recoverableDrafts.length > 0 && <details className="phone-card phone-disclosure"><summary>Recover unfinished edits <span>{recoverableDrafts.length} private {recoverableDrafts.length === 1 ? "draft" : "drafts"} kept for this workspace</span></summary><p className="phone-note">Recovery copies do not replace saved records or upload anything. Open one to compare, restore, export, or discard it.</p>{recoverableDrafts.map(draft => <button key={draft.id} className="phone-settings-link" disabled={Boolean(busy)} onClick={() => setDialog({ kind: "recover", draft })}><span>{draft.profile ? "Profile draft" : `${draft.record?.job.title} · ${draft.record?.job.company}`}<small>Saved {displayTime(draft.savedAt)}</small></span><ChevronRight size={18} aria-hidden="true" /></button>)}</details>}


      {!checkingIdentity && !locked && tab === "search" && <>
        <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{!busy && searchPage ? `${searchPage.jobs.length} jobs shown. ${searchPage.status === "complete" ? "Search complete." : "Some sources could not provide current results."}` : ""}</p>
        <form className="phone-search-card" onSubmit={event => { event.preventDefault(); void searchJobs(); }}>
          <label>Job title or skill<div className="phone-input-icon"><Search size={19} aria-hidden="true" /><input autoComplete="off" maxLength={120} placeholder="e.g. Designer, nurse, sales" value={filters.query} onChange={event => setFilters({ ...filters, query: event.target.value })} /></div></label>
          <label>Location <span className="optional">optional</span><input maxLength={100} placeholder="City, country, or region" value={filters.location} onChange={event => setFilters({ ...filters, location: event.target.value })} /></label>
          <label className="phone-check"><input type="checkbox" checked={filters.remoteOnly} onChange={event => setFilters({ ...filters, remoteOnly: event.target.checked })} /><span>Remote jobs only</span></label>
          <details className="phone-search-options"><summary><SlidersHorizontal size={17} aria-hidden="true" /> Search options <span>{searchSources.length} boards</span></summary><p className="phone-note">Search up to four employer boards at a time. These results cover the boards you choose, not every job available.</p>
            {catalog?.sources.map(source => <label className="phone-check" key={source.id}><input type="checkbox" checked={searchSources.includes(source.id)} onChange={event => { const next = event.target.checked ? [...searchSources, source.id] : searchSources.filter(id => id !== source.id); if (next.length <= 4) { setBoardsTouched(true); setFilters({ ...filters, sources: next }); } else setNotice({ text: "Choose up to four employer boards at a time.", error: true }); }} /><span>{source.name}</span></label>)}
            {searchSources.filter(source => !catalog?.sources.some(known => known.id === source)).map(source => <label className="phone-check" key={source}><input type="checkbox" checked onChange={() => { setBoardsTouched(true); setFilters({ ...filters, sources: searchSources.filter(value => value !== source) }); }} /><span>{source}</span></label>)}
            <label>Another employer’s board <span className="optional">optional</span><input type="url" maxLength={2048} value={customBoard} onChange={event => setCustomBoard(event.target.value)} placeholder="https://jobs.lever.co/employer" autoCapitalize="none" autoCorrect="off" /></label><button type="button" className="button secondary full" onClick={() => { try { const value = publicURL(customBoard.trim()); const url = new URL(value); if (!["jobs.lever.co", "jobs.eu.lever.co", "boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname)) throw Error("Choose a Lever or Greenhouse employer board. Other job links can be added directly in Saved."); if (searchSources.length >= 4) throw Error("Uncheck one board before adding another. You can search four at a time."); if (searchSources.includes(value)) throw Error("This board is already selected."); setBoardsTouched(true); setFilters({ ...filters, sources: [...searchSources, value] }); setCustomBoard(""); } catch (error) { setNotice({ text: message(error), error: true }); } }}>Add employer board</button><p className="phone-note">Use a public Lever or Greenhouse employer board link. Other job pages can be added directly in Saved.</p>
          </details>
          <button className="button primary full" type="submit" disabled={Boolean(busy)}><Search size={18} aria-hidden="true" />Search jobs</button>
        </form>
        {catalogError && <p className="phone-inline-note">{catalogError} You can still add an employer board link under Search options.</p>}
        <a className="phone-link-card" href={linkedInSearch(filters)} target="_blank" rel="noopener noreferrer"><div><strong>Search on LinkedIn</strong><span>Open the same title and location on LinkedIn</span></div><ArrowUpRight size={21} aria-hidden="true" /></a>
        {due > 0 && <button className="phone-link-card phone-followup-link" onClick={() => { setSavedFilter("followups"); navigate("saved"); }}><div><strong>{due} {due === 1 ? "follow-up is" : "follow-ups are"} due</strong><span>Make time for your next small step</span></div><ChevronRight size={21} aria-hidden="true" /></button>}
        {!searchPage ? <section className="phone-empty"><span className="empty-symbol"><Search size={28} aria-hidden="true" /></span><h2>Start with what interests you.</h2><p>Try a role or skill, add a location if you like, then save the jobs you want to come back to.</p><div className="phone-suggestions">{["Customer service", "Software", "Healthcare"].map(value => <button key={value} onClick={() => setFilters({ ...filters, query: value })}>{value}</button>)}</div></section> : <section aria-label="Job search results" className="phone-results">
          <div className="phone-section-heading"><h2>{restored ? "Previous results" : "Search results"}</h2><span>{searchPage.jobs.length} shown</span></div>
          <p className="phone-note">Search from {displayTime(searchPage.generatedAt)}. {restored ? "Search again to check current openings." : "An employer may close or change a job after this check."}</p>
          {searchedFilters && !same({ ...filters, sources: searchSources }, searchedFilters) && <p className="phone-inline-note">Search again to use your changed filters.</p>}
          {searchPage.sources.filter(source => source.error || ["stale", "unavailable"].includes(source.status)).map(source => <div className="phone-source-note" key={source.id}><strong>{source.name}</strong><p>{source.error?.message || (source.status === "stale" ? "Showing an earlier check of this board." : "This board could not provide current results.")}</p></div>)}
          {!searchPage.jobs.length && <div className="phone-empty compact"><h2>No matching jobs in these boards.</h2><p>Try a broader job title, another location, or a different employer board. You can also search LinkedIn above.</p></div>}
          {searchPage.jobs.map(job => <JobCard key={jobIdentity(job.url)} job={{ ...job, country: job.country ?? "" }} saved={jobs.some(saved => jobIdentity(saved.url) === jobIdentity(job.url))} onSave={() => void saveJob({ ...job, country: job.country ?? "" })} onDetails={() => setDialog({ kind: "details", job: { ...job, country: job.country ?? "" } })} busy={cannotSave} />)}
          {searchPage.nextCursor && !restored && <button className="button secondary full" disabled={Boolean(busy) || searchPage.jobs.length >= 200} onClick={() => void searchJobs(true)}>Load more jobs</button>}
          {searchPage.limited && <p className="phone-note">Some boards have more jobs than can be checked at once. Open an employer’s website for its complete list.</p>}
          <p className="phone-note">{searchPage.notice}</p>
        </section>}
      </>}

      {!checkingIdentity && !locked && tab === "saved" && <>
        {onlineOnlyJobs.length > 0 && <details className="phone-card phone-disclosure"><summary>Saved online, not on this phone <span>{onlineOnlyJobs.length} {onlineOnlyJobs.length === 1 ? "job" : "jobs"} available to copy</span></summary><p className="phone-note">Jobs added on another device stay available here. Copy only the bookmarks you want on this phone; previously removed bookmarks are not restored automatically.</p>{onlineOnlyJobs.map(job => <div className="phone-recoverable" key={job.id}><h3>{job.title}</h3><p className="phone-note">{job.company} · {job.location || "Location not specified"}</p><button className="button secondary" disabled={cannotSave} onClick={() => void saveJob({ ...job, remoteId: job.id })}>Copy bookmark to this phone</button></div>)}</details>}

        <div className="phone-toolbar"><span>{jobs.length} saved {jobs.length === 1 ? "job" : "jobs"}</span><button className="text-button" disabled={cannotSave} onClick={() => { setDialogDirty(false); setConfirmDialogDiscard(false); setDialog({ kind: "add" }); }}><Plus size={18} aria-hidden="true" />Add job link</button></div>
        <div className="phone-segmented" aria-label="Filter saved jobs">{([ ["all","All"], ["applied","Applied"], ["followups","Follow-ups"] ] as const).map(([value,label]) => <button key={value} aria-pressed={savedFilter === value} onClick={() => setSavedFilter(value)}>{label}</button>)}</div>
        {(jobs.length > 0 || records.length > 0) && <label className="phone-saved-search"><span className="visually-hidden">Find a saved job or employer</span><input type="search" value={savedQuery} onChange={event => setSavedQuery(event.target.value)} placeholder="Find a job or employer" /></label>}
        {!shownJobs.length ? <section className="phone-empty"><span className="empty-symbol"><Bookmark size={28} aria-hidden="true" /></span><h2>{savedFilter === "followups" ? "A clear next step." : savedFilter === "applied" ? "Your applications will go here." : savedQuery ? "No matching saved jobs." : "Make room for possibility."}</h2><p>{savedFilter === "followups" ? "Open a saved job, choose Edit application record, and add a follow-up date. Closed records stay out of this list." : savedFilter === "applied" ? "When you apply on an employer’s website, mark it in your application record." : "Save a job from Search or add a job link from any public employer page."}</p>{savedFilter === "all" && !savedQuery && <button className="button primary" onClick={() => navigate("search")}>Explore jobs <ArrowRight size={18} aria-hidden="true" /></button>}</section> : <div className="phone-saved-list">{shownJobs.map(job => {
          const identity = jobIdentity(job.url), record = recordsByID.get(identity), bookmarked = jobs.some(saved => jobIdentity(saved.url) === identity);
          return <article className="phone-card phone-saved-card" key={identity}><p className="phone-company">{job.company}</p><h2><button className="job-title-button" onClick={() => setDialog({ kind: "details", job })}>{job.title}</button></h2>{!bookmarked && <p className="phone-note">Application record · bookmark removed</p>}<RecordSummary record={record} />{record?.followUpDate && record.followUpDate <= today() && record.stage !== "closed" && <p className="phone-due">Follow-up due</p>}<div className="phone-actions"><button className="button secondary" disabled={cannotSave} onClick={() => editRecord(job)}>Edit application record</button><a className="text-button" href={job.url} target="_blank" rel="noopener noreferrer">Open job <ArrowUpRight size={16} aria-hidden="true" /></a></div></article>;
        })}</div>}
        {records.length > 0 && <p className="phone-note">Stages, follow-up dates, and notes stay on this phone. They are your own records; employer-confirmed submissions appear in Apply.</p>}
      </>}

      {!checkingIdentity && !locked && tab === "apply" && <>
        <section className="phone-card phone-apply-intro"><ShieldCheck size={30} aria-hidden="true" /><h2>Every application starts with you.</h2><p>Check the job, your CV, and the exact details before anything is sent.</p><Readiness profile={profile} />{!ready && <button className="text-button" onClick={() => navigate("profile")}>Complete your essentials <ArrowRight size={17} aria-hidden="true" /></button>}</section>
        {!account ? <section className="phone-card"><h2>Keep a private online workspace</h2><p>Sign in to save a profile online and use available employer integrations. Searching and keeping your own records work without an account.</p><SignInOptions destination="phone" /></section> : !workspace?.workspaceId ? <section className="phone-card"><h2>Open your private workspace</h2><p>Your profile is uploaded only when you choose Save profile online.</p><button className="button primary full" disabled={Boolean(busy) || locked} onClick={() => void openWorkspace()}>Create private workspace</button></section> : <>
          {!workspace.capabilities.liveEnabled && <section className="phone-warning"><h2>Apply on the employer’s website</h2><p>Auto Apply is waiting for employer-authorized integrations. For now, open a job, apply on the employer’s website, and update its record in Saved.</p><button className="button primary full" disabled>Auto Apply unavailable</button><button className="text-button" onClick={() => navigate("saved")}>Choose a saved job <ArrowRight size={17} aria-hidden="true" /></button></section>}
          {workspace.capabilities.liveEnabled && !plan && <section className="phone-card"><h2>Choose jobs to review</h2><p className="phone-note">Up to 20 saved jobs. Each employer must support this service before it can receive an application.</p>{jobs.map(job => { const identity = jobIdentity(job.url), applied = recordsByID.get(identity)?.appliedElsewhere; return <label key={identity} className="phone-check phone-job-choice"><input type="checkbox" disabled={Boolean(busy) || Boolean(applied)} checked={selected.includes(identity)} onChange={event => { setSelected(previous => event.target.checked ? [...previous, identity] : previous.filter(value => value !== identity)); setReviewAccepted(false); }} /><span>{job.title}<small>{job.company}{applied ? " · Already marked applied" : ""}</small></span></label>; })}{selected.map(identity => { const job = jobs.find(value => jobIdentity(value.url) === identity); if (!job) return null; const answer = employerAnswers[identity] ?? blankEmployerAnswer(); const editAnswer = (change: Partial<EmployerAnswer>) => { setEmployerAnswers(previous => ({ ...previous, [identity]: { ...(previous[identity] ?? blankEmployerAnswer()), ...change } })); setReviewAccepted(false); }; return <fieldset className="phone-employer-answers" key={identity} disabled={Boolean(busy)}><legend>{job.company} · {job.title}</legend><label>Additional information for this employer <span className="optional">optional</span><textarea rows={3} maxLength={5000} value={answer.comments} onChange={event => editAnswer({ comments: event.target.value })} /></label><label className="phone-check"><input type="checkbox" checked={answer.consentStore} onChange={event => editAnswer({ consentStore: event.target.checked })} /><span>Allow this employer to process my application data when it asks for consent.</span></label><label className="phone-check"><input type="checkbox" checked={answer.consentMarketing} onChange={event => editAnswer({ consentMarketing: event.target.checked })} /><span>Allow this employer to contact me about future opportunities when it asks for that permission.</span></label></fieldset>; })}<p className="phone-note">Review each employer’s privacy policy and exact answers on the next screen. You can change your choices before approving.</p><button className="button primary full" disabled={cannotSave || Boolean(safetyError) || !selected.length} onClick={() => void prepare()}>Prepare review</button></section>}
          {plan && <section className="phone-review"><div className="phone-section-heading"><h2>Review your application</h2><button className="text-button" disabled={Boolean(busy)} onClick={() => { setPlan(null); setReviewAccepted(false); }}>Close</button></div><p className="phone-note">{plan.stopped ? "This review was stopped." : `Review expires ${displayTime(plan.expiresAt)}.`}</p><ReviewDetails plan={plan} />{!plan.stopped && plan.items.some(item => ["ready","rate_limited"].includes(item.state)) && <div className="phone-card"><label className="phone-check"><input type="checkbox" checked={reviewAccepted} onChange={event => setReviewAccepted(event.target.checked)} /><span>I checked each employer, CV, link, answer, and permission above. I approve these exact details being sent.</span></label><button className="button primary full" disabled={cannotSave || Boolean(safetyError) || heldPlan(safetyState.holds, plan.id) || !reviewAccepted || !workspace.capabilities.liveEnabled} onClick={() => void approve()}>Approve and submit</button><button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => void stopPlan(plan)}>Stop unsent applications</button></div>}</section>}
          {safetyState.holds.some(hold => !hold.confirmed) && <section className="phone-warning"><h2>Stop needs confirmation</h2><p>You requested Stop for the reviews below. Their earlier approvals are held on this browser, including after reload. Check the service before preparing a new review; a request already sent may still finish.</p>{safetyState.holds.filter(hold => !hold.confirmed).map(hold => <div className="phone-recoverable" key={hold.planId}><p>Stop requested {displayTime(hold.requestedAt)}</p><button className="button secondary" disabled={Boolean(busy)} onClick={() => void confirmHeldStop(hold.planId)}>Confirm Stop with the service</button></div>)}</section>}
          {workspace.recoverablePlans.length > 0 && <section className="phone-card"><h2>Saved reviews</h2>{workspace.recoverablePlans.map(review => <div className="phone-recoverable" key={review.id}><p><strong>{review.items.length} {review.items.length === 1 ? "job" : "jobs"}</strong><span>Prepared {displayTime(review.createdAt)}</span></p><div className="phone-actions"><button className="button secondary" disabled={Boolean(busy)} onClick={() => { setPlan(review); setReviewAccepted(false); }}>Open review</button>{workspace.activePlanIds.includes(review.id) && <button className="button primary" disabled={cannotSave || Boolean(safetyError) || heldPlan(safetyState.holds, review.id)} onClick={() => void continuePlan(review)}>Continue approved applications</button>}<button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => void stopPlan(review)}>Stop unsent work</button></div></div>)}</section>}
          <section className="phone-receipts"><div className="phone-section-heading"><h2>Submission receipts</h2><button className="icon-button" disabled={Boolean(busy)} onClick={() => void refreshWorkspace()} aria-label="Refresh submission receipts"><RefreshCw size={19} aria-hidden="true" /></button></div>{!workspace.attempts.filter(receipt => receipt.state !== "ready").length ? <div className="phone-empty compact"><p>No submitted applications yet.</p></div> : workspace.attempts.filter(receipt => receipt.state !== "ready").map(receipt => <article className={`phone-card phone-receipt ${receipt.state === "uncertain" ? "needs-attention" : ""}`} key={receipt.id}><p className="phone-receipt-status">{receipt.state === "confirmed" && receipt.evidenceMode === "live" && receipt.mode === "local" && Boolean(receipt.applicationId?.trim()) && <Check size={17} aria-hidden="true" />}{receiptLabel(receipt)}</p><h3>{receipt.title}</h3><p>{receipt.company}</p><p className="phone-note">{displayTime(receipt.createdAt)}</p>{receipt.applicationId && <p className="phone-note">Employer reference: <bdi>{receipt.applicationId}</bdi></p>}{receipt.error?.message && <p className="phone-note">{receipt.error.message}</p>}{receipt.state === "uncertain" && <p className="phone-inline-note">Check with the employer before applying again. Career Finder will not automatically resend an uncertain application.</p>}{receipt.retryAt && <p className="phone-note">Review again after {displayTime(receipt.retryAt)}.</p>}{receipt.state === "dispatching" && <div className="phone-inline-note"><p>A request may still be in flight. Stopping prevents other unsent jobs and checks whether an older request needs manual follow-up.</p><button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => void stopAndCheckReceipt(receipt.planId)}>Stop unsent work and check</button></div>}<a href={receipt.url} target="_blank" rel="noopener noreferrer">Open employer page <ArrowUpRight size={15} aria-hidden="true" /></a></article>)}{workspace.attempts.length > 0 && <button className="button secondary full" disabled={Boolean(busy)} onClick={() => void run("Exporting submission receipts", async generation => { const current = online(); const data = await phoneAPI(`/api/phone/receipts?expectedWorkspaceId=${encodeURIComponent(current.workspaceId)}`); assertCurrent(generation); download(JSON.stringify(data, null, 2), "Career-Finder-submission-receipts.json"); })}><Download size={17} aria-hidden="true" />Export receipts</button>}<p className="phone-note">Confirmed means the employer’s system returned an application ID. It does not mean recruiter review, an interview, or a job offer.</p></section>
        </>}
      </>}

      {!checkingIdentity && !locked && tab === "profile" && <>
        <section className="phone-account-card"><span className="phone-account-icon"><UserRound size={23} aria-hidden="true" /></span><div><strong>{account ? "Your private workspace" : "Start on this phone"}</strong><p>{account ? account.email : "No account needed to search or keep a shortlist."}</p></div>{account && <a className="icon-button" href="/account" aria-label="Manage your account"><ChevronRight size={21} aria-hidden="true" /></a>}</section>
        {!account && <button className="phone-link-card" onClick={() => setDialog({ kind: "signin" })}><div><strong>Sign in for an online workspace</strong><span>Choose an available secure sign-in method</span></div><ArrowRight size={20} aria-hidden="true" /></button>}
        {account && !workspace?.workspaceId && !locked && <section className="phone-inline-note"><p>Create your workspace before saving a profile online. Any earlier phone draft stays separate until you choose to copy its details.</p><button className="button primary full" disabled={Boolean(busy)} onClick={() => void openWorkspace()}>Create private workspace</button></section>}
        {workspace?.emailUpdateRequired && <section className="phone-warning"><h2>Your connected email changed</h2><p>Confirm {workspace.accountEmail} before preparing another application.</p><button className="button primary full" disabled={Boolean(busy)} onClick={() => void openWorkspace()}>Confirm connected email</button></section>}
        {profilesDiffer && <section className="phone-inline-note"><p>{profile.revision !== workspace?.profile.revision ? "Your online profile changed. Compare it with your phone draft before replacing either version." : "You have a saved phone draft. Save it online when you want to use it for applications."}</p><button className="text-button" disabled={Boolean(busy)} onClick={() => setDialog({ kind: "versions" })}>Compare profile versions</button></section>}
        <fieldset className="phone-form-fieldset" disabled={cannotSave}><ProfileEditor profile={profile} onChange={value => { setProfile(previous => ({ ...previous, ...value })); setFormChanged(true); setReviewAccepted(false); }} onPDF={readPDF} onSaveLocal={() => void saveLocalProfile()} onSaveOnline={() => void saveOnlineProfile()} accountEmail={workspace?.accountEmail} hasWorkspace={Boolean(workspace?.workspaceId)} busy={Boolean(busy)} changed={formChanged} /></fieldset>
        <section className="phone-card phone-data-tools"><h2>Your saved data</h2><p>Phone drafts, unfinished recovery copies, and private notes are encrypted in this browser. Clearing browser data can remove them. Export a readable JSON copy for your records; it cannot be automatically restored into the app.</p><button className="button secondary full" disabled={Boolean(busy) || loading || locked || checkingIdentity || !snapshot} onClick={() => void run("Exporting phone data", async generation => { const data = snapshotRef.current; if (!data) return; const value = await exportScope(data.scope); assertCurrent(generation, data.scope); download(value, "Career-Finder-phone-data.json"); setNotice({ text: "Your export includes saved and recovery data, including private notes and any CV copies. Keep it private." }); })}><Download size={18} aria-hidden="true" />Export phone data</button>{formChanged && <button className="button secondary full" disabled={Boolean(busy)} onClick={() => void run("Exporting unfinished edits", async () => exportUnfinished())}>Export current unfinished edits</button>}{account && <><a className="phone-settings-link" href="/account"><span>Manage account, PDFs, and online exports</span><ChevronRight size={18} aria-hidden="true" /></a><button className="phone-settings-link" disabled={Boolean(busy)} onClick={() => void refreshWorkspace()}><span>Refresh online records</span><RefreshCw size={17} aria-hidden="true" /></button></>}{olderDrafts.length > 0 && <details className="phone-old-drafts"><summary>Earlier drafts for this account</summary><p className="phone-note">Earlier workspaces stay separate. Export their records or erase their personal browser drafts individually.</p>{olderDrafts.map(row => <div className="phone-recoverable" key={row.scope}><p>Draft saved {displayTime(row.updatedAt)}</p><div className="phone-actions"><button className="button secondary" disabled={Boolean(busy)} onClick={() => void run("Exporting earlier phone draft", async generation => { const value = await exportScope(row.scope); assertCurrent(generation); download(value, "Career-Finder-earlier-phone-draft.json"); })}>Export earlier draft</button><button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => setDialog({ kind: "clear-old", scope: row.scope, updatedAt: row.updatedAt })}>Erase earlier draft</button></div></div>)}</details>}<button className="phone-settings-link danger-text" disabled={Boolean(busy) || loading || locked} onClick={() => setDialog({ kind: "clear" })}><span>Clear this phone’s saved data</span><Trash2 size={17} aria-hidden="true" /></button></section>
        <section className="phone-card phone-install-help"><h2>Add Career Finder to your phone</h2>{installPrompt && <button className="button primary full" onClick={async () => { const prompt = installPrompt; setInstallPrompt(null); try { await prompt.prompt(); } catch { setNotice({ text: "Use your browser menu to add Career Finder to the home screen.", error: true }); } }}>Add to home screen</button>}<p><strong>iPhone:</strong> open in Safari, tap Share, then Add to Home Screen. Keep Open as Web App on if offered.</p><p><strong>Android:</strong> open the browser menu and choose Add to Home screen or Install app, if offered.</p><p className="phone-note">An internet connection is needed to open this web app and confirm your account. Native phone app setup is available below.</p></section>
        <div className="phone-footer-links"><a href="/connect">Connect the native app</a><a href="/privacy">Privacy</a><a href="/support">Help</a>{account && <SignOutButton accountId={account.id} className="text-button" />}</div>
      </>}
    </main>
    <nav ref={navRef} className="phone-bottom-nav" aria-label="App sections">{tabs.map(item => <button key={item.id} disabled={loading} aria-current={tab === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><item.icon size={22} strokeWidth={tab === item.id ? 2.3 : 1.7} aria-hidden="true" /><span>{item.label}</span>{item.id === "saved" && due > 0 && <span className="phone-nav-dot" aria-label={`${due} follow-ups due`} />}</button>)}</nav>

    {dialog?.kind === "signin" && <Modal notice={notice} checkingIdentity={checkingIdentity} onCheckIdentity={() => identityCheckRef.current()} title="Your private workspace" busy={Boolean(busy)} onClose={() => setDialog(null)}><p>Sign in to save a profile online. Your existing guest shortlist stays on this phone and is not copied into an account automatically.</p><SignInOptions destination="phone" /></Modal>}
    {dialog?.kind === "details" && <Modal notice={notice} checkingIdentity={checkingIdentity} onCheckIdentity={() => identityCheckRef.current()} title={dialog.job.title} busy={Boolean(busy)} onClose={() => setDialog(null)}><p className="phone-company">{dialog.job.company}</p>{dialog.job.location && <p>{dialog.job.location}</p>}{dialog.job.summary && <p className="phone-detail-summary">{dialog.job.summary}</p>}{dialog.job.checkedAt && <p className="phone-note">Checked {displayTime(dialog.job.checkedAt)}. Confirm current details on the employer’s page.</p>}<RecordSummary record={recordsByID.get(jobIdentity(dialog.job.url))} /><a className="button primary full" href={dialog.job.url} target="_blank" rel="noopener noreferrer">Open employer page <ArrowUpRight size={18} aria-hidden="true" /></a><p className="phone-note">Opening a page does not submit an application. Complete the employer’s form, then record your progress here.</p><div className="phone-dialog-stack"><button className="button secondary full" disabled={cannotSave} onClick={() => editRecord(dialog.job)}>Edit application record</button>{!jobs.some(job => jobIdentity(job.url) === jobIdentity(dialog.job.url)) ? <button className="button secondary full" disabled={cannotSave} onClick={() => void saveJob(dialog.job)}>Save job</button> : <button className="text-button danger-text" disabled={cannotSave} onClick={() => setDialog({ kind: "remove", job: dialog.job, scope: local().scope })}>Remove bookmark</button>}</div></Modal>}
    {dialog?.kind === "record" && <Modal notice={notice} checkingIdentity={checkingIdentity} onCheckIdentity={() => identityCheckRef.current()} title="Application record" busy={Boolean(busy)} onClose={requestDialogClose}>{discardConfirmation}<p className="phone-detail-summary"><strong>{dialog.job.title}</strong><br />{dialog.job.company}</p><RecordEditor key={dialog.editorId} record={dialog.record} initialDraft={dialog.initialDraft} onDraftChange={setEditorDraft} onSave={(value, clear) => void saveRecord(value, clear)} onCancel={requestDialogClose} onDirtyChange={setDialogDirty} busy={Boolean(busy)} />{editorDraft && dialogDirty && <button className="text-button" disabled={Boolean(busy)} onClick={() => void run("Exporting unfinished edits", async () => exportUnfinished())}>Export unfinished record</button>}{dialog.existed && <button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => { if (dialogDirty) { setConfirmDialogDiscard(true); return; } setDialog({ kind: "delete-record", record: dialog.record, scope: dialog.scope }); }}>Delete this private record</button>}</Modal>}
    {dialog?.kind === "remove" && <Modal notice={notice} checkingIdentity={checkingIdentity} onCheckIdentity={() => identityCheckRef.current()} title="Remove this bookmark?" busy={Boolean(busy)} onClose={() => setDialog(null)}><p>{dialog.job.title}</p><p className="phone-detail-summary">Your application stage, notes, and follow-up date will stay in Saved as an application record. This does not withdraw an application or delete an online receipt.</p><div className="phone-dialog-actions"><button className="button secondary" disabled={Boolean(busy)} onClick={() => setDialog(null)}>Keep bookmark</button><button className="button danger" disabled={Boolean(busy)} onClick={() => void removeBookmark()}>Remove bookmark</button></div></Modal>}
    {dialog?.kind === "add" && <Modal notice={notice} checkingIdentity={checkingIdentity} onCheckIdentity={() => identityCheckRef.current()} title="Save a job link" busy={Boolean(busy)} onClose={requestDialogClose}>{discardConfirmation}<form onChange={() => setDialogDirty(true)} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); try { const job = jobSchema.parse({ id: crypto.randomUUID(), title: String(data.get("title")).trim(), company: String(data.get("company")).trim(), url: publicURL(String(data.get("url")).trim()), location: String(data.get("location")).trim(), country: "" }); if (!job.title || !job.company) throw Error("Add a job title and employer so you can find this job later."); void saveJob(job); } catch (error) { setNotice({ text: message(error), error: true }); } }}><p className="phone-note">Save a public job page from an employer or job board. The link stays on this phone until you prepare an online application.</p><label>Job link<input name="url" type="url" required maxLength={2048} placeholder="https://…" autoCapitalize="none" autoCorrect="off" /></label><label>Job title<input name="title" required maxLength={500} /></label><label>Employer<input name="company" required maxLength={250} /></label><label>Location <span className="optional">optional</span><input name="location" maxLength={500} /></label><button className="button primary full" type="submit" disabled={cannotSave}>Save on this phone</button></form></Modal>}
    {dialog?.kind === "clear" && <Modal notice={notice} checkingIdentity={checkingIdentity} onCheckIdentity={() => identityCheckRef.current()} title="Clear this phone’s saved data?" busy={Boolean(busy)} onClose={() => setDialog(null)}><p>This removes this workspace’s phone draft, saved bookmarks, private records, CV copy, and previous search results from this browser. Unfinished recovery copies are also removed. Small Stop locks remain so an earlier approval cannot resume after you clear personal drafts.</p>{storageProblem && <p className="phone-warning">Resetting also removes the browser encryption key. An encrypted recovery export alone cannot restore damaged data afterward. Keep the data here until recovery is complete, or choose Clear only if you accept losing it.</p>}<p className="phone-detail-summary">Online data and employer-held applications stay in place. You can manage online deletion from Account. If you can still open your saved data, choose Export phone data first to keep a readable JSON copy of your notes. This export cannot be restored into the app.</p><div className="phone-dialog-actions"><button className="button secondary" disabled={Boolean(busy)} onClick={() => setDialog(null)}>Keep my data</button><button className="button danger" disabled={Boolean(busy)} onClick={() => void run("Clearing phone data", async () => { const scope = snapshotRef.current?.scope ?? (account ? `account:${encodeURIComponent(account.id)}:${workspaceRef.current?.workspaceId ?? "new"}` : "guest"); setFormChanged(false); setEditorDraft(null); profileRecoveryId.current = null; recordRecoveryId.current = null; await phoneSafety.clearRecovery(scope); await removePhoneSnapshot(scope); window.location.reload(); })}>Clear phone data</button></div></Modal>}
    {dialog?.kind === "clear-old" && <Modal notice={notice} checkingIdentity={checkingIdentity} onCheckIdentity={() => identityCheckRef.current()} title="Erase this earlier browser draft?" busy={Boolean(busy)} onClose={() => setDialog(null)}><p>Draft saved {displayTime(dialog.updatedAt)}. This removes that earlier workspace’s profile draft, CV copy, bookmarks, private records, and unfinished recovery copies from this browser. Other workspaces and online data stay in place. Stop locks are retained.</p><p>Export this draft before erasing it if you want a readable copy.</p><div className="phone-dialog-actions"><button className="button secondary" disabled={Boolean(busy)} onClick={() => setDialog(null)}>Keep draft</button><button className="button danger" disabled={Boolean(busy)} onClick={() => void run("Erasing earlier browser draft", async generation => { if (dialog?.kind !== "clear-old" || !account || !dialog.scope.startsWith(`account:${encodeURIComponent(account.id)}:`) || dialog.scope === snapshotRef.current?.scope || !olderDrafts.some(row => row.scope === dialog.scope)) throw Error("Confirm this earlier draft’s account before erasing it."); const scope = dialog.scope; assertCurrent(generation); await phoneSafety.clearRecovery(scope); assertCurrent(generation); await removePhoneSnapshot(scope); assertCurrent(generation); setOlderDrafts(previous => previous.filter(row => row.scope !== scope)); setDialog(null); setNotice({ text: "That earlier workspace’s personal browser draft was erased. Other drafts and online data were kept." }); })}>Erase earlier draft</button></div></Modal>}
    {dialog?.kind === "recover" && <Modal notice={notice} checkingIdentity={checkingIdentity} onCheckIdentity={() => identityCheckRef.current()} title={dialog.draft.profile ? "Recover profile edits" : "Recover application-record edits"} busy={Boolean(busy)} onClose={() => setDialog(null)}><p>Recovery copy saved {displayTime(dialog.draft.savedAt)}. Opening it does not overwrite saved records or upload anything. Any other unfinished profile edits on this page will be kept as a separate recovery copy first.</p>{dialog.draft.record && <><h3>{dialog.draft.record.job.title}</h3><p>{dialog.draft.record.job.company}</p><p className="preserve-lines">{dialog.draft.record.draft.note || "No private note in this draft."}</p></>}<div className="phone-dialog-stack"><button className="button primary full" disabled={cannotSave} onClick={() => void restoreRecovery(dialog.draft)}>Open recovered edits</button><button className="button secondary full" disabled={Boolean(busy)} onClick={() => download(JSON.stringify(dialog.draft, null, 2), "Career-Finder-recovered-edits.json")}>Export this recovery copy</button><button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => void run("Discarding recovery copy", async generation => { const data = local(); const id = dialog.draft.id; adoptSafety(data.scope, await phoneSafety.discard(data.scope, id, dialog.draft.savedAt)); assertCurrent(generation, data.scope); setDialog(null); setNotice({ text: "That unfinished recovery copy was removed. Your saved profile and application records were kept." }); })}>Discard this recovery copy</button></div></Modal>}
    {dialog?.kind === "delete-record" && <Modal notice={notice} checkingIdentity={checkingIdentity} onCheckIdentity={() => identityCheckRef.current()} title="Delete this private application record?" busy={Boolean(busy)} onClose={() => setDialog(null)}><p><strong>{dialog.record.title}</strong> · {dialog.record.company}</p><p>This removes its private notes, dates, stage, and your personal applied mark from this browser. The bookmark stays. Employer-held applications and online receipts are unchanged. Removing an applied mark may allow another application review, so check the employer’s outcome before applying again.</p><div className="phone-dialog-actions"><button className="button secondary" disabled={Boolean(busy)} onClick={() => setDialog(null)}>Keep record</button><button className="button danger" disabled={cannotSave} onClick={() => void run("Deleting private application record", async generation => { const data = local(); if (dialog?.kind !== "delete-record" || data.scope !== dialog.scope || !same(data.records.find(value => value.identity === dialog.record.identity), dialog.record)) throw Error("This record changed. Open the current version before deleting it."); if (workspaceRef.current?.activePlanIds.some(id => { const review = workspaceRef.current?.recoverablePlans.find(plan => plan.id === id); return !review || review.items.some(item => jobIdentity(item.job.url) === dialog.record.identity); })) throw Error("Stop its approved review before deleting this private applied mark."); const identity = dialog.record.identity; await persist({ ...data, records: data.records.filter(value => value.identity !== identity) }, generation); setDialog(null); setEditorDraft(null); setNotice({ text: "Private record deleted. Its bookmark, online receipts, and employer-held application were kept." }); })}>Delete private record</button></div></Modal>}
    {dialog?.kind === "versions" && workspace && <Modal notice={notice} checkingIdentity={checkingIdentity} onCheckIdentity={() => identityCheckRef.current()} title="Compare profile versions" busy={Boolean(busy)} onClose={() => setDialog(null)}><p className="phone-note">Compare the essentials, then choose which version to keep editing. Replacing the online profile still requires Save profile online.</p><div className="phone-version-grid">{([{ name: "Phone draft", value: profile }, { name: "Online profile", value: workspace.profile }]).map(version => <section key={version.name}><h3>{version.name}</h3><dl><dt>Name</dt><dd>{[version.value.firstName, version.value.lastName].filter(Boolean).join(" ") || "Not added"}</dd><dt>Email</dt><dd>{version.value.email || "Not added"}</dd><dt>CV</dt><dd>{version.value.resume?.name || "Not added"}</dd><dt>LinkedIn</dt><dd>{version.value.linkedin || "Not added"}</dd><dt>Portfolio</dt><dd>{version.value.website || "Not added"}</dd></dl><details><summary>All profile details</summary><dl>{[{ label: "Phone", text: version.value.phone }, { label: "City", text: version.value.city }, { label: "Country or region", text: version.value.country }, { label: "Headline", text: version.value.headline }, { label: "Skills", text: version.value.skills.join(", ") }, { label: "Target roles", text: version.value.targetRoles.join(", ") }, { label: "Target countries", text: version.value.targetCountries.join(", ") }, { label: "Work preferences", text: version.value.workModes.join(", ") }, { label: "Experience level", text: version.value.experienceLevel }, { label: "CV size", text: version.value.resume ? `${version.value.resume.size} bytes` : "" }, { label: "CV fingerprint", text: version.value.resume?.sha256 ?? "" }].map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.text || "Not added"}</dd></div>)}</dl></details></section>)}</div><div className="phone-dialog-stack"><button className="button primary full" disabled={Boolean(busy)} onClick={() => { setProfile(previous => ({ ...previous, revision: workspace.profile.revision })); setFormChanged(true); setDialog(null); setNotice({ text: "Your phone draft is ready to edit. Save profile online only when you want to replace the online version." }); }}>Keep editing phone draft</button><button className="button secondary full" disabled={Boolean(busy)} onClick={() => void run("Using online profile", async generation => { const data = local(), value = withPDF(workspace.profile, profile); await persist({ ...data, profile: value, profileDirty: false }, generation); setProfile(value); setFormChanged(false); setPlan(null); setDialog(null); setNotice({ text: "Online profile copied to this phone. Your jobs and private notes were kept." }); })}>Replace phone draft with online profile</button></div></Modal>}
  </div>;
}
