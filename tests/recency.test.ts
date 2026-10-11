import test from 'node:test';
import assert from 'node:assert/strict';
import { TagRecency } from '../src/recency';
import { observeAdditions, type TagMultiSelect } from '../src/addition-patch';
import { rankCandidates } from '../src/ranking';
import { readSettings } from '../src/settings';

test('legacy settings start in frequency mode without fabricated history', () => {
  assert.equal(readSettings({ enabled: true, prioritizeTitle: false }).sortMode, 'frequency');
  assert.equal(readSettings({ sortMode: 'recent' }).sortMode, 'recent');
  assert.equal(readSettings({ sortMode: 'untrusted' }).sortMode, 'frequency');
  assert.deepEqual(new TagRecency().snapshot(), []);
});
test('only saved novel additions count, cancelled/invalid/duplicate/stale tags do not', () => {
  const recent = new TagRecency();
  recent.queue('a.md', ['WORK', '#new'], ['work'], 100);
  assert.deepEqual(recent.snapshot(), []);
  assert.equal(recent.confirm('a.md', ['work'], 110), 0);
  assert.equal(recent.confirm('a.md', ['work', 'new'], 120), 1);
  assert.equal(recent.confirm('a.md', ['new'], 130), 0);
  recent.queue('b.md', ['cancelled'], [], 200);
  assert.equal(recent.confirm('b.md', ['cancelled'], 30_201), 0);
  assert.deepEqual(recent.snapshot().map(use => use.tag), ['new']);
});
test('actual addition order survives equal times, clock rollback, reordered cache events and restart', () => {
  const recent = new TagRecency();
  recent.queue('a.md', ['alpha'], [], 100);
  recent.queue('b.md', ['beta'], [], 100);
  recent.confirm('b.md', ['beta'], 110);
  recent.confirm('a.md', ['alpha'], 110);
  recent.queue('c.md', ['gamma'], [], 90);
  recent.confirm('c.md', ['gamma'], 95);
  const loaded = new TagRecency(recent.snapshot());
  assert.deepEqual(loaded.snapshot().map(use => use.tag), ['gamma', 'beta', 'alpha']);
  loaded.queue('d.md', ['alpha'], [], 120);
  loaded.confirm('d.md', ['alpha'], 130);
  assert.deepEqual(loaded.snapshot().map(use => use.tag), ['alpha', 'gamma', 'beta']);
  assert.deepEqual(Object.keys(loaded.snapshot()[0]!).sort(), ['order', 'tag', 'usedAt']);
});
test('two windows adding the same tag cannot let an older cache acknowledgement regress recency', () => {
  const recent = new TagRecency();
  recent.queue('first.md', ['alpha'], [], 10);
  recent.queue('second.md', ['alpha'], [], 20);
  recent.confirm('second.md', ['alpha'], 30);
  recent.confirm('first.md', ['alpha'], 40);
  assert.equal(recent.snapshot()[0]?.usedAt, 20);
});
test('remove/re-add before a cache acknowledgement keeps the latest successful addition', () => {
  const recent = new TagRecency();
  recent.queue('a.md', ['alpha'], [], 10);
  recent.queue('a.md', ['alpha', '#ALPHA'], [], 20);
  recent.confirm('a.md', ['alpha'], 30);
  assert.deepEqual(recent.snapshot(), [{ tag: 'alpha', usedAt: 20, order: 2 }]);
});
test('pending rename follows note; deletion/disable clears pending without rewriting historical tag names', () => {
  const recent = new TagRecency();
  recent.queue('a.md', ['old/tag'], [], 100); recent.rename('a.md', 'b.md');
  assert.equal(recent.confirm('a.md', ['old/tag'], 120), 0);
  assert.equal(recent.confirm('b.md', ['old/tag'], 120), 1);
  recent.queue('c.md', ['deleted'], [], 130); recent.remove('c.md');
  recent.queue('d.md', ['disabled'], [], 130); recent.clearPending();
  assert.equal(recent.confirm('c.md', ['deleted'], 140), 0);
  assert.equal(recent.confirm('d.md', ['disabled'], 140), 0);
  assert.deepEqual(recent.snapshot().map(use => use.tag), ['old/tag']);
});
test('history is sanitized, deduplicated, bounded and rejects nonminimal fields', () => {
  const entries = Array.from({ length: 505 }, (_, i) => ({ tag: `tag${i}`, usedAt: 10, order: i + 1, path: 'not retained' }));
  const recent = new TagRecency([...entries, null, { tag: 'bad', usedAt: -1, order: 700 }, { tag: 'bad', usedAt: 1, order: 0 }]);
  assert.equal(recent.snapshot().length, 500);
  assert.equal(recent.snapshot()[0]?.tag, 'tag504');
  assert.equal(recent.getOrders().has('bad'), false);
  assert.equal('path' in recent.snapshot()[0]!, false);
});
test('recent mode ignores title, keeps native search relevance first, unused frequency and names stable', () => {
  const values = ['title', 'alpha', 'used', 'work'].map(tag => ({ tag, score: tag === 'title' ? 100 : 0, matches: null }));
  const counts = new Map([['title', 1], ['alpha', 2], ['work', 8]]);
  const recent = new Map([['used', 1]]);
  assert.deepEqual(rankCandidates(values, 'title', '', counts, [], true, recent).map(v => v.tag), ['used', 'work', 'alpha', 'title']);
  assert.deepEqual(rankCandidates(values, 'title', 't', counts, [], true, recent).map(v => v.tag), ['title', 'used', 'work', 'alpha']);
  assert.equal(rankCandidates(values, '', '', counts, [], true, recent)[0], values[2]);
});
function nativeMulti(): TagMultiSelect {
  return { inputEl: {} as HTMLElement, values: ['keep'], addElement(value) {
    if (!value || this.values.includes(value)) return false;
    this.values.push(value); return true;
  } };
}
test('addition observer preserves native result/this, rejects duplicates and restores identity', () => {
  const target = nativeMulti(); const original = target.addElement; const added: string[][] = [];
  const restore = observeAdditions(target, () => ['keep'], values => added.push(values), () => assert.fail('unexpected failure'));
  assert.equal(target.addElement('keep'), false);
  assert.equal(target.addElement('new'), true);
  assert.equal(target.addElement(''), false);
  assert.deepEqual(added, [['new']]); restore(); assert.equal(target.addElement, original);
});
test('observation failure cannot break or repeat native addition, even if notification throws', () => {
  const target = nativeMulti(); let calls = 0; const original = target.addElement;
  target.addElement = function(value) { calls++; return original.call(this, value); };
  const restore = observeAdditions(target, () => { throw Error('cache'); }, () => assert.fail('record'), () => { throw Error('notice'); });
  assert.equal(target.addElement('new'), true); assert.equal(calls, 1);
  assert.equal(target.addElement('other'), true); assert.equal(calls, 2); restore();
});
test('later wrapper remains in place but unloaded observer becomes inert', () => {
  const target = nativeMulti(); let recorded = 0;
  const restore = observeAdditions(target, () => [], () => recorded++, () => undefined);
  const inner = target.addElement;
  const later = function(this: TagMultiSelect, value: string): boolean { return inner.call(this, value); };
  target.addElement = later; restore();
  assert.equal(target.addElement, later); assert.equal(target.addElement('new'), true); assert.equal(recorded, 0);
});
test('inherited native method is restored without leaving a new own property', () => {
  const prototype = { addElement(this: TagMultiSelect, value: string) { this.values.push(value); return true; } };
  const target = Object.assign(Object.create(prototype) as TagMultiSelect, { values: [], inputEl: {} as HTMLElement });
  const restore = observeAdditions(target, () => [], () => undefined, () => undefined);
  target.addElement('new'); restore();
  assert.equal(Object.hasOwn(target, 'addElement'), false);
  assert.equal(target.addElement, prototype.addElement);
});
test('native exceptions propagate once without recording a failed addition', () => {
  const target = nativeMulti(); let called = 0;
  target.addElement = () => { called++; throw Error('native failure'); };
  const restore = observeAdditions(target, () => [], () => assert.fail('recorded'), () => assert.fail('adapter failure'));
  assert.throws(() => target.addElement('new'), /native failure/);
  assert.equal(called, 1); restore();
});

test('nested additions notify each native addition once and keep per-call owner context', () => {
  const seen: { added: string[]; context: string | undefined }[] = []; let owner = 'outer';
  const target = { inputEl: {} as HTMLElement, values: [] as string[], addElement(value: string): boolean {
    if (value === 'outer') { owner = 'inner'; this.addElement('inner'); }
    this.values.push(value); return true;
  } };
  const restore = observeAdditions(target, () => [], (added, _before, context) => seen.push({ added, context }), () => assert.fail('failure'), () => owner);
  assert.equal(target.addElement('outer'), true);
  assert.deepEqual(seen, [{ added: ['inner'], context: 'inner' }, { added: ['outer'], context: 'outer' }]); restore();
});
