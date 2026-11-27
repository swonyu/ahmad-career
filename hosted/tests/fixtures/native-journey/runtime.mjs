// Private Worker entry. Importing this file does not create a workspace or token.
import {createHostedApplicationHandler, SERVICE_ORIGIN} from '../../../server/applications.mjs';
import {createDiscoveryHandler, parseDiscoverySource} from '../../../server/discovery.mjs';
import {makeAdapter} from '../../../server/provider.mjs';
import {sha256} from '../../../server/validation.mjs';
import {BOARD, SOURCE_ID, OWNER, postings, postingId, catalog, fidelity} from './data.mjs';
import {FixtureError, matchesSecret, nativeRoute, nativeHeaders, assertTestCapabilities, assertBlankWorkspace, assertZeroDispatch} from './contract.mjs';

const counters = {providerGets: 0, providerPostAttempts: 0, forbiddenDispatchAttempts: 0, unexpectedProviderTargets: 0, capabilityChanges: 0};
const requests = [], controls = [];
let board = 'open', provisioningAttempted = false;
const json = (value, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
const fail = (code, status = 400) => { throw new FixtureError(code, status); };
function configuration(env) {
  const epoch = Number(env.NATIVE_JOURNEY_REVIEW_EPOCH);
  if (!Number.isSafeInteger(epoch) || epoch <= 0) fail('fixture_review_epoch_invalid', 503);
  return {version: 1, connectors: [{provider: 'lever', region: 'global', site: BOARD,
    apiKeyEnv: 'CAREER_NATIVE_JOURNEY_KEY', postings: Object.fromEntries(postings.map(p => [p.id, {
      revision: 'synthetic-native-journey-v1', reviewedAt: new Date(epoch).toISOString(),
      expiresAt: new Date(epoch + 2 * 86400000).toISOString(), hasCustomQuestions: false,
      requiredFields: ['name', 'email', 'resume'], privacyPolicyUrl: 'https://example.com/synthetic/privacy',
    }]))}]};
}
async function provider(address, options = {}) {
  const method = options.method ?? 'GET';
  if (method !== 'GET') { counters.providerPostAttempts++; fail('fixture_provider_write_denied', 403); }
  const url = new URL(address), base = `/v0/postings/${BOARD}`;
  const posting = postings.find(p => url.pathname === `${base}/${p.id}`);
  const keys = [...url.searchParams.keys()];
  if (url.origin !== 'https://api.lever.co' || url.username || url.password || url.hash ||
      !(url.pathname === base || posting) ||
      keys.some(k => !['mode', 'limit', 'skip'].includes(k) || url.searchParams.getAll(k).length !== 1) ||
      posting && keys.length || url.searchParams.has('mode') && url.searchParams.get('mode') !== 'json') {
    counters.unexpectedProviderTargets++; fail('fixture_provider_target_denied', 403);
  }
  counters.providerGets++;
  if (board === 'unavailable') return json({ok: false}, 503);
  if (posting) return board === 'closed' && posting.id === postingId(2) ? json({ok: false}, 404) : json(posting);
  const skipText = url.searchParams.get('skip') ?? '0', limitText = url.searchParams.get('limit') ?? '100';
  if (!/^\d{1,4}$/.test(skipText) || !/^\d{1,3}$/.test(limitText) || Number(limitText) < 1 || Number(limitText) > 100) {
    counters.unexpectedProviderTargets++; fail('fixture_provider_page_denied', 403);
  }
  const rows = postings.filter(p => !(board === 'closed' && p.id === postingId(2)));
  return json(rows.slice(Number(skipText), Number(skipText) + Number(limitText)));
}
const applications = createHostedApplicationHandler({adapterFactory: env => ({...makeAdapter(env, {fetchImpl: provider}), mode: 'test'})});
const discovery = createDiscoveryHandler({fetchImpl: provider});
const bindingFor = env => ({...env, CAREER_CONNECTORS_JSON: JSON.stringify(configuration(env)),
  CAREER_NATIVE_JOURNEY_KEY: 'synthetic-fixture-not-an-employer-credential'});

async function provision(env, ctx) {
  if (provisioningAttempted) fail('fixture_provision_already_attempted', 409);
  provisioningAttempted = true;
  const existing = await env.DB.prepare('SELECT COUNT(*) AS n FROM workspaces').first();
  if (existing.n !== 0) fail('fixture_initial_store_not_empty', 409);
  const bindings = bindingFor(env);
  async function call(path, method, body, identity, token) {
    const headers = new Headers({'host': new URL(SERVICE_ORIGIN).host, 'cf-connecting-ip': '192.0.2.58'});
    if (identity) {
      headers.set('oai-authenticated-user-id', OWNER.id); headers.set('oai-authenticated-user-email', OWNER.email);
      headers.set('oai-authenticated-user-full-name', encodeURIComponent(OWNER.name));
      headers.set('oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');
      if (method !== 'GET') headers.set('origin', SERVICE_ORIGIN);
    }
    if (token) headers.set('authorization', `Bearer ${token}`);
    if (body !== undefined) headers.set('content-type', 'application/json');
    const response = await applications(new Request(SERVICE_ORIGIN + path, {method, headers,
      ...(body === undefined ? {} : {body: JSON.stringify(body)})}), bindings, ctx);
    if (!response?.ok) fail('fixture_provision_rejected', 409);
    return response.json();
  }
  // Only this explicit host-only operation models the Sites identity edge.
  // Native requests below never receive browser identity or a substituted token.
  const account = await call('/api/account', 'GET', undefined, true);
  if (account.accountId !== OWNER.id || account.workspaceId !== null) fail('fixture_initial_account_changed', 409);
  const pair = await call('/api/account/pairing', 'POST', {expectedAccountId: account.accountId}, true);
  const session = await call('/api/apply/session', 'POST', {pairingCode: pair.pairingCode}, false);
  if (!/^[a-f0-9]{64}$/.test(session.sessionToken ?? '') || session.workspaceId !== pair.workspaceId) fail('fixture_session_shape_invalid', 503);
  const workspace = await call('/api/apply/workspace', 'GET', undefined, false, session.sessionToken);
  assertBlankWorkspace(workspace);
  return {ok: true, origin: SERVICE_ORIGIN, workspaceId: session.workspaceId, sessionToken: session.sessionToken,
    expiresAt: session.expiresAt, initialWorkspace: workspace};
}
async function evidence(env) {
  const all = async sql => (await env.DB.prepare(sql).all()).results;
  const workspaces = await all('SELECT id,owner_id,revision,profile_json FROM workspaces LIMIT 2');
  if (workspaces.length > 1 || workspaces.some(w => w.owner_id !== OWNER.id)) fail('fixture_owner_scope_changed', 409);
  const rows = await all('SELECT id,plan_id,job_id,state,mode,dispatch_count,approval_generation,dispatched_at,confirmed_at,application_id,snapshot_json FROM attempts ORDER BY created_at,id LIMIT 501');
  const plans = (await all('SELECT id,profile_revision,approval_generation,approved_at,last_approved_at,stopped FROM plans ORDER BY created_at,id LIMIT 101'))
    .map(p => ({id: p.id, profileRevision: p.profile_revision, approvalGeneration: p.approval_generation,
      approvedAt: p.approved_at, lastApprovedAt: p.last_approved_at, stopped: p.stopped}));
  const attempts = rows.map(a => {
    const s = JSON.parse(a.snapshot_json);
    return {id: a.id, planId: a.plan_id, jobId: a.job_id, state: a.state, mode: a.mode,
      dispatchCount: a.dispatch_count, approvalGeneration: a.approval_generation, dispatchedAt: a.dispatched_at,
      confirmedAt: a.confirmed_at, applicationId: a.application_id, profileRevision: s.profileRevision,
      resumeName: s.profile?.resume?.name ?? null, resumeSHA256: s.profile?.resume?.sha256 ?? null,
      snapshotSHA256: sha256(a.snapshot_json)};
  });
  const result = {ok: true, schemaVersion: 1, board, ...counters, plans, attempts,
    workspaces: workspaces.map(w => { const p = JSON.parse(w.profile_json); return {id: w.id, revision: w.revision,
      profileSHA256: sha256(w.profile_json), resumeName: p.resume?.name ?? null, resumeSHA256: p.resume?.sha256 ?? null}; }),
    jobs: await all('SELECT id,workspace_id,job_key FROM jobs ORDER BY id LIMIT 201'), requests, controls, fidelity,
    requiresHostOutboundCheck: true};
  // This checks the Worker-owned ledger only. The harness must supply its actual
  // outboundService counter before the combined proof can be accepted.
  assertZeroDispatch({...result, outboundAttempts: 0});
  if (counters.unexpectedProviderTargets !== 0 || counters.capabilityChanges !== 0) fail('fixture_boundary_violation', 409);
  return result;
}
const nativeJourneyWorker = {
  async fetch(request, env, ctx) {
    try {
      if (!matchesSecret(request.headers.get('x-native-journey-runtime'), env.NATIVE_JOURNEY_RUNTIME_TOKEN)) return json({ok: false, error: {code: 'fixture_runtime_authority_denied'}}, 403);
      const url = new URL(request.url);
      if (url.origin !== SERVICE_ORIGIN) fail('fixture_logical_origin_denied', 403);
      if (url.pathname === '/__native-journey/provision' && request.method === 'POST' && !url.search) return json(await provision(env, ctx));
      if (url.pathname === '/__native-journey/evidence' && request.method === 'GET' && !url.search) return json(await evidence(env));
      if (url.pathname === '/__native-journey/control' && request.method === 'POST' && !url.search) {
        const text = await request.text(); if (text.length > 128) fail('fixture_control_invalid');
        const value = JSON.parse(text);
        if (!value || Object.keys(value).join(',') !== 'board' || !['open', 'closed', 'unavailable'].includes(value.board) || controls.length >= 16) fail('fixture_control_invalid');
        board = value.board;
        await env.DB.prepare('UPDATE discovery_cache SET expires_at=0,retry_at=0,lease_until=0 WHERE id=?').bind(SOURCE_ID).run();
        controls.push({board, observedAt: new Date().toISOString()});
        return json({ok: true, board});
      }
      let route;
      try { route = nativeRoute(url.pathname + url.search, request.method); }
      catch (error) { if (error.code === 'fixture_dispatch_denied') counters.forbiddenDispatchAttempts++; throw error; }
      if (requests.length >= 512) fail('fixture_request_log_limit', 503);
      const original = new Headers(request.headers);
      original.delete('x-native-journey-runtime'); original.delete('cf-connecting-ip');
      const headers = nativeHeaders(original, SERVICE_ORIGIN);
      const adapted = new Request(request, {headers}), bindings = bindingFor(env);
      let response;
      if (route.pathname === '/api/discovery/sources') response = json(catalog);
      else if (route.kind === 'discovery') {
        const selected = url.searchParams.getAll('source');
        let allowed = selected.length > 0;
        try { allowed &&= selected.every(value => parseDiscoverySource(value).id === SOURCE_ID); } catch { allowed = false; }
        if (!allowed) fail('fixture_source_denied', 400);
        response = await discovery(adapted, bindings);
      } else response = await applications(adapted, bindings, ctx);
      if (!(response instanceof Response)) fail('fixture_handler_route_missing', 503);
      requests.push({method: request.method, path: route.pathname, status: response.status,
        nativeTokenPresent: headers.has('authorization'), observedAt: new Date().toISOString()});
      if (response.ok && ['/api/apply/status', '/api/apply/workspace'].includes(route.pathname)) {
        try {
          const workspace = route.pathname.endsWith('/workspace');
          let capabilityResponse = response.clone();
          if (workspace && response.headers.get('X-Career-Read-Version') === '2') {
            // Intentional read-only legacy capability probe using the same
            // actual handler, original native bearer and workspace request.
            // The original v2 response below is returned untouched to the app.
            const probeHeaders = new Headers(adapted.headers);
            probeHeaders.delete('X-Career-Read-Version');
            capabilityResponse = await applications(new Request(adapted, {headers: probeHeaders}), bindings, ctx);
            if (!capabilityResponse?.ok || capabilityResponse.headers.has('X-Career-Read-Version')) fail('fixture_capability_changed', 503);
          }
          assertTestCapabilities(await capabilityResponse.json(), workspace);
        }
        catch (error) { counters.capabilityChanges++; throw error; }
      }
      return response;
    } catch (error) {
      return json({ok: false, error: {code: error instanceof FixtureError ? error.code : 'fixture_internal_failure'}}, error instanceof FixtureError ? error.status : 500);
    }
  },
};
export default nativeJourneyWorker;
