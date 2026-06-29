//! Sending Wake-on-LAN magic packets.
//!
//! The packet itself is built by `overseer_core`; this module performs the UDP
//! send. Packets go to the global broadcast address and, when known, the
//! subnet-directed broadcast — the latter is what lets a tailnet exit/subnet
//! peer forward the wake to a sleeping machine.

use tokio::net::UdpSocket;

use crate::error::{AppError, Result};

/// Send a magic packet for `mac`. If `broadcast` is given (e.g.
/// `192.168.1.255`), the packet is also sent there; otherwise only the global
/// broadcast `255.255.255.255` is used. Port 9 (discard) is conventional.
pub async fn send_wake(mac: &str, broadcast: Option<&str>) -> Result<()> {
    let packet = overseer_core::build_magic_packet(mac)?;

    let socket = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;
    socket
        .set_broadcast(true)
        .map_err(|e| AppError::Io(e.to_string()))?;

    let mut targets = vec!["255.255.255.255:9".to_string()];
    if let Some(b) = broadcast {
        let b = b.trim();
        if !b.is_empty() {
            targets.push(format!("{b}:9"));
        }
    }

    let mut last_err = None;
    let mut sent = false;
    for target in targets {
        match socket.send_to(&packet, &target).await {
            Ok(_) => sent = true,
            Err(e) => last_err = Some(e.to_string()),
        }
    }

    if sent {
        Ok(())
    } else {
        Err(AppError::Other(
            last_err.unwrap_or_else(|| "failed to send wake packet".into()),
        ))
    }
}
