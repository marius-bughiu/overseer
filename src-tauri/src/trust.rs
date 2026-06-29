//! Trust-on-first-use (TOFU) host-key verification for SSH/SFTP.
//!
//! On the first connection to a host we record its public-key fingerprint in a
//! JSON `known_hosts` file. On subsequent connections the fingerprint must
//! match, or the connection is rejected — defending against man-in-the-middle
//! attacks even though traffic already rides the Tailscale mesh.

use std::collections::HashMap;
use std::path::Path;

fn load(path: &Path) -> HashMap<String, String> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Verify (and, on first use, record) a host's key fingerprint.
///
/// Returns `true` if the host is new (now trusted) or its fingerprint matches
/// the stored one; `false` on mismatch.
pub fn verify(known_hosts: &Path, host: &str, fingerprint: &str) -> bool {
    let mut map = load(known_hosts);
    match map.get(host) {
        Some(existing) => existing == fingerprint,
        None => {
            map.insert(host.to_string(), fingerprint.to_string());
            if let Some(parent) = known_hosts.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Ok(json) = serde_json::to_string_pretty(&map) {
                let _ = std::fs::write(known_hosts, json);
            }
            true
        }
    }
}

/// Forget all trusted hosts (e.g. after a legitimate server key rotation).
pub fn reset(known_hosts: &Path) {
    let _ = std::fs::remove_file(known_hosts);
}
