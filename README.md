# Related Tag Suggestions

Find tags in Obsidian's standard **tags Properties field**. The native candidate popover has two small buttons: **頻度順 (frequency)** and **履歴順 (history)**. Click the usual field, choose the order, then select a native suggestion to add a tag.

Version **0.4.0** by **masavo**, licensed under [MIT](LICENSE). [Repository](https://github.com/masavo/obsidian-related-tag-suggestions) · [0.4.0 release](https://github.com/masavo/obsidian-related-tag-suggestions/releases/tag/0.4.0). Mobile support is an opt-in experiment; real iPhone testing is pending.

## Use and ordering

1. Open a Markdown note with a visible `tags` property.
2. Click the blank input after its existing tag pills.
3. Click **頻度順** or **履歴順** inside the candidate list. The input keeps its query, caret and selected tag. Alt+S switches modes while this candidate list is open.
4. Choose with the mouse, or Down and Enter. Type to use native fuzzy search. Tab completes a suggestion; Enter adds it.
5. Escape clears the unfinished draft and closes the list. During IME composition, mode switching is suppressed; conversion confirmation and tag addition remain separate steps.

**Frequency:** title matches first when the title preference is enabled, then the number of distinct Markdown notes using each tag, then tag name. Turn title priority off for pure frequency ordering. Frequency includes frontmatter and inline tags; repetitions within a note count once, and descendants count toward ancestor candidates. Title matching is literal and case insensitive, including nested path segments. It does not infer synonyms or translate languages.

**History:** successfully added and saved tags first, latest addition first. Title priority does not apply. Tags without recorded use follow in frequency order, then by name. For a typed search in either mode, Obsidian's native fuzzy relevance stays first; the selected mode breaks ties.

Existing tags are excluded. Raw Enter/blur rejects case and leading-`#` variants of existing tags. The plugin does not merge or rename tags already in notes. New valid typed tags use Obsidian's normal validation and saving.

## What counts as recent use

History starts empty on upgrading from 0.2.0. Old usage dates are not guessed. It records native **in-document tags-field additions** by mouse selection, keyboard selection, raw Enter, Tab followed by Enter, and ordinary blur. A successful native addition is held temporarily until Obsidian's public metadata cache confirms the saved frontmatter tag.

Opening, hovering, searching, switching modes, Tab completion alone, cancelling, invalid tags, and reselecting an existing tag do not record use. Source/YAML edits, Templater, imports, bulk operations and editing an existing pill are outside the recording scope. They can change native vocabulary/frequency but do not manufacture recent history.

History retains the latest use of at most 500 normalized tags. A monotonically increasing order resolves equal timestamps, clock rollback and out-of-order save acknowledgements within one running plugin instance. Unconfirmed additions expire after 30 seconds. Removing a tag does not erase its last use, but tags absent from Obsidian's vocabulary are not suggested. Renaming a tag through another tool does not transfer its history; the new name is unrecorded until added in the standard field.

## Preferences

**Settings → Related Tag Suggestions** has sorting on/off, the two candidate modes, title priority for frequency mode only, and compatibility status. Mode changes persist per Vault and are shared by its main and detached windows. A separate mobile experiment toggle defaults to off. Turning off sorting or unloading removes the buttons and restores native suggestions, including an already open list.

## Compatibility and maintenance

Verified on **macOS desktop Obsidian 1.14.4**, in-document Properties in the main window and a detached window. Version 0.4.0 also passed the official Mac mobile UI emulation with synthetic touch/composition events. **Real iPhone, iOS WebKit, soft keyboard, background suspension and other operating systems are untested.** Other app versions are disabled. Sidebar/embedded Properties are outside the supported scope. Real third-party-plugin coexistence and large real Vault UI performance remain unverified.

Mobile is an **opt-in experiment**, off by default. On an iPhone running Obsidian **1.14.4**, use an isolated test Vault, install the three release assets, and enable **モバイル実験モード** in this plugin's settings. The standard tags field remains the entry point. Mobile buttons have 44px minimum height and omit desktop shortcuts. Missing private interfaces stop the adapter and restore native behavior. Do not treat the manifest's mobile-install permission as proof of real-device support.

For first real-device verification, tap the tags field, check title/frequency order, type a valid draft then tap the mode switch without adding it, test Japanese conversion, add an existing candidate, confirm the note saved and the tag leads history in a different note, test duplicates/cancel/reopen, restart/background the app, then disable the plugin and check native restoration. If the phone app version differs, leave the adapter off until that version is tested.

The public API does not expose a standard property-suggestion provider. This adapter wraps the undocumented `AbstractInputSuggest.prototype.showSuggestions`, uses private popover/chooser members, and observes the private native tags multiselect's `addElement` method. DOM selectors and `MarkdownView.metadataEditor.rendered` identify the owning field. Native candidate objects, fuzzy filtering, highlighting, validation and note writing remain owned by Obsidian.

Exact-version and runtime-shape guards stop the adapter on incompatibility. Unload restores originals; if another plugin has wrapped later, this wrapper becomes inert and preserves the later wrapper. Updates need isolated revalidation before widening the version gate. Public API support would be preferable long term; this integration remains dependent on core internals.

## Install a frozen version with BRAT

Use an isolated test Vault for first iPhone verification. The adapter accepts **Obsidian 1.14.4 only**, including on mobile. Real iPhone touch, Japanese IME, soft keyboard and background behavior are not yet verified.

1. Install BRAT from Obsidian's Community plugins and enable it.
2. Run **BRAT: Add a beta plugin with frozen version based on a release tag** from the command palette.
3. Enter repository **`masavo/obsidian-related-tag-suggestions`** (or its full GitHub URL) and release tag **`0.4.0`**, then add the plugin.
4. In Community plugins, enable **Related Tag Suggestions**.
5. On iPhone, open **Settings → Related Tag Suggestions** and turn on **モバイル実験モード**. It defaults to off. Keep **候補の並び替えを有効化** enabled.
6. Tap the usual `tags` property input, then use **頻度順／履歴順** inside its native candidate list.

Frozen installation keeps the selected release instead of automatically taking later plugin versions. See the [BRAT author's installation guide](https://tfthacker.com/brat-quick-guide) and [frozen-release explanation](https://tfthacker.com/brat-plugins). This plugin is not submitted to the official Community directory yet.

## Manual installation and rollback

Download **main.js, manifest.json and styles.css** from the [0.4.0 release](https://github.com/masavo/obsidian-related-tag-suggestions/releases/tag/0.4.0) into `.obsidian/plugins/related-tag-suggestions/` in your chosen Vault. Enable Related Tag Suggestions in Community plugins. Keep `data.json` when upgrading to retain preferences/history. The local packaging script also generates an install ZIP for development; the public Release provides the three assets individually.

Disable the plugin before replacing its three assets, then enable it again. Keep a backup of the entire previous plugin folder, including data.json. Disable sorting or the plugin to return to native behavior. Move the disabled folder out to remove it; restore the previous folder to roll back. Tags previously added remain in notes.

Installation changes only plugin assets and the enabled-plugin entry. It does not change templates, hotkeys or notes. Native tag choices you make are saved by Obsidian. This project does not authorize updating a normal Vault automatically.

## Privacy

The plugin uses no network, telemetry, account, outside-Vault access, external programs or self-updater. It reads the filename title, existing tag pills and cached Markdown tags in the current Vault. It writes its preferences and recent records `{tag, usedAt, order}` to its own `data.json`. It stores no note path, title, body, query or candidate list. Pending file paths exist only in memory until confirmation, expiry or unload. Any existing Vault sync policy also applies to files in that Vault. Local queued writes are serialized; a new plugin instance waits for an old instance's started writes before loading data; external settings reload cancels stale queued snapshots and repairs an already running write using the captured external snapshot. Obsidian does not provide cancellable/transactional plugin-data writes, so simultaneous edits across devices are not fully merged or locked. Backgrounding before the save acknowledgement can leave an addition unrecorded in history; the native saved note is unaffected.

## Build and verification

Use Node.js 20.10 or newer (verified with 23.7.0).

```sh
npm ci --ignore-scripts
npm run check
npm run fixture
```

The fixture generator creates six synthetic notes and the built plugin in `.test-vault`; it refuses to overwrite an existing Vault. Click the blank tags input in `Music drum practice`: frequency mode with title priority gives `music → drum → music/guitar → work → alpha → reading`. History mode initially has no history and gives frequency/name order. Add a tag to a different synthetic note, wait for saving, then reopen this field: that tag should lead recent mode.

Version 0.4.0 passed strict TypeScript, ESLint, **54 tests**, build, package security regression checks, and **16 guarded mobile-emulation runtime checks**. All nine pre-existing synthetic fixture notes remained byte-identical; one new synthetic mobile verification note was created for saving checks. Mouse interaction verified the standard-field entry, native search, order buttons and Escape in the emulated layout. Pointer/composition events were synthetic, and saving tests invoked the native multiselect method. This coverage does not establish physical iPhone support. Earlier desktop interaction and detached-window coverage were established on 0.3.0.

```sh
npm run release:prepare
npm run release:check
```

These generate and verify `release/0.4.0/` assets, install/source candidate ZIPs, checksums and the allowlisted `publish/source/`. No upload occurs. Install ZIP contains only the three plugin assets. Source ZIP excludes Vaults, notes, evidence, internal docs, dependencies, source maps and vendor source. Packaging rejects symlink inputs/outputs; ZIP checks reject duplicates, unsafe paths, hidden entries, symlinks, local/central mismatches and CRC faults. Never publish the whole working folder.

Licensed under [MIT](LICENSE). `npm run release:check-public` verifies the allowlisted public candidate. Official Community plugin directory submission is a separate process.

## 日本語で試す

いつもの `tags` の空欄をクリックし、候補窓の **頻度順／履歴順** を押してください。頻度順ではタイトル一致の優先を設定で外せます。履歴順ではタイトルを優先せず、この版の導入後に標準 tags 欄から追加・保存できたタグを新しい順に並べます。検索やキャンセルだけで履歴は増えません。

BRAT の固定バージョン追加で `masavo/obsidian-related-tag-suggestions` とタグ `0.4.0` を指定し、プラグインを有効化します。iPhone では設定の **モバイル実験モード** をオンにしてください。

Mac の Obsidian 1.14.4 で確認済みです。0.4.0 のモバイルは実験モード（初期はオフ）で、Mac の mobile 表示と合成イベントで検証しました。実 iPhone の日本語入力・ソフトキーボード・背景化は未検証です。別バージョンは停止します。隔離したテスト Vault で確認してください。
