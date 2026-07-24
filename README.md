<div align="center">

<img src="assets/logo-512.png" alt="Overseer logo" width="128" height="128" />

# Overseer

### The cross-platform Tailscale remote desktop manager

**Discover every machine on your tailnet and connect over RDP, VNC, SSH or Telnet — from Windows, macOS, Linux, Android, and iOS — with credentials sealed in an encrypted vault.**

[![CI](https://github.com/marius-bughiu/overseer/actions/workflows/ci.yml/badge.svg)](https://github.com/marius-bughiu/overseer/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/marius-bughiu/overseer?display_name=tag&sort=semver)](https://github.com/marius-bughiu/overseer/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB.svg)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-stable-orange.svg)](https://www.rust-lang.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Features](#-features) · [Download](#-download) · [How it works](#-how-it-works) · [Build from source](#-build-from-source) · [Security](#-security) · [Roadmap](#-roadmap) · [Contributing](#-contributing)

</div>

---

## What is Overseer?

**Overseer** is a free, open-source **remote desktop manager built for [Tailscale](https://tailscale.com)**. It automatically lists the machines on your tailnet and lets you open a secure **RDP**, **VNC**, **SSH** or **Telnet** session to any of them in one tap — over Tailscale's encrypted WireGuard® mesh, with no port forwarding, no public IPs, and no exposed RDP ports.

It runs everywhere Tailscale does: **Windows, macOS, Linux, Android, and iOS**. It's a single, fast, native-feeling app built with [**Tauri 2**](https://tauri.app) and Rust — a real native webview, not a 200 MB Electron bundle.

> Think of it as the address book + launcher for all your remote machines, powered by the private network you already trust.

<div align="center">
<img src="docs/screenshot.png" alt="Overseer machine list showing discovered Tailscale devices" width="820" />
<br/><sub>The Overseer machine browser — every device on your tailnet, online status, and one-tap connect.</sub>
</div>

## ✨ Features

- 🔍 **Automatic Tailscale discovery** — every device on your tailnet, online/offline status, OS, IPs and ACL tags, with no manual host entry.
- 🪟 **Embedded sessions, in-app** — **RDP**, **VNC**, **SSH** and **Telnet** open as tabs inside Overseer. No external client needed; you can still hand a session off to your OS client if you prefer.
- 📂 **SFTP file browser** — drag files to and from any SSH host without leaving the app.
- 🔐 **Encrypted credential vault** — usernames, passwords, SSH keys and TOTP secrets are stored with [IOTA Stronghold](https://github.com/iotaledger/stronghold.rs), encrypted at rest behind a master password. Passwords are **never** written into launch URIs or `.rdp` files.
- 🌐 **Two discovery modes** — the local **`tailscale` CLI** (zero config, the default) or the **Tailscale API** (works on every platform, including mobile). Manual hosts are supported too.
- 🗂️ **Profiles, folders & history** — organize connections, then reconnect from the command palette (<kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>K</kbd>).
- 📶 **Health at a glance** — per-machine latency pings, port scans, live session thumbnails, and Wake-on-LAN for sleeping boxes.
- ⭐ **Favorites, search & filters** — find the machine you need instantly, even across a large tailnet.
- 🪶 **Tiny & native** — Rust + Tauri 2, a real native webview, no Electron, no telemetry.
- 🌗 **Light & dark themes**, plus a localization framework with a language picker.
- 🆓 **Open source, MIT licensed** — audit it, fork it, ship it.

## 🔑 Why Tailscale + Overseer?

Traditional remote desktop means exposing RDP (port 3389) to the internet — one of the most attacked ports there is — or wrangling a VPN. With Tailscale, every machine gets a stable private `100.x` address reachable only by your devices. **Overseer turns that private mesh into a friendly, searchable remote desktop console.**

| Without Overseer | With Overseer |
| --- | --- |
| Remember IPs / MagicDNS names | Auto-discovered machine list |
| Hand-craft `.rdp` files | One-tap connect |
| Passwords in plaintext config | Encrypted vault |
| Different tools per platform | One app on all 5 platforms |

## 📥 Download

Grab the latest installer from the [**Releases**](https://github.com/marius-bughiu/overseer/releases/latest) page.

| Platform | Artifact |
| --- | --- |
| **Windows** (x64) | `Overseer_<version>_x64-setup.exe` or `Overseer_<version>_x64_en-US.msi` |
| **macOS** (Apple Silicon) | `Overseer_<version>_aarch64.dmg` |
| **macOS** (Intel) | `Overseer_<version>_x64.dmg` |
| **Linux** (x64) | `.AppImage`, `.deb`, or `.rpm` |
| Android | `.apk` / Play Store *(planned)* |
| iOS | App Store / TestFlight *(planned)* |

> ⚠️ Overseer is in active early development (`v0.1.x`). Expect rough edges, and please [file issues](https://github.com/marius-bughiu/overseer/issues).

### Opening an unsigned build

These binaries are **not yet code-signed or notarized** — code-signing certificates cost money that this project doesn't have yet. The OS will warn you on first launch:

- **macOS** — the first launch is blocked as being from an unidentified developer. Right-click the app in `/Applications` → **Open** → **Open**, or clear the quarantine flag:
  ```bash
  xattr -dr com.apple.quarantine /Applications/Overseer.app
  ```
- **Windows** — SmartScreen shows "Windows protected your PC". Click **More info** → **Run anyway**.

If you'd rather not trust an unsigned binary, [build from source](#-build-from-source) — it's three commands.

## 🚀 How it works

1. **Discover** — Overseer asks Tailscale for your devices, either through the local `tailscale status` command (the default) or the [Tailscale REST API](https://tailscale.com/api) using an access token you provide.
2. **Choose** — you select a machine, a protocol (RDP/VNC/SSH/Telnet), a port, and optionally a saved credential. Overseer only offers the protocols that make sense for that machine's OS.
3. **Connect** — either way you like:
   - **Embedded (default)** → the session opens as a tab inside Overseer. RDP is driven by [IronRDP](https://github.com/Devolutions/IronRDP), VNC by [noVNC](https://novnc.com), SSH/SFTP by [russh](https://github.com/Eugeny/russh), all rendered straight into the app.
   - **External** → Overseer builds the correct launch artifact and hands it to your OS: a `.rdp` file (`mstsc` on Windows, *Windows App* on macOS), an `rdp://` deep link on mobile, or a `vnc://` URL for Screen Sharing / RealVNC.

All traffic flows over your encrypted Tailscale connection. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

<div align="center">
<img src="docs/connect.png" alt="Overseer connect dialog with RDP/VNC protocol selection, host, port and encrypted credentials" width="560" />
<br/><sub>Choose RDP or VNC, optionally save credentials to the encrypted vault, and connect.</sub>
</div>

## 🛠️ Tech stack

- **[Tauri 2](https://tauri.app)** — cross-platform desktop **and** mobile shell.
- **Rust** — the backend, with a dependency-light [`overseer-core`](crates/overseer-core) crate holding the (unit-tested) discovery, connection, Wake-on-LAN and credential-import logic.
- **React + TypeScript + Vite + Tailwind CSS** — the frontend.
- **[IronRDP](https://github.com/Devolutions/IronRDP)** — the embedded RDP client.
- **[noVNC](https://novnc.com)** + **[xterm.js](https://xtermjs.org)** — the embedded VNC and terminal front ends.
- **[russh](https://github.com/Eugeny/russh)** — embedded SSH and SFTP.
- **IOTA Stronghold** — the encrypted secrets vault.
- **reqwest (rustls)** — the Tailscale API client.

## 🧑‍💻 Build from source

### Prerequisites

- [Node.js](https://nodejs.org) 20+ and npm
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Platform dependencies for Tauri — follow the official [Tauri prerequisites guide](https://tauri.app/start/prerequisites/) for your OS (on Linux: `webkit2gtk-4.1`, `libgtk-3`, `libsoup-3.0`, etc.).

### Run in development

```bash
git clone https://github.com/marius-bughiu/overseer.git
cd overseer
npm install
npm run tauri dev
```

### Build a release bundle

```bash
npm run tauri build
```

### Mobile (Tauri 2)

```bash
# Android (requires Android SDK/NDK)
npm run tauri android init
npm run tauri android dev

# iOS (requires Xcode, macOS only)
npm run tauri ios init
npm run tauri ios dev
```

### Run the tests

The platform-agnostic core logic is fully unit-tested and builds without any GUI toolchain:

```bash
cargo test -p overseer-core   # Rust core (discovery parsing + URI building)
npm run build                 # type-check + bundle the frontend
npm run lint                  # eslint
```

## 🔒 Security

Security is a first-class concern for a tool that handles remote-access credentials. Highlights:

- Credentials and the Tailscale API token are encrypted at rest in a Stronghold vault, unlocked only by your master password (which is never stored).
- Passwords are **never** embedded in `rdp://` / `vnc://` URIs or `.rdp` files — your remote desktop client prompts for them.
- No telemetry, no analytics, no phone-home.
- A strict Content-Security-Policy and Tauri's capability allowlist scope what the app can do.

Read the full model in [`SECURITY.md`](SECURITY.md), and please report vulnerabilities responsibly (see the same file).

## 🗺️ Roadmap

- [x] Embedded viewers — VNC, RDP, SSH and Telnet, in-app
- [x] SFTP file transfer
- [x] Connection profiles, folders, history & quick-reconnect
- [x] Wake-on-LAN via a tailnet peer
- [x] Pre-built binaries for all desktop platforms
- [ ] **Signed & notarized** binaries (needs a code-signing certificate)
- [ ] Android & iOS store releases
- [ ] OAuth client support for Tailscale discovery
- [ ] In-app updater
- [ ] Full per-machine RDP presets (gateway, device redirects)

See the [open issues](https://github.com/marius-bughiu/overseer/issues) and [CONTRIBUTING.md](CONTRIBUTING.md) to help shape it.

## 🤝 Contributing

Contributions are very welcome! Whether it's a bug report, a feature idea, docs, or code — start with [**CONTRIBUTING.md**](CONTRIBUTING.md) and our [**Code of Conduct**](CODE_OF_CONDUCT.md).

## ❓ FAQ

**Does Overseer implement RDP/VNC itself?**
Yes. RDP, VNC, SSH and Telnet sessions run embedded in the app (IronRDP, noVNC, russh). You can still choose to hand a session off to your platform's native client if you prefer it.

**Why does my OS warn me when I open it?**
The binaries aren't code-signed yet. See [Opening an unsigned build](#opening-an-unsigned-build).

**Do I need to expose RDP to the internet?**
No. That's the whole point. Machines are reached over their private Tailscale addresses.

**Does it work without Tailscale?**
Overseer is built around Tailscale discovery. You can still connect to any host you can type in manually, but discovery requires a tailnet.

**Is my Tailscale token sent anywhere except Tailscale?**
No. It's stored in your local encrypted vault and used only to call `api.tailscale.com`.

## 📄 License

Overseer is released under the [MIT License](LICENSE). © 2026 Marius Bughiu.

> Tailscale and WireGuard are trademarks of their respective owners. Overseer is an independent project and is not affiliated with or endorsed by Tailscale Inc.

<div align="center">
<sub>Built with ❤️ and Rust. If Overseer is useful to you, please ⭐ the repo.</sub>
</div>
