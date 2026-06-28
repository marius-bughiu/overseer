# Contributing to Overseer

Thanks for your interest in improving Overseer! 🎉 This project welcomes issues,
ideas, docs, and code from everyone.

By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- 🐛 **Report bugs** — open a [bug report](https://github.com/marius-bughiu/overseer/issues/new?template=bug_report.yml).
- 💡 **Suggest features** — open a [feature request](https://github.com/marius-bughiu/overseer/issues/new?template=feature_request.yml).
- 📖 **Improve docs** — even fixing a typo helps.
- 🧑‍💻 **Write code** — pick up an [open issue](https://github.com/marius-bughiu/overseer/issues), or discuss a larger change in an issue first.

## Project architecture (read this before coding)

Overseer keeps a strict separation between **pure logic** and **side effects**:

- [`crates/overseer-core`](crates/overseer-core) — pure, dependency-light,
  **unit-tested** logic (Tailscale parsing, RDP/VNC URI building). No Tauri, no
  OS, no GUI. Builds and tests anywhere.
- [`src-tauri`](src-tauri) — the thin, platform-aware Tauri shell (commands,
  process/HTTP I/O, plugins).
- [`src`](src) — the React/TypeScript frontend.

**If your change is logic, it goes in `overseer-core` with a test.** See
[`CLAUDE.md`](CLAUDE.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for
the full picture.

## Development setup

### Prerequisites

- Node.js 20+ and npm
- Rust (stable) with `rustfmt` and `clippy`
- Tauri platform prerequisites: <https://tauri.app/start/prerequisites/>

### Install & run

```bash
npm install
npm run tauri dev      # full app (requires Tauri prerequisites)
```

### Fast checks (no GUI toolchain required)

```bash
cargo test -p overseer-core               # core unit tests
cargo clippy -p overseer-core --all-targets
cargo fmt --all -- --check
npm run build                              # type-check + bundle frontend
npm run lint                               # eslint (zero warnings)
npm run format:check                       # prettier
```

## Pull request checklist

Before opening a PR, please make sure:

- [ ] New/changed pure logic lives in `overseer-core` and has unit tests.
- [ ] `cargo test -p overseer-core` passes.
- [ ] `cargo clippy -p overseer-core --all-targets` is clean.
- [ ] `cargo fmt --all` has been run.
- [ ] `npm run build` and `npm run lint` pass.
- [ ] Rust and TypeScript types are in sync; new commands are wired through
      `commands.rs` → `generate_handler!` → `src/lib/api.ts`.
- [ ] New plugin permissions are added to `capabilities/default.json`.
- [ ] **No secret is written outside the Stronghold vault.**
- [ ] You updated docs / `CHANGELOG.md` where relevant.

CI runs these same checks on every PR.

## Commit & branch conventions

- Branch from `main`; use short, descriptive branch names (e.g.
  `feat/vnc-presets`, `fix/api-tailnet-default`).
- We loosely follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. It's encouraged, not
  enforced.
- Keep PRs focused. Smaller PRs get reviewed faster.

## Coding style

- **Rust**: `rustfmt` defaults; clippy-clean. Prefer small, documented functions.
- **TypeScript/React**: Prettier + ESLint config in the repo. Functional
  components and hooks; keep shared state in the Zustand store.
- **Comments** should explain *why*, not restate *what*. Match the density of the
  surrounding code.

## Reporting security issues

Please **do not** file public issues for vulnerabilities — see
[SECURITY.md](SECURITY.md) for private reporting.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
