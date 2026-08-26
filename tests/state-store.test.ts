import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { StateStore } from '../src/main/state-store';

describe('StateStore settings migration', () => {
  it('moves a legacy provider model into the shared system setting', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ctools-state-'));
    const stateFile = path.join(root, 'data', 'state.json');
    await mkdir(path.dirname(stateFile), { recursive: true });
    await writeFile(stateFile, JSON.stringify({
      schemaVersion: 1,
      profiles: [{
        id: '52326ccc-0c89-4a25-ac57-fad0c31b91c9',
        kind: 'cockpit',
        name: 'Cockpit',
        baseUrl: 'https://api.example.com/v1',
        model: 'legacy-model',
        secretId: 'c4cda87b-e96c-48f5-a5fb-8455920dc4ad',
        createdAt: '2026-08-23T00:00:00.000Z',
        updatedAt: '2026-08-23T00:00:00.000Z',
      }],
      backups: [],
      history: [],
    }));

    const state = await new StateStore(stateFile).load();

    expect(state.settings.testModel).toBe('legacy-model');
    expect(state.profiles[0]).not.toHaveProperty('model');
    expect(JSON.parse(await readFile(stateFile, 'utf8')).profiles[0]).not.toHaveProperty('model');
  });
});
