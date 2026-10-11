import test from 'node:test';
import assert from 'node:assert/strict';
import { countNotes, rankCandidates, titleMatch } from '../src/ranking';
import { patchMethod } from '../src/patch';
import { shouldDiscardPendingTag } from '../src/input-policy';
const candidate = (tag: string, score = 0) => ({ tag, score, matches: null });

test('counts notes once across frontmatter, inline duplicates, casing, and nested ancestors', () => {
  const counts = countNotes([['#drum', 'drum', 'DRUM', '#music/drum'], ['drum'], ['music/drum', 'music/guitar']]);
  assert.deepEqual(Object.fromEntries(counts), { drum: 2, music: 2, 'music/drum': 2, 'music/guitar': 1 });
});
test('empty query: title match first, then note frequency, then stable lexical tie', () => {
  const candidates = ['work', 'music', 'drum', 'alpha', 'zeta'].map(tag => candidate(tag));
  const original = candidates.slice();
  const ranked = rankCandidates(candidates, 'Music drum practice', '', new Map([['work', 20], ['music', 2], ['drum', 1]]));
  assert.deepEqual(ranked.map(c => c.tag), ['music', 'drum', 'work', 'alpha', 'zeta']);
  assert.deepEqual(candidates, original);
  assert.equal(ranked[0], candidates[1]);
});
test('search preserves native relevance and highlighting objects, reranks ties', () => {
  const candidates = [candidate('framework', 30), candidate('work', 50), candidate('workshop', 30)];
  const result = rankCandidates(candidates, 'Workshop', 'wrk', new Map([['framework', 10]]));
  assert.deepEqual(result.map(c => c.tag), ['work', 'workshop', 'framework']);
  assert.equal(result[0], candidates[1]);
});
test('existing tags and duplicate candidates excluded using #, case while preserving distinct Unicode spellings', () => {
  const result = rankCandidates([candidate('#DRUM'), candidate('music'), candidate('#Music'), candidate('work'), candidate('ＷＯＲＫ')], 'drum', '', new Map(), ['drum', '#work']);
  assert.deepEqual(result.map(c => c.tag), ['music', 'ＷＯＲＫ']);
});
test('Japanese titles and nested tag segments; no semantic inference', () => {
  assert.equal(titleMatch('音楽/ドラム', 'ドラムの練習'), true);
  assert.equal(titleMatch('music', '音楽の練習'), false);
});
test('empty results and repeated opening produce deterministic order', () => {
  assert.deepEqual(rankCandidates([], 'title', '', new Map()), []);
  const values = [candidate('b'), candidate('a')];
  assert.deepEqual(rankCandidates(values, '', '', new Map()), rankCandidates(values, '', '', new Map()));
});
test('patch restores exact original method and selection payload objects', () => {
  const seen: string[][] = [];
  const target = { showSuggestions(values: string[]) { seen.push(values); } };
  const original = target.showSuggestions;
  const restore = patchMethod(target, (_, values) => values.slice().reverse());
  target.showSuggestions(['a', 'b']); restore(); target.showSuggestions(['a', 'b']); restore();
  assert.equal(target.showSuggestions, original);
  assert.deepEqual(seen, [['b', 'a'], ['a', 'b']]);
});
test('unload keeps later plugins wrapper functional and makes our wrapper inert', () => {
  const seen: string[][] = [];
  const target = { showSuggestions(values: string[]) { seen.push(values); } };
  const restore = patchMethod(target, (_, values) => values.slice().reverse());
  const wrapped = target.showSuggestions;
  const later = (values: string[]) => wrapped.call(target, values);
  target.showSuggestions = later;
  restore(); target.showSuggestions(['a', 'b']);
  assert.equal(target.showSuggestions, later);
  assert.deepEqual(seen, [['a', 'b']]);
});
test('adapter error falls back to original native candidates', () => {
  const seen: string[][] = [];
  const target = { showSuggestions(values: string[]) { seen.push(values); } };
  const restore = patchMethod(target, () => { throw new Error('unsupported test shape'); });
  target.showSuggestions(['a']); restore();
  assert.deepEqual(seen, [['a']]);
});

test('Escape discards matching and unmatched drafts, while IME composition is retained', () => {
  assert.equal(shouldDiscardPendingTag('Escape', 'dr', ['preserve'], false), true);
  assert.equal(shouldDiscardPendingTag('Escape', 'unmatched', ['preserve'], false), true);
  assert.equal(shouldDiscardPendingTag('Escape', '変換中', ['preserve'], true), false);
});
test('raw Enter deduplicates case and hash variants but preserves new tags and other keys', () => {
  assert.equal(shouldDiscardPendingTag('Enter', 'WORK', ['work'], false), true);
  assert.equal(shouldDiscardPendingTag('Enter', ' #work ', ['work'], false), true);
  assert.equal(shouldDiscardPendingTag('Enter', 'music', ['work'], false), false);
  assert.equal(shouldDiscardPendingTag('Tab', 'work', ['work'], false), false);
  assert.equal(shouldDiscardPendingTag('Enter', 'work', ['work'], true), false);
});
