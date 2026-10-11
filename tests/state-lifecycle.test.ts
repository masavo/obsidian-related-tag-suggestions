import test from 'node:test';
import assert from 'node:assert/strict';
import { previousStateDrain, retainStateDrain } from '../src/state-lifecycle';
test('renderer drain registry isolates apps and survives fresh module evaluation', async () => {
  const first = {}; const second = {}; let resolve!: () => void;
  const pending = new Promise<void>(done => { resolve = done; }); retainStateDrain(first, pending);
  const fresh: typeof import('../src/state-lifecycle') = await import(new URL('../src/state-lifecycle.ts?fresh', import.meta.url).href);
  let firstReady = false; let secondReady = false;
  const a = fresh.previousStateDrain(first).then(() => { firstReady = true; });
  await previousStateDrain(second).then(() => { secondReady = true; });
  assert.equal(firstReady, false); assert.equal(secondReady, true); resolve(); await a; assert.equal(firstReady, true);
});
