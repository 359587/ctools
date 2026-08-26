import { describe, expect, it } from 'vitest';
import {
  applyLoginConfig,
  applyProviderConfig,
  captureLoginBaseline,
  normalizeBaseUrl,
  parseCodexConfig,
} from '../src/main/codex-config';
import type { ProviderProfile } from '../src/shared/types';

const profile: ProviderProfile = {
  id: 'fe6f3a19-4211-41f2-af80-62f249bc6330',
  kind: 'sub2api',
  name: '公司 Sub2API',
  baseUrl: 'https://gateway.example.com/v1/',
  secretId: '79d5920a-0a15-4cc4-b199-079dd3a3c34b',
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
};

const original = `# User settings stay intact
model = "gpt-5.5" # keep this comment
notify = ["terminal-notifier"]

[model_providers.OpenAI]
name = "Existing provider"
base_url = "https://existing.example/v1"
wire_api = "responses"
requires_openai_auth = true

[features]
memories = true
`;

describe('Codex config patching', () => {
  it('adds a managed provider without rewriting unrelated sections', () => {
    const next = applyProviderConfig(original, profile, 'gpt-5.6-sol', '/tmp/ctools-helper');

    expect(next).toContain('model_provider = "ctools_active"');
    expect(next).toContain('model = "gpt-5.6-sol" # keep this comment');
    expect(next).toContain('[model_providers.OpenAI]');
    expect(next).toContain('base_url = "https://existing.example/v1"');
    expect(next).toContain('[model_providers.ctools_active.auth]');
    expect(next).toContain('/tmp/ctools-helper');
    expect(parseCodexConfig(next)).toEqual({
      mode: 'api',
      model: 'gpt-5.6-sol',
      modelProvider: 'ctools_active',
    });
  });

  it('restores login keys and removes only the managed block', () => {
    const baseline = captureLoginBaseline(original);
    const apiConfig = applyProviderConfig(original, profile, 'gpt-5.6-sol', '/tmp/ctools-helper');
    const restored = applyLoginConfig(apiConfig, baseline);

    expect(restored).not.toContain('ctools_active');
    expect(restored).toContain('model = "gpt-5.5" # keep this comment');
    expect(restored).toContain('[model_providers.OpenAI]');
    expect(parseCodexConfig(restored)).toEqual({
      mode: 'login',
      model: 'gpt-5.5',
      modelProvider: undefined,
    });
  });

  it('refuses to overwrite an unmanaged provider with the reserved CTools id', () => {
    expect(() =>
      applyProviderConfig(
        `${original}\n[model_providers.ctools_active]\nname = "Mine"\n`,
        profile,
        'gpt-5.6-sol',
        '/tmp/helper',
      ),
    ).toThrow(/已存在/);
  });

  it('allows local HTTP and requires HTTPS for remote endpoints', () => {
    expect(normalizeBaseUrl('http://127.0.0.1:8317/v1/')).toBe('http://127.0.0.1:8317/v1');
    expect(() => normalizeBaseUrl('http://api.example.com/v1')).toThrow(/HTTPS/);
  });
});
