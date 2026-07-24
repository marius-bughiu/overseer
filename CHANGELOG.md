# Changelog

All notable changes to Overseer are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-25

The first public release of Overseer.

### Added

#### Discovery

- **Tailscale device discovery** via two backends:
  - the local `tailscale status --json` CLI (zero-config, the default on
    desktop), and
  - the Tailscale REST API (works on every platform, including mobile).
- The **local machine is marked** in the device list.
- **Manual (non-Tailscale) hosts** — add any reachable host by name or address.
- **TCP latency / health ping** per machine, and a **port scan** to find which
  remote services are actually listening.

#### Connecting

- **Embedded, in-app sessions** in a tabbed workspace — no external client
  required:
  - **VNC** (via noVNC),
  - **RDP** (via IronRDP — canvas framebuffer with full keyboard/mouse input),
  - **SSH** (via russh, with an xterm.js terminal),
  - **Telnet**.
- **External launch** is still supported for RDP and VNC: a generated `.rdp`
  file on desktop, `rdp://` deep links on mobile, and `vnc://` URLs everywhere.
- Protocols are **filtered by the machine's OS**, defaulting to the recommended
  one for that platform.
- **SFTP file transfer** with an in-app file browser over SSH.
- **Wake-on-LAN**, sent from a peer on the same subnet.
- **Session ergonomics**: fullscreen toggle, per-machine RDP resolution with
  scale-to-fit, bounded auto-reconnect, in-place session reopen, a session
  overview grid with live thumbnails, and a per-session log with honest
  connection status and surfaced errors.
- **Clipboard**: paste the local clipboard into any session, plus experimental
  RDP clipboard redirection over CLIPRDR.
- **Command snippets**, pasted into terminals as keystrokes.
- **Terminal session recording** to [asciicast](https://docs.asciinema.org/manual/asciicast/v2/).
- Open a device's **web console** in an in-app window.

#### Security

- **Encrypted credential vault** (IOTA Stronghold) for per-machine credentials
  and the Tailscale API token, unlocked by a master password. Passwords are
  never written into launch URIs, `.rdp` files, or logs.
- **SSH public-key authentication** for embedded SSH and SFTP.
- **TOFU host-key trust store** for SSH/SFTP, with explicit prompts on change.
- **TOTP (2FA) authenticator** stored in the vault.
- **Idle auto-lock**, and **biometric app lock** on mobile.
- **Credential import** from common password managers.

#### Organizing & UI

- **Machine browser**: search, online/favorites filters, OS icons, live status,
  ACL tags, and one-click copy of IPs / MagicDNS names.
- **Connection profiles, folders, and history** with quick-reconnect.
- **Command palette** (<kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd>).
- **Light and dark themes** via a CSS-variable palette.
- **Localization (i18n)** framework with a language picker.
- **Import/export** of settings and connections as JSON, plus file-based
  settings sync across devices.

#### Platform & project

- **Cross-platform shell** (Tauri 2) targeting Windows, macOS, Linux, Android,
  and iOS.
- **`overseer-core`** — a dependency-light, fully unit-tested Rust crate holding
  the discovery-parsing, connection-building, Wake-on-LAN, credential-import,
  and recording logic.
- Prebuilt desktop installers for **Windows** (`.msi`, `.exe`), **macOS**
  (`.dmg`, Apple Silicon and Intel), and **Linux** (`.AppImage`, `.deb`,
  `.rpm`).
- Project scaffolding: CI, issue/PR templates, Dependabot, docs
  (`README`, `CLAUDE.md`, `SECURITY.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`).

### Known limitations

- Desktop binaries are **not code-signed or notarized**. Windows SmartScreen and
  macOS Gatekeeper will warn on first launch — see the README for how to open
  them.
- Android and iOS builds are not yet distributed through the app stores.
- RDP clipboard redirection is experimental.

[Unreleased]: https://github.com/marius-bughiu/overseer/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/marius-bughiu/overseer/releases/tag/v0.1.0
