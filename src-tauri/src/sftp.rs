//! SFTP file transfer over SSH (via `russh` + `russh-sftp`).
//!
//! Sessions are persistent and held in a [`Registry`] keyed by an opaque id, so
//! the frontend file browser can list, navigate, upload and download without
//! re-authenticating per operation.

use std::collections::HashMap;
use std::sync::Arc;

use rand::RngCore;
use russh::client::Handle;
use russh_sftp::client::SftpSession;
use serde::Serialize;
use tokio::sync::Mutex;

use crate::error::{AppError, Result};

struct SshClient;

impl russh::client::Handler for SshClient {
    type Error = russh::Error;
    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> std::result::Result<bool, Self::Error> {
        Ok(true)
    }
}

struct Entry {
    // The SSH connection must stay alive for the duration of the SFTP session.
    _handle: Handle<SshClient>,
    sftp: SftpSession,
}

/// A directory entry returned to the frontend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpFile {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<u64>,
}

/// Process-wide registry of open SFTP sessions.
#[derive(Default)]
pub struct Registry {
    sessions: Mutex<HashMap<String, Entry>>,
}

fn random_id() -> String {
    let mut bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

impl Registry {
    /// Open an SFTP session and return its id.
    pub async fn connect(
        &self,
        host: &str,
        port: u16,
        username: &str,
        password: String,
    ) -> Result<String> {
        if username.trim().is_empty() {
            return Err(AppError::Session("SFTP requires a username".into()));
        }
        let config = Arc::new(russh::client::Config::default());
        let mut handle = russh::client::connect(config, (host, port), SshClient)
            .await
            .map_err(|e| AppError::Session(format!("SSH connect failed: {e}")))?;

        let authed = handle
            .authenticate_password(username, password)
            .await
            .map_err(|e| AppError::Session(e.to_string()))?;
        if !authed.success() {
            return Err(AppError::Session("authentication failed".into()));
        }

        let channel = handle
            .channel_open_session()
            .await
            .map_err(|e| AppError::Session(e.to_string()))?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| AppError::Session(e.to_string()))?;
        let sftp = SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| AppError::Session(format!("SFTP init failed: {e}")))?;

        let id = random_id();
        self.sessions.lock().await.insert(
            id.clone(),
            Entry {
                _handle: handle,
                sftp,
            },
        );
        Ok(id)
    }

    /// Acquire the locked session map, erroring if `id` is unknown. The guard
    /// is held across the awaited SFTP call (tokio mutex), serializing ops on
    /// the session.
    async fn lock(&self) -> tokio::sync::MutexGuard<'_, HashMap<String, Entry>> {
        self.sessions.lock().await
    }

    fn sess<'a>(guard: &'a HashMap<String, Entry>, id: &str) -> Result<&'a SftpSession> {
        guard
            .get(id)
            .map(|e| &e.sftp)
            .ok_or_else(|| AppError::Session("SFTP session not found".into()))
    }

    /// List a directory.
    pub async fn list(&self, id: &str, path: &str) -> Result<Vec<SftpFile>> {
        let path = if path.is_empty() {
            ".".to_string()
        } else {
            path.to_string()
        };
        let guard = self.lock().await;
        let read_dir = Self::sess(&guard, id)?
            .read_dir(path)
            .await
            .map_err(|e| AppError::Session(e.to_string()))?;
        let mut files: Vec<SftpFile> = read_dir
            .map(|entry| {
                let meta = entry.metadata();
                SftpFile {
                    name: entry.file_name(),
                    path: entry.path(),
                    is_dir: meta.is_dir(),
                    size: meta.size.unwrap_or(0),
                    modified: meta.modified().ok().and_then(|t| {
                        t.duration_since(std::time::UNIX_EPOCH)
                            .ok()
                            .map(|d| d.as_secs())
                    }),
                }
            })
            .collect();
        files.sort_by(|a, b| {
            (b.is_dir, a.name.to_lowercase()).cmp(&(a.is_dir, b.name.to_lowercase()))
        });
        Ok(files)
    }

    /// Resolve the absolute home / starting directory.
    pub async fn home(&self, id: &str) -> Result<String> {
        let guard = self.lock().await;
        Self::sess(&guard, id)?
            .canonicalize(".".to_string())
            .await
            .map_err(|e| AppError::Session(e.to_string()))
    }

    /// Download a remote file to a local path.
    pub async fn download(&self, id: &str, remote: &str, local: &str) -> Result<()> {
        let data = {
            let guard = self.lock().await;
            Self::sess(&guard, id)?
                .read(remote.to_string())
                .await
                .map_err(|e| AppError::Session(e.to_string()))?
        };
        tokio::fs::write(local, data)
            .await
            .map_err(|e| AppError::Io(e.to_string()))
    }

    /// Upload a local file to a remote path.
    pub async fn upload(&self, id: &str, local: &str, remote: &str) -> Result<()> {
        let data = tokio::fs::read(local)
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;
        let guard = self.lock().await;
        Self::sess(&guard, id)?
            .write(remote.to_string(), &data)
            .await
            .map_err(|e| AppError::Session(e.to_string()))
    }

    pub async fn make_dir(&self, id: &str, path: &str) -> Result<()> {
        let guard = self.lock().await;
        Self::sess(&guard, id)?
            .create_dir(path.to_string())
            .await
            .map_err(|e| AppError::Session(e.to_string()))
    }

    pub async fn remove(&self, id: &str, path: &str, is_dir: bool) -> Result<()> {
        let guard = self.lock().await;
        let s = Self::sess(&guard, id)?;
        let res = if is_dir {
            s.remove_dir(path.to_string()).await
        } else {
            s.remove_file(path.to_string()).await
        };
        res.map_err(|e| AppError::Session(e.to_string()))
    }

    pub async fn rename(&self, id: &str, from: &str, to: &str) -> Result<()> {
        let guard = self.lock().await;
        Self::sess(&guard, id)?
            .rename(from.to_string(), to.to_string())
            .await
            .map_err(|e| AppError::Session(e.to_string()))
    }

    /// Close and forget a session.
    pub async fn disconnect(&self, id: &str) {
        if let Some(entry) = self.sessions.lock().await.remove(id) {
            let _ = entry.sftp.close().await;
        }
    }
}
