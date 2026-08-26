import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppController } from '../src/main/app-controller';
import { BackupService, PassThroughBackupCipher } from '../src/main/backup-service';
import type { CodexService } from '../src/main/codex-service';
import type { NativeHelper } from '../src/main/native-helper';
import type { ProviderService } from '../src/main/provider-service';
import type { RuntimePaths } from '../src/main/runtime-paths';
import { StateStore } from '../src/main/state-store';
import type { ProviderProfile } from '../src/shared/types';

const profile: ProviderProfile = {
  id: '52326ccc-0c89-4a25-ac57-fad0c31b91c9',
  kind: 'cockpit',
  name: 'Cockpit',
  baseUrl: 'https://api.example.com/v1',
  secretId: 'c4cda87b-e96c-48f5-a5fb-8455920dc4ad',
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
};

class FakeHelper {
  executablePath = '/tmp/ctools-helper';
  launches = 0;
  async install() {}
  async isCodexRunning() { return true; }
  async terminateCodex() {}
  async launchCodex() { this.launches += 1; }
}

class FakeCodex {
  doctorAvailable = true;
  failDoctor = false;
  launches = 0;
  async initialize() {}
  async loginStatus() { return 'Logged in using ChatGPT'; }
  async isRunning() { return true; }
  async stop() {}
  async launch() { this.launches += 1; }
  async validateConfiguration() { if (this.failDoctor) throw new Error('strict config failed'); }
  async restart() {}
}

class FakeProviders {
  testedModels: string[] = [];
  async test(_profile: ProviderProfile, model: string) {
    this.testedModels.push(model);
    return { ok: true, message: 'ok', latencyMs: 1 };
  }
}

describe('AppController recovery transaction', () => {
  let paths: RuntimePaths;
  let store: StateStore;
  let backups: BackupService;
  let helper: FakeHelper;
  let codex: FakeCodex;
  let providers: FakeProviders;
  let controller: AppController;
  let original: string;

  beforeEach(async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ctools-controller-'));
    paths = {
      userData: path.join(root, 'data'),
      stateFile: path.join(root, 'data', 'state.json'),
      backupsDirectory: path.join(root, 'data', 'backups'),
      installedHelper: path.join(root, 'data', 'bin', 'helper'),
      bundledHelper: path.join(root, 'helper'),
      codexConfig: path.join(root, '.codex', 'config.toml'),
    };
    await mkdir(path.dirname(paths.codexConfig), { recursive: true });
    original = 'model = "login-model"\n\n[features]\nmemories = true\n';
    await writeFile(paths.codexConfig, original);
    store = new StateStore(paths.stateFile);
    backups = new BackupService(paths.codexConfig, paths.backupsDirectory, new PassThroughBackupCipher());
    helper = new FakeHelper();
    codex = new FakeCodex();
    providers = new FakeProviders();
    controller = new AppController(
      paths,
      store,
      backups,
      helper as unknown as NativeHelper,
      codex as unknown as CodexService,
      providers as unknown as ProviderService,
    );
    await controller.initialize();
    const state = store.get();
    state.profiles.push({ ...profile });
    await store.replace(state);
  });

  it('automatically restores original bytes when strict Codex validation fails', async () => {
    codex.failDoctor = true;
    const result = await controller.switchToProvider(profile.id);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/strict config failed/);
    expect(await readFile(paths.codexConfig, 'utf8')).toBe(original);
    expect(store.get().journal).toBeUndefined();
    expect(store.get().history[0].status).toBe('recovered');
    expect(codex.launches).toBe(1);
  });

  it('can restore the exact pre-switch config with one call', async () => {
    const switched = await controller.switchToProvider(profile.id);
    expect(switched.ok).toBe(true);
    expect(await readFile(paths.codexConfig, 'utf8')).toContain('model_provider = "ctools_active"');
    expect(await readFile(paths.codexConfig, 'utf8')).toContain('model = "gpt-5.6-sol"');
    expect(providers.testedModels).toEqual(['gpt-5.6-sol']);

    const restored = await controller.restoreLatest();
    expect(restored.ok).toBe(true);
    expect(await readFile(paths.codexConfig, 'utf8')).toBe(original);
    expect(store.get().activeProviderId).toBeUndefined();
  });

  it('uses the system test model for future tests and switches without rewriting immediately', async () => {
    const updated = await controller.updateSettings({ testModel: 'gpt-5.4' });
    expect(updated.ok).toBe(true);
    expect(await readFile(paths.codexConfig, 'utf8')).toBe(original);

    const switched = await controller.switchToProvider(profile.id);
    expect(switched.ok).toBe(true);
    expect(await readFile(paths.codexConfig, 'utf8')).toContain('model = "gpt-5.4"');
    expect(providers.testedModels).toEqual(['gpt-5.4']);
    expect(store.get().history[0].model).toBe('gpt-5.4');
  });

  it('switches from the active API provider back to login mode and restarts Codex', async () => {
    await controller.switchToProvider(profile.id);
    const switched = await controller.switchToLogin();

    expect(switched.ok).toBe(true);
    expect(switched.snapshot.status.mode).toBe('login');
    const loginConfig = await readFile(paths.codexConfig, 'utf8');
    expect(loginConfig).toContain('model = "login-model"');
    expect(loginConfig).not.toContain('model_provider = "ctools_active"');
    expect(loginConfig).not.toContain('[model_providers.ctools_active]');
    expect(store.get().activeProviderId).toBeUndefined();
    expect(store.get().history[0]).toMatchObject({
      action: 'switch-login',
      fromMode: 'api',
      toMode: 'login',
      status: 'success',
    });
    expect(codex.launches).toBe(2);
  });

  it('can reapply the active API provider and restart Codex again', async () => {
    const first = await controller.switchToProvider(profile.id);
    const second = await controller.switchToProvider(profile.id);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(codex.launches).toBe(2);
    expect(providers.testedModels).toEqual(['gpt-5.6-sol', 'gpt-5.6-sol']);
    expect(store.get().activeProviderId).toBe(profile.id);
    expect(store.get().history.slice(0, 2).map((record) => record.action)).toEqual([
      'switch-api',
      'switch-api',
    ]);
  });

  it('restores the newest login backup after reapplying an API and stays restored', async () => {
    await controller.switchToProvider(profile.id);
    await controller.switchToProvider(profile.id);

    const stateBeforeRestore = store.get();
    const overwrittenLastGood = stateBeforeRestore.backups.find(
      (backup) => backup.id === stateBeforeRestore.lastGoodBackupId,
    );
    const newestLoginBackup = stateBeforeRestore.backups.find((backup) => backup.mode === 'login');
    expect(overwrittenLastGood?.mode).toBe('api');
    expect(newestLoginBackup).toBeDefined();

    const snapshot = await controller.getSnapshot();
    expect(snapshot.status.recoveryLabel).toContain(newestLoginBackup!.reason);

    const firstRestore = await controller.restoreLatest();
    expect(firstRestore.ok).toBe(true);
    expect(await readFile(paths.codexConfig, 'utf8')).toBe(original);
    expect(store.get().activeProviderId).toBeUndefined();
    expect(store.get().lastGoodBackupId).toBe(newestLoginBackup!.id);

    const secondRestore = await controller.restoreLatest();
    expect(secondRestore.ok).toBe(true);
    expect(await readFile(paths.codexConfig, 'utf8')).toBe(original);
    expect(store.get().activeProviderId).toBeUndefined();
    expect(store.get().history.slice(0, 2).map((record) => record.toMode)).toEqual([
      'login',
      'login',
    ]);
  });
});
