import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { app, BrowserWindow, dialog, ipcMain, Menu, session } from 'electron';
import { z } from 'zod';
import { AppController } from './main/app-controller';
import { BackupService } from './main/backup-service';
import { CodexService } from './main/codex-service';
import { KeychainBackupCipher } from './main/keychain-backup-cipher';
import { NativeHelper } from './main/native-helper';
import { ProviderService } from './main/provider-service';
import { createRuntimePaths } from './main/runtime-paths';
import { StateStore } from './main/state-store';
import { providerKinds } from './shared/types';

const idSchema = z.string().uuid();
const providerDraftSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(providerKinds),
  name: z.string().max(80),
  baseUrl: z.string().max(2048),
  apiKey: z.string().max(4096).optional(),
});
const settingsSchema = z.object({
  testModel: z.string().trim().min(1).max(160),
});

let mainWindow: BrowserWindow | undefined;
let controller: AppController;

if (process.env.CTOOLS_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.CTOOLS_USER_DATA));
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    show: false,
    title: 'CTools',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#121411',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.once('did-finish-load', () => {
    const capturePath = process.env.CTOOLS_CAPTURE_PATH;
    if (!capturePath) return;
    const startedAt = Date.now();
    const captureWhenReady = async () => {
      const ready = await mainWindow?.webContents.executeJavaScript(
        "document.body.dataset.ctoolsReady === 'true'",
      );
      if (!ready && Date.now() - startedAt < 20_000) {
        setTimeout(captureWhenReady, 350);
        return;
      }
      if (ready) {
        await new Promise<void>((resolve) => setTimeout(resolve, 800));
      }
      const image = await mainWindow?.webContents.capturePage();
      if (!image) return;
      await mkdir(path.dirname(capturePath), { recursive: true });
      await writeFile(capturePath, image.toPNG());
      app.quit();
    };
    setTimeout(captureWhenReady, 500);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

function isTrustedRendererUrl(url: string): boolean {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL && url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)) return true;
  return url.startsWith('file://');
}

function assertTrustedSender(event: Electron.IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  if (!isTrustedRendererUrl(url)) throw new Error('Untrusted IPC sender');
}

function registerIpc(): void {
  ipcMain.handle('ctools:get-snapshot', async (event) => {
    assertTrustedSender(event);
    return controller.getSnapshot();
  });
  ipcMain.handle('ctools:update-settings', async (event, input) => {
    assertTrustedSender(event);
    return controller.updateSettings(settingsSchema.parse(input));
  });
  ipcMain.handle('ctools:save-provider', async (event, input) => {
    assertTrustedSender(event);
    return controller.saveProvider(providerDraftSchema.parse(input));
  });
  ipcMain.handle('ctools:delete-provider', async (event, input) => {
    assertTrustedSender(event);
    return controller.deleteProvider(idSchema.parse(input));
  });
  ipcMain.handle('ctools:test-provider', async (event, input) => {
    assertTrustedSender(event);
    return controller.testProvider(idSchema.parse(input));
  });
  ipcMain.handle('ctools:test-provider-draft', async (event, input) => {
    assertTrustedSender(event);
    return controller.testProviderDraft(providerDraftSchema.parse(input));
  });
  ipcMain.handle('ctools:switch-provider', async (event, input) => {
    assertTrustedSender(event);
    return controller.switchToProvider(idSchema.parse(input));
  });
  ipcMain.handle('ctools:switch-login', async (event) => {
    assertTrustedSender(event);
    return controller.switchToLogin();
  });
  ipcMain.handle('ctools:restore-latest', async (event) => {
    assertTrustedSender(event);
    return controller.restoreLatest();
  });
  ipcMain.handle('ctools:restore-backup', async (event, input) => {
    assertTrustedSender(event);
    return controller.restoreBackup(idSchema.parse(input));
  });
  ipcMain.handle('ctools:restart-codex', async (event) => {
    assertTrustedSender(event);
    return controller.restartCodex();
  });
}

function installMenu(): void {
  const menu = Menu.buildFromTemplate([
    {
      label: 'CTools',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: '紧急还原到上次切换前',
          accelerator: 'CommandOrControl+Shift+R',
          click: async () => {
            const result = await controller.restoreLatest();
            await dialog.showMessageBox({
              type: result.ok ? 'info' : 'error',
              title: result.ok ? '还原完成' : '还原失败',
              message: result.message,
            });
          },
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const scriptPolicy = app.isPackaged
      ? "script-src 'self'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; ${scriptPolicy}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: http://localhost:*; font-src 'self' data:`,
        ],
      },
    });
  });

  const paths = createRuntimePaths({
    userData: app.getPath('userData'),
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    isPackaged: app.isPackaged,
  });
  const helper = new NativeHelper(paths);
  const store = new StateStore(paths.stateFile);
  const backups = new BackupService(
    paths.codexConfig,
    paths.backupsDirectory,
    new KeychainBackupCipher(helper),
  );
  const codex = new CodexService(helper);
  const providers = new ProviderService(helper);
  controller = new AppController(paths, store, backups, helper, codex, providers);

  await controller.initialize();
  registerIpc();
  installMenu();

  if (process.argv.includes('--restore-latest')) {
    const result = await controller.restoreLatest();
    await dialog.showMessageBox({
      type: result.ok ? 'info' : 'error',
      title: result.ok ? '紧急还原完成' : '紧急还原失败',
      message: result.message,
    });
  }

  await createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
