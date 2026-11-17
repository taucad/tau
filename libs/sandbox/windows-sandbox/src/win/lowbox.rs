//! The shell's AppContainer (lowbox) token, minted without an AppContainer profile.
//!
//! The profile-backed path (`CreateAppContainerProfile`, which writes per-package state into the runner's
//! `HKCU` and creates `%LOCALAPPDATA%\Packages\<name>`) would leave per-launch state behind. The runner
//! takes the route Chromium's sandbox takes for its lowbox policy (`sandbox/win/src/app_container_base.cc`,
//! `restricted_token_utils.cc`, read as reference and not vendored): the launcher derives a fresh package
//! SID from a random name (`DeriveAppContainerSidFromAppContainerName`, a hash with no side effect), and
//! the runner creates the package's named-object directory itself and calls `NtCreateLowBoxToken` on the
//! write-restricted token, handing the kernel the directory handles so they live exactly as long as a token
//! of the package does. No registry key, profile folder, firewall entry or other durable object exists for
//! the package, so nothing outlives the launch.
//!
//! The named-object directory is laid out as `CreateProcess` lays it out for a profile-backed AppContainer
//! (`\Sessions\<n>\AppContainerNamedObjects\<package SID>` with the `Global`, `Local` and `Session`
//! symbolic links and an `RPC Control` directory), so a named object the shell creates lands in its own
//! directory, and one it opens elsewhere still faces the AppContainer access check.

use std::ffi::c_void;

use windows_sys::Win32::Foundation::{HANDLE, NTSTATUS, UNICODE_STRING};
use windows_sys::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, EXPLICIT_ACCESS_W, GRANT_ACCESS, GetSecurityInfo,
    SDDL_REVISION_1, SE_KERNEL_OBJECT, SetEntriesInAclW, SetSecurityInfo, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN,
    TRUSTEE_W,
};
use windows_sys::Win32::Security::Isolation::DeriveAppContainerSidFromAppContainerName;
use windows_sys::Win32::Security::{
    ACL, DACL_SECURITY_INFORMATION, FreeSid, NO_INHERITANCE, PSECURITY_DESCRIPTOR, PSID, SID_AND_ATTRIBUTES,
    TOKEN_ALL_ACCESS, TOKEN_APPCONTAINER_INFORMATION, TOKEN_GROUPS, TOKEN_MANDATORY_LABEL, TokenAppContainerSid,
    TokenCapabilities, TokenIntegrityLevel, TokenIsAppContainer, TokenRestrictedSids,
};

use super::sid::{Sid, token_information, token_user};
use super::util::{Error, Local, Owned, Result, check, check_status, wide};
use crate::appcontainer::TokenFacts;

/// `DIRECTORY_ALL_ACCESS`.
const DIRECTORY_ALL_ACCESS: u32 = 0x000F_000F;
/// `SYMBOLIC_LINK_ALL_ACCESS`.
const SYMBOLIC_LINK_ALL_ACCESS: u32 = 0x000F_0001;
/// `DIRECTORY_QUERY | DIRECTORY_TRAVERSE | DIRECTORY_CREATE_OBJECT | DIRECTORY_CREATE_SUBDIRECTORY |
/// READ_CONTROL`: what the shell needs in its own directory, without `DELETE`, `WRITE_DAC` or `WRITE_OWNER`.
const DIRECTORY_SHELL_ACCESS: u32 = 0x0002_000F;
/// `SYMBOLIC_LINK_QUERY | READ_CONTROL`.
const SYMBOLIC_LINK_SHELL_ACCESS: u32 = 0x0002_0001;

#[repr(C)]
struct ObjectAttributes {
    length: u32,
    root_directory: HANDLE,
    object_name: *const UNICODE_STRING,
    attributes: u32,
    security_descriptor: *const c_void,
    security_quality_of_service: *const c_void,
}

// ntdll's native object and token services; stable since Windows 8 and what Chromium calls. Linked as raw
// dylib imports so the crate needs no import library beyond the toolchain's.
#[link(name = "ntdll", kind = "raw-dylib")]
unsafe extern "system" {
    fn NtCreateLowBoxToken(
        token: *mut HANDLE,
        existing: HANDLE,
        access: u32,
        attributes: *const ObjectAttributes,
        package_sid: PSID,
        capability_count: u32,
        capabilities: *const SID_AND_ATTRIBUTES,
        handle_count: u32,
        handles: *const HANDLE,
    ) -> NTSTATUS;
    fn NtCreateDirectoryObject(handle: *mut HANDLE, access: u32, attributes: *const ObjectAttributes) -> NTSTATUS;
    fn NtCreateSymbolicLinkObject(
        handle: *mut HANDLE,
        access: u32,
        attributes: *const ObjectAttributes,
        target: *const UNICODE_STRING,
    ) -> NTSTATUS;
}

fn nt(status: NTSTATUS, context: &str) -> Result<()> {
    if status >= 0 { Ok(()) } else { Err(Error::msg(format!("{context} (NTSTATUS {:#010x})", status as u32))) }
}

/// A counted UTF-16 string over a buffer that outlives it.
struct NtString {
    buffer: Vec<u16>,
}

impl NtString {
    fn new(text: &str) -> Self {
        Self { buffer: text.encode_utf16().collect() }
    }

    fn get(&mut self) -> UNICODE_STRING {
        let bytes = (self.buffer.len() * 2) as u16;
        UNICODE_STRING { Length: bytes, MaximumLength: bytes, Buffer: self.buffer.as_mut_ptr() }
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

/// A self-relative security descriptor parsed from SDDL, freed on drop.
fn descriptor(sddl: &str, what: &str) -> Result<Local> {
    let sddl_w = wide(sddl);
    let mut sd: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
    check(
        unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl_w.as_ptr(),
                SDDL_REVISION_1,
                &mut sd,
                std::ptr::null_mut(),
            )
        },
        &format!("ConvertStringSecurityDescriptorToSecurityDescriptorW({what})"),
    )?;
    Ok(Local(sd))
}

/// The package's named-object directory and its links. Every object is temporary: it goes away when the
/// runner's handles and the lowbox token's copies are closed, which is when the last process of the launch
/// ends.
pub struct NamedObjects {
    pub path: String,
    handles: Vec<Owned>,
}

impl NamedObjects {
    /// `\Sessions\<session>\AppContainerNamedObjects\<package>`, created fresh (an existing one is an error,
    /// never reused), with a protected DACL for SYSTEM, the runner's logon SID and the package, a Low
    /// mandatory label so the Low-integrity shell can create objects in it, and `OWNER RIGHTS` limited to
    /// read-control so the sandbox account's ownership grants nothing more.
    pub fn create(session: u32, package: &Sid, logon: &Sid) -> Result<Self> {
        let package_text = package.to_sddl();
        let logon_text = logon.to_sddl();
        let path = format!("\\Sessions\\{session}\\AppContainerNamedObjects\\{package_text}");
        let directory_sd = descriptor(
            &format!(
                "D:P(A;;GA;;;SY)(A;;0x{DIRECTORY_SHELL_ACCESS:x};;;{logon_text})(A;;0x{DIRECTORY_SHELL_ACCESS:x};;;{package_text})(A;;RC;;;OW)S:(ML;;NW;;;LW)"
            ),
            "named-object directory",
        )?;
        let link_sd = descriptor(
            &format!(
                "D:P(A;;GA;;;SY)(A;;0x{SYMBOLIC_LINK_SHELL_ACCESS:x};;;{logon_text})(A;;0x{SYMBOLIC_LINK_SHELL_ACCESS:x};;;{package_text})(A;;RC;;;OW)S:(ML;;NW;;;LW)"
            ),
            "named-object link",
        )?;
        let mut objects = Self { path: path.clone(), handles: Vec::new() };
        let root = create_directory(None, &path, &directory_sd)?;
        let root_raw = root.raw();
        objects.handles.push(root);
        objects.handles.push(create_directory(Some(root_raw), "RPC Control", &directory_sd)?);
        let session_objects = if session == 0 {
            "\\BaseNamedObjects".to_owned()
        } else {
            format!("\\Sessions\\{session}\\BaseNamedObjects")
        };
        for (name, target) in
            [("Global", "\\BaseNamedObjects".to_owned()), ("Local", path.clone()), ("Session", session_objects)]
        {
            objects.handles.push(create_link(root_raw, name, &target, &link_sd)?);
        }
        Ok(objects)
    }

    fn raw_handles(&self) -> Vec<HANDLE> {
        self.handles.iter().map(Owned::raw).collect()
    }
}

fn create_directory(root: Option<HANDLE>, name: &str, sd: &Local) -> Result<Owned> {
    let mut name_nt = NtString::new(name);
    let name_us = name_nt.get();
    let attributes = ObjectAttributes {
        length: size_of::<ObjectAttributes>() as u32,
        root_directory: root.unwrap_or(std::ptr::null_mut()),
        object_name: &name_us,
        // Case-insensitive, and never OBJ_OPENIF: a directory that already exists is not this launch's.
        attributes: windows_sys::Win32::Foundation::OBJ_CASE_INSENSITIVE,
        security_descriptor: sd.0,
        security_quality_of_service: std::ptr::null(),
    };
    let mut handle: HANDLE = std::ptr::null_mut();
    nt(
        unsafe { NtCreateDirectoryObject(&mut handle, DIRECTORY_ALL_ACCESS, &attributes) },
        &format!("NtCreateDirectoryObject({name})"),
    )?;
    Ok(Owned(handle))
}

fn create_link(root: HANDLE, name: &str, target: &str, sd: &Local) -> Result<Owned> {
    let mut name_nt = NtString::new(name);
    let name_us = name_nt.get();
    let mut target_nt = NtString::new(target);
    let target_us = target_nt.get();
    let attributes = ObjectAttributes {
        length: size_of::<ObjectAttributes>() as u32,
        root_directory: root,
        object_name: &name_us,
        attributes: windows_sys::Win32::Foundation::OBJ_CASE_INSENSITIVE,
        security_descriptor: sd.0,
        security_quality_of_service: std::ptr::null(),
    };
    let mut handle: HANDLE = std::ptr::null_mut();
    nt(
        unsafe { NtCreateSymbolicLinkObject(&mut handle, SYMBOLIC_LINK_ALL_ACCESS, &attributes, &target_us) },
        &format!("NtCreateSymbolicLinkObject({name} -> {target})"),
    )?;
    Ok(Owned(handle))
}

/// A lowbox token and the named objects it keeps alive.
pub struct LowBox {
    pub token: Owned,
    pub objects: NamedObjects,
}

/// Derive the shell's AppContainer token from `base` (the write-restricted token, whose restricting SIDs
/// it keeps) for `package`, with no capability at all. The kernel makes it Low integrity.
pub fn create(base: &Owned, package: &Sid, logon: &Sid, session: u32) -> Result<LowBox> {
    let objects = NamedObjects::create(session, package, logon)?;
    let handles = objects.raw_handles();
    let attributes = ObjectAttributes {
        length: size_of::<ObjectAttributes>() as u32,
        root_directory: std::ptr::null_mut(),
        object_name: std::ptr::null(),
        attributes: 0,
        security_descriptor: std::ptr::null(),
        security_quality_of_service: std::ptr::null(),
    };
    let mut token: HANDLE = std::ptr::null_mut();
    nt(
        unsafe {
            NtCreateLowBoxToken(
                &mut token,
                base.raw(),
                TOKEN_ALL_ACCESS,
                &attributes,
                package.as_psid(),
                0,
                std::ptr::null(),
                handles.len() as u32,
                handles.as_ptr(),
            )
        },
        "NtCreateLowBoxToken",
    )?;
    Ok(LowBox { token: Owned(token), objects })
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
