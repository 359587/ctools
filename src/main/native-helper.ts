import { access, chmod, copyFile, mkdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CODEX_BUNDLE_IDENTIFIER } from '../shared/constants';
import { AppError } from '../shared/errors';
import type { RuntimePaths } from './runtime-paths';
import { runProcess } from './process-runner';

async function sha256(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

export class NativeHelper {
  constructor(private readonly paths: RuntimePaths) {}

  async install(): Promise<void> {
    await access(this.paths.bundledHelper, constants.X_OK);
    await mkdir(path.dirname(this.paths.installedHelper), { recursive: true });

    let shouldCopy = true;
    try {
      shouldCopy = (await sha256(this.paths.bundledHelper)) !== (await sha256(this.paths.installedHelper));
    } catch {
      shouldCopy = true;
    }

    if (shouldCopy) {
      await copyFile(this.paths.bundledHelper, this.paths.installedHelper);
    }
    await chmod(this.paths.installedHelper, 0o755);
  }

  async setSecret(service: string, account: string, secret: string): Promise<void> {
    const result = await runProcess(
      this.paths.installedHelper,
      ['keychain-set', service, account],
      { input: secret, timeoutMs: 15_000 },
    );
    this.assertSuccess(result.exitCode, result.stderr, '无法写入 macOS 钥匙串');
  }

  async getSecret(service: string, account: string): Promise<string> {
    const result = await runProcess(
      this.paths.installedHelper,
      ['keychain-get', service, account],
      { timeoutMs: 15_000 },
    );
    this.assertSuccess(result.exitCode, result.stderr, '无法读取 macOS 钥匙串');
    return result.stdout;
  }

  async isCodexRunning(): Promise<boolean> {
    const result = await runProcess(
      this.paths.installedHelper,
      ['app-status', CODEX_BUNDLE_IDENTIFIER],
      { timeoutMs: 5_000 },
    );
    this.assertSuccess(result.exitCode, result.stderr, '无法检测 Codex 运行状态');
    return result.stdout.trim() === 'running';
  }

  async terminateCodex(): Promise<void> {
    const result = await runProcess(
      this.paths.installedHelper,
      ['app-terminate', CODEX_BUNDLE_IDENTIFIER],
      { timeoutMs: 15_000 },
    );
    this.assertSuccess(result.exitCode, result.stderr, 'Codex 未能正常退出，配置没有被修改');
  }

  async launchCodex(): Promise<void> {
    const result = await runProcess('/usr/bin/open', ['-b', CODEX_BUNDLE_IDENTIFIER], {
      timeoutMs: 10_000,
    });
    this.assertSuccess(result.exitCode, result.stderr, '无法重新启动 Codex');
  }

  get executablePath(): string {
    return this.paths.installedHelper;
  }

  private assertSuccess(exitCode: number, stderr: string, message: string): void {
    if (exitCode !== 0) {
      throw new AppError(`${message}：${stderr.trim() || `退出码 ${exitCode}`}`, 'NATIVE_HELPER');
    }
  }
}
