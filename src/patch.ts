/** Small reversible adapter. No assumption about runtime class/minified names. */
export function patchMethod<Context, Value>(
  target: { showSuggestions: (this: Context, values: Value[]) => void },
  transform: (context: Context, values: Value[]) => Value[],
  onFailure: () => void = () => { console.error('[Related Tag Suggestions] Suggestions adapter stopped; native behavior retained.'); },
  afterRender?: (context: Context) => void
): () => void {
  const original = target.showSuggestions;
  let enabled = true;
  const wrapper = function (this: Context, values: Value[]): void {
    let next = values;
    if (enabled) {
      try { next = transform(this, values); }
      catch {
        enabled = false;
        try { onFailure(); }
        catch { console.error('[Related Tag Suggestions] Could not report adapter failure; native behavior retained.'); }
      }
    }
    original.call(this, next);
    if (enabled && afterRender) {
      try { afterRender(this); }
      catch { enabled = false; try { onFailure(); } catch { /* Native rendering already completed. */ } }
    }
  };
  target.showSuggestions = wrapper;
  return () => {
    enabled = false;
    // If another plugin wrapped us, leave its wrapper in place and become inert.
    if (target.showSuggestions === wrapper) target.showSuggestions = original;
  };
}
