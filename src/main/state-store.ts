import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { DEFAULT_TEST_MODEL } from '../shared/constants';
import type { AppSettings, PersistedState, ProviderProfile } from '../shared/types';
import { atomicWriteFile } from './atomic-file';

const defaultState = (): PersistedState => ({
  schemaVersion: 1,
  settings: { testModel: DEFAULT_TEST_MODEL },
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
        'settings' | 'profiles'
      > & {
        settings?: AppSettings;
        profiles: Array<ProviderProfile & { model?: string }>;
      };
      if (data.schemaVersion !== 1 || !Array.isArray(data.profiles) || !Array.isArray(data.backups)) {
        throw new Error('Unsupported state schema');
      }
      const legacyModel = data.profiles.find((profile) => profile.model?.trim())?.model?.trim();
      const configuredModel = data.settings?.testModel?.trim();
      const needsMigration = !configuredModel || data.profiles.some((profile) => 'model' in profile);
      const migratedState: PersistedState = {
        ...data,
        settings: { testModel: configuredModel || legacyModel || DEFAULT_TEST_MODEL },
        profiles: data.profiles.map(({ model: _legacyModel, ...profile }) => profile),
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
