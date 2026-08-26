# CTools

[![CI](https://github.com/359587/ctools/actions/workflows/ci.yml/badge.svg)](https://github.com/359587/ctools/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-6f9e3d.svg)](LICENSE)

CTools 是一个面向 macOS 的 Codex 模式切换器，用于在 ChatGPT 登录模式和兼容 OpenAI Responses API 的自定义供应商之间安全切换。

[English](README.en.md) · [架构说明](docs/ARCHITECTURE.md) · [贡献指南](CONTRIBUTING.md) · [安全策略](SECURITY.md)

![CTools API 供应商页面](artifacts/current-api-restart-action.png)

> 当前公开版本以源码形式发布，尚未提供经过 Apple 公证（notarization）的安装包。

## 为什么做 CTools

手工修改 `~/.codex/config.toml` 容易出现拼写错误、凭据泄露或无法恢复的问题。CTools 把切换过程包装成可回滚事务：先验证供应商，再加密备份配置，写入后运行 Codex 严格诊断；任一步失败都会恢复原配置。

## 功能

- 支持 Cockpit、Sub2API、AIClient2API、9Routor 和自定义供应商。
- API Key 只存入 macOS 钥匙串，不写入应用状态、日志或备份。
- 切换前实际调用 `/responses`，而不只检查 `/models`。
- 使用临时文件和原子替换更新 Codex 配置。
- 写入后运行 `codex --strict-config doctor --json`。
- 失败自动回滚；应用启动时也会恢复未完成事务。
- 首页、历史记录、应用菜单和 `Shift + Command + R` 均可触发恢复。
- 默认测试模型集中配置，并可复用供应商返回的模型列表。

## 工作方式

一次 API 模式切换依次执行：

1. 从 macOS 钥匙串读取 API Key，并对目标 `/responses` 发起最小请求。
2. 停止 Codex，使用 AES-256-GCM 加密当前 `config.toml` 快照。
3. 原子写入由 CTools 管理的供应商配置块。
4. 运行 Codex 严格配置诊断并核对实际模式。
5. 重新启动 Codex；任何异常都会恢复快照并再次启动。

详细的进程边界、存储位置和恢复规则见 [架构说明](docs/ARCHITECTURE.md)。

## 环境要求

- macOS（项目包含 AppKit、Security.framework 和 Keychain 集成）
- Node.js 22 或更高版本
- pnpm 10
- Xcode Command Line Tools（需要 `xcrun swiftc`）
- 已安装 Codex Desktop，或可执行的 Codex CLI

## 从源码运行

```bash
git clone --branch main --single-branch https://github.com/359587/ctools.git
cd ctools
pnpm install --frozen-lockfile
pnpm start
```

CTools 默认读取 `$CODEX_HOME/config.toml`；未设置 `CODEX_HOME` 时读取 `~/.codex/config.toml`。开发和测试时请使用隔离的 `CODEX_HOME`，不要把真实配置或凭据加入测试夹具。

## 校验与构建

```bash
pnpm check     # TypeScript + Vitest
pnpm audit:deps # 已知漏洞审计（唯一忽略项由项目补丁覆盖）
pnpm test:security # 验证归档解压安全补丁
pnpm package   # 生成未封装的 .app
pnpm make      # 生成 .app、DMG 和 ZIP
```

产物位于 `out/`。默认构建使用 ad-hoc 签名，适合本地验证；面向其他用户分发前应配置 Developer ID、Apple 公证和可信发布流程。

## 数据与隐私

| 数据 | 位置 | 说明 |
| --- | --- | --- |
| Codex 配置 | `$CODEX_HOME/config.toml` | 仅修改 CTools 管理的供应商块及根级模型字段 |
| CTools 状态和快照 | `~/Library/Application Support/CTools/` | 配置快照使用 AES-256-GCM 加密 |
| API Key | macOS 钥匙串 `com.ray.ctools.provider` | 不进入状态文件、日志或备份 |
| 快照主密钥 | macOS 钥匙串 `com.ray.ctools.backup` | 仅用于本机快照加解密 |

CTools 不调用 `codex logout`，不修改或备份 `auth.json`。供应商测试会从本机直接请求你配置的 `/models` 和 `/responses` 地址；项目不提供中转服务器。为了保证旧恢复点仍可使用，删除供应商配置不会自动删除其历史钥匙串条目。

## 参与贡献

提交问题前请移除 API Key、Token、真实供应商地址、`auth.json` 内容和个人路径。开发约束与提交检查见 [CONTRIBUTING.md](CONTRIBUTING.md)；安全问题请不要创建公开 Issue，而应遵循 [SECURITY.md](SECURITY.md)。

## 许可证与声明

项目基于 [MIT License](LICENSE) 开源。

CTools 是独立的社区项目，与 OpenAI 不存在隶属、授权或背书关系。OpenAI、ChatGPT 和 Codex 是其各自权利人的商标。第三方 API 的兼容性、安全性、费用和服务条款由对应提供方负责。
