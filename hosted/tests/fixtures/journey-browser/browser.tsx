import React from 'react';
import {createRoot} from 'react-dom/client';
import LocaleProvider, {setLanguagePreference, useI18n} from '../../../app/i18n/LocaleProvider';
import PhoneApp from '../../../app/phone/PhoneApp';
import AccountPage from '../../../app/account/page';
import type {AppRequestContext} from '../../../app/request-context';
import {accounts, fidelity} from './data.mjs';

const params = new URLSearchParams(location.search);
const requestedActor = params.get('actor') ?? 'guest';
const initialActor = ['guest', 'a', 'b'].includes(requestedActor) ? requestedActor : 'guest';
const view = params.get('view') === 'account' ? 'account' : 'phone';
let actor = initialActor, offline = false, loseNextMutationResponse = false, holdRecheck = false;
const waiting = new Set<() => void>();
const requests: Array<Record<string, unknown>> = [];
const nativeFetch = window.fetch.bind(window);
const allowed = /^\/api\/(?:phone\/(?:workspace|profile|jobs|prepare|submit|advance|stop|receipts)|discovery\/(?:sources|search)|auth\/status)$/;
const accountReads = new Set(['/api/account', '/api/auth/status']);
const record = (value: Record<string, unknown>) => {requests.push({at: Math.round(performance.now()), ...value}); if (requests.length > 300) requests.shift();};

window.fetch = async (input, options = {}) => {
  if (typeof input !== 'string' && !(input instanceof URL)) throw TypeError('Only explicit synthetic fixture paths are supported');
  const url = new URL(String(input), location.href), method = options.method ?? 'GET';
  const admitted = view === 'account' ? method === 'GET' && accountReads.has(url.pathname) : allowed.test(url.pathname) && ['GET', 'POST', 'PUT'].includes(method);
  if (url.origin !== location.origin || !admitted) {record({path: url.pathname, method, view, phase: 'request-blocked'}); throw TypeError('This fixture blocks all unrelated network requests');}
  record({path: url.pathname, method, actor, phase: 'begin'});
  if (offline) {record({path: url.pathname, method, phase: 'offline'}); throw TypeError('Synthetic network unavailable');}
  if (holdRecheck && method === 'GET' && ['/api/phone/workspace', '/api/account', '/api/auth/status'].includes(url.pathname)) {
    await new Promise<void>((resolve, reject) => {
      const release = () => {waiting.delete(release); options.signal?.removeEventListener('abort', abort); resolve();};
      const abort = () => {waiting.delete(release); reject(new DOMException('Cancelled', 'AbortError'));};
      waiting.add(release); options.signal?.addEventListener('abort', abort, {once: true});
      if (options.signal?.aborted) abort();
    });
  }
  const drop = method !== 'GET' && loseNextMutationResponse;
  if (drop) loseNextMutationResponse = false;
  const headers = new Headers(options.headers);
  headers.set('x-journey-actor', actor);
  headers.delete('authorization'); headers.delete('cookie');
  const response = await nativeFetch(url.pathname + url.search, {...options, headers, credentials: 'omit', redirect: 'error', cache: 'no-store'});
  record({path: url.pathname, method, actor, phase: drop ? 'synthetic-response-lost' : 'response', status: response.status});
  if (drop) {void response.body?.cancel().catch(() => {}); throw TypeError('Synthetic response lost after the actual local handler completed');}
  return response;
};

async function providerControl(value: Record<string, string>) {
  const response = await nativeFetch('/__journey/control', {method: 'POST', credentials: 'omit', redirect: 'error', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)});
  if (!response.ok) throw Error('Synthetic control was rejected');
  return response.json();
}
async function control(action: string, value?: string) {
  if (action === 'actor' && ['guest', 'a', 'b'].includes(value ?? '')) {actor = value!; window.dispatchEvent(new Event('focus'));}
  else if (action === 'offline') {offline = true; window.dispatchEvent(new Event('offline'));}
  else if (action === 'online') {offline = false; window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus'));}
  else if (action === 'lose-next-mutation-response') loseNextMutationResponse = true;
  else if (action === 'hold-recheck') {holdRecheck = true; window.dispatchEvent(new Event('focus'));}
  else if (action === 'release-recheck') {holdRecheck = false; for (const release of [...waiting]) release();}
  else if (action === 'board' && ['open', 'closed', 'empty', 'unavailable'].includes(value ?? '')) return providerControl({board: value!});
  else if (action === 'outcome' && ['by-job', 'confirmed', 'uncertain', 'rate_limited', 'rejected'].includes(value ?? '')) return providerControl({outcome: value!});
  else if (action === 'sequence' && ['journey', 'ab', 'bc', 'cb'].includes(value ?? '')) return providerControl({sequence: value!});
  else throw Error('Unknown synthetic control');
}
function metrics() {
  const active = document.activeElement, rect = active?.getBoundingClientRect();
  return {kind: 'journey-metrics', synthetic: true, view, initialActor, responseActor: actor, offline, loseNextMutationResponse, holdRecheck,
    width: innerWidth, height: innerHeight, scrollY, horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    language: document.documentElement.lang, direction: document.documentElement.dir, rootTextSize: getComputedStyle(document.documentElement).fontSize,
    focusedBounds: rect ? {top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right} : null,
    requests: requests.slice(), fidelity};
}
async function state() {return (await nativeFetch('/__journey/state', {credentials: 'omit', redirect: 'error', cache: 'no-store'})).json();}
const fixture = {control, metrics, state, setLanguage: setLanguagePreference, setTextSize: (percent: number) => {if (![100, 200].includes(percent)) throw Error('Unsupported fixture size'); document.documentElement.style.fontSize = `${percent}%`;}};
(window as unknown as {__careerJourney: typeof fixture}).__careerJourney = fixture;
document.documentElement.dataset.syntheticFixture = 'career-journey';
document.addEventListener('click', event => {
  const anchor = event.target instanceof Element ? event.target.closest('a') : null;
  if (anchor && !anchor.getAttribute('href')?.startsWith('#') && (view === 'account' || !anchor.download)) {
    event.preventDefault(); record({phase: 'navigation-blocked', label: anchor.textContent?.trim().slice(0, 100)});
    parent.postMessage({kind: 'journey-navigation-blocked', synthetic: true, label: anchor.textContent?.trim()}, location.origin);
  }
}, true);
window.open = () => {record({phase: 'window-open-blocked'}); return null;};
window.addEventListener('message', async event => {
  if (event.source !== parent || event.origin !== location.origin) return;
  try {
    if (event.data?.kind === 'journey-control') await control(event.data.action, event.data.value);
    if (event.data?.kind === 'journey-language') fixture.setLanguage(event.data.value === 'ar' ? 'ar' : 'en');
    if (event.data?.kind === 'journey-font') fixture.setTextSize(event.data.percent);
    if (event.data?.kind?.startsWith('journey-')) parent.postMessage(metrics(), location.origin);
  } catch {parent.postMessage({kind: 'journey-control-error', synthetic: true}, location.origin);}
});
function FixturePage() {
  const {language} = useI18n();
  const account = initialActor === 'guest' ? null : accounts[initialActor as 'a' | 'b'];
  // Page authority stays fixed to the actor selected at mount. Response-actor
  // changes exercise the real mismatch guards, never replace page identity.
  const context: AppRequestContext = {user: account ? {userId: account.id, displayName: account.name, email: account.email, fullName: account.name, method: 'chatgpt'} : null, language, languagePreference: language};
  return view === 'account' ? <AccountPage context={context}/> : <PhoneApp account={account}/>;
}
function mount() {
  createRoot(document.getElementById('root')!).render(<React.StrictMode><LocaleProvider initialLanguage={params.get('lang') === 'ar' ? 'ar' : 'en'}><FixturePage/></LocaleProvider></React.StrictMode>);
}
if (document.readyState === 'complete') setTimeout(mount, 0); else window.addEventListener('pageshow', () => setTimeout(mount, 0), {once: true});
