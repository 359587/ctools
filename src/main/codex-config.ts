import { parse } from 'smol-toml';
import {
  MANAGED_BLOCK_END,
  MANAGED_BLOCK_START,
  MANAGED_PROVIDER_ID,
} from '../shared/constants';
import { AppError } from '../shared/errors';
import type { AppMode, LoginBaseline, ProviderProfile } from '../shared/types';

const managedBlockPattern = new RegExp(
  `${escapeRegExp(MANAGED_BLOCK_START)}[\\s\\S]*?${escapeRegExp(MANAGED_BLOCK_END)}\\s*`,
  'g',
);

export interface ParsedCodexConfig {
  mode: AppMode;
  model?: string;
  modelProvider?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function rootRegionEnd(source: string): number {
  const lines = source.matchAll(/^.*(?:\r?\n|$)/gm);
  for (const match of lines) {
    const line = match[0].trim();
    if (line.startsWith('[')) return match.index ?? 0;
  }
  return source.length;
}

function findCommentStart(value: string): number {
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? undefined : quote ?? character;
      continue;
    }
    if (character === '#' && !quote) return index;
  }
  return -1;
}

function setRootString(source: string, key: string, value: string | undefined, present: boolean): string {
  const end = rootRegionEnd(source);
  const root = source.slice(0, end);
  const remainder = source.slice(end);
  const pattern = new RegExp(`^(\\s*)${escapeRegExp(key)}\\s*=([^\\r\\n]*)(\\r?\\n|$)`, 'm');
  const match = root.match(pattern);

  if (match?.index !== undefined) {
    if (!present) {
      return root.slice(0, match.index) + root.slice(match.index + match[0].length) + remainder;
    }
    const rawValue = match[2];
    const commentStart = findCommentStart(rawValue);
    const comment = commentStart >= 0 ? ` ${rawValue.slice(commentStart).trimStart()}` : '';
    const newline = match[3] || '\n';
    const replacement = `${match[1]}${key} = ${tomlString(value ?? '')}${comment}${newline}`;
    return root.slice(0, match.index) + replacement + root.slice(match.index + match[0].length) + remainder;
  }

  if (!present) return source;
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const prefix = root.length > 0 && !root.endsWith('\n') ? `${root}${newline}` : root;
  return `${prefix}${key} = ${tomlString(value ?? '')}${newline}${remainder}`;
}

function removeManagedBlock(source: string): string {
  return source.replace(managedBlockPattern, '').replace(/\s+$/, '\n');
}

function buildManagedBlock(profile: ProviderProfile, helperPath: string): string {
  return [
    MANAGED_BLOCK_START,
    `[model_providers.${MANAGED_PROVIDER_ID}]`,
    `name = ${tomlString(`CTools · ${profile.name}`)}`,
    `base_url = ${tomlString(normalizeBaseUrl(profile.baseUrl))}`,
    'wire_api = "responses"',
    '',
    `[model_providers.${MANAGED_PROVIDER_ID}.auth]`,
    `command = ${tomlString(helperPath)}`,
    `args = ["keychain-get", "com.ray.ctools.provider", ${tomlString(profile.secretId)}]`,
    MANAGED_BLOCK_END,
    '',
  ].join('\n');
}

export function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AppError('API URL 格式不正确', 'INVALID_URL');
  }

  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new AppError('API URL 只支持 HTTP 或 HTTPS', 'INVALID_URL');
  }
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol === 'http:' && !isLocal) {
    throw new AppError('远程 API 必须使用 HTTPS；HTTP 仅允许本机地址', 'INSECURE_URL');
  }

  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

export function parseCodexConfig(source: string): ParsedCodexConfig {
  let config: Record<string, unknown>;
  try {
    config = parse(source) as Record<string, unknown>;
  } catch (error) {
    throw new AppError('Codex config.toml 不是有效的 TOML，未执行任何修改', 'INVALID_TOML', error);
  }

  const model = typeof config.model === 'string' ? config.model : undefined;
  const modelProvider = typeof config.model_provider === 'string' ? config.model_provider : undefined;
  return {
    mode: modelProvider === MANAGED_PROVIDER_ID ? 'api' : 'login',
    model,
    modelProvider,
  };
}

export function captureLoginBaseline(source: string): LoginBaseline {
  const parsed = parse(source) as Record<string, unknown>;
  return {
    capturedAt: new Date().toISOString(),
    hasModel: Object.hasOwn(parsed, 'model') && typeof parsed.model === 'string',
    model: typeof parsed.model === 'string' ? parsed.model : undefined,
    hasModelProvider:
      Object.hasOwn(parsed, 'model_provider') && typeof parsed.model_provider === 'string',
    modelProvider: typeof parsed.model_provider === 'string' ? parsed.model_provider : undefined,
  };
}

export function applyProviderConfig(
  source: string,
  profile: ProviderProfile,
  model: string,
  helperPath: string,
): string {
  normalizeBaseUrl(profile.baseUrl);
  if (!model.trim()) throw new AppError('测试模型不能为空', 'INVALID_MODEL');
  if (source.includes(`[model_providers.${MANAGED_PROVIDER_ID}]`) && !source.includes(MANAGED_BLOCK_START)) {
    throw new AppError(`配置中已存在 ${MANAGED_PROVIDER_ID}，为避免覆盖已停止切换`, 'CONFIG_CONFLICT');
  }

  let next = removeManagedBlock(source);
  next = setRootString(next, 'model_provider', MANAGED_PROVIDER_ID, true);
  next = setRootString(next, 'model', model.trim(), true);
  if (!next.endsWith('\n')) next += '\n';
  next += `\n${buildManagedBlock(profile, helperPath)}`;
  assertManagedConfig(next, model);
  return next;
}

export function applyLoginConfig(source: string, baseline: LoginBaseline): string {
  let next = removeManagedBlock(source);
  next = setRootString(next, 'model_provider', baseline.modelProvider, baseline.hasModelProvider);
  next = setRootString(next, 'model', baseline.model, baseline.hasModel);
  parseCodexConfig(next);
  return next;
}

function assertManagedConfig(source: string, model: string): void {
  const parsed = parse(source) as Record<string, unknown>;
  if (parsed.model_provider !== MANAGED_PROVIDER_ID || parsed.model !== model.trim()) {
    throw new AppError('生成的 Codex 配置未通过内部校验', 'CONFIG_ASSERTION');
  }
  const providers = parsed.model_providers as Record<string, unknown> | undefined;
  if (!providers || !Object.hasOwn(providers, MANAGED_PROVIDER_ID)) {
    throw new AppError('生成的自定义供应商配置不存在', 'CONFIG_ASSERTION');
  }
}
