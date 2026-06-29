//! Embedded, in-app session backends.
//!
//! Overseer renders sessions *inside* the app rather than handing them to an
//! external client. To bridge the browser webview to a TCP/SSH endpoint, each
//! session spins up a single-use, token-gated WebSocket listener bound to
//! `127.0.0.1`:
//!
//! * **VNC** — the WebSocket carries the raw RFB byte stream, spliced to a TCP
//!   socket on the remote host. The frontend renders it with noVNC.
//! * **SSH** — the SSH protocol terminates here in a pure-Rust [`russh`] client;
//!   the WebSocket carries the *decrypted* terminal I/O (and `{"cols","rows"}`
//!   resize control frames). The frontend renders it with xterm.js.
//!
//! The listener accepts exactly one connection (matching a random path token),
//! then stops listening. Binding to loopback plus a 128-bit token keeps other
//! local processes from hijacking the bridge.

use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use rand::RngCore;
use serde::Deserialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::Message;

use crate::error::{AppError, Result};
use crate::rdp::{self, RdpInput, RdpParams};

/// How long to wait for the frontend to connect to a freshly-opened bridge
/// before giving up and freeing the port.
const ACCEPT_TIMEOUT_SECS: u64 = 30;

#[derive(Deserialize)]
struct ResizeMsg {
    cols: u32,
    rows: u32,
}

fn random_token() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Bind a loopback listener and return `(listener, ws_url)` where `ws_url`
/// embeds a one-time path token the frontend must echo back.
async fn bind_loopback() -> Result<(TcpListener, String, String)> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| AppError::Session(format!("could not bind bridge: {e}")))?;
    let port = listener
        .local_addr()
        .map_err(|e| AppError::Session(e.to_string()))?
        .port();
    let token = random_token();
    let url = format!("ws://127.0.0.1:{port}/{token}");
    Ok((listener, token, url))
}

/// Accept exactly one WebSocket connection whose request path matches the
/// token. Returns `None` if it times out or the token does not match.
async fn accept_ws(
    listener: TcpListener,
    token: String,
) -> Option<tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>> {
    let accept = tokio::time::timeout(
        std::time::Duration::from_secs(ACCEPT_TIMEOUT_SECS),
        listener.accept(),
    )
    .await;
    let stream = match accept {
        Ok(Ok((stream, _addr))) => stream,
        _ => return None,
    };

    let want_path = format!("/{token}");
    let ws = tokio_tungstenite::accept_hdr_async(stream, move |req: &Request, resp: Response| {
        if req.uri().path() == want_path {
            Ok(resp)
        } else {
            let err = tokio_tungstenite::tungstenite::http::Response::builder()
                .status(StatusCode::FORBIDDEN)
                .body(Some("forbidden".to_string()))
                .unwrap();
            Err(err)
        }
    })
    .await
    .ok()?;
    Some(ws)
}

// ---------------------------------------------------------------------------
// VNC: raw RFB byte bridge
// ---------------------------------------------------------------------------

/// Open a VNC bridge to `host:port`. Returns the loopback WebSocket URL the
/// frontend (noVNC) should connect to.
pub async fn open_vnc(host: String, port: u16) -> Result<String> {
    let (listener, token, url) = bind_loopback().await?;
    tokio::spawn(async move {
        let Some(ws) = accept_ws(listener, token).await else {
            return;
        };
        let tcp = match tokio::net::TcpStream::connect((host.as_str(), port)).await {
            Ok(s) => s,
            Err(_) => return,
        };
        bridge_ws_tcp(ws, tcp).await;
    });
    Ok(url)
}

async fn bridge_ws_tcp(
    ws: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    tcp: tokio::net::TcpStream,
) {
    let (mut ws_tx, mut ws_rx) = ws.split();
    let (mut tcp_rd, mut tcp_wr) = tcp.into_split();

    // remote -> frontend
    let to_ws = tokio::spawn(async move {
        let mut buf = vec![0u8; 32 * 1024];
        loop {
            match tcp_rd.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if ws_tx
                        .send(Message::Binary(buf[..n].to_vec()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
            }
        }
    });

    // frontend -> remote
    let to_tcp = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_rx.next().await {
            match msg {
                Message::Binary(b) => {
                    if tcp_wr.write_all(&b).await.is_err() {
                        break;
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    let _ = tokio::join!(to_ws, to_tcp);
}

// ---------------------------------------------------------------------------
// RDP: drive IronRDP on a thread, stream the framebuffer
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(tag = "t")]
enum WireInput {
    #[serde(rename = "m")]
    Move { x: u16, y: u16 },
    #[serde(rename = "mb")]
    Button { b: u8, down: bool },
    #[serde(rename = "w")]
    Wheel { v: bool, d: i16 },
    #[serde(rename = "sc")]
    Scancode { code: u16, down: bool },
    #[serde(rename = "uc")]
    Unicode { ch: char, down: bool },
}

impl From<WireInput> for RdpInput {
    fn from(w: WireInput) -> Self {
        match w {
            WireInput::Move { x, y } => RdpInput::MouseMove { x, y },
            WireInput::Button { b, down } => RdpInput::MouseButton { button: b, down },
            WireInput::Wheel { v, d } => RdpInput::Wheel {
                vertical: v,
                delta: d,
            },
            WireInput::Scancode { code, down } => RdpInput::Scancode { code, down },
            WireInput::Unicode { ch, down } => RdpInput::Unicode { ch, down },
        }
    }
}

/// Open an embedded RDP bridge. The framebuffer streams to the frontend canvas
/// over the WebSocket (binary), and input events arrive as JSON text frames.
#[allow(clippy::too_many_arguments)]
pub async fn open_rdp(
    host: String,
    port: u16,
    username: String,
    password: String,
    domain: Option<String>,
    width: u16,
    height: u16,
) -> Result<String> {
    if username.trim().is_empty() {
        return Err(AppError::Session("RDP requires a username".into()));
    }
    let (listener, token, url) = bind_loopback().await?;
    tokio::spawn(async move {
        let Some(ws) = accept_ws(listener, token).await else {
            return;
        };
        let (mut ws_tx, mut ws_rx) = ws.split();

        // framebuffer: RDP thread -> WebSocket
        let (fb_tx, mut fb_rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();
        // input: WebSocket -> RDP thread
        let (in_tx, in_rx) = std::sync::mpsc::channel::<RdpInput>();

        let params = RdpParams {
            host,
            port,
            username,
            password,
            domain,
            width: width.max(640),
            height: height.max(480),
        };

        let fb_err = fb_tx.clone();
        std::thread::spawn(move || {
            if let Err(e) = rdp::run(params, fb_tx, in_rx) {
                let mut frame = vec![0x03u8]; // error frame
                frame.extend_from_slice(e.as_bytes());
                let _ = fb_err.send(frame);
            }
        });

        let to_ws = tokio::spawn(async move {
            while let Some(frame) = fb_rx.recv().await {
                if ws_tx.send(Message::Binary(frame)).await.is_err() {
                    break;
                }
            }
        });

        let to_rdp = tokio::spawn(async move {
            while let Some(Ok(msg)) = ws_rx.next().await {
                match msg {
                    Message::Text(t) => {
                        if let Ok(w) = serde_json::from_str::<WireInput>(&t) {
                            if in_tx.send(w.into()).is_err() {
                                break;
                            }
                        }
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
        });

        let _ = tokio::join!(to_ws, to_rdp);
    });

    Ok(url)
}

// ---------------------------------------------------------------------------
// SSH: terminate the protocol here, stream the terminal
// ---------------------------------------------------------------------------

struct SshClient {
    host: String,
    known_hosts: std::path::PathBuf,
}

impl russh::client::Handler for SshClient {
    type Error = russh::Error;

    // Trust-on-first-use host-key verification.
    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> std::result::Result<bool, Self::Error> {
        let fingerprint = server_public_key
            .fingerprint(Default::default())
            .to_string();
        Ok(crate::trust::verify(
            &self.known_hosts,
            &self.host,
            &fingerprint,
        ))
    }
}

/// Open an SSH bridge to `host:port`, authenticating with `username`/`password`
/// and requesting a PTY of the given size. Returns the loopback WebSocket URL
/// the frontend (xterm.js) should connect to.
#[allow(clippy::too_many_arguments)]
pub async fn open_ssh(
    host: String,
    port: u16,
    username: String,
    password: String,
    key_path: Option<String>,
    cols: u32,
    rows: u32,
    known_hosts: std::path::PathBuf,
) -> Result<String> {
    if username.trim().is_empty() {
        return Err(AppError::Session("SSH requires a username".into()));
    }
    let (listener, token, url) = bind_loopback().await?;
    tokio::spawn(async move {
        let Some(ws) = accept_ws(listener, token).await else {
            return;
        };
        let (mut ws_tx, mut ws_rx) = ws.split();

        // Connect + authenticate; surface failures to the terminal.
        let config = Arc::new(russh::client::Config::default());
        let client = SshClient {
            host: host.clone(),
            known_hosts,
        };
        let mut handle = match russh::client::connect(config, (host.as_str(), port), client).await {
            Ok(h) => h,
            Err(e) => {
                let _ = ws_tx
                    .send(Message::Text(format!(
                        "\r\n[overseer] connection failed: {e}\r\n"
                    )))
                    .await;
                return;
            }
        };
        match crate::ssh_auth::authenticate(&mut handle, &username, password, key_path).await {
            Ok(true) => {}
            _ => {
                let _ = ws_tx
                    .send(Message::Text(
                        "\r\n[overseer] authentication failed\r\n".into(),
                    ))
                    .await;
                return;
            }
        }

        let channel = match handle.channel_open_session().await {
            Ok(c) => c,
            Err(e) => {
                let _ = ws_tx
                    .send(Message::Text(format!(
                        "\r\n[overseer] channel error: {e}\r\n"
                    )))
                    .await;
                return;
            }
        };
        if channel
            .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
            .await
            .is_err()
            || channel.request_shell(true).await.is_err()
        {
            let _ = ws_tx
                .send(Message::Text(
                    "\r\n[overseer] could not start shell\r\n".into(),
                ))
                .await;
            return;
        }

        let (mut read_half, write_half) = channel.split();

        // shell -> frontend
        let to_ws = tokio::spawn(async move {
            loop {
                match read_half.wait().await {
                    Some(russh::ChannelMsg::Data { data }) => {
                        if ws_tx.send(Message::Binary(data.to_vec())).await.is_err() {
                            break;
                        }
                    }
                    Some(russh::ChannelMsg::ExtendedData { data, .. }) => {
                        let _ = ws_tx.send(Message::Binary(data.to_vec())).await;
                    }
                    Some(russh::ChannelMsg::Eof) | Some(russh::ChannelMsg::Close) | None => break,
                    _ => {}
                }
            }
        });

        // frontend -> shell (keystrokes + resize control frames)
        let to_ssh = tokio::spawn(async move {
            while let Some(Ok(msg)) = ws_rx.next().await {
                match msg {
                    Message::Binary(b) => {
                        if write_half.data(&b[..]).await.is_err() {
                            break;
                        }
                    }
                    Message::Text(t) => {
                        if let Ok(r) = serde_json::from_str::<ResizeMsg>(&t) {
                            let _ = write_half.window_change(r.cols, r.rows, 0, 0).await;
                        }
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
        });

        let _ = tokio::join!(to_ws, to_ssh);
        // Keep the SSH connection alive until both pumps finish.
        drop(handle);
    });

    Ok(url)
}
