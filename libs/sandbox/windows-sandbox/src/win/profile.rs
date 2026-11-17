//! The sandbox account's own user profile, and with it the `HKCU` the shell's AppContainer reads.
//!
//! Without a loaded profile, `HKEY_CURRENT_USER` of the sandbox account resolves to `HKU\.DEFAULT`, whose root
//! grants nothing to AppContainers. PowerShell opens `HKCU` during host initialization (policy settings,
//! console and execution-policy keys) and an `ERROR_ACCESS_DENIED` there is fatal to it ("Requested registry
//! access is not allowed", WIN-X64 run 44012660365), while a missing key is not. So `setup` (elevated)
//! creates `TauSandbox`'s profile once with `CreateProfile`, from the Default user template like any account,
//! `launch` starts the runner with `LOGON_WITH_PROFILE` so the secondary-logon service loads that hive as
//! `HKU\<account SID>` for the launch's logon and unloads it after, and the runner checks, impersonating the
//! suspended shell's own token, that the AppContainer can open the hive root before it lets the shell run.
//!
//! The hive belongs to the sandbox account and holds nothing of the person's. The template grants
//! `ALL APPLICATION PACKAGES` read on it, as on every account's hive: Tau grants nothing in the registry. The
//! shell cannot write it, since none of its restricting SIDs is granted there (the restricted pass), so no
//! registry state carries from one launch to the next. `revoke` deletes the profile with the account.

use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND, GetLastError, HANDLE};
use windows_sys::Win32::Security::{
    DuplicateTokenEx, SecurityImpersonation, TOKEN_IMPERSONATE, TOKEN_QUERY, TokenImpersonation,
};
use windows_sys::Win32::System::Registry::{
    HKEY, HKEY_LOCAL_MACHINE, HKEY_USERS, KEY_READ, RegCloseKey, RegOpenKeyExW,
};
use windows_sys::Win32::System::Threading::SetThreadToken;
use windows_sys::Win32::UI::Shell::{CreateProfile, DeleteProfileW};

use super::sid::Sid;
use super::util::{Error, Owned, Result, check, wide};

/// `HRESULT_FROM_WIN32(ERROR_ALREADY_EXISTS)`.
const PROFILE_EXISTS: i32 = 0x8007_00B7_u32 as i32;
const PROFILE_LIST: &str = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList";

/// The `HKCU` subkeys PowerShell 7 and Windows PowerShell 5.1 read while their host starts (group-policy
/// settings, the 5.1 execution-policy key, console and regional settings), probed as the shell for the log.
pub const PROBED_SUBKEYS: &[&str] = &[
    "Software",
    "Software\\Policies",
    "Software\\Policies\\Microsoft\\PowerShellCore",
    "Software\\Policies\\Microsoft\\Windows\\PowerShell",
    "Software\\Microsoft\\PowerShell",
    "Software\\Microsoft\\PowerShell\\1\\ShellIds\\Microsoft.PowerShell",
    "Console",
    "Control Panel\\International",
    "Environment",
];

fn open(root: HKEY, path: &str) -> u32 {
    let path_w = wide(path);
    let mut key: HKEY = std::ptr::null_mut();
    let status = unsafe { RegOpenKeyExW(root, path_w.as_ptr(), 0, KEY_READ, &mut key) };
    if status == 0 {
        unsafe { RegCloseKey(key) };
    }
    status
}

/// Create the account's profile (an existing one is kept). Needs elevation.
pub fn ensure(account: &Sid, name: &str) -> Result<()> {
    let sid_w = wide(&account.to_sddl());
    let name_w = wide(name);
    let mut path = [0u16; 260];
    let hr = unsafe { CreateProfile(sid_w.as_ptr(), name_w.as_ptr(), path.as_mut_ptr(), path.len() as u32) };
    if hr >= 0 || hr == PROFILE_EXISTS { Ok(()) } else { Err(Error::code(format!("CreateProfile({name})"), hr as u32)) }
}

/// Delete the account's profile directory and registration; absent is success. Needs elevation. The hive
/// of a launch that just ended may still be unloading, so a refusal is retried for a few seconds.
pub fn remove(account: &Sid) -> Result<()> {
    let sid_w = wide(&account.to_sddl());
    let mut last = 0;
    for attempt in 0..20 {
        if attempt > 0 {
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
        if unsafe { DeleteProfileW(sid_w.as_ptr(), std::ptr::null(), std::ptr::null()) } != 0 {
            return Ok(());
        }
        last = unsafe { GetLastError() };
        if last == ERROR_FILE_NOT_FOUND || last == ERROR_PATH_NOT_FOUND {
            return Ok(());
        }
    }
    Err(Error::code("DeleteProfileW", last))
}

/// Whether the account has a registered profile (`ProfileList\<SID>`, readable by every user).
pub fn present(account: &Sid) -> bool {
    open(HKEY_LOCAL_MACHINE, &format!("{PROFILE_LIST}\\{}", account.to_sddl())) == 0
}

/// What the shell's token can open of its own `HKCU`: `Ok` with a log line when the hive is loaded and the
/// AppContainer may read its root, `Err` otherwise (the shell would fail to start). Runs as the runner,
/// whose own user is `account`, with a separate thread impersonating `token`.
pub fn check_hive(token: &Owned, account: &Sid) -> Result<String> {
    let hive = account.to_sddl();
    // As the runner: the hive must be loaded. This also opens the process's `HKEY_USERS` handle outside the
    // impersonation, so the probes below are checked only on the keys they name.
    match open(HKEY_USERS, &hive) {
        0 => {}
        code @ (ERROR_FILE_NOT_FOUND | ERROR_PATH_NOT_FOUND) => {
            return Err(Error::code(
                format!("the sandbox account's registry hive HKU\\{hive} is not loaded (run setup again)"),
                code,
            ));
        }
        code => return Err(Error::code(format!("RegOpenKeyExW(HKU\\{hive})"), code)),
    }
    let mut impersonation: HANDLE = std::ptr::null_mut();
    check(
        unsafe {
            DuplicateTokenEx(
                token.raw(),
                TOKEN_IMPERSONATE | TOKEN_QUERY,
                std::ptr::null(),
                SecurityImpersonation,
                TokenImpersonation,
                &mut impersonation,
            )
        },
        "DuplicateTokenEx(impersonation)",
    )?;
    let impersonation = Owned(impersonation);
    let results = std::thread::scope(|scope| {
        scope
            .spawn(|| -> Result<Vec<(String, u32)>> {
                check(unsafe { SetThreadToken(std::ptr::null(), impersonation.raw()) }, "SetThreadToken")?;
                let mut results = vec![(String::new(), open(HKEY_USERS, &hive))];
                for subkey in PROBED_SUBKEYS {
                    results.push(((*subkey).to_owned(), open(HKEY_USERS, &format!("{hive}\\{subkey}"))));
                }
                unsafe { SetThreadToken(std::ptr::null(), std::ptr::null_mut()) };
                Ok(results)
            })
            .join()
            .unwrap_or_else(|_| Err(Error::msg("the registry probe thread panicked")))
    })?;
    let line = results
        .iter()
        .map(|(key, status)| {
            let state = match *status {
                0 => "read".to_owned(),
                ERROR_FILE_NOT_FOUND | ERROR_PATH_NOT_FOUND => "absent".to_owned(),
                code => format!("error {code}"),
            };
            format!("HKCU\\{key}={state}")
        })
        .collect::<Vec<_>>()
        .join(" ");
    match results.first() {
        Some((_, 0)) => Ok(format!("AppContainer HKCU (HKU\\{hive}): {line}")),
        _ => Err(Error::msg(format!("the AppContainer cannot open its HKCU (HKU\\{hive}): {line}"))),
    }
}
