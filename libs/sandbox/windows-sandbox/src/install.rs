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

/// `::/127` covers `::` and `::1`. The firewall COM API refused the earlier `127.0.0.0/8,::1` on windows-2025 (E_INVALIDARG).
pub const LOOPBACK_ADDRESSES: &str = "127.0.0.0/8,::/127";
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
    /// The WFP filters `setup` installed (names; their keys follow from `proxy_ports`). Absent in records
    /// written before the filters existed, which `status` then reports as `rulesPresent: false`.
    #[serde(default)]
    pub wfp_filters: Vec<String>,
    pub for_user: String,
    /// The installed runner copy `launch` starts as `TauSandbox`.
    pub runner: String,
    /// The volume capability SID (`DeriveCapabilitySidsFromName("tauSandboxVolumeRoot")`). Absent in records
    /// written before it existed; `launch` then refuses until `setup` runs again.
    #[serde(default)]
    pub volume_capability_sid: Option<String>,
    /// The fixed volume roots `setup` granted the volume capability on, this folder only; `revoke` removes it.
    #[serde(default)]
    pub volume_roots: Vec<String>,
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
    if port_runs(&ports).len() > WFP_MAX_PORT_RUNS {
        return Err(format!("at most {WFP_MAX_PORT_RUNS} separate proxy port ranges are supported"));
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

/// The firewall profiles named in a `CurrentProfileTypes` mask, for messages.
pub fn profile_names(mask: i32) -> Vec<&'static str> {
    [(1, "Domain"), (2, "Private"), (4, "Public")]
        .into_iter()
        .filter(|(bit, _)| mask & bit != 0)
        .map(|(_, name)| name)
        .collect()
}

/// The `refused` message when Windows Firewall is off for some current profiles.
pub fn firewall_off_message(off: &[&str]) -> String {
    format!(
        "Windows Firewall is off for {}, so Tau cannot keep the sandbox off the network. Turn it on, then try again.",
        if off.is_empty() { "a current profile".to_owned() } else { off.join(", ") }
    )
}

// ---- Windows Filtering Platform filters ----
//
// Windows Firewall rules do not filter traffic to loopback or to the host's own addresses (run
// 44005787685: with the firewall on and the four rules in place, the sandbox still reached a loopback
// listener and one on the runner's own interface address). `setup` therefore also installs persistent WFP
// filters, in Tau's own provider and sublayer, matched on the sandbox account through
// `FWPM_CONDITION_ALE_USER_ID`. Within the sublayer the highest-weight matching filter decides: a permit
// for loopback TCP to the proxy ports outweighs the block of every other connection.

/// Tau's WFP provider and sublayer. Stable: changing them orphans installed objects.
pub const WFP_PROVIDER_KEY: u128 = 0x6a1f_3c52_9e4b_4d27_8b13_0c5e_7a29_d401;
pub const WFP_SUBLAYER_KEY: u128 = 0x6a1f_3c52_9e4b_4d27_8b13_0c5e_7a29_d402;
/// Filter keys are this base plus a small index (see [`wfp_filters`]).
const WFP_FILTER_KEY_BASE: u128 = 0x6a1f_3c52_9e4b_4d27_8b13_0c5e_7a29_e000;
/// At most this many contiguous proxy port runs (each needs a v4 and a v6 permit filter).
pub const WFP_MAX_PORT_RUNS: usize = 8;
const WFP_FIXED_FILTERS: u128 = 6;
const WFP_BLOCK_WEIGHT: u8 = 1;
const WFP_PERMIT_WEIGHT: u8 = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WfpLayer {
    ConnectV4,
    ConnectV6,
    RecvAcceptV4,
    RecvAcceptV6,
    ResourceAssignmentV4,
    ResourceAssignmentV6,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WfpCondition {
    /// The connection's ALE user is the sandbox account.
    User,
    /// IP protocol number.
    Protocol(u8),
    /// Remote address in `127.0.0.0/8` (IPv4) or `::1` (IPv6), by the filter's layer.
    RemoteLoopback,
    /// Remote port in an inclusive range.
    RemotePorts(u16, u16),
    /// Traffic that is not loopback (`FWP_CONDITION_FLAG_IS_LOOPBACK` clear).
    NotLoopback,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WfpFilter {
    pub key: u128,
    pub name: String,
    pub layer: WfpLayer,
    pub permit: bool,
    pub weight: u8,
    pub conditions: Vec<WfpCondition>,
}

pub const IPPROTO_ICMP: u8 = 1;
pub const IPPROTO_TCP: u8 = 6;
pub const IPPROTO_ICMPV6: u8 = 58;

/// Contiguous runs of the allowed proxy ports, as inclusive ranges.
pub fn port_runs(ports: &[u16]) -> Vec<(u16, u16)> {
    let mut ports: Vec<u16> = ports.iter().copied().filter(|p| *p != 0).collect();
    ports.sort_unstable();
    ports.dedup();
    let mut runs: Vec<(u16, u16)> = Vec::new();
    for port in ports {
        match runs.last_mut() {
            Some((_, high)) if u32::from(*high) + 1 == u32::from(port) => *high = port,
            _ => runs.push((port, port)),
        }
    }
    runs
}

/// Every filter `setup` installs for `proxy_ports`: block every connection, every non-loopback inbound
/// accept and every ICMP socket of the sandbox account, and permit loopback TCP to the proxy ports.
pub fn wfp_filters(proxy_ports: &[u16]) -> Result<Vec<WfpFilter>, String> {
    use WfpCondition::*;
    use WfpLayer::*;
    let runs = port_runs(proxy_ports);
    if runs.len() > WFP_MAX_PORT_RUNS {
        return Err(format!("at most {WFP_MAX_PORT_RUNS} separate proxy port ranges are supported"));
    }
    let block = |index: u128, name: &str, layer: WfpLayer, conditions: Vec<WfpCondition>| WfpFilter {
        key: WFP_FILTER_KEY_BASE + index,
        name: format!("tau_sandbox_wfp_{name}"),
        layer,
        permit: false,
        weight: WFP_BLOCK_WEIGHT,
        conditions,
    };
    let mut filters = vec![
        block(0, "block_connect_v4", ConnectV4, vec![User]),
        block(1, "block_connect_v6", ConnectV6, vec![User]),
        block(2, "block_accept_v4", RecvAcceptV4, vec![User, NotLoopback]),
        block(3, "block_accept_v6", RecvAcceptV6, vec![User, NotLoopback]),
        block(4, "block_icmp_v4", ResourceAssignmentV4, vec![User, Protocol(IPPROTO_ICMP)]),
        block(5, "block_icmp_v6", ResourceAssignmentV6, vec![User, Protocol(IPPROTO_ICMPV6)]),
    ];
    for (run, (low, high)) in runs.into_iter().enumerate() {
        for (offset, layer, family) in [(0u128, ConnectV4, "v4"), (1, ConnectV6, "v6")] {
            filters.push(WfpFilter {
                key: WFP_FILTER_KEY_BASE + WFP_FIXED_FILTERS + run as u128 * 2 + offset,
                name: format!("tau_sandbox_wfp_permit_proxy_{low}_{high}_{family}"),
                layer,
                permit: true,
                weight: WFP_PERMIT_WEIGHT,
                conditions: vec![User, Protocol(IPPROTO_TCP), RemoteLoopback, RemotePorts(low, high)],
            });
        }
    }
    Ok(filters)
}

/// Every filter key Tau may have installed under any proxy port setting, for `setup` and `revoke` to clear.
pub fn wfp_all_filter_keys() -> Vec<u128> {
    (0..WFP_FIXED_FILTERS + WFP_MAX_PORT_RUNS as u128 * 2).map(|index| WFP_FILTER_KEY_BASE + index).collect()
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
        assert!(parse_ports("1,3,5,7,9,11,13,15,17").is_err());
        assert_eq!(parse_ports("1,3,5,7,9,11,13,15").unwrap().len(), 8);
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
            wfp_filters: wfp_filters(&PROXY_PORTS).unwrap().into_iter().map(|f| f.name).collect(),
            for_user: "S-1-5-21-9-9-9-500".into(),
            runner: "C:\\ProgramData\\Tau\\Sandbox\\bin\\tau-windows-sandbox.exe".into(),
            volume_capability_sid: Some("S-1-15-3-1024-1-2-3-4-5-6-7-8".into()),
            volume_roots: vec!["C:\\".into()],
        };
        let bytes = serde_json::to_vec(&record).unwrap();
        assert!(String::from_utf8_lossy(&bytes).contains("\"accountSid\""));
        assert_eq!(InstallRecord::parse(&bytes).unwrap(), record);
        assert!(String::from_utf8_lossy(&bytes).contains("\"wfpFilters\""));
        let mut older = serde_json::to_value(&record).unwrap();
        older.as_object_mut().unwrap().remove("wfpFilters");
        assert!(InstallRecord::parse(&serde_json::to_vec(&older).unwrap()).unwrap().wfp_filters.is_empty());
        let mut other = record.clone();
        other.account = "Administrator".into();
        assert!(InstallRecord::parse(&serde_json::to_vec(&other).unwrap()).is_err());
    }

    #[test]
    fn names_profiles_and_the_firewall_refusal() {
        assert_eq!(profile_names(0), Vec::<&str>::new());
        assert_eq!(profile_names(5), ["Domain", "Public"]);
        assert_eq!(profile_names(0x7fff_ffff), ["Domain", "Private", "Public"]);
        assert_eq!(
            firewall_off_message(&["Private", "Public"]),
            "Windows Firewall is off for Private, Public, so Tau cannot keep the sandbox off the network. Turn it on, then try again."
        );
    }

    #[test]
    fn groups_proxy_ports_into_runs() {
        assert_eq!(port_runs(&PROXY_PORTS), [(47311, 47312)]);
        assert_eq!(port_runs(&[5, 3, 4, 9, 0, 9]), [(3, 5), (9, 9)]);
        assert_eq!(port_runs(&[65535, 65534]), [(65534, 65535)]);
        assert!(port_runs(&[]).is_empty());
    }

    #[test]
    fn wfp_filters_block_the_account_and_permit_only_the_proxy() {
        let filters = wfp_filters(&PROXY_PORTS).unwrap();
        assert_eq!(filters.len(), 8);
        let keys: std::collections::BTreeSet<u128> = filters.iter().map(|f| f.key).collect();
        assert_eq!(keys.len(), filters.len());
        let all = wfp_all_filter_keys();
        assert!(keys.iter().all(|key| all.contains(key)));
        assert!(!all.contains(&WFP_PROVIDER_KEY) && !all.contains(&WFP_SUBLAYER_KEY));
        for filter in &filters {
            assert_eq!(filter.conditions[0], WfpCondition::User, "{}", filter.name);
            assert!(filter.name.starts_with("tau_sandbox_wfp_"));
        }
        let permits: Vec<&WfpFilter> = filters.iter().filter(|f| f.permit).collect();
        assert_eq!(permits.len(), 2);
        for permit in &permits {
            assert!(matches!(permit.layer, WfpLayer::ConnectV4 | WfpLayer::ConnectV6));
            assert!(permit.conditions.contains(&WfpCondition::RemoteLoopback));
            assert!(permit.conditions.contains(&WfpCondition::RemotePorts(47311, 47312)));
            assert!(permit.conditions.contains(&WfpCondition::Protocol(IPPROTO_TCP)));
            assert!(filters.iter().filter(|f| !f.permit).all(|block| block.weight < permit.weight));
        }
        for layer in [WfpLayer::ConnectV4, WfpLayer::ConnectV6] {
            assert!(filters.iter().any(|f| !f.permit && f.layer == layer && f.conditions == [WfpCondition::User]));
        }
    }

    #[test]
    fn wfp_filters_cap_the_port_runs() {
        let ports: Vec<u16> = (0..WFP_MAX_PORT_RUNS as u16 + 1).map(|i| 1000 + i * 2).collect();
        assert!(wfp_filters(&ports).is_err());
        let ports: Vec<u16> = (0..WFP_MAX_PORT_RUNS as u16).map(|i| 1000 + i * 2).collect();
        let filters = wfp_filters(&ports).unwrap();
        let all = wfp_all_filter_keys();
        assert!(filters.iter().all(|f| all.contains(&f.key)));
        assert_eq!(all.len(), filters.len());
    }

    #[test]
    fn local_user_spec_names_one_sid() {
        assert_eq!(local_user_spec("S-1-5-21-1-2-3-4"), "O:LSD:(A;;CC;;;S-1-5-21-1-2-3-4)");
    }
}
