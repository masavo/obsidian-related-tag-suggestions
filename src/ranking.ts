/** A native candidate is retained unchanged so native highlighting/selection still work. */
export interface NativeTagCandidate { tag: string; score: number; matches: unknown }
export const normalizeTag = (value: string): string => value.trim().replace(/^#/, '').toLowerCase();

export function tagsInNote(tags: readonly string[]): Set<string> {
  const unique = new Set<string>();
  for (const tag of tags) {
    const segments = normalizeTag(tag).split('/').filter(Boolean);
    for (let length = 1; length <= segments.length; length++) unique.add(segments.slice(0, length).join('/'));
  }
  return unique;
}

/** Count each tag once per note. Ancestors match Obsidian's native candidate vocabulary. */
export function countNotes(tagLists: Iterable<readonly string[]>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tags of tagLists) {
    for (const tag of tagsInNote(tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}

export function titleMatch(tag: string, title: string): boolean {
  const normalizedTitle = title.toLowerCase();
  return normalizeTag(tag).split('/').some(segment => segment.length > 0 && normalizedTitle.includes(segment));
}

/** Native fuzzy relevance remains first for a nonempty query; only ties are reranked. */
const collator = new Intl.Collator('ja');
export function rankCandidates<T extends NativeTagCandidate>(
  candidates: readonly T[], title: string, query: string, counts: ReadonlyMap<string, number>, existing: readonly string[] = [], prioritizeTitle = true,
  recent?: ReadonlyMap<string, number>
): T[] {
  const seen = new Set(existing.map(normalizeTag));
  const filtered = candidates.filter(candidate => {
    const tag = normalizeTag(candidate.tag);
    if (seen.has(tag)) return false;
    seen.add(tag);
    return true;
  });
  const searching = normalizeTag(query).length > 0;
  return filtered.map(value => ({ value, name: normalizeTag(value.tag), related: prioritizeTitle && titleMatch(value.tag, title), count: counts.get(normalizeTag(value.tag)) ?? 0 }))
    .sort((left, right) => (searching ? right.value.score - left.value.score : 0)
      || (recent ? (recent.get(right.name) ?? 0) - (recent.get(left.name) ?? 0) : Number(right.related) - Number(left.related))
      || right.count - left.count
      || collator.compare(left.name, right.name))
    .map(item => item.value);
}
