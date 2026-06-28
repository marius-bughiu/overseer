//! Hands a validated [`ConnectionRequest`] off to the platform's remote
//! desktop client.
//!
//! Strategy per platform:
//!
//! | Protocol | Desktop (Windows/macOS/Linux) | Mobile (iOS/Android) |
//! |----------|-------------------------------|----------------------|
//! | RDP      | write a `.rdp` file, open it  | open an `rdp://` URI |
//! | VNC      | open a `vnc://` URI           | open a `vnc://` URI  |
//!
//! On desktop the `.rdp` file is opened with the system default handler
//! (`mstsc` on Windows, *Windows App* on macOS). Mobile clients register the
//! `rdp://` / `vnc://` URI schemes, so opening the URI deep-links into them.

use overseer_core::{
    build_rdp_file, build_rdp_uri, build_vnc_uri, rdp_file_name, ConnectionRequest, Protocol,
};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::error::{AppError, Result};

#[cfg(any(target_os = "android", target_os = "ios"))]
const IS_MOBILE: bool = true;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
const IS_MOBILE: bool = false;

/// Describes what Overseer did to launch the connection, for display in the UI.
pub enum LaunchOutcome {
    /// A URI was handed to the OS / a registered client.
    OpenedUri(String),
    /// A `.rdp` file was written and opened with the default handler.
    OpenedFile(String),
}

pub fn launch(app: &AppHandle, req: &ConnectionRequest) -> Result<LaunchOutcome> {
    match req.protocol() {
        Protocol::Rdp if IS_MOBILE => open_uri(app, build_rdp_uri(req)?),
        Protocol::Rdp => open_rdp_file(app, req),
        Protocol::Vnc => open_uri(app, build_vnc_uri(req)?),
    }
}

fn open_uri(app: &AppHandle, uri: String) -> Result<LaunchOutcome> {
    app.opener()
        .open_url(uri.clone(), None::<&str>)
        .map_err(|e| AppError::Launch(e.to_string()))?;
    Ok(LaunchOutcome::OpenedUri(uri))
}

fn open_rdp_file(app: &AppHandle, req: &ConnectionRequest) -> Result<LaunchOutcome> {
    let contents = build_rdp_file(req)?;
    let mut path = std::env::temp_dir();
    path.push(rdp_file_name(req));
    std::fs::write(&path, contents)?;
    let path_str = path.to_string_lossy().to_string();
    app.opener()
        .open_path(path_str.clone(), None::<&str>)
        .map_err(|e| AppError::Launch(e.to_string()))?;
    Ok(LaunchOutcome::OpenedFile(path_str))
}
