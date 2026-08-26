import { mkdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const source = path.join(root, 'native', 'ctools-macos-helper.swift');
const outputDirectory = path.join(root, 'resources', 'bin');
const output = path.join(outputDirectory, 'ctools-macos-helper');

await mkdir(outputDirectory, { recursive: true });

let needsBuild = true;
try {
  const [sourceStat, outputStat] = await Promise.all([stat(source), stat(output)]);
  needsBuild = sourceStat.mtimeMs > outputStat.mtimeMs;
} catch {
  needsBuild = true;
}

if (!needsBuild) {
  process.exit(0);
}

await new Promise((resolve, reject) => {
  const child = spawn(
    'xcrun',
    [
      'swiftc',
      source,
      '-O',
      '-framework',
      'Security',
      '-framework',
      'AppKit',
      '-o',
      output,
    ],
    { stdio: 'inherit' },
  );

  child.once('error', reject);
  child.once('exit', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`swiftc exited with code ${code ?? 'unknown'}`));
  });
});
