//! The launch's private desktop and its window-station ACE (spike `fallback.ps1`, Codex `desktop.rs`).
//!
//! `launch` creates a private desktop on its own window station whose protected DACL admits the person
//! (all access) and, as participants, the sandbox account, this launch's capability SID and its
//! AppContainer package SID, with a Low mandatory label so the Low-integrity shell may use it. The window station
//! is shared by every launch in the session: each adds one ACE per SID of its own (its capability SID and its package
//! SID, which the shell's restricted and AppContainer passes need) and removes exactly the ACEs naming those SIDs at
//! teardown, so concurrent launches never undo each other's (README "Sessions"). The first pass needs no ACE: the
//! runner's logon SID is the person's own, which the station already admits, and so it must never be removed.

use std::ffi::c_void;

use windows_sys::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows_sys::Win32::Security::{
    ACE_HEADER, ACL, ACL_REVISION, AddAce, DACL_SECURITY_INFORMATION, DeleteAce, EqualSid, GetAce, GetLengthSid,
    GetSecurityDescriptorControl, GetSecurityDescriptorDacl, GetUserObjectSecurity, InitializeAcl,
    InitializeSecurityDescriptor, PSECURITY_DESCRIPTOR, PSID, SE_DACL_AUTO_INHERIT_REQ, SE_DACL_AUTO_INHERITED,
    SE_DACL_PROTECTED, SECURITY_ATTRIBUTES, SetSecurityDescriptorControl, SetSecurityDescriptorDacl,
    SetUserObjectSecurity,
};
use windows_sys::Win32::System::RemoteDesktop::ProcessIdToSessionId;
use windows_sys::Win32::System::StationsAndDesktops::{
    CloseDesktop, CloseWindowStation, CreateDesktopW, GetProcessWindowStation, GetUserObjectInformationW, HDESK,
    HWINSTA, OpenWindowStationW, UOI_NAME,
};
use windows_sys::Win32::System::Threading::GetCurrentProcessId;

use super::sid::Sid;
use super::util::{Error, Local, Result, check, random_u32s, wide};
use crate::journal::WindowStationEntry;

const DESKTOP_ALL_ACCESS: u32 = 0x000F_01FF;
/// All access but `DELETE`, `WRITE_DAC` and `WRITE_OWNER` (Codex `DESKTOP_PARTICIPANT_ACCESS`).
const DESKTOP_PARTICIPANT_ACCESS: u32 = DESKTOP_ALL_ACCESS & !(0x0001_0000 | 0x0004_0000 | 0x0008_0000);
/// `WINSTA_ALL_ACCESS` without `WINSTA_CREATEDESKTOP` (spike `$WINSTA_SESSION_MASK`).
const WINSTA_SESSION_MASK: u32 = 0x377;
const READ_CONTROL: u32 = 0x0002_0000;
/// `SECURITY_DESCRIPTOR_REVISION`.
const SECURITY_DESCRIPTOR_REVISION: u32 = 1;
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

    pub fn journal_entry(&self) -> WindowStationEntry {
        WindowStationEntry { session_id: self.session_id, name: self.name.clone() }
    }

    /// Append one session ACE per SID to the DACL and change nothing else. The new DACL is the current one's ACEs
    /// copied byte for byte, in order, followed by this launch's ACEs, and it is written with the descriptor's own
    /// control bits; the read-back must hold exactly that, or the original descriptor is written back and the grant
    /// fails. `SetEntriesInAclW` is not used: it rebuilds the whole DACL (merging and reordering the ACEs it
    /// understands), and since [`revoke`](Self::revoke) removes only this launch's ACEs, any such rewrite of the
    /// person's own ACEs would outlive the launch and break every later process that opens the station through them
    /// (a restricted Chromium GPU process among them).
    pub fn grant(&self, sids: &[&Sid]) -> Result<()> {
        let original = self.descriptor()?;
        let mut current = Aligned::of(&original);
        let control = current.control()?;
        let (revision, kept) = match current.dacl()? {
            Some(dacl) => (u32::from(unsafe { (*dacl).AclRevision }), ace_bytes(dacl)?),
            None => (ACL_REVISION, Vec::new()),
        };
        let added: Vec<Vec<u8>> = sids.iter().map(|sid| allowed_ace(sid, WINSTA_SESSION_MASK)).collect();
        let entries: Vec<&[u8]> = kept.iter().chain(added.iter()).map(Vec::as_slice).collect();
        let mut acl = new_acl(revision, &entries)?;
        let mut absolute = [0u64; 8];
        let sd = absolute.as_mut_ptr() as PSECURITY_DESCRIPTOR;
        check(
            unsafe { InitializeSecurityDescriptor(sd, SECURITY_DESCRIPTOR_REVISION) },
            "InitializeSecurityDescriptor",
        )?;
        check(
            unsafe { SetSecurityDescriptorDacl(sd, 1, acl.as_mut_ptr() as *const ACL, 0) },
            "SetSecurityDescriptorDacl(window station)",
        )?;
        let carried = control & (SE_DACL_PROTECTED | SE_DACL_AUTO_INHERITED | SE_DACL_AUTO_INHERIT_REQ);
        check(
            unsafe {
                SetSecurityDescriptorControl(
                    sd,
                    SE_DACL_PROTECTED | SE_DACL_AUTO_INHERITED | SE_DACL_AUTO_INHERIT_REQ,
                    carried,
                )
            },
            "SetSecurityDescriptorControl(window station)",
        )?;
        let info = DACL_SECURITY_INFORMATION;
        check(unsafe { SetUserObjectSecurity(self.handle, &info, sd) }, "SetUserObjectSecurity(window station)")?;
        let mut now = Aligned::of(&self.descriptor()?);
        let after = match now.dacl()? {
            Some(dacl) => ace_bytes(dacl)?,
            None => Vec::new(),
        };
        let expected: Vec<Vec<u8>> = kept.iter().chain(added.iter()).cloned().collect();
        if after != expected || now.control()? & carried != carried {
            let mut back = Aligned::of(&original);
            let restored = check(
                unsafe { SetUserObjectSecurity(self.handle, &info, back.0.as_mut_ptr() as PSECURITY_DESCRIPTOR) },
                "SetUserObjectSecurity(window station, original)",
            );
            return Err(Error::msg(format!(
                "the window station's DACL did not read back as its {} ACE(s) followed by the launch's {} \
                 (it holds {}); the original was written back: {}",
                kept.len(),
                added.len(),
                after.len(),
                restored.map_or_else(|err| err.to_string(), |()| "ok".to_owned())
            )));
        }
        Ok(())
    }

    /// Remove every ACE naming one of `own` and nothing else, and confirm it. The DACL is edited where it lies in the
    /// descriptor just read, ACE by ACE (`DeleteAce`), and that descriptor is written back whole, its control bits
    /// included, so every other ACE keeps its exact bytes and order. Called under the person's descriptor lock, so no
    /// other launch edits the station meanwhile and the read-back must hold exactly the others.
    pub fn revoke(&self, own: &[String]) -> Result<()> {
        let own = own.iter().map(|sid| Sid::parse(sid)).collect::<Result<Vec<_>>>()?;
        let mut descriptor = Aligned::of(&self.descriptor()?);
        let Some(dacl) = descriptor.dacl()? else { return Ok(()) };
        let before = aces(dacl)?;
        let mut removed = 0;
        for (index, sid) in before.iter().enumerate().rev() {
            if sid.is_some_and(|sid| own.iter().any(|own| unsafe { EqualSid(own.as_psid(), sid) } != 0)) {
                check(unsafe { DeleteAce(dacl, index as u32) }, "DeleteAce(window station)")?;
                removed += 1;
            }
        }
        if removed == 0 {
            return Ok(());
        }
        let info = DACL_SECURITY_INFORMATION;
        check(
            unsafe { SetUserObjectSecurity(self.handle, &info, descriptor.0.as_mut_ptr() as PSECURITY_DESCRIPTOR) },
            "SetUserObjectSecurity(window station)",
        )?;
        let mut now = Aligned::of(&self.descriptor()?);
        let after = match now.dacl()? {
            Some(dacl) => aces(dacl)?,
            None => Vec::new(),
        };
        let names_own =
            after.iter().flatten().any(|sid| own.iter().any(|own| unsafe { EqualSid(own.as_psid(), *sid) } != 0));
        if names_own || after.len() + removed != before.len() {
            return Err(Error::msg(format!(
                "the window station's DACL holds {} ACE(s) after removing {removed} of {}, and names the launch: {names_own}",
                after.len(),
                before.len()
            )));
        }
        Ok(())
    }
}

/// A self-relative descriptor copied into 8-byte-aligned memory, so its DACL can be read and edited in place.
struct Aligned(Vec<u64>);

impl Aligned {
    fn of(bytes: &[u8]) -> Self {
        let mut aligned = vec![0u64; bytes.len().div_ceil(8)];
        unsafe { std::ptr::copy_nonoverlapping(bytes.as_ptr(), aligned.as_mut_ptr() as *mut u8, bytes.len()) };
        Self(aligned)
    }

    /// The DACL inside the descriptor; `None` when it has none (a null DACL holds no ACE of a launch's).
    fn dacl(&mut self) -> Result<Option<*mut ACL>> {
        let (mut present, mut defaulted) = (0, 0);
        let mut dacl: *mut ACL = std::ptr::null_mut();
        check(
            unsafe {
                GetSecurityDescriptorDacl(
                    self.0.as_mut_ptr() as PSECURITY_DESCRIPTOR,
                    &mut present,
                    &mut dacl,
                    &mut defaulted,
                )
            },
            "GetSecurityDescriptorDacl(window station)",
        )?;
        Ok(if present == 0 || dacl.is_null() { None } else { Some(dacl) })
    }
}

impl Aligned {
    /// The descriptor's control bits.
    fn control(&mut self) -> Result<u16> {
        let (mut control, mut revision) = (0u16, 0u32);
        check(
            unsafe {
                GetSecurityDescriptorControl(self.0.as_mut_ptr() as PSECURITY_DESCRIPTOR, &mut control, &mut revision)
            },
            "GetSecurityDescriptorControl(window station)",
        )?;
        Ok(control)
    }
}

/// Each ACE of `dacl`, in order, as its exact bytes.
fn ace_bytes(dacl: *mut ACL) -> Result<Vec<Vec<u8>>> {
    let count = unsafe { (*dacl).AceCount };
    (0..u32::from(count))
        .map(|index| {
            let mut ace: *mut c_void = std::ptr::null_mut();
            check(unsafe { GetAce(dacl, index, &mut ace) }, "GetAce(window station)")?;
            let size = usize::from(unsafe { (*(ace as *const ACE_HEADER)).AceSize });
            Ok(unsafe { std::slice::from_raw_parts(ace as *const u8, size) }.to_vec())
        })
        .collect()
}

/// An `ACCESS_ALLOWED_ACE` with no inheritance flags: header, mask, then the SID.
fn allowed_ace(sid: &Sid, mask: u32) -> Vec<u8> {
    let length = unsafe { GetLengthSid(sid.as_psid()) } as usize;
    let sid_bytes = unsafe { std::slice::from_raw_parts(sid.as_psid() as *const u8, length) };
    let size = (8 + length) as u16;
    let mut ace = vec![ALLOWED_ACE, 0];
    ace.extend_from_slice(&size.to_le_bytes());
    ace.extend_from_slice(&mask.to_le_bytes());
    ace.extend_from_slice(sid_bytes);
    ace
}

/// A new ACL of `revision` (the original's, so its header is unchanged too) holding exactly `entries`, in order.
fn new_acl(revision: u32, entries: &[&[u8]]) -> Result<Vec<u64>> {
    let size = size_of::<ACL>() + entries.iter().map(|ace| ace.len()).sum::<usize>();
    let mut acl = vec![0u64; size.div_ceil(8)];
    let pointer = acl.as_mut_ptr() as *mut ACL;
    check(unsafe { InitializeAcl(pointer, size as u32, revision) }, "InitializeAcl(window station)")?;
    for ace in entries {
        check(
            unsafe { AddAce(pointer, revision, u32::MAX, ace.as_ptr() as *const c_void, ace.len() as u32) },
            "AddAce(window station)",
        )?;
    }
    Ok(acl)
}

/// `ACCESS_ALLOWED_ACE_TYPE` and `ACCESS_DENIED_ACE_TYPE`: the ACEs whose SID follows the header and mask. A launch
/// adds only the first kind.
const ALLOWED_ACE: u8 = 0;
const DENIED_ACE: u8 = 1;

/// The SID of each ACE of `dacl` in order, `None` for an ACE of another layout (which no launch adds).
fn aces(dacl: *mut ACL) -> Result<Vec<Option<PSID>>> {
    let count = unsafe { (*dacl).AceCount };
    (0..u32::from(count))
        .map(|index| {
            let mut ace: *mut c_void = std::ptr::null_mut();
            check(unsafe { GetAce(dacl, index, &mut ace) }, "GetAce(window station)")?;
            let header = unsafe { &*(ace as *const ACE_HEADER) };
            Ok(if header.AceType == ALLOWED_ACE || header.AceType == DENIED_ACE {
                // `ACE_HEADER` (4 bytes), `ACCESS_MASK` (4 bytes), then `SidStart`.
                Some(unsafe { (ace as *mut u8).add(8) } as PSID)
            } else {
                None
            })
        })
        .collect()
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
