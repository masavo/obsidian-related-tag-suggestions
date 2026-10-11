import { mkdir, writeFile, copyFile, access, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root = resolve('.test-vault');
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
try { await access(root); throw new Error('Fixture already exists. Keep UI evidence; move it aside explicitly before regenerating.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(join(root, '.obsidian/plugins', manifest.id), { recursive: true });
const notes = {
  'Music drum practice.md': '---\ntags:\n  - preserve\ntrial_marker: preserve-20261010\naliases:\n  - unchanged-alias\n---\n\nFixture body must stay byte-identical.\nSecond line stays unchanged.\n',
  '01 work.md': '---\ntags: [work, music]\n---\n\n#drum #drum #drum\n',
  '02 work.md': '---\ntags: [work, music]\n---\n',
  '03 work.md': '---\ntags: [work]\n---\n',
  '04 work.md': '---\ntags: [work]\n---\n',
  '05 other.md': '---\ntags: [alpha, reading, music/guitar]\n---\n'
};
for (const [name, content] of Object.entries(notes)) await writeFile(join(root, name), content);
for (const filename of ['main.js', 'manifest.json', 'styles.css']) await copyFile(filename, join(root, '.obsidian/plugins', manifest.id, filename));
await writeFile(join(root, '.obsidian/community-plugins.json'), JSON.stringify([manifest.id]));
await writeFile(join(root, '.obsidian/app.json'), JSON.stringify({ showInlineTitle: true, propertiesInDocument: 'visible', defaultViewMode: 'source', livePreview: true }));
await writeFile(join(root, '.obsidian/core-plugins.json'), JSON.stringify(['file-explorer', 'global-search', 'switcher', 'tag-pane', 'properties', 'command-palette']));
await writeFile(join(root, '.obsidian/hotkeys.json'), '{}');
await mkdir('evidence', { recursive: true });
await writeFile('evidence/fixture-original.json', JSON.stringify(notes, null, 2));
console.log(root);
