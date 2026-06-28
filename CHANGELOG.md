# Changelog

All notable changes to Overseer are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-28

Initial public release — the foundation of Overseer.

### Added

- **Tailscale device discovery** via two backends:
  - the Tailscale REST API (works on all platforms, including mobile), and
  - the local `tailscale status --json` CLI (zero-config on desktop).
- **One-tap RDP and VNC connections**, launched through the platform's remote
  desktop client:
  - desktop RDP via a generated `.rdp` file,
  - mobile RDP via `rdp://` deep links,
  - VNC via `vnc://` URLs on every platform.
- **Encrypted credential vault** (IOTA Stronghold) for per-machine credentials
  and the Tailscale API token, unlocked by a master password.
- **Machine browser UI**: search, online/favorites filters, OS icons, live
  status, ACL tags, and one-click copy of IPs / MagicDNS names.
- **Cross-platform shell** (Tauri 2) targeting Windows, macOS, Linux, Android,
  and iOS.
- **`overseer-core`** — a dependency-light, fully unit-tested Rust crate holding
  the discovery-parsing and connection-building logic.
- Project scaffolding: CI, issue/PR templates, Dependabot, docs
  (`README`, `CLAUDE.md`, `SECURITY.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`).

[Unreleased]: https://github.com/marius-bughiu/overseer/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/marius-bughiu/overseer/releases/tag/v0.1.0
