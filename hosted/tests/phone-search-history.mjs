import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Bundle the actual pure production module and its shared source parser. No
// browser, storage, network, provider or fixture response is substituted here.
const built = await build({ entryPoints: [fileURLToPath(new URL('../app/phone/search-history.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
const { emptySearchHistory, searchHistoryKey, evaluateSearchHistory } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const A = 'lever:global:synthetic-a', B = 'greenhouse:synthetic-b';
const filters = (changes = {}) => ({ query: 'Designer', location: 'Toronto', remoteOnly: false, sources: [A], ...changes });
const posting = (suffix, sourceId = A, changes = {}) => ({ id: `${sourceId}:${suffix}`, stale: false, ...changes });
const source = (sourceId, matchedCount, changes = {}) => ({ id: sourceId, status: 'fresh', matchedCount, limited: false, error: null, ...changes });
const page = (ids, changes = {}) => ({ jobs: ids.map(id => typeof id === 'string' ? posting(id) : id), sources: [source(A, ids.length)], limited: false, nextCursor: null, ...changes });
const evaluate = (history, value, changes = {}) => evaluateSearchHistory({ history, filters: filters(), page: value, now: 100, ...changes });
const baseline = (ids = ['a', 'b'], changes = {}) => evaluate(undefined, page(ids), changes);
const board = (history, sourceId = A, key = searchHistoryKey(filters())) => history.searches.find(value => value.key === key)?.boards.find(value => value.sourceId === sourceId);
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

test('the first complete observation is a silent local baseline, including an empty board', () => {
  assert.deepEqual(emptySearchHistory(), { version: 1, searches: [] });
  for (const ids of [[], ['a', 'b']]) {
    const value = baseline(ids);
    assert.deepEqual(value.result.newIds, []);
    assert.deepEqual(value.result.baselinedSourceIds, [A]);
    assert.deepEqual(value.result.pendingSourceIds, []);
    assert.equal(value.result.coverageLimited, false);
    assert.equal(value.result.baselineReset, false);
    assert.equal(board(value.history).ready, true);
  }
});

test('equivalent board aliases/order and the server Unicode fold share one collision-free key', () => {
  const a = filters({ query: '  DÉSİGNER  ', location: ' Montréal ', sources: [A, B] });
  const b = filters({ query: 'designer', location: 'montreal', sources: ['https://boards.greenhouse.io/synthetic-b', 'https://jobs.lever.co/synthetic-a/'] });
  assert.equal(searchHistoryKey(a), searchHistoryKey(b));
  assert.equal(searchHistoryKey(filters({ sources: [A, 'https://jobs.lever.co/synthetic-a'] })), searchHistoryKey(filters()));
  for (const change of [{ query: 'Nurse' }, { location: 'Amman' }, { remoteOnly: true }, { sources: [B] }, { query: 'Design  er' }]) assert.notEqual(searchHistoryKey(filters(change)), searchHistoryKey(filters()));
  assert.equal(searchHistoryKey(filters({ sources: [] })), null, 'implicit defaults are not an identity');
  assert.equal(searchHistoryKey(filters({ sources: ['lever:legacy-stub'] })), null);
});

test('A/B to B/C marks only C and does not infer newness from employer metadata', () => {
  const first = baseline(), original = clone(first.history);
  const next = evaluate(first.history, page(['b', 'c']));
  assert.deepEqual(next.result.newIds, [`${A}:c`]);
  assert.deepEqual(next.result.comparedSourceIds, [A]);
  assert.deepEqual(board(next.history).seenIds, ['a', 'b', 'c'].map(id => `${A}:${id}`));
  assert.deepEqual(first.history, original, 'the prior history is not mutated');
  const renamed = evaluate(next.history, page([posting('b', A, { title: 'Changed title', updatedAt: '2099-01-01' }), posting('c', A, { publishedAt: '2099-01-01' })]));
  assert.deepEqual(renamed.result.newIds, []);
});

test('reordering and an old posting disappearing then returning produce no new badge', () => {
  const first = baseline(), second = evaluate(first.history, page(['b']));
  const returned = evaluate(second.history, page(['b', 'a']));
  assert.deepEqual(returned.result.newIds, []);
  assert.deepEqual(evaluate(returned.history, page(['a', 'b'])).result.newIds, []);
});

test('incomplete first-page observations are remembered before a baseline becomes ready', () => {
  const partial = evaluate(undefined, page(['a'], { sources: [source(A, 2)], nextCursor: 'page-2' }));
  assert.equal(board(partial.history).ready, false);
  assert.deepEqual(partial.result.pendingSourceIds, [A]);
  assert.equal(partial.result.coverageLimited, true);
  // A disappears before the next complete search; it must not become new later.
  const complete = evaluate(partial.history, page(['b', 'c']));
  assert.deepEqual(complete.result.newIds, []);
  assert.equal(board(complete.history).ready, true);
  const later = evaluate(complete.history, page(['a', 'd']));
  assert.deepEqual(later.result.newIds, [`${A}:d`]);
});

test('More completes each board first baseline silently and freezes the search baseline', () => {
  const both = filters({ sources: [A, B] });
  const first = evaluate(undefined, page([posting('a'), posting('b1', B)], { sources: [source(A, 1), source(B, 2)], nextCursor: 'page-2' }), { filters: both });
  assert.deepEqual(first.result.baselinedSourceIds, [A]);
  assert.deepEqual(first.result.pendingSourceIds, [B]);
  const more = evaluate(first.history, page([posting('a'), posting('b1', B), posting('b2', B)], { sources: [source(A, 1), source(B, 2)] }), { filters: both, previousResult: first.result });
  assert.deepEqual(more.result.newIds, []);
  assert.deepEqual(more.result.baselinedSourceIds, [A, B].sort());
  assert.deepEqual(more.result.pendingSourceIds, []);
});

test('mature More retains earlier new IDs and compares later pages with the same search', () => {
  const first = baseline();
  const next = evaluate(first.history, page(['b', 'c'], { sources: [source(A, 3)], nextCursor: 'more' }));
  assert.deepEqual(next.result.newIds, [`${A}:c`]);
  assert.equal(next.result.coverageLimited, true);
  const more = evaluate(next.history, page(['b', 'c', 'd']), { previousResult: next.result });
  assert.deepEqual(more.result.newIds, [`${A}:c`, `${A}:d`]);
  assert.equal(more.result.coverageLimited, false);
  const narrowerAccumulation = evaluate(more.history, page(['b', 'd']), { previousResult: more.result });
  assert.deepEqual(narrowerAccumulation.result.newIds, [`${A}:d`], 'frozen IDs must still occur in accumulated results');
});

test('a different query cannot reuse the prior result or seen history', () => {
  const first = baseline(), changed = filters({ location: 'Amman' });
  const next = evaluate(first.history, page(['b', 'c']), { filters: changed, previousResult: first.result });
  assert.deepEqual(next.result.newIds, []);
  assert.equal(next.history.searches.length, 2);
  assert.deepEqual(board(next.history).seenIds, board(first.history).seenIds);
});

test('stale, unavailable and error responses preserve the prior board baseline', () => {
  const first = baseline();
  for (const status of [{ status: 'stale' }, { status: 'unavailable' }, { error: { code: 'provider_failed' } }]) {
    const failed = evaluate(first.history, page(['b', 'c'], { sources: [source(A, 2, status)] }));
    assert.deepEqual(board(failed.history), board(first.history));
    assert.deepEqual(failed.result.newIds, []);
    assert.equal(failed.result.coverageLimited, true);
    const recovered = evaluate(failed.history, page(['b', 'c']));
    assert.deepEqual(recovered.result.newIds, [`${A}:c`]);
  }
});

test('one failed board does not erase its history or block another mature board comparison', () => {
  const both = filters({ sources: [A, B] });
  const first = evaluate(undefined, page([posting('a'), posting('b', B)], { sources: [source(A, 1), source(B, 1)] }), { filters: both });
  const next = evaluate(first.history, page([posting('c'), posting('d', B)], { sources: [source(A, 1, { error: { code: 'failure' } }), source(B, 1)] }), { filters: both });
  assert.deepEqual(next.result.newIds, [`${B}:d`]);
  assert.deepEqual(board(next.history, A, searchHistoryKey(both)), board(first.history, A, searchHistoryKey(both)));
  assert.equal(next.result.coverageLimited, true);
});

test('limited initial coverage stays unready while a mature board compares eligible observed IDs', () => {
  const limitedPage = page(['b', 'c'], { limited: true, sources: [source(A, 2, { limited: true })] });
  const first = evaluate(undefined, limitedPage);
  assert.equal(board(first.history).ready, false);
  assert.deepEqual(first.result.newIds, []);
  const initialRecovery = evaluate(first.history, page(['c', 'd']));
  assert.deepEqual(initialRecovery.result.newIds, []);
  const mature = evaluate(baseline().history, limitedPage);
  assert.deepEqual(mature.result.newIds, [`${A}:c`]);
  assert.equal(mature.result.coverageLimited, true);
});

test('a 200-result prefix of a larger matched board never becomes a complete first baseline', () => {
  const ids = Array.from({ length: 200 }, (_, i) => `posting-${i}`);
  const first = evaluate(undefined, page(ids, { sources: [source(A, 300)], nextCursor: 'more' }));
  assert.equal(board(first.history).ready, false);
  const reranked = evaluate(first.history, page([...ids.slice(1), 'posting-200'], { sources: [source(A, 300)] }));
  assert.equal(board(reranked.history).ready, false);
  assert.equal(board(reranked.history).seenIds.length, 201);
  assert.deepEqual(reranked.result.newIds, []);
});

test('cached observations are eligible; stale jobs and malformed identity/counts cannot establish readiness', () => {
  assert.equal(board(evaluate(undefined, page(['a'], { sources: [source(A, 1, { status: 'cached' })] })).history).ready, true);
  for (const value of [page([posting('a', A, { stale: true })]), page([{ id: 'unscoped-a', stale: false }]), page(['a'], { sources: [source(A, 2.5)] }), page(['a'], { sources: [source(A, 1), source(A, 1)] })]) {
    const result = evaluate(undefined, value);
    assert.equal(board(result.history).ready, false);
    assert.deepEqual(result.result.newIds, []);
    assert.equal(result.result.coverageLimited, true);
  }
});

test('identical posting suffixes from different boards remain different identities', () => {
  const both = filters({ sources: [A, B] });
  const first = evaluate(undefined, page([posting('shared')], { sources: [source(A, 1), source(B, 0)] }), { filters: both });
  const next = evaluate(first.history, page([posting('shared'), posting('shared', B)], { sources: [source(A, 1), source(B, 1)] }), { filters: both });
  assert.deepEqual(next.result.newIds, [`${B}:shared`]);
});

test('independent account histories have no process-global or cross-account baseline', () => {
  const accountA = baseline(), accountB = baseline(['b', 'c']);
  assert.deepEqual(accountB.result.newIds, []);
  assert.deepEqual(evaluate(accountA.history, page(['b', 'c'])).result.newIds, [`${A}:c`]);
  assert.deepEqual(evaluate(accountB.history, page(['b', 'c'])).result.newIds, []);
});

test('query count overflow evicts one whole least-recent query and reports a silent reset', () => {
  let history;
  for (let i = 0; i < 8; i++) history = evaluate(history, page(['a']), { filters: filters({ query: `role-${i}` }), now: i }).history;
  const ninth = evaluate(history, page(['b']), { filters: filters({ query: 'role-8' }), now: 8 });
  assert.equal(ninth.history.searches.length, 8);
  assert(!ninth.history.searches.some(value => value.key === searchHistoryKey(filters({ query: 'role-0' }))));
  assert.equal(ninth.result.baselineReset, true); assert.equal(ninth.result.coverageLimited, true);
  assert.deepEqual(ninth.result.newIds, []);
  const revisit = evaluate(ninth.history, page(['new-to-this-baseline']), { filters: filters({ query: 'role-0' }), now: 9 });
  assert.deepEqual(revisit.result.newIds, []);
});

test('board overflow resets the whole baseline and suppresses the entire current More cycle', () => {
  const first = baseline();
  board(first.history).seenIds = Array.from({ length: 1000 }, (_, i) => `${A}:old-${i}`);
  const next = evaluate(first.history, page(['replacement']));
  assert.deepEqual(board(next.history).seenIds, [`${A}:replacement`]);
  assert.equal(next.result.baselineReset, true); assert.deepEqual(next.result.newIds, []);
  const more = evaluate(next.history, page(['replacement', 'another']), { previousResult: next.result });
  assert.deepEqual(more.result.newIds, []); assert.equal(more.result.baselineReset, true);
});

test('4000 IDs is a whole-history bound and overflow evicts whole other queries', () => {
  const both = filters({ sources: [A, B] });
  const searches = Array.from({ length: 4 }, (_, i) => ({ key: searchHistoryKey({ ...both, query: `role-${i}` }), lastUsedAt: i,
    boards: [A, B].map(sourceId => ({ sourceId, ready: true, seenIds: Array.from({ length: 500 }, (_, n) => `${sourceId}:old-${n}`) })) }));
  const input = { version: 1, searches }, unchanged = clone(input);
  const next = evaluate(input, page([posting('extra'), posting('old-0', B)], { sources: [source(A, 1), source(B, 1)] }), { filters: { ...both, query: 'role-3' }, now: 10 });
  assert.equal(next.history.searches.length, 3);
  assert(!next.history.searches.some(value => value.key === searches[0].key));
  assert.equal(next.history.searches.reduce((n, value) => n + value.boards.reduce((m, b) => m + b.seenIds.length, 0), 0), 3001);
  assert.equal(next.result.baselineReset, true); assert.deepEqual(next.result.newIds, []);
  assert.deepEqual(input, unchanged);
});

test('invalid old history is reset as a unit, never repaired by trimming individual IDs', () => {
  for (const mutate of [value => value.searches.push(clone(value.searches[0])), value => board(value).seenIds.push(board(value).seenIds[0]), value => { value.searches[0].lastUsedAt = Number.MAX_SAFE_INTEGER + 1; }]) {
    const input = baseline().history; mutate(input);
    const next = evaluate(input, page(['b', 'c']));
    assert.deepEqual(next.result.newIds, []); assert.equal(next.result.baselineReset, true);
    assert.deepEqual(board(next.history).seenIds, [`${A}:b`, `${A}:c`]);
  }
});

test('an imported opaque key with unrelated boards resets the entire query instead of adding a fifth board', () => {
  const input = { version: 1, searches: [{ key: searchHistoryKey(filters()), lastUsedAt: 10, boards: Array.from({ length: 4 }, (_, index) => {
    const sourceId = `lever:global:unrelated-${index}`;
    return { sourceId, ready: true, seenIds: [`${sourceId}:old`] };
  }) }] }, untouched = clone(input);
  const next = evaluate(input, page(['a', 'b']));
  assert.equal(next.result.baselineReset, true); assert.equal(next.result.coverageLimited, true);
  assert.deepEqual(next.result.newIds, []);
  assert.deepEqual(next.history.searches[0].boards, [{ sourceId: A, ready: true, seenIds: [`${A}:a`, `${A}:b`] }]);
  assert.deepEqual(input, untouched);
});

test('frozen input values stay untouched and saved JSON retains count/baseline metadata', () => {
  const first = baseline(), input = freeze(first.history), value = freeze(page(['b', 'c']));
  const next = evaluateSearchHistory({ history: input, filters: freeze(filters()), page: value, now: 101 });
  const saved = clone(next);
  assert.deepEqual(saved.result.newIds, [`${A}:c`]);
  assert.deepEqual(evaluate(saved.history, page(['c', 'd']), { previousResult: saved.result }).result.newIds, [`${A}:c`, `${A}:d`]);
  assert.deepEqual(board(input).seenIds, [`${A}:a`, `${A}:b`]);
});

test('unsupported legacy IDs skip newness and unsafe time or oversized direct results cannot expand history', () => {
  const first = baseline();
  const unsupported = evaluate(first.history, page(['b', 'c']), { filters: filters({ sources: ['lever:legacy-stub'] }) });
  assert.equal(unsupported.result, null); assert.deepEqual(unsupported.history, first.history);
  for (const now of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => evaluate(first.history, page(['c']), { now }), /safe search observation time/);
  const oversized = evaluate(first.history, page(Array.from({ length: 201 }, (_, i) => `large-${i}`)));
  assert.deepEqual(oversized.history, first.history); assert.deepEqual(oversized.result.newIds, []);
  assert.equal(oversized.result.coverageLimited, true);
});
