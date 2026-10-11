import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import type { RelatedTagsSettings } from '../src/settings';
import type { NativeTagCandidate } from '../src/ranking';

const bundle = buildSync({ entryPoints: [fileURLToPath(new URL('../src/main.ts', import.meta.url))], bundle: true, external: ['obsidian'], format: 'cjs', platform: 'browser', write: false }).outputFiles[0]!.text;
const nativeValues: NativeTagCandidate[] = ['alpha', 'zulu'].map(tag => ({ tag, score: 0, matches: null }));

class TestElement {
  readonly nodeType = 1; textContent = ''; className = ''; type = ''; tabIndex = 0; isConnected = true;
  dataset: Record<string, string> = {}; attributes: Record<string, string> = {};
  children: TestElement[] = []; property: TestElement | null = null; standardInput = false;
  contained: TestElement | null = null;
  constructor(readonly ownerDocument: TestDocument) {}
  matches(selector: string): boolean { return selector !== '.multi-select-input[contenteditable="true"]' || this.standardInput; }
  closest(selector: string): TestElement | null { return selector.startsWith('.metadata-property') ? this.property : null; }
  contains(target: unknown): boolean { return target === this.contained; }
  querySelectorAll(): TestElement[] { return []; }
  setAttribute(key: string, value: string): void { this.attributes[key] = value; }
  addEventListener(): void {}
  removeEventListener(): void {}
  append(...elements: TestElement[]): void { this.children.push(...elements); }
  prepend(element: TestElement): void { this.children.unshift(element); }
  remove(): void { this.isConnected = false; }
  empty(): void { this.children = []; }
  createEl(_name: string, options: { text?: string; cls?: string } = {}): TestElement {
    const element = new TestElement(this.ownerDocument); element.textContent = options.text ?? ''; element.className = options.cls ?? ''; this.append(element); return element;
  }
  getBoundingClientRect(): object { return {}; }
}
class TestWindow { listeners: Record<string, (event: { target: TestElement }) => void> = {}; }
class TestDocument {
  readonly nodeType = 9;
  defaultView = new TestWindow(); activeElement: TestElement | null = null;
  createElement(): TestElement { return new TestElement(this); }
  getSelection(): null { return null; }
}
class TestFile {
  constructor(readonly path: string, readonly basename: string, readonly tags: string[]) {}
}
class TestMarkdownView {
  file: TestFile | null = new TestFile('private-note.md', 'PRIVATE_NOTE_TITLE', []);
  contentEl: TestElement; containerEl: TestElement;
  metadataEditor: { rendered: { containerEl: TestElement; rendered: { multiselect: { inputEl: TestElement; values: string[]; addElement(value: string): boolean } } }[] };
  constructor(input: TestElement, property: TestElement) {
    this.contentEl = this.containerEl = new TestElement(input.ownerDocument); this.contentEl.contained = input;
    this.metadataEditor = { rendered: [{ containerEl: property, rendered: { multiselect: { inputEl: input, values: [], addElement: () => false } } }] };
  }
}
interface TestApp {
  workspace: { iterateAllLeaves(callback: (leaf: { view: TestMarkdownView }) => void): void; on(): object };
  metadataCache: { getFileCache(file: TestFile): { tags: string[] }; on(): object };
  vault: { getMarkdownFiles(): TestFile[]; on(): object };
}
interface TestPlugin {
  settings: RelatedTagsSettings; status: { state: string; reason: string };
  diagnostics: { suggestionCalls: number; scopedCalls: number; transforms: number; restored: boolean; lastScope: string; inputEvents: number; tagsFieldEvents: number };
  onload(): Promise<void>; onunload(): void; onExternalSettingsChange(): Promise<void>;
  updateSettings(change: Partial<RelatedTagsSettings>): Promise<void>;
  diagnosticReport(): string;
}
function host(api: string, options: { owner?: boolean; inputShape?: boolean; storedExperiment?: boolean; missingMethod?: boolean; missingConstructor?: boolean; bundleText?: string; desktop?: boolean; mobileApp?: boolean; ios?: boolean } = {}) {
  const doc = new TestDocument(); const input = new TestElement(doc); const property = new TestElement(doc);
  input.standardInput = options.inputShape !== false; input.property = property; doc.activeElement = input;
  const view = new TestMarkdownView(input, property);
  let stored: unknown = { experimentalMobile: options.storedExperiment ?? false };
  const saves: unknown[] = []; const notices: string[] = []; const tabs: { display(): void; containerEl: TestElement }[] = [];
  const app: TestApp = {
    workspace: { iterateAllLeaves: callback => { if (options.owner !== false) callback({ view }); }, on: () => ({}) },
    metadataCache: { getFileCache: file => ({ tags: file.tags }), on: () => ({}) },
    vault: { getMarkdownFiles: () => [new TestFile('one.md', '', ['alpha', 'zulu']), new TestFile('two.md', '', ['zulu'])], on: () => ({}) },
  };
  class PluginBase {
    constructor(readonly app: TestApp, readonly manifest: { version: string }) {}
    async saveData(value: unknown): Promise<void> { stored = value; saves.push(value); }
    async loadData(): Promise<unknown> { return stored; }
    addSettingTab(tab: { display(): void; containerEl: TestElement }): void { tabs.push(tab); }
    registerDomEvent(win: TestWindow, name: string, callback: (event: { target: TestElement }) => void): void { win.listeners[name] = callback; }
    registerEvent(): void {}
    register(): void {}
  }
  class NativeSuggest {
    app = app; textInputEl = input; suggestEl = new TestElement(doc); isOpen = true; renders = 0;
    suggestions = { values: [] as NativeTagCandidate[], selectedItem: -1, forceSetSelectedItem: (index: number) => { this.suggestions.selectedItem = index; } };
    showSuggestions(values: NativeTagCandidate[]): void { this.renders++; this.suggestions.values = values; }
    getValue(): string { return input.textContent; }
    onInputChange(): void { this.showSuggestions(nativeValues); }
    reposition(): void {}
  }
  if (options.missingMethod) Reflect.deleteProperty(NativeSuggest.prototype, 'showSuggestions');
  const original = NativeSuggest.prototype.showSuggestions;
  class SettingTab {
    containerEl = new TestElement(doc);
  }
  class Setting {
    setName(): this { return this; } setDesc(): this { return this; }
    addToggle(): this { return this; } addDropdown(): this { return this; } addButton(): this { return this; }
  }
  const obsidian = {
    AbstractInputSuggest: options.missingConstructor ? undefined : NativeSuggest, MarkdownView: TestMarkdownView, TFile: TestFile, Plugin: PluginBase, PluginSettingTab: SettingTab, Setting,
    Notice: class { constructor(message: string) { notices.push(message); } },
    Platform: { isDesktopApp: options.desktop ?? false, isMobileApp: options.mobileApp ?? true, isIosApp: options.ios ?? true, isMobile: !options.desktop, version: '1.14.5', build: '387' },
    apiVersion: api,
    requireApiVersion: (version: string) => api.localeCompare(version, undefined, { numeric: true }) >= 0,
    getAllTags: (cache: { tags: string[] }) => cache.tags,
    parseFrontMatterTags: (frontmatter: { tags?: string[] } | undefined) => frontmatter?.tags ?? [],
  };
  const module: { exports: unknown } = { exports: {} };
  vm.runInNewContext(options.bundleText ?? bundle, { module, exports: module.exports, require: (id: string) => { assert.equal(id, 'obsidian'); return obsidian; }, console, window: doc.defaultView });
  const Plugin = (module.exports as { default: new(app: TestApp, manifest: { version: string }) => TestPlugin }).default;
  const plugin = new Plugin(app, { version: '0.4.1' }); const suggest = new NativeSuggest();
  return { plugin, suggest, NativeSuggest, original, doc, input, view, notices, saves, tabs, externalSettings: (value: unknown) => { stored = value; } };
}

test('iOS mobile opt-in reconfigures the real adapter immediately; a shell label does not replace API version', async () => {
  const h = host('1.14.4'); await h.plugin.onload();
  assert.equal(h.plugin.status.state, 'unsupported'); assert.equal(h.NativeSuggest.prototype.showSuggestions, h.original);
  await h.plugin.updateSettings({ experimentalMobile: true });
  assert.equal(h.plugin.status.state, 'active'); assert.notEqual(h.NativeSuggest.prototype.showSuggestions, h.original);
  assert.match(h.plugin.status.reason, /フックを設置/); assert.equal(h.plugin.diagnostics.scopedCalls, 0);
  h.suggest.showSuggestions(nativeValues);
  assert.deepEqual(h.suggest.suggestions.values.map(value => value.tag), ['zulu', 'alpha']);
  assert.equal(h.plugin.diagnostics.scopedCalls, 1); assert.match(h.plugin.status.reason, /並び替えを確認/);
  assert.match(h.plugin.diagnosticReport(), /API: 1.14.4/); h.plugin.onunload();
});
test('older and future APIs stay unpatched even with iOS opt-in, and report the current API', async () => {
  for (const api of ['1.14.3', '1.14.6', '1.14.50', '1.14.5-beta', '1.14.5.1', '2.0.0']) {
    const h = host(api); await h.plugin.onload(); await h.plugin.updateSettings({ experimentalMobile: true });
    assert.equal(h.plugin.status.state, 'unsupported'); assert.equal(h.NativeSuggest.prototype.showSuggestions, h.original);
    h.suggest.showSuggestions(nativeValues); assert.equal(h.suggest.suggestions.values, nativeValues);
    assert.ok(h.plugin.status.reason.includes(api)); assert.equal(h.plugin.diagnostics.suggestionCalls, 0); h.plugin.onunload();
  }
});
test('missing private method fails closed before installing on the allowed mobile API', async () => {
  const h = host('1.14.4', { storedExperiment: true, missingMethod: true }); await h.plugin.onload();
  assert.equal(h.plugin.status.state, 'unsupported'); assert.equal(h.plugin.diagnostics.restored, true); h.plugin.onunload();
});
test('unrecognized mobile input or Markdown owner retains native order and exposes the blocked scope', async () => {
  for (const [options, reason] of [[{ owner: false }, 'no-markdown-owner'], [{ inputShape: false }, 'unexpected-input']] as const) {
    const h = host('1.14.4', { storedExperiment: true, ...options }); await h.plugin.onload(); h.suggest.showSuggestions(nativeValues);
    assert.equal(h.suggest.suggestions.values, nativeValues); assert.equal(h.plugin.diagnostics.suggestionCalls, 1);
    assert.equal(h.plugin.diagnostics.scopedCalls, 0); assert.equal(h.plugin.diagnostics.lastScope, reason); h.plugin.onunload();
  }
});
test('incompatible native candidate runtime restores originals and renders the native list once', async () => {
  const h = host('1.14.4', { storedExperiment: true }); await h.plugin.onload();
  Reflect.deleteProperty(h.suggest.suggestions, 'forceSetSelectedItem'); h.suggest.showSuggestions(nativeValues);
  assert.equal(h.plugin.status.state, 'error'); assert.equal(h.suggest.renders, 1);
  assert.equal(h.NativeSuggest.prototype.showSuggestions, h.original); assert.equal(h.plugin.diagnostics.restored, true);
  assert.equal(h.suggest.suggestions.values, nativeValues); assert.equal(h.notices.length, 1); h.plugin.onunload();
});
test('turning the mobile experiment off restores an already open native list without clearing its draft', async () => {
  const h = host('1.14.4', { storedExperiment: true }); await h.plugin.onload(); h.suggest.showSuggestions(nativeValues);
  h.input.textContent = 'PRIVATE_QUERY'; await h.plugin.updateSettings({ experimentalMobile: false });
  assert.equal(h.NativeSuggest.prototype.showSuggestions, h.original); assert.equal(h.plugin.diagnostics.restored, true);
  assert.equal(h.suggest.suggestions.values, nativeValues); assert.equal(h.input.textContent, 'PRIVATE_QUERY'); h.plugin.onunload();
});
test('external preferences can disable a mobile opt-in and the report reflects the loaded value', async () => {
  const h = host('1.14.4', { storedExperiment: true }); await h.plugin.onload();
  h.externalSettings({ experimentalMobile: false }); await h.plugin.onExternalSettingsChange();
  assert.equal(h.plugin.settings.experimentalMobile, false); assert.equal(h.plugin.status.state, 'unsupported');
  assert.match(h.plugin.diagnosticReport(), /mobileExperiment=false/); h.plugin.onunload();
});
test('diagnostics distinguish observed field events from candidate-hook arrival and never persist note/tag/query data', async () => {
  const h = host('1.14.4', { storedExperiment: true }); await h.plugin.onload();
  h.doc.defaultView.listeners.focusin!({ target: h.input }); h.doc.defaultView.listeners.input!({ target: h.input });
  assert.equal(h.plugin.diagnostics.inputEvents, 2); assert.equal(h.plugin.diagnostics.tagsFieldEvents, 2);
  assert.equal(h.plugin.diagnostics.suggestionCalls, 0); h.input.textContent = 'PRIVATE_QUERY';
  const candidate = { tag: 'PRIVATE_TAG', score: 10, matches: null }; h.suggest.showSuggestions([candidate]);
  h.tabs[0]!.display(); const report = h.plugin.diagnosticReport();
  assert.match(report, /iOS=true/); assert.match(report, /scopedCalls=1/);
  for (const privateValue of ['PRIVATE_NOTE_TITLE', 'private-note.md', 'PRIVATE_QUERY', 'PRIVATE_TAG']) assert.equal(report.includes(privateValue), false);
  await h.plugin.updateSettings({ sortMode: 'recent' });
  for (const saved of h.saves) { assert.equal(JSON.stringify(saved).includes('diagnostics'), false); assert.equal(JSON.stringify(saved).includes('PRIVATE_'), false); }
  h.plugin.onunload();
});

test('exact API 1.14.5 runs only the opt-in iOS trial and keeps native fuzzy relevance first', async () => {
  const h = host('1.14.5'); await h.plugin.onload();
  assert.equal(h.plugin.status.state, 'unsupported');
  await h.plugin.updateSettings({ experimentalMobile: true }); h.suggest.showSuggestions(nativeValues);
  assert.equal(h.plugin.status.state, 'active'); assert.equal(h.plugin.diagnostics.transforms, 1);
  assert.deepEqual(h.suggest.suggestions.values.map(value => value.tag), ['zulu', 'alpha']);
  h.input.textContent = 'alpha';
  const fuzzy = [{ tag: 'alpha', score: 10, matches: null }, { tag: 'zulu', score: 0, matches: null }];
  h.suggest.showSuggestions(fuzzy); assert.equal(h.suggest.suggestions.values[0], fuzzy[0]);
  assert.match(h.plugin.diagnosticReport(), /API: 1.14.5/); h.plugin.onunload();
});
test('API 1.14.5 stays native on desktop, Android and non-mobile iOS flags', async () => {
  for (const options of [{ desktop: true }, { ios: false }, { mobileApp: false }]) {
    const h = host('1.14.5', { storedExperiment: true, ...options }); await h.plugin.onload(); h.suggest.showSuggestions(nativeValues);
    assert.equal(h.plugin.status.state, 'unsupported'); assert.equal(h.NativeSuggest.prototype.showSuggestions, h.original);
    assert.equal(h.suggest.suggestions.values, nativeValues); h.plugin.onunload();
  }
});
test('iOS 1.14.5 rejects unknown chooser and tags-component shapes before any transform', async () => {
  for (const fault of ['chooser-index', 'open-state', 'tags-component']) {
    const h = host('1.14.5', { storedExperiment: true }); await h.plugin.onload();
    if (fault === 'chooser-index') Reflect.set(h.suggest.suggestions, 'selectedItem', 'unknown');
    if (fault === 'open-state') Reflect.set(h.suggest, 'isOpen', 'unknown');
    if (fault === 'tags-component') Reflect.set(h.view.metadataEditor, 'rendered', {});
    h.suggest.showSuggestions(nativeValues);
    assert.equal(h.plugin.status.state, 'error'); assert.equal(h.plugin.diagnostics.transforms, 0);
    assert.equal(h.suggest.renders, 1); assert.equal(h.suggest.suggestions.values, nativeValues);
    assert.equal(h.NativeSuggest.prototype.showSuggestions, h.original); h.plugin.onunload();
  }
});
test('iOS 1.14.5 unknown field scope stays native and disabling restores the already open trial', async () => {
  const unknown = host('1.14.5', { storedExperiment: true, owner: false }); await unknown.plugin.onload(); unknown.suggest.showSuggestions(nativeValues);
  assert.equal(unknown.suggest.suggestions.values, nativeValues); assert.equal(unknown.plugin.diagnostics.transforms, 0); unknown.plugin.onunload();
  const h = host('1.14.5', { storedExperiment: true }); await h.plugin.onload(); h.suggest.showSuggestions(nativeValues);
  h.input.textContent = 'PRIVATE_DRAFT'; await h.plugin.updateSettings({ experimentalMobile: false });
  assert.equal(h.NativeSuggest.prototype.showSuggestions, h.original); assert.equal(h.suggest.suggestions.values, nativeValues);
  assert.equal(h.input.textContent, 'PRIVATE_DRAFT'); h.plugin.onunload();
});

test('missing suggestions export stops the iOS trial without a startup exception', async () => {
  const h = host('1.14.5', { storedExperiment: true, missingConstructor: true }); await h.plugin.onload();
  assert.equal(h.plugin.status.state, 'unsupported'); assert.equal(h.plugin.diagnostics.restored, true);
  assert.equal(h.NativeSuggest.prototype.showSuggestions, h.original); h.suggest.showSuggestions(nativeValues);
  assert.equal(h.suggest.suggestions.values, nativeValues); h.plugin.onunload();
});

test('unknown popover DOM fails before sorting and retains the original native array', async () => {
  for (const fault of ['missing-document', 'missing-prepend', 'wrong-document']) {
    const h = host('1.14.5', { storedExperiment: true }); await h.plugin.onload();
    if (fault === 'missing-document') Reflect.set(h.suggest, 'suggestEl', { matches: () => true });
    if (fault === 'missing-prepend') Reflect.set(h.suggest.suggestEl, 'prepend', undefined);
    if (fault === 'wrong-document') Reflect.set(h.suggest.suggestEl, 'ownerDocument', { nodeType: 1, createElement: () => ({}) });
    h.suggest.showSuggestions(nativeValues);
    assert.equal(h.plugin.status.state, 'error'); assert.equal(h.plugin.diagnostics.transforms, 0);
    assert.equal(h.suggest.suggestions.values, nativeValues); assert.equal(h.suggest.renders, 1);
    assert.equal(h.NativeSuggest.prototype.showSuggestions, h.original); h.plugin.onunload();
  }
});
