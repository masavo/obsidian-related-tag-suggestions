import { AbstractInputSuggest, MarkdownView, Notice, Platform, Plugin, PluginSettingTab, Setting, TFile, getAllTags, parseFrontMatterTags, requireApiVersion } from 'obsidian';
import { normalizeTag, rankCandidates, type NativeTagCandidate } from './ranking';
import { patchMethod } from './patch';
import { observeAdditions, type TagMultiSelect } from './addition-patch';
import { shouldDiscardPendingTag } from './input-policy';
import { TagFrequencyIndex } from './frequency-index';
import { TagRecency } from './recency';
import { StateStore } from './state-store';
import { previousStateDrain, retainStateDrain } from './state-lifecycle';
import { DEFAULT_SETTINGS, TESTED_VERSION, compatibilityReason, readSettings, type RelatedTagsSettings, type SortMode } from './settings';

// Private runtime interfaces, guarded on exactly the tested version and component shape.
interface NativeSuggestRuntime {
  app: unknown; textInputEl?: HTMLElement; suggestEl: HTMLElement; isOpen: boolean;
  getValue(): string; onInputChange(): void; reposition(rect: DOMRect): void;
  suggestions: { values: NativeTagCandidate[]; selectedItem: number; forceSetSelectedItem(index: number, event: null): void };
}
interface PrivatePrototype { showSuggestions(this: NativeSuggestRuntime, values: NativeTagCandidate[]): void }
interface TagScope { input: HTMLElement; property: Element; view: MarkdownView }
interface PropertyRuntime { containerEl: HTMLElement; rendered?: { multiselect?: TagMultiSelect } }
interface Toolbar { element: HTMLElement; buttons: HTMLButtonElement[]; caption: HTMLElement; dispose(): void }
type AdapterState = 'active' | 'paused' | 'unsupported' | 'error';

export default class RelatedTagSuggestionsPlugin extends Plugin {
  settings: RelatedTagsSettings = { ...DEFAULT_SETTINGS };
  status: { state: AdapterState; reason: string } = { state: 'paused', reason: 'Loading.' };
  readonly diagnostics = { transforms: 0, indexUpdates: 0, indexedNotes: 0, recordedAdditions: 0, restored: true };
  private index = new TagFrequencyIndex();
  private indexReady = false;
  private recent = new TagRecency();
  private restore: (() => void) | null = null;
  private composing = new WeakSet<HTMLElement>();
  private windows = new WeakSet<Window>();
  private additionHooks = new Map<TagMultiSelect, { input: HTMLElement; restore(): void }>();
  private toolbars = new Map<NativeSuggestRuntime, Toolbar>();
  private stateStore = new StateStore<unknown>(value => this.saveData(value), previousStateDrain(this.app));

  async onload(): Promise<void> {
    await this.stateStore.drain(); // Old instance writes finish before reading/replacing local state.
    if (this.stateStore.isClosed) return;
    this.addSettingTab(new RelatedTagsSettingTab(this));
    try {
      const value = await this.loadData();
      if (this.stateStore.isClosed) return;
      this.loadState(value);
    }
    catch { if (!this.stateStore.isClosed) this.status = { state: 'error', reason: 'Could not load local preferences. Standard suggestions are unchanged.' }; return; }
    this.bindWindow(window);
    this.app.workspace.iterateAllLeaves(leaf => { const win = leaf.view.containerEl.ownerDocument.defaultView; if (win) this.bindWindow(win); });
    this.registerEvent(this.app.workspace.on('window-open', (_workspaceWindow, win) => this.bindWindow(win)));
    this.configureAdapter();
    this.registerEvent(this.app.metadataCache.on('changed', (file, _data, cache) => {
      if (this.indexReady) {
        this.index.update(file.path, getAllTags(cache) ?? []);
        this.diagnostics.indexUpdates++;
        this.diagnostics.indexedNotes = this.index.noteCount;
      }
      if (this.status.state === 'active') {
        const count = this.recent.confirm(file.path, parseFrontMatterTags(cache.frontmatter) ?? [], Date.now());
        if (count) { this.diagnostics.recordedAdditions += count; void this.persist(); }
      }
    }));
    this.registerEvent(this.app.metadataCache.on('resolved', () => { this.indexReady = false; }));
    this.registerEvent(this.app.vault.on('delete', file => {
      if (file instanceof TFile) { this.index.remove(file.path); this.recent.remove(file.path); } else this.indexReady = false;
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFile) { this.index.rename(oldPath, file.path); this.recent.rename(oldPath, file.path); } else this.indexReady = false;
    }));
    this.register(() => this.stopAdapter());
  }
  onunload(): void {
    retainStateDrain(this.app, this.stateStore.close()); this.stopAdapter(true); this.index.clear(); this.indexReady = false;
    this.diagnostics.indexedNotes = 0; this.status = { state: 'paused', reason: 'Plugin unloaded.' };
  }
  async updateSettings(change: Partial<RelatedTagsSettings>): Promise<void> {
    const enabledChanged = (change.enabled !== undefined && change.enabled !== this.settings.enabled) || (change.experimentalMobile !== undefined && change.experimentalMobile !== this.settings.experimentalMobile);
    this.settings = readSettings({ ...this.settings, ...change });
    if (enabledChanged) this.configureAdapter(); else this.refreshOpenSuggestions();
    await this.persist();
  }
  async onExternalSettingsChange(): Promise<void> {
    this.stopAdapter(true);
    this.status = { state: 'paused', reason: 'Reloading local preferences.' };
    try { await this.stateStore.replace(() => this.loadData(), value => { this.loadState(value); this.configureAdapter(); return this.snapshot(); }); }
    catch { this.failAdapter('Could not reload local preferences. Standard suggestions are unchanged.'); }
  }
  private loadState(value: unknown): void {
    this.settings = readSettings(value);
    this.recent = new TagRecency(value && typeof value === 'object' ? (value as Record<string, unknown>).recent : undefined);
  }
  private snapshot(): unknown { return { schemaVersion: 1, ...this.settings, recent: this.recent.snapshot() }; }
  private async persist(): Promise<void> {
    const snapshot = this.snapshot();
    try { await this.stateStore.save(snapshot); } catch { new Notice('Related Tag Suggestions: could not save local preferences/history.'); }
  }
  private bindWindow(win: Window): void {
    if (this.windows.has(win)) return;
    this.windows.add(win);
    this.registerDomEvent(win, 'compositionstart', event => {
      const scope = this.tagScope(event.target);
      if (scope) { this.composing.add(scope.input); this.updateToolbars(); }
    }, true);
    this.registerDomEvent(win, 'compositionend', event => {
      const scope = this.tagScope(event.target);
      if (scope) { this.composing.delete(scope.input); this.updateToolbars(); }
    }, true);
    this.registerDomEvent(win, 'keydown', event => {
      if (event.key === 'Escape' || event.key === 'Enter') this.discardDraft(event.key, event, event.isComposing || event.keyCode === 229);
      if (event.altKey && event.code === 'KeyS' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.repeat && !event.isComposing) {
        const scope = this.tagScope(event.target);
        if (scope && !this.composing.has(scope.input) && [...this.toolbars.keys()].some(context => context.isOpen && context.textInputEl === scope.input)) {
          event.preventDefault(); event.stopPropagation();
          void this.updateSettings({ sortMode: this.settings.sortMode === 'frequency' ? 'recent' : 'frequency' });
        }
      }
    }, true);
    this.registerDomEvent(win, 'blur', event => this.discardDraft('blur', event, false), true);
  }
  private configureAdapter(): void {
    this.stopAdapter(true);
    if (!this.settings.enabled) { this.status = { state: 'paused', reason: 'Sorting is off. Standard suggestions are unchanged.' }; return; }
    const prototype = AbstractInputSuggest.prototype as unknown as Partial<PrivatePrototype>;
    const reason = compatibilityReason(Platform.isDesktopApp, requireApiVersion(TESTED_VERSION), requireApiVersion('1.14.5'), prototype.showSuggestions, this.settings.experimentalMobile);
    if (reason) { this.status = { state: 'unsupported', reason }; return; }
    try {
      this.restore = patchMethod(prototype as PrivatePrototype, (context, values) => {
        if (context.app !== this.app) return values;
        const scope = this.tagScope(context.textInputEl ?? null);
        if (!scope?.view.file) return values;
        this.guardRuntime(context, values); this.observeInput(scope);
        const query = context.getValue();
        if (typeof query !== 'string') throw new Error('Unsupported input value');
        const ranked = rankCandidates(values, scope.view.file.basename, query, this.counts(), this.existingTags(scope.property), this.settings.prioritizeTitle,
          this.settings.sortMode === 'recent' ? this.recent.getOrders() : undefined);
        this.diagnostics.transforms++; return ranked;
      }, () => this.failAdapter('Tag adapter stopped after an incompatible response. Standard suggestions are restored. Reload the plugin to retry.'), context => {
        if (context.app === this.app && this.tagScope(context.textInputEl ?? null)) this.ensureToolbar(context);
      });
      this.diagnostics.restored = false; this.status = { state: 'active', reason: Platform.isDesktopApp ? `Ready on desktop Obsidian ${TESTED_VERSION}.` : `Experimental mobile adapter on Obsidian ${TESTED_VERSION}. Real iPhone validation is pending.` };
    } catch { this.failAdapter('Could not start tag adapter. Standard suggestions are unchanged.'); }
  }
  private guardRuntime(context: NativeSuggestRuntime, values: NativeTagCandidate[]): void {
    if (!Array.isArray(values) || !values.every(isTagCandidate) || typeof context.getValue !== 'function' || typeof context.onInputChange !== 'function' || typeof context.reposition !== 'function' ||
      !isElement(context.suggestEl) || !context.suggestions || !Array.isArray(context.suggestions.values) || typeof context.suggestions.forceSetSelectedItem !== 'function') throw new Error('Unsupported candidate interface');
  }
  private observeInput(scope: TagScope): void {
    for (const [target, hook] of this.additionHooks) if (!hook.input.isConnected) { hook.restore(); this.additionHooks.delete(target); }
    const editor = (scope.view as unknown as { metadataEditor?: { rendered?: PropertyRuntime[] } }).metadataEditor;
    const multi = editor?.rendered?.find(line => line.containerEl === scope.property)?.rendered?.multiselect;
    if (!multi || multi.inputEl !== scope.input || !Array.isArray(multi.values) || !multi.values.every(value => typeof value === 'string') || typeof multi.addElement !== 'function') throw new Error('Unsupported tags component');
    if (this.additionHooks.has(multi)) return;
    const restore = observeAdditions(multi, () => {
      // A successful native blur may immediately rerender/detach this field. Capture
      // its owning file before the native call, rather than checking connectivity after it.
      const file = multi.inputEl.isConnected ? scope.view.file : null;
      return file ? parseFrontMatterTags(this.app.metadataCache.getFileCache(file)?.frontmatter) ?? [] : [];
    }, (added, before, additionFile) => {
      if (additionFile && this.status.state === 'active') this.recent.queue(additionFile.path, added, before, Date.now());
    }, () => this.failAdapter('Tag-addition interface changed. Standard suggestions are restored.'), () => multi.inputEl.isConnected ? scope.view.file : null);
    this.additionHooks.set(multi, { input: scope.input, restore });
  }
  private ensureToolbar(context: NativeSuggestRuntime): void {
    for (const [old, toolbar] of this.toolbars) if (old.textInputEl && !old.textInputEl.isConnected) { toolbar.dispose(); this.toolbars.delete(old); }
    if (!this.toolbars.has(context)) {
      const doc = context.suggestEl.ownerDocument;
      const element = doc.createElement('div'); element.className = 'related-tags-toolbar';
      const group = doc.createElement('div'); group.className = 'related-tags-modes'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'タグ候補の順序');
      const buttons = (['frequency', 'recent'] as const).map(mode => {
        const button = doc.createElement('button'); button.type = 'button'; button.tabIndex = -1;
        button.textContent = mode === 'frequency' ? '頻度順' : '履歴順'; button.dataset.mode = mode;
        button.setAttribute('aria-label', `${button.textContent}へ切り替え${Platform.isMobile ? '' : ' (Alt+S)'}`); group.append(button); return button;
      });
      const caption = doc.createElement('div'); caption.className = 'related-tags-caption';
      element.append(group, caption); context.suggestEl.prepend(element);
      const retainInput = (event: Event): void => { event.preventDefault(); event.stopPropagation(); };
      const switchMode = (event: Event): void => {
        event.preventDefault(); event.stopPropagation();
        const target = event.target;
        if (!isElement(target)) return;
        const mode = target.closest('button')?.dataset.mode;
        if ((mode === 'frequency' || mode === 'recent') && mode !== this.settings.sortMode && context.textInputEl && !this.composing.has(context.textInputEl)) void this.updateSettings({ sortMode: mode });
      };
      const pointerDown = (event: PointerEvent): void => { retainInput(event); if (event.pointerType === 'touch' || event.pointerType === 'pen') switchMode(event); };
      element.addEventListener('pointerdown', pointerDown); element.addEventListener('mousedown', retainInput); element.addEventListener('click', switchMode);
      this.toolbars.set(context, { element, buttons, caption, dispose: () => {
        element.removeEventListener('pointerdown', pointerDown); element.removeEventListener('mousedown', retainInput); element.removeEventListener('click', switchMode); element.remove();
      } });
    }
    this.updateToolbars();
    if (context.isOpen && context.textInputEl) context.reposition(context.textInputEl.getBoundingClientRect());
  }
  private updateToolbars(): void {
    for (const [context, toolbar] of this.toolbars) {
      const composing = !!context.textInputEl && this.composing.has(context.textInputEl);
      for (const button of toolbar.buttons) {
        button.setAttribute('aria-pressed', String(button.dataset.mode === this.settings.sortMode));
        button.setAttribute('aria-disabled', String(composing));
      }
      const shortcut = Platform.isMobile ? '' : Platform.isMacOS ? ' · ⌥S' : ' · Alt+S';
      toolbar.caption.textContent = (composing ? '変換中は切替を待ちます' : context.getValue().trim() ? '検索の一致度を優先' :
        this.settings.sortMode === 'recent' ? '履歴順' : this.settings.prioritizeTitle ? 'タイトル一致 → 頻度順' : '頻度順') + (composing ? '' : shortcut);
    }
  }
  private refreshOpenSuggestions(): void {
    if (this.status.state !== 'active') return;
    try {
      for (const context of this.toolbars.keys()) {
        this.refreshContext(context);
      }
      this.updateToolbars();
    } catch { this.failAdapter('Popover refresh interface changed. Standard suggestions are restored.'); }
  }
  private refreshContext(context: NativeSuggestRuntime): void {
    const input = context.textInputEl;
    if (!context.isOpen || !input || this.composing.has(input) || input.ownerDocument.activeElement !== input) return;
    const oldTag = context.suggestions.values[context.suggestions.selectedItem]?.tag;
    const selection = input.ownerDocument.getSelection();
    const range = selection?.rangeCount && input.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
    context.onInputChange();
    if (context.isOpen) {
      const index = oldTag === undefined ? -1 : context.suggestions.values.findIndex(value => normalizeTag(value.tag) === normalizeTag(oldTag));
      context.suggestions.forceSetSelectedItem(index, null);
    }
    if (range && selection) { selection.removeAllRanges(); selection.addRange(range); }
  }
  private stopAdapter(refresh = false): void {
    const contexts = [...this.toolbars.keys()];
    this.restore?.(); this.restore = null;
    for (const toolbar of this.toolbars.values()) toolbar.dispose(); this.toolbars.clear();
    for (const hook of this.additionHooks.values()) hook.restore(); this.additionHooks.clear();
    this.recent.clearPending(); this.diagnostics.restored = true;
    if (refresh) for (const context of contexts) { try { this.refreshContext(context); } catch { /* Next native input event refreshes an unfamiliar view. */ } }
  }
  private failAdapter(reason: string): void { this.stopAdapter(); this.status = { state: 'error', reason }; new Notice(`Related Tag Suggestions: ${reason}`); }
  private discardDraft(action: string, event: Event, isComposing: boolean): void {
    if (this.status.state !== 'active') return;
    try {
      const scope = this.tagScope(event.target);
      if (scope && shouldDiscardPendingTag(action, scope.input.textContent ?? '', this.existingTags(scope.property), isComposing || this.composing.has(scope.input))) scope.input.textContent = '';
    } catch { this.failAdapter('Input compatibility changed. Standard suggestions are restored.'); }
  }
  private tagScope(target: EventTarget | null): TagScope | null {
    if (!isElement(target) || !target.matches('.multi-select-input[contenteditable="true"]')) return null;
    const property = target.closest('.metadata-property[data-property-key="tags"]'); if (!property) return null;
    let owner: MarkdownView | null = null;
    this.app.workspace.iterateAllLeaves(leaf => { if (leaf.view instanceof MarkdownView && leaf.view.contentEl.contains(target)) owner = leaf.view; });
    return owner ? { input: target, property, view: owner } : null;
  }
  private existingTags(property: Element): string[] { return Array.from(property.querySelectorAll('.multi-select-pill-content'), element => element.textContent ?? ''); }
  private counts(): ReadonlyMap<string, number> {
    if (!this.indexReady) {
      this.index.clear();
      for (const file of this.app.vault.getMarkdownFiles()) { const cache = this.app.metadataCache.getFileCache(file); this.index.update(file.path, cache ? getAllTags(cache) ?? [] : []); }
      this.indexReady = true; this.diagnostics.indexedNotes = this.index.noteCount;
    }
    return this.index.getCounts();
  }
}

class RelatedTagsSettingTab extends PluginSettingTab {
  constructor(private plugin: RelatedTagSuggestionsPlugin) { super(plugin.app, plugin); }
  display(): void {
    const { containerEl } = this; containerEl.empty();
    new Setting(containerEl).setName('候補の並び替えを有効化').setDesc('標準 tags 欄の候補を並び替えます。')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.enabled).onChange(async value => { await this.plugin.updateSettings({ enabled: value }); this.display(); }));
    new Setting(containerEl).setName('候補の順序').setDesc('候補窓でも切り替えできます。履歴順は、この版の導入後に標準 tags 欄から追加・保存できたタグを新しい順に表示します。閲覧や検索だけでは履歴は増えません。')
      .addDropdown(dropdown => dropdown.addOption('frequency', '頻度順').addOption('recent', '履歴順').setValue(this.plugin.settings.sortMode)
        .onChange(async value => { await this.plugin.updateSettings({ sortMode: value as SortMode }); this.display(); }));
    new Setting(containerEl).setName('タイトル一致を優先').setDesc('頻度順だけに適用します。履歴順では適用しません。')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.prioritizeTitle).onChange(async value => { await this.plugin.updateSettings({ prioritizeTitle: value }); this.display(); }));
    new Setting(containerEl).setName('モバイル実験モード').setDesc('Obsidian 1.14.4 のみ。Mac の mobile 表示で検証し、実 iPhone のタッチ・日本語入力は未検証です。隔離したテスト Vault で有効にしてください。')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.experimentalMobile).onChange(async value => { await this.plugin.updateSettings({ experimentalMobile: value }); this.display(); }));
    new Setting(containerEl).setName('対応環境').setDesc(this.plugin.status.reason);
  }
}
function isElement(value: unknown): value is HTMLElement { return !!value && typeof value === 'object' && typeof (value as HTMLElement).matches === 'function'; }
function isTagCandidate(value: unknown): value is NativeTagCandidate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<NativeTagCandidate>;
  return typeof candidate.tag === 'string' && typeof candidate.score === 'number' && Number.isFinite(candidate.score);
}
