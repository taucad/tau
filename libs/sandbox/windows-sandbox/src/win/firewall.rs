//! Windows Firewall rules scoped to the sandbox account, through `INetFwPolicy2` (the Codex
//! `setup_provisioning/firewall.rs` approach, written for Tau).
//!
//! Every rule is a block rule whose `LocalUserAuthorizedList` names only `TauSandbox`:
//! outbound and inbound to every non-loopback address, loopback UDP, and loopback TCP to every port but
//! the recorded proxy block. Rules are found by their stable names, so `setup` repairs and `revoke` removes
//! them idempotently. Rules do nothing for a profile whose firewall is off, and Windows Firewall does not
//! filter loopback or own-host traffic, so the WFP filters in `wfp.rs` carry that part of the fence and
//! `launch` refuses while the firewall is off for a current profile ([`state`]). `setup` never turns the
//! firewall on: that is machine policy.

use windows::Win32::Foundation::{RPC_E_CHANGED_MODE, S_OK, VARIANT_TRUE};
use windows::Win32::NetworkManagement::WindowsFirewall::{
    INetFwPolicy2, INetFwRule, INetFwRule3, INetFwRules, NET_FW_ACTION_BLOCK, NET_FW_IP_PROTOCOL_ANY,
    NET_FW_IP_PROTOCOL_TCP, NET_FW_IP_PROTOCOL_UDP, NET_FW_MODIFY_STATE, NET_FW_MODIFY_STATE_OK, NET_FW_PROFILE_TYPE2,
    NET_FW_PROFILE2_ALL, NET_FW_RULE_DIR_IN, NET_FW_RULE_DIR_OUT, NET_FW_RULE_DIRECTION, NetFwPolicy2, NetFwRule,
};
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize,
};
use windows::core::{BSTR, Interface};

use super::util::{Error, Result};
use crate::install::{
    LOOPBACK_ADDRESSES, NON_LOOPBACK_ADDRESSES, RULE_BLOCK_INBOUND, RULE_BLOCK_LOOPBACK_TCP, RULE_BLOCK_LOOPBACK_UDP,
    RULE_BLOCK_OUTBOUND, blocked_ports, local_user_spec, profile_names,
};

const GROUPING: &str = "Tau Sandbox";

struct Apartment(bool);

impl Apartment {
    fn enter() -> Result<Self> {
        let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        if hr.is_err() && hr != RPC_E_CHANGED_MODE {
            return Err(Error::code("CoInitializeEx", hr.0 as u32));
        }
        Ok(Self(hr.is_ok()))
    }
}

impl Drop for Apartment {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

fn com(context: &str) -> impl Fn(windows::core::Error) -> Error + '_ {
    move |err| Error::code(context, err.code().0 as u32)
}

fn policy() -> Result<INetFwPolicy2> {
    unsafe { CoCreateInstance(&NetFwPolicy2, None, CLSCTX_INPROC_SERVER) }
        .map_err(com("CoCreateInstance(NetFwPolicy2)"))
}

/// Fail unless local rules take effect in every current profile. The raw vtable call is used because the
/// wrapper treats `S_FALSE` (the answer holds for only some of the current profiles) as success.
fn require_local_rules_effective(policy: &INetFwPolicy2) -> Result<()> {
    let mut state = NET_FW_MODIFY_STATE::default();
    let hr = unsafe { (Interface::vtable(policy).LocalPolicyModifyState)(Interface::as_raw(policy), &mut state) };
    if hr.is_err() {
        return Err(Error::code("INetFwPolicy2::LocalPolicyModifyState", hr.0 as u32));
    }
    if hr != S_OK {
        return Err(Error::msg("local firewall rules would not take effect in every current profile"));
    }
    if state != NET_FW_MODIFY_STATE_OK {
        return Err(Error::msg(format!(
            "local firewall rules would not take effect (group policy or firewall state {})",
            state.0
        )));
    }
    Ok(())
}

fn rules(require_effective: bool) -> Result<INetFwRules> {
    let policy = policy()?;
    if require_effective {
        require_local_rules_effective(&policy)?;
    }
    unsafe { policy.Rules() }.map_err(com("INetFwPolicy2::Rules"))
}

#[derive(Clone, Copy)]
struct BlockRule<'a> {
    name: &'a str,
    description: &'a str,
    direction: NET_FW_RULE_DIRECTION,
    protocol: i32,
    remote_addresses: &'a str,
    remote_ports: Option<&'a str>,
}

fn configure(rule: &INetFwRule3, spec: &BlockRule<'_>, users: &str) -> Result<()> {
    unsafe {
        rule.SetDescription(&BSTR::from(spec.description)).map_err(com("SetDescription"))?;
        rule.SetGrouping(&BSTR::from(GROUPING)).map_err(com("SetGrouping"))?;
        rule.SetDirection(spec.direction).map_err(com("SetDirection"))?;
        rule.SetAction(NET_FW_ACTION_BLOCK).map_err(com("SetAction"))?;
        rule.SetProfiles(NET_FW_PROFILE2_ALL.0).map_err(com("SetProfiles"))?;
        // Ports can be set only on TCP/UDP rules, and must be cleared before the protocol changes.
        rule.SetProtocol(NET_FW_IP_PROTOCOL_ANY.0).map_err(com("SetProtocol(any)"))?;
        rule.SetProtocol(spec.protocol).map_err(com("SetProtocol"))?;
        if let Some(ports) = spec.remote_ports {
            rule.SetRemotePorts(&BSTR::from(ports)).map_err(com("SetRemotePorts"))?;
        }
        rule.SetRemoteAddresses(&BSTR::from(spec.remote_addresses)).map_err(com("SetRemoteAddresses"))?;
        rule.SetLocalUserAuthorizedList(&BSTR::from(users)).map_err(com("SetLocalUserAuthorizedList"))?;
        rule.SetEnabled(VARIANT_TRUE).map_err(com("SetEnabled"))?;
    }
    Ok(())
}

/// Read a rule back: why it would not block the account, or nothing when it would.
fn rule_problems(rule: &INetFwRule, direction: NET_FW_RULE_DIRECTION, account_sid: &str) -> Vec<String> {
    let mut problems = Vec::new();
    unsafe {
        if rule.Enabled().map(|enabled| enabled != VARIANT_TRUE).unwrap_or(true) {
            problems.push("is disabled".to_owned());
        }
        if rule.Action().map(|action| action != NET_FW_ACTION_BLOCK).unwrap_or(true) {
            problems.push("does not block".to_owned());
        }
        if rule.Direction().map(|actual| actual != direction).unwrap_or(true) {
            problems.push("has the wrong direction".to_owned());
        }
        if rule.Profiles().map(|profiles| profiles & NET_FW_PROFILE2_ALL.0 != NET_FW_PROFILE2_ALL.0).unwrap_or(true) {
            problems.push("does not apply to every profile".to_owned());
        }
        let users = rule.cast::<INetFwRule3>().and_then(|rule| rule.LocalUserAuthorizedList()).map(|b| b.to_string());
        if !users.map(|users| users.contains(account_sid)).unwrap_or(false) {
            problems.push("is not scoped to the sandbox account".to_owned());
        }
    }
    problems
}

fn ensure(rules: &INetFwRules, spec: &BlockRule<'_>, users: &str) -> Result<()> {
    let name = BSTR::from(spec.name);
    // Replace rather than patch: a rule of the same name is always rebuilt from scratch.
    if unsafe { rules.Item(&name) }.is_ok() {
        unsafe { rules.Remove(&name) }.map_err(com("INetFwRules::Remove"))?;
    }
    let rule: INetFwRule3 = unsafe { CoCreateInstance(&NetFwRule, None, CLSCTX_INPROC_SERVER) }
        .map_err(com("CoCreateInstance(NetFwRule)"))?;
    unsafe { rule.SetName(&name) }.map_err(com("SetName"))?;
    configure(&rule, spec, users).map_err(|error| Error::msg(format!("firewall rule {}: {error}", spec.name)))?;
    unsafe { rules.Add(&rule.cast::<INetFwRule>().map_err(com("cast"))?) }.map_err(com("INetFwRules::Add"))?;
    Ok(())
}

/// Install or repair the four block rules for `account_sid`. The broad loopback TCP block goes in before
/// it is narrowed to the port complement, so a failure part-way leaves the account more blocked, not less.
pub fn ensure_rules(account_sid: &str, proxy_ports: &[u16]) -> Result<Vec<String>> {
    let _apartment = Apartment::enter()?;
    let rules = rules(true)?;
    let users = local_user_spec(account_sid);
    let specs = rule_specs();
    for spec in &specs {
        ensure(&rules, spec, &users)?;
    }
    if let Some(ports) = blocked_ports(proxy_ports) {
        let narrowed = BlockRule { remote_ports: Some(&ports), ..specs[3] };
        ensure(&rules, &narrowed, &users)?;
    }
    // Read every rule back as Windows stored it.
    let problems = check_rules(&rules, account_sid);
    if !problems.is_empty() {
        return Err(Error::msg(format!("the firewall rules did not read back as written: {}", problems.join("; "))));
    }
    Ok(specs.iter().map(|spec| spec.name.to_owned()).collect())
}

fn check_rules(rules: &INetFwRules, account_sid: &str) -> Vec<String> {
    let mut problems = Vec::new();
    for spec in rule_specs() {
        match unsafe { rules.Item(&BSTR::from(spec.name)) } {
            Ok(rule) => problems.extend(
                rule_problems(&rule, spec.direction, account_sid)
                    .into_iter()
                    .map(|problem| format!("{} {problem}", spec.name)),
            ),
            Err(_) => problems.push(format!("{} is missing", spec.name)),
        }
    }
    problems
}

/// The firewall's part of the network fence, as `status` and `launch` see it.
pub struct State {
    /// The current profiles whose firewall is off; empty when it is on for all of them.
    pub off_profiles: Vec<&'static str>,
    /// Why the four rules would not block the account; empty when they would.
    pub rule_problems: Vec<String>,
}

/// Query the firewall without changing it. Runs as the person.
pub fn state(account_sid: Option<&str>) -> Result<State> {
    let _apartment = Apartment::enter()?;
    let policy = policy()?;
    let current = unsafe { policy.CurrentProfileTypes() }.map_err(com("INetFwPolicy2::CurrentProfileTypes"))?;
    let mut off_profiles = Vec::new();
    for (bit, name) in [1, 2, 4].into_iter().zip(profile_names(7)) {
        if current & bit == 0 {
            continue;
        }
        let enabled = unsafe { policy.get_FirewallEnabled(NET_FW_PROFILE_TYPE2(bit)) }
            .map_err(com("INetFwPolicy2::FirewallEnabled"))?;
        if enabled != VARIANT_TRUE {
            off_profiles.push(name);
        }
    }
    let rule_problems = match account_sid {
        Some(sid) => {
            let rules = unsafe { policy.Rules() }.map_err(com("INetFwPolicy2::Rules"))?;
            check_rules(&rules, sid)
        }
        None => vec!["the sandbox is not set up".to_owned()],
    };
    Ok(State { off_profiles, rule_problems })
}

fn rule_specs() -> [BlockRule<'static>; 4] {
    [
        BlockRule {
            name: RULE_BLOCK_OUTBOUND,
            description: "Tau sandbox: block all outbound traffic to non-loopback addresses",
            direction: NET_FW_RULE_DIR_OUT,
            protocol: NET_FW_IP_PROTOCOL_ANY.0,
            remote_addresses: NON_LOOPBACK_ADDRESSES,
            remote_ports: None,
        },
        BlockRule {
            name: RULE_BLOCK_INBOUND,
            description: "Tau sandbox: block all inbound traffic from non-loopback addresses",
            direction: NET_FW_RULE_DIR_IN,
            protocol: NET_FW_IP_PROTOCOL_ANY.0,
            remote_addresses: NON_LOOPBACK_ADDRESSES,
            remote_ports: None,
        },
        BlockRule {
            name: RULE_BLOCK_LOOPBACK_UDP,
            description: "Tau sandbox: block loopback UDP",
            direction: NET_FW_RULE_DIR_OUT,
            protocol: NET_FW_IP_PROTOCOL_UDP.0,
            remote_addresses: LOOPBACK_ADDRESSES,
            remote_ports: None,
        },
        BlockRule {
            name: RULE_BLOCK_LOOPBACK_TCP,
            description: "Tau sandbox: block loopback TCP except the proxy port block",
            direction: NET_FW_RULE_DIR_OUT,
            protocol: NET_FW_IP_PROTOCOL_TCP.0,
            remote_addresses: LOOPBACK_ADDRESSES,
            remote_ports: None,
        },
    ]
}

/// Remove the named rules; a rule that is already gone is fine.
pub fn remove_rules(names: &[&str]) -> Result<()> {
    let _apartment = Apartment::enter()?;
    let rules = rules(false)?;
    for name in names {
        let name = BSTR::from(*name);
        if unsafe { rules.Item(&name) }.is_ok() {
            unsafe { rules.Remove(&name) }.map_err(com("INetFwRules::Remove"))?;
        }
    }
    Ok(())
}
