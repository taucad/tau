//! Thin system-call wrappers. Every path the guard resolves is resolved beneath the store's descriptor with
//! `openat2(RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS | RESOLVE_NO_MAGICLINKS | RESOLVE_NO_XDEV)`, and every leaf is acted on
//! through its parent's descriptor without following a link: the guard runs as the person, with the person's whole
//! filesystem in view, so it must never be steered outside the store.

use std::ffi::{CString, OsStr};
use std::io;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd, RawFd};
use std::os::unix::ffi::OsStrExt;
use std::path::Path;

/// A C string of `bytes`; a NUL inside a name is refused as no file system name can hold one.
pub fn c_string(bytes: &[u8]) -> io::Result<CString> {
    CString::new(bytes).map_err(|_| io::Error::from_raw_os_error(libc::EINVAL))
}

/// Convert a `-1` system-call result to the thread's `errno`.
pub fn check(result: libc::c_int) -> io::Result<libc::c_int> {
    if result == -1 { Err(io::Error::last_os_error()) } else { Ok(result) }
}

fn check_long(result: libc::c_long) -> io::Result<libc::c_long> {
    if result == -1 { Err(io::Error::last_os_error()) } else { Ok(result) }
}

/// Open `relative` beneath `root`: never through a symbolic link, a magic link or another mount, and never above it.
pub fn open_beneath(root: RawFd, relative: &Path, flags: libc::c_int) -> io::Result<OwnedFd> {
    let path =
        if relative.as_os_str().is_empty() { c_string(b".")? } else { c_string(relative.as_os_str().as_bytes())? };
    let mut how: libc::open_how = unsafe { std::mem::zeroed() };
    how.flags = (flags | libc::O_CLOEXEC) as u64;
    how.resolve =
        libc::RESOLVE_BENEATH | libc::RESOLVE_NO_SYMLINKS | libc::RESOLVE_NO_MAGICLINKS | libc::RESOLVE_NO_XDEV;
    // SAFETY: `path` and `how` outlive the call; the kernel copies both.
    let fd = check_long(unsafe {
        libc::syscall(
            libc::SYS_openat2,
            root,
            path.as_ptr(),
            &how as *const libc::open_how,
            std::mem::size_of::<libc::open_how>(),
        )
    })?;
    // SAFETY: a successful openat2 returns a new descriptor this process owns.
    Ok(unsafe { OwnedFd::from_raw_fd(fd as RawFd) })
}

/// The directory that holds `relative`, opened beneath `root` as a path descriptor.
pub fn open_directory(root: RawFd, relative: &Path) -> io::Result<OwnedFd> {
    open_beneath(root, relative, libc::O_PATH | libc::O_DIRECTORY)
}

/// `openat(dir, name, flags | O_NOFOLLOW)`: a leaf that is a link is never opened.
pub fn open_at(dir: RawFd, name: &OsStr, flags: libc::c_int, mode: libc::mode_t) -> io::Result<OwnedFd> {
    let name = c_string(name.as_bytes())?;
    // SAFETY: `name` outlives the call.
    let fd = check(unsafe { libc::openat(dir, name.as_ptr(), flags | libc::O_NOFOLLOW | libc::O_CLOEXEC, mode) })?;
    // SAFETY: a successful openat returns a new descriptor this process owns.
    Ok(unsafe { OwnedFd::from_raw_fd(fd) })
}

/// `fstatat(dir, name, AT_SYMLINK_NOFOLLOW)`, or of `dir` itself when `name` is empty.
pub fn stat_at(dir: RawFd, name: &OsStr) -> io::Result<libc::stat> {
    let empty = name.is_empty();
    let name = c_string(name.as_bytes())?;
    let flags = libc::AT_SYMLINK_NOFOLLOW | if empty { libc::AT_EMPTY_PATH } else { 0 };
    let mut status: libc::stat = unsafe { std::mem::zeroed() };
    // SAFETY: `name` and `status` outlive the call.
    check(unsafe { libc::fstatat(dir, name.as_ptr(), &mut status, flags) })?;
    Ok(status)
}

/// `fstat` of an open descriptor.
pub fn stat_fd(fd: RawFd) -> io::Result<libc::stat> {
    stat_at(fd, OsStr::new(""))
}

/// Run `operation` on `name` inside `dir`, with the name as a C string.
pub fn with_name<T>(name: &OsStr, operation: impl FnOnce(&CString) -> io::Result<T>) -> io::Result<T> {
    operation(&c_string(name.as_bytes())?)
}

/// The `/proc/self/fd/<n>` spelling of a descriptor: the exact object it holds, never a re-resolved path.
pub fn proc_path(fd: &impl AsRawFd) -> CString {
    c_string(format!("/proc/self/fd/{}", fd.as_raw_fd()).as_bytes()).expect("no NUL in a decimal path")
}

/// The calling thread's `errno` as an `io::Error` when `result` is negative.
pub fn check_ssize(result: libc::ssize_t) -> io::Result<usize> {
    if result < 0 { Err(io::Error::last_os_error()) } else { Ok(result as usize) }
}
