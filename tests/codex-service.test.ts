import { describe, expect, it } from 'vitest';
import { assertDoctorConfiguration } from '../src/main/codex-service';
import type { ProcessResult } from '../src/main/process-runner';

function doctorResult(
  checks: Record<string, { status: string; summary: string }>,
  exitCode = 1,
): ProcessResult {
  return {
    stdout: JSON.stringify({ overallStatus: exitCode === 0 ? 'ok' : 'fail', checks }),
    stderr: '',
    exitCode,
  };
}

describe('Codex configuration doctor evaluation', () => {
  it('accepts valid config and auth when an unrelated terminal check fails', () => {
    expect(() => assertDoctorConfiguration(doctorResult({
      'config.load': { status: 'ok', summary: 'config loaded' },
      'auth.credentials': { status: 'ok', summary: 'ChatGPT credentials are available' },
      'terminal.env': { status: 'fail', summary: 'TERM=dumb' },
    }))).not.toThrow();
  });

  it('rejects an invalid Codex configuration even when other checks pass', () => {
    expect(() => assertDoctorConfiguration(doctorResult({
      'config.load': { status: 'fail', summary: 'config could not be loaded' },
      'auth.credentials': { status: 'ok', summary: 'credentials are available' },
    }))).toThrow(/config could not be loaded/);
  });

  it('rejects missing login credentials', () => {
    expect(() => assertDoctorConfiguration(doctorResult({
      'config.load': { status: 'ok', summary: 'config loaded' },
      'auth.credentials': { status: 'fail', summary: 'login required' },
    }))).toThrow(/login required/);
  });

  it('fails closed when a failed doctor response is not valid JSON', () => {
    expect(() => assertDoctorConfiguration({
      stdout: 'unexpected doctor failure',
      stderr: '',
      exitCode: 1,
    })).toThrow(/unexpected doctor failure/);
  });
});
