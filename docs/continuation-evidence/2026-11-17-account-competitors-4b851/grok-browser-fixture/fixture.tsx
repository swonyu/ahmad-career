import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import SessionRecovery from "@career/SessionRecovery";
import SignInOptions from "@career/SignInOptions";
import OAuthFeedback from "@career/OAuthFeedback";
import ProviderConnections from "@career/ProviderConnections";
import LocaleProvider, { setLanguagePreference, useI18n } from "@career/LocaleProvider";
import { accountId, components, scenarios, findScenario } from "./scenarios.mjs";

type FixtureState = { scenarioId: string; delayMs: number; requests: Array<{ id: number; method: string; path: string; status: number | null; aborted?: boolean; body?: unknown }>; counts: Record<string, number>; repaired: boolean };
async function fixtureRequest(path: string, body?: unknown): Promise<FixtureState> {
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  if (!response.ok) throw new Error("Fixture control request failed: " + response.status);
  return response.json();
}
function prepareURL(component: string, scenarioId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("component", component);
  url.searchParams.delete("oauth_provider"); url.searchParams.delete("oauth_result");
  const scenario = findScenario(scenarioId);
  if (component === "oauth" && scenario.oauth) {
    url.searchParams.set("oauth_provider", scenario.oauth[0]);
    url.searchParams.set("oauth_result", scenario.oauth[1]);
  }
  window.history.replaceState(null, "", url);
}
function Fixture() {
  const { language } = useI18n();
  const requested = new URLSearchParams(window.location.search).get("component");
  const [component, setComponent] = useState(components.some(item => item.id === requested) ? requested! : "connections");
  const [activeComponent, setActiveComponent] = useState(component);
  const [scenarioId, setScenarioId] = useState("healthy");
  const [delayMs, setDelayMs] = useState(1500);
  const [server, setServer] = useState<FixtureState | null>(null);
  const [mounted, setMounted] = useState(false);
  const [recoveryAccountId, setRecoveryAccountId] = useState(accountId);
  const [mountKey, setMountKey] = useState(0);
  const [applying, setApplying] = useState(false);
  const [controlError, setControlError] = useState("");
  const [focusLabel, setFocusLabel] = useState("No focused control");
  useEffect(() => {
    let active = true;
    fixtureRequest("/__fixture/state").then(state => {
      if (!active) return;
      setServer(state); setScenarioId(state.scenarioId); setDelayMs(state.delayMs);
      prepareURL(component, state.scenarioId); setMounted(true);
    }).catch(error => { if (active) setControlError(String(error)); });
    const timer = window.setInterval(() => {
      focused();
      if (document.visibilityState === "visible") fixtureRequest("/__fixture/state").then(state => { if (active) setServer(state); }).catch(() => {});
    }, 750);
    const focused = () => {
      const element = document.activeElement as HTMLElement | null;
      setFocusLabel(element === document.body ? "body (no focused control)" : element ? [element.tagName.toLowerCase(), element.id && "#" + element.id, element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 140)].filter(Boolean).join(" · ") : "No focused control");
    };
    document.addEventListener("focusin", focused);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("focusin", focused); };
  }, []);
  async function apply() {
    setApplying(true); setMounted(false); setRecoveryAccountId(accountId); setControlError("");
    try {
      const state = await fixtureRequest("/__fixture/scenario", { scenarioId, delayMs });
      prepareURL(component, scenarioId); setActiveComponent(component); setServer(state); setMountKey(key => key + 1); setMounted(true);
    } catch (error) { setControlError(String(error)); }
    finally { setApplying(false); }
  }
  async function repair() {
    try { setServer(await fixtureRequest("/__fixture/repair", {})); setControlError(""); }
    catch (error) { setControlError(String(error)); }
  }
  const scenario = findScenario(server?.scenarioId ?? scenarioId);
  return <>
    <header className="fixture-controls" lang="en" dir="ltr">
      <p className="fixture-kicker">Disposable loopback fixture · synthetic accounts only</p>
      <h1>Career Finder account components</h1>
      <p>Real production React components, API helpers, translations and styles. Framework Image alone is rendered as an ordinary image. No live authentication, provider account, OAuth redirect or hosted backend is used.</p>
      <div className="fixture-fields">
        <label htmlFor="fixture-component">Component<select id="fixture-component" value={component} onChange={event => setComponent(event.target.value)}>{components.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label htmlFor="fixture-scenario">Server scenario<select id="fixture-scenario" value={scenarioId} onChange={event => setScenarioId(event.target.value)}>{scenarios.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label htmlFor="fixture-delay">Response delay<select id="fixture-delay" value={delayMs} onChange={event => setDelayMs(Number(event.target.value))}>{[0, 500, 1500, 4000, 21000].map(value => <option key={value} value={value}>{value} ms{value === 21000 ? " (exceeds API timeout)" : ""}</option>)}</select></label>
        <label htmlFor="fixture-language">Product language<select id="fixture-language" value={language} onChange={event => setLanguagePreference(event.target.value as "en" | "ar")}><option value="en">English</option><option value="ar">العربية</option></select></label>
      </div>
      {activeComponent === "recovery" && <label htmlFor="fixture-recovery-account">Supplied recovery account<select id="fixture-recovery-account" value={recoveryAccountId} onChange={event => setRecoveryAccountId(event.target.value)}><option value={accountId}>Synthetic account A</option><option value="fixture-account-b">Synthetic account B</option></select></label>}
      <div className="fixture-actions">
        <button className="button" disabled={applying} onClick={() => void apply()}>{applying ? "Applying…" : "Apply scenario and mount"}</button>
        <button className="button secondary" disabled={applying || !server} onClick={() => void repair()}>Make next responses healthy</button>
        <button className="button secondary" disabled={applying || !server} onClick={() => { if (!mounted) prepareURL(activeComponent, server?.scenarioId ?? scenarioId); setMounted(value => !value); }}>{mounted ? "Unmount component" : "Mount component"}</button>
      </div>
      <p className="fixture-note">Apply resets synthetic request counts and remounts the component. Make next responses healthy changes only the stub server; use the component's own retry afterward. Focus monitoring is observational and never moves focus.</p>
      {controlError && <p role="alert">{controlError}</p>}
      <p className="fixture-observation">Focused element: <output>{focusLabel}</output></p>
      <a href="#component-under-test">Jump to component</a> · <a href="/build-metadata.json" target="_blank" rel="noreferrer">Source and build metadata</a>
    </header>
    <main className="fixture-main">
      <section className="fixture-scenario" lang="en" dir="ltr"><h2>Active synthetic scenario · {components.find(item => item.id === activeComponent)?.label}</h2><p>{scenario.note}</p><p>Account supplied to components: <code>{activeComponent === "recovery" ? recoveryAccountId : accountId}</code>. Delay: {server?.delayMs ?? "…"} ms.{server?.repaired ? " Next responses are healthy." : ""}</p>{new URLSearchParams(window.location.search).has("fixture_return") && <p role="status">Local recovery navigation completed. No provider was contacted.</p>}</section>
      <section id="component-under-test" className="fixture-product" aria-label="Production component under test" tabIndex={-1} key={mountKey}>
        {mounted && (activeComponent === "connections" ? <ProviderConnections accountId={accountId} /> : activeComponent === "signin" ? <SignInOptions destination="account" /> : activeComponent === "recovery" ? <SessionRecovery accountId={recoveryAccountId} /> : <OAuthFeedback />)}
        {!mounted && <p lang="en" dir="ltr">Component unmounted.</p>}
      </section>
      <section className="fixture-requests" lang="en" dir="ltr"><h2>Synthetic request ledger</h2><p>Only auth endpoint traffic is counted. Focus, pageshow and visibility recovery may legitimately add status GETs. No automatic replay of a mutation is expected.</p>
        <dl>{Object.entries(server?.counts ?? {}).map(([name, count]) => <div key={name}><dt>{name}</dt><dd>{count}</dd></div>)}</dl>
        <pre aria-label="Synthetic auth request ledger">{JSON.stringify(server?.requests ?? [], null, 2)}</pre>
      </section>
    </main>
  </>;
}
createRoot(document.getElementById("root")!).render(<LocaleProvider initialLanguage="en"><Fixture /></LocaleProvider>);
