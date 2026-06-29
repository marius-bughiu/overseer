//! Tauri command handlers exposed to the frontend via `invoke()`.

use overseer_core::{
    build_asciicast, parse_export, CastEvent, ConnectionRequest, CredentialFormat, Device,
    ImportedEntry, Protocol,
};
use serde::Deserialize;

use crate::error::{AppError, Result};
use crate::launcher::{self, LaunchOutcome};
use crate::{discovery, session, wol, AppState};

/// Which discovery backend to use.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiscoveryMethod {
    /// Local `tailscale status --json`.
    Cli,
    /// Tailscale REST API.
    Api,
}

/// Discover Tailscale devices.
///
/// For [`DiscoveryMethod::Api`], `token` is required and `tailnet` defaults to
/// `-` (the credential's default tailnet) when omitted.
#[tauri::command]
pub async fn discover_devices(
    method: DiscoveryMethod,
    token: Option<String>,
    tailnet: Option<String>,
) -> Result<Vec<Device>> {
    match method {
        DiscoveryMethod::Cli => discovery::discover_via_cli().await,
        DiscoveryMethod::Api => {
            let token = token.ok_or_else(|| {
                AppError::Other("a Tailscale API token is required for API discovery".into())
            })?;
            discovery::discover_via_api(&token, tailnet.as_deref().unwrap_or("-")).await
        }
    }
}

/// Whether the local `tailscale` CLI is available (always false on mobile).
#[tauri::command]
pub async fn tailscale_cli_available() -> bool {
    discovery::cli_available().await
}

/// Parameters for launching a remote desktop session.
#[derive(Debug, Deserialize)]
pub struct LaunchParams {
    pub protocol: Protocol,
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub label: String,
}

/// Launch an RDP or VNC connection in the platform's remote desktop client.
///
/// Returns a short human-readable description of what was launched. Passwords
/// are never passed here — see `SECURITY.md`.
#[tauri::command]
pub async fn launch_connection(app: tauri::AppHandle, params: LaunchParams) -> Result<String> {
    let req = ConnectionRequest::new(
        params.protocol,
        params.host,
        params.port,
        params.username,
        params.label,
    )?;

    match launcher::launch(&app, &req)? {
        LaunchOutcome::OpenedUri(uri) => Ok(format!("Opened {uri}")),
        LaunchOutcome::OpenedFile(path) => Ok(format!("Opened {path}")),
    }
}

/// Open an embedded **VNC** session bridge. Returns the loopback WebSocket URL
/// the frontend's noVNC client should connect to.
#[tauri::command]
pub async fn open_vnc_session(host: String, port: u16) -> Result<String> {
    session::open_vnc(host, port).await
}

/// Open an embedded **SSH** session bridge. Returns the loopback WebSocket URL
/// the frontend's xterm.js terminal should connect to.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn open_ssh_session(
    state: tauri::State<'_, AppState>,
    host: String,
    port: u16,
    username: String,
    password: String,
    key_path: Option<String>,
    cols: u32,
    rows: u32,
) -> Result<String> {
    let known_hosts = state.known_hosts();
    session::open_ssh(
        host,
        port,
        username,
        password,
        key_path,
        cols,
        rows,
        known_hosts,
    )
    .await
}

/// Open an embedded **Telnet** session bridge (terminal over a raw TCP bridge
/// with IAC negotiation handled server-side). Returns the loopback ws URL.
#[tauri::command]
pub async fn open_telnet_session(host: String, port: u16) -> Result<String> {
    session::open_telnet(host, port).await
}

/// Open an embedded **RDP** session bridge. Returns the loopback WebSocket URL
/// the frontend's canvas renderer should connect to.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn open_rdp_session(
    host: String,
    port: u16,
    username: String,
    password: String,
    domain: Option<String>,
    width: u16,
    height: u16,
) -> Result<String> {
    session::open_rdp(host, port, username, password, domain, width, height).await
}

/// Send a Wake-on-LAN magic packet to wake a sleeping machine.
#[tauri::command]
pub async fn wake_on_lan(mac: String, broadcast: Option<String>) -> Result<()> {
    wol::send_wake(&mac, broadcast.as_deref()).await
}

/// Measure TCP connect latency to `host:port` in milliseconds, or `None` if the
/// port is closed / unreachable within the timeout. Used as a reachability /
/// latency probe in the machine list.
#[tauri::command]
pub async fn tcp_ping(host: String, port: u16) -> Option<u64> {
    let start = std::time::Instant::now();
    let connect = tokio::net::TcpStream::connect((host.as_str(), port));
    match tokio::time::timeout(std::time::Duration::from_secs(3), connect).await {
        Ok(Ok(_)) => Some(start.elapsed().as_millis() as u64),
        _ => None,
    }
}

/// Scan a host for open TCP ports. If `ports` is empty, a set of common
/// remote-access ports is used. Returns the open ports.
#[tauri::command]
pub async fn port_scan(host: String, ports: Vec<u16>) -> Vec<u16> {
    let targets = if ports.is_empty() {
        vec![22, 80, 139, 443, 445, 3389, 5900, 5901, 5985, 5986, 8080]
    } else {
        ports
    };

    let mut handles = Vec::new();
    for port in targets {
        let host = host.clone();
        handles.push(tokio::spawn(async move {
            let connect = tokio::net::TcpStream::connect((host.as_str(), port));
            match tokio::time::timeout(std::time::Duration::from_millis(800), connect).await {
                Ok(Ok(_)) => Some(port),
                _ => None,
            }
        }));
    }

    let mut open = Vec::new();
    for h in handles {
        if let Ok(Some(port)) = h.await {
            open.push(port);
        }
    }
    open.sort_unstable();
    open
}

/// Return the OS family Overseer is running on. Used by the UI to adapt copy
/// (e.g. which remote desktop client to suggest installing).
#[tauri::command]
pub fn host_platform() -> &'static str {
    if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

// --- SFTP file transfer ---

/// Open an SFTP session; returns an opaque session id.
#[tauri::command]
pub async fn sftp_connect(
    state: tauri::State<'_, AppState>,
    host: String,
    port: u16,
    username: String,
    password: String,
    key_path: Option<String>,
) -> Result<String> {
    let known_hosts = state.known_hosts();
    state
        .sftp
        .connect(&host, port, &username, password, key_path, known_hosts)
        .await
}

/// Forget all trusted SSH host keys (after a legitimate server key rotation).
#[tauri::command]
pub fn reset_known_hosts(state: tauri::State<'_, AppState>) -> Result<()> {
    crate::trust::reset(&state.known_hosts());
    Ok(())
}

/// List a remote directory.
#[tauri::command]
pub async fn sftp_list(
    state: tauri::State<'_, AppState>,
    id: String,
    path: String,
) -> Result<Vec<crate::sftp::SftpFile>> {
    state.sftp.list(&id, &path).await
}

/// Resolve the home / starting directory for the session.
#[tauri::command]
pub async fn sftp_home(state: tauri::State<'_, AppState>, id: String) -> Result<String> {
    state.sftp.home(&id).await
}

/// Download a remote file to a local path.
#[tauri::command]
pub async fn sftp_download(
    state: tauri::State<'_, AppState>,
    id: String,
    remote: String,
    local: String,
) -> Result<()> {
    state.sftp.download(&id, &remote, &local).await
}

/// Upload a local file to a remote path.
#[tauri::command]
pub async fn sftp_upload(
    state: tauri::State<'_, AppState>,
    id: String,
    local: String,
    remote: String,
) -> Result<()> {
    state.sftp.upload(&id, &local, &remote).await
}

/// Create a remote directory.
#[tauri::command]
pub async fn sftp_mkdir(state: tauri::State<'_, AppState>, id: String, path: String) -> Result<()> {
    state.sftp.make_dir(&id, &path).await
}

/// Remove a remote file or directory.
#[tauri::command]
pub async fn sftp_remove(
    state: tauri::State<'_, AppState>,
    id: String,
    path: String,
    is_dir: bool,
) -> Result<()> {
    state.sftp.remove(&id, &path, is_dir).await
}

/// Rename / move a remote path.
#[tauri::command]
pub async fn sftp_rename(
    state: tauri::State<'_, AppState>,
    id: String,
    from: String,
    to: String,
) -> Result<()> {
    state.sftp.rename(&id, &from, &to).await
}

/// Close an SFTP session.
#[tauri::command]
pub async fn sftp_disconnect(state: tauri::State<'_, AppState>, id: String) -> Result<()> {
    state.sftp.disconnect(&id).await;
    Ok(())
}

/// Export the given settings JSON to a file the user chose.
#[tauri::command]
pub fn export_settings(path: String, json: String) -> Result<()> {
    std::fs::write(&path, json).map_err(|e| AppError::Io(e.to_string()))
}

/// Read a settings JSON file the user chose, returning its contents.
#[tauri::command]
pub fn import_settings(path: String) -> Result<String> {
    std::fs::read_to_string(&path).map_err(|e| AppError::Io(e.to_string()))
}

/// Parse a password-manager export file (Bitwarden JSON, KeePass / 1Password /
/// generic CSV) into a list of credential entries. The plaintext export is read
/// into memory only and handed back to the UI, which writes the secrets into the
/// encrypted vault — this command persists nothing to disk.
#[tauri::command]
pub fn import_credentials(path: String, format: CredentialFormat) -> Result<Vec<ImportedEntry>> {
    let contents = std::fs::read_to_string(&path).map_err(|e| AppError::Io(e.to_string()))?;
    Ok(parse_export(&contents, format)?)
}

/// Serialize captured terminal output events into an asciicast v2 recording and
/// write it to a user-chosen path.
#[tauri::command]
pub fn save_recording(
    path: String,
    width: u16,
    height: u16,
    title: Option<String>,
    events: Vec<CastEvent>,
) -> Result<()> {
    let cast = build_asciicast(width, height, title.as_deref(), &events);
    std::fs::write(&path, cast).map_err(|e| AppError::Io(e.to_string()))
}

/// Persist non-secret app settings (the secret vault is handled separately by
/// the Stronghold plugin on the frontend).
#[tauri::command]
pub fn save_settings(state: tauri::State<'_, AppState>, json: String) -> Result<()> {
    state.write_settings(&json)
}

/// Load previously-persisted non-secret app settings, if any.
#[tauri::command]
pub fn load_settings(state: tauri::State<'_, AppState>) -> Result<Option<String>> {
    state.read_settings()
}
