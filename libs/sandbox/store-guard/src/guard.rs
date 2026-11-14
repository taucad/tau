//! The store guard: a FUSE passthrough of one git directory that refuses, by name, every operation that would create,
//! replace, remove, link, rename or modify a protected name (Linux Terminal git parity blueprint, LP2).
//!
//! The guard serves the real store through a path descriptor opened before the mount covered it, so it needs no side
//! path. Each request resolves its parent beneath that descriptor ([`sys::open_beneath`]) and acts on the leaf through
//! the parent without following a link. Nothing is cached: entries and attributes have a zero lifetime and every open
//! drops the page cache, because git outside the sandbox rewrites the store at any time. A regular file with a second
//! name is never opened for writing or changed, so a hard link made outside cannot alias a protected file. Extended
//! attributes, locks and `copy_file_range` are left to the kernel's defaults: git uses none of them through the store.

use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::io;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd, RawFd};
use std::os::unix::ffi::{OsStrExt, OsStringExt};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use fuser::{
    Errno, FileAttr, FileHandle, FileType, Filesystem, FopenFlags, Generation, INodeNo, LockOwner, OpenFlags,
    RenameFlags, ReplyAttr, ReplyCreate, ReplyData, ReplyDirectory, ReplyEmpty, ReplyEntry, ReplyOpen, ReplyStatfs,
    ReplyWrite, Request, TimeOrNow, WriteFlags,
};

use crate::policy::Policy;
use crate::sys;

/// Entries and attributes are never cached: git outside the sandbox changes the store under the mount.
const NO_CACHE: Duration = Duration::ZERO;
/// The entry of a bypassed directory is a mount point that never changes while the guard runs. Caching it spares a
/// lookup round trip on every path walk into `objects` or `refs`; without it the bypass saves almost nothing.
const MOUNT_POINT: Duration = Duration::from_secs(24 * 60 * 60);
const ROOT: u64 = 1;

type Outcome<T> = Result<T, Errno>;

fn errno(error: io::Error) -> Errno {
    Errno::from(error)
}

fn refused<T>() -> Outcome<T> {
    Err(Errno::EPERM)
}

#[derive(Debug)]
struct Node {
    /// The node's path inside the store, `None` once its name was removed or replaced.
    path: Option<PathBuf>,
    lookups: u64,
}

/// Inode numbers by path. A number is never reused, so a stale handle in the kernel can never reach another file.
#[derive(Debug)]
struct Nodes {
    by_ino: HashMap<u64, Node>,
    by_path: HashMap<PathBuf, u64>,
    next: u64,
}

impl Nodes {
    fn new() -> Self {
        let mut by_ino = HashMap::new();
        by_ino.insert(ROOT, Node { path: Some(PathBuf::new()), lookups: u64::MAX });
        let mut by_path = HashMap::new();
        by_path.insert(PathBuf::new(), ROOT);
        Self { by_ino, by_path, next: ROOT + 1 }
    }

    fn path(&self, ino: u64) -> Outcome<PathBuf> {
        self.by_ino.get(&ino).and_then(|node| node.path.clone()).ok_or(Errno::ENOENT)
    }

    /// The number of `path`, counting one kernel lookup of it.
    fn remember(&mut self, path: PathBuf) -> u64 {
        if let Some(&ino) = self.by_path.get(&path) {
            if let Some(node) = self.by_ino.get_mut(&ino) {
                node.lookups = node.lookups.saturating_add(1);
            }
            return ino;
        }
        let ino = self.next;
        self.next += 1;
        self.by_path.insert(path.clone(), ino);
        self.by_ino.insert(ino, Node { path: Some(path), lookups: 1 });
        ino
    }

    /// The number a directory listing reports for `path`: its own when known, else one outside the node range.
    fn listed(&self, path: &Path, fallback: u64) -> u64 {
        self.by_path.get(path).copied().unwrap_or(fallback | (1 << 63))
    }

    fn forget(&mut self, ino: u64, count: u64) {
        if ino == ROOT {
            return;
        }
        let Some(node) = self.by_ino.get_mut(&ino) else { return };
        node.lookups = node.lookups.saturating_sub(count);
        if node.lookups == 0 {
            let path = node.path.clone();
            self.by_ino.remove(&ino);
            if let Some(path) = path
                && self.by_path.get(&path) == Some(&ino)
            {
                self.by_path.remove(&path);
            }
        }
    }

    /// `path` and everything under it no longer exist under those names.
    fn detach(&mut self, path: &Path) {
        let gone: Vec<PathBuf> = self.by_path.keys().filter(|candidate| candidate.starts_with(path)).cloned().collect();
        for candidate in gone {
            if let Some(ino) = self.by_path.remove(&candidate)
                && let Some(node) = self.by_ino.get_mut(&ino)
            {
                node.path = None;
            }
        }
    }

    /// `from` and everything under it are now named under `to`; whatever `to` named is gone.
    fn rename(&mut self, from: &Path, to: &Path) {
        self.detach(to);
        let moved: Vec<(PathBuf, u64)> = self
            .by_path
            .iter()
            .filter(|(candidate, _)| candidate.starts_with(from))
            .map(|(candidate, ino)| (candidate.clone(), *ino))
            .collect();
        for (old, ino) in moved {
            self.by_path.remove(&old);
            let new = to.join(old.strip_prefix(from).expect("filtered by prefix"));
            if let Some(node) = self.by_ino.get_mut(&ino) {
                node.path = Some(new.clone());
            }
            self.by_path.insert(new, ino);
        }
    }

    /// `left` and `right` swapped names (`RENAME_EXCHANGE`).
    fn exchange(&mut self, left: &Path, right: &Path) {
        let parked = PathBuf::from("\0exchange");
        self.rename_keep(left, &parked);
        self.rename_keep(right, left);
        self.rename_keep(&parked, right);
    }

    fn rename_keep(&mut self, from: &Path, to: &Path) {
        let moved: Vec<(PathBuf, u64)> = self
            .by_path
            .iter()
            .filter(|(candidate, _)| candidate.starts_with(from))
            .map(|(candidate, ino)| (candidate.clone(), *ino))
            .collect();
        for (old, ino) in moved {
            self.by_path.remove(&old);
            let new = to.join(old.strip_prefix(from).expect("filtered by prefix"));
            if let Some(node) = self.by_ino.get_mut(&ino) {
                node.path = Some(new.clone());
            }
            self.by_path.insert(new, ino);
        }
    }
}

enum Handle {
    File(OwnedFd),
    Directory { fd: OwnedFd, entries: Vec<(OsString, u64, FileType)> },
}

/// One guarded store.
pub struct Guard {
    root: OwnedFd,
    policy: Policy,
    /// Top-level names bound past the guard, never protected ones (`main.rs` refuses those).
    bypass: Vec<OsString>,
    nodes: Mutex<Nodes>,
    handles: Mutex<HashMap<u64, Handle>>,
    next_handle: AtomicU64,
}

fn kind(mode: libc::mode_t) -> FileType {
    match mode & libc::S_IFMT {
        libc::S_IFDIR => FileType::Directory,
        libc::S_IFLNK => FileType::Symlink,
        libc::S_IFIFO => FileType::NamedPipe,
        libc::S_IFSOCK => FileType::Socket,
        libc::S_IFCHR => FileType::CharDevice,
        libc::S_IFBLK => FileType::BlockDevice,
        _ => FileType::RegularFile,
    }
}

fn time(seconds: i64, nanoseconds: i64) -> SystemTime {
    let nanoseconds = u32::try_from(nanoseconds.clamp(0, 999_999_999)).unwrap_or(0);
    if seconds >= 0 {
        UNIX_EPOCH + Duration::new(seconds.unsigned_abs(), nanoseconds)
    } else {
        UNIX_EPOCH - Duration::new(seconds.unsigned_abs(), 0) + Duration::new(0, nanoseconds)
    }
}

fn attributes(ino: u64, status: &libc::stat) -> FileAttr {
    FileAttr {
        ino: INodeNo(ino),
        size: u64::try_from(status.st_size).unwrap_or(0),
        blocks: u64::try_from(status.st_blocks).unwrap_or(0),
        atime: time(status.st_atime, status.st_atime_nsec),
        mtime: time(status.st_mtime, status.st_mtime_nsec),
        ctime: time(status.st_ctime, status.st_ctime_nsec),
        crtime: UNIX_EPOCH,
        kind: kind(status.st_mode),
        perm: (status.st_mode & 0o7777) as u16,
        nlink: u32::try_from(status.st_nlink).unwrap_or(u32::MAX),
        uid: status.st_uid,
        gid: status.st_gid,
        rdev: u32::try_from(status.st_rdev).unwrap_or(0),
        blksize: u32::try_from(status.st_blksize).unwrap_or(4096),
        flags: 0,
    }
}

fn timespec(value: Option<TimeOrNow>) -> libc::timespec {
    match value {
        None => libc::timespec { tv_sec: 0, tv_nsec: libc::UTIME_OMIT },
        Some(TimeOrNow::Now) => libc::timespec { tv_sec: 0, tv_nsec: libc::UTIME_NOW },
        Some(TimeOrNow::SpecificTime(at)) => match at.duration_since(UNIX_EPOCH) {
            Ok(after) => {
                libc::timespec { tv_sec: after.as_secs() as _, tv_nsec: libc::c_long::from(after.subsec_nanos()) }
            }
            Err(before) => {
                let before = before.duration();
                let mut seconds: i64 = -(before.as_secs() as i64);
                let mut nanoseconds = -libc::c_long::from(before.subsec_nanos());
                if nanoseconds < 0 {
                    seconds -= 1;
                    nanoseconds += 1_000_000_000;
                }
                libc::timespec { tv_sec: seconds as _, tv_nsec: nanoseconds }
            }
        },
    }
}

/// A regular file with more than one name: writing it would write every other name too.
fn aliased(status: &libc::stat) -> bool {
    status.st_mode & libc::S_IFMT == libc::S_IFREG && status.st_nlink > 1
}

fn split(path: &Path) -> Outcome<(&Path, &OsStr)> {
    match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) => Ok((parent, name)),
        _ => Err(Errno::EPERM),
    }
}

/// A name the kernel hands over for one entry: never empty, `.`, `..` or holding a separator.
fn entry_name(name: &OsStr) -> Outcome<&OsStr> {
    let bytes = name.as_bytes();
    if bytes.is_empty() || bytes == b"." || bytes == b".." || bytes.contains(&b'/') {
        return Err(Errno::EINVAL);
    }
    Ok(name)
}

fn write_access(flags: i32) -> bool {
    flags & libc::O_ACCMODE != libc::O_RDONLY || flags & (libc::O_TRUNC | libc::O_APPEND) != 0
}

impl Guard {
    /// A guard serving the store `root` (a path descriptor of the real directory) under `policy`, with `bypass` the
    /// top-level directories the launcher binds past it.
    pub fn new(root: OwnedFd, policy: Policy, bypass: Vec<OsString>) -> Self {
        Self {
            root,
            policy,
            bypass,
            nodes: Mutex::new(Nodes::new()),
            handles: Mutex::new(HashMap::new()),
            next_handle: AtomicU64::new(1),
        }
    }

    fn nodes(&self) -> std::sync::MutexGuard<'_, Nodes> {
        self.nodes.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn handles(&self) -> std::sync::MutexGuard<'_, HashMap<u64, Handle>> {
        self.handles.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn path(&self, ino: INodeNo) -> Outcome<PathBuf> {
        self.nodes().path(ino.0)
    }

    fn child(&self, parent: INodeNo, name: &OsStr) -> Outcome<PathBuf> {
        Ok(self.path(parent)?.join(entry_name(name)?))
    }

    fn directory(&self, relative: &Path) -> Outcome<OwnedFd> {
        sys::open_directory(self.root.as_raw_fd(), relative).map_err(errno)
    }

    fn status(&self, path: &Path) -> Outcome<libc::stat> {
        if path.as_os_str().is_empty() {
            return sys::stat_fd(self.root.as_raw_fd()).map_err(errno);
        }
        let (parent, name) = split(path)?;
        sys::stat_at(self.directory(parent)?.as_raw_fd(), name).map_err(errno)
    }

    fn entry(&self, path: PathBuf) -> Outcome<FileAttr> {
        let status = self.status(&path)?;
        let ino = self.nodes().remember(path);
        Ok(attributes(ino, &status))
    }

    fn handle(&self, handle: Handle) -> FileHandle {
        let number = self.next_handle.fetch_add(1, Ordering::Relaxed);
        self.handles().insert(number, handle);
        FileHandle(number)
    }

    fn with_file<T>(&self, fh: FileHandle, operation: impl FnOnce(RawFd) -> Outcome<T>) -> Outcome<T> {
        let handles = self.handles();
        match handles.get(&fh.0) {
            Some(Handle::File(fd)) => operation(fd.as_raw_fd()),
            Some(Handle::Directory { fd, .. }) => operation(fd.as_raw_fd()),
            None => Err(Errno::EBADF),
        }
    }

    /// Refuse a write to a protected name, before any system call.
    fn guard(&self, path: &Path) -> Outcome<()> {
        if self.policy.protects(path) { refused() } else { Ok(()) }
    }

    /// Open an existing regular file for `flags` through a path descriptor, so the object is checked before it is
    /// opened for writing: a protected name, a second name or anything but a regular file is refused, and `O_TRUNC`
    /// is applied only after the check.
    fn open_file(&self, path: &Path, flags: i32) -> Outcome<OwnedFd> {
        let writes = write_access(flags);
        if writes {
            self.guard(path)?;
        }
        let (parent, name) = split(path)?;
        let directory = self.directory(parent)?;
        let object = sys::open_at(directory.as_raw_fd(), name, libc::O_PATH, 0).map_err(errno)?;
        let status = sys::stat_fd(object.as_raw_fd()).map_err(errno)?;
        if status.st_mode & libc::S_IFMT != libc::S_IFREG {
            return Err(Errno::EPERM);
        }
        if writes && aliased(&status) {
            return refused();
        }
        let reopen = flags & !(libc::O_CREAT | libc::O_EXCL | libc::O_NOCTTY | libc::O_TRUNC);
        let proc = sys::proc_path(&object);
        // SAFETY: `proc` outlives the call. The magic link names exactly the object checked above.
        let fd = sys::check(unsafe { libc::open(proc.as_ptr(), reopen | libc::O_CLOEXEC) }).map_err(errno)?;
        // SAFETY: a successful open returns a new descriptor this process owns.
        let file = unsafe { OwnedFd::from_raw_fd(fd) };
        if flags & libc::O_TRUNC != 0 {
            // SAFETY: plain call on an owned descriptor.
            sys::check(unsafe { libc::ftruncate(file.as_raw_fd(), 0) }).map_err(errno)?;
        }
        Ok(file)
    }

    fn set_attributes(&self, ino: INodeNo, change: Change, fh: Option<FileHandle>) -> Outcome<FileAttr> {
        let path = self.path(ino)?;
        self.guard(&path)?;
        let contents = change.mode.is_some() || change.uid.is_some() || change.gid.is_some() || change.size.is_some();
        if path.as_os_str().is_empty() {
            // The store's own directory keeps its mode and owner; only its times may change.
            if contents {
                return refused();
            }
            let times = [timespec(change.atime), timespec(change.mtime)];
            let proc = sys::proc_path(&self.root);
            // SAFETY: `proc` and `times` outlive the call.
            sys::check(unsafe { libc::utimensat(libc::AT_FDCWD, proc.as_ptr(), times.as_ptr(), 0) }).map_err(errno)?;
            return Ok(attributes(ROOT, &sys::stat_fd(self.root.as_raw_fd()).map_err(errno)?));
        }
        let (parent, name) = split(&path)?;
        let directory = self.directory(parent)?;
        let object = sys::open_at(directory.as_raw_fd(), name, libc::O_PATH, 0).map_err(errno)?;
        let status = sys::stat_fd(object.as_raw_fd()).map_err(errno)?;
        let link = status.st_mode & libc::S_IFMT == libc::S_IFLNK;
        if contents && aliased(&status) {
            return refused();
        }
        let proc = sys::proc_path(&object);
        if let Some(mode) = change.mode {
            if link {
                return Err(Errno::EOPNOTSUPP);
            }
            // SAFETY: `proc` outlives the call; it names the object checked above.
            sys::check(unsafe { libc::chmod(proc.as_ptr(), (mode & 0o7777) as libc::mode_t) }).map_err(errno)?;
        }
        if change.uid.is_some() || change.gid.is_some() {
            let uid = change.uid.unwrap_or(u32::MAX);
            let gid = change.gid.unwrap_or(u32::MAX);
            let empty = sys::c_string(b"").map_err(errno)?;
            // SAFETY: `empty` outlives the call.
            sys::check(unsafe { libc::fchownat(object.as_raw_fd(), empty.as_ptr(), uid, gid, libc::AT_EMPTY_PATH) })
                .map_err(errno)?;
        }
        if let Some(size) = change.size {
            if status.st_mode & libc::S_IFMT != libc::S_IFREG {
                return Err(Errno::EINVAL);
            }
            let length = libc::off_t::try_from(size).map_err(|_| Errno::EFBIG)?;
            let truncate = |fd: RawFd| -> Outcome<()> {
                // SAFETY: plain call on a live descriptor.
                sys::check(unsafe { libc::ftruncate(fd, length) }).map(|_| ()).map_err(errno)
            };
            match fh.map(|fh| self.with_file(fh, truncate)) {
                Some(Ok(())) => {}
                _ => {
                    // SAFETY: `proc` outlives the call; the object is a regular file with one name.
                    let fd = sys::check(unsafe { libc::open(proc.as_ptr(), libc::O_WRONLY | libc::O_CLOEXEC) })
                        .map_err(errno)?;
                    // SAFETY: a successful open returns a new descriptor this process owns.
                    let file = unsafe { OwnedFd::from_raw_fd(fd) };
                    truncate(file.as_raw_fd())?;
                }
            }
        }
        if change.atime.is_some() || change.mtime.is_some() {
            let times = [timespec(change.atime), timespec(change.mtime)];
            sys::with_name(name, |name| {
                // SAFETY: `name` and `times` outlive the call.
                sys::check(unsafe {
                    libc::utimensat(directory.as_raw_fd(), name.as_ptr(), times.as_ptr(), libc::AT_SYMLINK_NOFOLLOW)
                })
            })
            .map_err(errno)?;
        }
        Ok(attributes(ino.0, &sys::stat_fd(object.as_raw_fd()).map_err(errno)?))
    }

    fn make(
        &self,
        parent: INodeNo,
        name: &OsStr,
        operation: impl FnOnce(RawFd, &OsStr) -> io::Result<()>,
    ) -> Outcome<FileAttr> {
        let path = self.child(parent, name)?;
        self.guard(&path)?;
        let (directory_path, leaf) = split(&path)?;
        let directory = self.directory(directory_path)?;
        operation(directory.as_raw_fd(), leaf).map_err(errno)?;
        self.entry(path)
    }

    fn remove(&self, parent: INodeNo, name: &OsStr, flags: libc::c_int) -> Outcome<()> {
        let path = self.child(parent, name)?;
        self.guard(&path)?;
        let (directory_path, leaf) = split(&path)?;
        let directory = self.directory(directory_path)?;
        sys::with_name(leaf, |leaf| {
            // SAFETY: `leaf` outlives the call.
            sys::check(unsafe { libc::unlinkat(directory.as_raw_fd(), leaf.as_ptr(), flags) })
        })
        .map_err(errno)?;
        self.nodes().detach(&path);
        Ok(())
    }

    fn rename_entry(&self, from: (INodeNo, &OsStr), to: (INodeNo, &OsStr), flags: RenameFlags) -> Outcome<()> {
        let source = self.child(from.0, from.1)?;
        let target = self.child(to.0, to.1)?;
        self.guard(&source)?;
        self.guard(&target)?;
        if flags.contains(RenameFlags::RENAME_WHITEOUT) {
            return refused();
        }
        let (source_parent, source_name) = split(&source)?;
        let (target_parent, target_name) = split(&target)?;
        let source_directory = self.directory(source_parent)?;
        let target_directory = self.directory(target_parent)?;
        let source_name = sys::c_string(source_name.as_bytes()).map_err(errno)?;
        let target_name = sys::c_string(target_name.as_bytes()).map_err(errno)?;
        // SAFETY: both names outlive the call.
        sys::check(unsafe {
            // The static musl build has no renameat2 wrapper; the system call is the same.
            libc::syscall(
                libc::SYS_renameat2,
                source_directory.as_raw_fd(),
                source_name.as_ptr(),
                target_directory.as_raw_fd(),
                target_name.as_ptr(),
                flags.bits(),
            ) as libc::c_int
        })
        .map_err(errno)?;
        let mut nodes = self.nodes();
        if flags.contains(RenameFlags::RENAME_EXCHANGE) {
            nodes.exchange(&source, &target);
        } else {
            nodes.rename(&source, &target);
        }
        Ok(())
    }

    fn link_entry(&self, ino: INodeNo, parent: INodeNo, name: &OsStr) -> Outcome<FileAttr> {
        let source = self.path(ino)?;
        let target = self.child(parent, name)?;
        // No second name for a protected file, and no protected name for any file.
        self.guard(&source)?;
        self.guard(&target)?;
        let (source_parent, source_name) = split(&source)?;
        let (target_parent, target_name) = split(&target)?;
        let source_directory = self.directory(source_parent)?;
        let target_directory = self.directory(target_parent)?;
        let source_name = sys::c_string(source_name.as_bytes()).map_err(errno)?;
        let target_name = sys::c_string(target_name.as_bytes()).map_err(errno)?;
        // SAFETY: both names outlive the call; without AT_SYMLINK_FOLLOW a link is linked, never its target.
        sys::check(unsafe {
            libc::linkat(
                source_directory.as_raw_fd(),
                source_name.as_ptr(),
                target_directory.as_raw_fd(),
                target_name.as_ptr(),
                0,
            )
        })
        .map_err(errno)?;
        self.entry(target)
    }

    fn create_file(
        &self,
        parent: INodeNo,
        name: &OsStr,
        mode: u32,
        umask: u32,
        flags: i32,
    ) -> Outcome<(FileAttr, FileHandle)> {
        let path = self.child(parent, name)?;
        self.guard(&path)?;
        let (directory_path, leaf) = split(&path)?;
        let directory = self.directory(directory_path)?;
        let open = (flags | libc::O_CREAT | libc::O_NONBLOCK) & !(libc::O_TRUNC | libc::O_NOCTTY);
        let file =
            sys::open_at(directory.as_raw_fd(), leaf, open, (mode & !umask & 0o7777) as libc::mode_t).map_err(errno)?;
        let status = sys::stat_fd(file.as_raw_fd()).map_err(errno)?;
        if status.st_mode & libc::S_IFMT != libc::S_IFREG || aliased(&status) {
            return refused();
        }
        // SAFETY: plain calls on an owned descriptor.
        unsafe {
            let current = libc::fcntl(file.as_raw_fd(), libc::F_GETFL);
            if current != -1 && flags & libc::O_NONBLOCK == 0 {
                libc::fcntl(file.as_raw_fd(), libc::F_SETFL, current & !libc::O_NONBLOCK);
            }
            if flags & libc::O_TRUNC != 0 {
                sys::check(libc::ftruncate(file.as_raw_fd(), 0)).map_err(errno)?;
            }
        }
        let ino = self.nodes().remember(path);
        let attributes = attributes(ino, &sys::stat_fd(file.as_raw_fd()).map_err(errno)?);
        Ok((attributes, self.handle(Handle::File(file))))
    }

    fn open_directory_handle(&self, ino: INodeNo) -> Outcome<FileHandle> {
        let path = self.path(ino)?;
        let fd = sys::open_beneath(self.root.as_raw_fd(), &path, libc::O_RDONLY | libc::O_DIRECTORY).map_err(errno)?;
        // SAFETY: dup of an owned descriptor; fdopendir takes the copy and closedir closes it.
        let copy = sys::check(unsafe { libc::fcntl(fd.as_raw_fd(), libc::F_DUPFD_CLOEXEC, 0) }).map_err(errno)?;
        // SAFETY: `copy` is a directory descriptor this process owns.
        let stream = unsafe { libc::fdopendir(copy) };
        if stream.is_null() {
            let error = io::Error::last_os_error();
            // SAFETY: fdopendir failed, so `copy` is still ours to close.
            unsafe { libc::close(copy) };
            return Err(errno(error));
        }
        let mut entries = Vec::new();
        let parent_ino = {
            let nodes = self.nodes();
            path.parent().map_or(ROOT, |parent| nodes.listed(parent, ROOT))
        };
        entries.push((OsString::from("."), ino.0, FileType::Directory));
        entries.push((OsString::from(".."), parent_ino, FileType::Directory));
        loop {
            // SAFETY: `stream` is a live directory stream; readdir's entry is copied before the next call.
            let entry = unsafe { libc::readdir(stream) };
            if entry.is_null() {
                break;
            }
            // SAFETY: a non-null readdir result points to a valid entry with a NUL-terminated name.
            let (name, d_ino, d_type) = unsafe {
                let entry = &*entry;
                let name = std::ffi::CStr::from_ptr(entry.d_name.as_ptr()).to_bytes().to_vec();
                (name, entry.d_ino, entry.d_type)
            };
            if name == b"." || name == b".." {
                continue;
            }
            let kind = match d_type {
                libc::DT_DIR => FileType::Directory,
                libc::DT_LNK => FileType::Symlink,
                libc::DT_FIFO => FileType::NamedPipe,
                libc::DT_SOCK => FileType::Socket,
                libc::DT_CHR => FileType::CharDevice,
                libc::DT_BLK => FileType::BlockDevice,
                _ => FileType::RegularFile,
            };
            let name = OsString::from_vec(name);
            let listed = self.nodes().listed(&path.join(&name), d_ino);
            entries.push((name, listed, kind));
        }
        // SAFETY: closes the stream and its descriptor copy.
        unsafe { libc::closedir(stream) };
        Ok(self.handle(Handle::Directory { fd, entries }))
    }
}

/// The attribute changes of one `setattr`.
struct Change {
    mode: Option<u32>,
    uid: Option<u32>,
    gid: Option<u32>,
    size: Option<u64>,
    atime: Option<TimeOrNow>,
    mtime: Option<TimeOrNow>,
}

impl Filesystem for Guard {
    fn lookup(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        let lifetime = if parent.0 == ROOT && self.bypass.iter().any(|bypassed| bypassed == name) {
            MOUNT_POINT
        } else {
            NO_CACHE
        };
        match self.child(parent, name).and_then(|path| self.entry(path)) {
            Ok(attributes) => reply.entry(&lifetime, &attributes, Generation(0)),
            Err(error) => reply.error(error),
        }
    }

    fn forget(&self, _req: &Request, ino: INodeNo, nlookup: u64) {
        self.nodes().forget(ino.0, nlookup);
    }

    fn getattr(&self, _req: &Request, ino: INodeNo, fh: Option<FileHandle>, reply: ReplyAttr) {
        let status = match fh {
            Some(fh) => self.with_file(fh, |fd| sys::stat_fd(fd).map_err(errno)),
            None => self.path(ino).and_then(|path| self.status(&path)),
        };
        match status {
            Ok(status) => reply.attr(&NO_CACHE, &attributes(ino.0, &status)),
            Err(error) => reply.error(error),
        }
    }

    fn setattr(
        &self,
        _req: &Request,
        ino: INodeNo,
        mode: Option<u32>,
        uid: Option<u32>,
        gid: Option<u32>,
        size: Option<u64>,
        atime: Option<TimeOrNow>,
        mtime: Option<TimeOrNow>,
        _ctime: Option<SystemTime>,
        fh: Option<FileHandle>,
        _crtime: Option<SystemTime>,
        _chgtime: Option<SystemTime>,
        _bkuptime: Option<SystemTime>,
        _flags: Option<fuser::BsdFileFlags>,
        reply: ReplyAttr,
    ) {
        match self.set_attributes(ino, Change { mode, uid, gid, size, atime, mtime }, fh) {
            Ok(attributes) => reply.attr(&NO_CACHE, &attributes),
            Err(error) => reply.error(error),
        }
    }

    fn readlink(&self, _req: &Request, ino: INodeNo, reply: ReplyData) {
        let result = self.path(ino).and_then(|path| {
            let (parent, name) = split(&path)?;
            let directory = self.directory(parent)?;
            let mut buffer = vec![0_u8; libc::PATH_MAX as usize];
            let length = sys::with_name(name, |name| {
                // SAFETY: `name` and `buffer` outlive the call.
                sys::check_ssize(unsafe {
                    libc::readlinkat(directory.as_raw_fd(), name.as_ptr(), buffer.as_mut_ptr().cast(), buffer.len())
                })
            })
            .map_err(errno)?;
            buffer.truncate(length);
            Ok(buffer)
        });
        match result {
            Ok(target) => reply.data(&target),
            Err(error) => reply.error(error),
        }
    }

    fn mknod(
        &self,
        _req: &Request,
        parent: INodeNo,
        name: &OsStr,
        mode: u32,
        umask: u32,
        _rdev: u32,
        reply: ReplyEntry,
    ) {
        // Only regular files: git makes no other node, and a pipe could stall the guard.
        if mode & libc::S_IFMT != libc::S_IFREG {
            return reply.error(Errno::EPERM);
        }
        let result = self.make(parent, name, |directory, leaf| {
            sys::with_name(leaf, |leaf| {
                // SAFETY: `leaf` outlives the call.
                sys::check(unsafe {
                    libc::mknodat(
                        directory,
                        leaf.as_ptr(),
                        (libc::S_IFREG | (mode & !umask & 0o7777)) as libc::mode_t,
                        0,
                    )
                })
            })
            .map(|_| ())
        });
        match result {
            Ok(attributes) => reply.entry(&NO_CACHE, &attributes, Generation(0)),
            Err(error) => reply.error(error),
        }
    }

    fn mkdir(&self, _req: &Request, parent: INodeNo, name: &OsStr, mode: u32, umask: u32, reply: ReplyEntry) {
        let result = self.make(parent, name, |directory, leaf| {
            sys::with_name(leaf, |leaf| {
                // SAFETY: `leaf` outlives the call.
                sys::check(unsafe { libc::mkdirat(directory, leaf.as_ptr(), (mode & !umask & 0o7777) as libc::mode_t) })
            })
            .map(|_| ())
        });
        match result {
            Ok(attributes) => reply.entry(&NO_CACHE, &attributes, Generation(0)),
            Err(error) => reply.error(error),
        }
    }

    fn unlink(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        match self.remove(parent, name, 0) {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error),
        }
    }

    fn rmdir(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        match self.remove(parent, name, libc::AT_REMOVEDIR) {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error),
        }
    }

    fn symlink(&self, _req: &Request, parent: INodeNo, link_name: &OsStr, target: &Path, reply: ReplyEntry) {
        let result = self.make(parent, link_name, |directory, leaf| {
            let target = sys::c_string(target.as_os_str().as_bytes())?;
            sys::with_name(leaf, |leaf| {
                // SAFETY: both strings outlive the call.
                sys::check(unsafe { libc::symlinkat(target.as_ptr(), directory, leaf.as_ptr()) })
            })
            .map(|_| ())
        });
        match result {
            Ok(attributes) => reply.entry(&NO_CACHE, &attributes, Generation(0)),
            Err(error) => reply.error(error),
        }
    }

    fn rename(
        &self,
        _req: &Request,
        parent: INodeNo,
        name: &OsStr,
        newparent: INodeNo,
        newname: &OsStr,
        flags: RenameFlags,
        reply: ReplyEmpty,
    ) {
        match self.rename_entry((parent, name), (newparent, newname), flags) {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error),
        }
    }

    fn link(&self, _req: &Request, ino: INodeNo, newparent: INodeNo, newname: &OsStr, reply: ReplyEntry) {
        match self.link_entry(ino, newparent, newname) {
            Ok(attributes) => reply.entry(&NO_CACHE, &attributes, Generation(0)),
            Err(error) => reply.error(error),
        }
    }

    fn open(&self, _req: &Request, ino: INodeNo, flags: OpenFlags, reply: ReplyOpen) {
        let result = self.path(ino).and_then(|path| self.open_file(&path, flags.0));
        match result {
            // No FOPEN_KEEP_CACHE: every open drops what the kernel cached, since git outside rewrites files.
            Ok(file) => reply.opened(self.handle(Handle::File(file)), FopenFlags::empty()),
            Err(error) => reply.error(error),
        }
    }

    fn read(
        &self,
        _req: &Request,
        _ino: INodeNo,
        fh: FileHandle,
        offset: u64,
        size: u32,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        reply: ReplyData,
    ) {
        let result = self.with_file(fh, |fd| {
            let mut buffer = vec![0_u8; size as usize];
            let offset = libc::off_t::try_from(offset).map_err(|_| Errno::EINVAL)?;
            // SAFETY: `buffer` outlives the call and holds `size` bytes.
            let read = sys::check_ssize(unsafe { libc::pread(fd, buffer.as_mut_ptr().cast(), buffer.len(), offset) })
                .map_err(errno)?;
            buffer.truncate(read);
            Ok(buffer)
        });
        match result {
            Ok(data) => reply.data(&data),
            Err(error) => reply.error(error),
        }
    }

    fn write(
        &self,
        _req: &Request,
        _ino: INodeNo,
        fh: FileHandle,
        offset: u64,
        data: &[u8],
        _write_flags: WriteFlags,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        reply: ReplyWrite,
    ) {
        let result = self.with_file(fh, |fd| {
            let offset = libc::off_t::try_from(offset).map_err(|_| Errno::EINVAL)?;
            // SAFETY: `data` outlives the call.
            sys::check_ssize(unsafe { libc::pwrite(fd, data.as_ptr().cast(), data.len(), offset) }).map_err(errno)
        });
        match result {
            Ok(written) => reply.written(u32::try_from(written).unwrap_or(u32::MAX)),
            Err(error) => reply.error(error),
        }
    }

    fn flush(&self, _req: &Request, _ino: INodeNo, _fh: FileHandle, _lock_owner: LockOwner, reply: ReplyEmpty) {
        reply.ok();
    }

    fn release(
        &self,
        _req: &Request,
        _ino: INodeNo,
        fh: FileHandle,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        _flush: bool,
        reply: ReplyEmpty,
    ) {
        self.handles().remove(&fh.0);
        reply.ok();
    }

    fn fsync(&self, _req: &Request, _ino: INodeNo, fh: FileHandle, datasync: bool, reply: ReplyEmpty) {
        let result = self.with_file(fh, |fd| {
            // SAFETY: plain call on a live descriptor.
            sys::check(unsafe { if datasync { libc::fdatasync(fd) } else { libc::fsync(fd) } })
                .map(|_| ())
                .map_err(errno)
        });
        match result {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error),
        }
    }

    fn opendir(&self, _req: &Request, ino: INodeNo, _flags: OpenFlags, reply: ReplyOpen) {
        match self.open_directory_handle(ino) {
            Ok(fh) => reply.opened(fh, FopenFlags::empty()),
            Err(error) => reply.error(error),
        }
    }

    fn readdir(&self, _req: &Request, _ino: INodeNo, fh: FileHandle, offset: u64, mut reply: ReplyDirectory) {
        let handles = self.handles();
        let Some(Handle::Directory { entries, .. }) = handles.get(&fh.0) else {
            return reply.error(Errno::EBADF);
        };
        let start = usize::try_from(offset).unwrap_or(usize::MAX);
        for (index, (name, ino, kind)) in entries.iter().enumerate().skip(start) {
            if reply.add(INodeNo(*ino), (index + 1) as u64, *kind, name) {
                break;
            }
        }
        reply.ok();
    }

    fn releasedir(&self, _req: &Request, _ino: INodeNo, fh: FileHandle, _flags: OpenFlags, reply: ReplyEmpty) {
        self.handles().remove(&fh.0);
        reply.ok();
    }

    fn fsyncdir(&self, req: &Request, ino: INodeNo, fh: FileHandle, datasync: bool, reply: ReplyEmpty) {
        self.fsync(req, ino, fh, datasync, reply);
    }

    fn statfs(&self, _req: &Request, _ino: INodeNo, reply: ReplyStatfs) {
        let mut status: libc::statvfs = unsafe { std::mem::zeroed() };
        // SAFETY: `status` outlives the call.
        match sys::check(unsafe { libc::fstatvfs(self.root.as_raw_fd(), &mut status) }) {
            Ok(_) => reply.statfs(
                status.f_blocks,
                status.f_bfree,
                status.f_bavail,
                status.f_files,
                status.f_ffree,
                u32::try_from(status.f_bsize).unwrap_or(4096),
                u32::try_from(status.f_namemax).unwrap_or(255),
                u32::try_from(status.f_frsize).unwrap_or(4096),
            ),
            Err(error) => reply.error(errno(error)),
        }
    }

    fn create(
        &self,
        _req: &Request,
        parent: INodeNo,
        name: &OsStr,
        mode: u32,
        umask: u32,
        flags: i32,
        reply: ReplyCreate,
    ) {
        match self.create_file(parent, name, mode, umask, flags) {
            Ok((attributes, fh)) => reply.created(&NO_CACHE, &attributes, Generation(0), fh, FopenFlags::empty()),
            Err(error) => reply.error(error),
        }
    }

    fn fallocate(
        &self,
        _req: &Request,
        _ino: INodeNo,
        fh: FileHandle,
        offset: u64,
        length: u64,
        mode: i32,
        reply: ReplyEmpty,
    ) {
        let result = self.with_file(fh, |fd| {
            let offset = libc::off_t::try_from(offset).map_err(|_| Errno::EINVAL)?;
            let length = libc::off_t::try_from(length).map_err(|_| Errno::EINVAL)?;
            // SAFETY: plain call on a live descriptor.
            sys::check(unsafe { libc::fallocate(fd, mode, offset, length) }).map(|_| ()).map_err(errno)
        });
        match result {
            Ok(()) => reply.ok(),
            Err(error) => reply.error(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renames_carry_descendants_and_drop_the_replaced_name() {
        let mut nodes = Nodes::new();
        let hooks = nodes.remember(PathBuf::from("refs"));
        let head = nodes.remember(PathBuf::from("refs/heads"));
        let old = nodes.remember(PathBuf::from("packed"));
        nodes.rename(Path::new("refs"), Path::new("packed"));
        assert_eq!(nodes.path(hooks).unwrap(), PathBuf::from("packed"));
        assert_eq!(nodes.path(head).unwrap(), PathBuf::from("packed/heads"));
        assert_eq!(nodes.path(old), Err(Errno::ENOENT));
    }

    #[test]
    fn forgotten_numbers_are_never_reused() {
        let mut nodes = Nodes::new();
        let first = nodes.remember(PathBuf::from("index"));
        nodes.forget(first, 1);
        let second = nodes.remember(PathBuf::from("index"));
        assert_ne!(first, second);
        assert_eq!(nodes.path(first), Err(Errno::ENOENT));
    }

    #[test]
    fn exchange_swaps_names() {
        let mut nodes = Nodes::new();
        let left = nodes.remember(PathBuf::from("a"));
        let right = nodes.remember(PathBuf::from("b"));
        nodes.exchange(Path::new("a"), Path::new("b"));
        assert_eq!(nodes.path(left).unwrap(), PathBuf::from("b"));
        assert_eq!(nodes.path(right).unwrap(), PathBuf::from("a"));
    }

    #[test]
    fn write_access_covers_truncation_and_append() {
        assert!(!write_access(libc::O_RDONLY));
        assert!(write_access(libc::O_WRONLY));
        assert!(write_access(libc::O_RDWR));
        assert!(write_access(libc::O_RDONLY | libc::O_TRUNC));
        assert!(write_access(libc::O_RDONLY | libc::O_APPEND));
    }
}
