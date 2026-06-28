//! Tauri command handlers exposed to the frontend via `invoke()`.

use overseer_core::{ConnectionRequest, Device, Protocol};
use serde::Deserialize;

use crate::error::{AppError, Result};
use crate::launcher::{self, LaunchOutcome};
use crate::{discovery, AppState};

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
