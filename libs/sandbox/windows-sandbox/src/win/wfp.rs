//! Persistent Windows Filtering Platform filters for the sandbox account (the plan is
//! `crate::install::wfp_filters`).
//!
//! Windows Firewall rules do not filter loopback or own-host traffic, and they do nothing while the firewall
//! is off for a profile. These filters live in Tau's own provider and sublayer and match the sandbox
//! account through `FWPM_CONDITION_ALE_USER_ID`, so they hold either way. `setup` installs them in one
//! transaction, `revoke` removes them, and `status`/`launch` confirm each is present. Codex's
//! `windows-sandbox-rs/src/wfp.rs` was read as reference; this is written for Tau.

use std::ffi::c_void;

use windows_sys::Win32::Foundation::{FWP_E_ALREADY_EXISTS, FWP_E_FILTER_NOT_FOUND, FWP_E_NOT_FOUND, HANDLE};
use windows_sys::Win32::Foundation::{FWP_E_PROVIDER_NOT_FOUND, FWP_E_SUBLAYER_NOT_FOUND};
use windows_sys::Win32::NetworkManagement::WindowsFilteringPlatform::{
    FWP_ACTION_BLOCK, FWP_ACTION_PERMIT, FWP_BYTE_ARRAY16, FWP_BYTE_ARRAY16_TYPE, FWP_BYTE_BLOB,
    FWP_CONDITION_FLAG_IS_LOOPBACK, FWP_CONDITION_VALUE0, FWP_CONDITION_VALUE0_0, FWP_EMPTY, FWP_MATCH_EQUAL,
    FWP_MATCH_FLAGS_NONE_SET, FWP_MATCH_RANGE, FWP_RANGE_TYPE, FWP_RANGE0, FWP_SECURITY_DESCRIPTOR_TYPE, FWP_UINT8,
    FWP_UINT16, FWP_UINT32, FWP_V4_ADDR_AND_MASK, FWP_V4_ADDR_MASK, FWP_VALUE0, FWP_VALUE0_0, FWPM_ACTION0,
    FWPM_ACTION0_0, FWPM_CONDITION_ALE_USER_ID, FWPM_CONDITION_FLAGS, FWPM_CONDITION_IP_PROTOCOL,
    FWPM_CONDITION_IP_REMOTE_ADDRESS, FWPM_CONDITION_IP_REMOTE_PORT, FWPM_DISPLAY_DATA0, FWPM_FILTER_CONDITION0,
    FWPM_FILTER_FLAG_PERSISTENT, FWPM_FILTER0, FWPM_FILTER0_0, FWPM_LAYER_ALE_AUTH_CONNECT_V4,
    FWPM_LAYER_ALE_AUTH_CONNECT_V6, FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V4, FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V6,
    FWPM_LAYER_ALE_RESOURCE_ASSIGNMENT_V4, FWPM_LAYER_ALE_RESOURCE_ASSIGNMENT_V6, FWPM_PROVIDER_FLAG_PERSISTENT,
    FWPM_PROVIDER0, FWPM_SESSION0, FWPM_SUBLAYER_FLAG_PERSISTENT, FWPM_SUBLAYER0, FwpmEngineClose0, FwpmEngineOpen0,
    FwpmFilterAdd0, FwpmFilterDeleteByKey0, FwpmFilterGetByKey0, FwpmFreeMemory0, FwpmProviderAdd0,
    FwpmProviderDeleteByKey0, FwpmSubLayerAdd0, FwpmSubLayerDeleteByKey0, FwpmTransactionAbort0, FwpmTransactionBegin0,
    FwpmTransactionCommit0,
};
use windows_sys::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows_sys::Win32::Security::PSECURITY_DESCRIPTOR;
use windows_sys::Win32::System::Rpc::RPC_C_AUTHN_WINNT;
use windows_sys::core::GUID;

use super::util::{Error, Local, Result, check, wide};
use crate::install::{
    WFP_PROVIDER_KEY, WFP_SUBLAYER_KEY, WfpCondition, WfpFilter, WfpLayer, local_user_spec, wfp_all_filter_keys,
    wfp_filters,
};

const NAME: &str = "Tau Sandbox";
/// Evaluated ahead of most other sublayers, so a hard permit elsewhere does not pre-empt the block.
const SUBLAYER_WEIGHT: u16 = 0xF000;
/// Management access to Tau's WFP objects: full control for SYSTEM and Administrators, read for any
/// authenticated user so a non-elevated `status` or `launch` can confirm the filters exist.
const OBJECT_SDDL: &str = "O:BAG:BAD:(A;;GA;;;SY)(A;;GA;;;BA)(A;;GR;;;AU)";

fn wfp(result: u32, context: &str, allowed: &[i32]) -> Result<()> {
    if result == 0 || allowed.iter().any(|code| *code as u32 == result) {
        Ok(())
    } else {
        Err(Error::code(context, result))
    }
}

struct Engine(HANDLE);

impl Engine {
    fn open() -> Result<Self> {
        let name = wide(NAME);
        let mut session: FWPM_SESSION0 = unsafe { std::mem::zeroed() };
        session.displayData = FWPM_DISPLAY_DATA0 { name: name.as_ptr() as *mut u16, description: std::ptr::null_mut() };
        session.txnWaitTimeoutInMSec = 5_000;
        let mut handle: HANDLE = std::ptr::null_mut();
        wfp(
            unsafe { FwpmEngineOpen0(std::ptr::null(), RPC_C_AUTHN_WINNT, std::ptr::null(), &session, &mut handle) },
            "FwpmEngineOpen0",
            &[],
        )?;
        Ok(Self(handle))
    }

    /// Run `body` in one transaction, committed only when it succeeds.
    fn transaction(&self, body: impl FnOnce(HANDLE) -> Result<()>) -> Result<()> {
        wfp(unsafe { FwpmTransactionBegin0(self.0, 0) }, "FwpmTransactionBegin0", &[])?;
        match body(self.0) {
            Ok(()) => wfp(unsafe { FwpmTransactionCommit0(self.0) }, "FwpmTransactionCommit0", &[]),
            Err(err) => {
                unsafe { FwpmTransactionAbort0(self.0) };
                Err(err)
            }
        }
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        unsafe { FwpmEngineClose0(self.0) };
    }
}

/// A self-relative security descriptor parsed from SDDL, with its length.
struct Descriptor {
    sd: Local,
    len: u32,
}

impl Descriptor {
    fn parse(sddl: &str) -> Result<Self> {
        let sddl_w = wide(sddl);
        let mut sd: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
        let mut len = 0u32;
        check(
            unsafe {
                ConvertStringSecurityDescriptorToSecurityDescriptorW(
                    sddl_w.as_ptr(),
                    SDDL_REVISION_1,
                    &mut sd,
                    &mut len,
                )
            },
            "ConvertStringSecurityDescriptorToSecurityDescriptorW",
        )?;
        Ok(Self { sd: Local(sd), len })
    }
}

fn layer_key(layer: WfpLayer) -> GUID {
    match layer {
        WfpLayer::ConnectV4 => FWPM_LAYER_ALE_AUTH_CONNECT_V4,
        WfpLayer::ConnectV6 => FWPM_LAYER_ALE_AUTH_CONNECT_V6,
        WfpLayer::RecvAcceptV4 => FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V4,
        WfpLayer::RecvAcceptV6 => FWPM_LAYER_ALE_AUTH_RECV_ACCEPT_V6,
        WfpLayer::ResourceAssignmentV4 => FWPM_LAYER_ALE_RESOURCE_ASSIGNMENT_V4,
        WfpLayer::ResourceAssignmentV6 => FWPM_LAYER_ALE_RESOURCE_ASSIGNMENT_V6,
    }
}

fn is_v6(layer: WfpLayer) -> bool {
    matches!(layer, WfpLayer::ConnectV6 | WfpLayer::RecvAcceptV6 | WfpLayer::ResourceAssignmentV6)
}

fn empty_blob() -> FWP_BYTE_BLOB {
    FWP_BYTE_BLOB { size: 0, data: std::ptr::null_mut() }
}

fn uint16(value: u16) -> FWP_VALUE0 {
    FWP_VALUE0 { r#type: FWP_UINT16, Anonymous: FWP_VALUE0_0 { uint16: value } }
}

/// Values a filter's conditions point at; boxed so their addresses stay put until the filter is added.
struct ConditionStorage {
    v4_loopback: Box<FWP_V4_ADDR_AND_MASK>,
    v6_loopback: Box<FWP_BYTE_ARRAY16>,
    /// A filter has at most one port range.
    range: Box<FWP_RANGE0>,
}

fn conditions(
    filter: &WfpFilter,
    user: &mut FWP_BYTE_BLOB,
    storage: &mut ConditionStorage,
) -> Vec<FWPM_FILTER_CONDITION0> {
    let condition = |field: GUID, match_type, r#type, value: FWP_CONDITION_VALUE0_0| FWPM_FILTER_CONDITION0 {
        fieldKey: field,
        matchType: match_type,
        conditionValue: FWP_CONDITION_VALUE0 { r#type, Anonymous: value },
    };
    let mut out = Vec::new();
    for spec in &filter.conditions {
        out.push(match *spec {
            WfpCondition::User => condition(
                FWPM_CONDITION_ALE_USER_ID,
                FWP_MATCH_EQUAL,
                FWP_SECURITY_DESCRIPTOR_TYPE,
                FWP_CONDITION_VALUE0_0 { sd: user as *mut FWP_BYTE_BLOB },
            ),
            WfpCondition::Protocol(protocol) => condition(
                FWPM_CONDITION_IP_PROTOCOL,
                FWP_MATCH_EQUAL,
                FWP_UINT8,
                FWP_CONDITION_VALUE0_0 { uint8: protocol },
            ),
            WfpCondition::RemoteLoopback if is_v6(filter.layer) => condition(
                FWPM_CONDITION_IP_REMOTE_ADDRESS,
                FWP_MATCH_EQUAL,
                FWP_BYTE_ARRAY16_TYPE,
                FWP_CONDITION_VALUE0_0 { byteArray16: &mut *storage.v6_loopback },
            ),
            WfpCondition::RemoteLoopback => condition(
                FWPM_CONDITION_IP_REMOTE_ADDRESS,
                FWP_MATCH_EQUAL,
                FWP_V4_ADDR_MASK,
                FWP_CONDITION_VALUE0_0 { v4AddrMask: &mut *storage.v4_loopback },
            ),
            WfpCondition::RemotePorts(low, high) if low == high => condition(
                FWPM_CONDITION_IP_REMOTE_PORT,
                FWP_MATCH_EQUAL,
                FWP_UINT16,
                FWP_CONDITION_VALUE0_0 { uint16: low },
            ),
            WfpCondition::RemotePorts(low, high) => {
                *storage.range = FWP_RANGE0 { valueLow: uint16(low), valueHigh: uint16(high) };
                let range: *mut FWP_RANGE0 = &mut *storage.range;
                condition(
                    FWPM_CONDITION_IP_REMOTE_PORT,
                    FWP_MATCH_RANGE,
                    FWP_RANGE_TYPE,
                    FWP_CONDITION_VALUE0_0 { rangeValue: range },
                )
            }
            WfpCondition::NotLoopback => condition(
                FWPM_CONDITION_FLAGS,
                FWP_MATCH_FLAGS_NONE_SET,
                FWP_UINT32,
                FWP_CONDITION_VALUE0_0 { uint32: FWP_CONDITION_FLAG_IS_LOOPBACK },
            ),
        });
    }
    out
}

fn add_filter(engine: HANDLE, filter: &WfpFilter, user_sd: &Descriptor, object_sd: &Descriptor) -> Result<()> {
    let name = wide(&filter.name);
    let mut provider_key = GUID::from_u128(WFP_PROVIDER_KEY);
    let mut user = FWP_BYTE_BLOB { size: user_sd.len, data: user_sd.sd.0 as *mut u8 };
    let mut storage = ConditionStorage {
        // WFP takes IPv4 addresses in host byte order.
        v4_loopback: Box::new(FWP_V4_ADDR_AND_MASK { addr: 0x7F00_0000, mask: 0xFF00_0000 }),
        v6_loopback: Box::new(FWP_BYTE_ARRAY16 { byteArray16: std::net::Ipv6Addr::LOCALHOST.octets() }),
        range: Box::new(FWP_RANGE0 { valueLow: uint16(0), valueHigh: uint16(0) }),
    };
    let mut conditions = conditions(filter, &mut user, &mut storage);
    let record = FWPM_FILTER0 {
        filterKey: GUID::from_u128(filter.key),
        displayData: FWPM_DISPLAY_DATA0 { name: name.as_ptr() as *mut u16, description: std::ptr::null_mut() },
        flags: FWPM_FILTER_FLAG_PERSISTENT,
        providerKey: &mut provider_key,
        providerData: empty_blob(),
        layerKey: layer_key(filter.layer),
        subLayerKey: GUID::from_u128(WFP_SUBLAYER_KEY),
        weight: FWP_VALUE0 { r#type: FWP_UINT8, Anonymous: FWP_VALUE0_0 { uint8: filter.weight } },
        numFilterConditions: conditions.len() as u32,
        filterCondition: conditions.as_mut_ptr(),
        action: FWPM_ACTION0 {
            r#type: if filter.permit { FWP_ACTION_PERMIT } else { FWP_ACTION_BLOCK },
            Anonymous: FWPM_ACTION0_0 { filterType: GUID::from_u128(0) },
        },
        Anonymous: FWPM_FILTER0_0 { rawContext: 0 },
        reserved: std::ptr::null_mut(),
        filterId: 0,
        effectiveWeight: FWP_VALUE0 { r#type: FWP_EMPTY, Anonymous: FWP_VALUE0_0 { uint64: std::ptr::null_mut() } },
    };
    let mut id = 0u64;
    wfp(
        unsafe { FwpmFilterAdd0(engine, &record, object_sd.sd.0, &mut id) },
        &format!("FwpmFilterAdd0({})", filter.name),
        &[],
    )
}

fn delete_filters(engine: HANDLE) -> Result<()> {
    for key in wfp_all_filter_keys() {
        wfp(
            unsafe { FwpmFilterDeleteByKey0(engine, &GUID::from_u128(key)) },
            "FwpmFilterDeleteByKey0",
            &[FWP_E_FILTER_NOT_FOUND, FWP_E_NOT_FOUND],
        )?;
    }
    Ok(())
}

/// Install (or rebuild) the filters for `account_sid` and `proxy_ports`, all or nothing. Returns their names.
pub fn install(account_sid: &str, proxy_ports: &[u16]) -> Result<Vec<String>> {
    let filters = wfp_filters(proxy_ports).map_err(Error::msg)?;
    let user_sd = Descriptor::parse(&local_user_spec(account_sid))?;
    let object_sd = Descriptor::parse(OBJECT_SDDL)?;
    let engine = Engine::open()?;
    engine.transaction(|handle| {
        let name = wide(NAME);
        let provider = FWPM_PROVIDER0 {
            providerKey: GUID::from_u128(WFP_PROVIDER_KEY),
            displayData: FWPM_DISPLAY_DATA0 { name: name.as_ptr() as *mut u16, description: std::ptr::null_mut() },
            flags: FWPM_PROVIDER_FLAG_PERSISTENT,
            providerData: empty_blob(),
            serviceName: std::ptr::null_mut(),
        };
        wfp(
            unsafe { FwpmProviderAdd0(handle, &provider, object_sd.sd.0) },
            "FwpmProviderAdd0",
            &[FWP_E_ALREADY_EXISTS],
        )?;
        let mut provider_key = GUID::from_u128(WFP_PROVIDER_KEY);
        let sublayer = FWPM_SUBLAYER0 {
            subLayerKey: GUID::from_u128(WFP_SUBLAYER_KEY),
            displayData: FWPM_DISPLAY_DATA0 { name: name.as_ptr() as *mut u16, description: std::ptr::null_mut() },
            flags: FWPM_SUBLAYER_FLAG_PERSISTENT,
            providerKey: &mut provider_key,
            providerData: empty_blob(),
            weight: SUBLAYER_WEIGHT,
        };
        wfp(
            unsafe { FwpmSubLayerAdd0(handle, &sublayer, object_sd.sd.0) },
            "FwpmSubLayerAdd0",
            &[FWP_E_ALREADY_EXISTS],
        )?;
        delete_filters(handle)?;
        for filter in &filters {
            add_filter(handle, filter, &user_sd, &object_sd)?;
        }
        Ok(())
    })?;
    Ok(filters.into_iter().map(|filter| filter.name).collect())
}

/// Remove every Tau filter, the sublayer and the provider; what is already gone is fine.
pub fn remove() -> Result<()> {
    let engine = Engine::open()?;
    engine.transaction(|handle| {
        delete_filters(handle)?;
        wfp(
            unsafe { FwpmSubLayerDeleteByKey0(handle, &GUID::from_u128(WFP_SUBLAYER_KEY)) },
            "FwpmSubLayerDeleteByKey0",
            &[FWP_E_SUBLAYER_NOT_FOUND, FWP_E_NOT_FOUND],
        )?;
        wfp(
            unsafe { FwpmProviderDeleteByKey0(handle, &GUID::from_u128(WFP_PROVIDER_KEY)) },
            "FwpmProviderDeleteByKey0",
            &[FWP_E_PROVIDER_NOT_FOUND, FWP_E_NOT_FOUND],
        )
    })
}

/// The names of the filters `proxy_ports` needs that are not installed. `Err` when WFP cannot be asked.
pub fn missing(proxy_ports: &[u16]) -> Result<Vec<String>> {
    let filters = wfp_filters(proxy_ports).map_err(Error::msg)?;
    let engine = Engine::open()?;
    let mut missing = Vec::new();
    for filter in filters {
        let mut found: *mut FWPM_FILTER0 = std::ptr::null_mut();
        let result = unsafe { FwpmFilterGetByKey0(engine.0, &GUID::from_u128(filter.key), &mut found) };
        if !found.is_null() {
            let mut memory = found as *mut c_void;
            unsafe { FwpmFreeMemory0(&mut memory) };
        }
        match result {
            0 => {}
            code if code == FWP_E_FILTER_NOT_FOUND as u32 || code == FWP_E_NOT_FOUND as u32 => {
                missing.push(filter.name)
            }
            code => return Err(Error::code(format!("FwpmFilterGetByKey0({})", filter.name), code)),
        }
    }
    Ok(missing)
}
