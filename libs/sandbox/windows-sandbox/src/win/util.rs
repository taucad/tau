//! Small Win32 helpers: wide strings, owned handles, errors, randomness and known folders.

use std::ffi::c_void;
use std::fmt;
use std::io;

use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, HANDLE, HLOCAL, INVALID_HANDLE_VALUE, LocalFree};
use windows_sys::Win32::Security::Cryptography::{BCRYPT_USE_SYSTEM_PREFERRED_RNG, BCryptGenRandom};
use windows_sys::Win32::System::Com::CoTaskMemFree;
use windows_sys::Win32::System::Console::{CTRL_BREAK_EVENT, CTRL_C_EVENT, GetConsoleWindow, SetConsoleCtrlHandler};
use windows_sys::Win32::System::SystemInformation::GetSystemWindowsDirectoryW;
use windows_sys::Win32::UI::Shell::{FOLDERID_ProgramData, FOLDERID_ProgramFiles, SHGetKnownFolderPath};
use windows_sys::core::{GUID, PWSTR};

/// An error with what was being done and, when there is one, the Win32 error code. Never carries secrets.
#[derive(Debug)]
pub struct Error {
    pub context: String,
    pub code: Option<u32>,
}

impl Error {
    pub fn last(context: impl Into<String>) -> Self {
        Self { context: context.into(), code: Some(unsafe { GetLastError() }) }
    }

    pub fn code(context: impl Into<String>, code: u32) -> Self {
        Self { context: context.into(), code: Some(code) }
    }

    pub fn msg(context: impl Into<String>) -> Self {
        Self { context: context.into(), code: None }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.code {
            Some(code) => write!(f, "{} (Windows error {code})", self.context),
            None => write!(f, "{}", self.context),
        }
    }
}

impl From<io::Error> for Error {
    fn from(err: io::Error) -> Self {
        Self { context: err.to_string(), code: err.raw_os_error().map(|c| c as u32) }
    }
}

pub type Result<T> = std::result::Result<T, Error>;

/// Fail with the last error unless `ok` (a Win32 `BOOL`) is nonzero.
pub fn check(ok: i32, context: &str) -> Result<()> {
    if ok == 0 { Err(Error::last(context)) } else { Ok(()) }
}

/// Fail unless a `WIN32_ERROR` return is `ERROR_SUCCESS`.
pub fn check_status(status: u32, context: &str) -> Result<()> {
    if status == 0 { Ok(()) } else { Err(Error::code(context, status)) }
}

pub fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// # Safety
/// `ptr` must be null or point to a NUL-terminated UTF-16 string.
pub unsafe fn from_wide_ptr(ptr: *const u16) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let mut len = 0;
    while unsafe { *ptr.add(len) } != 0 {
        len += 1;
    }
    String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(ptr, len) })
}

/// An owned kernel handle, closed on drop.
#[derive(Debug)]
pub struct Owned(pub HANDLE);

// SAFETY: a kernel handle is a process-wide token usable from any thread.
unsafe impl Send for Owned {}
unsafe impl Sync for Owned {}

impl Owned {
    pub fn new(handle: HANDLE, context: &str) -> Result<Self> {
        if handle.is_null() || handle == INVALID_HANDLE_VALUE { Err(Error::last(context)) } else { Ok(Self(handle)) }
    }

    pub fn raw(&self) -> HANDLE {
        self.0
    }
}

impl Drop for Owned {
    fn drop(&mut self) {
        if !self.0.is_null() && self.0 != INVALID_HANDLE_VALUE {
            unsafe { CloseHandle(self.0) };
        }
    }
}

/// Memory the system allocated with `LocalAlloc`, freed on drop.
pub struct Local(pub *mut c_void);

impl Drop for Local {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { LocalFree(self.0 as HLOCAL) };
        }
    }
}

pub fn random_bytes(len: usize) -> Result<Vec<u8>> {
    let mut buf = vec![0u8; len];
    let status =
        unsafe { BCryptGenRandom(std::ptr::null_mut(), buf.as_mut_ptr(), len as u32, BCRYPT_USE_SYSTEM_PREFERRED_RNG) };
    if status < 0 { Err(Error::code("BCryptGenRandom", status as u32)) } else { Ok(buf) }
}

pub fn random_u32s<const N: usize>() -> Result<[u32; N]> {
    let bytes = random_bytes(N * 4)?;
    let mut out = [0u32; N];
    for (i, chunk) in bytes.chunks_exact(4).enumerate() {
        out[i] = u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
    }
    Ok(out)
}

fn known_folder(id: &GUID, name: &str) -> Result<String> {
    let mut path: PWSTR = std::ptr::null_mut();
    let hr = unsafe { SHGetKnownFolderPath(id, 0, std::ptr::null_mut(), &mut path) };
    let result = if hr < 0 {
        Err(Error::code(format!("SHGetKnownFolderPath({name})"), hr as u32))
    } else {
        Ok(unsafe { from_wide_ptr(path) })
    };
    unsafe { CoTaskMemFree(path as *const c_void) };
    result
}

pub fn program_data() -> Result<String> {
    known_folder(&FOLDERID_ProgramData, "ProgramData")
}

pub fn program_files() -> Result<String> {
    known_folder(&FOLDERID_ProgramFiles, "ProgramFiles")
}

pub fn system_root() -> Result<String> {
    let mut buf = [0u16; 260];
    let len = unsafe { GetSystemWindowsDirectoryW(buf.as_mut_ptr(), buf.len() as u32) } as usize;
    if len == 0 || len >= buf.len() {
        return Err(Error::last("GetSystemWindowsDirectoryW"));
    }
    Ok(String::from_utf16_lossy(&buf[..len]))
}

/// Give this process the system variables Windows itself expands, where its caller left them out: `SystemDrive`,
/// `SystemRoot` and `windir`, from the Windows directory (`GetSystemWindowsDirectoryW`, which reads no environment).
/// `SHGetKnownFolderPath` expands `%SystemDrive%` for `ProgramData` from the process environment and fails with
/// `ERROR_PATH_NOT_FOUND` without it, so the install paths of every subcommand would otherwise depend on what the host
/// chose to pass (the desktop app's services utility passed no `SystemDrive`). Values the caller did set are kept.
/// Called first in `main`, before any thread starts.
pub fn ensure_system_environment() -> Result<()> {
    let windows = system_root()?;
    let drive = crate::paths::drive_of(&windows)
        .ok_or_else(|| Error::msg(format!("the Windows directory {windows} is not on a drive")))?;
    for (name, value) in
        [("SystemDrive", drive.as_str()), ("SystemRoot", windows.as_str()), ("windir", windows.as_str())]
    {
        if std::env::var_os(name).is_none_or(|current| current.is_empty()) {
            // SAFETY: called at the start of `main`, while this process has one thread.
            unsafe { std::env::set_var(name, value) };
        }
    }
    Ok(())
}

/// Survive Ctrl-C and Ctrl-Break on this process's own console without exiting.
unsafe extern "system" fn ignore_interrupts(kind: u32) -> windows_sys::core::BOOL {
    i32::from(kind == CTRL_C_EVENT || kind == CTRL_BREAK_EVENT)
}

/// Let the children this process creates receive Ctrl-C again: clear the inherited "ignore Ctrl-C" flag
/// (`SetConsoleCtrlHandler(NULL, FALSE)`), which every child copies at creation. Anything in the chain
/// above (a parent started with `CREATE_NEW_PROCESS_GROUP`, a host that ignores Ctrl-C) can have set it,
/// and with it set the shell ignores the `CTRL_C_EVENT` its pseudoconsole raises for `0x03`. A handler
/// that reports Ctrl-C and Ctrl-Break handled goes in first, so clearing the flag never lets a signal on
/// this process's own console end it. Returns a diagnostic line for the log.
pub fn clear_ctrl_c_ignore() -> String {
    let handler = unsafe { SetConsoleCtrlHandler(Some(ignore_interrupts), 1) };
    let handler_error = if handler == 0 { unsafe { GetLastError() } } else { 0 };
    let cleared = unsafe { SetConsoleCtrlHandler(None, 0) };
    let cleared_error = if cleared == 0 { unsafe { GetLastError() } } else { 0 };
    let console = !unsafe { GetConsoleWindow() }.is_null();
    format!(
        "ctrl-c: handler={} (error {handler_error}) ignore-flag cleared={} (error {cleared_error}) console-window={console}",
        handler != 0,
        cleared != 0
    )
}

/// Overwrite a secret in place before it is dropped.
pub fn wipe(bytes: &mut [u8]) {
    for byte in bytes.iter_mut() {
        unsafe { std::ptr::write_volatile(byte, 0) };
    }
}

pub fn wipe_wide(chars: &mut [u16]) {
    for c in chars.iter_mut() {
        unsafe { std::ptr::write_volatile(c, 0) };
    }
}
