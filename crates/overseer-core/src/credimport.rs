//! Parsing of credential exports from common password managers.
//!
//! These are **pure parsers**: they turn an export blob (CSV or JSON) into a
//! list of [`ImportedEntry`] records. They never touch disk, the network, or
//! the vault — the caller decides what to persist (and persists secrets only
//! into the encrypted Stronghold vault).
//!
//! Supported sources:
//! * **Bitwarden** — unencrypted `.json` export.
//! * **KeePass / KeePassXC** — `.csv` export.
//! * **1Password** — `.csv` export.
//! * any **generic CSV** with a header row naming the columns.
//!
//! CSV exports are parsed by a single header-aware parser that recognizes
//! columns by name (case-insensitive), so KeePass, 1Password, and generic CSV
//! all flow through the same code path.

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

/// A single credential parsed from a password-manager export.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedEntry {
    /// Human-readable title of the entry.
    pub name: String,
    /// Host or URL associated with the entry, if any.
    pub host: Option<String>,
    /// Account username (may be empty).
    pub username: String,
    /// Account password (may be empty for SSH-key-only entries).
    pub password: String,
}

/// The export format to parse. [`CredentialFormat::Auto`] sniffs JSON vs CSV.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CredentialFormat {
    /// Detect the format from the content (JSON object → Bitwarden, else CSV).
    Auto,
    /// Bitwarden unencrypted JSON export.
    Bitwarden,
    /// KeePass / KeePassXC CSV export.
    Keepass,
    /// 1Password CSV export.
    OnePassword,
    /// Generic CSV with a header row.
    Csv,
}

/// Parse an export blob using the given [`CredentialFormat`].
pub fn parse_export(
    input: &str,
    format: CredentialFormat,
) -> Result<Vec<ImportedEntry>, CoreError> {
    match format {
        CredentialFormat::Bitwarden => parse_bitwarden_json(input),
        CredentialFormat::Keepass | CredentialFormat::OnePassword | CredentialFormat::Csv => {
            parse_csv(input)
        }
        CredentialFormat::Auto => {
            if input.trim_start().starts_with('{') {
                parse_bitwarden_json(input)
            } else {
                parse_csv(input)
            }
        }
    }
}

// ---- Bitwarden JSON ---------------------------------------------------------

#[derive(Deserialize)]
struct BwExport {
    items: Vec<BwItem>,
}

#[derive(Deserialize)]
struct BwItem {
    #[serde(default)]
    name: String,
    #[serde(default)]
    login: Option<BwLogin>,
}

#[derive(Deserialize)]
struct BwLogin {
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    password: Option<String>,
    #[serde(default)]
    uris: Vec<BwUri>,
}

#[derive(Deserialize)]
struct BwUri {
    #[serde(default)]
    uri: Option<String>,
}

/// Parse a Bitwarden unencrypted JSON export. Only items with a `login`
/// section are kept.
pub fn parse_bitwarden_json(input: &str) -> Result<Vec<ImportedEntry>, CoreError> {
    let export: BwExport = serde_json::from_str(input)
        .map_err(|e| CoreError::Import(format!("invalid Bitwarden JSON: {e}")))?;

    let entries = export
        .items
        .into_iter()
        .filter_map(|item| {
            let login = item.login?;
            let username = login.username.unwrap_or_default();
            let password = login.password.unwrap_or_default();
            if username.is_empty() && password.is_empty() {
                return None;
            }
            let host = login
                .uris
                .into_iter()
                .find_map(|u| u.uri)
                .map(|h| h.trim().to_string())
                .filter(|h| !h.is_empty());
            Some(ImportedEntry {
                name: if item.name.trim().is_empty() {
                    host.clone().unwrap_or_else(|| username.clone())
                } else {
                    item.name.trim().to_string()
                },
                host,
                username,
                password,
            })
        })
        .collect();
    Ok(entries)
}

// ---- CSV --------------------------------------------------------------------

/// Parse a header-aware CSV export (KeePass, 1Password, or generic).
///
/// The first non-empty row is treated as a header; columns are matched by name
/// (case-insensitive). A `password` (or `pass`) column is required.
pub fn parse_csv(input: &str) -> Result<Vec<ImportedEntry>, CoreError> {
    let mut rows = parse_csv_records(input)
        .into_iter()
        .filter(|r| r.iter().any(|f| !f.trim().is_empty()));

    let headers = rows
        .next()
        .ok_or_else(|| CoreError::Import("CSV export is empty".into()))?;

    let name_i = find_col(&headers, &["name", "title", "account"]);
    let host_i = find_col(
        &headers,
        &[
            "url",
            "uri",
            "host",
            "hostname",
            "website",
            "web site",
            "login_uri",
        ],
    );
    let user_i = find_col(
        &headers,
        &["username", "user", "login", "user name", "login_username"],
    );
    let pass_i = find_col(&headers, &["password", "pass", "login_password"])
        .ok_or_else(|| CoreError::Import("CSV export has no password column".into()))?;

    let entries = rows
        .filter_map(|row| {
            let cell = |i: Option<usize>| -> Option<String> {
                i.and_then(|i| row.get(i))
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
            };
            let username = cell(user_i).unwrap_or_default();
            let password = cell(Some(pass_i)).unwrap_or_default();
            if username.is_empty() && password.is_empty() {
                return None;
            }
            let host = cell(host_i);
            let name = cell(name_i)
                .or_else(|| host.clone())
                .unwrap_or_else(|| username.clone());
            Some(ImportedEntry {
                name,
                host,
                username,
                password,
            })
        })
        .collect();
    Ok(entries)
}

/// Find the index of the first header that equals one of `names` (trimmed,
/// case-insensitive).
fn find_col(headers: &[String], names: &[&str]) -> Option<usize> {
    headers.iter().position(|h| {
        let h = h.trim().to_ascii_lowercase();
        names.iter().any(|n| h == *n)
    })
}

/// Parse RFC-4180-style CSV into rows of fields. Handles quoted fields with
/// embedded commas, escaped quotes (`""`), and newlines inside quotes. Accepts
/// both `\n` and `\r\n` line endings.
fn parse_csv_records(input: &str) -> Vec<Vec<String>> {
    let mut records: Vec<Vec<String>> = Vec::new();
    let mut record: Vec<String> = Vec::new();
    let mut field = String::new();
    let mut in_quotes = false;
    let mut chars = input.chars().peekable();

    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    chars.next();
                    field.push('"');
                } else {
                    in_quotes = false;
                }
            } else {
                field.push(c);
            }
        } else {
            match c {
                '"' => in_quotes = true,
                ',' => record.push(std::mem::take(&mut field)),
                '\r' => {}
                '\n' => {
                    record.push(std::mem::take(&mut field));
                    records.push(std::mem::take(&mut record));
                }
                _ => field.push(c),
            }
        }
    }

    if !field.is_empty() || !record.is_empty() {
        record.push(field);
        records.push(record);
    }
    records
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_bitwarden_json() {
        let json = r#"{
            "items": [
                {
                    "name": "Home Server",
                    "login": {
                        "username": "admin",
                        "password": "s3cr3t",
                        "uris": [{ "uri": "ssh://home.example" }]
                    }
                },
                {
                    "name": "A secure note",
                    "notes": "no login here"
                },
                {
                    "name": "Router",
                    "login": { "username": "root", "password": "toor", "uris": [] }
                }
            ]
        }"#;
        let entries = parse_bitwarden_json(json).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "Home Server");
        assert_eq!(entries[0].username, "admin");
        assert_eq!(entries[0].password, "s3cr3t");
        assert_eq!(entries[0].host.as_deref(), Some("ssh://home.example"));
        assert_eq!(entries[1].name, "Router");
        assert_eq!(entries[1].host, None);
    }

    #[test]
    fn bitwarden_skips_empty_logins() {
        let json = r#"{"items":[{"name":"x","login":{"username":"","password":""}}]}"#;
        assert!(parse_bitwarden_json(json).unwrap().is_empty());
    }

    #[test]
    fn parses_keepassxc_csv() {
        // KeePassXC export column order.
        let csv = "\"Group\",\"Title\",\"Username\",\"Password\",\"URL\",\"Notes\"\n\
                   \"Root\",\"My NAS\",\"admin\",\"pw1\",\"192.168.1.10\",\"\"\n\
                   \"Root\",\"VPS\",\"root\",\"pw2\",\"vps.example.net\",\"prod\"";
        let entries = parse_csv(csv).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "My NAS");
        assert_eq!(entries[0].username, "admin");
        assert_eq!(entries[0].password, "pw1");
        assert_eq!(entries[0].host.as_deref(), Some("192.168.1.10"));
        assert_eq!(entries[1].name, "VPS");
    }

    #[test]
    fn parses_1password_csv() {
        let csv = "Title,Url,Username,Password\n\
                   Workstation,rdp://10.0.0.5,user,\"pa,ss\"\n";
        let entries = parse_csv(csv).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Workstation");
        assert_eq!(entries[0].host.as_deref(), Some("rdp://10.0.0.5"));
        // Quoted field with an embedded comma is preserved.
        assert_eq!(entries[0].password, "pa,ss");
    }

    #[test]
    fn csv_handles_escaped_quotes_and_newlines() {
        let csv = "title,username,password\n\
                   \"He said \"\"hi\"\"\",bob,\"line1\nline2\"\n";
        let entries = parse_csv(csv).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "He said \"hi\"");
        assert_eq!(entries[0].password, "line1\nline2");
    }

    #[test]
    fn csv_falls_back_to_host_or_username_for_name() {
        let csv = "url,username,password\nhost.example,,pw\n";
        let entries = parse_csv(csv).unwrap();
        assert_eq!(entries[0].name, "host.example");
    }

    #[test]
    fn csv_requires_a_password_column() {
        let csv = "title,username\na,b\n";
        assert!(matches!(parse_csv(csv), Err(CoreError::Import(_))));
    }

    #[test]
    fn csv_skips_blank_rows() {
        let csv = "title,username,password\n\n\nNAS,admin,pw\n\n";
        let entries = parse_csv(csv).unwrap();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn auto_detects_json_vs_csv() {
        let json = r#"{"items":[{"name":"x","login":{"username":"u","password":"p"}}]}"#;
        assert_eq!(parse_export(json, CredentialFormat::Auto).unwrap().len(), 1);
        let csv = "title,username,password\nx,u,p\n";
        assert_eq!(parse_export(csv, CredentialFormat::Auto).unwrap().len(), 1);
    }

    #[test]
    fn empty_csv_is_an_error() {
        assert!(matches!(parse_csv("   \n  "), Err(CoreError::Import(_))));
    }
}
