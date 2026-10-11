import { tagsInNote } from './ranking';

/** Per-note sets keep duplicate occurrences and incremental edits from inflating counts. */
export class TagFrequencyIndex {
  private notes = new Map<string, Set<string>>();
  private counts = new Map<string, number>();
  get noteCount(): number { return this.notes.size; }
  getCounts(): ReadonlyMap<string, number> { return this.counts; }
  update(path: string, tags: readonly string[]): void {
    const previous = this.notes.get(path) ?? new Set<string>();
    const next = tagsInNote(tags);
    for (const tag of previous) if (!next.has(tag)) this.decrement(tag);
    for (const tag of next) if (!previous.has(tag)) this.counts.set(tag, (this.counts.get(tag) ?? 0) + 1);
    this.notes.set(path, next);
  }
  remove(path: string): void {
    for (const tag of this.notes.get(path) ?? []) this.decrement(tag);
    this.notes.delete(path);
  }
  rename(oldPath: string, newPath: string): void {
    const tags = this.notes.get(oldPath);
    if (!tags || oldPath === newPath) return;
    this.remove(newPath);
    this.notes.delete(oldPath);
    this.notes.set(newPath, tags);
  }
  clear(): void { this.notes.clear(); this.counts.clear(); }
  private decrement(tag: string): void {
    const count = (this.counts.get(tag) ?? 0) - 1;
    if (count <= 0) this.counts.delete(tag); else this.counts.set(tag, count);
  }
}
