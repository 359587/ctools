import type { ProviderKind } from './types';

export const APP_NAME = 'CTools';
export const CODEX_BUNDLE_IDENTIFIER = 'com.openai.codex';
export const KEYCHAIN_SERVICE = 'com.ray.ctools.provider';
export const MANAGED_PROVIDER_ID = 'ctools_active';
export const MANAGED_BLOCK_START = '# >>> CTOOLS MANAGED PROVIDER';
export const MANAGED_BLOCK_END = '# <<< CTOOLS MANAGED PROVIDER';
export const DEFAULT_TEST_MODEL = 'gpt-5.6-sol';
export const NINE_ROUTER_MODEL_PREFIX = 'cx/';
export const DEFAULT_TEST_MODELS: Record<ProviderKind, string> = {
  cockpit: DEFAULT_TEST_MODEL,
  sub2api: DEFAULT_TEST_MODEL,
  aiclient2api: DEFAULT_TEST_MODEL,
  '9routor': `${NINE_ROUTER_MODEL_PREFIX}${DEFAULT_TEST_MODEL}`,
  custom: DEFAULT_TEST_MODEL,
};

export function defaultTestModelForKind(kind: ProviderKind): string {
  return DEFAULT_TEST_MODELS[kind] ?? DEFAULT_TEST_MODEL;
}

export function normalizeTestModelForKind(kind: ProviderKind, model: string): string {
  const normalized = model.trim();
  if (!normalized) return normalized;
  if (kind === '9routor') {
    return normalized.startsWith(NINE_ROUTER_MODEL_PREFIX)
      ? normalized
      : `${NINE_ROUTER_MODEL_PREFIX}${normalized}`;
  }
  return normalized.startsWith(NINE_ROUTER_MODEL_PREFIX)
    ? normalized.slice(NINE_ROUTER_MODEL_PREFIX.length)
    : normalized;
}

export const TEST_MODEL_PRESETS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.6',
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.3-codex',
] as const;
export const MAX_BACKUPS = 60;
export const MAX_HISTORY = 200;
