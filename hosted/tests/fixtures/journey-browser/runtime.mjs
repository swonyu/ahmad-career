// Test-only worker: actual handlers, isolated D1/R2, and no real provider fetch.
import {createHostedApplicationHandler, SERVICE_ORIGIN} from '../../../server/applications.mjs';
import {createDiscoveryHandler, parseDiscoverySource} from '../../../server/discovery.mjs';
import {createOAuthHandler} from '../../../server/oauth.mjs';
import {makeAdapter} from '../../../server/provider.mjs';
import {sha256} from '../../../server/validation.mjs';
import {accounts, BOARD, SOURCE_ID, postingId, postings, searchSequencePostings, comparisonPostings, searchSequences, searchSequenceEpoch, catalog, fidelity} from './data.mjs';

let time = 0, board = 'open', outcome = 'by-job', sequence = 'journey', providerGets = 0, unexpectedProviderTargets = 0, capabilityEnvelopes = 0;
const posts = [], requests = [];
const json = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
function configuration(env) {
  const reviewedAt = Number(env.JOURNEY_REVIEW_EPOCH);
  return {version: 1, connectors: [{provider: 'lever', region: 'global', site: BOARD, apiKeyEnv: 'CAREER_JOURNEY_SYNTHETIC_KEY', postings: Object.fromEntries(postings.map(posting => [posting.id, {
    revision: 'synthetic-journey-v1', reviewedAt: new Date(reviewedAt).toISOString(), expiresAt: new Date(reviewedAt + 2 * 86400000).toISOString(),
    hasCustomQuestions: false, requiredFields: ['name', 'email', 'resume', 'consentStore', 'consentMarketing'], privacyPolicyUrl: 'https://example.com/synthetic/privacy',
  }]))}]};
}
async function syntheticProvider(address, options = {}) {
  const url = new URL(address), base = `/v0/postings/${BOARD}`, method = options.method ?? 'GET';
  const id = url.pathname.startsWith(base + '/') ? url.pathname.slice(base.length + 1) : null;
  const posting = [...postings, ...searchSequencePostings, ...comparisonPostings].find(value => value.id === id);
  if (url.origin !== 'https://api.lever.co' || !['GET', 'POST'].includes(method) || !(url.pathname === base && method === 'GET' || posting) || method === 'POST' && !postings.some(value => value.id === id)) {
    unexpectedProviderTargets++;
    throw Error('Fixture blocked an unexpected provider target');
  }
  if (method === 'GET') {
    providerGets++;
    if (board === 'unavailable') throw Error('Synthetic provider is unreachable');
    if (posting) return board === 'closed' && id === postingId(2) ? json({ok: false}, 404) : json(posting);
    const candidates = sequence === 'journey' ? postings : searchSequences[sequence];
    const rows = board === 'empty' ? [] : candidates.filter(value => !(board === 'closed' && value.id === postingId(2)));
    // A duplicate upstream row must be removed by the actual discovery normalizer.
    const duplicateRows = rows.length ? [...rows, {...rows[0]}] : rows;
    const skip = Number(url.searchParams.get('skip') ?? 0), limit = Number(url.searchParams.get('limit') ?? 100);
    return json(duplicateRows.slice(skip, skip + limit));
  }
  const form = options.body, resume = form.get('resume');
  if (!(resume instanceof Blob)) throw Error('Synthetic provider requires the actual multipart PDF');
  const bytes = new Uint8Array(await resume.arrayBuffer());
  const attempt = {postingId: id, resumeSHA256: sha256(bytes), bytes: bytes.length, email: String(form.get('email')), name: String(form.get('name')), consentStore: form.get('consent[store]'), consentMarketing: form.get('consent[marketing]')};
  posts.push(attempt);
  const selected = outcome === 'by-job' ? id === postingId(3) ? 'uncertain' : id === postingId(4) && posts.filter(value => value.postingId === id).length === 1 ? 'rate_limited' : id === postingId(5) ? 'rejected' : 'confirmed' : outcome;
  if (selected === 'uncertain') throw Error('Synthetic response was lost after receipt by the local provider');
  if (selected === 'rate_limited') return new Response(JSON.stringify({ok: false}), {status: 429, headers: {'Content-Type': 'application/json', 'Retry-After': '10'}});
  if (selected === 'rejected') return json({ok: false}, 422);
  return json({ok: true, applicationId: `synthetic-journey-${id}`});
}
const applications = createHostedApplicationHandler({clock: () => time, adapterFactory: env => ({...makeAdapter(env, {fetchImpl: syntheticProvider}), mode: 'test'})});
const discovery = createDiscoveryHandler({clock: () => sequence === 'journey' ? time : searchSequenceEpoch, fetchImpl: syntheticProvider});
const oauth = createOAuthHandler({clock: () => time, fetchImpl: () => {throw Error('OAuth requests are forbidden in the synthetic journey');}});
const phoneRoutes = new Set(['workspace', 'profile', 'jobs', 'prepare', 'submit', 'advance', 'stop', 'receipts']);

export default {
  async fetch(request, env, ctx) {
    time = Date.now();
    const url = new URL(request.url);
    if (url.pathname === '/__journey/state' && request.method === 'GET') return json({ok: true, board, outcome, sequence, discoveryClock: sequence === 'journey' ? 'real request time' : new Date(searchSequenceEpoch).toISOString(), providerGets, providerPosts: posts.length, posts, unexpectedProviderTargets, capabilityEnvelopes, requests: requests.slice(-100), fidelity});
    if (url.pathname === '/__journey/control' && request.method === 'POST') {
      const body = await request.json();
      if (!body || typeof body !== 'object' || Object.keys(body).some(key => !['board', 'outcome', 'sequence'].includes(key)) || body.board !== undefined && !['open', 'closed', 'empty', 'unavailable'].includes(body.board) || body.outcome !== undefined && !['by-job', 'confirmed', 'uncertain', 'rate_limited', 'rejected'].includes(body.outcome) || body.sequence !== undefined && !['journey', 'ab', 'bc', 'cb', 'compare'].includes(body.sequence)) return json({ok: false, error: {code: 'invalid_fixture_control'}}, 400);
      if (body.board !== undefined) board = body.board;
      if (body.sequence !== undefined) sequence = body.sequence;
      if (body.board !== undefined || body.sequence !== undefined) {
        // Only expire this fixture board. Retain its previous rows for real stale-result behavior.
        await env.DB.prepare('UPDATE discovery_cache SET expires_at=0,retry_at=0,lease_until=0 WHERE id=?').bind(SOURCE_ID).run();
      }
      if (body.outcome !== undefined) outcome = body.outcome;
      return json({ok: true, board, outcome, sequence});
    }
    if (!(url.pathname === '/api/account' && request.method === 'GET' || url.pathname === '/api/auth/status' && request.method === 'GET' || url.pathname.startsWith('/api/phone/') && phoneRoutes.has(url.pathname.slice(11)) && ['GET', 'POST', 'PUT'].includes(request.method) || ['/api/discovery/sources', '/api/discovery/search'].includes(url.pathname) && request.method === 'GET')) return json({ok: false, error: {code: 'fixture_route_denied'}}, 404);
    const headers = new Headers(request.headers), actor = headers.get('x-journey-actor') ?? 'guest';
    if (!['guest', 'a', 'b'].includes(actor)) return json({ok: false, error: {code: 'fixture_actor_denied'}}, 400);
    for (const name of [...headers.keys()]) if (name.startsWith('oai-authenticated-user-') || name.startsWith('x-journey-') || ['authorization', 'cookie', 'cf-connecting-ip'].includes(name)) headers.delete(name);
    const identity = accounts[actor];
    if (identity) {headers.set('oai-authenticated-user-id', identity.id); headers.set('oai-authenticated-user-email', identity.email); headers.set('oai-authenticated-user-full-name', identity.name);}
    headers.set('host', new URL(SERVICE_ORIGIN).host);
    // Reserved documentation IP, supplied by the modeled edge; no personal client address is read.
    headers.set('cf-connecting-ip', '192.0.2.44');
    const adapted = new Request(SERVICE_ORIGIN + url.pathname + url.search, new Request(request, {headers}));
    const bindings = {...env, CAREER_CONNECTORS_JSON: JSON.stringify(configuration(env)), CAREER_JOURNEY_SYNTHETIC_KEY: 'synthetic-only-never-a-real-credential'};
    let response;
    if (url.pathname === '/api/discovery/sources') response = json(catalog);
    else if (url.pathname === '/api/discovery/search') {
      const selected = url.searchParams.getAll('source');
      let permitted = selected.length > 0;
      try {permitted &&= selected.every(value => parseDiscoverySource(value).id === SOURCE_ID);} catch {permitted = false;}
      if (!permitted) return json({ok: false, error: {code: 'fixture_source_denied', message: 'Choose the synthetic employer board.'}}, 400);
      // Preserve the original array and URL forms so the real parser, including
      // canonical-duplicate rejection, is exercised without admitting another board.
      response = await discovery(adapted, bindings);
    } else if (url.pathname === '/api/auth/status') response = await oauth(adapted, bindings, ctx);
    else response = await applications(adapted, bindings, ctx);
    requests.push({path: url.pathname, method: request.method, actor, status: response.status});
    if (url.pathname === '/api/phone/workspace' && response.ok) {
      const value = await response.json();
      if (value.mode !== 'test' || value.capabilities?.mode !== 'test' || value.capabilities.liveEnabled !== false) throw Error('Unexpected production capability shape');
      // Explicit fixture seam: exercise the unchanged UI guard without creating live receipts.
      value.capabilities.liveEnabled = true;
      capabilityEnvelopes++;
      return new Response(JSON.stringify(value), {status: response.status, headers: response.headers});
    }
    return response;
  },
};
