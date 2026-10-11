import { writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { sourceFiles, forbiddenPublicText } from './release-files.mjs';
import { projectRoot, readProjectFile, validateManifest, safePath, assertSafeTree, verifyZip } from './release-security.mjs';

const root = await projectRoot();
const manifest = JSON.parse(await readProjectFile(root, 'manifest.json'));
validateManifest(manifest); // All manifest-derived paths are validated before any mutation.
const base = `release/${manifest.version}`;
const publicRoot = 'publish/source';
const zipNames = [`${manifest.id}-${manifest.version}-local-candidate.zip`, `${manifest.id}-${manifest.version}-source-candidate.zip`];
const expectedAssets = ['main.js', 'manifest.json', 'styles.css', ...zipNames, 'checksums.json'];
const files = await sourceFiles(root);
const source = Object.create(null);
const assets = Object.create(null);
// Read and validate every input before replacing any generated output.
for (const path of files) {
  const bytes = await readProjectFile(root, path);
  if (forbiddenPublicText.test(bytes.toString())) throw new Error(`Private path or workspace content in public source: ${path}`);
  source[path] = bytes;
}
for (const name of ['main.js', 'manifest.json', 'styles.css']) {
  const bytes = await readProjectFile(root, name);
  if (forbiddenPublicText.test(bytes.toString())) throw new Error(`Private content in asset: ${name}`);
  assets[`${manifest.id}/${name}`] = bytes;
}
await assertSafeTree(root, publicRoot);
await assertSafeTree(root, base);
try {
  for (const name of await readdir(await safePath(root, base, 'directory'))) if (!expectedAssets.includes(name)) throw new Error('Unexpected existing release entry');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const zipOptions = { level: 9, mtime: new Date('2026-01-01T00:00:00Z') };
const installer = zipSync(assets, zipOptions);
const sourceArchive = zipSync(source, zipOptions);
verifyZip(installer, Object.keys(assets));
verifyZip(sourceArchive, files);
await rm(await safePath(root, publicRoot, 'directory', true), { recursive: true, force: true }); // Generated output only.
for (const [path, bytes] of Object.entries(source)) {
  const target = await safePath(root, `${publicRoot}/${path}`, 'file', true);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(await safePath(root, `${publicRoot}/${path}`, 'file', true), bytes, { flag: 'wx' });
}
await mkdir(await safePath(root, base, 'directory', true), { recursive: true });
const outputs = { 'main.js': assets[`${manifest.id}/main.js`], 'manifest.json': assets[`${manifest.id}/manifest.json`], 'styles.css': assets[`${manifest.id}/styles.css`], [zipNames[0]]: installer, [zipNames[1]]: sourceArchive };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const [name, bytes] of Object.entries(outputs)) await writeFile(await safePath(root, `${base}/${name}`, 'file', true), bytes);
const hashes = Object.fromEntries(Object.entries(outputs).map(([name, bytes]) => [name, sha(bytes)]));
await writeFile(await safePath(root, `${base}/checksums.json`, 'file', true), JSON.stringify({ version: manifest.version, assets: hashes, source: Object.fromEntries(Object.entries(source).map(([path, bytes]) => [path, sha(bytes)])) }, null, 2));
console.log(`Local candidates prepared in ${base}; public source allowlist in ${publicRoot}. No upload performed.`);
