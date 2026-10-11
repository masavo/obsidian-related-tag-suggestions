import { readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sourceFiles, forbiddenPublicText } from './release-files.mjs';
import { projectRoot, readProjectFile, validateManifest, safePath, listProjectFiles, hasProjectFile, verifyZip, assertHashKeys } from './release-security.mjs';

const root = await projectRoot();
const read = path => readProjectFile(root, path);
const manifest = JSON.parse(await read('manifest.json'));
validateManifest(manifest);
const pkg = JSON.parse(await read('package.json'));
const versions = JSON.parse(await read('versions.json'));
const base = `release/${manifest.version}`;
const zipNames = [`${manifest.id}-${manifest.version}-local-candidate.zip`, `${manifest.id}-${manifest.version}-source-candidate.zip`];
const expectedAssets = ['main.js', 'manifest.json', 'styles.css', ...zipNames, 'checksums.json'];
const hashes = JSON.parse(await read(`${base}/checksums.json`));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(JSON.stringify((await readdir(await safePath(root, base, 'directory'))).sort()) === JSON.stringify(expectedAssets.sort()), 'Unexpected release directory entries');
assert(pkg.version === manifest.version, 'Version mismatch');
assert(versions[manifest.version] === manifest.minAppVersion, 'versions.json mismatch');
assert(hashes.version === manifest.version, 'Checksum version mismatch');
const allowed = new Set(await sourceFiles(root));
assertHashKeys(hashes.assets, expectedAssets.filter(name => name !== 'checksums.json'));
assertHashKeys(hashes.source, allowed);
assert(JSON.stringify(await listProjectFiles(root, 'publish/source')) === JSON.stringify([...allowed].sort()), 'Unexpected public source directory entries');
const sourceZip = verifyZip(await read(`${base}/${zipNames[1]}`), allowed);
for (const [path, bytes] of Object.entries(sourceZip)) {
  assert(!forbiddenPublicText.test(Buffer.from(bytes).toString()), `Private text in ${path}`);
  assert(sha(bytes) === sha(await read(path)) && sha(bytes) === sha(await read(`publish/source/${path}`)) && sha(bytes) === hashes.source[path], `Stale source: ${path}`);
}
const installNames = ['main.js', 'manifest.json', 'styles.css'].map(name => `${manifest.id}/${name}`);
const installZip = verifyZip(await read(`${base}/${zipNames[0]}`), installNames);
for (const name of ['main.js', 'manifest.json', 'styles.css']) {
  const bytes = await read(name);
  assert(!forbiddenPublicText.test(bytes.toString()), `Private text in asset: ${name}`);
  assert(sha(installZip[`${manifest.id}/${name}`]) === sha(bytes) && sha(await read(`${base}/${name}`)) === sha(bytes), `Stale asset: ${name}`);
}
for (const [name, hash] of Object.entries(hashes.assets)) assert(sha(await read(`${base}/${name}`)) === hash, `Checksum mismatch: ${name}`);
const blockers = [];
if (/pending/i.test(manifest.author)) blockers.push('Approve and set the public author name.');
if (pkg.license === 'UNLICENSED') blockers.push('Select a license and update package.json.');
if (!await hasProjectFile(root, 'LICENSE')) blockers.push('Add the chosen LICENSE before publication.');
console.log(JSON.stringify({ version: manifest.version, integrityPassed: true, sourceFileCount: allowed.size, installerFiles: Object.keys(installZip), publicReleaseBlockers: blockers }, null, 2));
if (process.argv.includes('--public') && blockers.length) process.exitCode = 1;
