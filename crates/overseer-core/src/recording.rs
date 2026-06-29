//! Building [asciicast v2] recordings of terminal sessions.
//!
//! This is **pure logic**: the caller (the frontend) captures `(time, data)`
//! output events from a live terminal and hands them here to be serialized into
//! the standard asciicast format, which can be replayed with `asciinema play`
//! or shared on asciinema.org. No clock, disk, or terminal access lives here.
//!
//! [asciicast v2]: https://docs.asciinema.org/manual/asciicast/v2/

use serde::{Deserialize, Serialize};
use serde_json::json;

/// A single recorded output event: seconds since recording start, and the raw
/// terminal bytes written at that moment (already UTF-8 text).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CastEvent {
    /// Seconds since the start of the recording.
    pub time: f64,
    /// The terminal output emitted at this time.
    pub data: String,
}

/// Serialize a terminal recording into an [asciicast v2] document.
///
/// The result is a header line followed by one JSON array per output event,
/// each `[time, "o", data]`. `serde_json` handles all string escaping, so
/// arbitrary control bytes in `data` are encoded safely.
pub fn build_asciicast(
    width: u16,
    height: u16,
    title: Option<&str>,
    events: &[CastEvent],
) -> String {
    let mut header = json!({
        "version": 2,
        "width": width,
        "height": height,
    });
    if let Some(title) = title.filter(|t| !t.trim().is_empty()) {
        header["title"] = json!(title);
    }

    let mut out = header.to_string();
    for ev in events {
        out.push('\n');
        // `o` = output stream (as opposed to `i` = input).
        out.push_str(&json!([ev.time, "o", ev.data]).to_string());
    }
    out.push('\n');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(time: f64, data: &str) -> CastEvent {
        CastEvent {
            time,
            data: data.to_string(),
        }
    }

    #[test]
    fn header_has_version_and_dimensions() {
        let cast = build_asciicast(80, 24, None, &[]);
        let first = cast.lines().next().unwrap();
        let header: serde_json::Value = serde_json::from_str(first).unwrap();
        assert_eq!(header["version"], 2);
        assert_eq!(header["width"], 80);
        assert_eq!(header["height"], 24);
        assert!(header.get("title").is_none());
    }

    #[test]
    fn includes_title_when_present() {
        let cast = build_asciicast(120, 40, Some("prod box"), &[]);
        let header: serde_json::Value = serde_json::from_str(cast.lines().next().unwrap()).unwrap();
        assert_eq!(header["title"], "prod box");
    }

    #[test]
    fn blank_title_is_omitted() {
        let cast = build_asciicast(80, 24, Some("   "), &[]);
        let header: serde_json::Value = serde_json::from_str(cast.lines().next().unwrap()).unwrap();
        assert!(header.get("title").is_none());
    }

    #[test]
    fn events_are_serialized_as_output_arrays() {
        let cast = build_asciicast(80, 24, None, &[ev(0.0, "hello"), ev(1.5, "world\r\n")]);
        let lines: Vec<&str> = cast.lines().collect();
        assert_eq!(lines.len(), 3); // header + 2 events
        let e0: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(e0[0], 0.0);
        assert_eq!(e0[1], "o");
        assert_eq!(e0[2], "hello");
        let e1: serde_json::Value = serde_json::from_str(lines[2]).unwrap();
        assert_eq!(e1[0], 1.5);
        assert_eq!(e1[2], "world\r\n");
    }

    #[test]
    fn escapes_control_bytes() {
        // An ANSI escape sequence must round-trip through JSON intact.
        let cast = build_asciicast(80, 24, None, &[ev(0.2, "\x1b[31mred\x1b[0m")]);
        let line = cast.lines().nth(1).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(line).unwrap();
        assert_eq!(parsed[2], "\x1b[31mred\x1b[0m");
    }

    #[test]
    fn document_ends_with_newline() {
        assert!(build_asciicast(80, 24, None, &[ev(0.0, "x")]).ends_with('\n'));
    }
}
