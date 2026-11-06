# Related Tag Suggestions

Sort candidates inside Obsidian's standard in-document `tags` Properties field. Choose **頻度順** (frequency), **履歴順** (recent additions), or **ABC順** (name) in the native candidate list. On desktop, **Alt+S** (Mac **⌥S**) cycles through these modes in that order.

**Version 0.5.0.** Author: masavo. License: [MIT](LICENSE). [Public repository](https://github.com/masavo/obsidian-related-tag-suggestions). [Download 0.5.0](https://github.com/masavo/obsidian-related-tag-suggestions/releases/tag/0.5.0). Earlier 0.4.1 does not contain ABC mode or desktop API 1.14.5 support. Official Community directory submission is separate from this GitHub release.

## Sorting

- **Frequency:** title matches first if title priority is enabled, then the number of distinct Markdown notes using a tag, then name. Frequency includes cached frontmatter and inline tags. Repeated tags within a note count once; nested tags count toward ancestor candidates. Title matching is literal, case insensitive and includes nested segments.
- **History:** latest successfully added and saved tags first. Tags without recorded use follow in frequency order, then name. Title priority does not apply.
- **ABC:** normalized tag names compared with the existing Japanese locale collator (`Intl.Collator('ja')`). It ignores title priority, frequency and history. Names retain their original displayed spelling.

For a typed search, **Obsidian's native fuzzy relevance comes first in every mode**; the selected mode breaks ties. Existing tags and duplicate candidates are excluded. Native matching, highlighting, selection, validation and note saving remain owned by Obsidian.

Settings → Related Tag Suggestions controls sorting, mode and title priority. Preferences are per Vault. Switching modes, searching, hovering, viewing or cancelling does not create history. History records only confirmed novel additions from the standard tags field; YAML, Templater and bulk edits do not manufacture history. History stores the latest use of at most 500 normalized tags. Pending additions expire after 30 seconds; this is a save-confirmation timeout, not a plugin expiry.

## Compatibility and limits

Desktop core APIs **exactly 1.14.4 and 1.14.5** are supported by the version gate. The new three-mode UI and history recovery were checked on macOS Obsidian 1.14.5. Earlier main/detached-window interaction coverage was established on 0.3.0/API 1.14.4; detached-window UI was not repeated for 0.5.0.

Mobile remains **experimental and off by default**. It allows API 1.14.4 with mobile opt-in, or API exactly 1.14.5 with iOS mobile flags and explicit opt-in. Android API 1.14.5, unknown/future versions and incompatible runtime shapes retain standard suggestions. The mobile package/build label is separate from the imported core API version. Check settings diagnostics for the actual API and adapter state.

Physical iPhone success, iOS Japanese IME, soft keyboard and background behavior remain unverified. Use an isolated test Vault for mobile. Sidebar/embedded Properties, coexistence with every third-party plugin and large real-Vault UI performance are outside verified coverage.

The public API has no standard property-suggestion provider. This plugin wraps undocumented `AbstractInputSuggest.prototype.showSuggestions` and observes the native tags multiselect's `addElement`, private chooser members, DOM selectors and `MarkdownView.metadataEditor.rendered`. Exact-version and shape checks stop sorting on incompatibility. Disable sorting or unload to restore native suggestions. New Obsidian versions require revalidation and may temporarily stop sorting.

## Install and update

Install version **0.5.0**. The earlier 0.4.1 prerelease is not compatible with desktop API 1.14.5 sorting.

1. Download `main.js`, `manifest.json` and `styles.css` from its matching GitHub release into `.obsidian/plugins/related-tag-suggestions/` in your chosen Vault, or use BRAT's frozen-version command with repository `masavo/obsidian-related-tag-suggestions` and exact tag `0.5.0`.
2. Enable Related Tag Suggestions in Community plugins. Click the empty area of a note's `tags` property and choose a mode in the native list.
3. Desktop needs no mobile opt-in. For isolated mobile testing, explicitly enable モバイル実験モード and inspect diagnostics before relying on sorting.

For an existing frozen BRAT installation, edit its version in Settings → BRAT → Beta plugin list. Frozen installations keep their chosen tag; ordinary updates do not change it. See [the BRAT author's guide](https://tfthacker.com/brat-quick-guide).

Before upgrading, disable this plugin and back up its entire folder including `data.json`. Replace only the three runtime assets; preserve `data.json` for preferences/history. Enable the plugin again. To roll back, disable it and restore the backed-up folder. Existing note tags remain in the notes.

Once the plugin is accepted into the official Community directory, users can install it from Obsidian's normal Community plugins browser without BRAT.

## Privacy

No network, telemetry, account, outside-Vault access, external program or self-updater is used by runtime code. The plugin reads the filename title, existing pills and cached Markdown tags in the current Vault. It saves preferences and `{tag, usedAt, order}` history to its own `data.json`; it stores no note paths, titles, bodies, searches or candidate lists. Pending paths are held only in memory. Existing Vault sync policies also apply to plugin data.

Queued local writes are serialized. External reload cancels stale queued snapshots and repairs an already running write with captured external state. Obsidian plugin-data writes are not transactional: simultaneous device edits are not fully merged or locked. Backgrounding before confirmation may leave a saved addition absent from history; the note remains under native Obsidian control. Diagnostics show only versions, counters and adapter state and are not persisted.

## Build and verify

Node.js 20.10 or newer is required. Version 0.5.0 passed TypeScript, ESLint, **71 automated tests** and build. Tests cover sorting, history, state lifecycle, desktop/mobile adapter guards, native restoration and package integrity. Simulated interfaces do not establish real-device support. Live macOS 1.14.5 checks covered history display, ABC order, mode buttons, keyboard cycling, retained input focus and Escape. No user note was modified during those checks.

```sh
npm ci --ignore-scripts
npm run check
npm run fixture
```

The fixture generator uses synthetic notes in a new `.test-vault` and refuses to overwrite an existing Vault.

```sh
npm run release:prepare
npm run release:check-public
```

These prepare and verify local `release/0.5.0/` assets, install/source ZIPs, checksums and allowlisted `publish/source/`. They do not upload anything. The install ZIP contains only the three runtime assets. The source ZIP excludes private notes, Vaults, internal evidence/docs, dependencies, maps, vendor source and non-allowlisted scripts. Packaging rejects symlinks; ZIP verification checks entries, paths, CRC and bounded expansion.

Official directory submission is a separate step from a GitHub release; follow [Obsidian's current submission guide](https://docs.obsidian.md/plugins/releasing/submit-plugin).

## 日本語

いつもの `tags` 欄を開き、**頻度順 → 履歴順 → ABC順**から選びます。Mac は **⌥S** でも順番に切り替えできます。検索中は一致度を優先します。履歴順・ABC順にはタイトル優先を適用しません。

0.5.0 は GitHub Release から導入できます。公式 Community 一覧への登録・審査は別手続きです。以前の「期限切れ」に見えた停止は、デスクトップ版が API 1.14.4 のみを許可していたためで、利用料金や契約の期限ではありません。1.14.5 は今回実画面で動作確認しました。未知の API や部品形状では並び替えを停止し、標準候補を維持します。iPhone は引き続き実験扱いです。
