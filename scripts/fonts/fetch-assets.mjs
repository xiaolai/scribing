#!/usr/bin/env node
// Explicit maintenance operation. Normal tests never fetch or repair assets.
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
if (!process.argv.includes('--download'))
  throw new Error(
    'Maintenance download requires --download. Offline verification: node scripts/fonts/check-assets.mjs',
  );
const lock = JSON.parse(await readFile(resolve(root, 'fonts/assets.lock.json'), 'utf8'));
for (const entry of [...lock.fonts, ...lock.notices, ...lock.unicode]) {
  const target = resolve(root, entry.file);
  if (!target.startsWith(resolve(root, 'fonts') + '/'))
    throw new Error('Unsafe asset path');
  let bytes;
  try {
    bytes = await readFile(target);
  } catch {
    // Absent locally: fall through and download it below.
  }
  const digest = (data) => createHash('sha256').update(data).digest('hex');
  if (bytes && digest(bytes) === entry.sha256) continue;
  if (!entry.source.url.startsWith('https://'))
    throw new Error('Asset source must be HTTPS');
  const response = await fetch(entry.source.url);
  if (!response.ok)
    throw new Error(`Download failed: ${response.status} ${entry.source.url}`);
  bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== entry.sha256 || bytes.length !== entry.sizeBytes)
    throw new Error(`Pinned asset mismatch: ${entry.file}`);
  await mkdir(dirname(target), { recursive: true });
  const temporary = target + '.download';
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`Restored ${entry.file}`);
}
console.log('Pinned font assets are present.');
