//! Cross-launch locking (README "Sessions").
//!
//! Launches run concurrently. What they must not do concurrently is edit descriptors: the journaling and granting
//! of a launch, and each restore, read the ledger (`ledger.rs`) and the descriptors they are about to change, and
//! another launch's edits in between would make that reading stale. So those steps, and nothing else, hold the
//! person's descriptor lock, [`Descriptors`], a named mutex. A launcher that dies abandons it, and the next waiter
//! takes it: the dead launch's journal is still registered, and its `restore` is what puts it right.
//!
//! Each launcher also holds a mutex of its own, [`Live`], for its whole life, so `restore` can tell a live launch's
//! journal from a dead one's and never restores the former.

use std::time::Duration;

use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, GetLastError, WAIT_ABANDONED, WAIT_OBJECT_0};
use windows_sys::Win32::System::Threading::{
    CreateMutexW, OpenMutexW, ReleaseMutex, SYNCHRONIZATION_SYNCHRONIZE, WaitForSingleObject,
};

use super::sid::current_user;
use super::util::{Error, Owned, Result, wide};

/// How long a launch or a restore waits for another's descriptor edits: those take as long as a walk of the
/// granted trees, never as long as a launch.
pub const WAIT: Duration = Duration::from_secs(120);

/// The person's descriptor lock, held while journaling and granting or restoring. Released on drop, which must
/// happen on the thread that took it.
pub struct Descriptors {
    handle: Owned,
}

impl Drop for Descriptors {
    fn drop(&mut self) {
        unsafe { ReleaseMutex(self.handle.raw()) };
    }
}

fn descriptors_name() -> Result<String> {
    Ok(format!("Global\\tau.sandbox.descriptors.{}", current_user()?.to_sddl()))
}

/// Take the person's descriptor lock, waiting up to [`WAIT`].
pub fn descriptors() -> Result<Descriptors> {
    let name = wide(&descriptors_name()?);
    let handle = Owned::new(unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) }, "CreateMutexW(descriptors)")?;
    match unsafe { WaitForSingleObject(handle.raw(), WAIT.as_millis() as u32) } {
        WAIT_OBJECT_0 | WAIT_ABANDONED => Ok(Descriptors { handle }),
        _ => Err(Error::msg(format!(
            "another sandboxed launch kept its folder permissions locked for over {} seconds",
            WAIT.as_secs()
        ))),
    }
}

fn live_name(package: &str) -> String {
    format!("Global\\tau.sandbox.launcher.{package}")
}

/// Held by a launcher for its whole life.
pub struct Live {
    _handle: Owned,
}

/// Mark the launch of `package` live.
pub fn live(package: &str) -> Result<Live> {
    let name = wide(&live_name(package));
    let handle = Owned::new(unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) }, "CreateMutexW(live)")?;
    Ok(Live { _handle: handle })
}

/// Whether the launch of `package` is still running.
pub fn is_live(package: &str) -> bool {
    let name = wide(&live_name(package));
    let handle = unsafe { OpenMutexW(SYNCHRONIZATION_SYNCHRONIZE, 0, name.as_ptr()) };
    if handle.is_null() {
        // Present but not ours to open counts as live: never restore what might be running.
        return unsafe { GetLastError() } != ERROR_FILE_NOT_FOUND;
    }
    drop(Owned(handle));
    true
}
