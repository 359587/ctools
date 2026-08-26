import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: 'CTools',
    appBundleId: 'com.ray.ctools',
    appCategoryType: 'public.app-category.utilities',
    extraResource: ['./resources/bin'],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {},
    },
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
  ],
  hooks: {
    postPackage: async (_forgeConfig, result) => {
      if (result.platform !== 'darwin') return;
      const identity = process.env.CTOOLS_SIGN_IDENTITY?.trim() || '-';
      for (const outputPath of result.outputPaths) {
        const appPath = outputPath.endsWith('.app')
          ? outputPath
          : path.join(outputPath, 'CTools.app');
        const args = ['--force', '--deep', '--sign', identity];
        if (identity !== '-') args.push('--options', 'runtime', '--timestamp');
        args.push(appPath);
        execFileSync('/usr/bin/codesign', args, { stdio: 'inherit' });
      }
    },
  },
};

export default config;
