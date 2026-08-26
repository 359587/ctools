export const providerKinds = ['cockpit', 'sub2api', 'aiclient2api', '9routor', 'custom'] as const;

export type ProviderKind = (typeof providerKinds)[number];
export type AppMode = 'login' | 'api';
export type OperationStatus = 'success' | 'failed' | 'recovered';

export interface ProviderProfile {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  secretId: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
  lastTestOk?: boolean;
  lastTestMessage?: string;
  availableModels?: string[];
}

export interface PublicProviderProfile extends Omit<ProviderProfile, 'secretId'> {
  hasSecret: boolean;
}

export interface ProviderDraft {
  id?: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  apiKey?: string;
}

export interface AppSettings {
  testModel: string;
}

export interface LoginBaseline {
  capturedAt: string;
  hasModel: boolean;
  model?: string;
  hasModelProvider: boolean;
  modelProvider?: string;
}

export interface BackupRecord {
  id: string;
  createdAt: string;
  reason: string;
  fileName: string;
  plaintextSha256: string;
  configExisted: boolean;
  configMode?: number;
  mode: AppMode;
  activeProviderId?: string;
}

export interface SwitchHistoryRecord {
  id: string;
  createdAt: string;
  action: 'switch-api' | 'switch-login' | 'restore' | 'auto-recover';
  fromMode: AppMode;
  toMode: AppMode;
  providerId?: string;
  providerName?: string;
  model?: string;
  backupId?: string;
  status: OperationStatus;
  message: string;
}

export interface RecoveryJournal {
  id: string;
  createdAt: string;
  backupId: string;
  action: SwitchHistoryRecord['action'];
  phase: 'prepared' | 'config-written' | 'validated';
}

export interface PersistedState {
  schemaVersion: 1;
  settings: AppSettings;
  loginBaseline?: LoginBaseline;
  profiles: ProviderProfile[];
  backups: BackupRecord[];
  history: SwitchHistoryRecord[];
  journal?: RecoveryJournal;
  lastGoodBackupId?: string;
  activeProviderId?: string;
}

export interface CodexStatus {
  mode: AppMode;
  model?: string;
  modelProvider?: string;
  activeProviderId?: string;
  activeProviderName?: string;
  configPath: string;
  configExists: boolean;
  codexRunning: boolean;
  loginStatus: string;
  doctorAvailable: boolean;
  recoveryAvailable: boolean;
  recoveryLabel?: string;
}

export interface AppSnapshot {
  settings: AppSettings;
  status: CodexStatus;
  profiles: PublicProviderProfile[];
  history: SwitchHistoryRecord[];
  backups: BackupRecord[];
  busy: boolean;
}

export interface OperationResult {
  ok: boolean;
  message: string;
  snapshot: AppSnapshot;
}

export interface TestProviderResult {
  ok: boolean;
  message: string;
  latencyMs: number;
  availableModels?: string[];
}

export interface CToolsApi {
  getSnapshot(): Promise<AppSnapshot>;
  updateSettings(settings: AppSettings): Promise<OperationResult>;
  saveProvider(draft: ProviderDraft): Promise<OperationResult>;
  deleteProvider(id: string): Promise<OperationResult>;
  testProvider(id: string): Promise<TestProviderResult>;
  testProviderDraft(draft: ProviderDraft): Promise<TestProviderResult>;
  switchToProvider(id: string): Promise<OperationResult>;
  switchToLogin(): Promise<OperationResult>;
  restoreLatest(): Promise<OperationResult>;
  restoreBackup(id: string): Promise<OperationResult>;
  restartCodex(): Promise<OperationResult>;
}
