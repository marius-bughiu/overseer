//! Overseer — Tauri application entry point.
//!
//! This crate is the thin, platform-aware shell around [`overseer_core`]. It
//! wires up Tauri plugins (secure storage, URI/file opening, OS info,
//! clipboard, dialogs), registers the [`commands`] exposed to the web
//! frontend, and provides lightweight persistence for non-secret settings.

mod commands;
mod discovery;
mod error;
mod launcher;
mod rdp;
mod session;
mod sftp;
mod trust;
mod wol;

use std::path::PathBuf;
use std::sync::Mutex;

use error::{AppError, Result};
use tauri::Manager;

/// Application state managed by Tauri. Holds the on-disk location of the
/// non-secret settings file (secrets live in the Stronghold vault instead) and
/// the registry of open SFTP sessions.
pub struct AppState {
    settings_path: Mutex<Option<PathBuf>>,
    known_hosts_path: Mutex<Option<PathBuf>>,
    pub sftp: sftp::Registry,
}

impl AppState {
    fn new() -> Self {
        Self {
            settings_path: Mutex::new(None),
            known_hosts_path: Mutex::new(None),
            sftp: sftp::Registry::default(),
        }
    }

    fn path(&self) -> Result<PathBuf> {
        self.settings_path
            .lock()
            .map_err(|_| AppError::Other("settings state poisoned".into()))?
            .clone()
            .ok_or_else(|| AppError::Other("settings path not initialized".into()))
    }

    /// Path to the TOFU known-hosts file.
    pub fn known_hosts(&self) -> PathBuf {
        self.known_hosts_path
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .unwrap_or_else(|| std::env::temp_dir().join("overseer-known_hosts.json"))
    }

    fn write_settings(&self, json: &str) -> Result<()> {
        let path = self.path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, json)?;
        Ok(())
    }

    fn read_settings(&self) -> Result<Option<String>> {
        let path = self.path()?;
        match std::fs::read_to_string(&path) {
            Ok(s) => Ok(Some(s)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.into()),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single-instance is desktop-only: focus the existing window instead of
    // spawning a second copy when the user re-launches Overseer.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::new())
        .setup(|app| {
            // The Stronghold vault key is derived (argon2) from the user's
            // master password and a per-install random salt stored here.
            let salt_path = app
                .path()
                .app_local_data_dir()
                .expect("no local data dir")
                .join("vault.salt");
            if let Some(parent) = salt_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;

            // Resolve where non-secret settings + the known-hosts file live.
            let config_dir = app.path().app_config_dir().expect("no config dir");
            if let Some(state) = app.try_state::<AppState>() {
                *state.settings_path.lock().unwrap() = Some(config_dir.join("settings.json"));
                *state.known_hosts_path.lock().unwrap() = Some(config_dir.join("known_hosts.json"));
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::discover_devices,
            commands::tailscale_cli_available,
            commands::launch_connection,
            commands::open_vnc_session,
            commands::open_ssh_session,
            commands::open_rdp_session,
            commands::wake_on_lan,
            commands::tcp_ping,
            commands::port_scan,
            commands::sftp_connect,
            commands::sftp_list,
            commands::sftp_home,
            commands::sftp_download,
            commands::sftp_upload,
            commands::sftp_mkdir,
            commands::sftp_remove,
            commands::sftp_rename,
            commands::sftp_disconnect,
            commands::reset_known_hosts,
            commands::export_settings,
            commands::import_settings,
            commands::host_platform,
            commands::save_settings,
            commands::load_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Overseer");
}
