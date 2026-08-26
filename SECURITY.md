# Security Policy

## Supported versions

安全修复以 `main` 分支和最新 GitHub Release 为准。早期版本可能不会单独维护。

## Reporting a vulnerability

请通过 GitHub 的 [Private vulnerability reporting](https://github.com/359587/ctools/security/advisories/new) 私下提交安全问题，不要创建公开 Issue。

报告时请包含：

- 受影响版本或 commit；
- 可复现的最小步骤；
- 影响范围和你观察到的结果；
- 已脱敏的日志或测试夹具。

请勿提交真实 API Key、Token、`auth.json`、完整 `config.toml`、钥匙串导出、个人路径或第三方账户信息。维护者确认问题并准备修复前，请避免公开细节。

## Security boundaries

- API Key 存储在 macOS 钥匙串中，但 CTools 在连接测试时必须把它发送到用户配置的 API 端点。
- 配置快照使用 AES-256-GCM 加密，主密钥存储在 macOS 钥匙串中。
- CTools 不读取、修改或备份 Codex 的 `auth.json`。
- 默认本地构建仅使用 ad-hoc 签名；源码可见不等同于已公证的二进制可信。
- 自定义 API 供应商属于独立信任边界，用户应自行核验其身份、隐私政策、费用和兼容性。

`pnpm audit:deps` 只忽略 `CVE-2026-56876`：上游 `extract-zip` 尚无修复版本，本项目通过 `patches/extract-zip@2.0.1.patch` 阻止 symlink 逃逸，并由 `pnpm test:security` 执行恶意与正常 ZIP 回归测试。移除该补丁前必须同时移除审计忽略项。

如果真实凭据意外进入公开 Issue、日志、截图或 Git 历史，请立即在对应服务撤销并轮换凭据；仅删除公开内容不能使已泄露凭据重新安全。
