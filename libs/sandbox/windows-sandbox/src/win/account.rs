//! The local sandbox account and group (elevated `setup`/`revoke` only).

use std::ffi::c_void;

use windows_sys::Win32::Foundation::{
    ERROR_ALIAS_EXISTS, ERROR_FILE_NOT_FOUND, ERROR_MEMBER_IN_ALIAS, ERROR_NO_SUCH_ALIAS, ERROR_SUCCESS,
};
use windows_sys::Win32::NetworkManagement::NetManagement::{
    LG_INCLUDE_INDIRECT, LOCALGROUP_INFO_1, LOCALGROUP_MEMBERS_INFO_3, LOCALGROUP_USERS_INFO_0, MAX_PREFERRED_LENGTH,
    NERR_GroupExists, NERR_GroupNotFound, NERR_UserExists, NERR_UserNotFound, NetApiBufferFree, NetLocalGroupAdd,
    NetLocalGroupAddMembers, NetLocalGroupDel, NetUserAdd, NetUserDel, NetUserGetLocalGroups, NetUserSetInfo,
    UF_DONT_EXPIRE_PASSWD, UF_PASSWD_CANT_CHANGE, UF_SCRIPT, USER_INFO_1, USER_INFO_1003, USER_INFO_1008,
    USER_PRIV_USER,
};
use windows_sys::Win32::System::Registry::{
    HKEY, HKEY_LOCAL_MACHINE, KEY_SET_VALUE, KEY_WRITE, REG_DWORD, REG_OPTION_NON_VOLATILE, RegCloseKey,
    RegCreateKeyExW, RegDeleteValueW, RegOpenKeyExW, RegSetValueExW,
};

use super::sid::{ADMINISTRATORS, Sid};
use super::util::{Error, Result, check_status, from_wide_ptr, wide, wipe_wide};

const USER_LIST_KEY: &str = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon\\SpecialAccounts\\UserList";
const ACCOUNT_FLAGS: u32 = UF_SCRIPT | UF_DONT_EXPIRE_PASSWD | UF_PASSWD_CANT_CHANGE;

pub fn ensure_group(name: &str) -> Result<()> {
    let mut name_w = wide(name);
    let mut comment = wide("Accounts Tau's shell sandbox runs as");
    let info = LOCALGROUP_INFO_1 { lgrpi1_name: name_w.as_mut_ptr(), lgrpi1_comment: comment.as_mut_ptr() };
    let status = unsafe { NetLocalGroupAdd(std::ptr::null(), 1, &info as *const _ as *const u8, std::ptr::null_mut()) };
    match status {
        0 => Ok(()),
        s if s == NERR_GroupExists || s == ERROR_ALIAS_EXISTS => Ok(()),
        s => Err(Error::code(format!("NetLocalGroupAdd({name})"), s)),
    }
}

/// Create the account with `password`, or reset an existing one to it and re-apply its flags (which also
/// re-enables a disabled account). The password buffer is wiped before return.
pub fn ensure_user(name: &str, password: &str) -> Result<()> {
    let mut name_w = wide(name);
    let mut password_w = wide(password);
    let mut comment = wide("Tau shell sandbox (no interactive sign-in)");
    let info = USER_INFO_1 {
        usri1_name: name_w.as_mut_ptr(),
        usri1_password: password_w.as_mut_ptr(),
        usri1_password_age: 0,
        usri1_priv: USER_PRIV_USER,
        usri1_home_dir: std::ptr::null_mut(),
        usri1_comment: comment.as_mut_ptr(),
        usri1_flags: ACCOUNT_FLAGS,
        usri1_script_path: std::ptr::null_mut(),
    };
    let status = unsafe { NetUserAdd(std::ptr::null(), 1, &info as *const _ as *const u8, std::ptr::null_mut()) };
    let result = match status {
        0 => Ok(()),
        s if s == NERR_UserExists => {
            let reset = USER_INFO_1003 { usri1003_password: password_w.as_mut_ptr() };
            let status = unsafe {
                NetUserSetInfo(
                    std::ptr::null(),
                    name_w.as_ptr(),
                    1003,
                    &reset as *const _ as *const u8,
                    std::ptr::null_mut(),
                )
            };
            // The error names the call, never the password.
            check_status(status, "NetUserSetInfo(password)").and_then(|()| {
                let flags = USER_INFO_1008 { usri1008_flags: ACCOUNT_FLAGS };
                let status = unsafe {
                    NetUserSetInfo(
                        std::ptr::null(),
                        name_w.as_ptr(),
                        1008,
                        &flags as *const _ as *const u8,
                        std::ptr::null_mut(),
                    )
                };
                check_status(status, "NetUserSetInfo(flags)")
            })
        }
        s => Err(Error::code(format!("NetUserAdd({name})"), s)),
    };
    wipe_wide(&mut password_w);
    result
}

pub fn add_member(group: &str, member: &str) -> Result<()> {
    let group_w = wide(group);
    let mut member_w = wide(member);
    let info = LOCALGROUP_MEMBERS_INFO_3 { lgrmi3_domainandname: member_w.as_mut_ptr() };
    let status =
        unsafe { NetLocalGroupAddMembers(std::ptr::null(), group_w.as_ptr(), 3, &info as *const _ as *const u8, 1) };
    match status {
        0 => Ok(()),
        s if s == ERROR_MEMBER_IN_ALIAS => Ok(()),
        s => Err(Error::code(format!("NetLocalGroupAddMembers({group})"), s)),
    }
}

/// Whether the account is a member, directly or not, of the local Administrators group.
pub fn is_administrator(name: &str) -> Result<bool> {
    let name_w = wide(name);
    let mut buf: *mut u8 = std::ptr::null_mut();
    let mut read = 0u32;
    let mut total = 0u32;
    let status = unsafe {
        NetUserGetLocalGroups(
            std::ptr::null(),
            name_w.as_ptr(),
            0,
            LG_INCLUDE_INDIRECT,
            &mut buf,
            MAX_PREFERRED_LENGTH,
            &mut read,
            &mut total,
        )
    };
    check_status(status, "NetUserGetLocalGroups")?;
    let groups: Vec<String> = unsafe {
        std::slice::from_raw_parts(buf as *const LOCALGROUP_USERS_INFO_0, read as usize)
            .iter()
            .map(|g| from_wide_ptr(g.lgrui0_name))
            .collect()
    };
    unsafe { NetApiBufferFree(buf as *const c_void) };
    let admins = Sid::parse(ADMINISTRATORS)?;
    for group in groups {
        if Sid::lookup(&group)?.is_some_and(|sid| sid == admins) {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn delete_user(name: &str) -> Result<()> {
    let name_w = wide(name);
    match unsafe { NetUserDel(std::ptr::null(), name_w.as_ptr()) } {
        0 => Ok(()),
        s if s == NERR_UserNotFound => Ok(()),
        s => Err(Error::code(format!("NetUserDel({name})"), s)),
    }
}

pub fn delete_group(name: &str) -> Result<()> {
    let name_w = wide(name);
    match unsafe { NetLocalGroupDel(std::ptr::null(), name_w.as_ptr()) } {
        0 => Ok(()),
        s if s == NERR_GroupNotFound || s == ERROR_NO_SUCH_ALIAS => Ok(()),
        s => Err(Error::code(format!("NetLocalGroupDel({name})"), s)),
    }
}

/// Hide the account from the sign-in screen (Winlogon `SpecialAccounts\UserList`, value 0), as Codex does.
pub fn hide_from_sign_in(name: &str) -> Result<()> {
    let key_w = wide(USER_LIST_KEY);
    let mut key: HKEY = std::ptr::null_mut();
    check_status(
        unsafe {
            RegCreateKeyExW(
                HKEY_LOCAL_MACHINE,
                key_w.as_ptr(),
                0,
                std::ptr::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_WRITE,
                std::ptr::null(),
                &mut key,
                std::ptr::null_mut(),
            )
        },
        "RegCreateKeyExW(UserList)",
    )?;
    let name_w = wide(name);
    let value: u32 = 0;
    let status = unsafe { RegSetValueExW(key, name_w.as_ptr(), 0, REG_DWORD, &value as *const u32 as *const u8, 4) };
    unsafe { RegCloseKey(key) };
    check_status(status, "RegSetValueExW(UserList)")
}

pub fn unhide(name: &str) -> Result<()> {
    let key_w = wide(USER_LIST_KEY);
    let mut key: HKEY = std::ptr::null_mut();
    match unsafe { RegOpenKeyExW(HKEY_LOCAL_MACHINE, key_w.as_ptr(), 0, KEY_SET_VALUE, &mut key) } {
        ERROR_SUCCESS => {}
        ERROR_FILE_NOT_FOUND => return Ok(()),
        s => return Err(Error::code("RegOpenKeyExW(UserList)", s)),
    }
    let name_w = wide(name);
    let status = unsafe { RegDeleteValueW(key, name_w.as_ptr()) };
    unsafe { RegCloseKey(key) };
    match status {
        ERROR_SUCCESS | ERROR_FILE_NOT_FOUND => Ok(()),
        s => Err(Error::code("RegDeleteValueW(UserList)", s)),
    }
}
