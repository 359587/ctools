import { chmod, mkdir, open, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export async function atomicWriteFile(
  targetPath: string,
  data: string | Uint8Array,
  mode = 0o600,
): Promise<void> {
  const directory = path.dirname(targetPath);
  await mkdir(directory, { recursive: true });

  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  const handle = await open(temporaryPath, 'wx', mode);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await chmod(temporaryPath, mode);
    await rename(temporaryPath, targetPath);
    const directoryHandle = await open(directory, 'r');
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
