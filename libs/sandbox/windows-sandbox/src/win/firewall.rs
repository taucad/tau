//! Windows Firewall rules scoped to the sandbox account, through `INetFwPolicy2` (the Codex
//! `setup_provisioning/firewall.rs` approach, written for Tau).
//!
//! Every rule is a block rule whose `LocalUserAuthorizedList` names only `TauSandbox`:
//! outbound and inbound to every non-loopback address, loopback UDP, and loopback TCP to every port but
//! the recorded proxy block. Rules are found by their stable names, so `setup` repairs and `revoke` removes
//! them idempotently.

use windows::Win32::Foundation::{RPC_E_CHANGED_MODE, VARIANT_TRUE};
use windows::Win32::NetworkManagement::WindowsFirewall::{
    INetFwPolicy2, INetFwRule3, INetFwRules, NET_FW_ACTION_BLOCK, NET_FW_IP_PROTOCOL_ANY, NET_FW_IP_PROTOCOL_TCP,
    NET_FW_IP_PROTOCOL_UDP, NET_FW_MODIFY_STATE_OK, NET_FW_PROFILE2_ALL, NET_FW_RULE_DIR_IN, NET_FW_RULE_DIR_OUT,
    NET_FW_RULE_DIRECTION, NetFwPolicy2, NetFwRule,
};
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize,
};
use windows::core::{BSTR, Interface};

use super::util::{Error, Result};
use crate::install::{
    LOOPBACK_ADDRESSES, NON_LOOPBACK_ADDRESSES, RULE_BLOCK_INBOUND, RULE_BLOCK_LOOPBACK_TCP, RULE_BLOCK_LOOPBACK_UDP,
    RULE_BLOCK_OUTBOUND, blocked_ports, local_user_spec,
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

fn rules(require_effective: bool) -> Result<INetFwRules> {
    let policy: INetFwPolicy2 = unsafe { CoCreateInstance(&NetFwPolicy2, None, CLSCTX_INPROC_SERVER) }
        .map_err(com("CoCreateInstance(NetFwPolicy2)"))?;
    if !require_effective {
        return unsafe { policy.Rules() }.map_err(com("INetFwPolicy2::Rules"));
    }
    let state = unsafe { policy.LocalPolicyModifyState() }.map_err(com("LocalPolicyModifyState"))?;
    if state != NET_FW_MODIFY_STATE_OK {
        return Err(Error::msg(format!(
            "local firewall rules would not take effect (group policy or firewall state {})",
            state.0
        )));
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
    unsafe {
        rules.Add(&rule.cast::<windows::Win32::NetworkManagement::WindowsFirewall::INetFwRule>().map_err(com("cast"))?)
    }
    .map_err(com("INetFwRules::Add"))?;
    Ok(())
}

/// Install or repair the four block rules for `account_sid`. The broad loopback TCP block goes in before
/// it is narrowed to the port complement, so a failure part-way leaves the account more blocked, not less.
pub fn ensure_rules(account_sid: &str, proxy_ports: &[u16]) -> Result<Vec<String>> {
    let _apartment = Apartment::enter()?;
    let rules = rules(true)?;
    let users = local_user_spec(account_sid);
    let specs = [
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
    ];
    for spec in &specs {
        ensure(&rules, spec, &users)?;
    }
    if let Some(ports) = blocked_ports(proxy_ports) {
        let narrowed = BlockRule { remote_ports: Some(&ports), ..specs[3] };
        ensure(&rules, &narrowed, &users)?;
    }
    Ok(specs.iter().map(|spec| spec.name.to_owned()).collect())
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
