import { normalizeTag } from './ranking';
/** Escape discards a draft; Enter on an existing tag must not create a case variant. */
export function shouldDiscardPendingTag(key: string, query: string, existing: readonly string[], isComposing: boolean): boolean {
  if (isComposing) return false;
  if (key === 'Escape') return true;
  const tag = normalizeTag(query);
  return (key === 'Enter' || key === 'blur') && tag.length > 0 && existing.some(value => normalizeTag(value) === tag);
}
