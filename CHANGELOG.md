# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)。

## [0.1.1] - 2026-08-26

首次公开源码版本。

### Added

- ChatGPT 登录模式与 Responses API 供应商之间的一键切换。
- Cockpit、Sub2API、AIClient2API、9Routor 和自定义供应商配置。
- macOS 钥匙串 API Key 存储和 AES-256-GCM 配置快照。
- `/responses` 连接预检、Codex 严格诊断、原子写入和自动回滚。
- 启动恢复、历史恢复和 `Shift + Command + R` 紧急恢复。
- 中英文 README、架构说明、贡献指南、安全策略、Issue 模板和 CI。

### Security

- 更新存在已知漏洞的归档与临时文件构建依赖。
- 为 Electron ZIP 解压流程增加 symlink 越界保护。
- 使用 macOS 原生 `hdiutil` 替代存在未修复图片解析漏洞的旧 DMG 工具链。

[0.1.1]: https://github.com/359587/ctools/releases/tag/v0.1.1
