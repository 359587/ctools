import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { StateStore } from '../src/main/state-store';

const baseProfile = {
  id: '52326ccc-0c89-4a25-ac57-fad0c31b91c9',
  kind: 'cockpit' as const,
  name: 'Cockpit',
  baseUrl: 'https://api.example.com/v1',
  secretId: 'c4cda87b-e96c-48f5-a5fb-8455920dc4ad',
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
};

async function createStateFile(value: unknown): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'ctools-state-'));
  const stateFile = path.join(root, 'data', 'state.json');
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, JSON.stringify(value));
  return stateFile;
}

describe('StateStore provider test-model migration', () => {
  it('moves the legacy shared model to every provider without keeping system settings', async () => {
    const stateFile = await createStateFile({
      schemaVersion: 1,
      settings: { testModel: 'legacy-global-model' },
      profiles: [
        baseProfile,
        { ...baseProfile, id: 'a3a8b9f1-9a16-4c71-8b92-2f1de80c7ee9', kind: 'sub2api', name: 'Sub2API' },
      ],
      backups: [],
      history: [],
    });

    const state = await new StateStore(stateFile).load();

    expect(state.profiles.map((profile) => profile.testModel)).toEqual([
      'legacy-global-model',
      'legacy-global-model',
    ]);
    expect(state).not.toHaveProperty('settings');
    const saved = JSON.parse(await readFile(stateFile, 'utf8'));
    expect(saved).not.toHaveProperty('settings');
    expect(saved.profiles[0].testModel).toBe('legacy-global-model');
  });

  it('prefers a legacy provider model over the shared fallback', async () => {
    const stateFile = await createStateFile({
      schemaVersion: 1,
      settings: { testModel: 'legacy-global-model' },
      profiles: [{ ...baseProfile, model: 'legacy-provider-model' }],
      backups: [],
      history: [],
    });

    const state = await new StateStore(stateFile).load();

    expect(state.profiles[0].testModel).toBe('legacy-provider-model');
  });
});
