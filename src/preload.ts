import { contextBridge, ipcRenderer } from 'electron';
import type { CToolsApi, ProviderDraft } from './shared/types';

const api: CToolsApi = {
  getSnapshot: () => ipcRenderer.invoke('ctools:get-snapshot'),
  saveProvider: (draft: ProviderDraft) => ipcRenderer.invoke('ctools:save-provider', draft),
  deleteProvider: (id: string) => ipcRenderer.invoke('ctools:delete-provider', id),
  testProvider: (id: string) => ipcRenderer.invoke('ctools:test-provider', id),
  testProviderDraft: (draft: ProviderDraft) => ipcRenderer.invoke('ctools:test-provider-draft', draft),
  switchToProvider: (id: string) => ipcRenderer.invoke('ctools:switch-provider', id),
  switchToLogin: () => ipcRenderer.invoke('ctools:switch-login'),
  restoreLatest: () => ipcRenderer.invoke('ctools:restore-latest'),
  restoreBackup: (id: string) => ipcRenderer.invoke('ctools:restore-backup', id),
  restartCodex: () => ipcRenderer.invoke('ctools:restart-codex'),
};

contextBridge.exposeInMainWorld('ctools', Object.freeze(api));
