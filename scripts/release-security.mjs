import { constants } from 'node:fs';
import { lstat, open, realpath, readdir } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { unzipSync } from 'fflate';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function validateManifest(value) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Invalid manifest object');
  assert(typeof value.version === 'string' && versionPattern.test(value.version), 'Invalid manifest version');
  assert(typeof value.minAppVersion === 'string' && versionPattern.test(value.minAppVersion), 'Invalid minimum app version');
  assert(typeof value.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id) && !value.id.includes('obsidian') && !value.id.endsWith('plugin'), 'Invalid manifest ID');
  for (const key of ['name', 'author']) assert(typeof value[key] === 'string' && value[key].trim().length > 0, `Invalid manifest ${key}`);
  assert(typeof value.description === 'string' && value.description.length <= 250 && value.description.endsWith('.'), 'Invalid manifest description');
  assert(typeof value.isDesktopOnly === 'boolean', 'Invalid desktop-only flag');
}

function validateRelativePath(path) {
  assert(typeof path === 'string' && path.length > 0 && !/[\\:\u0000-\u001f\u007f]/.test(path), 'Unsafe relative path');
  assert(path.split('/').every(part => part.length > 0 && part !== '.' && part !== '..'), 'Unsafe relative path');
}

export async function projectRoot() {
  // Anchor to the physical project directory; OS aliases such as /tmp are not project inputs.
  return realpath(process.cwd());
}

export async function safePath(root, path, kind = 'any', allowMissing = false) {
  validateRelativePath(path);
  const target = resolve(root, path);
  assert(target.startsWith(root + sep), 'Path escapes project root');
  const parts = path.split('/');
  let current = root;
  assert((await lstat(root)).isDirectory(), 'Project root must be a directory');
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]);
    let stat;
    try { stat = await lstat(current); }
    catch (error) {
      if (allowMissing && error.code === 'ENOENT') return target;
      throw error;
    }
    assert(!stat.isSymbolicLink(), `Symlink rejected: ${path}`);
    if (index < parts.length - 1 || kind === 'directory') assert(stat.isDirectory(), `Expected directory: ${path}`);
    else if (kind === 'file') assert(stat.isFile(), `Expected regular file: ${path}`);
    else assert(stat.isFile() || stat.isDirectory(), `Special file rejected: ${path}`);
  }
  return target;
}

export async function hasProjectFile(root, path) {
  try { await safePath(root, path, 'file'); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function readProjectFile(root, path) {
  const target = await safePath(root, path, 'file');
  // Reject final-component links again at open time; ancestor checks address accidental links.
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    assert((await file.stat()).isFile(), `Expected regular file: ${path}`);
    return await file.readFile();
  } finally { await file.close(); }
}

export async function listProjectFiles(root, directory) {
  const files = [];
  async function visit(path, prefix) {
    const target = await safePath(root, path, 'directory');
    for (const entry of await readdir(target, { withFileTypes: true })) {
      const relative = `${path}/${entry.name}`;
      await safePath(root, relative);
      if (entry.isDirectory()) await visit(relative, `${prefix}${entry.name}/`);
      else files.push(`${prefix}${entry.name}`);
    }
  }
  await visit(directory, '');
  return files.sort();
}

export async function assertSafeTree(root, directory) {
  await safePath(root, directory, 'directory', true);
  try { await listProjectFiles(root, directory); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export function assertHashKeys(value, expectedNames) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Invalid checksum object');
  const expected = [...expectedNames].sort();
  assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected), 'Unexpected or missing checksum keys');
  for (const name of expected) assert(typeof value[name] === 'string' && /^[a-f0-9]{64}$/.test(value[name]), `Invalid checksum: ${name}`);
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
const crc32 = bytes => {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
};

export function verifyZip(bytes, expectedNames, limits = {}) {
  const maxArchiveBytes = limits.maxArchiveBytes ?? 16 * 1024 * 1024;
  const maxUncompressedBytes = limits.maxUncompressedBytes ?? 32 * 1024 * 1024;
  assert(bytes.length >= 22 && bytes.length <= maxArchiveBytes, 'ZIP size out of bounds');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = offset => view.getUint16(offset, true);
  const u32 = offset => view.getUint32(offset, true);
  const end = bytes.length - 22;
  assert(u32(end) === 0x06054b50 && u16(end + 20) === 0, 'ZIP comment, trailing data or missing end record');
  assert(u16(end + 4) === 0 && u16(end + 6) === 0 && u16(end + 8) === u16(end + 10), 'Multi-disk ZIP rejected');
  const count = u16(end + 10);
  const centralOffset = u32(end + 16);
  const centralSize = u32(end + 12);
  const expected = new Set(expectedNames);
  assert(count !== 0xffff && count > 0 && count === expected.size && count <= 500, 'Unexpected ZIP entry count');
  assert(centralOffset + centralSize === end, 'Invalid central directory bounds');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries = new Map();
  let cursor = centralOffset;
  let nextLocal = 0;
  let totalSize = 0;
  for (let index = 0; index < count; index++) {
    assert(cursor + 46 <= end && u32(cursor) === 0x02014b50, 'Invalid ZIP central entry');
    const flags = u16(cursor + 8);
    const method = u16(cursor + 10);
    const checksum = u32(cursor + 16);
    const compressed = u32(cursor + 20);
    const size = u32(cursor + 24);
    const nameLength = u16(cursor + 28);
    const extraLength = u16(cursor + 30);
    const commentLength = u16(cursor + 32);
    const mode = (u32(cursor + 38) >>> 16) & 0xf000;
    const local = u32(cursor + 42);
    assert((flags & ~0x800) === 0 && (method === 0 || method === 8), 'Unsupported or encrypted ZIP entry');
    assert(extraLength === 0 && commentLength === 0 && u16(cursor + 34) === 0, 'ZIP extra metadata or entry comment rejected');
    assert(mode === 0 || mode === 0x8000, 'ZIP symlink or special-file entry rejected');
    assert(cursor + 46 + nameLength <= end, 'Invalid ZIP name bounds');
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    validateRelativePath(name);
    assert(!entries.has(name), `Duplicate ZIP entry: ${name}`);
    assert(expected.has(name), `Unexpected ZIP entry: ${name}`);
    totalSize += size;
    assert(size !== 0xffffffff && compressed !== 0xffffffff && totalSize <= maxUncompressedBytes, 'ZIP expansion out of bounds');
    assert(local === nextLocal && local + 30 <= centralOffset && u32(local) === 0x04034b50, 'Unreferenced data or invalid ZIP local entry');
    assert(u16(local + 6) === flags && u16(local + 8) === method && u32(local + 14) === checksum && u32(local + 18) === compressed && u32(local + 22) === size, 'ZIP local/central metadata mismatch');
    assert(u16(local + 26) === nameLength && u16(local + 28) === 0, 'ZIP local extra metadata or name mismatch');
    const dataStart = local + 30 + nameLength;
    assert(dataStart + compressed <= centralOffset, 'ZIP compressed data out of bounds');
    assert(decoder.decode(bytes.subarray(local + 30, dataStart)) === name, 'ZIP local/central name mismatch');
    entries.set(name, { size, checksum });
    nextLocal = dataStart + compressed;
    cursor += 46 + nameLength;
  }
  assert(cursor === end && nextLocal === centralOffset, 'Unreviewed ZIP data or invalid directory length');
  const files = unzipSync(bytes);
  assert(Object.keys(files).length === expected.size, 'ZIP decoded entry mismatch');
  for (const [name, entry] of entries) assert(files[name]?.length === entry.size && crc32(files[name]) === entry.checksum, `ZIP data integrity error: ${name}`);
  return files;
}
