import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, realpath, rm} from 'node:fs/promises';
import https from 'node:https';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {startNativeJourneyBridge} from './bridge.mjs';

test('failure diagnostics expose only bounded loopback search timing', async () => {
  const temp = await realpath(await mkdtemp(path.join(tmpdir(), 'career-bridge-status-')));
  const stateDirectory = path.join(temp, 'state');
  await mkdir(stateDirectory, {mode:0o700});
  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  let bridge, entered;
  const dispatched = new Promise(resolve => { entered = resolve; });
  try {
    bridge = await startNativeJourneyBridge({port, harness:{stateDirectory,
      async dispatchNative() {
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
  } finally {
    if (bridge) await bridge.close();
    await rm(temp, {recursive:true, force:true});
  }
});
