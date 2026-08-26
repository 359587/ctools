import { homedir } from 'node:os';
import path from 'node:path';

export interface RuntimePaths {
  userData: string;
  stateFile: string;
  backupsDirectory: string;
  installedHelper: string;
  bundledHelper: string;
  codexConfig: string;
}

export function createRuntimePaths(options: {
  userData: string;
  appPath: string;
  resourcesPath: string;
  isPackaged: boolean;
}): RuntimePaths {
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(homedir(), '.codex');
  return {
    userData: options.userData,
    stateFile: path.join(options.userData, 'state.json'),
    backupsDirectory: path.join(options.userData, 'backups'),
    installedHelper: path.join(options.userData, 'bin', 'ctools-macos-helper'),
    bundledHelper: options.isPackaged
      ? path.join(options.resourcesPath, 'bin', 'ctools-macos-helper')
      : path.join(options.appPath, 'resources', 'bin', 'ctools-macos-helper'),
    codexConfig: path.join(codexHome, 'config.toml'),
  };
}
