//! The launch's private desktop and its window-station ACE (spike `fallback.ps1`, Codex `desktop.rs`).
//!
//! `launch` creates a private desktop on its own window station whose protected DACL admits the person
//! (all access) and, as participants, the sandbox account, this launch's capability SID and its
//! AppContainer package SID, with a Low mandatory label so the Low-integrity shell may use it. It adds one
//! ACE per session SID to the window station and restores the window station's original descriptor byte
//! for byte at teardown.

use std::ffi::c_void;

use windows_sys::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, EXPLICIT_ACCESS_W, GRANT_ACCESS, SDDL_REVISION_1,
    SE_WINDOW_OBJECT, SetEntriesInAclW, SetSecurityInfo, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN, TRUSTEE_W,
};
use windows_sys::Win32::Security::{
    ACL, DACL_SECURITY_INFORMATION, GetSecurityDescriptorDacl, GetUserObjectSecurity, NO_INHERITANCE,
    PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES, SetUserObjectSecurity,
};
use windows_sys::Win32::System::RemoteDesktop::ProcessIdToSessionId;
use windows_sys::Win32::System::StationsAndDesktops::{
    CloseDesktop, CloseWindowStation, CreateDesktopW, GetProcessWindowStation, GetUserObjectInformationW, HDESK,
    HWINSTA, OpenWindowStationW, UOI_NAME,
};
use windows_sys::Win32::System::Threading::GetCurrentProcessId;

use super::sid::Sid;
use super::util::{Error, Local, Result, check, check_status, random_u32s, wide};
use crate::journal::{WindowStationEntry, from_hex, to_hex};

const DESKTOP_ALL_ACCESS: u32 = 0x000F_01FF;
/// All access but `DELETE`, `WRITE_DAC` and `WRITE_OWNER` (Codex `DESKTOP_PARTICIPANT_ACCESS`).
const DESKTOP_PARTICIPANT_ACCESS: u32 = DESKTOP_ALL_ACCESS & !(0x0001_0000 | 0x0004_0000 | 0x0008_0000);
/// `WINSTA_ALL_ACCESS` without `WINSTA_CREATEDESKTOP` (spike `$WINSTA_SESSION_MASK`).
const WINSTA_SESSION_MASK: u32 = 0x377;
const READ_CONTROL: u32 = 0x0002_0000;
const WRITE_DAC: u32 = 0x0004_0000;

pub const DESKTOP_PREFIX: &str = "TauSandboxDesktop-";

pub struct WindowStation {
    handle: HWINSTA,
    pub name: String,
    pub session_id: u32,
}

impl Drop for WindowStation {
    fn drop(&mut self) {
        unsafe { CloseWindowStation(self.handle) };
    }
}

fn object_name(handle: *mut c_void) -> Result<String> {
    let mut buf = [0u16; 256];
    let mut needed = 0u32;
    check(
        unsafe {
            GetUserObjectInformationW(
                handle,
                UOI_NAME,
                buf.as_mut_ptr() as *mut c_void,
                (buf.len() * 2) as u32,
                &mut needed,
            )
        },
        "GetUserObjectInformationW(UOI_NAME)",
    )?;
    let len = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
    Ok(String::from_utf16_lossy(&buf[..len]))
}

pub fn current_session() -> Result<u32> {
    let mut session = 0u32;
    check(unsafe { ProcessIdToSessionId(GetCurrentProcessId(), &mut session) }, "ProcessIdToSessionId")?;
    Ok(session)
}

/// The name of this process's window station (`WinSta0` in an interactive session).
pub fn current_station_name() -> Result<String> {
    object_name(unsafe { GetProcessWindowStation() })
}

impl WindowStation {
    /// The process window station, opened for `READ_CONTROL | WRITE_DAC`.
    pub fn open_current() -> Result<Self> {
        let name = current_station_name()?;
        let name_w = wide(&name);
        let handle = unsafe { OpenWindowStationW(name_w.as_ptr(), 0, READ_CONTROL | WRITE_DAC) };
        if handle.is_null() {
            return Err(Error::last(format!("OpenWindowStationW({name})")));
        }
        Ok(Self { handle, name, session_id: current_session()? })
    }

    /// The window station's self-relative security descriptor, DACL only.
    pub fn descriptor(&self) -> Result<Vec<u8>> {
        let info = DACL_SECURITY_INFORMATION;
        let mut needed = 0u32;
        unsafe { GetUserObjectSecurity(self.handle, &info, std::ptr::null_mut(), 0, &mut needed) };
        if needed == 0 {
            return Err(Error::last("GetUserObjectSecurity(size)"));
        }
        let mut buf = vec![0u64; (needed as usize).div_ceil(8)];
        check(
            unsafe {
                GetUserObjectSecurity(self.handle, &info, buf.as_mut_ptr() as PSECURITY_DESCRIPTOR, needed, &mut needed)
            },
            "GetUserObjectSecurity",
        )?;
        let bytes = unsafe { std::slice::from_raw_parts(buf.as_ptr() as *const u8, needed as usize) };
        Ok(bytes.to_vec())
    }

    pub fn journal_entry(&self) -> Result<WindowStationEntry> {
        Ok(WindowStationEntry {
            session_id: self.session_id,
            name: self.name.clone(),
            descriptor: to_hex(&self.descriptor()?),
        })
    }

    /// Add one session ACE per SID to the current DACL.
    pub fn grant(&self, sids: &[&Sid]) -> Result<()> {
        let original = self.descriptor()?;
        let mut aligned = vec![0u64; original.len().div_ceil(8)];
        unsafe { std::ptr::copy_nonoverlapping(original.as_ptr(), aligned.as_mut_ptr() as *mut u8, original.len()) };
        let mut present = 0;
        let mut defaulted = 0;
        let mut dacl: *mut ACL = std::ptr::null_mut();
        check(
            unsafe {
                GetSecurityDescriptorDacl(
                    aligned.as_mut_ptr() as PSECURITY_DESCRIPTOR,
                    &mut present,
                    &mut dacl,
                    &mut defaulted,
                )
            },
            "GetSecurityDescriptorDacl(window station)",
        )?;
        let entries: Vec<EXPLICIT_ACCESS_W> = sids
            .iter()
            .map(|sid| EXPLICIT_ACCESS_W {
                grfAccessPermissions: WINSTA_SESSION_MASK,
                grfAccessMode: GRANT_ACCESS,
                grfInheritance: NO_INHERITANCE,
                Trustee: TRUSTEE_W {
                    pMultipleTrustee: std::ptr::null_mut(),
                    MultipleTrusteeOperation: 0,
                    TrusteeForm: TRUSTEE_IS_SID,
                    TrusteeType: TRUSTEE_IS_UNKNOWN,
                    ptstrName: sid.as_psid() as *mut u16,
                },
            })
            .collect();
        let mut new_dacl: *mut ACL = std::ptr::null_mut();
        check_status(
            unsafe {
                SetEntriesInAclW(
                    entries.len() as u32,
                    entries.as_ptr(),
                    if present == 0 { std::ptr::null() } else { dacl },
                    &mut new_dacl,
                )
            },
            "SetEntriesInAclW(window station)",
        )?;
        let _free = Local(new_dacl as *mut c_void);
        check_status(
            unsafe {
                SetSecurityInfo(
                    self.handle,
                    SE_WINDOW_OBJECT,
                    DACL_SECURITY_INFORMATION,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    new_dacl,
                    std::ptr::null(),
                )
            },
            "SetSecurityInfo(window station)",
        )
    }

    /// Write the journaled descriptor back and confirm the bytes match.
    pub fn restore(&self, entry: &WindowStationEntry) -> Result<()> {
        let original =
            from_hex(&entry.descriptor).ok_or_else(|| Error::msg("journaled window-station descriptor is not hex"))?;
        let mut aligned = vec![0u64; original.len().div_ceil(8)];
        unsafe { std::ptr::copy_nonoverlapping(original.as_ptr(), aligned.as_mut_ptr() as *mut u8, original.len()) };
        let info = DACL_SECURITY_INFORMATION;
        check(
            unsafe { SetUserObjectSecurity(self.handle, &info, aligned.as_mut_ptr() as PSECURITY_DESCRIPTOR) },
            "SetUserObjectSecurity(window station)",
        )?;
        if self.descriptor()? != original {
            return Err(Error::msg("the window-station descriptor did not read back byte for byte"));
        }
        Ok(())
    }
}

/// A private desktop, closed on drop.
pub struct PrivateDesktop {
    handle: HDESK,
    /// `WinSta0\TauSandboxDesktop-…`, for `STARTUPINFOW.lpDesktop`.
    pub startup_name: String,
}

// SAFETY: HDESK is an opaque handle; this owner only closes it.
unsafe impl Send for PrivateDesktop {}

impl Drop for PrivateDesktop {
    fn drop(&mut self) {
        unsafe { CloseDesktop(self.handle) };
    }
}

impl PrivateDesktop {
    pub fn create(station_name: &str, owner: &Sid, participants: &[&Sid]) -> Result<Self> {
        let [a, b, c, d] = random_u32s::<4>()?;
        let name = format!("{DESKTOP_PREFIX}{a:08x}{b:08x}{c:08x}{d:08x}");
        let mut sddl = format!("D:P(A;;0x{DESKTOP_ALL_ACCESS:x};;;{})", owner.to_sddl());
        for sid in participants {
            sddl.push_str(&format!("(A;;0x{DESKTOP_PARTICIPANT_ACCESS:x};;;{})", sid.to_sddl()));
        }
        // An AppContainer token is Low integrity; without a label the desktop is Medium no-write-up, and the
        // shell could not attach to it.
        sddl.push_str("S:(ML;;NW;;;LW)");
        let sddl_w = wide(&sddl);
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
            "ConvertStringSecurityDescriptorToSecurityDescriptorW(desktop)",
        )?;
        let sd = Local(sd);
        let attributes = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: sd.0,
            bInheritHandle: 0,
        };
        let name_w = wide(&name);
        let handle = unsafe {
            CreateDesktopW(name_w.as_ptr(), std::ptr::null(), std::ptr::null(), 0, DESKTOP_ALL_ACCESS, &attributes)
        };
        if handle.is_null() {
            return Err(Error::last("CreateDesktopW"));
        }
        Ok(Self { handle, startup_name: format!("{station_name}\\{name}") })
    }
}
