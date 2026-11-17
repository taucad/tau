//! The install record (`%ProgramData%\Tau\Sandbox\install.json`) and the pure parts of `setup`.

use serde::{Deserialize, Serialize};

pub const RECORD_VERSION: u32 = 1;
pub const ACCOUNT: &str = "TauSandbox";
pub const GROUP: &str = "TauSandboxUsers";
/// The fixed loopback block a later per-launch proxy listens on; the only loopback TCP ports the account
/// may reach.
pub const PROXY_PORTS: [u16; 2] = [47311, 47312];

/// Under `%ProgramData%`.
pub const INSTALL_DIR: &str = "Tau\\Sandbox";
pub const RECORD_FILE: &str = "install.json";
pub const PASSWORD_FILE: &str = "password.bin";
/// `setup` copies the helper here so `TauSandbox` can execute the runner without reading the person's
/// profile, where the desktop app installs.
pub const RUNNER_DIR: &str = "bin";
pub const RUNNER_FILE: &str = "tau-windows-sandbox.exe";

/// Firewall rule names, stable across installs so `setup` and `revoke` are idempotent.
pub const RULE_BLOCK_OUTBOUND: &str = "tau_sandbox_block_outbound";
pub const RULE_BLOCK_INBOUND: &str = "tau_sandbox_block_inbound";
pub const RULE_BLOCK_LOOPBACK_TCP: &str = "tau_sandbox_block_loopback_tcp";
pub const RULE_BLOCK_LOOPBACK_UDP: &str = "tau_sandbox_block_loopback_udp";
pub const FIREWALL_RULES: [&str; 4] =
    [RULE_BLOCK_OUTBOUND, RULE_BLOCK_INBOUND, RULE_BLOCK_LOOPBACK_TCP, RULE_BLOCK_LOOPBACK_UDP];

pub const LOOPBACK_ADDRESSES: &str = "127.0.0.0/8,::1";
pub const NON_LOOPBACK_ADDRESSES: &str =
    "0.0.0.0-126.255.255.255,128.0.0.0-255.255.255.255,::,::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallRecord {
    pub version: u32,
    pub account: String,
    pub account_sid: String,
    pub group: String,
    pub group_sid: String,
    pub proxy_ports: Vec<u16>,
    pub firewall_rules: Vec<String>,
    pub for_user: String,
    /// The installed runner copy `launch` starts as `TauSandbox`.
    pub runner: String,
}

impl InstallRecord {
    pub fn parse(bytes: &[u8]) -> Result<Self, String> {
        let record: InstallRecord = serde_json::from_slice(bytes).map_err(|err| err.to_string())?;
        if record.version != RECORD_VERSION {
            return Err(format!("install record version {} is not supported", record.version));
        }
        if record.account != ACCOUNT || record.group != GROUP {
            return Err("install record names an unexpected account or group".to_owned());
        }
        Ok(record)
    }
}

/// The loopback TCP remote ports to block: every port except `allowed`, as a firewall port list
/// (`1-47310,47313-65535`). `None` when nothing is left to block.
pub fn blocked_ports(allowed: &[u16]) -> Option<String> {
    let mut allowed: Vec<u16> = allowed.iter().copied().filter(|p| *p != 0).collect();
    allowed.sort_unstable();
    allowed.dedup();
    let mut ranges = Vec::new();
    let mut next: u32 = 1;
    for port in allowed {
        let port = u32::from(port);
        if port > next {
            ranges.push(range(next, port - 1));
        }
        next = port + 1;
    }
    if next <= 65535 {
        ranges.push(range(next, 65535));
    }
    if ranges.is_empty() { None } else { Some(ranges.join(",")) }
}

fn range(from: u32, to: u32) -> String {
    if from == to { from.to_string() } else { format!("{from}-{to}") }
}

/// Parse `--proxy-ports 47311,47312` or a block `47311-47312`.
pub fn parse_ports(text: &str) -> Result<Vec<u16>, String> {
    let mut ports = Vec::new();
    for part in text.split(',').map(str::trim).filter(|p| !p.is_empty()) {
        let parse = |s: &str| s.trim().parse::<u16>().ok().filter(|p| *p != 0).ok_or(format!("bad port {s:?}"));
        if let Some((from, to)) = part.split_once('-') {
            let (from, to) = (parse(from)?, parse(to)?);
            if from > to || to - from > 64 {
                return Err(format!("bad port block {part:?}"));
            }
            ports.extend(from..=to);
        } else {
            ports.push(parse(part)?);
        }
    }
    if ports.is_empty() {
        return Err("no proxy ports".to_owned());
    }
    ports.sort_unstable();
    ports.dedup();
    Ok(ports)
}

/// Build the account password from random bytes: a fixed `Aa1_` lead satisfies any complexity policy,
/// then one alphabet character per byte. The alphabet has no quote, slash or space.
pub fn password_from(random: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_#%@!";
    let mut password = String::with_capacity(random.len() + 4);
    password.push_str("Aa1_");
    // 256 is not a multiple of the alphabet length; the bias is a fraction of a bit over 32 characters.
    password.extend(random.iter().map(|b| ALPHABET[*b as usize % ALPHABET.len()] as char));
    password
}

/// `O:LSD:(A;;CC;;;<sid>)`: the firewall `LocalUserAuthorizedList` that scopes a rule to one account.
pub fn local_user_spec(account_sid: &str) -> String {
    format!("O:LSD:(A;;CC;;;{account_sid})")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_every_loopback_port_but_the_proxy_block() {
        assert_eq!(blocked_ports(&PROXY_PORTS).unwrap(), "1-47310,47313-65535");
        assert_eq!(blocked_ports(&[1]).unwrap(), "2-65535");
        assert_eq!(blocked_ports(&[65535]).unwrap(), "1-65534");
        assert_eq!(blocked_ports(&[10, 12]).unwrap(), "1-9,11,13-65535");
        assert_eq!(blocked_ports(&[]).unwrap(), "1-65535");
        let all: Vec<u16> = (1..=65535).collect();
        assert_eq!(blocked_ports(&all), None);
    }

    #[test]
    fn parses_port_lists_and_blocks() {
        assert_eq!(parse_ports("47311,47312").unwrap(), vec![47311, 47312]);
        assert_eq!(parse_ports("47311-47313").unwrap(), vec![47311, 47312, 47313]);
        assert!(parse_ports("0").is_err());
        assert!(parse_ports("2-1").is_err());
        assert!(parse_ports("1-1000").is_err());
        assert!(parse_ports("").is_err());
    }

    #[test]
    fn passwords_are_complex_and_quote_free() {
        let password = password_from(&[0, 25, 26, 61, 62, 66, 255, 128]);
        assert!(password.starts_with("Aa1_"));
        assert_eq!(password.len(), 12);
        assert!(!password.contains(['"', '\'', '/', '\\', ' ']));
    }

    #[test]
    fn record_round_trips_and_checks_names() {
        let record = InstallRecord {
            version: 1,
            account: ACCOUNT.into(),
            account_sid: "S-1-5-21-9-9-9-1001".into(),
            group: GROUP.into(),
            group_sid: "S-1-5-21-9-9-9-1002".into(),
            proxy_ports: PROXY_PORTS.to_vec(),
            firewall_rules: FIREWALL_RULES.iter().map(|s| s.to_string()).collect(),
            for_user: "S-1-5-21-9-9-9-500".into(),
            runner: "C:\\ProgramData\\Tau\\Sandbox\\bin\\tau-windows-sandbox.exe".into(),
        };
        let bytes = serde_json::to_vec(&record).unwrap();
        assert!(String::from_utf8_lossy(&bytes).contains("\"accountSid\""));
        assert_eq!(InstallRecord::parse(&bytes).unwrap(), record);
        let mut other = record.clone();
        other.account = "Administrator".into();
        assert!(InstallRecord::parse(&serde_json::to_vec(&other).unwrap()).is_err());
    }

    #[test]
    fn local_user_spec_names_one_sid() {
        assert_eq!(local_user_spec("S-1-5-21-1-2-3-4"), "O:LSD:(A;;CC;;;S-1-5-21-1-2-3-4)");
    }
}
