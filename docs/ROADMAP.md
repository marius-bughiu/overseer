# Overseer Roadmap

This roadmap captures every feature on the path from a Tailscale connection
*launcher* to a full, in-app, tabbed remote desktop *client*. It is derived from
a feature-gap analysis against Remmina, Devolutions RDM, mRemoteNG, Royal TS,
Microsoft Windows App, and Jump Desktop.

Status legend: ✅ done · 🚧 in progress · ⏳ planned

## North star

> Every session runs **inside Overseer** — embedded, tabbed, multi-session —
> over the Tailscale mesh, with credentials in an encrypted vault and zero
> telemetry.

## 1. In-app, tabbed, embedded sessions (headline)

- ✅ Tabbed multi-session shell (open many sessions in one window)
- ✅ Embedded **SSH** terminal (xterm.js + russh backend)
- ✅ Embedded **VNC** viewer (noVNC + in-process WebSocket↔TCP bridge)
- ✅ Embedded **RDP** client (IronRDP, pure-Rust; canvas framebuffer + input)
- ✅ Live session thumbnails / overview grid (canvas snapshots, refreshed
  periodically; click to focus)
- ✅ Per-session reconnect & connection status
- ✅ Full-screen sessions (detached-window still planned)
- ⏳ Multi-monitor (RDP) & dynamic resolution / scaling
- ⏳ Device & resource redirection (clipboard, drives, printers, audio)
- ✅ In-session file transfer — SFTP browser (upload/download/mkdir/delete) for
  SSH hosts (RDP drive redirect still planned)
- ✅ Session recording — terminal sessions captured to an asciicast v2
  `.cast` file (replayable with asciinema)
- ✅ Input automation: reusable command snippets, paste-as-keystrokes into
  SSH / Telnet sessions

## 2. Protocols

- ✅ RDP (launch / external client + embedded)
- ✅ VNC (launch / external client + embedded)
- ✅ SSH (launch + embedded)
- ✅ SFTP file browser
- ✅ Telnet (embedded, IAC negotiation handled server-side)
- ⏳ SPICE
- ⏳ Web/HTTP(S) console tabs
- ⏳ RDP Gateway support

## 3. Connection organization

- ✅ Search, online/favorites filters, tags, favorites
- ✅ Per-machine **connection profiles** (protocol, mode, port)
- ✅ Connection **history** & quick-reconnect (per-session reconnect)
- ✅ Folder / tree grouping
- ⏳ Per-machine resolution / redirects / gateway in the profile
- ✅ Manual (non-Tailscale) hosts
- ✅ Import / export connections &amp; settings (JSON file)

## 4. Connectivity

- ✅ **Wake-on-LAN** (magic packet, routable via a tailnet peer)
- ✅ Connection health / latency ping (TCP connect probe)
- ✅ Port scan of a device (common-port sweep in the connect dialog)
- ✅ Auto-reconnect on drop (bounded) + per-session manual reconnect

## 5. Security & credentials

- ✅ Encrypted Stronghold vault (per-machine credentials + API token)
- ✅ Manual vault lock
- ✅ Auto-lock on idle
- ⏳ Biometric unlock (Touch ID / Windows Hello / Android biometric)
- ✅ Credential injection into embedded sessions (password / key passed directly)
- ✅ External password-manager import (Bitwarden JSON · KeePass / 1Password /
  generic CSV → manual hosts + vault credentials)
- ✅ SSH public-key auth (key file + passphrase); agent forwarding planned
- ✅ Host-key verification & trust store (TOFU known-hosts + reset)
- ✅ TOTP / 2FA secret storage (vault-stored, live codes)

## 6. Experience & platform

- ✅ Dark theme, responsive desktop + mobile layout
- ✅ Light theme + theme toggle (CSS-variable palette)
- ✅ Command palette & keyboard shortcuts (Cmd/Ctrl-K)
- ⏳ Localization (i18n)
- ⏳ Settings sync across devices

## 7. Team / enterprise (later, optional — must not add telemetry)

- ⏳ Shared, encrypted connection data source
- ⏳ Role-based access control
- ⏳ Session audit log & reporting

---

### Implementation waves

1. **Foundations** — roadmap, SSH protocol, Wake-on-LAN, connection profiles,
   connection history, light theme. *(core-testable, low risk)*
2. **Embedded sessions** — tabbed shell, embedded SSH terminal, embedded VNC
   viewer.
3. **Embedded RDP** — IronRDP integration.
4. **Power features** — SFTP file transfer, multi-monitor, redirection,
   recording, input automation.
5. **Security & sync** — auto-lock, biometrics, credential injection, external
   vaults, settings sync.
6. **Org & enterprise** — folders, import/export, manual hosts, sharing.
