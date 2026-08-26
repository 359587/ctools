import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronRight,
  Clock3,
  CloudCog,
  History,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  RefreshCcw,
  RotateCcw,
  ServerCog,
  Settings2,
  ShieldCheck,
  Trash2,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { TEST_MODEL_PRESETS } from '../shared/constants';
import type {
  AppSnapshot,
  OperationResult,
  ProviderDraft,
  ProviderKind,
  PublicProviderProfile,
  TestProviderResult,
} from '../shared/types';

type View = 'overview' | 'providers' | 'history' | 'settings';
type Toast = { tone: 'success' | 'error' | 'info'; message: string };

const kindLabels: Record<ProviderKind, string> = {
  cockpit: 'Cockpit',
  sub2api: 'Sub2API',
  aiclient2api: 'AIClient2API',
  '9routor': '9Routor',
  custom: '自定义',
};

const emptyDraft: ProviderDraft = {
  kind: 'cockpit',
  name: 'Cockpit',
  baseUrl: '',
  apiKey: '',
};

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>();
  const [view, setView] = useState<View>('overview');
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string>();
  const [toast, setToast] = useState<Toast>();
  const [editor, setEditor] = useState<ProviderDraft>();
  const [suspendedEditor, setSuspendedEditor] = useState<ProviderDraft>();

  const refresh = useCallback(async () => {
    const next = await window.ctools.getSnapshot();
    setSnapshot(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh().catch((error) => {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
      setLoading(false);
    });
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 4_800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    document.body.dataset.ctoolsReady = snapshot && !loading ? 'true' : 'false';
  }, [loading, snapshot]);

  const runOperation = useCallback(
    async (name: string, task: () => Promise<OperationResult>) => {
      setAction(name);
      try {
        const result = await task();
        setSnapshot(result.snapshot);
        setToast({ tone: result.ok ? 'success' : 'error', message: result.message });
        return result;
      } catch (error) {
        setToast({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
      } finally {
        setAction(undefined);
      }
      return undefined;
    },
    [],
  );

  if (loading || !snapshot) {
    return (
      <div className="launch-screen">
        <div className="launch-mark"><ArrowLeftRight size={30} /></div>
        <LoaderCircle className="spin" size={22} />
        <span>正在确认 Codex 恢复点…</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="drag-region" />
        <div className="brand">
          <div className="brand-mark"><ArrowLeftRight size={18} /></div>
          <div><strong>CTools</strong><span>CODEX CONTROL</span></div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          <NavButton icon={<LayoutDashboard size={18} />} active={view === 'overview'} onClick={() => setView('overview')}>总览</NavButton>
          <NavButton icon={<ServerCog size={18} />} active={view === 'providers'} onClick={() => setView('providers')}>API 供应商</NavButton>
          <NavButton icon={<History size={18} />} active={view === 'history'} onClick={() => setView('history')}>切换记录</NavButton>
          <NavButton icon={<Settings2 size={18} />} active={view === 'settings'} onClick={() => setView('settings')}>系统设置</NavButton>
        </nav>

        <div className="sidebar-bottom">
          <div className="rail-status">
            <span className={`signal ${snapshot.status.codexRunning ? 'online' : ''}`} />
            <div><strong>Codex {snapshot.status.codexRunning ? '运行中' : '未运行'}</strong><span>{snapshot.status.loginStatus}</span></div>
          </div>
          <button className="restart-button" onClick={() => void runOperation('restart', window.ctools.restartCodex)} disabled={Boolean(action)}>
            <RefreshCcw size={15} />重新启动
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <div className="top-drag" />
        {view === 'overview' && (
          <Overview
            snapshot={snapshot}
            action={action}
            onSwitchApi={(id) => void runOperation(`switch-${id}`, () => window.ctools.switchToProvider(id))}
            onSwitchLogin={() => void runOperation('switch-login', window.ctools.switchToLogin)}
            onRestore={() => void runOperation('restore-latest', window.ctools.restoreLatest)}
            onAdd={() => { setSuspendedEditor(undefined); setEditor({ ...emptyDraft }); setView('providers'); }}
          />
        )}
        {view === 'providers' && (
          <Providers
            snapshot={snapshot}
            action={action}
            onAdd={() => { setSuspendedEditor(undefined); setEditor({ ...emptyDraft }); }}
            onEdit={(profile) => setEditor(profileToDraft(profile))}
            onSettings={() => setView('settings')}
            onDelete={(id) => void runOperation(`delete-${id}`, () => window.ctools.deleteProvider(id))}
            onTest={async (id) => {
              setAction(`test-${id}`);
              try {
                const result = await window.ctools.testProvider(id);
                setToast({ tone: result.ok ? 'success' : 'error', message: `${result.message} · ${result.latencyMs}ms` });
                await refresh();
              } finally { setAction(undefined); }
            }}
            onSwitch={(id) => void runOperation(`switch-${id}`, () => window.ctools.switchToProvider(id))}
          />
        )}
        {view === 'history' && (
          <HistoryView snapshot={snapshot} action={action} onRestore={(id) => void runOperation(`restore-${id}`, () => window.ctools.restoreBackup(id))} />
        )}
        {view === 'settings' && (
          <SettingsView
            snapshot={snapshot}
            action={action}
            hasSuspendedEditor={Boolean(suspendedEditor)}
            onSave={(testModel) => runOperation('save-settings', () => window.ctools.updateSettings({ testModel }))}
            onReturnToProvider={() => {
              setView('providers');
              if (suspendedEditor) setEditor(suspendedEditor);
              setSuspendedEditor(undefined);
            }}
          />
        )}
      </main>

      {editor && (
        <ProviderEditor
          draft={editor}
          setDraft={setEditor}
          action={action}
          onClose={() => setEditor(undefined)}
          onToast={setToast}
          testModel={snapshot.settings.testModel}
          onOpenSettings={(draft) => {
            setSuspendedEditor(draft);
            setEditor(undefined);
            setView('settings');
          }}
          onSave={async (draft, shouldSwitch) => {
            const result = await runOperation('save-provider', () => window.ctools.saveProvider(draft));
            if (!result?.ok) return;
            setEditor(undefined);
            if (shouldSwitch) {
              const savedId = draft.id ?? result.snapshot.profiles[0]?.id;
              if (savedId) await runOperation(`switch-${savedId}`, () => window.ctools.switchToProvider(savedId));
            }
          }}
        />
      )}

      {action && <div className="operation-pill"><LoaderCircle className="spin" size={15} />正在执行安全事务，请勿退出…</div>}
      {toast && <div className={`toast ${toast.tone}`}><span>{toast.tone === 'success' ? <Check size={17} /> : toast.tone === 'error' ? <AlertTriangle size={17} /> : <Activity size={17} />}</span>{toast.message}<button onClick={() => setToast(undefined)}><X size={15} /></button></div>}
    </div>
  );
}

function Overview(props: {
  snapshot: AppSnapshot;
  action?: string;
  onSwitchApi(id: string): void;
  onSwitchLogin(): void;
  onRestore(): void;
  onAdd(): void;
}) {
  const { status, profiles } = props.snapshot;
  return (
    <section className="page overview-page">
      <header className="page-header">
        <div><p className="eyebrow">MODE CONTROL</p><h1>Codex 运行模式</h1><p>每次切换都先封存原配置，验证失败会自动回写。</p></div>
        <div className={`mode-badge ${status.mode}`}><span />{status.mode === 'api' ? 'API 模式' : '登录模式'}</div>
      </header>

      <div className="mode-stage">
        <div className="mode-orbit" aria-hidden="true"><span /><span /><span /></div>
        <div className="mode-core">
          <div className="core-icon">{status.mode === 'api' ? <CloudCog size={34} /> : <ShieldCheck size={34} />}</div>
          <span className="core-label">当前通道</span>
          <strong>{status.mode === 'api' ? status.activeProviderName ?? 'CTools API' : 'ChatGPT 登录'}</strong>
          <code>{status.model ?? '使用 Codex 默认模型'}</code>
        </div>
        <div className="mode-facts">
          <Fact label="配置文件" value={status.configExists ? '已连接' : '将自动创建'} good={status.configExists} />
          <Fact label="严格诊断" value={status.doctorAvailable ? '可用' : '不可用'} good={status.doctorAvailable} />
          <Fact label="桌面端" value={status.codexRunning ? '运行中' : '已停止'} good={status.codexRunning} />
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel switch-panel">
          <div className="panel-heading"><div><span className="panel-index">01</span><div><h2>一键切换</h2><p>切换时 Codex 会正常退出并自动重启</p></div></div><Zap size={20} /></div>
          {status.mode === 'api' ? (
            <button className="primary-action login-action" onClick={props.onSwitchLogin} disabled={Boolean(props.action)}>
              <ShieldCheck size={20} /><span><strong>切回登录模式</strong><small>恢复首次启动时的 provider 与模型</small></span><ChevronRight size={19} />
            </button>
          ) : profiles.length ? (
            <div className="quick-providers">
              {profiles.slice(0, 3).map((profile) => (
                <button key={profile.id} onClick={() => props.onSwitchApi(profile.id)} disabled={Boolean(props.action)}>
                  <ProviderGlyph kind={profile.kind} /><span><strong>{profile.name}</strong><small>{safeHost(profile.baseUrl)}</small></span><ChevronRight size={18} />
                </button>
              ))}
            </div>
          ) : (
            <button className="primary-action" onClick={props.onAdd}><Plus size={20} /><span><strong>添加第一个 API</strong><small>填写 URL 和 Key，测试模型由系统设置统一管理</small></span><ChevronRight size={19} /></button>
          )}
        </section>

        <section className="panel recovery-panel">
          <div className="panel-heading"><div><span className="panel-index danger">SOS</span><div><h2>紧急还原</h2><p>不依赖当前 API，直接恢复切换前原文</p></div></div><RotateCcw size={20} /></div>
          <div className="recovery-copy"><ShieldCheck size={22} /><div><strong>{status.recoveryAvailable ? '恢复点已就绪' : '暂无恢复点'}</strong><span>{status.recoveryLabel ?? '首次启动后会自动建立'}</span></div></div>
          <button className="danger-action" onClick={props.onRestore} disabled={!status.recoveryAvailable || Boolean(props.action)}><RotateCcw size={18} />一键还原 Codex</button>
          <p className="shortcut-hint">页面异常时仍可使用菜单 CTools → 紧急还原，快捷键 ⇧⌘R</p>
        </section>
      </div>

      <div className="path-strip"><KeyRound size={15} /><span>受控配置</span><code>{status.configPath}</code><span className="path-safe"><ShieldCheck size={14} />快照已加密</span></div>
    </section>
  );
}

function Providers(props: {
  snapshot: AppSnapshot;
  action?: string;
  onAdd(): void;
  onEdit(profile: PublicProviderProfile): void;
  onSettings(): void;
  onDelete(id: string): void;
  onTest(id: string): void;
  onSwitch(id: string): void;
}) {
  return (
    <section className="page">
      <header className="page-header compact">
        <div><p className="eyebrow">PROVIDER RACK</p><h1>API 供应商</h1><p>密钥只保存在 macOS 钥匙串；连接测试统一使用系统测试模型。</p></div>
        <div className="header-actions"><button className="settings-button" onClick={props.onSettings}><Settings2 size={16} />测试模型</button><button className="add-button" onClick={props.onAdd}><Plus size={17} />添加供应商</button></div>
      </header>

      {props.snapshot.profiles.length === 0 ? (
        <div className="empty-state"><ServerCog size={34} /><h2>供应商机架为空</h2><p>支持 Cockpit、Sub2API、AIClient2API、9Routor 和其他 Responses API。</p><button onClick={props.onAdd}><Plus size={17} />立即添加</button></div>
      ) : (
        <div className="provider-grid">
          {props.snapshot.profiles.map((profile, index) => {
            const active = props.snapshot.status.mode === 'api' && props.snapshot.status.activeProviderId === profile.id;
            return (
              <article className={`provider-card ${active ? 'active' : ''}`} key={profile.id}>
                <div className="card-top"><span className="slot">SLOT {String(index + 1).padStart(2, '0')}</span>{active && <span className="active-flag"><span />运行中</span>}</div>
                <div className="provider-title"><ProviderGlyph kind={profile.kind} /><div><h2>{profile.name}</h2><span>{kindLabels[profile.kind]}</span></div></div>
                <dl><div><dt>TEST MODEL</dt><dd title="系统设置中的默认测试模型">{props.snapshot.settings.testModel}</dd></div><div><dt>ENDPOINT</dt><dd title={profile.baseUrl}>{safeHost(profile.baseUrl)}</dd></div><div><dt>KEY</dt><dd>•••••••••••• <ShieldCheck size={13} /></dd></div></dl>
                <div className={`test-state ${profile.lastTestOk === false ? 'bad' : ''}`}><Wifi size={14} /><span>{profile.lastTestMessage ?? '尚未测试连接'}</span>{profile.lastTestedAt && <time>{relativeTime(profile.lastTestedAt)}</time>}</div>
                <div className={`card-actions ${active ? 'active-actions' : ''}`}>
                  <button onClick={() => props.onTest(profile.id)} disabled={Boolean(props.action)}>{props.action === `test-${profile.id}` ? <LoaderCircle className="spin" size={15} /> : <Activity size={15} />}测试</button>
                  <button onClick={() => props.onEdit(profile)}><Pencil size={15} />编辑</button>
                  <button className="icon-button" aria-label="删除" onClick={() => props.onDelete(profile.id)} disabled={active}><Trash2 size={15} /></button>
                  {active ? <button className="reapply-button" title="重新应用当前 API 配置并重启 Codex" onClick={() => props.onSwitch(profile.id)} disabled={Boolean(props.action)}>{props.action === `switch-${profile.id}` ? <LoaderCircle className="spin" size={15} /> : <RefreshCcw size={15} />}切换并重启</button> : null}
                  <button className="switch-button" onClick={() => props.onSwitch(profile.id)} disabled={active || Boolean(props.action)}>{active ? <><Check size={15} />当前</> : <><Power size={15} />切换</>}</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function HistoryView(props: { snapshot: AppSnapshot; action?: string; onRestore(id: string): void }) {
  const backupIds = useMemo(() => new Set(props.snapshot.backups.map((backup) => backup.id)), [props.snapshot.backups]);
  return (
    <section className="page">
      <header className="page-header compact"><div><p className="eyebrow">TRANSACTION LOG</p><h1>切换记录</h1><p>每条成功事务都能回到写入前状态。</p></div></header>
      <div className="history-table">
        <div className="history-head"><span>时间</span><span>操作</span><span>目标</span><span>状态</span><span /></div>
        {props.snapshot.history.length === 0 ? <div className="history-empty"><Clock3 size={24} />还没有切换记录</div> : props.snapshot.history.map((record) => (
          <div className="history-row" key={record.id}>
            <time>{formatDate(record.createdAt)}</time>
            <div><ActionIcon action={record.action} /><span>{actionLabel(record.action)}<small>{record.message}</small></span></div>
            <div><strong>{record.providerName ?? (record.toMode === 'login' ? 'ChatGPT 登录' : 'API 模式')}</strong><small>{record.model ?? `${record.fromMode.toUpperCase()} → ${record.toMode.toUpperCase()}`}</small></div>
            <span className={`record-status ${record.status}`}>{record.status === 'success' ? '完成' : record.status === 'recovered' ? '已保护' : '失败'}</span>
            <button disabled={!record.backupId || !backupIds.has(record.backupId) || Boolean(props.action)} onClick={() => record.backupId && props.onRestore(record.backupId)}><RotateCcw size={15} />还原</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProviderEditor(props: {
  draft: ProviderDraft;
  setDraft(draft: ProviderDraft): void;
  action?: string;
  onClose(): void;
  onToast(toast: Toast): void;
  testModel: string;
  onOpenSettings(draft: ProviderDraft): void;
  onSave(draft: ProviderDraft, shouldSwitch: boolean): Promise<void>;
}) {
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestProviderResult>();
  const set = (field: keyof ProviderDraft, value: string) => props.setDraft({ ...props.draft, [field]: value });
  const selectKind = (kind: ProviderKind) => {
    const currentDefault = kindLabels[props.draft.kind];
    props.setDraft({ ...props.draft, kind, name: !props.draft.name || props.draft.name === currentDefault ? kindLabels[kind] : props.draft.name });
  };
  const doTest = async () => {
    setTesting(true);
    try {
      const result = await window.ctools.testProviderDraft(props.draft);
      setTest(result);
      props.onToast({ tone: result.ok ? 'success' : 'error', message: `${result.message} · ${result.latencyMs}ms` });
    } catch (error) {
      props.onToast({ tone: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally { setTesting(false); }
  };
  const valid = props.draft.name.trim() && props.draft.baseUrl.trim() && (props.draft.id || props.draft.apiKey?.trim());

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <header><div><span className="editor-kicker">NEW CONNECTION</span><h2 id="editor-title">{props.draft.id ? '编辑 API 供应商' : '接入 API 供应商'}</h2><p>地址需要兼容 OpenAI Responses API。</p></div><button aria-label="关闭" onClick={props.onClose}><X size={19} /></button></header>
        <div className="kind-picker">
          {(Object.keys(kindLabels) as ProviderKind[]).map((kind) => <button key={kind} className={props.draft.kind === kind ? 'selected' : ''} onClick={() => selectKind(kind)}><ProviderGlyph kind={kind} />{kindLabels[kind]}</button>)}
        </div>
        <div className="form-grid">
          <label><span>显示名称</span><input value={props.draft.name} onChange={(event) => set('name', event.target.value)} placeholder="例如：公司 Sub2API" /></label>
          <div className="model-preview-field"><span>默认测试模型</span><div className="model-preview"><code>{props.testModel}</code><button type="button" onClick={() => props.onOpenSettings(props.draft)}><Settings2 size={14} />去设置</button></div><small>测试和切换默认使用此模型；进入 Codex 后仍可选择供应商支持的其他模型。</small></div>
          <label className="wide"><span>API Base URL</span><div className="input-with-icon"><CloudCog size={16} /><input value={props.draft.baseUrl} onChange={(event) => set('baseUrl', event.target.value)} placeholder="https://example.com/v1" spellCheck={false} /></div><small>远程地址必须使用 HTTPS，本机可使用 HTTP。</small></label>
          <label className="wide"><span>API Key</span><div className="input-with-icon"><KeyRound size={16} /><input type="password" value={props.draft.apiKey ?? ''} onChange={(event) => set('apiKey', event.target.value)} placeholder={props.draft.id ? '已安全保存；留空表示不更新' : '输入 API Key'} autoComplete="off" spellCheck={false} /></div><small>密钥写入 macOS 钥匙串，不进入配置历史和备份。</small></label>
        </div>
        {test && <div className={`inline-test ${test.ok ? 'ok' : 'bad'}`}>{test.ok ? <Check size={16} /> : <AlertTriangle size={16} />}<span>{test.message}</span><time>{test.latencyMs}ms</time></div>}
        <footer><button className="secondary" onClick={doTest} disabled={!valid || testing}>{testing ? <LoaderCircle className="spin" size={16} /> : <Wifi size={16} />}测试连接</button><span className="footer-spacer" /><button className="secondary" onClick={() => void props.onSave(props.draft, false)} disabled={!valid || Boolean(props.action)}>仅保存</button><button className="save-switch" onClick={() => void props.onSave(props.draft, true)} disabled={!valid || Boolean(props.action)}><Zap size={16} />保存并切换</button></footer>
      </section>
    </div>
  );
}

function SettingsView(props: {
  snapshot: AppSnapshot;
  action?: string;
  hasSuspendedEditor: boolean;
  onSave(testModel: string): Promise<OperationResult | undefined>;
  onReturnToProvider(): void;
}) {
  const currentModel = props.snapshot.settings.testModel;
  const modelOptions = useMemo(
    () => [...new Set([
      ...TEST_MODEL_PRESETS,
      ...props.snapshot.profiles.flatMap((profile) => profile.availableModels ?? []),
    ])],
    [props.snapshot.profiles],
  );
  const [testModel, setTestModel] = useState(currentModel);
  const isKnownModel = modelOptions.includes(testModel);
  const dirty = testModel.trim() !== currentModel;

  useEffect(() => setTestModel(currentModel), [currentModel]);

  return (
    <section className="page settings-page">
      <header className="page-header compact">
        <div><h1>系统设置</h1><p>这里的模型只用于供应商验证和 API 模式的初始配置。</p></div>
        {props.hasSuspendedEditor ? <button className="return-button" onClick={props.onReturnToProvider}><ChevronRight size={16} />返回 API 填写</button> : null}
      </header>

      <div className="settings-layout">
        <section className="settings-form" aria-labelledby="test-model-title">
          <div className="settings-section-heading"><span><Settings2 size={19} /></span><div><h2 id="test-model-title">默认测试模型</h2><p>供应商表单不再要求重复填写模型。</p></div></div>
          <label htmlFor="test-model-select">选择模型</label>
          <select
            id="test-model-select"
            value={isKnownModel ? testModel : '__custom__'}
            onChange={(event) => setTestModel(event.target.value === '__custom__' ? '' : event.target.value)}
          >
            {modelOptions.map((model) => <option value={model} key={model}>{model}</option>)}
            <option value="__custom__">自定义模型…</option>
          </select>
          {!isKnownModel ? <><label htmlFor="custom-test-model">自定义模型名称</label><input id="custom-test-model" value={testModel} onChange={(event) => setTestModel(event.target.value)} placeholder="输入供应商返回的准确模型 ID" spellCheck={false} autoFocus /></> : null}
          <div className="settings-preview"><span>当前将使用</span><code>{testModel.trim() || '尚未填写'}</code></div>
          <div className="settings-actions"><button className="save-settings" disabled={!dirty || !testModel.trim() || Boolean(props.action)} onClick={() => void props.onSave(testModel.trim())}>{props.action === 'save-settings' ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}保存设置</button></div>
        </section>

        <aside className="settings-explainer">
          <span className="explainer-icon"><ShieldCheck size={21} /></span>
          <h2>模型选择如何生效</h2>
          <ol><li><strong>连接测试</strong><span>用此模型调用供应商的 Responses API。</span></li><li><strong>切换初始值</strong><span>切换 API 模式时写入 Codex 的默认 model。</span></li><li><strong>Codex 内选择</strong><span>进入桌面端后，仍可选择该供应商支持的其他模型。</span></li></ol>
          <p>修改设置不会直接改写正在运行的 Codex；会在下一次测试或切换时生效。</p>
          <div className="active-model"><span>当前 Codex 模型</span><code>{props.snapshot.status.model ?? 'Codex 默认'}</code></div>
        </aside>
      </div>
    </section>
  );
}

function NavButton(props: { icon: React.ReactNode; active: boolean; onClick(): void; children: React.ReactNode }) { return <button className={props.active ? 'active' : ''} onClick={props.onClick}>{props.icon}<span>{props.children}</span>{props.active && <i />}</button>; }
function Fact(props: { label: string; value: string; good: boolean }) { return <div><span className={props.good ? 'good' : ''}>{props.good ? <Check size={13} /> : <AlertTriangle size={13} />}</span><div><small>{props.label}</small><strong>{props.value}</strong></div></div>; }
function ProviderGlyph({ kind }: { kind: ProviderKind }) { const glyphs: Record<ProviderKind, string> = { cockpit: 'CP', sub2api: 'S2', aiclient2api: 'AI', '9routor': '9R', custom: '＋' }; return <span className={`provider-glyph kind-${kind}`}>{glyphs[kind]}</span>; }
function ActionIcon({ action }: { action: string }) { return <span className="history-icon">{action === 'restore' || action === 'auto-recover' ? <RotateCcw size={16} /> : <ArrowLeftRight size={16} />}</span>; }
function profileToDraft(profile: PublicProviderProfile): ProviderDraft { return { id: profile.id, kind: profile.kind, name: profile.name, baseUrl: profile.baseUrl, apiKey: '' }; }
function safeHost(value: string) { try { const url = new URL(value); return `${url.host}${url.pathname}`.replace(/\/$/, ''); } catch { return value; } }
function formatDate(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)); }
function relativeTime(value: string) { const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000); return minutes < 1 ? '刚刚' : minutes < 60 ? `${minutes} 分钟前` : formatDate(value); }
function actionLabel(action: string) { return action === 'switch-api' ? '切换 API' : action === 'switch-login' ? '切回登录' : action === 'auto-recover' ? '自动保护' : '手动还原'; }
