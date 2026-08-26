import { access, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const extract = require('extract-zip');
const run = promisify(execFile);
const temporaryPrefix = path.join(os.tmpdir(), 'ctools-extract-zip-test-');
const root = await mkdtemp(temporaryPrefix);
const source = path.join(root, 'source');
const maliciousTarget = path.join(root, 'extract-malicious');
const normalTarget = path.join(root, 'extract-normal');
const maliciousZip = path.join(root, 'malicious.zip');
const normalZip = path.join(root, 'normal.zip');

try {
  await Promise.all([
    mkdir(path.join(source, 'nested'), { recursive: true }),
    mkdir(path.join(root, 'outside'), { recursive: true }),
    mkdir(maliciousTarget, { recursive: true }),
    mkdir(normalTarget, { recursive: true }),
  ]);
  await symlink('../../outside', path.join(source, 'nested', 'escape'));
  await writeFile(path.join(source, 'normal.txt'), 'safe fixture\n');

  await run('/usr/bin/zip', ['-qy', maliciousZip, 'nested/escape'], { cwd: source });
  await run('/usr/bin/zip', ['-q', normalZip, 'normal.txt'], { cwd: source });

  let maliciousSymlinkBlocked = false;
  try {
    await extract(maliciousZip, { dir: maliciousTarget });
  } catch (error) {
    maliciousSymlinkBlocked =
      error instanceof Error && error.message.includes('Out of bound symlink');
  }
  if (!maliciousSymlinkBlocked) {
    throw new Error('Patched extract-zip accepted a symlink outside the extraction root');
  }

  await extract(normalZip, { dir: normalTarget });
  await access(path.join(normalTarget, 'normal.txt'));
  console.log('extract-zip patch verified');
} finally {
  if (root.startsWith(temporaryPrefix)) {
    await rm(root, { recursive: true, force: true });
  }
}
