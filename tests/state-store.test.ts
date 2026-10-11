import test from 'node:test';
import assert from 'node:assert/strict';
import { StateStore } from '../src/state-store';
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
test('external state captured before old write is drained cancels queued snapshots and repairs disk', async () => {
  const gate = deferred(); const started = deferred(); const writes: string[] = []; let disk = 'old';
  const store = new StateStore<string>(async value => { writes.push(value); if (value === 'A') { started.resolve(); await gate.promise; } disk = value; });
  const a = store.save('A'); await started.promise; const b = store.save('B');
  disk = 'external'; let loaded = '';
  const replacement = store.replace(async () => disk, value => { loaded = value; return value; });
  gate.resolve(); await Promise.all([a, b, replacement]);
  assert.equal(loaded, 'external'); assert.equal(disk, 'external'); assert.deepEqual(writes, ['A', 'external']);
});
test('unload cancels queued writes and never starts a repair after closure', async () => {
  const gate = deferred(); const started = deferred(); const writes: string[] = [];
  const store = new StateStore<string>(async value => { writes.push(value); started.resolve(); await gate.promise; });
  const a = store.save('A'); await started.promise; const b = store.save('B');
  const replacement = store.replace(async () => 'external', () => assert.fail('applied after close'));
  store.close(); gate.resolve(); await Promise.all([a, b, replacement]); assert.deepEqual(writes, ['A']);
});
test('latest overlapping external reload wins and uses sanitized repair snapshot', async () => {
  const gate = deferred(); const started = deferred(); const writes: string[] = [];
  const store = new StateStore<string>(async value => { writes.push(value); if (value === 'A') { started.resolve(); await gate.promise; } });
  const a = store.save('A'); await started.promise;
  const first = store.replace(async () => 'first', () => assert.fail('stale external load'));
  let state = '';
  const second = store.replace(async () => 'second', value => { state = value; return 'sanitized'; });
  gate.resolve(); await Promise.all([a, first, second]); assert.equal(state, 'second'); assert.deepEqual(writes, ['A', 'sanitized']);
});
test('writer failures do not poison future writes or external reads', async () => {
  const writes: string[] = [];
  const store = new StateStore<string>(async value => { if (value === 'bad') throw Error('write'); writes.push(value); });
  await assert.rejects(store.save('bad')); await store.save('good');
  await assert.rejects(store.replace(async () => { throw Error('read'); }, value => value));
  await store.save('again'); assert.deepEqual(writes, ['good', 'again']);
});

test('a synchronously throwing external reader always releases the save pause', async () => {
  const writes: string[] = []; const store = new StateStore<string>(async value => { writes.push(value); });
  await assert.rejects(store.replace(() => { throw Error('sync read'); }, value => value));
  await store.save('next'); assert.deepEqual(writes, ['next']);
});
test('a rejected obsolete external reader cannot fail a newer successful reload', async () => {
  let reject!: (error: Error) => void; const stale = new Promise<string>((_resolve, fail) => { reject = fail; });
  const store = new StateStore<string>(async () => undefined); let state = '';
  const old = store.replace(() => stale, () => assert.fail('stale apply'));
  await store.replace(async () => 'current', value => { state = value; return value; });
  reject(Error('old reader')); await old; assert.equal(state, 'current');
});

test('new instance waits for a closed old writer before reading or saving', async () => {
  const started = deferred(); const gate = deferred(); let disk = 'initial';
  const old = new StateStore<string>(async value => { started.resolve(); await gate.promise; disk = value; });
  const oldWrite = old.save('old'); await started.promise;
  const next = new StateStore<string>(async value => { disk = value; }, old.close());
  let read = false;
  const load = (async () => { await next.drain(); read = true; assert.equal(disk, 'old'); await next.save('new'); })();
  await Promise.resolve(); assert.equal(read, false); gate.resolve(); await Promise.all([oldWrite, load]); assert.equal(disk, 'new');
});
