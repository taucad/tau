//! Kill-on-close job objects with no breakaway.

use std::ffi::c_void;
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::HANDLE;
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JobObjectBasicAccountingInformation, JobObjectExtendedLimitInformation, QueryInformationJobObject,
    SetInformationJobObject, TerminateJobObject,
};

use super::util::{Owned, Result, check};

/// Exit code a job kill leaves on its processes.
pub const KILLED_EXIT_CODE: u32 = 0xC000_013A;

pub struct Job(Owned);

impl Job {
    /// An unnamed job that kills every member when its last handle closes. Neither `BREAKAWAY_OK` nor
    /// `SILENT_BREAKAWAY_OK` is set, so no member can leave it.
    pub fn kill_on_close() -> Result<Self> {
        let job = Owned::new(unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) }, "CreateJobObjectW")?;
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
        limits.BasicLimitInformation.LimitFlags =
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION;
        check(
            unsafe {
                SetInformationJobObject(
                    job.raw(),
                    JobObjectExtendedLimitInformation,
                    &limits as *const _ as *const c_void,
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
            },
            "SetInformationJobObject",
        )?;
        Ok(Self(job))
    }

    pub fn raw(&self) -> HANDLE {
        self.0.raw()
    }

    pub fn assign(&self, process: HANDLE) -> Result<()> {
        check(unsafe { AssignProcessToJobObject(self.raw(), process) }, "AssignProcessToJobObject")
    }

    pub fn terminate(&self) -> Result<()> {
        check(unsafe { TerminateJobObject(self.raw(), KILLED_EXIT_CODE) }, "TerminateJobObject")
    }

    pub fn active_processes(&self) -> Result<u32> {
        let mut info: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = unsafe { std::mem::zeroed() };
        check(
            unsafe {
                QueryInformationJobObject(
                    self.raw(),
                    JobObjectBasicAccountingInformation,
                    &mut info as *mut _ as *mut c_void,
                    size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
                    std::ptr::null_mut(),
                )
            },
            "QueryInformationJobObject",
        )?;
        Ok(info.ActiveProcesses)
    }

    /// Wait until the job reports zero active processes. `Ok(false)` on timeout.
    pub fn wait_empty(&self, timeout: Duration) -> Result<bool> {
        let deadline = Instant::now() + timeout;
        loop {
            if self.active_processes()? == 0 {
                return Ok(true);
            }
            if Instant::now() >= deadline {
                return Ok(false);
            }
            std::thread::sleep(Duration::from_millis(25));
        }
    }

    /// Kill every member and wait for the job to empty.
    pub fn kill_and_wait(&self, timeout: Duration) -> Result<bool> {
        if self.active_processes()? > 0 {
            self.terminate()?;
        }
        self.wait_empty(timeout)
    }
}
