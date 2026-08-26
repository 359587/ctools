/// <reference types="vite/client" />

declare global {
  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
  const MAIN_WINDOW_VITE_NAME: string;

  interface Window {
    ctools: import('./shared/types').CToolsApi;
  }
}

export {};
