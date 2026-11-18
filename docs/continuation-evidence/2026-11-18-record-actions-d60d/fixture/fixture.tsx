import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { fixtureOrigin, fixtureOwnerKey, fixtureOwner, seedLockName, assertSeedableGuest, seedSyntheticWorkspace, type SeedMode } from "./seed-fixtures";
import PhoneApp from "@career/PhoneApp";
import LocaleProvider, { setLanguagePreference } from "@career/LocaleProvider";
const ownerKey = fixtureOwnerKey, owner = fixtureOwner;
const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, " ").trim() || "";
async function control(path: string, body?: unknown) {
  const response = await fetch(path, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw Error("Fixture control failed: " + response.status);
  return response.json();
}
async function guardStorage() {
  if (location.origin !== fixtureOrigin || !window.isSecureContext || !indexedDB.databases) throw Error("Use http://127.0.0.1:4183 in supported Chrome. Existing storage could not be verified; nothing was cleared.");
  const marker = localStorage.getItem(ownerKey), databases = await indexedDB.databases(), keys = Object.keys(localStorage), sessionKeys = Object.keys(sessionStorage);
  const workers = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistrations() : [], cacheNames = "caches" in window ? await caches.keys() : [];
  const cookies = document.cookie.split(";").map(value => value.trim()).filter(Boolean);
  if (marker !== owner) {
    if (marker || databases.length || keys.length || sessionKeys.length || cookies.some(cookie => !/^career_finder_language=(en|ar|system)$/.test(cookie)) || workers.length || cacheNames.length) throw Error("This origin already contains unknown data. Stop and choose a new unused port. No data was cleared or overwritten.");
    localStorage.setItem(ownerKey, owner);
  } else {
    const knownDBs = new Set(["career-finder-phone-vault", "career-finder-phone-safety"]), knownKeys = new Set([ownerKey, "career-finder:language:v1", "career-finder:theme:v1"]);
    if (databases.some(item => !item.name || !knownDBs.has(item.name)) || keys.some(key => !knownKeys.has(key)) || sessionKeys.length || cookies.some(cookie => !/^career_finder_language=(en|ar|system)$/.test(cookie)) || workers.length || cacheNames.length) throw Error("Unknown storage or worker found. Stop and use a new unused port; no data was cleared.");
  }
  return { owner, existingOwnedDatabases: databases.map(value => value.name), noStorageCleared: true };
}
function observeDOM() {
  const root = document.getElementById("fixture-product"), live = root?.querySelector(".phone-tab-search > p.visually-hidden[role=status][aria-live=polite]");
  return {
    language: document.documentElement.lang, direction: document.documentElement.dir,
    viewport: { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 },
    cards: root?.querySelectorAll(".phone-results .phone-job-card").length ?? 0,
    resultsHeading: text(root?.querySelector(".phone-results .phone-section-heading")),
    live: { text: text(live), role: live?.getAttribute("role"), politeness: live?.getAttribute("aria-live"), atomic: live?.getAttribute("aria-atomic") },
    saved: {
      cards: root?.querySelectorAll(".phone-saved-card").length ?? 0,
      query: (root?.querySelector(".phone-saved-search input") as HTMLInputElement | null)?.value ?? null,
      selectedStage: (root?.querySelector(".phone-saved-stage select") as HTMLSelectElement | null)?.value ?? null,
      stages: [...(root?.querySelectorAll(".phone-saved-stage option") || [])].map(option => ({ value: (option as HTMLOptionElement).value, text: text(option) })),
      views: [...(root?.querySelectorAll(".phone-segmented button") || [])].map(button => ({ text: text(button), pressed: button.getAttribute("aria-pressed") })),
      emptyText: text(root?.querySelector(".phone-tab-saved .phone-empty")),
      emptyButtons: [...(root?.querySelectorAll(".phone-tab-saved .phone-empty button") || [])].map(text),
      records: [...(root?.querySelectorAll(".phone-saved-card") || [])].map(card => ({ title: text(card.querySelector("h2")), stage: text(card.querySelector(".phone-stage")), summary: text(card.querySelector(".phone-record-summary")) })),
    },
    busy: text(root?.querySelector(".phone-progress")),
    guidance: [...(root?.querySelectorAll(".phone-results .phone-inline-note") || [])].map(text),
    sourceNotes: [...(root?.querySelectorAll(".phone-source-note") || [])].map(note => { const link = note.querySelector("a"); return { text: text(note), href: link?.getAttribute("href"), target: link?.getAttribute("target"), rel: link?.getAttribute("rel"), linkTextIncludingHiddenEmployer: text(link) }; }),
    resultButtons: [...(root?.querySelectorAll(".phone-results > button") || [])].map(button => ({ text: text(button), disabled: (button as HTMLButtonElement).disabled })),
  };
}
function Fixture({ initial, storage }: { initial: any; storage: unknown }) {
  const [state, setState] = useState(initial), [scenario, setScenario] = useState(initial.scenarioId), [delay, setDelay] = useState(initial.delayMs);
  const [language, setLanguage] = useState(document.documentElement.lang === "ar" ? "ar" : "en"), [mountKey, setMountKey] = useState(0), [mounted, setMounted] = useState(true), [pending, setPending] = useState(false), [problem, setProblem] = useState("");
  const [dom, setDOM] = useState<ReturnType<typeof observeDOM> | null>(null), [history, setHistory] = useState<unknown[]>([]), [destinations, setDestinations] = useState<unknown[]>([]), [receipt, setReceipt] = useState<unknown>(null);
  const [actionTextScale, setActionTextScale] = useState("100");
  const root = useRef<HTMLDivElement>(null), last = useRef<string | null>(null);
  const action = useRef(false), productEditSeen = useRef(false);
  const [seedReceipt, setSeedReceipt] = useState<Awaited<ReturnType<typeof seedSyntheticWorkspace>> | null>(null);
  function trackProductEdit(event: React.SyntheticEvent) {
    const target = event.target;
    if (target instanceof Element && !target.closest(".phone-saved-stage, .phone-saved-search")) productEditSeen.current = true;
  }
  function trackProductButtonEdit(event: React.MouseEvent) {
    // These controls may edit a draft without dispatching an input event.
    if (event.target instanceof Element && event.target.closest(".phone-tab-profile button, .phone-tab-search .phone-suggestions button")) productEditSeen.current = true;
  }
  function requireIdleProduct() {
    if (productEditSeen.current) throw Error("Seed refused: a product form or CV was edited in this page. Keep those edits; use a new fixture origin for another seed.");
    const addJobButton = root.current?.querySelector<HTMLButtonElement>(".phone-tab-saved .phone-toolbar button");
    if (!addJobButton || addJobButton.disabled || root.current?.querySelector(".phone-progress, .phone-warning, .phone-notice.is-error, dialog[open], .phone-main > .phone-note[role=status]")) throw Error("Open Saved and wait for the product to finish. Close its dialog before seeding; existing data is kept.");
  }
  async function seed(mode: SeedMode) {
    if (action.current || pending) return;
    action.current = true; setPending(true); setProblem("");
    let unmounted = false;
    try {
      if (!navigator.locks) throw Error("Seed refused: this browser cannot provide the fixture seed lock.");
      await navigator.locks.request(seedLockName, { mode: "exclusive", ifAvailable: true }, async lock => {
        if (!lock) throw Error("Seed refused: another fixture seed is running. No data was changed.");
        requireIdleProduct();
        await assertSeedableGuest(guardStorage);
        requireIdleProduct();
        flushSync(() => setMounted(false)); unmounted = true;
        const next = await seedSyntheticWorkspace(mode, guardStorage);
        setSeedReceipt(next); setReceipt(null); setMountKey(value => value + 1); setMounted(true);
      });
    } catch (error) { setProblem(String(error) + (unmounted ? " Product remains unmounted after the refusal; inspect the saved data before reloading. No cleanup or overwrite retry was attempted." : "")); }
    finally { action.current = false; setPending(false); }
  }
  useEffect(() => {
    if (!root.current) return;
    let stopped = false, queued = false;
    const capture = () => { if (stopped || queued) return; queued = true; requestAnimationFrame(() => { queued = false; if (stopped) return; const value = observeDOM(); setDOM(old => JSON.stringify(old) === JSON.stringify(value) ? old : value); const key = JSON.stringify([value.live.text, value.cards, Boolean(value.busy)]); if (key !== last.current) { last.current = key; setHistory(old => [...old, { at: new Date().toISOString(), live: value.live, cards: value.cards, busy: Boolean(value.busy) }].slice(-60)); } }); };
    const observer = new MutationObserver(capture); observer.observe(root.current, { subtree: true, childList: true, characterData: true, attributes: true }); window.addEventListener("resize", capture); capture();
    return () => { stopped = true; observer.disconnect(); window.removeEventListener("resize", capture); };
  }, [mounted, mountKey]);
  useEffect(() => {
    const intercept = (event: MouseEvent) => { const link = event.target instanceof Element ? event.target.closest("a") : null; if (!link || !root.current?.contains(link)) return; const url = new URL(link.href, location.href); if (url.origin !== location.origin || !["/", "/phone"].includes(url.pathname)) { event.preventDefault(); event.stopImmediatePropagation(); setDestinations(old => [...old, { at: new Date().toISOString(), href: link.href, text: text(link), target: link.target, rel: link.rel, navigationBlockedByFixture: true }].slice(-20)); } };
    document.addEventListener("click", intercept, true); document.addEventListener("auxclick", intercept, true);
    return () => { document.removeEventListener("click", intercept, true); document.removeEventListener("auxclick", intercept, true); };
  }, []);
  async function apply() {
    if (action.current || pending) return;
    if (productEditSeen.current) { setProblem("Scenario remount refused because product form edits were observed. Keep those edits."); return; }
    action.current = true;
    setPending(true); setProblem(""); setMounted(false); setReceipt(null);
    try { const next = await control("/__fixture/scenario", { scenarioId: scenario, delayMs: delay }); setState(next); last.current = null; setHistory([]); setDestinations([]); setMountKey(value => value + 1); setMounted(true); } catch (error) { setProblem(String(error)); } finally { action.current = false; setPending(false); }
  }
  async function capture() {
    try { const next = await control("/__fixture/state"), metadata = await control("/build-metadata.json"); setState(next); setReceipt({ capturedAt: new Date().toISOString(), boundary: "Actual PhoneApp DOM with synthetic discovery GETs. No hosted/native/provider or spoken screen-reader acceptance implied.", dom: observeDOM(), liveHistory: history, clickedDestinations: destinations, requests: next, storage, metadata, syntheticSeed: seedReceipt }); } catch (error) { setProblem(String(error)); }
  }
  return <><section className="fixture-panel" dir="ltr" lang="en" aria-label="Synthetic fixture controls"><h1>Career Finder synthetic stage verification fixture</h1><p>Actual current PhoneApp and styles. Synthetic jobs only. No account or employer API. Link clicks record the destination and stay local.</p><details open><summary>Fixture controls and evidence</summary><div className="fixture-control-grid"><label>Scenario<select value={scenario} onChange={event => setScenario(event.target.value)}>{initial.scenarios.map((value: any) => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label><label>Product language<select value={language} onChange={event => { setLanguage(event.target.value); setLanguagePreference(event.target.value === "ar" ? "ar" : "en"); }}><option value="en">English</option><option value="ar">العربية</option></select></label><label>Action text scale (fixture only)<select value={actionTextScale} onChange={event => setActionTextScale(event.target.value)}><option value="100">100%</option><option value="200">200%</option></select></label><label>GET delay (ms)<input type="number" min={0} max={2500} step={50} value={delay} onChange={event => setDelay(Number(event.target.value))} /></label></div><div className="fixture-actions"><button type="button" disabled={pending} onClick={() => void apply()}>Apply fixture scenario</button><button type="button" disabled={pending} onClick={() => void capture()}>Capture observed evidence</button></div><section aria-label="Synthetic Saved data controls"><h2>Synthetic Saved data</h2><p>Only the empty guest workspace on this assigned origin can be seeded. No database is cleared. First seed the Interview record-only item, use the normal product UI to delete it, and observe Clear recovery. Only after jobs and records are empty may you seed the 22-item corpus. Do not enter a real profile, CV or note.</p><div className="fixture-actions"><button type="button" disabled={pending || !mounted || Boolean(dom?.busy)} onClick={() => void seed("interview-record-only")}>Seed synthetic Interview record-only item</button><button type="button" disabled={pending || !mounted || Boolean(dom?.busy)} onClick={() => void seed("stage-corpus-22")}>Seed synthetic 22-item stage corpus</button></div><p role="status">{seedReceipt ? `Synthetic seed verified: ${seedReceipt.mode}; ${seedReceipt.counts.visibleItems} visible items, ${seedReceipt.counts.records} records, ${seedReceipt.counts.bookmarks} bookmarks. SHA-256 ${seedReceipt.payloadSHA256}` : "No synthetic seed has been written by these controls."}</p><details><summary>Synthetic seed manifest</summary><pre id="fixture-seed-receipt">{seedReceipt ? JSON.stringify(seedReceipt, null, 2) : "No seed receipt yet."}</pre></details></section><p>For these Saved checks, open Saved without running a search. Searching saves search state and makes this workspace ineligible for another seed. Scenario controls retain the existing synthetic search service; no storage is cleared.</p><p>Scenario: <strong>{state.scenarioId}</strong>. Viewport: <strong>{dom?.viewport.width ?? "pending"} × {dom?.viewport.height ?? "pending"}</strong>. Product cards: <strong>{dom?.cards ?? 0}</strong>.</p>{problem && <p className="fixture-problem" role="alert">{problem}</p>}{destinations.length > 0 && <p className="fixture-destination" role="status">Destination recorded. Fixture kept navigation local; no provider page was opened.</p>}<details><summary>Observed product DOM</summary><pre id="fixture-observation">{JSON.stringify(dom, null, 2)}</pre></details><details><summary>Observed live-region history (DOM only)</summary><pre>{JSON.stringify(history, null, 2)}</pre></details><details><summary>Captured evidence including GET ledger</summary><pre id="fixture-receipt">{receipt ? JSON.stringify(receipt, null, 2) : "Choose Capture observed evidence."}</pre></details></details></section><div id="fixture-product" className={actionTextScale === "200" ? "fixture-action-text-200" : undefined} ref={root} onInputCapture={trackProductEdit} onChangeCapture={trackProductEdit} onClickCapture={trackProductButtonEdit}>{mounted && <LocaleProvider initialLanguage={language === "ar" ? "ar" : "en"} initialPreference={language === "ar" ? "ar" : "en"}><PhoneApp key={mountKey} account={null} /></LocaleProvider>}</div></>;
}
async function boot() {
  const storage = await guardStorage(), params = new URLSearchParams(location.search), language = params.get("lang") === "ar" ? "ar" : "en";
  const initial = await control("/__fixture/scenario", { scenarioId: params.get("scenario") || "capped", delayMs: 250 });
  setLanguagePreference(language); createRoot(document.getElementById("fixture-root")!).render(<Fixture initial={initial} storage={storage} />);
}
void boot().catch(error => { const root = document.getElementById("fixture-root")!, heading = document.createElement("h1"), message = document.createElement("p"); heading.textContent = "Fixture stopped before mounting the product"; message.textContent = error instanceof Error ? error.message : String(error); root.className = "fixture-panel"; root.replaceChildren(heading, message); });
