import { createHash, randomUUID } from 'node:crypto';
import { chmod, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { AppMode, BackupRecord } from '../shared/types';
import { AppError } from '../shared/errors';
import { atomicWriteFile } from './atomic-file';

export interface BackupCipher {
  isAvailable(): boolean;
  encrypt(plaintext: string): Buffer | Promise<Buffer>;
  decrypt(ciphertext: Buffer): string | Promise<string>;
}

export class BackupService {
  constructor(
    private readonly configPath: string,
    private readonly backupsDirectory: string,
    private readonly cipher: BackupCipher,
  ) {}

  async create(
    reason: string,
    mode: AppMode,
    activeProviderId?: string,
  ): Promise<BackupRecord> {
    if (!this.cipher.isAvailable()) {
      throw new AppError('macOS 安全存储不可用，已阻止修改 Codex 配置', 'ENCRYPTION_UNAVAILABLE');
    }

    let plaintext = '';
    let configExisted = true;
    let configMode: number | undefined;
    try {
      const [content, fileStat] = await Promise.all([
        readFile(this.configPath, 'utf8'),
        stat(this.configPath),
      ]);
      plaintext = content;
      configMode = fileStat.mode & 0o777;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      configExisted = false;
    }

    const id = randomUUID();
    const fileName = `${id}.ctbackup`;
    const encrypted = await this.cipher.encrypt(plaintext);
    await atomicWriteFile(path.join(this.backupsDirectory, fileName), encrypted);

    return {
      id,
      createdAt: new Date().toISOString(),
      reason,
      fileName,
      plaintextSha256: digest(plaintext),
      configExisted,
      configMode,
      mode,
      activeProviderId,
    };
  }

  async restore(record: BackupRecord): Promise<void> {
    const encrypted = await readFile(path.join(this.backupsDirectory, record.fileName));
    const plaintext = await this.cipher.decrypt(encrypted);
    if (digest(plaintext) !== record.plaintextSha256) {
      throw new AppError('备份完整性校验失败，未覆盖当前配置', 'BACKUP_CORRUPT');
    }

    if (!record.configExisted) {
      await rm(this.configPath, { force: true });
      return;
    }

    await atomicWriteFile(this.configPath, plaintext, record.configMode ?? 0o600);
    await chmod(this.configPath, record.configMode ?? 0o600);
  }

  async readCurrentConfig(): Promise<string> {
    try {
      return await readFile(this.configPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
      throw error;
    }
  }

  async remove(record: BackupRecord): Promise<void> {
    await rm(path.join(this.backupsDirectory, record.fileName), { force: true });
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export class PassThroughBackupCipher implements BackupCipher {
  isAvailable(): boolean {
    return true;
  }

  encrypt(plaintext: string): Buffer {
    return Buffer.from(plaintext, 'utf8');
  }

  decrypt(ciphertext: Buffer): string {
    return ciphertext.toString('utf8');
  }
}
