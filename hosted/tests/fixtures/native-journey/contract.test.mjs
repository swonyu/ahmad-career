// Boundary tests use actual cursor signing/verification helpers; no harness, Worker runtime, TLS or database starts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeRoute, nativeHeaders, matchesSecret, decodeBody, assertTestCapabilities,
  assertBlankWorkspace, assertZeroDispatch, MAX_BODY_BYTES} from './contract.mjs';

import {createReadFrame, verifyReadCursor} from '../../../server/read-transport.mjs';

const origin = 'https://example.invalid';
const rejected = (fn, code) => assert.throws(fn, error => error.code === code);
test('only exact native journey methods and paths are admitted', () => {
  for (const [method, path] of [['GET', 'status'], ['GET', 'workspace'], ['GET', 'receipts'], ['PUT', 'profile'], ['POST', 'jobs'], ['POST', 'prepare']]) {
    const route = nativeRoute('/api/apply/' + path, method);
    assert.equal(route.kind, 'application'); assert.equal(route.pathname, '/api/apply/' + path);
  }
  assert.equal(nativeRoute('/api/discovery/search?source=lever%3Aglobal%3Afictional&q=%D9%85%D8%B5%D9%85%D9%85', 'GET').kind, 'discovery');
  assert.equal(nativeRoute('/api/discovery/sources', 'GET').maximumBodyBytes, 0);
  assert.equal(nativeRoute('/api/apply/profile', 'PUT').maximumBodyBytes, MAX_BODY_BYTES);
  for (const target of ['/api/phone/workspace', '/api/account', '/api/account/pairing', '/api/apply/session',
    '/api/apply/session/revoke', '/api/apply/stop', '/__native-journey/control', '/api/apply/jobs?x=1',
    '/api/apply/%70repare', '/api/../api/apply/prepare', '//example.invalid/api/apply/prepare',
    'https://example.invalid/api/apply/prepare', '/api/apply/prepare#fragment', '/api/apply/prepare\\suffix',
    '/api/discovery/search?q=%Q0', '/api/apply/prepare\n']) rejected(() => nativeRoute(target, 'POST'), 'fixture_route_denied');
  rejected(() => nativeRoute('/api/apply/profile', 'POST'), 'fixture_route_denied');
  rejected(() => nativeRoute('/api/apply/prepare', 'GET'), 'fixture_route_denied');
});
test('submit and advance are denied for both native and browser paths before handler admission', () => {
  let admitted = 0;
  for (const prefix of ['apply', 'phone']) for (const action of ['submit', 'advance']) for (const method of ['GET', 'POST', 'PUT']) {
    rejected(() => { nativeRoute(`/api/${prefix}/${action}`, method); admitted++; }, 'fixture_dispatch_denied');
  }
  assert.equal(admitted, 0);
});
test('transport authority is exact, separate and never inferred from a native bearer', () => {
  const token = 'ab'.repeat(32);
  assert.equal(matchesSecret(token, token), true);
  for (const value of [null, '', token.slice(1), token + '0', token.toUpperCase(), 'Bearer ' + token, 'cd'.repeat(32)]) {
    assert.equal(matchesSecret(value, token), false);
  }
});
test('real native Authorization and origin rejection inputs survive forwarding unchanged', () => {
  const authorization = 'Bearer ' + 'ac'.repeat(32);
  const result = nativeHeaders({'authorization': authorization, 'content-type': 'application/json',
    'origin': 'https://foreign.invalid', 'sec-fetch-site': 'cross-site', 'host': '127.0.0.1:12345'}, origin);
  assert.equal(result.get('authorization'), authorization);
  assert.equal(result.get('origin'), 'https://foreign.invalid');
  assert.equal(result.get('sec-fetch-site'), 'cross-site');
  assert.equal(result.get('host'), 'example.invalid');
  assert.equal(result.has('oai-authenticated-user-id'), false);
  assert.equal(nativeHeaders({}, origin).has('authorization'), false);
  assert.equal(nativeHeaders({'authorization': 'Bearer invalid'}, origin).get('authorization'), 'Bearer invalid');
});
test('caller browser identity, cookies, forwarding and private-control headers are refused', () => {
  for (const name of ['oai-authenticated-user-id', 'oai-authenticated-user-email', 'x-career-user', 'cookie',
    'x-journey-actor', 'x-native-journey-runtime', 'x-forwarded-host', 'forwarded', 'cf-connecting-ip']) {
    rejected(() => nativeHeaders({[name]: 'synthetic'}, origin), 'fixture_identity_header_denied');
  }
});
test('bounded bytes preserve Arabic split across network chunks and reject malformed UTF-8', () => {
  const body = Buffer.from(JSON.stringify({city: 'الرياض', title: 'مصمم الخدمة 🧪'}));
  const chunks = [...body].map(byte => Buffer.from([byte]));
  assert.equal(decodeBody(chunks, body.length), body.toString('utf8'));
  rejected(() => decodeBody(chunks, body.length - 1), 'fixture_body_too_large');
  rejected(() => decodeBody([Buffer.from([0xc3, 0x28])], 2), 'fixture_body_invalid_utf8');
  rejected(() => decodeBody([Buffer.from('x')], 0), 'fixture_body_too_large');
  rejected(() => decodeBody([], MAX_BODY_BYTES + 1), 'fixture_body_limit_invalid');
});
const blank = () => ({ok: true, mode: 'test', capabilities: {mode: 'test', liveEnabled: false},
  profile: {revision: 0, resume: null, firstName: '', lastName: '', email: '', phone: '', city: '', country: '',
    headline: '', website: '', linkedin: '', skills: [], targetRoles: [], targetCountries: [], workModes: [], experienceLevel: 'any'},
  jobs: [], attempts: [], recoverablePlans: [], activePlanIds: []});
test('actual test capabilities are required without enabling live submission', () => {
  assertTestCapabilities({ok: true, mode: 'test', liveEnabled: false});
  assertBlankWorkspace(blank());
  for (const value of [{ok: true, mode: 'test', liveEnabled: true}, {ok: true, mode: 'local', liveEnabled: false}, {ok: true, mode: 'test'}]) {
    rejected(() => assertTestCapabilities(value), 'fixture_capability_changed');
  }
});
test('initial fixture cannot pre-seed a contact, PDF, saved job, prepared review or revision', () => {
  for (const change of [v => { v.profile.firstName = 'Seeded'; }, v => { v.profile.email = 'seed@example.invalid'; },
    v => { v.profile.resume = {name: 'CV-A.pdf'}; }, v => { v.profile.revision = 1; },
    v => { v.jobs.push({}); }, v => { v.attempts.push({}); }, v => { v.recoverablePlans.push({}); }]) {
    const value = blank(); change(value);
    rejected(() => assertBlankWorkspace(value), 'fixture_initial_workspace_not_blank');
  }
});
const proof = () => ({providerPostAttempts: 0, forbiddenDispatchAttempts: 0, outboundAttempts: 0,
  plans: [{approvalGeneration: 0, approvedAt: null, lastApprovedAt: null, stopped: 0}],
  attempts: [{state: 'ready', mode: 'test', dispatchCount: 0, approvalGeneration: 0,
    dispatchedAt: null, confirmedAt: null, applicationId: null}]});
test('zero-dispatch proof rejects missing counters, any approval, receipt or provider attempt', () => {
  assert.equal(assertZeroDispatch(proof()), true);
  assert.equal(assertZeroDispatch({...proof(), plans: [], attempts: []}), true);
  for (const key of ['providerPostAttempts', 'forbiddenDispatchAttempts', 'outboundAttempts']) {
    const missing = proof(); delete missing[key]; rejected(() => assertZeroDispatch(missing), 'fixture_zero_dispatch_unproved');
    rejected(() => assertZeroDispatch({...proof(), [key]: 1}), 'fixture_zero_dispatch_unproved');
  }
  for (const [key, value] of [['state', 'confirmed'], ['mode', 'local'], ['dispatchCount', 1], ['approvalGeneration', 1],
    ['dispatchedAt', '2026-11-21T00:00:00Z'], ['confirmedAt', '2026-11-21T00:00:00Z'], ['applicationId', 'invented']]) {
    const changed = proof(); changed.attempts[0][key] = value;
    rejected(() => assertZeroDispatch(changed), 'fixture_zero_dispatch_unproved');
  }
  for (const [key, value] of [['approvalGeneration', 1], ['approvedAt', '2026-11-21T00:00:00Z'], ['lastApprovedAt', '2026-11-21T00:00:00Z'], ['stopped', 1]]) {
    const changed = proof(); changed.plans[0][key] = value;
    rejected(() => assertZeroDispatch(changed), 'fixture_zero_dispatch_unproved');
  }
  rejected(() => assertZeroDispatch({...proof(), attempts: [{}]}), 'fixture_zero_dispatch_unproved');
});

// V2 transport adds no identity or submission authority to this fixture.
test('only the exact v2 read header survives, with the original native bearer', () => {
  const authorization = 'Bearer ' + 'ab'.repeat(32);
  const result = nativeHeaders({'X-Career-Read-Version': '2', authorization}, origin);
  assert.equal(result.get('x-career-read-version'), '2');
  assert.equal(result.get('authorization'), authorization);
  for (const value of ['', '1', '3', '2, 2', '02', '2.0']) rejected(() => nativeHeaders({'x-career-read-version': value}, origin), 'fixture_read_version_denied');
  for (const name of ['x-career-account', 'x-career-user', 'x-career-read-cursor', 'x-career-read-version-extra']) {
    rejected(() => nativeHeaders({[name]: '2', 'x-career-read-version': '2'}, origin), 'fixture_identity_header_denied');
  }
  rejected(() => nativeHeaders(new Headers([['x-career-read-version', '2'], ['x-career-read-version', '2']]), origin), 'fixture_read_version_denied');
});
const recoveryScope = () => ({audience: 'apply', accountId: 'synthetic-native-owner', workspaceId: '00000000-0000-4000-8000-000000000001', sessionBinding: 'ab'.repeat(32)});
const recoveryFixture = () => {
  const scope = recoveryScope(), salt = 'cd'.repeat(32), asOf = '2026-11-23T16:00:00.000Z';
  const frame = createReadFrame({data: {ok: true, mode: 'test', capabilities: {mode: 'test', liveEnabled: false}},
    spec: {kind: 'workspace', resourceId: null, variant: ''}, scope, salt, asOf});
  return {scope, salt, asOf, cursor: frame.read.exportCursor};
};
test('recovery routes are GET-only and require one bounded cursor query', () => {
  const {cursor} = recoveryFixture();
  for (const route of ['read', 'read-export']) {
    const base = '/api/apply/' + route, target = base + '?cursor=' + encodeURIComponent(cursor);
    assert.equal(nativeRoute(target, 'GET').maximumBodyBytes, 0);
    assert.equal(nativeRoute(target, 'GET').kind, 'application');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) rejected(() => nativeRoute(target, method), 'fixture_route_denied');
    for (const query of ['', '?cursor=', '?cursor=x', '?cursor=' + cursor + '&cursor=' + cursor,
      '?cursor=' + cursor + '&accountId=foreign', '?x=' + cursor, '?cursor=' + 'a'.repeat(2048) + '.' + '0'.repeat(64),
      '?cursor=' + cursor + '#fragment']) rejected(() => nativeRoute(base + query, 'GET'), 'fixture_route_denied');
    rejected(() => nativeRoute('/api/phone/' + route + '?cursor=' + cursor, 'GET'), 'fixture_route_denied');
  }
});
test('admitted cursor bytes still require real signature and original account/workspace/session scope', () => {
  const {cursor, scope, salt, asOf} = recoveryFixture(), now = Date.parse(asOf);
  assert.equal(nativeRoute('/api/apply/read?cursor=' + cursor, 'GET').pathname, '/api/apply/read');
  assert.equal(verifyReadCursor(cursor, {scope, salt, now}).workspaceId, scope.workspaceId);
  for (const change of [{audience: 'phone'}, {accountId: 'another-synthetic-owner'},
    {workspaceId: '00000000-0000-4000-8000-000000000002'}, {sessionBinding: 'ef'.repeat(32)}]) {
    assert.throws(() => verifyReadCursor(cursor, {scope: {...scope, ...change}, salt, now}), error => error.code === 'workspace_changed');
  }
  const tampered = cursor.slice(0, -1) + (cursor.endsWith('0') ? '1' : '0');
  assert.equal(nativeRoute('/api/apply/read-export?cursor=' + tampered, 'GET').pathname, '/api/apply/read-export');
  assert.throws(() => verifyReadCursor(tampered, {scope, salt, now}), error => error.code === 'invalid_read_cursor');
});

// Current persistence contract. These are logical copies of the synthetic EN02
// retained observations: blank/profile passed, jobSaved remained FAILED. The
// empty journal below is explicit unit-test input; it was not retained by EN02
// and cannot retroactively establish a successful client read in that run.
import {createCheckpointState, CheckpointError, operationJournalFilename,
  needsReconciledJournal, CHECKPOINTS, CONTROL_LIMITS} from './control-state.mjs';
const retainedObservationPins = {
  "001-request.json": "90c984934c2cdd4a2262964be5db813af7ff5dda49b5cbc731f3730820467cf8",
  "001-combined-evidence.original.json": "a09d50baaa29dad1b689064ab65ad2497abc73107a3734c419433f6b57fcdab7",
  "001-phone-draft.original.json": "65619a71153179001d752155e3204508a6ea6f21936553b6e2e8e10bc8103112",
  "001-seed-receipt.original.json": "b3b2d9561e41261169c129cfeac221f868e38d5d895557e08f858b3e06d789e6",
  "002-request.json": "9815b0896fcc8f00a4b32ec42df43fcf0878b2a0e9e6dc1cbf7d7f6101300d36",
  "002-combined-evidence.original.json": "b6f8da9ee7a08732ac4e9fba9908b5727c4ef4df0cb43813b01be5a0c6225838",
  "002-phone-draft.original.json": "194e55f13cd248844c47de47e750a5685d58dc6735eb2596a1dd1364522b7469",
  "002-seed-receipt.original.json": "b3b2d9561e41261169c129cfeac221f868e38d5d895557e08f858b3e06d789e6",
  "003-failure-request.original.json": "86590c81c9d90aafa2e2b986ddc8c2a00a70f4d94b5df006d0eaeb0555f8bb10",
  "003-failure-evidence-before.original.json": "e7f7b3c613e7c0c92e7c39c3296fea5624162f8e872071e291ebf2743e649df1",
  "003-failure-phone-draft.original.json": "14d2d4daeaaadfdb8b85a6342285bd745a3bead48eb62e8bf2d29efd17f202f0",
  "003-failure-seed-receipt.original.json": "b3b2d9561e41261169c129cfeac221f868e38d5d895557e08f858b3e06d789e6"
};
const persistenceBinding = {
  "testID": "D021D8A9-0570-449B-A0EF-5A2D51E07699",
  "workspaceID": "33570437-882d-4276-ac92-0a45cd2e876f",
  "logicalOrigin": "https://career-finder-service.jazzy-drake-8323.chatgpt.site",
  "workerSHA256": "64f875a9bded9cadaf56ad67c729cedea4f183e40f5733262d1b69f920f6e812",
  "bootstrapSHA256": "bb95f079738356680e1e6bcbb7b4faaaf9c20edc78fbb0cd5aa939582164748b",
  "followUpDay": "2026-11-25",
  "bridgePort": 58369,
  "caFingerprint256": "1F:46:DC:93:11:36:A2:1D:50:76:75:14:13:EE:86:06:DA:FC:B5:F5:8F:FE:67:D5:80:83:65:F8:60:7C:90:C3"
};
const retainedObservations = [
  {
    "request": {
      "checkpoint": "blank",
      "schemaVersion": 1,
      "sequence": 1,
      "testID": "D021D8A9-0570-449B-A0EF-5A2D51E07699"
    },
    "proof": {
      "ok": true,
      "schemaVersion": 1,
      "board": "open",
      "providerGets": 0,
      "providerPostAttempts": 0,
      "forbiddenDispatchAttempts": 0,
      "unexpectedProviderTargets": 0,
      "capabilityChanges": 0,
      "plans": [],
      "attempts": [],
      "workspaces": [
        {
          "id": "33570437-882d-4276-ac92-0a45cd2e876f",
          "revision": 0,
          "profileSHA256": "38dc27460ffda21d4cbef9f9826a2cdb17ad2b2c756c1b19eead5dc9dcfbf67f",
          "resumeName": null,
          "resumeSHA256": null
        }
      ],
      "jobs": [],
      "requests": [
        {
          "method": "GET",
          "path": "/api/apply/workspace",
          "status": 200,
          "nativeTokenPresent": true,
          "observedAt": "2026-11-23T19:22:38.337Z"
        }
      ],
      "controls": [],
      "fidelity": {
        "real": [
          "current hosted application handler",
          "native bearer authentication and ownership",
          "isolated D1 and R2",
          "profile validation and revisions",
          "PDF parsing and storage",
          "job import and canonical identity",
          "preparation and immutable attempt snapshots",
          "current discovery parser, cache and filters"
        ],
        "simulated": [
          "one fictional trusted identity during explicit initial pairing only",
          "allowlisted fictional catalog and provider GET responses",
          "test adapter mode",
          "explicit open/closed/unavailable board response and cache-expiry controls",
          "loopback HTTPS transport"
        ],
        "excluded": [
          "live identity verification",
          "production persistence",
          "approval, dispatch or real employer requests",
          "capability rewriting",
          "seeded contact, PDF, saved job, prepared attempt or follow-up outcomes"
        ]
      },
      "requiresHostOutboundCheck": true,
      "outboundAttempts": 0,
      "workerSHA256": "64f875a9bded9cadaf56ad67c729cedea4f183e40f5733262d1b69f920f6e812",
      "nativeCalls": [
        {
          "method": "GET",
          "path": "/api/apply/workspace",
          "requestBodySHA256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "requestBytes": 0,
          "nativeTokenPresent": true,
          "status": 200,
          "startedAt": "2026-11-23T19:22:38.329Z",
          "finishedAt": "2026-11-23T19:22:38.341Z"
        }
      ],
      "hostOutboundCheckObserved": true,
      "bridge": {
        "host": "127.0.0.1",
        "port": 58369,
        "apiRequests": 1,
        "documentRequests": {
          "CV-A.pdf": 0,
          "CV-B.pdf": 0
        },
        "deniedRequests": 0,
        "proxyRequests": 0,
        "socketErrors": 0,
        "tlsErrors": 0,
        "events": [],
        "inFlight": 0,
        "pdf": {
          "sha256": "fccbd3962e482d8b24bea10c69ec047e0879cc55cf3c3b3222909bd89108b86a",
          "bytes": 609,
          "names": [
            "CV-A.pdf",
            "CV-B.pdf"
          ]
        },
        "caFingerprint256": "1F:46:DC:93:11:36:A2:1D:50:76:75:14:13:EE:86:06:DA:FC:B5:F5:8F:FE:67:D5:80:83:65:F8:60:7C:90:C3"
      }
    },
    "phone": {
      "recordDrafts": [],
      "workspaceDrafts": [
        {
          "profile": {
            "targetCountries": "",
            "country": "",
            "resumeName": "",
            "city": "",
            "targetRoles": "",
            "linkedin": "",
            "email": "",
            "experienceLevel": "any",
            "hybrid": true,
            "resumeRemoved": false,
            "website": "",
            "skills": "",
            "onsite": true,
            "resumeChanged": false,
            "firstName": "",
            "remote": true,
            "headline": "",
            "phone": "",
            "lastName": ""
          },
          "jobs": [],
          "profileNeedsSync": false,
          "opportunityDraft": {
            "title": "",
            "url": "",
            "country": "",
            "location": "",
            "company": ""
          },
          "scope": {
            "workspaceID": "",
            "origin": ""
          }
        }
      ],
      "submissionHolds": [],
      "savedApplicationHistory": {
        "entries": [],
        "schemaVersion": 1,
        "credentialAccount": "native-journey.D021D8A9-0570-449B-A0EF-5A2D51E07699",
        "savedAt": "2026-11-23T19:22:38Z",
        "scope": {
          "origin": "https://career-finder-service.jazzy-drake-8323.chatgpt.site",
          "workspaceID": "33570437-882d-4276-ac92-0a45cd2e876f"
        }
      },
      "profileNeedsSync": false,
      "workspaceID": "33570437-882d-4276-ac92-0a45cd2e876f",
      "credentialAccount": "native-journey.D021D8A9-0570-449B-A0EF-5A2D51E07699",
      "latestServerProfile": {
        "firstName": "",
        "lastName": "",
        "phone": "",
        "city": "",
        "website": "",
        "experienceLevel": "any",
        "targetCountries": "",
        "targetRoles": "",
        "resumeChanged": false,
        "headline": "",
        "skills": "",
        "remote": false,
        "resumeName": "",
        "country": "",
        "linkedin": "",
        "hybrid": false,
        "email": "",
        "resumeRemoved": false,
        "onsite": false
      },
      "serviceAddress": "https://career-finder-service.jazzy-drake-8323.chatgpt.site",
      "applicationRecords": [],
      "recordDraftAlternatives": [],
      "historicalRecovery": [],
      "profileRevision": 0,
      "applicationRecordSchema": 1,
      "profile": {
        "firstName": "",
        "phone": "",
        "lastName": "",
        "city": "",
        "website": "",
        "experienceLevel": "any",
        "targetRoles": "",
        "targetCountries": "",
        "resumeChanged": false,
        "headline": "",
        "skills": "",
        "remote": false,
        "resumeName": "",
        "linkedin": "",
        "country": "",
        "hybrid": false,
        "email": "",
        "resumeRemoved": false,
        "onsite": false
      },
      "latestServerRevision": 0,
      "jobs": [],
      "opportunityDraft": {
        "title": "",
        "url": "",
        "country": "",
        "location": "",
        "company": ""
      },
      "workspaceDraftSchema": 1,
      "recoveredOpportunityDrafts": [],
      "connectionEnabled": true
    },
    "seedReceipt": {
      "schemaVersion": 1,
      "initialStateSHA256": "f778e67e124db75a89890853adbe51a943de1357277785e5f94a810746f7e47b",
      "testID": "D021D8A9-0570-449B-A0EF-5A2D51E07699",
      "bootstrapSHA256": "bb95f079738356680e1e6bcbb7b4faaaf9c20edc78fbb0cd5aa939582164748b",
      "onlyBlankConnection": true
    },
    "seedReceiptSHA256": "b3b2d9561e41261169c129cfeac221f868e38d5d895557e08f858b3e06d789e6",
    "discovery": null
  },
  {
    "request": {
      "checkpoint": "contactSaved",
      "schemaVersion": 1,
      "sequence": 2,
      "testID": "D021D8A9-0570-449B-A0EF-5A2D51E07699"
    },
    "proof": {
      "ok": true,
      "schemaVersion": 1,
      "board": "open",
      "providerGets": 0,
      "providerPostAttempts": 0,
      "forbiddenDispatchAttempts": 0,
      "unexpectedProviderTargets": 0,
      "capabilityChanges": 0,
      "plans": [],
      "attempts": [],
      "workspaces": [
        {
          "id": "33570437-882d-4276-ac92-0a45cd2e876f",
          "revision": 1,
          "profileSHA256": "0305db96d1791105f848a70dc33b5e477975d8d17bde985fbeb196b2aa07714b",
          "resumeName": null,
          "resumeSHA256": null
        }
      ],
      "jobs": [],
      "requests": [
        {
          "method": "GET",
          "path": "/api/apply/workspace",
          "status": 200,
          "nativeTokenPresent": true,
          "observedAt": "2026-11-23T19:22:38.337Z"
        },
        {
          "method": "PUT",
          "path": "/api/apply/profile",
          "status": 200,
          "nativeTokenPresent": true,
          "observedAt": "2026-11-23T19:22:54.598Z"
        },
        {
          "method": "GET",
          "path": "/api/apply/workspace",
          "status": 200,
          "nativeTokenPresent": true,
          "observedAt": "2026-11-23T19:22:54.664Z"
        }
      ],
      "controls": [],
      "fidelity": {
        "real": [
          "current hosted application handler",
          "native bearer authentication and ownership",
          "isolated D1 and R2",
          "profile validation and revisions",
          "PDF parsing and storage",
          "job import and canonical identity",
          "preparation and immutable attempt snapshots",
          "current discovery parser, cache and filters"
        ],
        "simulated": [
          "one fictional trusted identity during explicit initial pairing only",
          "allowlisted fictional catalog and provider GET responses",
          "test adapter mode",
          "explicit open/closed/unavailable board response and cache-expiry controls",
          "loopback HTTPS transport"
        ],
        "excluded": [
          "live identity verification",
          "production persistence",
          "approval, dispatch or real employer requests",
          "capability rewriting",
          "seeded contact, PDF, saved job, prepared attempt or follow-up outcomes"
        ]
      },
      "requiresHostOutboundCheck": true,
      "outboundAttempts": 0,
      "workerSHA256": "64f875a9bded9cadaf56ad67c729cedea4f183e40f5733262d1b69f920f6e812",
      "nativeCalls": [
        {
          "method": "GET",
          "path": "/api/apply/workspace",
          "requestBodySHA256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "requestBytes": 0,
          "nativeTokenPresent": true,
          "status": 200,
          "startedAt": "2026-11-23T19:22:38.329Z",
          "finishedAt": "2026-11-23T19:22:38.341Z"
        },
        {
          "method": "PUT",
          "path": "/api/apply/profile",
          "requestBodySHA256": "a38cfe6398c4057b25d5ab03dc22c44dec388b0423eb8b0d171acc698937f044",
          "requestBytes": 267,
          "nativeTokenPresent": true,
          "status": 200,
          "startedAt": "2026-11-23T19:22:54.585Z",
          "finishedAt": "2026-11-23T19:22:54.599Z"
        },
        {
          "method": "GET",
          "path": "/api/apply/workspace",
          "requestBodySHA256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "requestBytes": 0,
          "nativeTokenPresent": true,
          "status": 200,
          "startedAt": "2026-11-23T19:22:54.659Z",
          "finishedAt": "2026-11-23T19:22:54.669Z"
        }
      ],
      "hostOutboundCheckObserved": true,
      "bridge": {
        "host": "127.0.0.1",
        "port": 58369,
        "apiRequests": 3,
        "documentRequests": {
          "CV-A.pdf": 0,
          "CV-B.pdf": 0
        },
        "deniedRequests": 0,
        "proxyRequests": 0,
        "socketErrors": 0,
        "tlsErrors": 0,
        "events": [],
        "inFlight": 0,
        "pdf": {
          "sha256": "fccbd3962e482d8b24bea10c69ec047e0879cc55cf3c3b3222909bd89108b86a",
          "bytes": 609,
          "names": [
            "CV-A.pdf",
            "CV-B.pdf"
          ]
        },
        "caFingerprint256": "1F:46:DC:93:11:36:A2:1D:50:76:75:14:13:EE:86:06:DA:FC:B5:F5:8F:FE:67:D5:80:83:65:F8:60:7C:90:C3"
      }
    },
    "phone": {
      "savedApplicationHistory": {
        "savedAt": "2026-11-23T19:22:38Z",
        "schemaVersion": 1,
        "credentialAccount": "native-journey.D021D8A9-0570-449B-A0EF-5A2D51E07699",
        "scope": {
          "workspaceID": "33570437-882d-4276-ac92-0a45cd2e876f",
          "origin": "https://career-finder-service.jazzy-drake-8323.chatgpt.site"
        },
        "entries": []
      },
      "serviceAddress": "https://career-finder-service.jazzy-drake-8323.chatgpt.site",
      "historicalRecovery": [],
      "connectionEnabled": true,
      "profile": {
        "email": "jamie.native@example.com",
        "onsite": false,
        "remote": false,
        "hybrid": false,
        "city": "",
        "country": "",
        "headline": "",
        "targetRoles": "",
        "skills": "",
        "firstName": "Jamie",
        "targetCountries": "",
        "resumeName": "",
        "resumeChanged": false,
        "linkedin": "",
        "resumeRemoved": false,
        "phone": "",
        "website": "",
        "experienceLevel": "any",
        "lastName": ""
      },
      "profileRevision": 1,
      "recoveredOpportunityDrafts": [],
      "latestServerRevision": 1,
      "opportunityDraft": {
        "company": "",
        "location": "",
        "country": "",
        "url": "",
        "title": ""
      },
      "workspaceDraftSchema": 1,
      "latestServerProfile": {
        "resumeRemoved": false,
        "targetCountries": "",
        "email": "jamie.native@example.com",
        "experienceLevel": "any",
        "hybrid": false,
        "resumeName": "",
        "resumeChanged": false,
        "phone": "",
        "website": "",
        "onsite": false,
        "linkedin": "",
        "headline": "",
        "city": "",
        "lastName": "",
        "remote": false,
        "firstName": "Jamie",
        "targetRoles": "",
        "country": "",
        "skills": ""
      },
      "workspaceID": "33570437-882d-4276-ac92-0a45cd2e876f",
      "profileNeedsSync": false,
      "credentialAccount": "native-journey.D021D8A9-0570-449B-A0EF-5A2D51E07699",
      "jobs": [],
      "applicationRecords": [],
      "recordDrafts": [],
      "applicationRecordSchema": 1,
      "recordDraftAlternatives": [],
      "submissionHolds": [],
      "workspaceDrafts": [
        {
          "scope": {
            "workspaceID": "",
            "origin": ""
          },
          "opportunityDraft": {
            "company": "",
            "location": "",
            "country": "",
            "url": "",
            "title": ""
          },
          "profileNeedsSync": false,
          "profile": {
            "email": "",
            "onsite": true,
            "remote": true,
            "hybrid": true,
            "city": "",
            "country": "",
            "targetRoles": "",
            "skills": "",
            "headline": "",
            "targetCountries": "",
            "firstName": "",
            "resumeName": "",
            "resumeChanged": false,
            "linkedin": "",
            "resumeRemoved": false,
            "phone": "",
            "website": "",
            "experienceLevel": "any",
            "lastName": ""
          },
          "jobs": []
        }
      ]
    },
    "seedReceipt": {
      "schemaVersion": 1,
      "initialStateSHA256": "f778e67e124db75a89890853adbe51a943de1357277785e5f94a810746f7e47b",
      "testID": "D021D8A9-0570-449B-A0EF-5A2D51E07699",
      "bootstrapSHA256": "bb95f079738356680e1e6bcbb7b4faaaf9c20edc78fbb0cd5aa939582164748b",
      "onlyBlankConnection": true
    },
    "seedReceiptSHA256": "b3b2d9561e41261169c129cfeac221f868e38d5d895557e08f858b3e06d789e6",
    "discovery": null
  },
  {
    "request": {
      "checkpoint": "jobSaved",
      "schemaVersion": 1,
      "sequence": 3,
      "testID": "D021D8A9-0570-449B-A0EF-5A2D51E07699"
    },
    "proof": {
      "ok": true,
      "schemaVersion": 1,
      "board": "open",
      "providerGets": 2,
      "providerPostAttempts": 0,
      "forbiddenDispatchAttempts": 0,
      "unexpectedProviderTargets": 0,
      "capabilityChanges": 0,
      "plans": [],
      "attempts": [],
      "workspaces": [
        {
          "id": "33570437-882d-4276-ac92-0a45cd2e876f",
          "revision": 1,
          "profileSHA256": "0305db96d1791105f848a70dc33b5e477975d8d17bde985fbeb196b2aa07714b",
          "resumeName": null,
          "resumeSHA256": null
        }
      ],
      "jobs": [
        {
          "id": "0527207f-29f2-42da-a277-d8b866ba5983",
          "workspace_id": "33570437-882d-4276-ac92-0a45cd2e876f",
          "job_key": "lever:global:synthetic-native-journey:20000000-0000-4000-8000-000000000001"
        }
      ],
      "requests": [
        {
          "method": "GET",
          "path": "/api/apply/workspace",
          "status": 200,
          "nativeTokenPresent": true,
          "observedAt": "2026-11-23T19:22:38.337Z"
        },
        {
          "method": "PUT",
          "path": "/api/apply/profile",
          "status": 200,
          "nativeTokenPresent": true,
          "observedAt": "2026-11-23T19:22:54.598Z"
        },
        {
          "method": "GET",
          "path": "/api/apply/workspace",
          "status": 200,
          "nativeTokenPresent": true,
          "observedAt": "2026-11-23T19:22:54.664Z"
        },
        {
          "method": "GET",
          "path": "/api/discovery/sources",
          "status": 200,
          "nativeTokenPresent": false,
          "observedAt": "2026-11-23T19:22:56.140Z"
        },
        {
          "method": "GET",
          "path": "/api/discovery/search",
          "status": 200,
          "nativeTokenPresent": false,
          "observedAt": "2026-11-23T19:23:12.582Z"
        },
        {
          "method": "POST",
          "path": "/api/apply/jobs",
          "status": 201,
          "nativeTokenPresent": true,
          "observedAt": "2026-11-23T19:23:23.367Z"
        },
        {
          "method": "GET",
          "path": "/api/apply/workspace",
          "status": 200,
          "nativeTokenPresent": true,
          "observedAt": "2026-11-23T19:23:23.379Z"
        }
      ],
      "controls": [],
      "fidelity": {
        "real": [
          "current hosted application handler",
          "native bearer authentication and ownership",
          "isolated D1 and R2",
          "profile validation and revisions",
          "PDF parsing and storage",
          "job import and canonical identity",
          "preparation and immutable attempt snapshots",
          "current discovery parser, cache and filters"
        ],
        "simulated": [
          "one fictional trusted identity during explicit initial pairing only",
          "allowlisted fictional catalog and provider GET responses",
          "test adapter mode",
          "explicit open/closed/unavailable board response and cache-expiry controls",
          "loopback HTTPS transport"
        ],
        "excluded": [
          "live identity verification",
          "production persistence",
          "approval, dispatch or real employer requests",
          "capability rewriting",
          "seeded contact, PDF, saved job, prepared attempt or follow-up outcomes"
        ]
      },
      "requiresHostOutboundCheck": true,
      "outboundAttempts": 0,
      "workerSHA256": "64f875a9bded9cadaf56ad67c729cedea4f183e40f5733262d1b69f920f6e812",
      "nativeCalls": [
        {
          "method": "GET",
          "path": "/api/apply/workspace",
          "requestBodySHA256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "requestBytes": 0,
          "nativeTokenPresent": true,
          "status": 200,
          "startedAt": "2026-11-23T19:22:38.329Z",
          "finishedAt": "2026-11-23T19:22:38.341Z"
        },
        {
          "method": "PUT",
          "path": "/api/apply/profile",
          "requestBodySHA256": "a38cfe6398c4057b25d5ab03dc22c44dec388b0423eb8b0d171acc698937f044",
          "requestBytes": 267,
          "nativeTokenPresent": true,
          "status": 200,
          "startedAt": "2026-11-23T19:22:54.585Z",
          "finishedAt": "2026-11-23T19:22:54.599Z"
        },
        {
          "method": "GET",
          "path": "/api/apply/workspace",
          "requestBodySHA256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "requestBytes": 0,
          "nativeTokenPresent": true,
          "status": 200,
          "startedAt": "2026-11-23T19:22:54.659Z",
          "finishedAt": "2026-11-23T19:22:54.669Z"
        },
        {
          "method": "GET",
          "path": "/api/discovery/sources",
          "requestBodySHA256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "requestBytes": 0,
          "nativeTokenPresent": false,
          "status": 200,
          "startedAt": "2026-11-23T19:22:56.139Z",
          "finishedAt": "2026-11-23T19:22:56.140Z"
        },
        {
          "method": "GET",
          "path": "/api/discovery/search",
          "requestBodySHA256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "requestBytes": 0,
          "nativeTokenPresent": false,
          "status": 200,
          "startedAt": "2026-11-23T19:23:12.566Z",
          "finishedAt": "2026-11-23T19:23:12.583Z"
        },
        {
          "method": "POST",
          "path": "/api/apply/jobs",
          "requestBodySHA256": "cf703628cae9392d590fc3836929034732ecec71a77a58f1d6fc2d8bef905deb",
          "requestBytes": 196,
          "nativeTokenPresent": true,
          "status": 201,
          "startedAt": "2026-11-23T19:23:23.356Z",
          "finishedAt": "2026-11-23T19:23:23.368Z"
        },
        {
          "method": "GET",
          "path": "/api/apply/workspace",
          "requestBodySHA256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "requestBytes": 0,
          "nativeTokenPresent": true,
          "status": 200,
          "startedAt": "2026-11-23T19:23:23.374Z",
          "finishedAt": "2026-11-23T19:23:23.383Z"
        }
      ],
      "hostOutboundCheckObserved": true,
      "bridge": {
        "host": "127.0.0.1",
        "port": 58369,
        "apiRequests": 7,
        "documentRequests": {
          "CV-A.pdf": 0,
          "CV-B.pdf": 0
        },
        "deniedRequests": 0,
        "proxyRequests": 0,
        "socketErrors": 0,
        "tlsErrors": 0,
        "events": [],
        "inFlight": 0,
        "pdf": {
          "sha256": "fccbd3962e482d8b24bea10c69ec047e0879cc55cf3c3b3222909bd89108b86a",
          "bytes": 609,
          "names": [
            "CV-A.pdf",
            "CV-B.pdf"
          ]
        },
        "caFingerprint256": "1F:46:DC:93:11:36:A2:1D:50:76:75:14:13:EE:86:06:DA:FC:B5:F5:8F:FE:67:D5:80:83:65:F8:60:7C:90:C3"
      }
    },
    "phone": {
      "workspaceDraftSchema": 1,
      "recoveredOpportunityDrafts": [],
      "workspaceDrafts": [
        {
          "jobs": [],
          "opportunityDraft": {
            "location": "",
            "url": "",
            "company": "",
            "title": "",
            "country": ""
          },
          "scope": {
            "workspaceID": "",
            "origin": ""
          },
          "profile": {
            "remote": true,
            "skills": "",
            "experienceLevel": "any",
            "targetCountries": "",
            "phone": "",
            "firstName": "",
            "resumeChanged": false,
            "resumeRemoved": false,
            "email": "",
            "country": "",
            "hybrid": true,
            "city": "",
            "targetRoles": "",
            "resumeName": "",
            "headline": "",
            "linkedin": "",
            "onsite": true,
            "website": "",
            "lastName": ""
          },
          "profileNeedsSync": false
        }
      ],
      "submissionHolds": [],
      "historicalRecovery": [],
      "latestServerRevision": 1,
      "profile": {
        "country": "",
        "headline": "",
        "email": "jamie.native@example.com",
        "linkedin": "",
        "targetRoles": "",
        "phone": "",
        "lastName": "",
        "hybrid": false,
        "onsite": false,
        "skills": "",
        "website": "",
        "experienceLevel": "any",
        "resumeName": "",
        "targetCountries": "",
        "resumeChanged": false,
        "resumeRemoved": false,
        "remote": false,
        "city": "",
        "firstName": "Jamie"
      },
      "credentialAccount": "native-journey.D021D8A9-0570-449B-A0EF-5A2D51E07699",
      "latestServerProfile": {
        "country": "",
        "email": "jamie.native@example.com",
        "headline": "",
        "linkedin": "",
        "targetRoles": "",
        "phone": "",
        "lastName": "",
        "hybrid": false,
        "onsite": false,
        "skills": "",
        "website": "",
        "experienceLevel": "any",
        "resumeName": "",
        "targetCountries": "",
        "resumeChanged": false,
        "resumeRemoved": false,
        "remote": false,
        "city": "",
        "firstName": "Jamie"
      },
      "workspaceID": "33570437-882d-4276-ac92-0a45cd2e876f",
      "opportunityDraft": {
        "location": "",
        "url": "",
        "company": "",
        "title": "",
        "country": ""
      },
      "recordDraftAlternatives": [],
      "savedApplicationHistory": {
        "entries": [],
        "schemaVersion": 1,
        "scope": {
          "workspaceID": "33570437-882d-4276-ac92-0a45cd2e876f",
          "origin": "https://career-finder-service.jazzy-drake-8323.chatgpt.site"
        },
        "savedAt": "2026-11-23T19:22:38Z",
        "credentialAccount": "native-journey.D021D8A9-0570-449B-A0EF-5A2D51E07699"
      },
      "profileRevision": 1,
      "applicationRecordSchema": 1,
      "jobs": [
        {
          "checkedAt": "2026-11-23T19:23:12.576Z",
          "country": "SA",
          "provider": "lever",
          "sourceName": "synthetic-native-journey",
          "localOnly": true,
          "workMode": "hybrid",
          "title": "Service Designer",
          "company": "synthetic-native-journey",
          "location": "Riyadh",
          "url": "https://jobs.lever.co/synthetic-native-journey/20000000-0000-4000-8000-000000000001",
          "id": "local-7D38B427-E89D-460F-AFDF-19DA56FCA30C"
        }
      ],
      "connectionEnabled": true,
      "applicationRecords": [],
      "recordDrafts": [],
      "serviceAddress": "https://career-finder-service.jazzy-drake-8323.chatgpt.site",
      "profileNeedsSync": false
    },
    "seedReceipt": {
      "schemaVersion": 1,
      "initialStateSHA256": "f778e67e124db75a89890853adbe51a943de1357277785e5f94a810746f7e47b",
      "testID": "D021D8A9-0570-449B-A0EF-5A2D51E07699",
      "bootstrapSHA256": "bb95f079738356680e1e6bcbb7b4faaaf9c20edc78fbb0cd5aa939582164748b",
      "onlyBlankConnection": true
    },
    "seedReceiptSHA256": "b3b2d9561e41261169c129cfeac221f868e38d5d895557e08f858b3e06d789e6",
    "discovery": {
      "schemaVersion": 1,
      "jobs": [
        {
          "sourceId": "lever:global:synthetic-native-journey",
          "id": "lever:global:synthetic-native-journey:20000000-0000-4000-8000-000000000002",
          "title": "Senior Service Designer",
          "stale": false,
          "country": "SA",
          "summary": "Fictional service design opportunity in Riyadh. Synthetic native journey only. No employer receives requests.",
          "company": "synthetic-native-journey",
          "url": "https://jobs.lever.co/synthetic-native-journey/20000000-0000-4000-8000-000000000002",
          "remote": false,
          "provider": "lever",
          "location": "Riyadh",
          "sourceName": "synthetic-native-journey",
          "checkedAt": "2026-11-23T19:23:12.576Z"
        },
        {
          "sourceId": "lever:global:synthetic-native-journey",
          "id": "lever:global:synthetic-native-journey:20000000-0000-4000-8000-000000000001",
          "title": "Service Designer",
          "stale": false,
          "country": "SA",
          "summary": "Fictional service design opportunity in Riyadh. Synthetic native journey only. No employer receives requests.",
          "company": "synthetic-native-journey",
          "url": "https://jobs.lever.co/synthetic-native-journey/20000000-0000-4000-8000-000000000001",
          "remote": false,
          "provider": "lever",
          "location": "Riyadh",
          "sourceName": "synthetic-native-journey",
          "checkedAt": "2026-11-23T19:23:12.576Z"
        }
      ],
      "lastQuery": {
        "sources": [
          "lever:global:synthetic-native-journey"
        ],
        "location": "Riyadh",
        "remoteOnly": false,
        "keywords": "Service Designer"
      },
      "page": {
        "sources": [
          {
            "status": "fresh",
            "matchedCount": 2,
            "provider": "lever",
            "id": "lever:global:synthetic-native-journey",
            "name": "synthetic-native-journey",
            "checkedAt": "2026-11-23T19:23:12.576Z",
            "boardUrl": "https://jobs.lever.co/synthetic-native-journey",
            "limited": false,
            "availableCount": 2
          }
        ],
        "version": 1,
        "status": "complete",
        "notice": "Search covers only the selected public employer boards. Results can change or close; open the employer posting to confirm requirements and location eligibility.",
        "jobs": [
          {
            "sourceId": "lever:global:synthetic-native-journey",
            "id": "lever:global:synthetic-native-journey:20000000-0000-4000-8000-000000000002",
            "title": "Senior Service Designer",
            "stale": false,
            "country": "SA",
            "summary": "Fictional service design opportunity in Riyadh. Synthetic native journey only. No employer receives requests.",
            "company": "synthetic-native-journey",
            "url": "https://jobs.lever.co/synthetic-native-journey/20000000-0000-4000-8000-000000000002",
            "remote": false,
            "provider": "lever",
            "location": "Riyadh",
            "sourceName": "synthetic-native-journey",
            "checkedAt": "2026-11-23T19:23:12.576Z"
          },
          {
            "sourceId": "lever:global:synthetic-native-journey",
            "id": "lever:global:synthetic-native-journey:20000000-0000-4000-8000-000000000001",
            "title": "Service Designer",
            "stale": false,
            "country": "SA",
            "summary": "Fictional service design opportunity in Riyadh. Synthetic native journey only. No employer receives requests.",
            "company": "synthetic-native-journey",
            "url": "https://jobs.lever.co/synthetic-native-journey/20000000-0000-4000-8000-000000000001",
            "remote": false,
            "provider": "lever",
            "location": "Riyadh",
            "sourceName": "synthetic-native-journey",
            "checkedAt": "2026-11-23T19:23:12.576Z"
          }
        ],
        "ok": true,
        "totalMatches": 2,
        "generatedAt": "2026-11-23T19:23:12.582Z",
        "limited": false
      },
      "searchHistory": {
        "searches": [
          {
            "key": "[1,\"service designer\",\"riyadh\",false,[\"lever:global:synthetic-native-journey\"]]",
            "boards": [
              {
                "seenIds": [
                  "lever:global:synthetic-native-journey:20000000-0000-4000-8000-000000000001",
                  "lever:global:synthetic-native-journey:20000000-0000-4000-8000-000000000002"
                ],
                "sourceId": "lever:global:synthetic-native-journey",
                "ready": true
              }
            ],
            "lastUsedAt": 1795461792590
          }
        ],
        "version": 1
      },
      "newResult": {
        "pendingSourceIds": [],
        "comparedSourceIds": [],
        "newIds": [],
        "baselineReset": false,
        "coverageLimited": false,
        "baselinedSourceIds": [
          "lever:global:synthetic-native-journey"
        ],
        "key": "[1,\"service designer\",\"riyadh\",false,[\"lever:global:synthetic-native-journey\"]]"
      },
      "query": {
        "sources": [
          "lever:global:synthetic-native-journey"
        ],
        "location": "Riyadh",
        "remoteOnly": false,
        "keywords": "Service Designer"
      },
      "lastSearchSourceIds": [
        "lever:global:synthetic-native-journey"
      ]
    }
  }
];
const emptyOperationJournal = () => ({version:1, origin:persistenceBinding.logicalOrigin,
  workspaceId:persistenceBinding.workspaceID, entries:[], intents:[]});
function persistenceWitness(index, journal = null) {
  const value = structuredClone(retainedObservations[index]);
  return {request:value.request, witness:{proof:value.proof, phone:value.phone, discovery:value.discovery,
    seedReceipt:value.seedReceipt, seedReceiptSHA256:value.seedReceiptSHA256,
    sourceBound:true, transportClosed:false, operationJournal:journal}};
}
function beforeJobSaved() {
  const state = createCheckpointState(persistenceBinding);
  for (const index of [0,1]) {
    const value = persistenceWitness(index,index === 1 ? emptyOperationJournal() : null);
    const result = state.inspect(value.request,value.witness);
    assert.equal(result.ready,true); result.commit();
  }
  return state;
}
function checkJobSaved(change, expectedCode = null) {
  const state = beforeJobSaved(), value = persistenceWitness(2,emptyOperationJournal());
  change(value.witness);
  if (expectedCode) assert.throws(() => state.inspect(value.request,value.witness),
    error => error instanceof CheckpointError && error.code === expectedCode);
  else assert.equal(state.inspect(value.request,value.witness).ready,false);
}

test('journal filename and reconciliation scope match the five successful-refresh checkpoints', () => {
  assert.equal(operationJournalFilename(persistenceBinding.logicalOrigin,persistenceBinding.workspaceID), 'pending-operations-a7a943227bdfd311b5642a998efaed5b5769b1e5ef45c5888541481e8db23b35.json');
  assert.deepEqual(CHECKPOINTS.filter((_,index) => needsReconciledJournal(index + 1)),
    ['contactSaved','jobSaved','profileA','preparedA','profileB']);
  assert.equal(CONTROL_LIMITS.requestMilliseconds,4500);
  assert.equal(CONTROL_LIMITS.observations,128);
  assert.equal(CONTROL_LIMITS.phoneBytes,262144);
  assert.equal(Object.keys(retainedObservationPins).length,12);
});

test('canonical hosted identity and a distinct exact local backup coexist after a verified refresh', () => {
  const state = beforeJobSaved(), value = persistenceWitness(2,emptyOperationJournal());
  const backup = value.witness.phone.jobs[0], hosted = value.witness.proof.jobs[0];
  assert.notEqual(backup.id,hosted.id); assert.equal(backup.localOnly,true);
  assert.equal(backup.url,'https://jobs.lever.co/synthetic-native-journey/20000000-0000-4000-8000-000000000001');
  assert.equal(value.witness.phone.savedApplicationHistory.savedAt,
    retainedObservations[0].phone.savedApplicationHistory.savedAt);
  const result = state.inspect(value.request,value.witness);
  assert.equal(result.ready,true); result.commit(); assert.equal(state.nextSequence,4);
});

test('the retained failed run without a journal does not become accepted retroactively', () => {
  const state = beforeJobSaved(), value = persistenceWitness(2);
  assert.equal(state.inspect(value.request,value.witness).ready,false);
});

test('successful HTTP responses do not substitute for a present valid empty scoped journal', () => {
  checkJobSaved(w => { w.operationJournal = null; });
  checkJobSaved(w => { delete w.operationJournal; });
  for (const field of ['entries','intents']) checkJobSaved(w => { w.operationJournal[field] = [{}]; });
  for (const change of [j => { j.origin = 'https://another-synthetic.invalid'; },
    j => { j.workspaceId = '00000000-0000-4000-8000-000000000099'; }, j => { j.version = 2; },
    j => { delete j.intents; }, j => { j.entries = {}; }, j => { j.unreviewed = true; }]) {
    checkJobSaved(w => change(w.operationJournal),'checkpoint_operation_journal_shape');
  }
});

test('an old workspace read cannot reconcile the newly observed job mutation', () => {
  checkJobSaved(w => {
    assert.equal(w.proof.nativeCalls.at(-1).path,'/api/apply/workspace');
    w.proof.nativeCalls.pop(); w.proof.requests.pop(); w.proof.bridge.apiRequests--;
  });
});

test('missing duplicate wrong-scope and wrong-identity hosted jobs remain rejected', () => {
  checkJobSaved(w => { w.proof.jobs = []; });
  checkJobSaved(w => { w.proof.jobs.push(structuredClone(w.proof.jobs[0])); },'checkpoint_state_advanced_unexpectedly');
  for (const change of [j => { j.id = 'not-a-server-uuid'; },
    j => { j.workspace_id = '00000000-0000-4000-8000-000000000099'; },
    j => { j.job_key = 'lever:global:another-board:20000000-0000-4000-8000-000000000001'; }]) {
    checkJobSaved(w => change(w.proof.jobs[0]),'checkpoint_server_job_identity');
  }
});

test('the phone backup must retain its exact public content and local identity', () => {
  checkJobSaved(w => { w.phone.jobs = []; });
  checkJobSaved(w => { w.phone.jobs.push(structuredClone(w.phone.jobs[0])); },'checkpoint_state_advanced_unexpectedly');
  checkJobSaved(w => { w.phone.jobs[0].url = 'https://jobs.lever.co/foreign/20000000-0000-4000-8000-000000000001'; },'checkpoint_local_job_identity');
  for (const key of ['title','company','location','country','provider','workMode','sourceName','checkedAt']) {
    checkJobSaved(w => { w.phone.jobs[0][key] = 'incorrect'; });
    checkJobSaved(w => { delete w.phone.jobs[0][key]; });
  }
  checkJobSaved(w => { w.phone.jobs[0].id = w.proof.jobs[0].id; });
  checkJobSaved(w => { w.phone.jobs[0].id = 'local-not-a-uuid'; });
  checkJobSaved(w => { w.phone.jobs[0].localOnly = false; });
  checkJobSaved(w => { w.phone.jobs[0].unexpected = true; });
});

test('accepted primary backup bytes and canonical hosted identity stay stable at later checkpoints', () => {
  for (const [kind,code] of [['local','checkpoint_primary_backup_changed'],['hosted','checkpoint_primary_job_changed']]) {
    const state = beforeJobSaved(), value = persistenceWitness(2,emptyOperationJournal());
    const ready = state.inspect(value.request,value.witness); assert.equal(ready.ready,true); ready.commit();
    value.request = {...value.request,sequence:4,checkpoint:'pickerCancelled'};
    if (kind === 'local') value.witness.phone.jobs[0].id = 'local-00000000-0000-4000-8000-000000000099';
    else value.witness.proof.jobs[0].id = '00000000-0000-4000-8000-000000000099';
    assert.throws(() => state.inspect(value.request,value.witness),error => error instanceof CheckpointError && error.code === code);
  }
});

test('picker cancellation retains the original state proof without claiming another successful refresh', () => {
  const state = beforeJobSaved(), value = persistenceWitness(2,emptyOperationJournal());
  const ready = state.inspect(value.request,value.witness); assert.equal(ready.ready,true); ready.commit();
  value.request = {...value.request,sequence:4,checkpoint:'pickerCancelled'};
  value.witness.operationJournal = null;
  const result = state.inspect(value.request,value.witness);
  assert.equal(result.ready,true); assert.equal(result.facts.pickerCancelUnchanged,true);
});

// Real bounded file-controller I/O, with synthetic read-only evidence and no
// Worker, listener, native process or application container. This covers the
// new journal file's conditional collection and exact original-byte retention.
import {mkdtemp, mkdir, writeFile, readFile, readdir, stat, realpath, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {createFileCheckpointController} from './file-control.mjs';

test('actual file controller retains the required journal bytes only at successful-refresh checkpoints', {timeout:10000}, async () => {
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const root = await mkdtemp(path.join(await realpath(tmpdir()),'career-journal-contract-'));
  let controller;
  try {
    const runner = path.join(root,'runner'), app = path.join(root,'app'), evidence = path.join(root,'evidence');
    const control = path.join(runner,'Documents','NativeJourneyControl',persistenceBinding.testID);
    const appRoot = path.join(app,'Library','Application Support','CareerFinderUIAcceptance',persistenceBinding.testID);
    const applications = path.join(appRoot,'applications');
    for (const directory of [control,applications,evidence]) await mkdir(directory,{recursive:true,mode:0o700});
    const identity = async filename => { const s = await stat(filename); return {path:filename,dev:s.dev,ino:s.ino,uid:s.uid}; };
    const bootstrap = Buffer.from('{"syntheticUnitWitness":true}\n');
    const binding = {...persistenceBinding,bootstrapSHA256:digest(bootstrap)};
    const seed = {...retainedObservations[0].seedReceipt,bootstrapSHA256:binding.bootstrapSHA256};
    await writeFile(path.join(appRoot,'native-journey-bootstrap.private.json'),bootstrap,{mode:0o600});
    await writeFile(path.join(appRoot,'native-journey-seed-receipt.json'),JSON.stringify(seed),{mode:0o600});
    let currentProof = structuredClone(retainedObservations[0].proof);
    const sourceFiles = {};
    for (const name of ['control-state.mjs','file-control.mjs','contract.mjs','data.mjs']) {
      const filename = fileURLToPath(new URL('./'+name,import.meta.url));
      sourceFiles[filename] = digest(await readFile(filename));
    }
    controller = await createFileCheckpointController({...binding,
      harness:{workerSHA256:binding.workerSHA256,evidence:async()=>structuredClone(currentProof),setBoard:async()=>{throw new Error('No board control belongs to this witness');}},
      bridge:{privateConfiguration:{port:binding.bridgePort},caFingerprint256:binding.caFingerprint256,
        evidence:async()=>structuredClone(currentProof),close:async()=>{throw new Error('No listener belongs to this witness');}},
      runnerContainer:await identity(runner),appContainer:await identity(app),evidenceParent:evidence,
      expectedSourceFiles:sourceFiles,stopAt:performance.now()+9000});
    const output = path.join(evidence,'control-'+binding.testID);
    let journalBytes;
    for (const index of [0,1,2]) {
      const row = structuredClone(retainedObservations[index]);
      currentProof = row.proof;
      await writeFile(path.join(applications,'phone-draft.json'),JSON.stringify(row.phone),{mode:0o600});
      if (row.discovery) {
        const name = 'discovery-'+digest(binding.logicalOrigin+'\0'+binding.workspaceID)+'.json';
        await writeFile(path.join(appRoot,name),JSON.stringify(row.discovery),{mode:0o600});
      }
      if (index > 0) {
        journalBytes = Buffer.from(JSON.stringify(emptyOperationJournal())+'\n');
        await writeFile(path.join(applications,operationJournalFilename(binding.logicalOrigin,binding.workspaceID)),journalBytes,{mode:0o600});
      }
      const prefix = String(index+1).padStart(3,'0');
      await writeFile(path.join(control,prefix+'-request.json'),JSON.stringify(row.request),{mode:0o600});
      assert.equal(await controller.poll(),true);
      const verification = JSON.parse(await readFile(path.join(output,prefix+'-verification.json'),'utf8'));
      assert.equal(verification.completedWithinHostDeadline,true);
      const original = verification.originals.find(item => item.name === prefix+'-operation-journal.original.json');
      if (index === 0) {
        assert.equal(original,undefined);
        assert.equal((await readdir(output)).includes(prefix+'-operation-journal.original.json'),false);
      } else {
        assert.ok(original);
        assert.deepEqual(await readFile(path.join(output,original.name)),journalBytes);
        assert.equal(original.sha256,digest(journalBytes)); assert.equal(original.bytes,journalBytes.length);
      }
    }
    assert.equal(controller.status().checkpointCount,3);
    assert.deepEqual(await controller.settle(),{settled:true,unsettledHarnessOperations:0,polling:false});
  } finally {
    controller?.stop();
    if (controller) await controller.settle();
    await rm(root,{recursive:true,force:true});
  }
});
