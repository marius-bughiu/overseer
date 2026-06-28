//! Building launch artifacts for RDP and VNC connections.
//!
//! Overseer is a *manager*: rather than re-implementing the RDP and RFB (VNC)
//! protocols, it hands a fully-formed connection off to the platform's remote
//! desktop client. This module builds the three artifacts needed to do that:
//!
//! * [`build_rdp_uri`] — an `rdp://` deep link understood by the Microsoft
//!   Remote Desktop / Windows App mobile clients (iOS & Android).
//! * [`build_rdp_file`] — the contents of a classic `.rdp` file that desktop
//!   clients (`mstsc` on Windows, *Windows App* on macOS) open directly.
//! * [`build_vnc_uri`] — a `vnc://` URL understood by macOS Screen Sharing,
//!   RealVNC Viewer, and most mobile VNC clients.
//!
//! Passwords are intentionally **never** embedded in URIs or files. They are
//! kept in the encrypted vault and either typed by the user or injected by the
//! platform client at connect time. Putting a password in a `.rdp` file or a
//! `vnc://` URL would leak it to disk, process listings, and shell history.

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};

/// Default TCP port for Microsoft RDP.
pub const DEFAULT_RDP_PORT: u16 = 3389;
/// Default TCP port for VNC (RFB) display `:0`.
pub const DEFAULT_VNC_PORT: u16 = 5900;

/// The remote-desktop protocol to use for a connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    /// Microsoft Remote Desktop Protocol.
    Rdp,
    /// Virtual Network Computing (RFB).
    Vnc,
}

impl Protocol {
    /// The conventional default port for this protocol.
    pub fn default_port(self) -> u16 {
        match self {
            Protocol::Rdp => DEFAULT_RDP_PORT,
            Protocol::Vnc => DEFAULT_VNC_PORT,
        }
    }
}

/// A validated request to connect to a host.
///
/// Construct one with [`ConnectionRequest::new`], which validates the host and
/// port up-front so the builder functions are infallible-by-construction with
/// respect to those fields.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConnectionRequest {
    protocol: Protocol,
    host: String,
    port: u16,
    username: Option<String>,
    /// Friendly label used for the `.rdp` file / window title.
    label: String,
}

impl ConnectionRequest {
    /// Build and validate a connection request.
    ///
    /// `port` of `0`, or an empty `host`, are rejected.
    pub fn new(
        protocol: Protocol,
        host: impl Into<String>,
        port: u16,
        username: Option<String>,
        label: impl Into<String>,
    ) -> Result<Self> {
        let host = host.into();
        if host.trim().is_empty() {
            return Err(CoreError::MissingField("host"));
        }
        if port == 0 {
            return Err(CoreError::InvalidPort(port));
        }
        let username = username.filter(|u| !u.trim().is_empty());
        Ok(Self {
            protocol,
            host: host.trim().to_string(),
            port,
            username,
            label: label.into(),
        })
    }

    /// The protocol of this request.
    pub fn protocol(&self) -> Protocol {
        self.protocol
    }
}

/// Minimal percent-encoding for values placed in a URI query component.
///
/// We avoid pulling in a dependency for this; the set of characters that must
/// be escaped for host names, ports and user names is small.
fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b':' | b'@' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// Build an `rdp://` deep link for the mobile Microsoft Remote Desktop client.
///
/// The format follows the documented connect-URI scheme, e.g.:
/// `rdp://full%20address=s:host:3389&username=s:user`
pub fn build_rdp_uri(req: &ConnectionRequest) -> Result<String> {
    if req.protocol != Protocol::Rdp {
        return Err(CoreError::MissingField("rdp protocol"));
    }
    let address = percent_encode(&format!("{}:{}", req.host, req.port));
    let mut uri = format!("rdp://full%20address=s:{address}");
    if let Some(user) = &req.username {
        uri.push_str(&format!("&username=s:{}", percent_encode(user)));
    }
    Ok(uri)
}

/// Build the contents of a `.rdp` file for desktop RDP clients.
///
/// The file omits the password (clients prompt for it, or it is supplied from
/// the vault by the OS credential manager).
pub fn build_rdp_file(req: &ConnectionRequest) -> Result<String> {
    if req.protocol != Protocol::Rdp {
        return Err(CoreError::MissingField("rdp protocol"));
    }
    let mut lines = vec![
        format!("full address:s:{}:{}", req.host, req.port),
        "screen mode id:i:2".to_string(),
        "use multimon:i:0".to_string(),
        "session bpp:i:32".to_string(),
        "audiomode:i:0".to_string(),
        "redirectclipboard:i:1".to_string(),
        "redirectprinters:i:0".to_string(),
        "autoreconnection enabled:i:1".to_string(),
        "authentication level:i:2".to_string(),
        "prompt for credentials:i:1".to_string(),
        "negotiate security layer:i:1".to_string(),
    ];
    if let Some(user) = &req.username {
        lines.push(format!("username:s:{user}"));
    }
    // Trailing newline; CRLF is what Windows expects for .rdp files.
    Ok(format!("{}\r\n", lines.join("\r\n")))
}

/// Build a `vnc://` URL for the platform VNC viewer.
pub fn build_vnc_uri(req: &ConnectionRequest) -> Result<String> {
    if req.protocol != Protocol::Vnc {
        return Err(CoreError::MissingField("vnc protocol"));
    }
    let authority = match &req.username {
        Some(user) => format!("{}@{}", percent_encode(user), req.host),
        None => req.host.clone(),
    };
    Ok(format!("vnc://{authority}:{}", req.port))
}

/// A suggested file name (without directory) for the `.rdp` artifact.
pub fn rdp_file_name(req: &ConnectionRequest) -> String {
    let safe: String = req
        .label
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let safe = safe.trim_matches('-');
    let stem = if safe.is_empty() { "connection" } else { safe };
    format!("{stem}.rdp")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rdp(user: Option<&str>) -> ConnectionRequest {
        ConnectionRequest::new(
            Protocol::Rdp,
            "100.64.0.5",
            DEFAULT_RDP_PORT,
            user.map(String::from),
            "Office PC",
        )
        .unwrap()
    }

    #[test]
    fn rejects_empty_host() {
        assert!(ConnectionRequest::new(Protocol::Rdp, "  ", 3389, None, "x").is_err());
    }

    #[test]
    fn rejects_zero_port() {
        assert!(ConnectionRequest::new(Protocol::Rdp, "host", 0, None, "x").is_err());
    }

    #[test]
    fn blank_username_is_treated_as_none() {
        let req = rdp(Some("   "));
        assert!(req.username.is_none());
    }

    #[test]
    fn rdp_uri_includes_address_and_user() {
        let uri = build_rdp_uri(&rdp(Some("admin"))).unwrap();
        assert_eq!(
            uri,
            "rdp://full%20address=s:100.64.0.5:3389&username=s:admin"
        );
    }

    #[test]
    fn rdp_uri_percent_encodes_domain_user() {
        let uri = build_rdp_uri(&rdp(Some("CORP\\admin"))).unwrap();
        assert!(uri.contains("username=s:CORP%5Cadmin"));
    }

    #[test]
    fn rdp_uri_without_user_has_no_username_param() {
        let uri = build_rdp_uri(&rdp(None)).unwrap();
        assert_eq!(uri, "rdp://full%20address=s:100.64.0.5:3389");
    }

    #[test]
    fn rdp_file_contains_address_and_no_password() {
        let file = build_rdp_file(&rdp(Some("admin"))).unwrap();
        assert!(file.contains("full address:s:100.64.0.5:3389"));
        assert!(file.contains("username:s:admin"));
        assert!(!file.to_lowercase().contains("password"));
        assert!(file.ends_with("\r\n"));
    }

    #[test]
    fn vnc_uri_default_and_with_user() {
        let req =
            ConnectionRequest::new(Protocol::Vnc, "100.64.0.9", DEFAULT_VNC_PORT, None, "Media")
                .unwrap();
        assert_eq!(build_vnc_uri(&req).unwrap(), "vnc://100.64.0.9:5900");

        let req_user = ConnectionRequest::new(
            Protocol::Vnc,
            "100.64.0.9",
            5901,
            Some("marius".into()),
            "Media",
        )
        .unwrap();
        assert_eq!(
            build_vnc_uri(&req_user).unwrap(),
            "vnc://marius@100.64.0.9:5901"
        );
    }

    #[test]
    fn protocol_mismatch_is_rejected() {
        let vnc = ConnectionRequest::new(Protocol::Vnc, "h", 5900, None, "x").unwrap();
        assert!(build_rdp_uri(&vnc).is_err());
        assert!(build_rdp_file(&vnc).is_err());

        let rdp = rdp(None);
        assert!(build_vnc_uri(&rdp).is_err());
    }

    #[test]
    fn rdp_file_name_is_sanitized() {
        let req = rdp(None);
        assert_eq!(rdp_file_name(&req), "Office-PC.rdp");

        let weird = ConnectionRequest::new(Protocol::Rdp, "h", 3389, None, "!!!").unwrap();
        assert_eq!(rdp_file_name(&weird), "connection.rdp");
    }

    #[test]
    fn default_ports_are_conventional() {
        assert_eq!(Protocol::Rdp.default_port(), 3389);
        assert_eq!(Protocol::Vnc.default_port(), 5900);
    }
}
