use serde::{Serialize, Serializer};

/// Errors surfaced from Tauri commands back to the frontend.
///
/// Tauri requires command error types to implement [`Serialize`]; we serialize
/// to a human-readable string so the UI can display it directly.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    Core(#[from] overseer_core::CoreError),

    #[error("the `tailscale` CLI is not installed or not on PATH")]
    CliNotFound,

    #[error("`tailscale status` failed: {0}")]
    Cli(String),

    #[error("Tailscale API request failed: {0}")]
    Http(String),

    #[error("Tailscale API returned {status}: {body}")]
    Api { status: u16, body: String },

    #[error("I/O error: {0}")]
    Io(String),

    #[error("failed to open the connection in a remote desktop client: {0}")]
    Launch(String),

    #[error("embedded session error: {0}")]
    Session(String),

    #[error("{0}")]
    Other(String),
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Http(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl Serialize for AppError {
    // Use the fully-qualified std Result here: the `Result<T>` alias below
    // shadows it in this module and only takes one type parameter.
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
