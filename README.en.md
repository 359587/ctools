# CTools

[![CI](https://github.com/359587/ctools/actions/workflows/ci.yml/badge.svg)](https://github.com/359587/ctools/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-6f9e3d.svg)](LICENSE)

CTools is a macOS utility for safely switching Codex between ChatGPT login mode and custom providers that implement the OpenAI Responses API.

[中文](README.md) · [Architecture](docs/ARCHITECTURE.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

![CTools provider screen](artifacts/current-api-restart-action.png)

> The public project is currently distributed as source. No Apple-notarized binary is provided yet.

## Why CTools

Editing `~/.codex/config.toml` by hand can introduce typos, leak credentials, or leave Codex unusable. CTools treats a switch as a reversible transaction: it verifies the provider, creates an encrypted snapshot, writes the configuration atomically, and runs Codex diagnostics. Any failed step restores the original configuration.

## Features

- Presets for Cockpit, Sub2API, AIClient2API, and 9Routor, plus custom providers.
- API keys live in macOS Keychain and are excluded from state, logs, and backups.
- Preflight checks call `/responses`, not only `/models`.
- Atomic configuration writes followed by `codex --strict-config doctor --json`.
- Automatic rollback on failure and startup recovery for interrupted operations.
- Recovery from the dashboard, history, native menu, or `Shift + Command + R`.
- A shared test-model setting enriched with models discovered from providers.

## Requirements

- macOS
- Node.js 22 or later
- pnpm 10
- Xcode Command Line Tools (`xcrun swiftc` is used for the native helper)
- Codex Desktop or an executable Codex CLI

## Run from source

```bash
git clone --branch main --single-branch https://github.com/359587/ctools.git
cd ctools
pnpm install --frozen-lockfile
pnpm start
```

CTools reads `$CODEX_HOME/config.toml`, falling back to `~/.codex/config.toml`. Always use an isolated `CODEX_HOME` for development and tests. Never add a real configuration or credential to a fixture.

## Validate and build

```bash
pnpm check
pnpm audit:deps
pnpm test:security
pnpm package
pnpm make
```

Build outputs are written to `out/`. The default build is ad-hoc signed for local validation. Distribution to other users should use a Developer ID, Apple notarization, and a trusted release process.

## Data and privacy

| Data | Location | Notes |
| --- | --- | --- |
| Codex configuration | `$CODEX_HOME/config.toml` | CTools scopes changes to its managed provider block and root model fields |
| CTools state and snapshots | `~/Library/Application Support/CTools/` | Configuration snapshots use AES-256-GCM |
| API keys | macOS Keychain service `com.ray.ctools.provider` | Excluded from state, logs, and backups |
| Snapshot master key | macOS Keychain service `com.ray.ctools.backup` | Used only for local snapshot encryption |

CTools does not call `codex logout` and does not modify or back up `auth.json`. Provider tests connect directly from your Mac to the configured `/models` and `/responses` endpoints; this project does not operate a proxy. Deleting a provider keeps its historical Keychain entry so older recovery points remain usable.

## Contributing

Remove API keys, tokens, real provider URLs, `auth.json` contents, and personal paths before opening an issue. See [CONTRIBUTING.md](CONTRIBUTING.md) for development rules. Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## License and disclaimer

Licensed under the [MIT License](LICENSE).

CTools is an independent community project and is not affiliated with, authorized by, or endorsed by OpenAI. OpenAI, ChatGPT, and Codex are trademarks of their respective owners. Compatibility, security, pricing, and terms for third-party APIs remain the responsibility of their providers.
