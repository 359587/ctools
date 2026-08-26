import { access, cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

if (process.platform !== 'darwin') {
  throw new Error('DMG creation is only supported on macOS');
}

const root = process.cwd();
const appPath = path.join(root, 'out', `CTools-darwin-${process.arch}`, 'CTools.app');
const outputDirectory = path.join(root, 'out', 'make');
const outputPath = path.join(outputDirectory, 'CTools.dmg');
const stagingDirectory = await mkdtemp(path.join(os.tmpdir(), 'ctools-dmg-'));

try {
  await access(appPath);
  await mkdir(outputDirectory, { recursive: true });
  await cp(appPath, path.join(stagingDirectory, 'CTools.app'), {
    recursive: true,
    preserveTimestamps: true,
  });
  await symlink('/Applications', path.join(stagingDirectory, 'Applications'));

  execFileSync(
    '/usr/bin/hdiutil',
    [
      'create',
      '-volname',
      'CTools',
      '-srcfolder',
      stagingDirectory,
      '-ov',
      '-format',
      'ULFO',
      outputPath,
    ],
    { stdio: 'inherit' },
  );
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}
