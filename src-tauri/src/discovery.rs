//! Device discovery: the bridge between [`overseer_core`]'s pure parsers and
//! the outside world (the `tailscale` CLI and the Tailscale REST API).

use overseer_core::{parse_api_devices, parse_local_status, Device};

use crate::error::{AppError, Result};

/// Returns `true` if the `tailscale` CLI appears to be available on PATH.
pub async fn cli_available() -> bool {
    tokio::process::Command::new("tailscale")
        .arg("version")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Discover devices using the locally-installed `tailscale` CLI.
///
/// Only available on desktop platforms where Tailscale is installed.
pub async fn discover_via_cli() -> Result<Vec<Device>> {
    let output = match tokio::process::Command::new("tailscale")
        .args(["status", "--json"])
        .output()
        .await
    {
        Ok(o) => o,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err(AppError::CliNotFound),
        Err(e) => return Err(AppError::Io(e.to_string())),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Cli(stderr.trim().to_string()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_local_status(&stdout)?)
}

/// Discover devices via the Tailscale REST API.
///
/// Works on every platform (including mobile) using a personal access token or
/// OAuth access token with the `devices:core:read` scope. `tailnet` may be the
/// literal `-` to mean "the default tailnet for the supplied credentials".
pub async fn discover_via_api(token: &str, tailnet: &str) -> Result<Vec<Device>> {
    let token = token.trim();
    if token.is_empty() {
        return Err(AppError::Other("a Tailscale API token is required".into()));
    }
    let tailnet = {
        let t = tailnet.trim();
        if t.is_empty() {
            "-"
        } else {
            t
        }
    };

    let url = format!("https://api.tailscale.com/api/v2/tailnet/{tailnet}/devices?fields=default");

    let client = reqwest::Client::builder()
        .user_agent(concat!("overseer/", env!("CARGO_PKG_VERSION")))
        .build()?;

    let resp = client.get(&url).bearer_auth(token).send().await?;

    let status = resp.status();
    let body = resp.text().await?;
    if !status.is_success() {
        return Err(AppError::Api {
            status: status.as_u16(),
            body: body.chars().take(500).collect(),
        });
    }

    Ok(parse_api_devices(&body, chrono::Utc::now())?)
}
