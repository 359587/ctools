import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NativeHelper } from '../src/main/native-helper';
import { ProviderService } from '../src/main/provider-service';
import type { PersistedState, ProviderProfile } from '../src/shared/types';

const profile: ProviderProfile = {
  id: '52326ccc-0c89-4a25-ac57-fad0c31b91c9',
  kind: 'cockpit',
  name: 'Cockpit',
  baseUrl: 'https://api.example.com/v1',
  testModel: 'gpt-5.4',
  secretId: 'c4cda87b-e96c-48f5-a5fb-8455920dc4ad',
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('ProviderService provider test model', () => {
  it('uses the provider model and returns model ids discovered from the provider', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: 'provider-model-b' }, { id: 'provider-model-a' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const helper = { getSecret: vi.fn().mockResolvedValue('secret-key') };
    const service = new ProviderService(helper as unknown as NativeHelper);

    const result = await service.test(profile);

    expect(result.ok).toBe(true);
    expect(result.availableModels).toEqual(['provider-model-a', 'provider-model-b']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).model).toBe('gpt-5.4');
  });

  it('persists a model selected for the provider', async () => {
    const helper = { getSecret: vi.fn().mockResolvedValue('secret-key') };
    const service = new ProviderService(helper as unknown as NativeHelper);
    const state = { profiles: [profile] } as unknown as PersistedState;

    const saved = await service.save({
      id: profile.id,
      kind: profile.kind,
      name: profile.name,
      baseUrl: profile.baseUrl,
      testModel: 'provider-specific-model',
    }, state);

    expect(saved.testModel).toBe('provider-specific-model');
  });
});
