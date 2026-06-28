# Security Policy

Overseer handles credentials for remote access, so we take security seriously.
This document explains the threat model, how secrets are protected, and how to
report a vulnerability.

## Supported versions

Overseer is pre-1.0 and moves quickly. Security fixes are applied to the latest
`main` and the most recent tagged release.

| Version | Supported |
| ------- | --------- |
| latest `0.x` | ✅ |
| older `0.x` | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, report privately via one of:

- GitHub's [private vulnerability reporting](https://github.com/marius-bughiu/overseer/security/advisories/new) (preferred), or
- Email the maintainer at **marius.bughiu@gmail.com** with the subject line `OVERSEER SECURITY`.

Please include:

- A description of the issue and its impact,
- Steps to reproduce or a proof of concept,
- The affected version / commit.

We aim to acknowledge reports within **72 hours** and to provide a remediation
timeline after triage. We're happy to credit reporters in the release notes
unless you prefer to remain anonymous.

## How Overseer protects secrets

- **Encrypted vault.** Per-machine credentials and the Tailscale API token are
  stored using [IOTA Stronghold](https://github.com/iotaledger/stronghold.rs),
  an encrypted, in-memory-hardened secrets store. The encryption key is derived
  (Argon2) from the user's **master password** plus a per-install random salt.
- **The master password is never persisted.** If it is lost, the vault must be
  reset; secrets cannot be recovered. This is by design.
- **Passwords never leave the vault in cleartext artifacts.** Overseer
  deliberately does **not** write passwords into `rdp://` / `vnc://` URIs or
  `.rdp` files. The platform's remote desktop client prompts for the password,
  so it is never exposed to disk, process arguments, or shell history.
- **No telemetry.** Overseer does not collect analytics or phone home.
- **Scoped capabilities.** The app uses Tauri's capability allowlist
  (`src-tauri/capabilities/default.json`) to grant only the plugin commands it
  needs, and a strict Content-Security-Policy. The webview makes no direct
  network requests; all I/O is mediated by Rust commands.
- **Network surface.** The only outbound network call Overseer makes is to
  `https://api.tailscale.com` (when API discovery is enabled), authenticated
  with your token over TLS (rustls).

## Threat model & residual risks

Overseer protects secrets **at rest**. It does **not** defend against:

- A compromised host (malware, keyloggers, a root-level attacker) — such an
  attacker can read secrets after you unlock the vault.
- Shoulder-surfing of your master password.
- The security of the remote desktop client you launch, or the remote host.

Always keep your OS, your Tailscale client, and your remote desktop client up to
date, and use strong, unique credentials.

## Hardening recommendations

- Use a strong master password for the vault.
- Lock the vault (Settings → Security → Lock now) when stepping away.
- Prefer Tailscale ACLs to limit which devices can reach which ports.
- Scope your Tailscale API token to the minimum required (`devices:core:read`)
  and rotate it periodically.
