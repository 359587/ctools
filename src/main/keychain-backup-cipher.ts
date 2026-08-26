import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError, errorMessage } from '../shared/errors';
import type { BackupCipher } from './backup-service';
import type { NativeHelper } from './native-helper';

const SERVICE = 'com.ray.ctools.backup';
const ACCOUNT = 'master-key-v1';
const MAGIC = Buffer.from('CTB1', 'ascii');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

type KeychainAccess = Pick<NativeHelper, 'getSecret' | 'setSecret'>;

/** Encrypts snapshots with an app-specific key that never leaves macOS Keychain. */
export class KeychainBackupCipher implements BackupCipher {
  private keyPromise?: Promise<Buffer>;

  constructor(private readonly keychain: KeychainAccess) {}

  isAvailable(): boolean {
    return process.platform === 'darwin';
  }

  async encrypt(plaintext: string): Promise<Buffer> {
    const key = await this.getKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(MAGIC);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
  }

  async decrypt(payload: Buffer): Promise<string> {
    const minimumLength = MAGIC.length + IV_BYTES + TAG_BYTES;
    if (payload.length < minimumLength || !payload.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new AppError('备份格式无效，未覆盖当前配置', 'BACKUP_FORMAT');
    }

    try {
      const key = await this.getKey();
      const ivStart = MAGIC.length;
      const tagStart = ivStart + IV_BYTES;
      const dataStart = tagStart + TAG_BYTES;
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        payload.subarray(ivStart, tagStart),
      );
      decipher.setAAD(MAGIC);
      decipher.setAuthTag(payload.subarray(tagStart, dataStart));
      return Buffer.concat([
        decipher.update(payload.subarray(dataStart)),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('备份解密或认证失败，未覆盖当前配置', 'BACKUP_DECRYPT', error);
    }
  }

  private getKey(): Promise<Buffer> {
    this.keyPromise ??= this.loadOrCreateKey();
    return this.keyPromise;
  }

  private async loadOrCreateKey(): Promise<Buffer> {
    let encoded: string;
    try {
      encoded = await this.keychain.getSecret(SERVICE, ACCOUNT);
    } catch (error) {
      if (!errorMessage(error).includes('Keychain error -25300')) {
        throw new AppError('无法读取备份主密钥，已阻止修改 Codex 配置', 'BACKUP_KEY', error);
      }
      encoded = randomBytes(KEY_BYTES).toString('base64');
      await this.keychain.setSecret(SERVICE, ACCOUNT, encoded);
    }

    const key = Buffer.from(encoded, 'base64');
    if (key.length !== KEY_BYTES || key.toString('base64') !== encoded) {
      throw new AppError('备份主密钥格式无效，已阻止修改 Codex 配置', 'BACKUP_KEY_INVALID');
    }
    return key;
  }
}
