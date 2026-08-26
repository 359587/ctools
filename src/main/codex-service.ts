import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { AppError } from '../shared/errors';
import type { NativeHelper } from './native-helper';
import { runProcess, type ProcessResult } from './process-runner';

const candidateBinaries = [
  process.env.CODEX_CLI_PATH,
  '/Applications/ChatGPT.app/Contents/Resources/codex',
  '/opt/homebrew/bin/codex',
  '/usr/local/bin/codex',
].filter((value): value is string => Boolean(value));

export class CodexService {
  private binary?: string;

  constructor(private readonly helper: NativeHelper) {}

  async initialize(): Promise<void> {
    for (const candidate of candidateBinaries) {
      try {
        await access(candidate, constants.X_OK);
        this.binary = candidate;
        return;
      } catch {
        // Try the next known location.
      }
    }
  }

  get doctorAvailable(): boolean {
    return Boolean(this.binary);
  }

  async loginStatus(): Promise<string> {
    if (!this.binary) return '未找到 Codex CLI';
    try {
      const result = await runProcess(this.binary, ['login', 'status'], { timeoutMs: 12_000 });
      return sanitize(result.stdout.trim() || result.stderr.trim() || '状态未知');
    } catch {
      return '无法读取登录状态';
    }
  }

  async validateConfiguration(): Promise<void> {
    if (!this.binary) {
      throw new AppError('未找到 Codex 内置诊断工具，已自动还原原配置', 'CODEX_DOCTOR_MISSING');
    }
    const configuredTerm = process.env.TERM?.trim();
    const result = await runProcess(this.binary, ['--strict-config', 'doctor', '--json'], {
      timeoutMs: 45_000,
      env: {
        ...process.env,
        TERM: configuredTerm && configuredTerm !== 'dumb' ? configuredTerm : 'xterm-256color',
      },
    });
    assertDoctorConfiguration(result);
  }

  async isRunning(): Promise<boolean> {
    return this.helper.isCodexRunning();
  }

  async stop(): Promise<void> {
    await this.helper.terminateCodex();
  }

  async launch(): Promise<void> {
    await this.helper.launchCodex();
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.launch();
  }
}

interface DoctorCheck {
  status?: string;
  summary?: string;
}

interface DoctorReport {
  checks?: Record<string, DoctorCheck>;
}

const configurationCheckIds = ['config.load', 'auth.credentials'] as const;

export function assertDoctorConfiguration(result: ProcessResult): void {
  const raw = result.stdout.trim() || result.stderr.trim();
  let report: DoctorReport | undefined;
  try {
    report = JSON.parse(raw) as DoctorReport;
  } catch {
    if (result.exitCode === 0) return;
    throw doctorFailure(raw || `退出码 ${result.exitCode}`);
  }

  const relevantFailures = configurationCheckIds.flatMap((id) => {
    const check = report?.checks?.[id];
    return check?.status && check.status !== 'ok'
      ? [`${id}: ${check.summary ?? check.status}`]
      : [];
  });
  if (relevantFailures.length > 0) {
    throw doctorFailure(relevantFailures.join('；'));
  }

  if (report?.checks?.['config.load']?.status === 'ok') return;
  if (result.exitCode === 0) return;
  throw doctorFailure(raw || `退出码 ${result.exitCode}`);
}

function doctorFailure(details: string): AppError {
  return new AppError(
    `Codex 配置诊断失败：${sanitize(details).slice(0, 500)}`,
    'CODEX_DOCTOR_FAILED',
  );
}

function sanitize(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]');
}
