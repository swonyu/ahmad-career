import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, realpath, rm} from 'node:fs/promises';
import https from 'node:https';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {startNativeJourneyBridge} from './bridge.mjs';

test('failure diagnostics expose bounded search, profile-write and TLS timing', async () => {
  const temp = await realpath(await mkdtemp(path.join(tmpdir(), 'career-bridge-status-')));
  const stateDirectory = path.join(temp, 'state');
  await mkdir(stateDirectory, {mode:0o700});
  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  let bridge, entered, profileEntered, releaseProfile;
  const dispatched = new Promise(resolve => { entered = resolve; });
  const profileDispatched = new Promise(resolve => { profileEntered = resolve; });
  const profileRelease = new Promise(resolve => { releaseProfile = resolve; });
  try {
    bridge = await startNativeJourneyBridge({port, harness:{stateDirectory,
      async dispatchNative(target) {
        if (target === '/api/apply/profile') {
          profileEntered();
          await profileRelease;
          return Response.json({ok:true});
        }
        entered();
        await new Promise(resolve => setTimeout(resolve, 30));
        return Response.json({ok:true});
      }}});
    const ca = await readFile(bridge.caPath);
    const url = `https://127.0.0.1:${port}/api/discovery/search?source=lever%3Aglobal%3Asynthetic-native-journey&q=Service%20Designer&location=Riyadh&remote=any`;
    const response = new Promise((resolve, reject) => {
      https.get(url, {ca, headers:{authorization:'Bearer synthetic',
        'x-native-journey-bridge':bridge.privateConfiguration.bridgeToken}}, result => {
        result.resume(); result.on('end', () => resolve(result.statusCode));
      }).on('error', reject);
    });
    await dispatched;
    assert.equal(bridge.status().search.inFlight, 1);
    assert.equal(await response, 200);
    const diagnostic = bridge.status();
    assert.deepEqual(Object.keys(diagnostic.search).sort(),
      ['completed','inFlight','lastDurationMs','lastStatusClass','oldestInFlightMs','started'].sort());
    assert.equal(diagnostic.search.started, 1);
    assert.equal(diagnostic.search.completed, 1);
    assert.equal(diagnostic.search.inFlight, 0);
    assert.equal(diagnostic.search.lastStatusClass, 2);
    assert.ok(diagnostic.search.lastDurationMs >= 20);
    assert.deepEqual(diagnostic.profileWrites, {admitted:0, completed:0, inFlight:0,
      lastAdmittedAtUTC:null, lastCompletedAtUTC:null, lastDurationMs:null, lastStatusClass:null});
    assert.deepEqual(diagnostic.documentRequests, {'CV-A.pdf':0, 'CV-B.pdf':0});
    assert.equal(diagnostic.lastTlsErrorAtUTC, null);
    assert.equal(diagnostic.lastTlsErrorAgeMs, null);
    const documentResponse = new Promise((resolve, reject) => {
      https.get(`https://127.0.0.1:${port}${bridge.privateConfiguration.documents['CV-A.pdf']}`,
        {ca}, result => {
          result.resume(); result.on('end', () => resolve(result.statusCode));
        }).on('error', reject);
    });
    assert.equal(await documentResponse, 200);
    assert.deepEqual(bridge.status().documentRequests, {'CV-A.pdf':1, 'CV-B.pdf':0});
    const profileResponse = new Promise((resolve, reject) => {
      const request = https.request(`https://127.0.0.1:${port}/api/apply/profile`,
        {method:'PUT', ca, headers:{authorization:'Bearer synthetic',
          'x-native-journey-bridge':bridge.privateConfiguration.bridgeToken,
          'content-type':'application/json'}}, result => {
          result.resume(); result.on('end', () => resolve(result.statusCode));
        });
      request.on('error', reject); request.end('{}');
    });
    await profileDispatched;
    const pending = bridge.status().profileWrites;
    assert.equal(pending.admitted, 1);
    assert.equal(pending.completed, 0);
    assert.equal(pending.inFlight, 1);
    assert.match(pending.lastAdmittedAtUTC, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    releaseProfile();
    assert.equal(await profileResponse, 200);
    const completed = bridge.status().profileWrites;
    assert.equal(completed.admitted, 1);
    assert.equal(completed.completed, 1);
    assert.equal(completed.inFlight, 0);
    assert.match(completed.lastCompletedAtUTC, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(completed.lastStatusClass, 2);
    assert.ok(completed.lastDurationMs >= 0);
  } finally {
    releaseProfile();
    if (bridge) await bridge.close();
    await rm(temp, {recursive:true, force:true});
  }
});
