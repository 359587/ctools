import { createHash, randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { MAX_BACKUPS, MAX_HISTORY } from '../shared/constants';
import { AppError, errorMessage } from '../shared/errors';
import type {
  AppMode,
  AppSettings,
  AppSnapshot,
  BackupRecord,
  OperationResult,
  PersistedState,
  ProviderDraft,
  ProviderProfile,
  SwitchHistoryRecord,
  TestProviderResult,
} from '../shared/types';
import { atomicWriteFile } from './atomic-file';
import type { BackupService } from './backup-service';
import {
  applyLoginConfig,
  applyProviderConfig,
  captureLoginBaseline,
  parseCodexConfig,
} from './codex-config';
import type { CodexService } from './codex-service';
import type { NativeHelper } from './native-helper';
import type { ProviderService } from './provider-service';
import type { RuntimePaths } from './runtime-paths';
import type { StateStore } from './state-store';

export class AppController {
  private busy = false;

  constructor(
    private readonly paths: RuntimePaths,
    private readonly store: StateStore,
    private readonly backups: BackupService,
    private readonly helper: NativeHelper,
    private readonly codex: CodexService,
    private readonly providers: ProviderService,
  ) {}

  async initialize(): Promise<void> {
    await this.helper.install();
    await this.codex.initialize();
    const state = await this.store.load();

    if (state.journal) {
      const backup = state.backups.find((item) => item.id === state.journal!.backupId);
      if (!backup) throw new AppError('检测到未完成操作，但恢复快照不存在', 'RECOVERY_MISSING');
      await this.backups.restore(backup);
      state.activeProviderId = backup.activeProviderId;
      state.history.unshift(
        historyRecord({
          action: 'auto-recover',
          fromMode: backup.mode === 'api' ? 'login' : 'api',
          toMode: backup.mode,
          status: 'recovered',
          backupId: backup.id,
          message: '检测到上次操作未完成，已自动恢复写入前配置',
        }),
      );
      delete state.journal;
      await this.store.replace(state);
      await this.codex.launch().catch(() => undefined);
    }

    if (!state.loginBaseline) {
      const source = await this.backups.readCurrentConfig();
      const parsed = parseCodexConfig(source);
      state.loginBaseline = captureLoginBaseline(source);
      const baselineBackup = await this.backups.create(
        '首次启动基线',
        parsed.mode,
        state.activeProviderId,
      );
      state.backups.unshift(baselineBackup);
      state.lastGoodBackupId = baselineBackup.id;
      await this.store.replace(state);
    }
  }

  async getSnapshot(): Promise<AppSnapshot> {
    const state = this.store.get();
    const source = await this.backups.readCurrentConfig();
    const parsed = parseCodexConfig(source);
    const activeProfile = state.activeProviderId
      ? state.profiles.find((profile) => profile.id === state.activeProviderId)
      : undefined;
    const recovery = selectRecoveryTarget(state);

    return {
      settings: { ...state.settings },
      status: {
        mode: parsed.mode,
        model: parsed.model,
        modelProvider: parsed.modelProvider,
        activeProviderId: activeProfile?.id,
        activeProviderName: activeProfile?.name,
        configPath: this.paths.codexConfig,
        configExists: await exists(this.paths.codexConfig),
        codexRunning: await this.codex.isRunning().catch(() => false),
        loginStatus: await this.codex.loginStatus(),
        doctorAvailable: this.codex.doctorAvailable,
        recoveryAvailable: Boolean(recovery),
        recoveryLabel: recovery
          ? `${new Date(recovery.createdAt).toLocaleString('zh-CN')} · ${recovery.reason}`
          : undefined,
      },
      profiles: state.profiles.map(({ secretId: _secretId, ...profile }) => ({
        ...profile,
        hasSecret: true,
      })),
      history: state.history.slice(0, MAX_HISTORY),
      backups: state.backups,
      busy: this.busy,
    };
  }

  async updateSettings(settings: AppSettings): Promise<OperationResult> {
    return this.operation(async () => {
      const testModel = settings.testModel.trim();
      if (!testModel) throw new AppError('测试模型不能为空', 'INVALID_MODEL');
      const state = this.store.get();
      state.settings = { testModel };
      await this.store.replace(state);
      return '默认测试模型已更新，将用于后续连接测试和 API 切换';
    });
  }

  async saveProvider(draft: ProviderDraft): Promise<OperationResult> {
    return this.operation(async () => {
      const state = this.store.get();
      const profile = await this.providers.save(draft, state);
      const index = state.profiles.findIndex((item) => item.id === profile.id);
      if (index >= 0) state.profiles[index] = profile;
      else state.profiles.unshift(profile);
      await this.store.replace(state);
      return draft.id ? '供应商已更新' : '供应商已保存，密钥已进入 macOS 钥匙串';
    });
  }

  async deleteProvider(id: string): Promise<OperationResult> {
    return this.operation(async () => {
      const state = this.store.get();
      if (state.activeProviderId === id) {
        throw new AppError('当前供应商正在使用，请先切回登录模式', 'PROVIDER_ACTIVE');
      }
      const before = state.profiles.length;
      state.profiles = state.profiles.filter((profile) => profile.id !== id);
      if (state.profiles.length === before) throw new AppError('供应商不存在', 'PROVIDER_NOT_FOUND');
      await this.store.replace(state);
      return '供应商已删除；历史密钥仍保留在钥匙串中以保证旧备份可恢复';
    });
  }

  async testProvider(id: string): Promise<TestProviderResult> {
    const state = this.store.get();
    const profile = requireProfile(state, id);
    const result = await this.providers.test(profile, state.settings.testModel);
    profile.lastTestedAt = new Date().toISOString();
    profile.lastTestOk = result.ok;
    profile.lastTestMessage = result.message;
    profile.availableModels = result.availableModels ?? profile.availableModels;
    await this.store.replace(state);
    return result;
  }

  async testProviderDraft(draft: ProviderDraft): Promise<TestProviderResult> {
    const state = this.store.get();
    return this.providers.testDraft(draft, state, state.settings.testModel);
  }

  async switchToProvider(id: string): Promise<OperationResult> {
    return this.operation(async () => {
      const state = this.store.get();
      const profile = requireProfile(state, id);
      const testModel = state.settings.testModel;
      const test = await this.providers.test(profile, testModel);
      profile.lastTestedAt = new Date().toISOString();
      profile.lastTestOk = test.ok;
      profile.lastTestMessage = test.message;
      profile.availableModels = test.availableModels ?? profile.availableModels;
      await this.store.replace(state);
      if (!test.ok) throw new AppError(`切换前连接测试失败：${test.message}`, 'PREFLIGHT_FAILED');

      return this.applyConfigTransaction(
        'switch-api',
        'api',
        profile,
        (source) => applyProviderConfig(source, profile, testModel, this.helper.executablePath),
      );
    });
  }

  async switchToLogin(): Promise<OperationResult> {
    return this.operation(async () => {
      const state = this.store.get();
      if (!state.loginBaseline) throw new AppError('登录模式基线不存在', 'BASELINE_MISSING');
      return this.applyConfigTransaction(
        'switch-login',
        'login',
        undefined,
        (source) => applyLoginConfig(source, state.loginBaseline!),
      );
    });
  }

  async restoreLatest(): Promise<OperationResult> {
    const target = selectRecoveryTarget(this.store.get());
    if (!target) return { ok: false, message: '没有可用的恢复点', snapshot: await this.getSnapshot() };
    return this.restoreBackup(target.id);
  }

  async restoreBackup(id: string): Promise<OperationResult> {
    return this.operation(async () => {
      const state = this.store.get();
      const target = state.backups.find((backup) => backup.id === id);
      if (!target) throw new AppError('恢复点不存在或已过期', 'BACKUP_NOT_FOUND');
      const current = parseCodexConfig(await this.backups.readCurrentConfig());
      let safety: BackupRecord | undefined;
      let stopped = false;

      try {
        await this.codex.stop();
        stopped = true;
        safety = await this.backups.create('执行恢复前的安全快照', current.mode, state.activeProviderId);
        state.backups.unshift(safety);
        state.journal = {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          backupId: safety.id,
          action: 'restore',
          phase: 'prepared',
        };
        await this.store.replace(state);

        await this.backups.restore(target);
        state.journal.phase = 'config-written';
        await this.store.replace(state);
        await this.assertConfigMode(target.mode);
        await this.codex.validateConfiguration();
        state.journal.phase = 'validated';
        await this.store.replace(state);
        await this.codex.launch();
        stopped = false;
        await this.assertConfigMode(target.mode);

        state.activeProviderId = target.activeProviderId;
        state.lastGoodBackupId = target.id;
        delete state.journal;
        state.history.unshift(
          historyRecord({
            action: 'restore',
            fromMode: current.mode,
            toMode: target.mode,
            status: 'success',
            backupId: safety.id,
            message: '已完整恢复所选配置，并保留恢复前安全快照',
          }),
        );
        await this.pruneAndSave(state);
        return '已还原 Codex，并重新启动桌面端';
      } catch (error) {
        if (safety) {
          await this.backups.restore(safety).catch(() => undefined);
          state.activeProviderId = safety.activeProviderId;
        }
        delete state.journal;
        state.history.unshift(
          historyRecord({
            action: 'restore',
            fromMode: current.mode,
            toMode: current.mode,
            status: safety ? 'recovered' : 'failed',
            backupId: safety?.id,
            message: `恢复失败，已保持操作前配置：${errorMessage(error)}`,
          }),
        );
        await this.store.replace(state);
        if (stopped) await this.codex.launch().catch(() => undefined);
        throw error;
      }
    });
  }

  async restartCodex(): Promise<OperationResult> {
    return this.operation(async () => {
      await this.codex.restart();
      return 'Codex 已重新启动';
    });
  }

  private async applyConfigTransaction(
    action: 'switch-api' | 'switch-login',
    targetMode: AppMode,
    profile: ProviderProfile | undefined,
    mutate: (source: string) => string,
  ): Promise<string> {
    const state = this.store.get();
    const sourceBeforeBackup = await this.backups.readCurrentConfig();
    const current = parseCodexConfig(sourceBeforeBackup);
    let backup: BackupRecord | undefined;
    let stopped = false;

    try {
      await this.codex.stop();
      stopped = true;
      backup = await this.backups.create(
        action === 'switch-api' ? `切换到 ${profile?.name ?? 'API'} 前` : '切回登录模式前',
        current.mode,
        state.activeProviderId,
      );
      const source = await this.backups.readCurrentConfig();
      if (sha256(source) !== backup.plaintextSha256 || source !== sourceBeforeBackup) {
        throw new AppError('配置在准备切换时发生变化，已取消本次操作', 'CONFIG_CHANGED');
      }

      state.backups.unshift(backup);
      state.lastGoodBackupId = backup.id;
      state.journal = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        backupId: backup.id,
        action,
        phase: 'prepared',
      };
      await this.store.replace(state);

      const next = mutate(source);
      await atomicWriteFile(this.paths.codexConfig, next, backup.configMode ?? 0o600);
      state.journal.phase = 'config-written';
      await this.store.replace(state);
      await this.assertConfigMode(targetMode);
      await this.codex.validateConfiguration();
      state.journal.phase = 'validated';
      await this.store.replace(state);
      await this.codex.launch();
      stopped = false;
      await this.assertConfigMode(targetMode);

      state.activeProviderId = profile?.id;
      delete state.journal;
      state.history.unshift(
        historyRecord({
          action,
          fromMode: current.mode,
          toMode: targetMode,
          providerId: profile?.id,
          providerName: profile?.name,
          model: targetMode === 'api' ? state.settings.testModel : undefined,
          status: 'success',
          backupId: backup.id,
          message: targetMode === 'api' ? `已切换到 ${profile?.name}` : '已切回 Codex 登录模式',
        }),
      );
      await this.pruneAndSave(state);
      return targetMode === 'api'
        ? `已切换到 ${profile?.name}，Codex 已重新启动`
        : '已切回登录模式，Codex 已重新启动';
    } catch (error) {
      if (backup) {
        await this.backups.restore(backup).catch(() => undefined);
        state.activeProviderId = backup.activeProviderId;
      }
      delete state.journal;
      state.history.unshift(
        historyRecord({
          action,
          fromMode: current.mode,
          toMode: current.mode,
          providerId: profile?.id,
          providerName: profile?.name,
          model: targetMode === 'api' ? state.settings.testModel : undefined,
          status: backup ? 'recovered' : 'failed',
          backupId: backup?.id,
          message: `切换失败，原配置已还原：${errorMessage(error)}`,
        }),
      );
      await this.store.replace(state);
      if (stopped) await this.codex.launch().catch(() => undefined);
      throw error;
    }
  }

  private async operation(task: () => Promise<string>): Promise<OperationResult> {
    if (this.busy) {
      return { ok: false, message: '已有配置操作正在执行', snapshot: await this.getSnapshot() };
    }
    this.busy = true;
    let ok = false;
    let message = '';
    try {
      message = await task();
      ok = true;
    } catch (error) {
      message = errorMessage(error);
    } finally {
      this.busy = false;
    }
    return { ok, message, snapshot: await this.getSnapshot() };
  }

  private async assertConfigMode(expected: AppMode): Promise<void> {
    const actual = parseCodexConfig(await this.backups.readCurrentConfig()).mode;
    if (actual !== expected) {
      throw new AppError(
        `Codex 配置写入后仍是 ${actual === 'api' ? 'API' : '登录'} 模式，已撤销本次操作`,
        'MODE_MISMATCH',
      );
    }
  }

  private async pruneAndSave(state: PersistedState): Promise<void> {
    state.history = state.history.slice(0, MAX_HISTORY);
    const protectedIds = new Set([
      state.lastGoodBackupId,
      state.journal?.backupId,
      ...state.history.slice(0, MAX_BACKUPS).map((record) => record.backupId),
    ].filter((id): id is string => Boolean(id)));
    const keep: BackupRecord[] = [];
    const remove: BackupRecord[] = [];
    for (const backup of state.backups) {
      if (keep.length < MAX_BACKUPS || protectedIds.has(backup.id)) keep.push(backup);
      else remove.push(backup);
    }
    state.backups = keep;
    await this.store.replace(state);
    await Promise.all(remove.map((backup) => this.backups.remove(backup)));
  }
}

function requireProfile(state: PersistedState, id: string): ProviderProfile {
  const profile = state.profiles.find((item) => item.id === id);
  if (!profile) throw new AppError('供应商不存在', 'PROVIDER_NOT_FOUND');
  return profile;
}

function selectRecoveryTarget(state: PersistedState): BackupRecord | undefined {
  const loginBackup = state.backups
    .filter((backup) => backup.mode === 'login')
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
  if (loginBackup) return loginBackup;
  return state.lastGoodBackupId
    ? state.backups.find((backup) => backup.id === state.lastGoodBackupId)
    : undefined;
}

function historyRecord(
  input: Omit<SwitchHistoryRecord, 'id' | 'createdAt'>,
): SwitchHistoryRecord {
  return { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
