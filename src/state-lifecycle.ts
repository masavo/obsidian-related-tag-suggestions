// Survives bundle re-evaluation in this renderer. App keys are weak; nothing is persisted.
const DRAIN_KEY = Symbol.for('related-tag-suggestions.state-drains.v1');
type RegistryGlobal = typeof globalThis & { [key: symbol]: WeakMap<object, Promise<void>> | undefined };
function registry(): WeakMap<object, Promise<void>> {
  const runtime = globalThis as RegistryGlobal;
  const existing = runtime[DRAIN_KEY];
  if (existing) return existing;
  const drains = new WeakMap<object, Promise<void>>();
  Object.defineProperty(runtime, DRAIN_KEY, { value: drains, configurable: true });
  return drains;
}
export function previousStateDrain(app: object): Promise<void> { return registry().get(app) ?? Promise.resolve(); }
export function retainStateDrain(app: object, drain: Promise<void>): void { registry().set(app, drain.catch(() => undefined)); }
