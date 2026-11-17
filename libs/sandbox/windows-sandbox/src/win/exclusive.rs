//! One launch, or one `restore`, at a time on this computer (README "Sessions").
//!
//! Every launch grants its paths to the one sandbox account and restores them from a snapshot of their whole
//! descriptors (`acl.rs`). Two live launches over overlapping paths would each snapshot the other's ACEs, and
//! whichever restored last would write the other's grants back after that launch had ended. So `launch` holds the
//! named mutex [`MUTEX`] from before it journals until its teardown has restored every descriptor, and `restore`
//! holds it while it writes a journal back. A second caller is refused at once; nothing waits.
//!
//! The mutex is a kernel object: a launcher that dies releases it (abandoned), and its journal stays for `restore`
//! as before. It lives in `Global\`, so a launch in another Windows session, whose person may not open the object
//! at all, counts as running too.

use windows_sys::Win32::Foundation::{ERROR_ACCESS_DENIED, GetLastError, WAIT_ABANDONED, WAIT_OBJECT_0};
use windows_sys::Win32::System::Threading::{CreateMutexW, ReleaseMutex, WaitForSingleObject};

use super::util::{Error, Owned, Result, wide};

/// The mutex every launch and every `restore` holds while it may change a descriptor.
pub const MUTEX: &str = "Global\\tau.sandbox.descriptors";

/// What a second launch is told while another launch (or a restore) holds [`MUTEX`].
pub const BUSY: &str =
    "another sandboxed launch is running on this computer, and Windows runs one at a time; try again when it ends";

/// The held mutex; released on drop, which must happen on the thread that took it.
pub struct Exclusive {
    handle: Owned,
}

impl Drop for Exclusive {
    fn drop(&mut self) {
        unsafe { ReleaseMutex(self.handle.raw()) };
    }
}

/// Take [`MUTEX`] without waiting: `Ok(None)` while another process holds it.
pub fn try_acquire() -> Result<Option<Exclusive>> {
    let name = wide(MUTEX);
    let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
    if handle.is_null() {
        // Created by a launch of another person, whose default DACL does not admit us: it is running.
        if unsafe { GetLastError() } == ERROR_ACCESS_DENIED {
            return Ok(None);
        }
        return Err(Error::last("CreateMutexW(descriptor owner)"));
    }
    let handle = Owned(handle);
    match unsafe { WaitForSingleObject(handle.raw(), 0) } {
        // An abandoned mutex belongs to a launcher that died; its journal is `restore`'s, and ours is our own.
        WAIT_OBJECT_0 | WAIT_ABANDONED => Ok(Some(Exclusive { handle })),
        _ => Ok(None),
    }
}
