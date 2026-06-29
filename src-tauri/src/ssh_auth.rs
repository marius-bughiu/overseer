//! Shared SSH authentication for the embedded SSH terminal and SFTP browser.
//!
//! Supports password auth and public-key auth (an OpenSSH private key file,
//! optionally passphrase-protected). The password field doubles as the key
//! passphrase when a key path is supplied.

use std::sync::Arc;

use russh::client::{Handle, Handler};
use russh::keys::{HashAlg, PrivateKeyWithHashAlg};

/// Authenticate `handle`. If `key_path` is set, use public-key auth (with the
/// password as the key passphrase); otherwise use password auth. Returns
/// whether authentication succeeded.
pub async fn authenticate<H: Handler>(
    handle: &mut Handle<H>,
    username: &str,
    password: String,
    key_path: Option<String>,
) -> Result<bool, String> {
    match key_path.filter(|p| !p.trim().is_empty()) {
        Some(path) => {
            let passphrase = if password.is_empty() {
                None
            } else {
                Some(password.as_str())
            };
            let key = russh::keys::load_secret_key(&path, passphrase)
                .map_err(|e| format!("could not load private key: {e}"))?;
            let key = PrivateKeyWithHashAlg::new(Arc::new(key), Some(HashAlg::Sha256));
            let res = handle
                .authenticate_publickey(username, key)
                .await
                .map_err(|e| e.to_string())?;
            Ok(res.success())
        }
        None => {
            let res = handle
                .authenticate_password(username, password)
                .await
                .map_err(|e| e.to_string())?;
            Ok(res.success())
        }
    }
}
