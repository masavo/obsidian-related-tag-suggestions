import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, realpath, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { validateManifest, safePath, readProjectFile, assertSafeTree, verifyZip, assertHashKeys } from '../scripts/release-security.mjs';

const manifest = { id: 'related-tag-suggestions', name: 'Synthetic candidate', version: '0.3.0', minAppVersion: '1.14.4', description: 'Synthetic test fixture.', author: 'test', isDesktopOnly: true };
const packageScript = fileURLToPath(new URL('../scripts/package-release.mjs', import.meta.url));
const checkerScript = fileURLToPath(new URL('../scripts/check-release.mjs', import.meta.url));
const releaseFiles = await import(new URL('../scripts/release-files.mjs', import.meta.url).href) as { SOURCE_ROOT_FILES: string[]; SOURCE_SCRIPTS: string[] };

async function scratch(run: (root: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'related-tags-release-test-'));
  try { await run(await realpath(directory)); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

// Stored ZIP builder allows adversarial raw entries that name-to-bytes zipSync cannot represent.
function rawZip(entries: { name: string; body: string; mode?: number; localName?: string }[]) {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const localName = Buffer.from(entry.localName ?? entry.name);
    const data = Buffer.from(entry.body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(localName.length, 26);
    locals.push(local, localName, data);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50);
    header.writeUInt16LE(0x0314, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt32LE(crc32(data), 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);
    offset += local.length + localName.length + data.length;
  }
  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(localBytes.length, 16);
  return Buffer.concat([localBytes, centralBytes, end]);
}

async function seedProject(root: string) {
  await mkdir(join(root, 'scripts'));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'tests'));
  for (const name of releaseFiles.SOURCE_ROOT_FILES) await writeFile(join(root, name), `Synthetic ${name}\n`);
  for (const name of releaseFiles.SOURCE_SCRIPTS) await copyFile(new URL(`../scripts/${name}`, import.meta.url), join(root, 'scripts', name));
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: manifest.version, license: 'UNLICENSED' }));
  await writeFile(join(root, 'versions.json'), JSON.stringify({ [manifest.version]: manifest.minAppVersion }));
  await writeFile(join(root, 'main.js'), 'module.exports = {};\n');
  await writeFile(join(root, 'src/main.ts'), 'export const fixture = true;\n');
  await writeFile(join(root, 'tests/fixture.test.ts'), 'export const syntheticTest = true;\n');
}

function command(script: string, root: string) {
  return spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
}

test('release manifest paths are validated before output creation', async () => {
  validateManifest(manifest);
  for (const change of [{ version: '../outside' }, { version: '01.3.0' }, { id: '../outside' }, { id: 'safe/other' }, { minAppVersion: 'anything' }, { isDesktopOnly: 'false' }]) assert.throws(() => validateManifest({ ...manifest, ...change }));
  await scratch(async root => {
    await seedProject(root);
    await mkdir(join(root, 'publish/source'), { recursive: true });
    await writeFile(join(root, 'publish/source/sentinel'), 'keep');
    await writeFile(join(root, 'manifest.json'), JSON.stringify({ ...manifest, version: '../outside' }));
    const result = command(packageScript, root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid manifest version/);
    assert.equal(await readFile(join(root, 'publish/source/sentinel'), 'utf8'), 'keep');
  });
});

test('safe files reject symlinks, path traversal and symlink output ancestors', async () => {
  await scratch(async root => {
    await mkdir(join(root, 'outside'));
    await writeFile(join(root, 'outside/file'), 'synthetic external bytes');
    await symlink(join(root, 'outside/file'), join(root, 'input'));
    await symlink(join(root, 'outside'), join(root, 'linked-directory'));
    await assert.rejects(readProjectFile(root, 'input'), /Symlink rejected/);
    await assert.rejects(safePath(root, 'linked-directory/new/file', 'file', true), /Symlink rejected/);
    await assert.rejects(assertSafeTree(root, 'linked-directory'), /Symlink rejected/);
    await assert.rejects(safePath(root, '../outside', 'file', true), /Unsafe relative path/);
    await assert.rejects(safePath(root, '/absolute', 'file', true), /Unsafe relative path/);
  });
});

test('packager rejects allowlisted LICENSE symlink before replacing generated output', async () => {
  await scratch(async root => {
    await seedProject(root);
    await mkdir(join(root, 'publish/source'), { recursive: true });
    await writeFile(join(root, 'publish/source/sentinel'), 'keep');
    await writeFile(join(root, 'synthetic-outside.txt'), 'synthetic external content');
    await symlink(join(root, 'synthetic-outside.txt'), join(root, 'LICENSE'));
    const result = command(packageScript, root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Symlink rejected: LICENSE/);
    assert.equal(await readFile(join(root, 'publish/source/sentinel'), 'utf8'), 'keep');
  });
});

test('packager rejects output ancestor and nested-output symlinks before writing', async () => {
  for (const location of ['publish', 'publish/source/README.md', 'release/0.3.0/main.js']) await scratch(async root => {
    await seedProject(root);
    await mkdir(join(root, 'external'));
    await writeFile(join(root, 'external/sentinel'), 'keep');
    const target = location === 'publish' ? join(root, 'external') : join(root, 'external/sentinel');
    const parts = location.split('/');
    if (parts.length > 1) await mkdir(join(root, ...parts.slice(0, -1)), { recursive: true });
    await symlink(target, join(root, location));
    const result = command(packageScript, root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Symlink rejected/);
    assert.equal(await readFile(join(root, 'external/sentinel'), 'utf8'), 'keep');
  });
});

test('strict ZIP verification accepts generated compressed and stored archives', () => {
  for (const level of [0, 9] as const) {
    const archive = zipSync({ 'folder/one.txt': Buffer.from('synthetic payload'), 'two.txt': Buffer.from('two') }, { level });
    const files = verifyZip(archive, ['folder/one.txt', 'two.txt']);
    assert.equal(Buffer.from(files['folder/one.txt'] ?? []).toString(), 'synthetic payload');
  }
});

test('ZIP verification rejects duplicate raw entries hidden by map decoding', () => {
  const archive = rawZip([{ name: 'one.txt', body: 'hidden first bytes' }, { name: 'one.txt', body: 'reviewed final bytes' }]);
  assert.throws(() => verifyZip(archive, ['one.txt', 'two.txt']), /Duplicate ZIP entry/);
});

test('ZIP verification rejects traversal, absolute, backslash and special-file entries', () => {
  for (const name of ['../private', '/absolute', 'a\\b', 'C:/absolute', 'a//b', 'a/./b', 'directory/']) assert.throws(() => verifyZip(rawZip([{ name, body: 'synthetic' }]), [name]), /Unsafe relative path/);
  assert.throws(() => verifyZip(rawZip([{ name: 'link', body: 'elsewhere', mode: 0o120777 }]), ['link']), /symlink or special-file/);
});

test('ZIP verification rejects local/central name mismatch, hidden payload and trailing data', () => {
  assert.throws(() => verifyZip(rawZip([{ name: 'good.txt', localName: 'evil.txt', body: 'synthetic' }]), ['good.txt']), /name mismatch/);
  const archive = rawZip([{ name: 'one.txt', body: 'synthetic' }]);
  const prefixed = Buffer.concat([Buffer.from('hidden'), archive]);
  const central = prefixed.readUInt32LE(prefixed.length - 6) + 6;
  prefixed.writeUInt32LE(central, prefixed.length - 6);
  prefixed.writeUInt32LE(6, central + 42);
  assert.throws(() => verifyZip(prefixed, ['one.txt']), /Unreferenced data/);
  assert.throws(() => verifyZip(Buffer.concat([archive, Buffer.from('hidden')]), ['one.txt']), /trailing data/);
});

test('ZIP verification enforces CRC and bounded expansion before decompression', () => {
  const archive = rawZip([{ name: 'one.txt', body: 'synthetic' }]);
  assert.throws(() => verifyZip(archive, ['one.txt'], { maxUncompressedBytes: 2 }), /expansion out of bounds/);
  assert.throws(() => verifyZip(archive, ['one.txt'], { maxArchiveBytes: 2 }), /size out of bounds/);
  const corrupted = Buffer.from(archive);
  corrupted[37] = (corrupted[37] ?? 0) ^ 1;
  assert.throws(() => verifyZip(corrupted, ['one.txt']), /data integrity error/);
  assert.throws(() => verifyZip(archive.subarray(0, 10), ['one.txt']), /size out of bounds/);
});

test('checksum object requires exact keys and SHA-256 values', () => {
  const hash = 'a'.repeat(64);
  assertHashKeys({ 'one.txt': hash }, ['one.txt']);
  for (const value of [{}, { 'one.txt': hash, '../other': hash }, { 'one.txt': 'wrong' }, null, []]) assert.throws(() => assertHashKeys(value, ['one.txt']));
});

test('packager and checker accept synthetic clean candidate and reject co-checksummed hidden ZIP entry', async () => {
  await scratch(async root => {
    await seedProject(root);
    const prepared = command(packageScript, root);
    assert.equal(prepared.status, 0, prepared.stderr);
    const checked = command(checkerScript, root);
    assert.equal(checked.status, 0, checked.stderr);
    assert.equal(JSON.parse(checked.stdout).integrityPassed, true);
    const base = join(root, 'release/0.3.0');
    const zipName = 'related-tag-suggestions-0.3.0-source-candidate.zip';
    const zipPath = join(base, zipName);
    const clean = await readFile(zipPath);
    const checksumPath = join(base, 'checksums.json');
    const hashes = JSON.parse(await readFile(checksumPath, 'utf8')) as { assets: Record<string, string>; source: Record<string, string> };
    const originalNames = Object.keys(hashes.source);
    const cleanFiles = verifyZip(clean, originalNames);
    const duplicate = rawZip([{ name: 'README.md', body: 'synthetic hidden first entry' }, ...originalNames.map(name => ({ name, body: Buffer.from(cleanFiles[name] ?? []).toString() }))]);
    await writeFile(zipPath, duplicate);
    hashes.assets[zipName] = createHash('sha256').update(duplicate).digest('hex');
    await writeFile(checksumPath, JSON.stringify(hashes));
    const rejected = command(checkerScript, root);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /Unexpected ZIP entry count|Duplicate ZIP entry/);
  });
});
