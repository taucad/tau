//! The volume capability: one Tau capability SID every launch's AppContainer carries, granted by `setup` on
//! each fixed volume's root folder (this folder only) so PowerShell's FileSystem provider can resolve `C:\`
//! (`appcontainer.rs` has the why and the exact rights).
//!
//! A volume root's DACL is written with `SetKernelObjectSecurity` on a handle, which never propagates to the
//! volume's contents, and only ever gains or loses the one ACE naming the capability SID: the rest of the DACL
//! and its control flags are written back exactly as read. `revoke` removes that ACE again.

use windows_sys::Win32::Foundation::{GetLastError, HANDLE, INVALID_HANDLE_VALUE, LocalFree};
use windows_sys::Win32::Security::Authorization::{
    ConvertSecurityDescriptorToStringSecurityDescriptorW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
    SDDL_REVISION_1,
};
use windows_sys::Win32::Security::{
    DACL_SECURITY_INFORMATION, DeriveCapabilitySidsFromName, GetKernelObjectSecurity, PSECURITY_DESCRIPTOR, PSID,
    SetKernelObjectSecurity,
};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAG_BACKUP_SEMANTICS, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, GetDriveTypeW,
    GetLogicalDrives, OPEN_EXISTING, READ_CONTROL, WRITE_DAC,
};

use super::sid::Sid;
use super::util::{Error, Local, Owned, Result, check, wide};
use crate::appcontainer::{
    VOLUME_CAPABILITY_NAME, VOLUME_ROOT_ACCESS, dacl_has_root_grant, dacl_with_root_grant, dacl_without,
};

/// `DRIVE_FIXED`.
const DRIVE_FIXED: u32 = 3;

/// The capability SID (`S-1-15-3-1024-…`) Windows derives from [`VOLUME_CAPABILITY_NAME`]. The same on every
/// machine, so the runner, the launcher and `setup` agree without sharing state.
pub fn capability_sid() -> Result<Sid> {
    let name = wide(VOLUME_CAPABILITY_NAME);
    let mut groups: *mut PSID = std::ptr::null_mut();
    let mut group_count = 0u32;
    let mut sids: *mut PSID = std::ptr::null_mut();
    let mut sid_count = 0u32;
    check(
        unsafe {
            DeriveCapabilitySidsFromName(name.as_ptr(), &mut groups, &mut group_count, &mut sids, &mut sid_count)
        },
        "DeriveCapabilitySidsFromName",
    )?;
    let free = |array: *mut PSID, count: u32| {
        if !array.is_null() {
            for i in 0..count as usize {
                unsafe { LocalFree(*array.add(i)) };
            }
            unsafe { LocalFree(array as _) };
        }
    };
    let result = if sid_count == 1 && !sids.is_null() {
        unsafe { Sid::copy_from(*sids) }
    } else {
        Err(Error::msg(format!("DeriveCapabilitySidsFromName gave {sid_count} capability SIDs, not one")))
    };
    free(groups, group_count);
    free(sids, sid_count);
    result
}

/// The root folder of every fixed volume with a drive letter (`C:\`, …).
pub fn fixed_roots() -> Vec<String> {
    let mask = unsafe { GetLogicalDrives() };
    (0..26u32)
        .filter(|bit| mask & (1 << bit) != 0)
        .map(|bit| format!("{}:\\", char::from(b'A' + bit as u8)))
        .filter(|root| unsafe { GetDriveTypeW(wide(root).as_ptr()) } == DRIVE_FIXED)
        .collect()
}

fn open_root(root: &str, access: u32) -> Result<Owned> {
    let path = wide(root);
    let handle: HANDLE = unsafe {
        CreateFileW(
            path.as_ptr(),
            access,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            std::ptr::null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return Err(Error::code(format!("CreateFileW({root})"), unsafe { GetLastError() }));
    }
    Ok(Owned(handle))
}

fn read_dacl(handle: &Owned, root: &str) -> Result<String> {
    let mut needed = 0u32;
    unsafe { GetKernelObjectSecurity(handle.raw(), DACL_SECURITY_INFORMATION, std::ptr::null_mut(), 0, &mut needed) };
    let mut buffer = vec![0u64; (needed as usize).div_ceil(8).max(1)];
    check(
        unsafe {
            GetKernelObjectSecurity(
                handle.raw(),
                DACL_SECURITY_INFORMATION,
                buffer.as_mut_ptr() as PSECURITY_DESCRIPTOR,
                (buffer.len() * 8) as u32,
                &mut needed,
            )
        },
        &format!("GetKernelObjectSecurity({root})"),
    )?;
    let mut text: *mut u16 = std::ptr::null_mut();
    check(
        unsafe {
            ConvertSecurityDescriptorToStringSecurityDescriptorW(
                buffer.as_ptr() as PSECURITY_DESCRIPTOR,
                SDDL_REVISION_1,
                DACL_SECURITY_INFORMATION,
                &mut text,
                std::ptr::null_mut(),
            )
        },
        &format!("ConvertSecurityDescriptorToStringSecurityDescriptorW({root})"),
    )?;
    let _free = Local(text as _);
    let len = (0..).take_while(|&i| unsafe { *text.add(i) } != 0).count();
    Ok(String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(text, len) }))
}

fn write_dacl(handle: &Owned, root: &str, dacl: &str) -> Result<()> {
    let text = wide(dacl);
    let mut sd: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
    check(
        unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                text.as_ptr(),
                SDDL_REVISION_1,
                &mut sd,
                std::ptr::null_mut(),
            )
        },
        &format!("ConvertStringSecurityDescriptorToSecurityDescriptorW({root})"),
    )?;
    let sd = Local(sd);
    check(
        unsafe { SetKernelObjectSecurity(handle.raw(), DACL_SECURITY_INFORMATION, sd.0) },
        &format!("SetKernelObjectSecurity({root})"),
    )
}

/// Give `capability` its root grant on `root`, replacing any other ACE for it, and read it back. Elevated.
pub fn grant(root: &str, capability: &Sid) -> Result<()> {
    let sid = capability.to_sddl();
    let handle = open_root(root, READ_CONTROL | WRITE_DAC)?;
    let before = read_dacl(&handle, root)?;
    if dacl_has_root_grant(&before, &sid, VOLUME_ROOT_ACCESS) {
        return Ok(());
    }
    let after = dacl_with_root_grant(&before, &sid, VOLUME_ROOT_ACCESS)
        .ok_or_else(|| Error::msg(format!("{root}: the DACL {before} does not parse")))?;
    write_dacl(&handle, root, &after)?;
    let now = read_dacl(&handle, root)?;
    if dacl_has_root_grant(&now, &sid, VOLUME_ROOT_ACCESS) {
        Ok(())
    } else {
        Err(Error::msg(format!("{root}: the volume capability's grant did not hold ({now})")))
    }
}

/// Remove every ACE for `capability` from `root`'s DACL, nothing else. Elevated; a root that is gone is fine.
pub fn revoke(root: &str, capability: &Sid) -> Result<()> {
    let sid = capability.to_sddl();
    let handle = match open_root(root, READ_CONTROL | WRITE_DAC) {
        Ok(handle) => handle,
        Err(_) if unsafe { GetDriveTypeW(wide(root).as_ptr()) } != DRIVE_FIXED => return Ok(()),
        Err(err) => return Err(err),
    };
    let before = read_dacl(&handle, root)?;
    let after =
        dacl_without(&before, &sid).ok_or_else(|| Error::msg(format!("{root}: the DACL {before} does not parse")))?;
    if after != before {
        write_dacl(&handle, root, &after)?;
    }
    Ok(())
}

/// Whether `root` holds exactly the grant [`grant`] writes. Needs only `READ_CONTROL`.
pub fn granted(root: &str, capability: &Sid) -> bool {
    open_root(root, READ_CONTROL)
        .and_then(|handle| read_dacl(&handle, root))
        .is_ok_and(|dacl| dacl_has_root_grant(&dacl, &capability.to_sddl(), VOLUME_ROOT_ACCESS))
}
