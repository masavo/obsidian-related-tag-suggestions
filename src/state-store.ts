/** One writer for plugin-local state; external reload cancels stale queued snapshots. */
export class StateStore<T> {
  private tail: Promise<void> = Promise.resolve();
  private generation = 0;
  private running = 0;
  private paused = false;
  private closed = false;
  constructor(private write: (value: T) => Promise<void>, previous: Promise<void> = Promise.resolve()) { this.tail = previous.catch(() => undefined); }
  get isClosed(): boolean { return this.closed; }
  drain(): Promise<void> { return this.tail.catch(() => undefined); }
  save(value: T): Promise<void> {
    const generation = this.generation;
    this.tail = this.tail.catch(() => undefined).then(async () => {
      if (this.closed || this.paused || generation !== this.generation) return;
      this.running++;
      try { await this.write(value); } finally { this.running--; }
    });
    return this.tail;
  }
  async replace(read: () => Promise<T>, apply: (value: T) => T): Promise<void> {
    const generation = ++this.generation;
    this.paused = true;
    const repair = this.running > 0;
    // Read the external snapshot immediately, before waiting for the old writer.
    try {
      const capture = read();
      const [value] = await Promise.all([capture, this.tail.catch(() => undefined)]);
      if (this.closed || generation !== this.generation) return;
      const replacement = apply(value);
      this.paused = false;
      if (repair) await this.save(replacement);
    } catch (error) {
      if (this.closed || generation !== this.generation) return;
      throw error;
    } finally {
      if (generation === this.generation) this.paused = false;
    }
  }
  close(): Promise<void> { this.closed = true; this.generation++; return this.drain(); }
}
