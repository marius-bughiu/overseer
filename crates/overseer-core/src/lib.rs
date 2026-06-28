//! # overseer-core
//!
//! Platform-agnostic core logic for **Overseer**, a cross-platform Tailscale
//! remote desktop manager.
//!
//! This crate deliberately has **no dependency on Tauri, the OS, or any GUI
//! toolkit**. It contains the pure, easily-testable parts of the application:
//!
//! * [`tailscale`] — parsing of Tailscale device data from both the local
//!   `tailscale status --json` CLI output and the Tailscale REST API.
//! * [`connection`] — building RDP / VNC launch URIs and `.rdp` files from a
//!   [`Device`] and user-supplied connection parameters.
//!
//! Keeping this logic in a separate crate means it can be unit-tested on any
//! platform (including CI runners without webkit/GTK) without building the
//! full Tauri application.

pub mod connection;
pub mod error;
pub mod tailscale;

pub use connection::{build_rdp_file, build_rdp_uri, build_vnc_uri, ConnectionRequest, Protocol};
pub use error::CoreError;
pub use tailscale::{parse_api_devices, parse_local_status, Device, DiscoverySource};
