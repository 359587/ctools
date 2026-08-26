import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { KEYCHAIN_SERVICE } from '../shared/constants';
import { AppError } from '../shared/errors';
import { providerKinds } from '../shared/types';
import type {
  PersistedState,
  ProviderDraft,
  ProviderProfile,
  TestProviderResult,
} from '../shared/types';
import { normalizeBaseUrl } from './codex-config';
import type { NativeHelper } from './native-helper';

const draftSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(providerKinds),
  name: z.string().trim().min(1).max(80),
  baseUrl: z.string().trim().min(1).max(2048),
  apiKey: z.string().max(4096).optional(),
});

const testModelSchema = z.string().trim().min(1).max(160);

export class ProviderService {
  constructor(private readonly helper: NativeHelper) {}

  async save(draftInput: ProviderDraft, state: PersistedState): Promise<ProviderProfile> {
    const draft = draftSchema.parse(draftInput);
    const normalizedUrl = normalizeBaseUrl(draft.baseUrl);
    const existing = draft.id ? state.profiles.find((profile) => profile.id === draft.id) : undefined;
    if (draft.id && !existing) throw new AppError('供应商不存在', 'PROVIDER_NOT_FOUND');
    if (!existing && !draft.apiKey?.trim()) throw new AppError('首次保存必须填写 API Key', 'KEY_REQUIRED');

    const now = new Date().toISOString();
    const secretId = draft.apiKey?.trim() ? randomUUID() : existing!.secretId;
    if (draft.apiKey?.trim()) {
      await this.helper.setSecret(KEYCHAIN_SERVICE, secretId, draft.apiKey.trim());
    }

    return {
      id: existing?.id ?? randomUUID(),
      kind: draft.kind,
      name: draft.name.trim(),
      baseUrl: normalizedUrl,
      secretId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastTestedAt: existing?.lastTestedAt,
      lastTestOk: existing?.lastTestOk,
      lastTestMessage: existing?.lastTestMessage,
      availableModels: existing?.availableModels,
    };
  }

  async test(profile: ProviderProfile, testModelInput: string): Promise<TestProviderResult> {
    const testModel = testModelSchema.parse(testModelInput);
    const key = await this.helper.getSecret(KEYCHAIN_SERVICE, profile.secretId);
    return testEndpoint(profile.baseUrl, testModel, key);
  }

  async testDraft(
    draftInput: ProviderDraft,
    state: PersistedState,
    testModelInput: string,
  ): Promise<TestProviderResult> {
    const draft = draftSchema.parse(draftInput);
    const testModel = testModelSchema.parse(testModelInput);
    const existing = draft.id ? state.profiles.find((profile) => profile.id === draft.id) : undefined;
    const key = draft.apiKey?.trim()
      ? draft.apiKey.trim()
      : existing
        ? await this.helper.getSecret(KEYCHAIN_SERVICE, existing.secretId)
        : '';
    if (!key) throw new AppError('请先填写 API Key', 'KEY_REQUIRED');
    return testEndpoint(normalizeBaseUrl(draft.baseUrl), testModel, key);
  }
}

async function testEndpoint(baseUrl: string, model: string, apiKey: string): Promise<TestProviderResult> {
  const startedAt = performance.now();
  let availableModels: string[] | undefined;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const modelsResponse = await fetch(endpoint(baseUrl, 'models'), {
      headers,
      signal: AbortSignal.timeout(12_000),
    });
    if ([401, 403].includes(modelsResponse.status)) {
      return failure(startedAt, `鉴权失败（HTTP ${modelsResponse.status}）`);
    }
    if (modelsResponse.ok) {
      availableModels = await readAvailableModels(modelsResponse);
    }

    const response = await fetch(endpoint(baseUrl, 'responses'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        input: 'Reply with OK.',
        max_output_tokens: 16,
        store: false,
        stream: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) {
      return success(startedAt, `连接成功，测试模型 ${model} 可用`, availableModels);
    }
    return failure(
      startedAt,
      `测试模型 ${model} 请求失败（HTTP ${response.status}）`,
      availableModels,
    );
  } catch (error) {
    const message = error instanceof Error && error.name === 'TimeoutError' ? '连接超时' : '无法连接到 API';
    return failure(startedAt, message, availableModels);
  }
}

async function readAvailableModels(response: Response): Promise<string[] | undefined> {
  const body = await response.json().catch(() => undefined) as { data?: unknown } | undefined;
  if (!Array.isArray(body?.data)) return undefined;
  const models = body.data
    .map((item) => item && typeof item === 'object' && 'id' in item ? (item as { id?: unknown }).id : undefined)
    .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    .map((id) => id.trim());
  return models.length ? [...new Set(models)].sort() : undefined;
}

function endpoint(baseUrl: string, segment: string): string {
  return new URL(segment, `${baseUrl.replace(/\/$/, '')}/`).toString();
}

function success(
  startedAt: number,
  message: string,
  availableModels?: string[],
): TestProviderResult {
  return { ok: true, message, latencyMs: Math.round(performance.now() - startedAt), availableModels };
}

function failure(
  startedAt: number,
  message: string,
  availableModels?: string[],
): TestProviderResult {
  return { ok: false, message, latencyMs: Math.round(performance.now() - startedAt), availableModels };
}
