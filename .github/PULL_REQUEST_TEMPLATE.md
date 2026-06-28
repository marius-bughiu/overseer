<!-- Thanks for contributing to Overseer! Please fill out the sections below. -->

## Summary

<!-- What does this PR do, and why? -->

## Related issues

<!-- e.g. Closes #123 -->

## Type of change

- [ ] 🐛 Bug fix
- [ ] ✨ New feature
- [ ] 📖 Documentation
- [ ] ♻️ Refactor
- [ ] 🧪 Tests / tooling

## Checklist

- [ ] New/changed pure logic lives in `overseer-core` and has unit tests
- [ ] `cargo test -p overseer-core` passes
- [ ] `cargo clippy -p overseer-core --all-targets` is clean and `cargo fmt --all` applied
- [ ] `npm run build` and `npm run lint` pass
- [ ] Rust ↔ TypeScript types are in sync; new commands wired through `commands.rs` → `generate_handler!` → `api.ts`
- [ ] New plugin permissions added to `capabilities/default.json`
- [ ] **No secret is written outside the Stronghold vault**
- [ ] Docs / `CHANGELOG.md` updated where relevant

## Screenshots / notes

<!-- Optional: UI changes, testing notes, follow-ups. -->
