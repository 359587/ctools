import { describe, expect, it } from 'vitest';
import { KeychainBackupCipher } from '../src/main/keychain-backup-cipher';

class MemoryKeychain {
  private readonly values = new Map<string, string>();

  async getSecret(service: string, account: string): Promise<string> {
    const value = this.values.get(`${service}:${account}`);
    if (!value) throw new Error('Keychain error -25300: item not found');
    return value;
  }

  async setSecret(service: string, account: string, secret: string): Promise<void> {
    this.values.set(`${service}:${account}`, secret);
  }
}

describe('KeychainBackupCipher', () => {
  it('creates one Keychain key and decrypts an authenticated snapshot', async () => {
    const keychain = new MemoryKeychain();
    const cipher = new KeychainBackupCipher(keychain);
    const encrypted = await cipher.encrypt('model = "safe"\n');

    expect(encrypted.toString('utf8')).not.toContain('model = "safe"');
    expect(await cipher.decrypt(encrypted)).toBe('model = "safe"\n');
  });

  it('rejects a modified snapshot', async () => {
    const cipher = new KeychainBackupCipher(new MemoryKeychain());
    const encrypted = await cipher.encrypt('original');
    encrypted[encrypted.length - 1] ^= 0xff;

    await expect(cipher.decrypt(encrypted)).rejects.toThrow(/解密|认证/);
  });
});
