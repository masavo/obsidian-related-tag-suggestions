import { readdir } from 'node:fs/promises';
import { safePath, hasProjectFile } from './release-security.mjs';

// Explicit publication allowlist. Never publish the working directory wholesale.
export const SOURCE_ROOT_FILES = ['styles.css', 'README.md', 'manifest.json', 'versions.json', 'package.json', 'package-lock.json', 'tsconfig.json', 'eslint.config.mjs', '.gitignore'];
export const SOURCE_DIRECTORIES = ['src', 'tests'];
export const SOURCE_SCRIPTS = ['build.mjs', 'fixture.mjs', 'check-saved-fixture.mjs', 'benchmark.mjs', 'package-release.mjs', 'check-release.mjs', 'release-files.mjs', 'release-security.mjs', 'release-security.d.mts'];
export const forbiddenPublicText = /\/Users\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\/;

export async function sourceFiles(root) {
  const files = [...SOURCE_ROOT_FILES, ...SOURCE_SCRIPTS.map(name => `scripts/${name}`)];
  for (const directory of SOURCE_DIRECTORIES) {
    const target = await safePath(root, directory, 'directory');
    for (const name of await readdir(target)) if (name.endsWith('.ts')) files.push(`${directory}/${name}`);
  }
  if (await hasProjectFile(root, 'LICENSE')) files.push('LICENSE');
  for (const path of files) await safePath(root, path, 'file');
  return files.sort();
}
