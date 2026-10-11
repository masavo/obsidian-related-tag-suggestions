import { normalizeTag } from './ranking';

export interface TagUse { tag: string; usedAt: number; order: number }
const MAX_HISTORY = 500;
const MAX_PENDING_AGE = 30_000;

/** Only confirmed additions enter this owner. Paths exist solely in transient pending state. */
export class TagRecency {
  private history = new Map<string, TagUse>();
  private sequence = 0;
  private pending = new Map<string, Map<string, { usedAt: number; order: number }>>();

  constructor(data?: unknown) {
    if (!Array.isArray(data)) return;
    for (const value of data.slice(0, 10_000) as unknown[]) {
      if (!value || typeof value !== 'object') continue;
      const item = value as Partial<TagUse>;
      if (typeof item.tag !== 'string' || !item.tag.trim() || item.tag.length > 1024 ||
          typeof item.usedAt !== 'number' || !Number.isFinite(item.usedAt) || item.usedAt < 0 ||
          typeof item.order !== 'number' || !Number.isSafeInteger(item.order) || item.order <= 0) continue;
      const tag = normalizeTag(item.tag);
      if ((this.history.get(tag)?.order ?? 0) < item.order) this.history.set(tag, { tag, usedAt: item.usedAt, order: item.order });
    }
    this.trim();
    this.sequence = Math.max(0, ...Array.from(this.history.values(), item => item.order));
  }
  getOrders(): ReadonlyMap<string, number> { return new Map(Array.from(this.history.values(), item => [item.tag, item.order])); }
  snapshot(): TagUse[] { return Array.from(this.history.values()).sort((a, b) => b.order - a.order || a.tag.localeCompare(b.tag)); }

  queue(path: string, added: readonly string[], before: readonly string[], at: number): void {
    this.expire(at);
    const existing = new Set(before.map(normalizeTag));
    const entries = this.pending.get(path) ?? new Map<string, { usedAt: number; order: number }>();
    for (const tag of new Set(added.map(normalizeTag))) {
      if (tag && !existing.has(tag)) {
        if (this.sequence === Number.MAX_SAFE_INTEGER) this.rebase();
        entries.set(tag, { usedAt: at, order: ++this.sequence });
      }
    }
    if (entries.size) this.pending.set(path, entries);
  }
  confirm(path: string, savedTags: readonly string[], at: number): number {
    this.expire(at);
    const entries = this.pending.get(path);
    if (!entries) return 0;
    const saved = new Set(savedTags.map(normalizeTag));
    let count = 0;
    for (const [tag, use] of entries) {
      if (!saved.has(tag)) continue;
      // Counter determines recency even with equal timestamps or a clock moving backwards.
      if ((this.history.get(tag)?.order ?? 0) < use.order) {
        this.history.set(tag, { tag, ...use });
        count++;
      }
      entries.delete(tag);
    }
    if (!entries.size) this.pending.delete(path);
    this.trim();
    return count;
  }
  remove(path: string): void { this.pending.delete(path); }
  rename(oldPath: string, newPath: string): void {
    const entries = this.pending.get(oldPath);
    if (entries) { this.pending.delete(oldPath); this.pending.set(newPath, entries); }
  }
  clearPending(): void { this.pending.clear(); }
  private expire(at: number): void {
    for (const [path, entries] of this.pending) {
      for (const [tag, use] of entries) if (at - use.usedAt > MAX_PENDING_AGE) entries.delete(tag);
      if (!entries.size) this.pending.delete(path);
    }
  }
  private trim(): void {
    for (const item of this.snapshot().slice(MAX_HISTORY)) this.history.delete(item.tag);
  }
  private rebase(): void {
    this.sequence = 0;
    const items = [...this.history.values(), ...Array.from(this.pending.values()).flatMap(entries => [...entries.values()])];
    for (const item of items.sort((a, b) => a.order - b.order)) item.order = ++this.sequence;
  }
}
