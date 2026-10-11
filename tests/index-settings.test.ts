import test from 'node:test';
import assert from 'node:assert/strict';
import { TagFrequencyIndex } from '../src/frequency-index';
import { compatibilityReason, readSettings } from '../src/settings';
import { rankCandidates } from '../src/ranking';
import { patchMethod } from '../src/patch';
import { shouldDiscardPendingTag } from '../src/input-policy';

test('incremental add, change, remove and rename maintain distinct-note counts', () => {
  const index = new TagFrequencyIndex();
  index.update('a.md', ['#work', 'work', 'music/drum']);
  index.update('b.md', ['work']);
  index.update('a.md', ['reading', 'reading', 'music/drum']);
  index.rename('a.md', 'renamed.md');
  index.update('renamed.md', ['reading', 'music/guitar']);
  index.remove('b.md');
  assert.deepEqual(Object.fromEntries(index.getCounts()), { music: 1, reading: 1, 'music/guitar': 1 });
  assert.equal(index.noteCount, 1);
  index.clear();
  assert.equal(index.getCounts().size, 0);
});
test('new tag use changes next popup frequency ordering without a full rebuild', () => {
  const index = new TagFrequencyIndex();
  index.update('a.md', ['alpha', 'reading']);
  index.update('b.md', []);
  const values = ['alpha', 'reading'].map(tag => ({ tag, score: 0, matches: null }));
  assert.deepEqual(rankCandidates(values, '', '', index.getCounts()).map(v => v.tag), ['alpha', 'reading']);
  index.update('b.md', ['reading']);
  assert.deepEqual(rankCandidates(values, '', '', index.getCounts()).map(v => v.tag), ['reading', 'alpha']);
});
test('title preference off preserves note-frequency order and native search score', () => {
  const values = ['music', 'work'].map(tag => ({ tag, score: tag === 'music' ? 100 : 0, matches: null }));
  const counts = new Map([['music', 1], ['work', 8]]);
  assert.deepEqual(rankCandidates(values, 'music', '', counts, [], false).map(v => v.tag), ['work', 'music']);
  assert.deepEqual(rankCandidates(values, 'music', 'mus', counts, [], false).map(v => v.tag), ['music', 'work']);
});
test('unknown preferences are ignored while valid false values are retained', () => {
  assert.deepEqual(readSettings({ enabled: false, prioritizeTitle: false, title: 'not stored' }), { enabled: false, prioritizeTitle: false, sortMode: 'frequency', experimentalMobile: false });
  assert.deepEqual(readSettings({ enabled: 'false', prioritizeTitle: null }), { enabled: true, prioritizeTitle: true, sortMode: 'frequency', experimentalMobile: false });
  assert.deepEqual(readSettings(null), { enabled: true, prioritizeTitle: true, sortMode: 'frequency', experimentalMobile: false });
});
test('compatibility refuses mobile, older/future app versions and missing private method', () => {
  assert.equal(compatibilityReason(true, true, false, () => undefined), null);
  for (const [desktop, tested, next, method] of [[false, true, false, () => undefined], [true, false, false, () => undefined], [true, true, true, () => undefined], [true, true, false, undefined]] as const) {
    assert.notEqual(compatibilityReason(desktop, tested, next, method), null);
  }
});
test('adapter failure is reported once, future calls retain native array and unload restores identity', () => {
  const seen: string[][] = [];
  const target = { showSuggestions(values: string[]) { seen.push(values); } };
  const original = target.showSuggestions;
  let failures = 0;
  const restore = patchMethod(target, () => { throw new Error('shape changed'); }, () => { failures++; });
  const values = ['native'];
  target.showSuggestions(values); target.showSuggestions(values);
  assert.equal(failures, 1);
  assert.equal(seen[0], values); assert.equal(seen[1], values);
  restore(); assert.equal(target.showSuggestions, original);
});
test('blur rejects existing case/hash variants but commits new tags and respects composition', () => {
  assert.equal(shouldDiscardPendingTag('blur', 'WORK', ['work'], false), true);
  assert.equal(shouldDiscardPendingTag('blur', '#work', ['work'], false), true);
  assert.equal(shouldDiscardPendingTag('blur', '音楽', ['ドラム'], false), false);
  assert.equal(shouldDiscardPendingTag('blur', 'ドラム', ['ドラム'], true), false);
});
test('a failing compatibility notification cannot prevent native suggestions', () => {
  const seen: string[][] = [];
  const target = { showSuggestions(values: string[]) { seen.push(values); } };
  const restore = patchMethod(target, () => { throw new Error('shape'); }, () => { throw new Error('notification'); });
  target.showSuggestions(['native']);
  restore();
  assert.deepEqual(seen, [['native']]);
});
test('toolbar failure after native rendering does not render twice and disables the adapter', () => {
  let renders = 0; let failures = 0;
  const target = { showSuggestions(values: string[]) { assert.ok(values.length); renders++; } };
  const restore = patchMethod(target, (_context, values) => values, () => failures++, () => { throw Error('DOM changed'); });
  target.showSuggestions(['one']); target.showSuggestions(['two']);
  assert.equal(renders, 2); assert.equal(failures, 1); restore();
});

test('mobile requires explicit experiment and exact version plus expected method', () => {
  assert.equal(compatibilityReason(false, true, false, () => undefined, true), null);
  assert.notEqual(compatibilityReason(false, false, false, () => undefined, true), null);
  assert.notEqual(compatibilityReason(false, true, true, () => undefined, true), null);
  assert.notEqual(compatibilityReason(false, true, false, undefined, true), null);
  assert.equal(readSettings({ experimentalMobile: 'true' }).experimentalMobile, false);
  assert.equal(readSettings({ experimentalMobile: true }).experimentalMobile, true);
});
