//! The launch's private desktop (spike `fallback.ps1`, Codex `desktop.rs`).
//!
//! `launch` creates a private desktop on its own window station whose protected DACL admits the person
//! (all access) and, as participants, the sandbox account, this launch's capability SID and its
//! AppContainer package SID, with a Low mandatory label so the Low-integrity shell may use it. The window station
//! itself is never changed: the station the person's session gave them already admits every pass of the shell (the
//! runner's logon SID is the person's own; the AppContainer pass is admitted as `ALL APPLICATION PACKAGES`), and any
//! ACE a launch added there would be live in the person's session for as long as the launch runs. Chromium's GPU
//! process, started by the person under a restricted token, fails to initialise `user32` while the station carries
//! one (`STATUS_DLL_INIT_FAILED`, README "Sessions").

use std::ffi::c_void;

use windows_sys::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows_sys::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
use windows_sys::Win32::System::StationsAndDesktops::{
    CloseDesktop, CreateDesktopW, GetProcessWindowStation, GetUserObjectInformationW, HDESK, UOI_NAME,
};

use super::sid::Sid;
use super::util::{Error, Local, Result, check, random_u32s, wide};

const DESKTOP_ALL_ACCESS: u32 = 0x000F_01FF;
/// All access but `DELETE`, `WRITE_DAC` and `WRITE_OWNER` (Codex `DESKTOP_PARTICIPANT_ACCESS`).
const DESKTOP_PARTICIPANT_ACCESS: u32 = DESKTOP_ALL_ACCESS & !(0x0001_0000 | 0x0004_0000 | 0x0008_0000);

pub const DESKTOP_PREFIX: &str = "TauSandboxDesktop-";

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

/// The name of this process's window station (`WinSta0` in an interactive session).
pub fn current_station_name() -> Result<String> {
    object_name(unsafe { GetProcessWindowStation() })
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
