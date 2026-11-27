//! SIDs as owned byte buffers, and the token and account lookups that produce them.

use std::ffi::c_void;

use windows_sys::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_NONE_MAPPED, GetLastError, HANDLE};
use windows_sys::Win32::Security::Authorization::{ConvertSidToStringSidW, ConvertStringSidToSidW};
use windows_sys::Win32::Security::{
    GetLengthSid, GetTokenInformation, IsValidSid, LookupAccountNameW, PSID, SID_AND_ATTRIBUTES, SID_NAME_USE,
    TOKEN_GROUPS, TOKEN_INFORMATION_CLASS, TOKEN_QUERY, TOKEN_USER, TokenGroups, TokenUser,
};
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

use super::util::{Error, Local, Owned, Result, check, from_wide_ptr, wide};

pub const EVERYONE: &str = "S-1-1-0";
pub const ADMINISTRATORS: &str = "S-1-5-32-544";
/// `SE_GROUP_LOGON_ID`: the attribute bits that mark a token group as the logon SID.
const SE_GROUP_LOGON_ID: u32 = 0xC000_0000;

#[derive(Clone, PartialEq, Eq)]
pub struct Sid(Vec<u8>);

impl Sid {
    /// # Safety
    /// `sid` must point to a valid SID.
    pub unsafe fn copy_from(sid: PSID) -> Result<Self> {
        if unsafe { IsValidSid(sid) } == 0 {
            return Err(Error::msg("invalid SID"));
        }
        let len = unsafe { GetLengthSid(sid) } as usize;
        Ok(Self(unsafe { std::slice::from_raw_parts(sid as *const u8, len) }.to_vec()))
    }

    pub fn parse(text: &str) -> Result<Self> {
        let text_w = wide(text);
        let mut sid: PSID = std::ptr::null_mut();
        check(unsafe { ConvertStringSidToSidW(text_w.as_ptr(), &mut sid) }, "ConvertStringSidToSidW")?;
        let _free = Local(sid);
        unsafe { Self::copy_from(sid) }
    }

    pub fn as_psid(&self) -> PSID {
        self.0.as_ptr() as *mut c_void
    }

    pub fn to_sddl(&self) -> String {
        let mut text: *mut u16 = std::ptr::null_mut();
        if unsafe { ConvertSidToStringSidW(self.as_psid(), &mut text) } == 0 {
            return String::new();
        }
        let _free = Local(text as *mut c_void);
        unsafe { from_wide_ptr(text) }
    }

    /// The SID of a local account or group, `None` when the name is unknown.
    pub fn lookup(name: &str) -> Result<Option<Self>> {
        let name_w = wide(name);
        let mut sid_len = 0u32;
        let mut domain_len = 0u32;
        let mut use_: SID_NAME_USE = 0;
        let ok = unsafe {
            LookupAccountNameW(
                std::ptr::null(),
                name_w.as_ptr(),
                std::ptr::null_mut(),
                &mut sid_len,
                std::ptr::null_mut(),
                &mut domain_len,
                &mut use_,
            )
        };
        if ok == 0 {
            match unsafe { GetLastError() } {
                ERROR_INSUFFICIENT_BUFFER => {}
                ERROR_NONE_MAPPED => return Ok(None),
                code => return Err(Error::code(format!("LookupAccountNameW({name})"), code)),
            }
        }
        let mut sid = vec![0u8; sid_len as usize];
        let mut domain = vec![0u16; domain_len.max(1) as usize];
        check(
            unsafe {
                LookupAccountNameW(
                    std::ptr::null(),
                    name_w.as_ptr(),
                    sid.as_mut_ptr() as PSID,
                    &mut sid_len,
                    domain.as_mut_ptr(),
                    &mut domain_len,
                    &mut use_,
                )
            },
            "LookupAccountNameW",
        )?;
        Ok(Some(Self(sid)))
    }
}

impl std::fmt::Debug for Sid {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.to_sddl())
    }
}

pub fn open_process_token(access: u32) -> Result<Owned> {
    let mut token: HANDLE = std::ptr::null_mut();
    check(unsafe { OpenProcessToken(GetCurrentProcess(), access, &mut token) }, "OpenProcessToken")?;
    Ok(Owned(token))
}

/// Read a variable-length token information class into an 8-byte-aligned buffer.
pub fn token_information(token: HANDLE, class: TOKEN_INFORMATION_CLASS) -> Result<Vec<u64>> {
    let mut needed = 0u32;
    unsafe { GetTokenInformation(token, class, std::ptr::null_mut(), 0, &mut needed) };
    if needed == 0 {
        return Err(Error::last("GetTokenInformation(size)"));
    }
    let mut buf = vec![0u64; (needed as usize).div_ceil(8)];
    check(
        unsafe {
            GetTokenInformation(token, class, buf.as_mut_ptr() as *mut c_void, (buf.len() * 8) as u32, &mut needed)
        },
        "GetTokenInformation",
    )?;
    Ok(buf)
}

pub fn token_user(token: HANDLE) -> Result<Sid> {
    let buf = token_information(token, TokenUser)?;
    let user = unsafe { &*(buf.as_ptr() as *const TOKEN_USER) };
    unsafe { Sid::copy_from(user.User.Sid) }
}

pub fn token_logon_sid(token: HANDLE) -> Result<Sid> {
    let buf = token_information(token, TokenGroups)?;
    let groups = unsafe { &*(buf.as_ptr() as *const TOKEN_GROUPS) };
    let entries: &[SID_AND_ATTRIBUTES] =
        unsafe { std::slice::from_raw_parts(groups.Groups.as_ptr(), groups.GroupCount as usize) };
    for entry in entries {
        if entry.Attributes & SE_GROUP_LOGON_ID == SE_GROUP_LOGON_ID {
            return unsafe { Sid::copy_from(entry.Sid) };
        }
    }
    Err(Error::msg("the token has no logon SID"))
}

pub fn current_user() -> Result<Sid> {
    let token = open_process_token(TOKEN_QUERY)?;
    token_user(token.raw())
}
