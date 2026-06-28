# Architecture

This document describes how Overseer is put together and why.

## High-level picture

```
┌────────────────────────────────────────────────────────────┐
│                         Frontend (src/)                     │
│  React + TypeScript + Vite + Tailwind                       │
│  ┌──────────────┐   Zustand store   ┌──────────────────┐    │
│  │  Components   │ ───────────────── │  lib/api.ts      │    │
│  │ (DeviceList,  │                   │  (invoke wrappers)│   │
│  │  ConnectDialog│   lib/vault.ts ── │                  │    │
│  │  Settings…)   │  (Stronghold JS)  └────────┬─────────┘    │
│  └──────────────┘                            │ Tauri IPC    │
└───────────────────────────────────────────────┼────────────┘
                                                 │
┌────────────────────────────────────────────────▼───────────┐
│                    Tauri shell (src-tauri/)                  │
│  commands.rs  ──►  discovery.rs ──►  ┌─────────────────────┐ │
│       │                              │  overseer-core      │ │
│       └──────────►  launcher.rs ───► │  (pure logic +      │ │
│                                      │   unit tests)       │ │
│  Plugins: stronghold, opener, os,    └─────────────────────┘ │
│  clipboard, dialog, single-instance                          │
└──────────────────────────────────────────────────────────────┘
            │                         │
       tailscale CLI          api.tailscale.com
   (desktop, status --json)   (REST, all platforms)
```

## Crates and packages

### `crates/overseer-core` — the pure core

This crate is the heart of the application logic and **has no dependency on
Tauri, the OS, or any GUI library**. That isolation is deliberate:

- It can be **unit-tested on any machine** (including CI without webkit/GTK).
- It keeps the interesting logic — which is easy to get subtly wrong — small,
  pure, and well-covered.

It contains:

- `tailscale.rs` — normalizes two very different inputs (the `tailscale status
  --json` CLI output and the Tailscale REST API response) into a single
  `Device` type. Handles MagicDNS trimming, IPv4-first address ordering, and
  online inference from `lastSeen` for the API (which has no live presence flag).
- `connection.rs` — turns a validated `ConnectionRequest` into the right launch
  artifact: an `rdp://` deep link, a `.rdp` file, or a `vnc://` URL. Validation
  (non-empty host, non-zero port) happens once, at construction.

### `src-tauri` — the platform shell

Thin and side-effect-y. It:

- `discovery.rs` — runs the `tailscale` CLI or makes the HTTPS call to the
  Tailscale API, then hands the raw text to `overseer-core` for parsing.
- `launcher.rs` — picks the platform-appropriate artifact (file vs URI) and
  opens it via the `opener` plugin.
- `commands.rs` — the IPC surface: every `#[tauri::command]` the frontend can
  call.
- `lib.rs` — `run()`: registers plugins, manages app state, sets up the
  Stronghold vault salt, and wires up the command handler.
- `error.rs` — `AppError`, which serializes to a string so errors render
  directly in the UI.

### `src` — the frontend

- `lib/api.ts` — typed wrappers around `invoke()`; the only place the UI talks
  to Rust.
- `lib/vault.ts` — a thin class over the Stronghold JS plugin. The **only** place
  secrets are persisted.
- `lib/store.ts` — a Zustand store holding all app state and actions.
- `lib/types.ts` — TypeScript mirrors of the Rust `Device`/`Protocol` types.
- `components/` — the UI.

## Key design decisions

### Manager, not a protocol implementation

Overseer does **not** (yet) implement the RDP or RFB/VNC wire protocols.
Re-implementing them well — including authentication, codecs, clipboard, and
input — is a large, security-sensitive undertaking. Instead, Overseer builds a
correct launch artifact and delegates to the platform's mature, maintained
client. This is the same pattern as connection managers like Remmina or
Microsoft's own RD client list. An optional embedded VNC viewer is on the
roadmap; the architecture (a `launcher` abstraction over `overseer-core`
builders) leaves room for it.

### Two discovery backends

- **Tailscale REST API** works everywhere, including iOS/Android where there is
  no CLI, but needs an access token and has no live online flag (we infer it).
- **Local CLI** is zero-config on desktop and reports live presence, but isn't
  available on mobile.

The UI lets the user choose, and disables CLI on mobile.

### Secrets in Stronghold, settings in JSON

Non-secret preferences (discovery method, tailnet, favorites, preferred
protocol) are stored as plain JSON via Rust (`save_settings`/`load_settings`).
**Secrets** (credentials, API token) live only in the encrypted Stronghold
vault, keyed by an Argon2 hash of the user's master password. This split keeps
the fast path simple while never persisting secrets in cleartext.

### Why passwords aren't in the launch artifact

Embedding a password in a `.rdp` file or a `vnc://` URL would leak it to disk,
process listings, and shell history. Overseer intentionally omits it; the
platform client prompts for the password (or pulls it from the OS credential
store). This is enforced in `overseer-core::connection` and covered by tests.

## Data flow: connecting to a machine

1. User taps **Connect** on a `DeviceCard`.
2. `ConnectDialog` resolves the primary address, protocol, port, and (if the
   vault is unlocked) any saved credential.
3. On submit, the frontend optionally saves the credential to the vault, then
   calls the `launch_connection` command.
4. `commands::launch_connection` builds a validated `ConnectionRequest` in
   `overseer-core`.
5. `launcher::launch` chooses the artifact for the platform and opens it via the
   `opener` plugin.
6. The OS hands off to the RDP/VNC client, which connects over Tailscale.
