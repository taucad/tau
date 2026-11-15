//! The launcher (blueprint R2): run inside an outer user and mount namespace that holds `CAP_SYS_ADMIN`, mount one guard
//! over each store, bind the bulk directories past it, drop every capability and exec the sandbox's own command.
//!
//! ```text
//! outer bubblewrap (the person's uid, CAP_SYS_ADMIN inside its own namespace only)
//!  └─ tau-store-guard launch
//!      ├─ opens each store as a path descriptor, mounts FUSE over it, forks the server
//!      ├─ binds objects, refs, logs and lfs from the descriptor over the guard
//!      ├─ drops every capability
//!      └─ exec: the sandbox runtime's own bubblewrap command, unchanged
//! ```
//!
//! The server holds the only copy of each `/dev/fuse` descriptor and dies with the launched command
//! (`PR_SET_PDEATHSIG`), so the mount ends with the sandbox; the outer namespace ends it too. A server that dies
//! first leaves `.git` answering "Transport endpoint is not connected": git inside fails and the real store is
//! untouched.

use std::ffi::{CString, OsStr, OsString};
use std::io;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::os::unix::ffi::OsStrExt;
use std::path::{Path, PathBuf};

use fuser::{Config, Session, SessionACL};

use crate::guard::Guard;
use crate::policy::Policy;
use crate::sys;

/// One `launch` invocation.
pub struct Launch {
    pub policy: Policy,
    pub stores: Vec<PathBuf>,
    pub bypass: Vec<OsString>,
    pub command: Vec<OsString>,
}

/// A failed launch step, with the exit code it maps to.
#[derive(Debug)]
pub struct Failure {
    pub code: i32,
    pub message: String,
}

fn failure(code: i32, stage: &str, error: impl std::fmt::Display) -> Failure {
    Failure { code, message: format!("{stage}: {error}") }
}

const LINUX_CAPABILITY_VERSION_3: u32 = 0x2008_0522;

#[repr(C)]
struct CapabilityHeader {
    version: u32,
    pid: libc::c_int,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CapabilityData {
    effective: u32,
    permitted: u32,
    inheritable: u32,
}

/// Drop every capability: the ambient set, so nothing survives exec, and the effective, permitted and inheritable sets.
pub fn drop_capabilities() -> io::Result<()> {
    // SAFETY: plain prctl calls.
    sys::check(unsafe { libc::prctl(libc::PR_CAP_AMBIENT, libc::PR_CAP_AMBIENT_CLEAR_ALL, 0, 0, 0) })?;
    let header = CapabilityHeader { version: LINUX_CAPABILITY_VERSION_3, pid: 0 };
    let data = [CapabilityData::default(); 2];
    // SAFETY: `header` and `data` match the kernel's v3 layout and outlive the call.
    let result = unsafe { libc::syscall(libc::SYS_capset, &header as *const CapabilityHeader, data.as_ptr()) };
    if result == -1 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

fn open_store(path: &Path) -> io::Result<OwnedFd> {
    if !path.is_absolute() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "a store path must be absolute"));
    }
    let name = sys::c_string(path.as_os_str().as_bytes())?;
    // SAFETY: `name` outlives the call.
    let fd = sys::check(unsafe {
        libc::open(name.as_ptr(), libc::O_PATH | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
    })?;
    // SAFETY: a successful open returns a new descriptor this process owns.
    Ok(unsafe { OwnedFd::from_raw_fd(fd) })
}

fn mount_fuse(store: &Path) -> io::Result<OwnedFd> {
    let device = sys::c_string(b"/dev/fuse")?;
    // SAFETY: `device` outlives the call.
    let fd = sys::check(unsafe { libc::open(device.as_ptr(), libc::O_RDWR | libc::O_CLOEXEC) })?;
    // SAFETY: a successful open returns a new descriptor this process owns.
    let fuse = unsafe { OwnedFd::from_raw_fd(fd) };
    // SAFETY: plain calls.
    let (uid, gid) = unsafe { (libc::geteuid(), libc::getegid()) };
    let options =
        sys::c_string(format!("fd={},rootmode=40000,user_id={uid},group_id={gid}", fuse.as_raw_fd()).as_bytes())?;
    let source = sys::c_string(b"tau-store-guard")?;
    let kind = sys::c_string(b"fuse.tau-store-guard")?;
    let target = sys::c_string(store.as_os_str().as_bytes())?;
    // SAFETY: every string outlives the call.
    sys::check(unsafe {
        libc::mount(
            source.as_ptr(),
            target.as_ptr(),
            kind.as_ptr(),
            libc::MS_NOSUID | libc::MS_NODEV,
            options.as_ptr().cast(),
        )
    })?;
    Ok(fuse)
}

/// Bind `name` of the real store, through its descriptor, over the same name under the guard. Absent or
/// non-directory entries stay behind the guard: slower, never open.
fn bind_bypass(root: &OwnedFd, store: &Path, name: &OsStr) -> io::Result<bool> {
    let source = match sys::open_at(root.as_raw_fd(), name, libc::O_PATH | libc::O_DIRECTORY, 0) {
        Ok(source) => source,
        Err(error) if matches!(error.raw_os_error(), Some(libc::ENOENT | libc::ENOTDIR | libc::ELOOP)) => {
            return Ok(false);
        }
        Err(error) => return Err(error),
    };
    let from = sys::proc_path(&source);
    let to = sys::c_string(store.join(name).as_os_str().as_bytes())?;
    // SAFETY: both strings outlive the call; a bind takes no filesystem type or data.
    sys::check(unsafe { libc::mount(from.as_ptr(), to.as_ptr(), std::ptr::null(), libc::MS_BIND, std::ptr::null()) })?;
    Ok(true)
}

/// The server process: one session per store on its own thread, until every mount ends.
fn serve(mounts: Vec<(OwnedFd, OwnedFd)>, policy: &Policy, bypass: &[OsString]) -> ! {
    // SAFETY: plain calls in the freshly forked, single-threaded child.
    unsafe {
        libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL);
    }
    if drop_capabilities().is_err() {
        // SAFETY: leaving the forked child without running the parent's destructors.
        unsafe { libc::_exit(5) };
    }
    let mut threads = Vec::new();
    for (root, fuse) in mounts {
        let policy = policy.clone();
        let bypass = bypass.to_vec();
        threads.push(std::thread::spawn(move || -> io::Result<()> {
            let mut config = Config::default();
            config.acl = SessionACL::Owner;
            config.n_threads = Some(4);
            Session::from_fd(Guard::new(root, policy, bypass), fuse, SessionACL::Owner, config)?.run()
        }));
    }
    let mut code = 0;
    for thread in threads {
        match thread.join() {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                eprintln!("tau-store-guard: serve: {error}");
                code = 5;
            }
            Err(_) => code = 5,
        }
    }
    // SAFETY: leaving the forked child without running the parent's destructors.
    unsafe { libc::_exit(code) }
}

/// Run one launch. Returns only on failure: success execs the command.
pub fn launch(launch: Launch) -> Failure {
    if launch.stores.is_empty() || launch.command.is_empty() {
        return failure(2, "usage", "launch needs at least one --store and a command after --");
    }
    let mut roots = Vec::new();
    for store in &launch.stores {
        match open_store(store) {
            Ok(root) => roots.push(root),
            Err(error) => return failure(3, &format!("open {}", store.display()), error),
        }
    }
    let mut fuses = Vec::new();
    for store in &launch.stores {
        match mount_fuse(store) {
            Ok(fuse) => fuses.push(fuse),
            Err(error) => return failure(4, &format!("mount {}", store.display()), error),
        }
    }
    // The server gets its own copies of the store descriptors; this process keeps its own for the bypass binds.
    let mut served = Vec::new();
    for root in &roots {
        match root.try_clone() {
            Ok(copy) => served.push(copy),
            Err(error) => return failure(5, "duplicate a store descriptor", error),
        }
    }
    // SAFETY: this process is single-threaded here, so the child may run arbitrary code.
    let child = unsafe { libc::fork() };
    if child == -1 {
        return failure(5, "fork the server", io::Error::last_os_error());
    }
    if child == 0 {
        drop(roots);
        serve(served.into_iter().zip(fuses).collect(), &launch.policy, &launch.bypass);
    }
    // Only the server holds the FUSE descriptors, so its death aborts the mounts instead of hanging them.
    drop(fuses);
    drop(served);
    for (root, store) in roots.iter().zip(&launch.stores) {
        for name in &launch.bypass {
            if let Err(error) = bind_bypass(root, store, name) {
                return failure(6, &format!("bind {} past the guard", store.join(name).display()), error);
            }
        }
        if let Err(error) = sys::stat_at(libc::AT_FDCWD, store.as_os_str()) {
            return failure(5, &format!("serve {}", store.display()), error);
        }
    }
    drop(roots);
    if let Err(error) = drop_capabilities() {
        return failure(7, "drop capabilities", error);
    }
    let arguments: Vec<CString> = match launch.command.iter().map(|part| sys::c_string(part.as_bytes())).collect() {
        Ok(arguments) => arguments,
        Err(error) => return failure(2, "command", error),
    };
    let mut pointers: Vec<*const libc::c_char> = arguments.iter().map(|argument| argument.as_ptr()).collect();
    pointers.push(std::ptr::null());
    // SAFETY: `pointers` is a NULL-terminated array of strings that outlive the call.
    unsafe { libc::execvp(pointers[0], pointers.as_ptr()) };
    failure(8, &format!("exec {}", launch.command[0].to_string_lossy()), io::Error::last_os_error())
}

/// `check <store> <name>`: run inside the nested sandbox by the host's start check. Through the guard an ordinary
/// name can be created, written and removed, and the protected `name` can be neither appended to nor created.
pub fn check(store: &Path, protected: &OsStr) -> Result<(), String> {
    let probe = store.join(".tau-store-guard-check");
    std::fs::write(&probe, b"check\n").map_err(|error| format!("write through the guard: {error}"))?;
    std::fs::remove_file(&probe).map_err(|error| format!("remove through the guard: {error}"))?;
    let target = store.join(protected);
    let appended = std::fs::OpenOptions::new().append(true).create(true).open(&target);
    match appended {
        Err(error) if error.raw_os_error() == Some(libc::EPERM) => Ok(()),
        Err(error) => Err(format!("{} was refused with {error}, not EPERM", target.display())),
        Ok(_) => Err(format!("{} was writable through the guard", target.display())),
    }
}
