//! Parsing of Tailscale device information.
//!
//! Overseer can discover machines in two ways, and this module normalizes both
//! into a single [`Device`] type:
//!
//! 1. **Local CLI** — the JSON emitted by `tailscale status --json` on a
//!    desktop where the Tailscale client is installed. This works fully
//!    offline and includes a live `Online` flag.
//! 2. **Tailscale REST API** — `GET /api/v2/tailnet/{tailnet}/devices`. This
//!    works on every platform (including iOS/Android where there is no CLI)
//!    using a personal access token or OAuth client. The API does not return a
//!    live online flag, so we infer reachability from `lastSeen`.

use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::error::Result;

/// How a device was discovered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiscoverySource {
    /// Discovered via the Tailscale REST API.
    Api,
    /// Discovered via the local `tailscale status --json` CLI.
    LocalCli,
}

/// A single Tailscale machine, normalized across discovery sources.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    /// Stable identifier (node ID).
    pub id: String,
    /// Short, friendly host name (e.g. `macbook-pro`).
    pub name: String,
    /// Fully-qualified MagicDNS name (e.g. `macbook-pro.tailnet.ts.net`).
    pub dns_name: String,
    /// All Tailscale IP addresses (IPv4 first when available).
    pub addresses: Vec<String>,
    /// Operating system as reported by Tailscale (`windows`, `macOS`, ...).
    pub os: String,
    /// Whether the device is currently reachable.
    pub online: bool,
    /// Last time the device was seen, RFC 3339, if known.
    pub last_seen: Option<String>,
    /// ACL tags applied to the device.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Owning user, if known.
    pub user: Option<String>,
    /// Which discovery method produced this record.
    pub source: DiscoverySource,
}

impl Device {
    /// Return the preferred address to connect to: the first IPv4 Tailscale
    /// address (the `100.64.0.0/10` CGNAT range), falling back to the first
    /// address of any kind, falling back to the MagicDNS name.
    pub fn primary_address(&self) -> Option<&str> {
        if let Some(v4) = self
            .addresses
            .iter()
            .find(|a| a.parse::<std::net::Ipv4Addr>().is_ok())
        {
            return Some(v4.as_str());
        }
        if let Some(first) = self.addresses.first() {
            return Some(first.as_str());
        }
        if !self.dns_name.is_empty() {
            return Some(self.dns_name.as_str());
        }
        None
    }
}

/// Number of minutes after `lastSeen` within which an API-discovered device is
/// still considered "online". The REST API has no live presence flag, so this
/// is a heuristic.
const ONLINE_THRESHOLD_MINUTES: i64 = 5;

fn online_from_last_seen(last_seen: Option<&str>, now: DateTime<Utc>) -> bool {
    match last_seen.and_then(|s| DateTime::parse_from_rfc3339(s).ok()) {
        Some(ts) => {
            now.signed_duration_since(ts.with_timezone(&Utc))
                <= Duration::minutes(ONLINE_THRESHOLD_MINUTES)
        }
        None => false,
    }
}

fn short_name(host: Option<&str>, dns: &str) -> String {
    if let Some(h) = host {
        if !h.is_empty() {
            return h.to_string();
        }
    }
    dns.split('.').next().unwrap_or(dns).to_string()
}

fn trim_dns(dns: &str) -> String {
    dns.trim_end_matches('.').to_string()
}

// ---------------------------------------------------------------------------
// Local CLI: `tailscale status --json`
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct LocalStatus {
    #[serde(rename = "Self")]
    self_node: Option<LocalNode>,
    #[serde(rename = "Peer")]
    peer: Option<HashMap<String, LocalNode>>,
}

#[derive(Deserialize)]
struct LocalNode {
    #[serde(rename = "ID")]
    id: Option<String>,
    #[serde(rename = "HostName")]
    host_name: Option<String>,
    #[serde(rename = "DNSName")]
    dns_name: Option<String>,
    #[serde(rename = "OS")]
    os: Option<String>,
    #[serde(rename = "TailscaleIPs")]
    tailscale_ips: Option<Vec<String>>,
    #[serde(rename = "Online")]
    online: Option<bool>,
    #[serde(rename = "LastSeen")]
    last_seen: Option<String>,
    #[serde(rename = "Tags")]
    tags: Option<Vec<String>>,
}

impl LocalNode {
    fn into_device(self) -> Device {
        let dns = trim_dns(self.dns_name.as_deref().unwrap_or_default());
        let name = short_name(self.host_name.as_deref(), &dns);
        Device {
            id: self.id.unwrap_or_else(|| dns.clone()),
            name,
            dns_name: dns,
            addresses: self.tailscale_ips.unwrap_or_default(),
            os: self.os.unwrap_or_default(),
            online: self.online.unwrap_or(false),
            last_seen: self.last_seen,
            tags: self.tags.unwrap_or_default(),
            user: None,
            source: DiscoverySource::LocalCli,
        }
    }
}

/// Parse the output of `tailscale status --json` into a list of [`Device`]s.
///
/// The local node (`Self`) is included so the user can see their own machine.
pub fn parse_local_status(json: &str) -> Result<Vec<Device>> {
    let status: LocalStatus = serde_json::from_str(json)?;
    let mut devices = Vec::new();
    if let Some(self_node) = status.self_node {
        devices.push(self_node.into_device());
    }
    if let Some(peers) = status.peer {
        // Sort by key for deterministic ordering (HashMap iteration order is
        // otherwise non-deterministic, which makes the UI jump around).
        let mut entries: Vec<_> = peers.into_iter().collect();
        entries.sort_by(|a, b| a.0.cmp(&b.0));
        devices.extend(entries.into_iter().map(|(_, node)| node.into_device()));
    }
    Ok(devices)
}

// ---------------------------------------------------------------------------
// REST API: GET /api/v2/tailnet/{tailnet}/devices
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ApiDevicesResponse {
    devices: Vec<ApiDevice>,
}

#[derive(Deserialize)]
struct ApiDevice {
    id: String,
    name: Option<String>,
    hostname: Option<String>,
    addresses: Option<Vec<String>>,
    os: Option<String>,
    #[serde(rename = "lastSeen")]
    last_seen: Option<String>,
    tags: Option<Vec<String>>,
    user: Option<String>,
}

fn sort_ipv4_first(mut addrs: Vec<String>) -> Vec<String> {
    addrs.sort_by_key(|a| a.parse::<std::net::Ipv4Addr>().is_err());
    addrs
}

/// Parse a Tailscale REST API `devices` response into a list of [`Device`]s.
///
/// Because the REST API has no live presence flag, `online` is inferred from
/// `lastSeen` relative to `now`.
pub fn parse_api_devices(json: &str, now: DateTime<Utc>) -> Result<Vec<Device>> {
    let resp: ApiDevicesResponse = serde_json::from_str(json)?;
    let mut devices: Vec<Device> = resp
        .devices
        .into_iter()
        .map(|d| {
            let dns = trim_dns(d.name.as_deref().unwrap_or_default());
            let name = short_name(d.hostname.as_deref(), &dns);
            let online = online_from_last_seen(d.last_seen.as_deref(), now);
            Device {
                id: d.id,
                name,
                dns_name: dns,
                addresses: sort_ipv4_first(d.addresses.unwrap_or_default()),
                os: d.os.unwrap_or_default(),
                online,
                last_seen: d.last_seen,
                tags: d.tags.unwrap_or_default(),
                user: d.user,
                source: DiscoverySource::Api,
            }
        })
        .collect();
    devices.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(devices)
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOCAL_STATUS: &str = r#"{
        "Self": {
            "ID": "self-id",
            "HostName": "my-laptop",
            "DNSName": "my-laptop.tail1234.ts.net.",
            "OS": "linux",
            "TailscaleIPs": ["100.101.102.103", "fd7a:115c:a1e0::1"],
            "Online": true,
            "Tags": ["tag:admin"]
        },
        "Peer": {
            "key-b": {
                "ID": "id-b",
                "HostName": "office-pc",
                "DNSName": "office-pc.tail1234.ts.net.",
                "OS": "windows",
                "TailscaleIPs": ["100.64.0.5"],
                "Online": false,
                "LastSeen": "2026-06-28T09:00:00Z"
            },
            "key-a": {
                "ID": "id-a",
                "HostName": "media-server",
                "DNSName": "media-server.tail1234.ts.net.",
                "OS": "linux",
                "TailscaleIPs": ["100.64.0.9"],
                "Online": true
            }
        }
    }"#;

    #[test]
    fn parses_local_status_with_self_first() {
        let devices = parse_local_status(LOCAL_STATUS).unwrap();
        assert_eq!(devices.len(), 3);
        // Self is always first.
        assert_eq!(devices[0].name, "my-laptop");
        assert_eq!(devices[0].source, DiscoverySource::LocalCli);
        // Peers are sorted deterministically by their map key (key-a < key-b).
        assert_eq!(devices[1].name, "media-server");
        assert_eq!(devices[2].name, "office-pc");
    }

    #[test]
    fn trims_trailing_dot_from_dns_name() {
        let devices = parse_local_status(LOCAL_STATUS).unwrap();
        assert_eq!(devices[0].dns_name, "my-laptop.tail1234.ts.net");
    }

    #[test]
    fn prefers_ipv4_primary_address() {
        let devices = parse_local_status(LOCAL_STATUS).unwrap();
        assert_eq!(devices[0].primary_address(), Some("100.101.102.103"));
    }

    #[test]
    fn falls_back_to_dns_when_no_addresses() {
        let device = Device {
            id: "x".into(),
            name: "x".into(),
            dns_name: "x.ts.net".into(),
            addresses: vec![],
            os: "linux".into(),
            online: true,
            last_seen: None,
            tags: vec![],
            user: None,
            source: DiscoverySource::Api,
        };
        assert_eq!(device.primary_address(), Some("x.ts.net"));
    }

    const API_DEVICES: &str = r#"{
        "devices": [
            {
                "id": "111",
                "name": "zebra.tail1234.ts.net",
                "hostname": "zebra",
                "addresses": ["fd7a:115c:a1e0::2", "100.64.0.20"],
                "os": "macOS",
                "lastSeen": "2026-06-28T11:59:00Z",
                "user": "marius@example.com"
            },
            {
                "id": "222",
                "name": "alpha.tail1234.ts.net",
                "hostname": "alpha",
                "addresses": ["100.64.0.21"],
                "os": "windows",
                "lastSeen": "2026-06-28T08:00:00Z"
            }
        ]
    }"#;

    fn fixed_now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-06-28T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    #[test]
    fn parses_api_devices_sorted_by_name() {
        let devices = parse_api_devices(API_DEVICES, fixed_now()).unwrap();
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].name, "alpha");
        assert_eq!(devices[1].name, "zebra");
        assert_eq!(devices[0].source, DiscoverySource::Api);
        assert_eq!(devices[1].user.as_deref(), Some("marius@example.com"));
    }

    #[test]
    fn infers_online_from_recent_last_seen() {
        let devices = parse_api_devices(API_DEVICES, fixed_now()).unwrap();
        // zebra: seen 1 minute ago -> online
        let zebra = devices.iter().find(|d| d.name == "zebra").unwrap();
        assert!(zebra.online);
        // alpha: seen 4 hours ago -> offline
        let alpha = devices.iter().find(|d| d.name == "alpha").unwrap();
        assert!(!alpha.online);
    }

    #[test]
    fn api_sorts_ipv4_before_ipv6() {
        let devices = parse_api_devices(API_DEVICES, fixed_now()).unwrap();
        let zebra = devices.iter().find(|d| d.name == "zebra").unwrap();
        assert_eq!(zebra.addresses[0], "100.64.0.20");
        assert_eq!(zebra.primary_address(), Some("100.64.0.20"));
    }

    #[test]
    fn rejects_invalid_json() {
        assert!(parse_local_status("not json").is_err());
        assert!(parse_api_devices("not json", fixed_now()).is_err());
    }
}
