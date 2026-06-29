//! Wake-on-LAN: build the "magic packet" used to wake a sleeping machine.
//!
//! A magic packet is 6 bytes of `0xFF` followed by the target's 6-byte MAC
//! address repeated 16 times (102 bytes total). Overseer can send it as a UDP
//! broadcast, or — uniquely — route it to a peer on the tailnet so a machine
//! can be woken across networks.

use crate::error::{CoreError, Result};

/// Length of a Wake-on-LAN magic packet.
pub const MAGIC_PACKET_LEN: usize = 6 + 6 * 16;

/// Parse a MAC address in `AA:BB:CC:DD:EE:FF` or `AA-BB-CC-DD-EE-FF` form
/// (case-insensitive) into its 6 raw bytes.
pub fn parse_mac(mac: &str) -> Result<[u8; 6]> {
    let cleaned: Vec<&str> = mac.split([':', '-']).collect();
    if cleaned.len() != 6 {
        return Err(CoreError::InvalidMac(mac.to_string()));
    }
    let mut bytes = [0u8; 6];
    for (i, part) in cleaned.iter().enumerate() {
        if part.len() != 2 {
            return Err(CoreError::InvalidMac(mac.to_string()));
        }
        bytes[i] =
            u8::from_str_radix(part, 16).map_err(|_| CoreError::InvalidMac(mac.to_string()))?;
    }
    Ok(bytes)
}

/// Build the 102-byte magic packet for the given MAC address string.
pub fn build_magic_packet(mac: &str) -> Result<Vec<u8>> {
    let addr = parse_mac(mac)?;
    let mut packet = Vec::with_capacity(MAGIC_PACKET_LEN);
    packet.extend_from_slice(&[0xFF; 6]);
    for _ in 0..16 {
        packet.extend_from_slice(&addr);
    }
    Ok(packet)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_colon_and_dash_macs() {
        let expected = [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF];
        assert_eq!(parse_mac("AA:BB:CC:DD:EE:FF").unwrap(), expected);
        assert_eq!(parse_mac("aa-bb-cc-dd-ee-ff").unwrap(), expected);
    }

    #[test]
    fn rejects_malformed_macs() {
        assert!(parse_mac("AA:BB:CC:DD:EE").is_err());
        assert!(parse_mac("AA:BB:CC:DD:EE:FF:00").is_err());
        assert!(parse_mac("ZZ:BB:CC:DD:EE:FF").is_err());
        assert!(parse_mac("AABBCCDDEEFF").is_err());
    }

    #[test]
    fn magic_packet_has_correct_shape() {
        let packet = build_magic_packet("01:02:03:04:05:06").unwrap();
        assert_eq!(packet.len(), MAGIC_PACKET_LEN);
        assert_eq!(&packet[0..6], &[0xFF; 6]);
        // First repetition of the MAC.
        assert_eq!(&packet[6..12], &[0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
        // Last repetition of the MAC.
        assert_eq!(&packet[96..102], &[0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
    }
}
