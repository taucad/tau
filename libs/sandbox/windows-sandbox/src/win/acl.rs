//! File DACL snapshot, grant and restore.
//!
//! Grants merge explicit ACEs into the existing DACL with `SetEntriesInAclW`; restore writes back the
//! journaled DACL with its original protected state. Neither path edits individual ACEs it did not add.

use std::ffi::c_void;

use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND};
use windows_sys::Win32::Security::Authorization::{
    ConvertSecurityDescriptorToStringSecurityDescriptorW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
    DENY_ACCESS, EXPLICIT_ACCESS_W, GRANT_ACCESS, GetNamedSecurityInfoW, SDDL_REVISION_1, SE_FILE_OBJECT,
    SetEntriesInAclW, SetNamedSecurityInfoW, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN, TRUSTEE_W,
};
use windows_sys::Win32::Security::{
    ACL, DACL_SECURITY_INFORMATION, GetSecurityDescriptorControl, GetSecurityDescriptorDacl, NO_INHERITANCE,
    PROTECTED_DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, SE_DACL_PROTECTED, SUB_CONTAINERS_AND_OBJECTS_INHERIT,
    UNPROTECTED_DACL_SECURITY_INFORMATION,
};

use super::sid::Sid;
use super::util::{Error, Local, Result, check, check_status, from_wide_ptr, wide};
use crate::journal::FileEntry;
use crate::spec::Access;

/// Read and execute.
pub const READ_MASK: u32 = 0x0012_00A9;
/// Everything but `WRITE_DAC` and `WRITE_OWNER`: read, write, execute, delete, delete child.
pub const WRITE_MASK: u32 = 0x0013_01FF;
/// Every right that changes a file or directory, without `SYNCHRONIZE`/`READ_CONTROL` so reads still work.
pub const DENY_WRITE_MASK: u32 = 0x000D_0156;
/// `FILE_ALL_ACCESS`.
pub const DENY_ALL_MASK: u32 = 0x001F_01FF;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    Grant,
    Deny,
}

pub struct Ace<'a> {
    pub sid: &'a Sid,
    pub mode: Mode,
    pub mask: u32,
}

/// The identities a launch grants to: the sandbox account, its group and this launch's capability SID.
pub struct Principals {
    pub account: Sid,
    pub group: Sid,
    pub capability: Sid,
}

/// The ACEs one planned access adds.
pub fn aces_for(access: Access, principals: &Principals) -> Vec<Ace<'_>> {
    match access {
        Access::Read => vec![Ace { sid: &principals.account, mode: Mode::Grant, mask: READ_MASK }],
        Access::Write => vec![
            Ace { sid: &principals.account, mode: Mode::Grant, mask: WRITE_MASK },
            Ace { sid: &principals.capability, mode: Mode::Grant, mask: WRITE_MASK },
        ],
        Access::ReadOnly => vec![
            Ace { sid: &principals.account, mode: Mode::Grant, mask: READ_MASK },
            Ace { sid: &principals.capability, mode: Mode::Deny, mask: DENY_WRITE_MASK },
        ],
        Access::Denied => vec![Ace { sid: &principals.group, mode: Mode::Deny, mask: DENY_ALL_MASK }],
    }
}

struct Descriptor {
    sd: Local,
    dacl: *mut ACL,
}

fn read_descriptor(path: &str) -> std::result::Result<Descriptor, u32> {
    let path_w = wide(path);
    let mut dacl: *mut ACL = std::ptr::null_mut();
    let mut sd: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
    let status = unsafe {
        GetNamedSecurityInfoW(
            path_w.as_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut dacl,
            std::ptr::null_mut(),
            &mut sd,
        )
    };
    if status != 0 {
        return Err(status);
    }
    Ok(Descriptor { sd: Local(sd), dacl })
}

fn missing(status: u32) -> bool {
    status == ERROR_FILE_NOT_FOUND || status == ERROR_PATH_NOT_FOUND
}

/// The path's DACL as SDDL plus its protected state; `None` when the path does not exist.
pub fn snapshot(path: &str) -> Result<Option<FileEntry>> {
    let descriptor = match read_descriptor(path) {
        Ok(descriptor) => descriptor,
        Err(status) if missing(status) => return Ok(None),
        Err(status) => return Err(Error::code(format!("GetNamedSecurityInfoW({path})"), status)),
    };
    let mut control = 0u16;
    let mut revision = 0u32;
    check(
        unsafe { GetSecurityDescriptorControl(descriptor.sd.0, &mut control, &mut revision) },
        "GetSecurityDescriptorControl",
    )?;
    let mut text: *mut u16 = std::ptr::null_mut();
    check(
        unsafe {
            ConvertSecurityDescriptorToStringSecurityDescriptorW(
                descriptor.sd.0,
                SDDL_REVISION_1,
                DACL_SECURITY_INFORMATION,
                &mut text,
                std::ptr::null_mut(),
            )
        },
        "ConvertSecurityDescriptorToStringSecurityDescriptorW",
    )?;
    let _free = Local(text as *mut c_void);
    Ok(Some(FileEntry {
        path: path.to_owned(),
        sddl: unsafe { from_wide_ptr(text) },
        protected: control & SE_DACL_PROTECTED != 0,
    }))
}

fn explicit(ace: &Ace<'_>, inherit: bool) -> EXPLICIT_ACCESS_W {
    EXPLICIT_ACCESS_W {
        grfAccessPermissions: ace.mask,
        grfAccessMode: if ace.mode == Mode::Grant { GRANT_ACCESS } else { DENY_ACCESS },
        grfInheritance: if inherit { SUB_CONTAINERS_AND_OBJECTS_INHERIT } else { NO_INHERITANCE },
        Trustee: TRUSTEE_W {
            pMultipleTrustee: std::ptr::null_mut(),
            MultipleTrusteeOperation: 0,
            TrusteeForm: TRUSTEE_IS_SID,
            TrusteeType: TRUSTEE_IS_UNKNOWN,
            ptstrName: ace.sid.as_psid() as *mut u16,
        },
    }
}

/// Merge `aces` into the path's DACL, keeping its protected state. Directories get inheritable ACEs.
pub fn apply(entry: &FileEntry, aces: &[Ace<'_>]) -> Result<()> {
    let path = &entry.path;
    let is_dir = std::fs::metadata(path).map(|m| m.is_dir()).unwrap_or(false);
    let descriptor =
        read_descriptor(path).map_err(|status| Error::code(format!("GetNamedSecurityInfoW({path})"), status))?;
    let entries: Vec<EXPLICIT_ACCESS_W> = aces.iter().map(|ace| explicit(ace, is_dir)).collect();
    let mut new_dacl: *mut ACL = std::ptr::null_mut();
    check_status(
        unsafe { SetEntriesInAclW(entries.len() as u32, entries.as_ptr(), descriptor.dacl, &mut new_dacl) },
        "SetEntriesInAclW",
    )?;
    let _free = Local(new_dacl as *mut c_void);
    set_dacl(path, new_dacl, entry.protected)
}

fn set_dacl(path: &str, dacl: *const ACL, protected: bool) -> Result<()> {
    let path_w = wide(path);
    let protection =
        if protected { PROTECTED_DACL_SECURITY_INFORMATION } else { UNPROTECTED_DACL_SECURITY_INFORMATION };
    check_status(
        unsafe {
            SetNamedSecurityInfoW(
                path_w.as_ptr(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION | protection,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                dacl,
                std::ptr::null(),
            )
        },
        &format!("SetNamedSecurityInfoW({path})"),
    )
}

/// Write the journaled DACL back. A path that no longer exists has nothing left to restore.
pub fn restore(entry: &FileEntry) -> Result<()> {
    if let Err(status) = read_descriptor(&entry.path) {
        if missing(status) {
            return Ok(());
        }
        return Err(Error::code(format!("GetNamedSecurityInfoW({})", entry.path), status));
    }
    let sddl_w = wide(&entry.sddl);
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
        "ConvertStringSecurityDescriptorToSecurityDescriptorW",
    )?;
    let sd = Local(sd);
    let mut present = 0;
    let mut defaulted = 0;
    let mut dacl: *mut ACL = std::ptr::null_mut();
    check(
        unsafe { GetSecurityDescriptorDacl(sd.0, &mut present, &mut dacl, &mut defaulted) },
        "GetSecurityDescriptorDacl",
    )?;
    // A journaled "no DACL" (`present == 0`) is written back as a null DACL, exactly as it was.
    set_dacl(&entry.path, if present == 0 { std::ptr::null() } else { dacl }, entry.protected)
}

/// Whether a restored path carries none of this launch's ACEs any more: the DACL is back to the journaled
/// one, or at least names none of the launch's principals.
pub fn verify_restored(entry: &FileEntry, principal_sids: &[String]) -> Result<bool> {
    match snapshot(&entry.path)? {
        None => Ok(true),
        Some(now) => Ok(now.protected == entry.protected
            && (now.sddl == entry.sddl || !principal_sids.iter().any(|sid| now.sddl.contains(sid.as_str())))),
    }
}
