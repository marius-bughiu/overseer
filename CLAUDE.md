# CLAUDE.md

Guidance for Claude Code (and other AI coding agents) working in this repository.
Read this first — it captures the architecture, conventions, and guardrails that
keep the codebase coherent.

## What Overseer is

Overseer is a **cross-platform Tailscale remote desktop manager**. It discovers
machines on a user's tailnet and launches **RDP** or **VNC** sessions to them,
storing credentials in an encrypted vault. It targets **Windows, macOS, Linux,
Android, and iOS** and is built with **Tauri 2 + Rust + React/TypeScript**.

## Repository layout

```
overseer/
├── Cargo.toml                # Rust workspace (core + tauri app)
├── crates/overseer-core/     # Pure, dependency-light, UNIT-TESTED logic
│   └── src/
│       ├── tailscale.rs      #   parse `tailscale status --json` + REST API
│       ├── connection.rs     #   build rdp:// / vnc:// URIs and .rdp files
│       └── error.rs
├── src-tauri/                # The Tauri application (desktop + mobile shell)
│   ├── src/
│   │   ├── lib.rs            #   run(): plugins, state, command registration
│   │   ├── commands.rs       #   #[tauri::command] handlers (the IPC surface)
│   │   ├── discovery.rs      #   CLI + REST API I/O, delegating parse to core
│   │   ├── launcher.rs       #   opens the connection in the OS client
│   │   └── error.rs          #   AppError (serializes to a string for the UI)
│   ├── capabilities/         #   Tauri permission allowlist
│   └── tauri.conf.json
├── src/                      # React + TypeScript frontend (Vite + Tailwind)
│   ├── lib/                  #   api.ts (invoke wrappers), vault.ts, store.ts, types.ts
│   └── components/           #   UI
└── docs/ARCHITECTURE.md      # Deeper design notes
```

## The golden rule: keep logic in `overseer-core`

`crates/overseer-core` has **no dependency on Tauri, the OS, or any GUI toolkit**.
All Tailscale parsing and connection-string building lives there, behind small
pure functions, **with unit tests**. This is what lets CI verify the important
logic without a webkit/GTK toolchain.

When you add behavior:

- **Pure logic** (parsing, formatting, validation, URI building) → put it in
  `overseer-core` and **write a unit test**.
- **Side effects** (spawning `tailscale`, HTTP, opening files/URIs, plugins) →
  put it in `src-tauri`, and keep it thin — call into `overseer-core` for the
  actual logic.

If you find yourself wanting to unit-test something in `src-tauri`, that's a
signal the logic belongs in `overseer-core`.

## Conventions

- **TypeScript ↔ Rust types** must stay in sync. `Device`, `Protocol`, etc. are
  defined in `overseer-core` with `#[serde(rename_all = "camelCase")]` and
  mirrored in `src/lib/types.ts`. Change both together.
- **Tauri commands** are the only IPC surface. Add them in
  `src-tauri/src/commands.rs`, register them in the `generate_handler!` macro in
  `lib.rs`, and add a typed wrapper in `src/lib/api.ts`.
- **Permissions**: any new plugin capability must be added to
  `src-tauri/capabilities/default.json`, or the call will be denied at runtime.
- **Frontend state** lives in the Zustand store (`src/lib/store.ts`). Components
  read from selectors; they don't fetch on their own except for vault reads.
- **Styling** is Tailwind utility classes plus the component classes in
  `src/index.css` (`.btn`, `.input`, `.card`, …). Reuse them.

## Security guardrails (do not regress these)

- **Never** put a password into an `rdp://`/`vnc://` URI, a `.rdp` file, a log
  line, or anything written to disk outside the Stronghold vault. The vault
  (`src/lib/vault.ts`) is the only place secrets are persisted.
- The Tailscale API token is a secret too — it is stored in the vault, not in
  `settings.json`.
- Keep the Content-Security-Policy in `tauri.conf.json` strict. The frontend
  makes no direct network calls; all network I/O goes through Rust commands.

## Commands you'll use

```bash
# Rust core — fast, no GUI deps, RUN THIS after touching overseer-core
cargo test -p overseer-core
cargo clippy -p overseer-core --all-targets
cargo fmt --all

# Frontend
npm install
npm run build      # tsc --noEmit + vite build
npm run lint       # eslint, zero warnings allowed
npm run format     # prettier

# Full app (needs Tauri prerequisites installed locally)
npm run tauri dev
npm run tauri build
```

> Note: building `src-tauri` requires the platform webview/GTK libraries (see the
> Tauri prerequisites). A sandbox without them can still run `cargo test -p
> overseer-core`, `npm run build`, and `npm run lint` — prefer those for quick
> verification.

## Definition of done for a change

1. Logic added/changed in `overseer-core` has unit tests, and `cargo test -p
   overseer-core` passes.
2. `cargo clippy -p overseer-core --all-targets` is clean; `cargo fmt --all`
   applied.
3. `npm run build` and `npm run lint` pass.
4. Rust and TypeScript types are in sync; new commands are wired through
   `commands.rs` → `generate_handler!` → `api.ts`.
5. New permissions are added to `capabilities/default.json`.
6. No secret is ever written outside the vault.

## Out of scope / be careful

- Don't introduce Electron, a second frontend framework, or a heavy state
  library. Keep the bundle small.
- Don't add telemetry or analytics.
- Don't break mobile: avoid desktop-only APIs without a `#[cfg]` guard or a
  capability that covers mobile.
