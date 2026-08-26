# Contributing to CTools

感谢你帮助改进 CTools。项目会修改本机 Codex 配置并访问 macOS 钥匙串，因此安全性和可恢复性优先于功能数量。参与项目即表示同意遵守 [Code of Conduct](CODE_OF_CONDUCT.md)。

## 开始开发

需要 macOS、Node.js 22+、pnpm 10 和 Xcode Command Line Tools。

```bash
git clone --branch main --single-branch https://github.com/359587/ctools.git
cd ctools
pnpm install --frozen-lockfile
pnpm check
```

启动开发环境时必须使用隔离配置：

```bash
CODEX_HOME="$PWD/tests/fixtures/codex-home" pnpm start
```

不要用真实的 `~/.codex`、真实 API Key 或登录数据进行可提交的测试。

## 安全不变量

涉及配置、凭据或恢复逻辑的修改必须保持以下约束：

- 不读取、修改、备份或提交 `auth.json`。
- API Key 只进入 macOS 钥匙串和发往用户指定端点的请求。
- API Key 不得出现在日志、错误信息、状态文件、截图或测试夹具中。
- 写配置前必须创建可认证的加密快照。
- 配置更新必须使用原子替换，并在写入后执行严格诊断。
- 任一步失败或启动时发现未完成事务，都必须优先恢复原配置。
- 不覆盖用户自建的同名 provider 配置块。

## 提交修改

1. 让改动保持单一目的，并为行为变化补充测试。
2. UI 改动应保留键盘可达性、清晰焦点和非颜色状态提示。
3. 文档、Issue 和截图必须使用示例 URL，并移除个人路径和凭据。
4. 本地运行完整检查：

```bash
pnpm check
pnpm audit:deps
pnpm test:security
pnpm package
```

5. 在 Pull Request 中说明风险、验证方式和恢复路径。

## Issue 与安全问题

普通缺陷和功能建议可以使用仓库的 Issue 模板。可能导致密钥、配置或身份信息泄露的问题，请按 [SECURITY.md](SECURITY.md) 私下报告，不要公开披露。

提交贡献即表示你同意按项目的 [MIT License](LICENSE) 授权该贡献。
