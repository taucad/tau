//! File descriptor snapshot, grant and restore.
//!
//! Grants merge explicit ACEs into a root's existing DACL with `SetEntriesInAclW` and write it with
//! `SetNamedSecurityInfoW`, which propagates the inheritable ones to every descendant and, as a side
//! effect, sets `SE_DACL_AUTO_INHERITED` on the root and on every descendant it rewrites. Restore therefore
//! runs in two steps: write each root's journaled DACL back the same way (so the propagation also strips the
//! launch's inherited ACEs from objects created during the launch), then write every journaled object's
//! exact original DACL and control flags through its handle with `SetKernelObjectSecurity`, which does not
//! propagate, and read the descriptor back to confirm it. No path edits individual ACEs it did not add,
//! and none writes an owner or group.
//!
//! A writable root also gets a Low mandatory label (`NW`, inheritable on a directory): the shell runs in an
//! AppContainer, whose token is Low integrity, and the default (Medium, no-write-up) policy would refuse it
//! every write the DACL grants. The label is journaled with the DACL and restored the same two ways.

use std::ffi::c_void;

use windows_sys::Win32::Foundation::{ERROR_ACCESS_DENIED, ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND, GetLastError};
use windows_sys::Win32::Security::Authorization::{
    ConvertSecurityDescriptorToStringSecurityDescriptorW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
    DENY_ACCESS, EXPLICIT_ACCESS_W, GRANT_ACCESS, GetNamedSecurityInfoW, SDDL_REVISION_1, SE_FILE_OBJECT,
    SetEntriesInAclW, SetNamedSecurityInfoW, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN, TRUSTEE_W,
};
use windows_sys::Win32::Security::{
    ACL, ACL_REVISION, DACL_SECURITY_INFORMATION, GROUP_SECURITY_INFORMATION, GetKernelObjectSecurity,
    GetSecurityDescriptorControl, GetSecurityDescriptorDacl, GetSecurityDescriptorSacl, InitializeAcl,
    InitializeSecurityDescriptor, LABEL_SECURITY_INFORMATION, NO_INHERITANCE, OWNER_SECURITY_INFORMATION,
    PROTECTED_DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, SE_DACL_PROTECTED, SECURITY_DESCRIPTOR,
    SUB_CONTAINERS_AND_OBJECTS_INHERIT, SetKernelObjectSecurity, SetSecurityDescriptorSacl,
    UNPROTECTED_DACL_SECURITY_INFORMATION,
};
use windows_sys::Win32::Storage::FileSystem::{
    BY_HANDLE_FILE_INFORMATION, CreateFileW, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT,
    FILE_READ_ATTRIBUTES, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, GetFileInformationByHandle,
    OPEN_EXISTING, READ_CONTROL, WRITE_DAC, WRITE_OWNER,
};

use super::sid::Sid;
use super::util::{Error, Local, Owned, Result, check, check_status, from_wide_ptr, wide};
use crate::appcontainer::{label_aces, restored, split_sacl};
use crate::journal::{Entry, file_id};
use crate::paths::extended;
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

/// The identities a launch grants to: the sandbox account, its group, this launch's capability SID and
/// this launch's AppContainer package SID.
pub struct Principals {
    pub account: Sid,
    pub group: Sid,
    pub capability: Sid,
    pub package: Sid,
}

/// The ACEs one planned access adds. The shell's access check has three passes, and a grant must satisfy
/// each: the account (its user SID), the AppContainer pass (its package SID; `ALL APPLICATION PACKAGES` is
/// never granted) and, for writes, the restricted pass (its capability SID). A denial needs one pass only.
pub fn aces_for(access: Access, principals: &Principals) -> Vec<Ace<'_>> {
    match access {
        Access::Read => vec![
            Ace { sid: &principals.account, mode: Mode::Grant, mask: READ_MASK },
            Ace { sid: &principals.package, mode: Mode::Grant, mask: READ_MASK },
        ],
        Access::Write => vec![
            Ace { sid: &principals.account, mode: Mode::Grant, mask: WRITE_MASK },
            Ace { sid: &principals.capability, mode: Mode::Grant, mask: WRITE_MASK },
            Ace { sid: &principals.package, mode: Mode::Grant, mask: WRITE_MASK },
        ],
        Access::ReadOnly => vec![
            Ace { sid: &principals.account, mode: Mode::Grant, mask: READ_MASK },
            Ace { sid: &principals.package, mode: Mode::Grant, mask: READ_MASK },
            Ace { sid: &principals.capability, mode: Mode::Deny, mask: DENY_WRITE_MASK },
        ],
        Access::Denied => vec![Ace { sid: &principals.group, mode: Mode::Deny, mask: DENY_ALL_MASK }],
    }
}

/// Whether an access lowers the path's mandatory label to Low so the Low-integrity shell may write there.
pub fn needs_low_label(access: Access) -> bool {
    access == Access::Write
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

fn control(sd: PSECURITY_DESCRIPTOR) -> Result<u16> {
    let mut control = 0u16;
    let mut revision = 0u32;
    check(unsafe { GetSecurityDescriptorControl(sd, &mut control, &mut revision) }, "GetSecurityDescriptorControl")?;
    Ok(control)
}

/// What a snapshot and its verification read: owner, group and DACL, with the DACL's control flags, and the
/// mandatory label (readable with `READ_CONTROL` alone).
const SNAPSHOT_INFORMATION: u32 =
    OWNER_SECURITY_INFORMATION | GROUP_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION | LABEL_SECURITY_INFORMATION;

/// `SECURITY_DESCRIPTOR_REVISION`.
const SECURITY_DESCRIPTOR_REVISION: u32 = 1;

/// A Low, no-write-up mandatory label: inheritable by everything under a directory, or for a file alone.
const LOW_LABEL_DIRECTORY: &str = "S:(ML;OICI;NW;;;LW)";
const LOW_LABEL_FILE: &str = "S:(ML;;NW;;;LW)";

fn to_sddl(sd: PSECURITY_DESCRIPTOR, information: u32) -> Result<String> {
    let mut text: *mut u16 = std::ptr::null_mut();
    check(
        unsafe {
            ConvertSecurityDescriptorToStringSecurityDescriptorW(
                sd,
                SDDL_REVISION_1,
                information,
                &mut text,
                std::ptr::null_mut(),
            )
        },
        "ConvertSecurityDescriptorToStringSecurityDescriptorW",
    )?;
    let _free = Local(text as *mut c_void);
    Ok(unsafe { from_wide_ptr(text) })
}

/// A self-relative descriptor parsed from journaled SDDL.
fn from_sddl(sddl: &str) -> Result<Local> {
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
        "ConvertStringSecurityDescriptorToSecurityDescriptorW",
    )?;
    Ok(Local(sd))
}

/// Open the object itself (never what a reparse point names) for `access`. `None` when it is gone.
fn open(path: &str, access: u32) -> std::result::Result<Option<Owned>, u32> {
    let path_w = wide(&extended(path));
    let handle = unsafe {
        CreateFileW(
            path_w.as_ptr(),
            access,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
            std::ptr::null_mut(),
        )
    };
    match Owned::new(handle, "CreateFileW") {
        Ok(handle) => Ok(Some(handle)),
        Err(_) => {
            let code = unsafe { GetLastError() };
            if missing(code) { Ok(None) } else { Err(code) }
        }
    }
}

fn handle_file_id(handle: &Owned) -> Option<String> {
    let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
    if unsafe { GetFileInformationByHandle(handle.raw(), &mut info) } == 0 {
        return None;
    }
    Some(file_id(info.dwVolumeSerialNumber, (u64::from(info.nFileIndexHigh) << 32) | u64::from(info.nFileIndexLow)))
}

/// The object's owner, group and DACL as SDDL, read through its handle.
fn handle_sddl(handle: &Owned, path: &str) -> Result<String> {
    let mut needed = 0u32;
    unsafe { GetKernelObjectSecurity(handle.raw(), SNAPSHOT_INFORMATION, std::ptr::null_mut(), 0, &mut needed) };
    if needed == 0 {
        return Err(Error::last(format!("GetKernelObjectSecurity({path})")));
    }
    // 8-byte aligned, as a security descriptor requires.
    let mut buf = vec![0u64; (needed as usize).div_ceil(8)];
    check(
        unsafe {
            GetKernelObjectSecurity(
                handle.raw(),
                SNAPSHOT_INFORMATION,
                buf.as_mut_ptr() as PSECURITY_DESCRIPTOR,
                (buf.len() * 8) as u32,
                &mut needed,
            )
        },
        &format!("GetKernelObjectSecurity({path})"),
    )?;
    to_sddl(buf.as_mut_ptr() as PSECURITY_DESCRIPTOR, SNAPSHOT_INFORMATION)
}

/// The object's full descriptor (owner, group, DACL and its control flags) and file id; `None` when the
/// path does not exist. A reparse point is read as itself.
pub fn snapshot(path: &str) -> Result<Option<Entry>> {
    let opened = match open(path, READ_CONTROL | FILE_READ_ATTRIBUTES) {
        // The person may hold READ_CONTROL (as owner) without FILE_READ_ATTRIBUTES; the file id is then
        // unknown, and the object is restored without the replacement check.
        Err(ERROR_ACCESS_DENIED) => open(path, READ_CONTROL),
        other => other,
    };
    let handle = match opened {
        Ok(Some(handle)) => handle,
        Ok(None) => return Ok(None),
        Err(code) => return Err(Error::code(format!("CreateFileW({path})"), code)),
    };
    Ok(Some(Entry { path: path.to_owned(), sddl: handle_sddl(&handle, path)?, file_id: handle_file_id(&handle) }))
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

/// Merge `aces` into the path's DACL, keeping its protected state, and with `low_label` set its mandatory
/// label to Low. Directories get inheritable ACEs and an inheritable label.
pub fn apply(path: &str, aces: &[Ace<'_>], low_label: bool) -> Result<()> {
    let is_dir = std::fs::metadata(path).map(|m| m.is_dir()).unwrap_or(false);
    let descriptor =
        read_descriptor(path).map_err(|status| Error::code(format!("GetNamedSecurityInfoW({path})"), status))?;
    let protected = control(descriptor.sd.0)? & SE_DACL_PROTECTED != 0;
    let entries: Vec<EXPLICIT_ACCESS_W> = aces.iter().map(|ace| explicit(ace, is_dir)).collect();
    let mut new_dacl: *mut ACL = std::ptr::null_mut();
    check_status(
        unsafe { SetEntriesInAclW(entries.len() as u32, entries.as_ptr(), descriptor.dacl, &mut new_dacl) },
        "SetEntriesInAclW",
    )?;
    let _free = Local(new_dacl as *mut c_void);
    set_dacl_propagating(path, new_dacl, protected)?;
    if low_label {
        let label = from_sddl(if is_dir { LOW_LABEL_DIRECTORY } else { LOW_LABEL_FILE })?;
        let sacl = Sacl::of(&label)?;
        set_label_propagating(path, sacl.ptr())?;
    }
    Ok(())
}

/// The SACL of a parsed descriptor (which holds the mandatory label only, as the journal reads it), or an
/// empty one when the descriptor has none, so writing it removes a label the journal did not record.
struct Sacl {
    found: *mut ACL,
    empty: [u64; 1],
}

impl Sacl {
    fn of(sd: &Local) -> Result<Self> {
        let mut present = 0;
        let mut defaulted = 0;
        let mut found: *mut ACL = std::ptr::null_mut();
        check(
            unsafe { GetSecurityDescriptorSacl(sd.0, &mut present, &mut found, &mut defaulted) },
            "GetSecurityDescriptorSacl",
        )?;
        let mut sacl = Self { found: if present == 0 { std::ptr::null_mut() } else { found }, empty: [0] };
        check(
            unsafe { InitializeAcl(sacl.empty.as_mut_ptr() as *mut ACL, size_of::<ACL>() as u32, ACL_REVISION) },
            "InitializeAcl",
        )?;
        Ok(sacl)
    }

    fn ptr(&self) -> *const ACL {
        if self.found.is_null() { self.empty.as_ptr() as *const ACL } else { self.found }
    }
}

/// Write a mandatory label with propagation: `LABEL_SECURITY_INFORMATION` needs `WRITE_OWNER`, not
/// `SeSecurityPrivilege`, and replaces only the label ACE.
fn set_label_propagating(path: &str, sacl: *const ACL) -> Result<()> {
    let path_w = wide(path);
    check_status(
        unsafe {
            SetNamedSecurityInfoW(
                path_w.as_ptr(),
                SE_FILE_OBJECT,
                LABEL_SECURITY_INFORMATION,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null(),
                sacl,
            )
        },
        &format!("SetNamedSecurityInfoW({path}, label)"),
    )
}

/// The path's current mandatory-label ACEs, as SDDL.
fn current_label(path: &str) -> Result<Vec<String>> {
    let path_w = wide(path);
    let mut sd: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
    check_status(
        unsafe {
            GetNamedSecurityInfoW(
                path_w.as_ptr(),
                SE_FILE_OBJECT,
                LABEL_SECURITY_INFORMATION,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut sd,
            )
        },
        &format!("GetNamedSecurityInfoW({path}, label)"),
    )?;
    let sd = Local(sd);
    let sddl = to_sddl(sd.0, LABEL_SECURITY_INFORMATION)?;
    Ok(label_aces(split_sacl(&sddl).1).into_iter().map(str::to_owned).collect())
}

fn journaled_label(sddl: &str) -> Vec<String> {
    label_aces(split_sacl(sddl).1).into_iter().map(str::to_owned).collect()
}

fn set_dacl_propagating(path: &str, dacl: *const ACL, protected: bool) -> Result<()> {
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

/// Step one of a root's restore: write its journaled DACL back with propagation, so every descendant,
/// including one created during the launch, loses the ACEs it inherited from the grant. A path that no
/// longer exists has nothing left to restore. The root and its descendants are left with
/// `SE_DACL_AUTO_INHERITED` set; [`restore_exact`] puts their exact control flags back.
pub fn restore_propagating(entry: &Entry) -> Result<()> {
    if let Err(status) = read_descriptor(&entry.path) {
        if missing(status) {
            return Ok(());
        }
        return Err(Error::code(format!("GetNamedSecurityInfoW({})", entry.path), status));
    }
    let sd = from_sddl(&entry.sddl)?;
    let protected = control(sd.0)? & SE_DACL_PROTECTED != 0;
    let mut present = 0;
    let mut defaulted = 0;
    let mut dacl: *mut ACL = std::ptr::null_mut();
    check(
        unsafe { GetSecurityDescriptorDacl(sd.0, &mut present, &mut dacl, &mut defaulted) },
        "GetSecurityDescriptorDacl",
    )?;
    // A journaled "no DACL" (`present == 0`) is written back as a null DACL, exactly as it was.
    set_dacl_propagating(&entry.path, if present == 0 { std::ptr::null() } else { dacl }, protected)?;
    // The label only where the launch changed it (a writable root): writing a label needs `WRITE_OWNER`,
    // which the person may lack on a root that was only read.
    if current_label(&entry.path)? != journaled_label(&entry.sddl) {
        set_label_propagating(&entry.path, Sacl::of(&sd)?.ptr())?;
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Exact {
    /// The descriptor already matched the journal; nothing was written.
    Matched,
    /// The DACL and its control flags were written back, and the full descriptor now matches.
    Rewritten,
    /// The path no longer exists.
    Missing,
    /// Another object stands at the path (the journaled one was deleted or renamed during the launch).
    /// It was not written; the root's propagating restore already removed what it inherited.
    Replaced,
}

fn open_for(entry: &Entry, access: u32) -> Result<Option<Owned>> {
    open(&entry.path, access).map_err(|code| Error::code(format!("CreateFileW({})", entry.path), code))
}

/// Step two: make the object's descriptor the journaled one (owner, group, DACL and its control flags
/// compared as SDDL, and the mandatory-label ACE), writing only the DACL with its control flags and, when
/// it differs, the label, without propagation. `Err` when it cannot be written or does not read back
/// identical (the SACL's own control flags aside: [`restored`]).
pub fn restore_exact(entry: &Entry) -> Result<Exact> {
    let read_access = if entry.file_id.is_some() { READ_CONTROL | FILE_READ_ATTRIBUTES } else { READ_CONTROL };
    let Some(handle) = open_for(entry, read_access)? else { return Ok(Exact::Missing) };
    if entry.file_id.is_some() && handle_file_id(&handle) != entry.file_id {
        return Ok(Exact::Replaced);
    }
    let before = handle_sddl(&handle, &entry.path)?;
    if before == entry.sddl || restored(&before, &entry.sddl) {
        return Ok(Exact::Matched);
    }
    drop(handle);
    let dacl_differs = split_sacl(&before).0 != split_sacl(&entry.sddl).0;
    let label_differs = label_aces(split_sacl(&before).1) != label_aces(split_sacl(&entry.sddl).1);
    // `WRITE_OWNER` only when the label must change: the person may lack it on an object it only reads.
    let write_access = (if dacl_differs { WRITE_DAC } else { 0 }) | (if label_differs { WRITE_OWNER } else { 0 });
    let Some(handle) = open_for(entry, read_access | write_access)? else { return Ok(Exact::Missing) };
    if entry.file_id.is_some() && handle_file_id(&handle) != entry.file_id {
        return Ok(Exact::Replaced);
    }
    // The SDDL carries the DACL's control flags (`P`, `AI`, `AR`), so the parsed descriptor already has
    // exactly the journaled ones; `SetKernelObjectSecurity` writes the DACL with them and does not
    // propagate to children. Owner and group are not written: the launch never changed them.
    let sd = from_sddl(&entry.sddl)?;
    if dacl_differs {
        check(
            unsafe { SetKernelObjectSecurity(handle.raw(), DACL_SECURITY_INFORMATION, sd.0) },
            &format!("SetKernelObjectSecurity({})", entry.path),
        )?;
    }
    if label_differs {
        // An absolute descriptor whose SACL is present: the journaled label, or an empty SACL that removes
        // a label the journal did not record.
        let sacl = Sacl::of(&sd)?;
        let mut absolute: SECURITY_DESCRIPTOR = unsafe { std::mem::zeroed() };
        let absolute_ptr = &mut absolute as *mut SECURITY_DESCRIPTOR as PSECURITY_DESCRIPTOR;
        check(
            unsafe { InitializeSecurityDescriptor(absolute_ptr, SECURITY_DESCRIPTOR_REVISION) },
            "InitializeSecurityDescriptor",
        )?;
        check(unsafe { SetSecurityDescriptorSacl(absolute_ptr, 1, sacl.ptr(), 0) }, "SetSecurityDescriptorSacl")?;
        check(
            unsafe { SetKernelObjectSecurity(handle.raw(), LABEL_SECURITY_INFORMATION, absolute_ptr) },
            &format!("SetKernelObjectSecurity({}, label)", entry.path),
        )?;
    }
    let now = handle_sddl(&handle, &entry.path)?;
    if restored(&now, &entry.sddl) {
        Ok(Exact::Rewritten)
    } else {
        Err(Error::msg(format!(
            "{}: the restored descriptor {now} differs from the journaled {}",
            entry.path, entry.sddl
        )))
    }
}

/// For a root replaced during the launch: whether its DACL still names any of the launch's principals.
pub fn dacl_names_any(path: &str, principal_sids: &[String]) -> Result<bool> {
    let descriptor = match read_descriptor(path) {
        Ok(descriptor) => descriptor,
        Err(status) if missing(status) => return Ok(false),
        Err(status) => return Err(Error::code(format!("GetNamedSecurityInfoW({path})"), status)),
    };
    let sddl = to_sddl(descriptor.sd.0, DACL_SECURITY_INFORMATION)?;
    Ok(principal_sids.iter().any(|sid| sddl.contains(sid.as_str())))
}
