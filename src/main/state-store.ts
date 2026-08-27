import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { defaultTestModelForKind } from '../shared/constants';
import type { PersistedState, ProviderProfile } from '../shared/types';
import { atomicWriteFile } from './atomic-file';

const defaultState = (): PersistedState => ({
  schemaVersion: 1,
  profiles: [],
  backups: [],
  history: [],
});

export class StateStore {
  private state: PersistedState = defaultState();

  constructor(private readonly filePath: string) {}

  async load(): Promise<PersistedState> {
    try {
      const data = JSON.parse(await readFile(this.filePath, 'utf8')) as Omit<
        PersistedState,
        'profiles'
      > & {
        settings?: { testModel?: string };
        profiles: Array<Omit<ProviderProfile, 'testModel'> & { testModel?: string; model?: string }>;
      };
      if (data.schemaVersion !== 1 || !Array.isArray(data.profiles) || !Array.isArray(data.backups)) {
        throw new Error('Unsupported state schema');
      }
      const configuredModel = data.settings?.testModel?.trim();
      const needsMigration = Boolean(data.settings)
        || data.profiles.some((profile) => !profile.testModel?.trim() || 'model' in profile);
      const { settings: _legacySettings, ...stateWithoutSettings } = data;
      const migratedState: PersistedState = {
        ...stateWithoutSettings,
        profiles: data.profiles.map(({ model: legacyModel, ...profile }) => ({
          ...profile,
          testModel: profile.testModel?.trim()
            || legacyModel?.trim()
            || configuredModel
            || defaultTestModelForKind(profile.kind),
        })),
      };
      this.state = migratedState;
      if (needsMigration) {
        await atomicWriteFile(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.state = defaultState();
    }
    return this.state;
  }

  get(): PersistedState {
    return this.state;
  }

  async replace(state: PersistedState): Promise<void> {
    z.literal(1).parse(state.schemaVersion);
    await atomicWriteFile(this.filePath, `${JSON.stringify(state, null, 2)}\n`);
    this.state = state;
  }
}
