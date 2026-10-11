import { readFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
const vault = resolve(process.argv[2] ?? '.test-vault');
if (basename(vault) !== '.test-vault') throw new Error('Only the isolated .test-vault is accepted.');
const expectedTags = (process.argv[3] ?? 'preserve,music,work,drum,music/guitar').split(',');
const originals = JSON.parse(await readFile('evidence/fixture-original.json', 'utf8'));
const target = 'Music drum practice.md';
const actual = await readFile(join(vault, target), 'utf8');
const body = value => value.split('\n---\n').slice(1).join('\n---\n');
const tags = actual.match(/^tags:\n((?:  - .*\n)+)/m)?.[1].trim().split('\n').map(line => line.trim().slice(2)) ?? [];
const otherNotes = await Promise.all(Object.entries(originals).filter(([name]) => name !== target).map(async ([name, value]) => ({ name, identical: await readFile(join(vault, name), 'utf8') === value })));
const report = {
  vault, tags, expectedTags,
  tagsMatch: JSON.stringify(tags) === JSON.stringify(expectedTags),
  uniqueTags: new Set(tags.map(tag => tag.replace(/^#/, '').toLowerCase())).size === tags.length,
  originalTagRetained: tags.includes('preserve'),
  markerRetained: actual.includes('trial_marker: preserve-20261010\n'),
  aliasesRetained: actual.includes('aliases:\n  - unchanged-alias\n'),
  bodyIdentical: body(actual) === body(originals[target]),
  bodySha256: createHash('sha256').update(body(actual)).digest('hex'),
  otherNotes,
};
console.log(JSON.stringify(report, null, 2));
if (!report.tagsMatch || !report.uniqueTags || !report.originalTagRetained || !report.markerRetained || !report.aliasesRetained || !report.bodyIdentical || otherNotes.some(note => !note.identical)) process.exitCode = 1;
