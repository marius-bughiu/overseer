//! Embedded RDP client (pure-Rust, via IronRDP).
//!
//! The RDP protocol is intricate (TLS + CredSSP/NLA, capability negotiation,
//! fast-path graphics). Rather than re-implement it, Overseer drives the
//! [IronRDP](https://github.com/Devolutions/IronRDP) crate suite. The blocking
//! IronRDP client runs on a dedicated thread; it is bridged to the session's
//! async WebSocket by two channels:
//!
//! * **framebuffer** (thread → WebSocket): binary frames the frontend draws to
//!   a `<canvas>`. Frame byte 0 is a type tag — `0x01` resize `(w,h)`, `0x02`
//!   image region `(x,y,w,h,RGBA…)`.
//! * **input** (WebSocket → thread): [`RdpInput`] events (mouse / keyboard).
//!
//! This mirrors the upstream `screenshot` example for the connect sequence.

use std::io::Write as _;
use std::net::TcpStream;
use std::sync::mpsc::Receiver;
use std::time::Duration;

use ironrdp::connector::{self, ConnectionResult, Credentials};
use ironrdp::graphics::image_processing::PixelFormat;
use ironrdp::input::{Database, MouseButton, MousePosition, Operation, Scancode, WheelRotations};
use ironrdp::pdu::gcc::KeyboardType;
use ironrdp::pdu::geometry::InclusiveRectangle;
use ironrdp::pdu::rdp::capability_sets::MajorPlatformType;
use ironrdp::pdu::rdp::client_info::{PerformanceFlags, TimezoneInfo};
use ironrdp::session::image::DecodedImage;
use ironrdp::session::{ActiveStage, ActiveStageOutput};
use tokio::sync::mpsc::UnboundedSender;
use tokio_rustls::rustls;

/// An input event from the frontend, applied to the RDP session.
pub enum RdpInput {
    MouseMove { x: u16, y: u16 },
    MouseButton { button: u8, down: bool },
    Wheel { vertical: bool, delta: i16 },
    Scancode { code: u16, down: bool },
    Unicode { ch: char, down: bool },
}

/// Parameters for an RDP connection.
pub struct RdpParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub domain: Option<String>,
    pub width: u16,
    pub height: u16,
}

const FRAME_RESIZE: u8 = 0x01;
const FRAME_IMAGE: u8 = 0x02;

/// Run the blocking RDP client to completion. Intended to be spawned on a
/// dedicated thread. `fb_tx` receives framebuffer frames; `input_rx` supplies
/// input events. Returns an error string on failure (surfaced to the UI).
pub fn run(
    params: RdpParams,
    fb_tx: UnboundedSender<Vec<u8>>,
    input_rx: Receiver<RdpInput>,
) -> Result<(), String> {
    let config = build_config(&params);
    let (connection_result, mut framed) =
        connect(config, params.host.clone(), params.port).map_err(|e| e.to_string())?;

    let mut image = DecodedImage::new(
        PixelFormat::RgbA32,
        connection_result.desktop_size.width,
        connection_result.desktop_size.height,
    );

    // Tell the frontend the desktop size up-front.
    let mut size_frame = vec![FRAME_RESIZE];
    size_frame.extend_from_slice(&image.width().to_be_bytes());
    size_frame.extend_from_slice(&image.height().to_be_bytes());
    let _ = fb_tx.send(size_frame);

    let mut active_stage = ActiveStage::new(connection_result);
    let mut input_db = Database::new();

    loop {
        // Drain any pending input first so interaction stays responsive.
        loop {
            match input_rx.try_recv() {
                Ok(ev) => {
                    let ops = to_operations(ev);
                    if ops.is_empty() {
                        continue;
                    }
                    let events = input_db.apply(ops);
                    let outputs = active_stage
                        .process_fastpath_input(&mut image, &events)
                        .map_err(|e| e.to_string())?;
                    if write_outputs(&mut framed, outputs, &mut image, &fb_tx)? {
                        return Ok(());
                    }
                }
                Err(std::sync::mpsc::TryRecvError::Empty) => break,
                // Frontend tab closed → terminate the session.
                Err(std::sync::mpsc::TryRecvError::Disconnected) => return Ok(()),
            }
        }

        let (action, payload) = match framed.read_pdu() {
            Ok(pdu) => pdu,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                // Idle tick — loop back to process input. The frontend channel
                // closing (session tab closed) is our real terminate signal.
                if fb_tx.is_closed() {
                    return Ok(());
                }
                continue;
            }
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => continue,
            Err(e) => return Err(format!("read frame: {e}")),
        };

        let outputs = active_stage
            .process(&mut image, action, &payload)
            .map_err(|e| e.to_string())?;
        if write_outputs(&mut framed, outputs, &mut image, &fb_tx)? {
            return Ok(());
        }
    }
}

/// Apply active-stage outputs: write response frames, push graphics regions,
/// honour terminate. Returns `Ok(true)` when the session should end.
fn write_outputs(
    framed: &mut UpgradedFramed,
    outputs: Vec<ActiveStageOutput>,
    image: &mut DecodedImage,
    fb_tx: &UnboundedSender<Vec<u8>>,
) -> Result<bool, String> {
    for out in outputs {
        match out {
            ActiveStageOutput::ResponseFrame(frame) => {
                framed.write_all(&frame).map_err(|e| e.to_string())?;
            }
            ActiveStageOutput::GraphicsUpdate(region) => {
                if let Some(frame) = encode_region(image, &region) {
                    if fb_tx.send(frame).is_err() {
                        return Ok(true);
                    }
                }
            }
            ActiveStageOutput::Terminate(_) => return Ok(true),
            _ => {}
        }
    }
    Ok(false)
}

/// Copy a changed rectangle out of the decoded framebuffer into a wire frame.
fn encode_region(image: &DecodedImage, region: &InclusiveRectangle) -> Option<Vec<u8>> {
    let img_w = image.width();
    let w = region.right.checked_sub(region.left)?.checked_add(1)?;
    let h = region.bottom.checked_sub(region.top)?.checked_add(1)?;
    let stride = usize::from(img_w) * 4;
    let data = image.data();

    let mut buf = Vec::with_capacity(9 + usize::from(w) * usize::from(h) * 4);
    buf.push(FRAME_IMAGE);
    buf.extend_from_slice(&region.left.to_be_bytes());
    buf.extend_from_slice(&region.top.to_be_bytes());
    buf.extend_from_slice(&w.to_be_bytes());
    buf.extend_from_slice(&h.to_be_bytes());
    for row in 0..h {
        let y = usize::from(region.top) + usize::from(row);
        let start = y * stride + usize::from(region.left) * 4;
        let end = start + usize::from(w) * 4;
        if end > data.len() {
            return None;
        }
        buf.extend_from_slice(&data[start..end]);
    }
    Some(buf)
}

fn to_operations(ev: RdpInput) -> Vec<Operation> {
    match ev {
        RdpInput::MouseMove { x, y } => vec![Operation::MouseMove(MousePosition { x, y })],
        RdpInput::MouseButton { button, down } => {
            let Some(btn) = mouse_button(button) else {
                return vec![];
            };
            vec![if down {
                Operation::MouseButtonPressed(btn)
            } else {
                Operation::MouseButtonReleased(btn)
            }]
        }
        RdpInput::Wheel { vertical, delta } => vec![Operation::WheelRotations(WheelRotations {
            is_vertical: vertical,
            rotation_units: delta,
        })],
        RdpInput::Scancode { code, down } => {
            let sc = Scancode::from_u16(code);
            vec![if down {
                Operation::KeyPressed(sc)
            } else {
                Operation::KeyReleased(sc)
            }]
        }
        RdpInput::Unicode { ch, down } => vec![if down {
            Operation::UnicodeKeyPressed(ch)
        } else {
            Operation::UnicodeKeyReleased(ch)
        }],
    }
}

fn mouse_button(b: u8) -> Option<MouseButton> {
    match b {
        0 => Some(MouseButton::Left),
        1 => Some(MouseButton::Middle),
        2 => Some(MouseButton::Right),
        3 => Some(MouseButton::X1),
        4 => Some(MouseButton::X2),
        _ => None,
    }
}

fn build_config(params: &RdpParams) -> connector::Config {
    connector::Config {
        credentials: Credentials::UsernamePassword {
            username: params.username.clone(),
            password: params.password.clone(),
        },
        domain: params.domain.clone(),
        enable_tls: true,
        enable_credssp: true,
        keyboard_type: KeyboardType::IbmEnhanced,
        keyboard_subtype: 0,
        keyboard_layout: 0,
        keyboard_functional_keys_count: 12,
        ime_file_name: String::new(),
        dig_product_id: String::new(),
        desktop_size: connector::DesktopSize {
            width: params.width,
            height: params.height,
        },
        bitmap: None,
        client_build: 0,
        client_name: "overseer".to_owned(),
        client_dir: "C:\\Windows\\System32\\mstscax.dll".to_owned(),
        platform: client_platform(),
        enable_server_pointer: false,
        request_data: None,
        autologon: false,
        enable_audio_playback: false,
        pointer_software_rendering: true,
        performance_flags: PerformanceFlags::default(),
        desktop_scale_factor: 0,
        hardware_id: None,
        license_cache: None,
        timezone_info: TimezoneInfo::default(),
    }
}

fn client_platform() -> MajorPlatformType {
    #[cfg(target_os = "windows")]
    {
        MajorPlatformType::WINDOWS
    }
    #[cfg(target_os = "macos")]
    {
        MajorPlatformType::MACINTOSH
    }
    #[cfg(target_os = "ios")]
    {
        MajorPlatformType::IOS
    }
    #[cfg(target_os = "android")]
    {
        MajorPlatformType::ANDROID
    }
    #[cfg(not(any(
        target_os = "windows",
        target_os = "macos",
        target_os = "ios",
        target_os = "android"
    )))]
    {
        MajorPlatformType::UNIX
    }
}

type UpgradedFramed =
    ironrdp_blocking::Framed<rustls::StreamOwned<rustls::ClientConnection, TcpStream>>;

fn connect(
    config: connector::Config,
    server_name: String,
    port: u16,
) -> Result<(ConnectionResult, UpgradedFramed), Box<dyn std::error::Error>> {
    use std::net::ToSocketAddrs as _;
    let server_addr = (server_name.as_str(), port)
        .to_socket_addrs()?
        .next()
        .ok_or("could not resolve host")?;

    let tcp_stream = TcpStream::connect(server_addr)?;
    // Short read timeout so the active loop can interleave input processing.
    tcp_stream.set_read_timeout(Some(Duration::from_millis(15)))?;
    let client_addr = tcp_stream.local_addr()?;

    let mut framed = ironrdp_blocking::Framed::new(tcp_stream);
    let mut connector = connector::ClientConnector::new(config, client_addr);

    let should_upgrade = ironrdp_blocking::connect_begin(&mut framed, &mut connector)?;

    let initial_stream = framed.into_inner_no_leftover();
    let (upgraded_stream, server_public_key) = tls_upgrade(initial_stream, server_name.clone())?;
    let upgraded = ironrdp_blocking::mark_as_upgraded(should_upgrade, &mut connector);
    let mut upgraded_framed = ironrdp_blocking::Framed::new(upgraded_stream);

    let mut network_client = sspi::network_client::reqwest_network_client::ReqwestNetworkClient;
    let connection_result = ironrdp_blocking::connect_finalize(
        upgraded,
        connector,
        &mut upgraded_framed,
        &mut network_client,
        server_name.into(),
        server_public_key,
        None,
    )?;

    Ok((connection_result, upgraded_framed))
}

fn tls_upgrade(
    stream: TcpStream,
    server_name: String,
) -> Result<
    (
        rustls::StreamOwned<rustls::ClientConnection, TcpStream>,
        Vec<u8>,
    ),
    Box<dyn std::error::Error>,
> {
    let mut config = rustls::client::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(std::sync::Arc::new(danger::NoCertificateVerification))
        .with_no_client_auth();
    // CredSSP does not support TLS resumption.
    config.resumption = rustls::client::Resumption::disabled();
    let config = std::sync::Arc::new(config);

    let server_name = server_name.try_into()?;
    let client = rustls::ClientConnection::new(config, server_name)?;
    let mut tls_stream = rustls::StreamOwned::new(client, stream);
    // Flush to drive the handshake so the peer certificate is available.
    tls_stream.flush()?;

    let cert = tls_stream
        .conn
        .peer_certificates()
        .and_then(|certs| certs.first())
        .ok_or("peer certificate is missing")?;

    let server_public_key = {
        use x509_cert::der::Decode as _;
        let cert = x509_cert::Certificate::from_der(cert)?;
        ironrdp_tls::extract_tls_server_public_key(&cert)
            .ok_or("could not extract server public key")?
            .to_vec()
    };

    Ok((tls_stream, server_public_key))
}

mod danger {
    use tokio_rustls::rustls::client::danger::{
        HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier,
    };
    use tokio_rustls::rustls::{pki_types, DigitallySignedStruct, Error, SignatureScheme};

    #[derive(Debug)]
    pub(super) struct NoCertificateVerification;

    impl ServerCertVerifier for NoCertificateVerification {
        fn verify_server_cert(
            &self,
            _: &pki_types::CertificateDer<'_>,
            _: &[pki_types::CertificateDer<'_>],
            _: &pki_types::ServerName<'_>,
            _: &[u8],
            _: pki_types::UnixTime,
        ) -> Result<ServerCertVerified, Error> {
            Ok(ServerCertVerified::assertion())
        }

        fn verify_tls12_signature(
            &self,
            _: &[u8],
            _: &pki_types::CertificateDer<'_>,
            _: &DigitallySignedStruct,
        ) -> Result<HandshakeSignatureValid, Error> {
            Ok(HandshakeSignatureValid::assertion())
        }

        fn verify_tls13_signature(
            &self,
            _: &[u8],
            _: &pki_types::CertificateDer<'_>,
            _: &DigitallySignedStruct,
        ) -> Result<HandshakeSignatureValid, Error> {
            Ok(HandshakeSignatureValid::assertion())
        }

        fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
            vec![
                SignatureScheme::RSA_PKCS1_SHA1,
                SignatureScheme::ECDSA_SHA1_Legacy,
                SignatureScheme::RSA_PKCS1_SHA256,
                SignatureScheme::ECDSA_NISTP256_SHA256,
                SignatureScheme::RSA_PKCS1_SHA384,
                SignatureScheme::ECDSA_NISTP384_SHA384,
                SignatureScheme::RSA_PKCS1_SHA512,
                SignatureScheme::ECDSA_NISTP521_SHA512,
                SignatureScheme::RSA_PSS_SHA256,
                SignatureScheme::RSA_PSS_SHA384,
                SignatureScheme::RSA_PSS_SHA512,
                SignatureScheme::ED25519,
                SignatureScheme::ED448,
            ]
        }
    }
}
