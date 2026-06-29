use thiserror::Error;

/// Errors produced by the platform-agnostic core.
#[derive(Debug, Error)]
pub enum CoreError {
    /// The input JSON could not be parsed into the expected shape.
    #[error("failed to parse Tailscale data: {0}")]
    Parse(#[from] serde_json::Error),

    /// A connection request referenced a device with no usable address.
    #[error("device '{0}' has no reachable address")]
    NoAddress(String),

    /// A connection request used an invalid port (0).
    #[error("invalid port: {0}")]
    InvalidPort(u16),

    /// A required field (e.g. host) was empty.
    #[error("missing required field: {0}")]
    MissingField(&'static str),

    /// A MAC address could not be parsed for Wake-on-LAN.
    #[error("invalid MAC address: {0}")]
    InvalidMac(String),

    /// A password-manager export could not be parsed (wrong format / no
    /// recognizable columns).
    #[error("could not parse credential export: {0}")]
    Import(String),
}

/// Convenience alias used throughout the core crate.
pub type Result<T> = std::result::Result<T, CoreError>;
