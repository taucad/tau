//! The launch's registered AppContainer: `CreateAppContainerProfile` in the sandbox account's own profile,
//! deleted when the launch ends.
//!
//! `CreateProcess` with `PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES` resolves the package against its
//! registration (the `Mappings` key in the caller's `HKCU` and the package folder) and fails with
//! `ERROR_FILE_NOT_FOUND` for a package nobody registered (WIN-X64 run 44017795494). The runner is
//! `TauSandbox` started with its profile loaded, so it registers the launch's package the documented way,
//! in `TauSandbox`'s own `HKCU` and under its own `%LOCALAPPDATA%\Packages`. That location never touches the
//! person's profile, and the runner checks it before anything runs. The SID `CreateAppContainerProfile`
//! returns is the one `DeriveAppContainerSidFromAppContainerName` gave the launcher for the same name; the
//! runner refuses a mismatch.
//!
//! Lifetime. Before it registers the package, the runner creates the named mutex `Global\<package name>` and
//! holds it until it exits, so a live launch is always visible to others. On every way out (the shell's exit,
//! a refusal, the launcher going away) the runner deletes the registration after the job is empty. A runner
//! that crashed leaves a registration without a live mutex, and the next runner's [`sweep`] deletes every
//! such `tau.sandbox.*` package before it registers its own. A registration holds no grant on anything of
//! the person's (those are journaled and restored by the launcher), and `revoke` deletes the account's
//! profile, and every leftover with it.

use std::sync::atomic::{AtomicBool, Ordering};

use windows_sys::Win32::Foundation::{ERROR_ALREADY_EXISTS, ERROR_FILE_NOT_FOUND, ERROR_NO_MORE_ITEMS, GetLastError};
use windows_sys::Win32::Security::FreeSid;
use windows_sys::Win32::Security::Isolation::{
    CreateAppContainerProfile, DeleteAppContainerProfile, GetAppContainerFolderPath,
};
use windows_sys::Win32::System::Com::CoTaskMemFree;
use windows_sys::Win32::System::Registry::{
    HKEY, HKEY_CURRENT_USER, KEY_READ, RRF_RT_REG_SZ, RegCloseKey, RegEnumKeyExW, RegGetValueW, RegOpenKeyExW,
};
use windows_sys::Win32::System::Threading::{CreateMutexW, OpenMutexW, SYNCHRONIZATION_SYNCHRONIZE};
use windows_sys::Win32::UI::Shell::{FOLDERID_LocalAppData, SHGetKnownFolderPath};

use super::sid::Sid;
use super::util::{Error, Owned, Result, wide};
use crate::appcontainer::is_package_name;

/// Where `CreateAppContainerProfile` registers a package, per user.
const MAPPINGS: &str =
    "Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppContainer\\Mappings";
/// `HRESULT_FROM_WIN32(ERROR_ALREADY_EXISTS)`.
const HR_ALREADY_EXISTS: i32 = 0x8007_00B7_u32 as i32;
/// `HRESULT_FROM_WIN32(ERROR_NOT_FOUND)` and `HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND)`: nothing to delete.
const HR_NOT_FOUND: [i32; 2] = [0x8007_0490_u32 as i32, 0x8007_0002_u32 as i32];

fn live_mutex_name(name: &str) -> String {
    format!("Global\\{name}")
}

fn delete_profile(name: &str) -> std::result::Result<(), i32> {
    let name_w = wide(name);
    let hr = unsafe { DeleteAppContainerProfile(name_w.as_ptr()) };
    if hr >= 0 || HR_NOT_FOUND.contains(&hr) { Ok(()) } else { Err(hr) }
}

/// Take a string the system allocated with `CoTaskMemAlloc`, and free it.
fn take_co_string(text: *mut u16) -> String {
    if text.is_null() {
        return String::new();
    }
    let len = (0..).take_while(|&i| unsafe { *text.add(i) } != 0).count();
    let value = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(text, len) });
    unsafe { CoTaskMemFree(text as *const _) };
    value
}

/// This process's own `%LOCALAPPDATA%` (the known folder, as `CreateAppContainerProfile` resolves it).
pub fn own_local_app_data() -> Result<String> {
    let mut path: *mut u16 = std::ptr::null_mut();
    let hr = unsafe { SHGetKnownFolderPath(&FOLDERID_LocalAppData, 0, std::ptr::null_mut(), &mut path) };
    let text = take_co_string(path);
    if hr < 0 {
        return Err(Error::code("SHGetKnownFolderPath(LocalAppData)", hr as u32));
    }
    Ok(text)
}

/// Delete every `tau.sandbox.*` registration in this account's `HKCU` whose runner is gone (no
/// `Global\<name>` mutex). Returns one log line.
pub fn sweep() -> String {
    let mappings_w = wide(MAPPINGS);
    let mut key: HKEY = std::ptr::null_mut();
    let status = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, mappings_w.as_ptr(), 0, KEY_READ, &mut key) };
    if status == ERROR_FILE_NOT_FOUND {
        return "AppContainer sweep: no registrations".to_owned();
    }
    if status != 0 {
        return format!("AppContainer sweep: the registrations cannot be read (error {status})");
    }
    let mut monikers = Vec::new();
    for index in 0.. {
        let mut name = [0u16; 256];
        let mut len = name.len() as u32;
        let status = unsafe {
            RegEnumKeyExW(
                key,
                index,
                name.as_mut_ptr(),
                &mut len,
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        if status == ERROR_NO_MORE_ITEMS {
            break;
        }
        if status != 0 {
            continue;
        }
        let value_w = wide("Moniker");
        let mut moniker = [0u16; 256];
        let mut bytes = (moniker.len() * 2) as u32;
        let read = unsafe {
            RegGetValueW(
                key,
                name.as_ptr(),
                value_w.as_ptr(),
                RRF_RT_REG_SZ,
                std::ptr::null_mut(),
                moniker.as_mut_ptr() as *mut _,
                &mut bytes,
            )
        };
        if read == 0 {
            let chars = (bytes as usize / 2).saturating_sub(1);
            monikers.push(String::from_utf16_lossy(&moniker[..chars]));
        }
    }
    unsafe { RegCloseKey(key) };
    let mut report = Vec::new();
    for moniker in monikers.into_iter().filter(|m| is_package_name(m)) {
        let mutex_w = wide(&live_mutex_name(&moniker));
        let live = unsafe { OpenMutexW(SYNCHRONIZATION_SYNCHRONIZE, 0, mutex_w.as_ptr()) };
        if !live.is_null() {
            drop(Owned(live));
            report.push(format!("{moniker}=live"));
            continue;
        }
        let error = unsafe { GetLastError() };
        if error != ERROR_FILE_NOT_FOUND {
            // Present but not ours to open: a live launch.
            report.push(format!("{moniker}=live (error {error})"));
            continue;
        }
        match delete_profile(&moniker) {
            Ok(()) => report.push(format!("{moniker}=deleted")),
            Err(hr) => report.push(format!("{moniker}=delete failed {:#010x}", hr as u32)),
        }
    }
    if report.is_empty() {
        "AppContainer sweep: no leftover tau.sandbox registrations".to_owned()
    } else {
        format!("AppContainer sweep: {}", report.join(", "))
    }
}

/// This launch's registered package. Deleted by [`Container::delete`], and on drop as a backstop.
pub struct Container {
    pub name: String,
    pub folder: String,
    _live: Owned,
    deleted: AtomicBool,
}

impl Container {
    /// Mark the launch live, register `name` with no capability, and check that the registration is
    /// `expected` and lives under this account's own `%LOCALAPPDATA%`. An existing registration of the same
    /// name is never reused.
    pub fn create(name: &str, expected: &Sid) -> Result<Self> {
        if !is_package_name(name) {
            return Err(Error::msg("the AppContainer name is malformed"));
        }
        let mutex_w = wide(&live_mutex_name(name));
        let live = unsafe { CreateMutexW(std::ptr::null(), 0, mutex_w.as_ptr()) };
        let error = unsafe { GetLastError() };
        let live = Owned::new(live, "CreateMutexW(launch marker)")?;
        if error == ERROR_ALREADY_EXISTS {
            return Err(Error::msg(format!("the AppContainer {name} is already in use")));
        }
        let name_w = wide(name);
        let display_w = wide("Tau sandboxed shell");
        let description_w = wide("One Tau sandboxed shell launch; deleted when it ends.");
        let mut sid = std::ptr::null_mut();
        let hr = unsafe {
            CreateAppContainerProfile(
                name_w.as_ptr(),
                display_w.as_ptr(),
                description_w.as_ptr(),
                std::ptr::null(),
                0,
                &mut sid,
            )
        };
        if hr == HR_ALREADY_EXISTS {
            return Err(Error::msg(format!("the AppContainer {name} is already registered; it is never reused")));
        }
        if hr < 0 {
            return Err(Error::code(format!("CreateAppContainerProfile({name})"), hr as u32));
        }
        let registered = unsafe { Sid::copy_from(sid) };
        unsafe { FreeSid(sid) };
        // From here on, any refusal deletes the registration (drop).
        let mut container =
            Self { name: name.to_owned(), folder: String::new(), _live: live, deleted: AtomicBool::new(false) };
        let registered = registered?;
        if &registered != expected {
            return Err(Error::msg(format!(
                "CreateAppContainerProfile({name}) returned {}, not the launch's {}",
                registered.to_sddl(),
                expected.to_sddl()
            )));
        }
        let sid_w = wide(&registered.to_sddl());
        let mut path: *mut u16 = std::ptr::null_mut();
        let hr = unsafe { GetAppContainerFolderPath(sid_w.as_ptr(), &mut path) };
        let folder = take_co_string(path);
        if hr < 0 {
            return Err(Error::code("GetAppContainerFolderPath", hr as u32));
        }
        let own = own_local_app_data()?;
        let inside = folder.len() > own.len()
            && folder[..own.len()].eq_ignore_ascii_case(&own)
            && folder.as_bytes()[own.len()] == b'\\';
        if !inside {
            return Err(Error::msg(format!(
                "the AppContainer folder {folder} is not under the sandbox account's own {own}"
            )));
        }
        container.folder = folder;
        Ok(container)
    }

    /// Delete the registration and its folder. Call once the job is empty. Idempotent.
    pub fn delete(&self) -> Result<()> {
        if self.deleted.swap(true, Ordering::SeqCst) {
            return Ok(());
        }
        delete_profile(&self.name)
            .map_err(|hr| Error::code(format!("DeleteAppContainerProfile({})", self.name), hr as u32))
    }
}

impl Drop for Container {
    fn drop(&mut self) {
        if let Err(err) = self.delete() {
            eprintln!("tau-windows-sandbox runner: {err}");
        }
    }
}

// SAFETY: the handle is a process-wide kernel handle; the rest is plain data.
unsafe impl Send for Container {}
unsafe impl Sync for Container {}
