//! The shell's AppContainer, created by Windows itself for a package registered per launch.
//!
//! The launcher derives a fresh package SID from a random name (`DeriveAppContainerSidFromAppContainerName`, a
//! hash with no side effect). The runner registers that name in the sandbox account's own profile
//! (`container.rs`) and passes the SID to `CreateProcessAsUserW` as
//! `PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES` with no capability, together with the write-restricted token.
//! `CreateProcess` then derives the lowbox token from that token (it keeps the restricting SIDs and is Low
//! integrity) and builds the package's named-object namespace (`\Sessions\<n>\AppContainerNamedObjects\<package
//! SID>`, its `RPC Control` directory and its links) exactly as it does for any AppContainer, handing the kernel the
//! handles so the namespace lives as long as a token of the package. Tau does not lay out that namespace itself:
//! a hand-built one (the first cut, through `NtCreateLowBoxToken`) let PowerShell start and then fail its first
//! COM wait with `E_FAIL` (WIN-X64 run 44014261732). An unregistered package does not work either: `CreateProcess`
//! fails with `ERROR_FILE_NOT_FOUND` (run 44017795494), hence the per-launch registration.
//!
//! [`probe`] checks, as the suspended shell's own token, what the shell will need first (its named-object
//! directory, the window station and desktop, a COM apartment and a COM wait) and reports every result for the
//! runner's log, so a failing launch says where it fails.

use std::ffi::c_void;

use windows_sys::Win32::Foundation::{HANDLE, NTSTATUS, UNICODE_STRING};
use windows_sys::Win32::Security::Authorization::{
    EXPLICIT_ACCESS_W, GRANT_ACCESS, GetSecurityInfo, SE_KERNEL_OBJECT, SetEntriesInAclW, SetSecurityInfo,
    TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN, TRUSTEE_W,
};
use windows_sys::Win32::Security::Isolation::DeriveAppContainerSidFromAppContainerName;
use windows_sys::Win32::Security::{
    ACL, DACL_SECURITY_INFORMATION, DuplicateTokenEx, FreeSid, NO_INHERITANCE, PSECURITY_DESCRIPTOR, PSID,
    SECURITY_CAPABILITIES, SID_AND_ATTRIBUTES, SecurityImpersonation, TOKEN_APPCONTAINER_INFORMATION, TOKEN_GROUPS,
    TOKEN_IMPERSONATE, TOKEN_MANDATORY_LABEL, TOKEN_QUERY, TokenAppContainerSid, TokenCapabilities, TokenImpersonation,
    TokenIntegrityLevel, TokenIsAppContainer, TokenRestrictedSids,
};
use windows_sys::Win32::Storage::FileSystem::{READ_CONTROL, WRITE_DAC};
use windows_sys::Win32::System::Com::{
    COINIT_APARTMENTTHREADED, CoInitializeEx, CoUninitialize, CoWaitForMultipleHandles,
};
use windows_sys::Win32::System::StationsAndDesktops::{
    CloseDesktop, CloseWindowStation, OpenDesktopW, OpenWindowStationW,
};
use windows_sys::Win32::System::Threading::{CreateEventW, SetThreadToken};

use super::sid::{Sid, token_information, token_user};
use super::util::{Error, Local, Owned, Result, check_status, wide};
use crate::appcontainer::TokenFacts;

/// `SE_GROUP_ENABLED`: a capability the token carries enabled.
const SE_GROUP_ENABLED: u32 = 0x0000_0004;
/// `DIRECTORY_QUERY | DIRECTORY_TRAVERSE | DIRECTORY_CREATE_OBJECT | DIRECTORY_CREATE_SUBDIRECTORY`: what
/// kernelbase asks for when an AppContainer process opens its own named-object directory.
const DIRECTORY_OPEN_ACCESS: u32 = 0x000F;
/// `DIRECTORY_QUERY`.
const DIRECTORY_QUERY: u32 = 0x0001;
/// `SYMBOLIC_LINK_QUERY`.
const SYMBOLIC_LINK_QUERY: u32 = 0x0001;
/// `WINSTA_ENUMDESKTOPS | WINSTA_READATTRIBUTES | WINSTA_ACCESSGLOBALATOMS`: what a GUI-capable process uses of
/// its window station, the global atom table among it (window classes such as COM's hidden STA window).
const WINSTA_PROBE_ACCESS: u32 = 0x0001 | 0x0002 | 0x0020;
/// `DESKTOP_READOBJECTS | DESKTOP_CREATEWINDOW`: enough to create the hidden window an STA uses.
const DESKTOP_PROBE_ACCESS: u32 = 0x0001 | 0x0002;
/// `RPC_S_CALLPENDING`: what a COM wait that times out returns.
const RPC_S_CALLPENDING: i32 = 0x8001_0115_u32 as i32;

#[repr(C)]
struct ObjectAttributes {
    length: u32,
    root_directory: HANDLE,
    object_name: *const UNICODE_STRING,
    attributes: u32,
    security_descriptor: *const c_void,
    security_quality_of_service: *const c_void,
}

// ntdll's native object services and kernelbase's own resolver for an AppContainer's named-object path;
// stable since Windows 8. Linked as raw dylib imports so the crate needs no import library beyond the
// toolchain's.
#[link(name = "ntdll", kind = "raw-dylib")]
unsafe extern "system" {
    fn RtlGetAppContainerNamedObjectPath(
        token: HANDLE,
        package_sid: PSID,
        relative: u8,
        path: *mut UNICODE_STRING,
    ) -> NTSTATUS;
    fn RtlFreeUnicodeString(string: *mut UNICODE_STRING);
    fn NtOpenDirectoryObject(handle: *mut HANDLE, access: u32, attributes: *const ObjectAttributes) -> NTSTATUS;
    fn NtOpenSymbolicLinkObject(handle: *mut HANDLE, access: u32, attributes: *const ObjectAttributes) -> NTSTATUS;
}

/// The `SECURITY_CAPABILITIES` attribute value for a package and its capabilities (enabled). Owns the SIDs the
/// pointers refer to, so it must outlive the `CreateProcessAsUserW` call it is passed to.
pub struct Capabilities {
    _package: Sid,
    _sids: Vec<Sid>,
    _entries: Vec<SID_AND_ATTRIBUTES>,
    value: SECURITY_CAPABILITIES,
}

impl Capabilities {
    pub fn new(package: &Sid, capabilities: &[Sid]) -> Box<Self> {
        let package = package.clone();
        let sids = capabilities.to_vec();
        let mut entries: Vec<SID_AND_ATTRIBUTES> =
            sids.iter().map(|sid| SID_AND_ATTRIBUTES { Sid: sid.as_psid(), Attributes: SE_GROUP_ENABLED }).collect();
        let value = SECURITY_CAPABILITIES {
            AppContainerSid: package.as_psid(),
            Capabilities: if entries.is_empty() { std::ptr::null_mut() } else { entries.as_mut_ptr() },
            CapabilityCount: entries.len() as u32,
            Reserved: 0,
        };
        Box::new(Self { _package: package, _sids: sids, _entries: entries, value })
    }

    pub fn as_ptr(&self) -> *const c_void {
        &self.value as *const SECURITY_CAPABILITIES as *const c_void
    }
}

/// The package SID `DeriveAppContainerSidFromAppContainerName` gives `name`. No profile is read or written.
pub fn derive_package_sid(name: &str) -> Result<Sid> {
    let name_w = wide(name);
    let mut sid: PSID = std::ptr::null_mut();
    let hr = unsafe { DeriveAppContainerSidFromAppContainerName(name_w.as_ptr(), &mut sid) };
    if hr < 0 {
        return Err(Error::code(format!("DeriveAppContainerSidFromAppContainerName({name})"), hr as u32));
    }
    let copied = unsafe { Sid::copy_from(sid) };
    unsafe { FreeSid(sid) };
    copied
}

fn groups(token: HANDLE, class: i32) -> Result<Vec<String>> {
    let buf = token_information(token, class)?;
    let groups = unsafe { &*(buf.as_ptr() as *const TOKEN_GROUPS) };
    let entries: &[SID_AND_ATTRIBUTES] =
        unsafe { std::slice::from_raw_parts(groups.Groups.as_ptr(), groups.GroupCount as usize) };
    entries.iter().map(|entry| unsafe { Sid::copy_from(entry.Sid) }.map(|sid| sid.to_sddl())).collect()
}

/// Read back what makes a token an AppContainer token.
pub fn token_facts(token: HANDLE) -> Result<TokenFacts> {
    let is_app_container = token_information(token, TokenIsAppContainer)?;
    let app_container = (is_app_container[0] as u32) != 0;
    let package = {
        let buf = token_information(token, TokenAppContainerSid)?;
        let info = unsafe { &*(buf.as_ptr() as *const TOKEN_APPCONTAINER_INFORMATION) };
        if info.TokenAppContainer.is_null() {
            None
        } else {
            Some(unsafe { Sid::copy_from(info.TokenAppContainer) }?.to_sddl())
        }
    };
    let integrity = {
        let buf = token_information(token, TokenIntegrityLevel)?;
        let label = unsafe { &*(buf.as_ptr() as *const TOKEN_MANDATORY_LABEL) };
        unsafe { Sid::copy_from(label.Label.Sid) }?.to_sddl()
    };
    Ok(TokenFacts {
        user: token_user(token)?.to_sddl(),
        app_container,
        package,
        capabilities: groups(token, TokenCapabilities)?,
        restricted: groups(token, TokenRestrictedSids)?,
        integrity,
    })
}

/// Add one access-allowed ACE for `sid` to a kernel object's DACL (a process or a token), without
/// inheritance. Used only to let the person query the shell from outside.
pub fn grant_kernel_object(handle: HANDLE, sid: &Sid, mask: u32, what: &str) -> Result<()> {
    let mut dacl: *mut ACL = std::ptr::null_mut();
    let mut sd: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
    check_status(
        unsafe {
            GetSecurityInfo(
                handle,
                SE_KERNEL_OBJECT,
                DACL_SECURITY_INFORMATION,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut dacl,
                std::ptr::null_mut(),
                &mut sd,
            )
        },
        &format!("GetSecurityInfo({what})"),
    )?;
    let _sd = Local(sd);
    let entry = EXPLICIT_ACCESS_W {
        grfAccessPermissions: mask,
        grfAccessMode: GRANT_ACCESS,
        grfInheritance: NO_INHERITANCE,
        Trustee: TRUSTEE_W {
            pMultipleTrustee: std::ptr::null_mut(),
            MultipleTrusteeOperation: 0,
            TrusteeForm: TRUSTEE_IS_SID,
            TrusteeType: TRUSTEE_IS_UNKNOWN,
            ptstrName: sid.as_psid() as *mut u16,
        },
    };
    let mut new_dacl: *mut ACL = std::ptr::null_mut();
    check_status(unsafe { SetEntriesInAclW(1, &entry, dacl, &mut new_dacl) }, &format!("SetEntriesInAclW({what})"))?;
    let _new = Local(new_dacl as *mut c_void);
    check_status(
        unsafe {
            SetSecurityInfo(
                handle,
                SE_KERNEL_OBJECT,
                DACL_SECURITY_INFORMATION,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                new_dacl,
                std::ptr::null(),
            )
        },
        &format!("SetSecurityInfo({what})"),
    )
}

fn nt_path(path: &str) -> Vec<u16> {
    path.encode_utf16().collect()
}

/// Open a named kernel object by its native path as the calling thread's token.
fn open_native(path: &str, access: u32, link: bool) -> std::result::Result<Owned, NTSTATUS> {
    let mut buffer = nt_path(path);
    let bytes = (buffer.len() * 2) as u16;
    let name = UNICODE_STRING { Length: bytes, MaximumLength: bytes, Buffer: buffer.as_mut_ptr() };
    let attributes = ObjectAttributes {
        length: size_of::<ObjectAttributes>() as u32,
        root_directory: std::ptr::null_mut(),
        object_name: &name,
        attributes: windows_sys::Win32::Foundation::OBJ_CASE_INSENSITIVE,
        security_descriptor: std::ptr::null(),
        security_quality_of_service: std::ptr::null(),
    };
    let mut handle: HANDLE = std::ptr::null_mut();
    let status = unsafe {
        if link {
            NtOpenSymbolicLinkObject(&mut handle, access, &attributes)
        } else {
            NtOpenDirectoryObject(&mut handle, access, &attributes)
        }
    };
    if status >= 0 { Ok(Owned(handle)) } else { Err(status) }
}

/// The named-object directory Windows resolves for an AppContainer token (`\Sessions\<n>\AppContainerNamedObjects\
/// <package SID>`), as kernelbase itself resolves it.
pub fn named_object_path(token: HANDLE) -> Result<String> {
    let mut path = UNICODE_STRING { Length: 0, MaximumLength: 0, Buffer: std::ptr::null_mut() };
    let status = unsafe { RtlGetAppContainerNamedObjectPath(token, std::ptr::null_mut(), 0, &mut path) };
    if status < 0 {
        return Err(Error::msg(format!("RtlGetAppContainerNamedObjectPath (NTSTATUS {:#010x})", status as u32)));
    }
    let text =
        String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(path.Buffer, usize::from(path.Length) / 2) });
    unsafe { RtlFreeUnicodeString(&mut path) };
    Ok(text)
}

fn status_text(opened: std::result::Result<Owned, NTSTATUS>) -> String {
    match opened {
        Ok(_) => "ok".to_owned(),
        Err(status) => format!("{:#010x}", status as u32),
    }
}

/// Let the shell's restricted pass through its own named-object directory and its `RPC Control`. A
/// write-restricted token needs one of its restricting SIDs granted for `DIRECTORY_CREATE_OBJECT` (a write
/// right), and the DACL `CreateProcess` gives the namespace is built for unrestricted AppContainer tokens and is
/// not documented to grant any of them. One non-inheritable ACE for the logon SID (`DIRECTORY_OPEN_ACCESS | READ_CONTROL`, never
/// `DELETE` or `WRITE_DAC`) is added to each; the objects are temporary and go away with the launch, so there is
/// nothing to restore. Returns a line for the runner's log; the caller logs a failure and goes on, since the
/// grant only widens the shell's own namespace and [`probe`] reports what the shell can open either way.
pub fn admit_namespace(token: HANDLE, logon: &Sid) -> Result<String> {
    let path = named_object_path(token)?;
    let mut granted = Vec::new();
    for name in [path.clone(), format!("{path}\\RPC Control")] {
        let directory = open_native(&name, READ_CONTROL | WRITE_DAC, false).map_err(|status| {
            Error::msg(format!("NtOpenDirectoryObject({name}) (NTSTATUS {:#010x})", status as u32))
        })?;
        grant_kernel_object(directory.raw(), logon, DIRECTORY_OPEN_ACCESS | READ_CONTROL, &name)?;
        granted.push(name);
    }
    Ok(format!("namespace granted to the logon SID: {}", granted.join(", ")))
}

fn win32_text(ok: bool) -> String {
    if ok { "ok".to_owned() } else { format!("error {}", unsafe { windows_sys::Win32::Foundation::GetLastError() }) }
}

fn hresult_text(hr: i32) -> String {
    if hr == 0 { "S_OK".to_owned() } else { format!("{:#010x}", hr as u32) }
}

/// What the shell's own token (`token`, the suspended shell's primary token) can reach of what PowerShell
/// needs first, for the runner's log. Diagnostic only: the result never admits or refuses a launch. Each probe
/// runs on a separate thread impersonating the token, so this process's own identity stays untouched; the
/// namespace layout itself is read as the runner.
///
/// `station` and `desktop` are the window station and desktop the shell starts on. The COM probe initializes a
/// single-threaded apartment, waits through `CoWaitForMultipleHandles` on a signalled and on an unsignalled event
/// (what .NET does for `WaitHandle.WaitOne` on an STA thread), and uninitializes. Under impersonation COM still
/// runs in this process, so a COM failure the shell sees and this probe does not see points at the shell's own
/// process state (its namespace or its profile), and one both see points at the token.
pub fn probe(token: HANDLE, station: &str, desktop: &str) -> String {
    let mut parts = Vec::new();
    let path = match named_object_path(token) {
        Ok(path) => path,
        Err(err) => return format!("probe: {err}"),
    };
    parts.push(format!("namespace {path}"));
    // Layout, as the runner: what CreateProcess built.
    // Each entry is reported as a link, a directory, or the open's status: `Global` is not always a link.
    let layout = ["RPC Control", "Global", "Local", "Session"]
        .iter()
        .map(|name| {
            let full = format!("{path}\\{name}");
            let kind = match open_native(&full, SYMBOLIC_LINK_QUERY, true) {
                Ok(_) => "link".to_owned(),
                Err(_) => match open_native(&full, DIRECTORY_QUERY, false) {
                    Ok(_) => "directory".to_owned(),
                    Err(status) => format!("{:#010x}", status as u32),
                },
            };
            format!("{name}={kind}")
        })
        .collect::<Vec<_>>()
        .join(",");
    parts.push(format!("layout {layout}"));

    let mut impersonation: HANDLE = std::ptr::null_mut();
    let duplicated = unsafe {
        DuplicateTokenEx(
            token,
            TOKEN_IMPERSONATE | TOKEN_QUERY,
            std::ptr::null(),
            SecurityImpersonation,
            TokenImpersonation,
            &mut impersonation,
        )
    };
    if duplicated == 0 {
        parts.push(format!("impersonation {}", win32_text(false)));
        return format!("probe: {}", parts.join("; "));
    }
    let impersonation = Owned(impersonation);
    let station_w = wide(station);
    let desktop_w = wide(desktop);
    let as_shell = std::thread::scope(|scope| {
        scope
            .spawn(|| {
                if unsafe { SetThreadToken(std::ptr::null(), impersonation.raw()) } == 0 {
                    return vec![format!("SetThreadToken {}", win32_text(false))];
                }
                let mut seen = Vec::new();
                seen.push(format!("open namespace {}", status_text(open_native(&path, DIRECTORY_OPEN_ACCESS, false))));
                let station_handle = unsafe { OpenWindowStationW(station_w.as_ptr(), 0, WINSTA_PROBE_ACCESS) };
                seen.push(format!("window station {}", win32_text(!station_handle.is_null())));
                if !station_handle.is_null() {
                    unsafe { CloseWindowStation(station_handle) };
                }
                let desktop_handle = unsafe { OpenDesktopW(desktop_w.as_ptr(), 0, 0, DESKTOP_PROBE_ACCESS) };
                seen.push(format!("desktop {}", win32_text(!desktop_handle.is_null())));
                if !desktop_handle.is_null() {
                    unsafe { CloseDesktop(desktop_handle) };
                }
                let init = unsafe { CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32) };
                seen.push(format!("CoInitializeEx(STA) {}", hresult_text(init)));
                if init >= 0 {
                    for (label, signalled, expected) in [("signalled", 1, 0), ("unsignalled", 0, RPC_S_CALLPENDING)] {
                        let event = unsafe { CreateEventW(std::ptr::null(), 1, signalled, std::ptr::null()) };
                        if event.is_null() {
                            seen.push(format!("CreateEventW {}", win32_text(false)));
                            continue;
                        }
                        let event = Owned(event);
                        let handles = [event.raw()];
                        let mut index = 0u32;
                        let hr = unsafe { CoWaitForMultipleHandles(0, 10, 1, handles.as_ptr(), &mut index) };
                        let verdict = if hr == expected { "" } else { " (unexpected)" };
                        seen.push(format!("CoWait({label}) {}{verdict}", hresult_text(hr)));
                    }
                    unsafe { CoUninitialize() };
                }
                unsafe { SetThreadToken(std::ptr::null(), std::ptr::null_mut()) };
                seen
            })
            .join()
            .unwrap_or_else(|_| vec!["the probe thread panicked".to_owned()])
    });
    parts.push(format!("as the shell: {}", as_shell.join(", ")));
    format!("probe: {}", parts.join("; "))
}
