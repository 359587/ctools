import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BackupService, type BackupCipher } from '../src/main/backup-service';

class ReversingCipher implements BackupCipher {
  isAvailable() { return true; }
  encrypt(value: string) { return Buffer.from([...value].reverse().join(''), 'utf8'); }
  decrypt(value: Buffer) { return [...value.toString('utf8')].reverse().join(''); }
}

describe('BackupService', () => {
  it('stores encrypted bytes and restores the exact original config', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ctools-backup-'));
    const configPath = path.join(root, '.codex', 'config.toml');
    const backupsPath = path.join(root, 'backups');
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, 'model = "login-model"\n', { mode: 0o640 });
    const service = new BackupService(configPath, backupsPath, new ReversingCipher());

    const backup = await service.create('test', 'login');
    const ciphertext = await readFile(path.join(backupsPath, backup.fileName), 'utf8');
    expect(ciphertext).not.toContain('login-model');

    await writeFile(configPath, 'model = "broken"\n');
    await service.restore(backup);
    expect(await readFile(configPath, 'utf8')).toBe('model = "login-model"\n');
  });

  it('refuses a corrupted backup without touching current config', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ctools-corrupt-'));
    const configPath = path.join(root, 'config.toml');
    const backupsPath = path.join(root, 'backups');
    await writeFile(configPath, 'model = "good"\n');
    const service = new BackupService(configPath, backupsPath, new ReversingCipher());
    const backup = await service.create('test', 'login');
    await writeFile(path.join(backupsPath, backup.fileName), 'corrupted');
    await writeFile(configPath, 'model = "current"\n');

    await expect(service.restore(backup)).rejects.toThrow(/完整性/);
    expect(await readFile(configPath, 'utf8')).toBe('model = "current"\n');
  });
});
