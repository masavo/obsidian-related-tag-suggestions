import { normalizeTag } from './ranking';

export interface TagMultiSelect { inputEl: HTMLElement; values: string[]; addElement(value: string): boolean }

/** Native validation and writing still run exactly once; only true, novel additions are observed. */
export function observeAdditions<T = undefined>(
  target: TagMultiSelect, beforeSaved: () => readonly string[],
  onAdded: (added: string[], before: string[], context: T | undefined) => void, onFailure: () => void, capture?: () => T
): () => void {
  const original = target.addElement;
  const owned = Object.hasOwn(target, 'addElement');
  let enabled = true;
  const frames: Set<string>[] = [];
  const fail = (): void => { enabled = false; try { onFailure(); } catch { /* Never prevent native addition. */ } };
  const wrapper = function (this: TagMultiSelect, value: string): boolean {
    let before: string[] = [];
    let context: T | undefined;
    const nested = new Set<string>();
    frames.push(nested);
    if (enabled) {
      try { context = capture?.(); before = [...this.values, ...beforeSaved()]; }
      catch { fail(); }
    }
    let success: boolean;
    try { success = original.call(this, value); }
    finally { frames.pop(); } // Native failures propagate and leave no stale frame.
    if (enabled && success === true) {
      try {
        const known = new Set(before.map(normalizeTag));
        const added = this.values.filter(tag => !known.has(normalizeTag(tag)) && !nested.has(normalizeTag(tag)));
        for (const frame of frames) for (const tag of added) frame.add(normalizeTag(tag));
        if (added.length) onAdded(added, before, context);
      } catch { fail(); }
    }
    return success;
  };
  target.addElement = wrapper;
  return () => {
    enabled = false;
    if (target.addElement === wrapper) {
      if (owned) target.addElement = original;
      else Reflect.deleteProperty(target, 'addElement');
    }
  };
}
