//! `launch`: the host-facing side of the framed protocol (README "Launch protocol").
//!
//! Order matters and is the point of this module: validate, journal and fsync, grant, start the runner
//! suspended inside a kill-on-close job, connect, `ready`, wait for `start`, relay, and at the end confirm
//! the job is empty and every descriptor is restored before `exit`. Anything unconfirmed is
//! `cleanup-failed`, and the journal stays for `restore`.

use std::cell::Cell;
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use windows_sys::Win32::Foundation::GetLastError;
use windows_sys::Win32::System::Console::{GetStdHandle, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE};
use windows_sys::Win32::System::Diagnostics::Debug::{SEM_FAILCRITICALERRORS, SEM_NOGPFAULTERRORBOX, SetErrorMode};
use windows_sys::Win32::System::Threading::{
    CREATE_NO_WINDOW, CREATE_SUSPENDED, CREATE_UNICODE_ENVIRONMENT, CreateProcessWithLogonW, GetCurrentProcessId,
    LOGON_WITH_PROFILE, PROCESS_INFORMATION, ResumeThread, STARTF_FORCEOFFFEEDBACK, STARTUPINFOW, WaitForSingleObject,
};

use super::acl;
use super::desktop::{PrivateDesktop, current_station_name};
use super::exclusive;
use super::executable::pin;
use super::job::Job;
use super::ledger;
use super::lowbox::derive_package_sid;
use super::pipe::{self, HandleIo};
use super::profile;
use super::restore::restore_journal;
use super::setup::{fence, load_password, load_record, volume_roots_granted};
use super::sid::{Sid, current_user};
use super::util::{
    Error, Owned, Result, clear_ctrl_c_ignore, program_files, random_u32s, system_root, wide, wipe, wipe_wide,
};
use crate::appcontainer::package_name;
use crate::cmdline::{capability_sid, quote_arg};
use crate::frame::{self, Frame, read_frame, write_frame};
use crate::install::{InstallRecord, firewall_off_message};
use crate::journal::{self, Entry, Header, JOURNAL_VERSION, JournalWriter};
use crate::overlap::{dacl_part, key, names_explicitly, overlaps};
use crate::paths::is_within;
use crate::protocol::{CleanupFailed, Exit, Ready, Refused, RunnerError, RunnerSpec};
use crate::spec::{self, ExecutableRoots, ValidSpec, format_digest};
use crate::tree::{self, Sample};

const RUNNER_EXIT_TIMEOUT: Duration = Duration::from_secs(10);
const JOB_EMPTY_TIMEOUT: Duration = Duration::from_secs(10);

type Sink = Arc<Mutex<HandleIo>>;

fn send(sink: &Sink, frame: &Frame) {
    if let Ok(mut out) = sink.lock() {
        let _ = write_frame(&mut *out, frame);
    }
}

fn refuse(sink: &Sink, refused: &Refused) -> i32 {
    send(sink, &Frame::json(frame::REFUSED, refused));
    0
}

pub fn run() -> i32 {
    let stdin = HandleIo(unsafe { GetStdHandle(STD_INPUT_HANDLE) });
    let sink: Sink = Arc::new(Mutex::new(HandleIo(unsafe { GetStdHandle(STD_OUTPUT_HANDLE) })));
    let mut stdin = stdin;
    let first = match read_frame(&mut stdin) {
        Ok(Some(frame)) if frame.kind == frame::SPEC => frame,
        Ok(None) => return 0,
        Ok(Some(_)) => {
            return refuse(
                &sink,
                &Refused::unsupported(spec::requirement::SPEC, "the first frame must be the launch spec"),
            );
        }
        Err(err) => {
            eprintln!("tau-windows-sandbox launch: {err}");
            return 2;
        }
    };
    let roots =
        match program_files().and_then(|pf| Ok(ExecutableRoots { program_files: pf, system_root: system_root()? })) {
            Ok(roots) => roots,
            Err(err) => {
                return refuse(
                    &sink,
                    &Refused::unavailable("the system folders could not be resolved", Some(err.to_string())),
                );
            }
        };
    let valid = match spec::parse(&first.payload).and_then(|parsed| spec::validate(parsed, &roots)) {
        Ok(valid) => valid,
        Err(refused) => return refuse(&sink, &refused),
    };
    let record = match load_record() {
        Ok(Some(record)) => record,
        Ok(None) => return refuse(&sink, &Refused::unavailable("the Windows shell sandbox is not set up", None)),
        Err(err) => {
            return refuse(
                &sink,
                &Refused::unavailable("the sandbox install record is unreadable", Some(err.to_string())),
            );
        }
    };
    if let Err(refused) = check_runner(&record) {
        return refuse(&sink, &refused);
    }
    // The network fence must hold before anything changes: no ACL, journal or desktop exists yet.
    if let Err(refused) = check_fence(&record) {
        return refuse(&sink, &refused);
    }
    // A digest is checked on a handle held until the launch ends, before anything changes: nobody can then
    // write, delete or rename the file `CreateProcessAsUserW` maps by name (`executable.rs`).
    let pinned = match &valid.executable_digest {
        Some(digest) => match pin(&valid.executable, digest) {
            Ok(pinned) => Some(pinned),
            Err(refused) => return refuse(&sink, &refused),
        },
        None => None,
    };
    let session = match Session::prepare(valid, &record) {
        Ok(session) => session,
        Err(refused) => return refuse(&sink, &refused),
    };
    let code = session.run(stdin, sink);
    drop(pinned);
    code
}

/// The runner `TauSandbox` executes is the copy `setup` installed; it must be this very binary, or the
/// install is stale and needs `setup` again.
fn check_runner(record: &InstallRecord) -> std::result::Result<(), Refused> {
    let stale = |diagnostic: String| {
        Refused::unavailable("the sandbox runner needs repair (run setup again)", Some(diagnostic))
    };
    let installed = std::fs::read(&record.runner).map_err(|err| stale(format!("{}: {err}", record.runner)))?;
    let current = std::env::current_exe().and_then(std::fs::read).map_err(|err| stale(err.to_string()))?;
    if installed != current {
        return Err(stale("the installed runner differs from this helper".to_owned()));
    }
    Ok(())
}

/// Refuse while Windows Firewall is off for any current profile, or while any firewall rule or WFP filter
/// is missing or would not apply.
fn check_fence(record: &InstallRecord) -> std::result::Result<(), Refused> {
    let fence = fence(Some(record))
        .map_err(|err| Refused::unavailable("the sandbox network fence cannot be confirmed", Some(err.to_string())))?;
    if !fence.firewall_enabled() {
        return Err(Refused::unavailable(firewall_off_message(&fence.off_profiles), None));
    }
    if !fence.rules_present() {
        return Err(Refused::unavailable(
            "the sandbox network rules are missing or disabled (run setup again)",
            Some(fence.problems.join("; ")),
        ));
    }
    Ok(())
}

struct Session {
    valid: ValidSpec,
    record: InstallRecord,
    account: Sid,
    /// The sandbox group, which every denial names (`acl::Grantees`).
    group: Sid,
    capability: Sid,
    package: Sid,
    person: Sid,
    journal_path: String,
    capability_sid: String,
    package_sid: String,
    package_name: String,
    /// The granted and denied paths that exist, in application order, and the directories among them.
    roots: Vec<String>,
    directories: Vec<String>,
    /// The window station the private desktop is created on. The launch never changes it (`desktop.rs`).
    station_name: String,
    /// Whether this launch wrote its journal: only then does its teardown restore one.
    journaled: Cell<bool>,
    /// Marks the launch live for `restore` (`exclusive.rs`) until the launcher exits.
    _live: exclusive::Live,
}

impl Session {
    fn prepare(valid: ValidSpec, record: &InstallRecord) -> std::result::Result<Self, Refused> {
        let unavailable = |what: &str| {
            let what = what.to_owned();
            move |err: Error| Refused::unavailable(what.clone(), Some(err.to_string()))
        };
        let account = Sid::parse(&record.account_sid).map_err(unavailable("the sandbox account SID is invalid"))?;
        let group = Sid::parse(&record.group_sid).map_err(unavailable("the sandbox group SID is invalid"))?;
        if Sid::lookup(&record.account).map_err(unavailable("the sandbox account cannot be resolved"))?.as_ref()
            != Some(&account)
        {
            return Err(Refused::unavailable("the sandbox account is missing (run setup again)", None));
        }
        if !profile::present(&account) {
            return Err(Refused::unavailable("the sandbox account has no profile (run setup again)", None));
        }
        // The shell's one capability must be granted on the system drive's root, or PowerShell cannot resolve
        // `C:\` (`volume.rs`).
        if !volume_roots_granted(record) {
            return Err(Refused::unavailable(
                "the sandbox's volume capability is not granted on the volume roots (run setup again)",
                None,
            ));
        }
        let capability_text =
            capability_sid(random_u32s::<4>().map_err(unavailable("no randomness for the capability SID"))?);
        let capability = Sid::parse(&capability_text).map_err(unavailable("the capability SID is invalid"))?;
        // A fresh AppContainer per launch: nothing granted to one launch's package reaches another's.
        let package_label = package_name(random_u32s::<4>().map_err(unavailable("no randomness for the package"))?);
        let package =
            derive_package_sid(&package_label).map_err(unavailable("the AppContainer SID cannot be derived"))?;
        let package_text = package.to_sddl();
        eprintln!("tau-windows-sandbox launch: AppContainer {package_label} is {package_text}");
        let person = current_user().map_err(unavailable("the current user cannot be resolved"))?;
        let station_name = current_station_name().map_err(unavailable("the window station cannot be named"))?;
        // Classify every root; nothing has been changed yet. Snapshots come once the runner is ready.
        let mut roots: Vec<String> = Vec::new();
        let mut directories: Vec<String> = Vec::new();
        for (path, _) in &valid.grants {
            if roots.iter().any(|root| root.eq_ignore_ascii_case(path)) {
                continue;
            }
            match root_kind(path) {
                Ok(RootKind::Missing) => {
                    eprintln!("tau-windows-sandbox launch: {path} does not exist; no ACL change");
                    continue;
                }
                Ok(RootKind::Link) => {
                    return Err(Refused::unsupported(
                        spec::requirement::ABSOLUTE_PATHS,
                        format!("{path:?} is a link or junction; granted and denied paths must be resolved"),
                    ));
                }
                Ok(RootKind::Directory) => directories.push(path.clone()),
                Ok(RootKind::File) => {}
                Err(err) => return Err(Refused::unavailable("a path could not be read", Some(err.to_string()))),
            }
            roots.push(path.clone());
        }
        let live = exclusive::live(&package_label).map_err(unavailable("the launch cannot be marked live"))?;
        let journal_path = valid.journal.clone();
        Ok(Self {
            valid,
            record: record.clone(),
            account,
            group,
            capability,
            package,
            person,
            journal_path,
            capability_sid: capability_text,
            package_sid: package_text,
            package_name: package_label,
            roots,
            directories,
            station_name,
            journaled: Cell::new(false),
            _live: live,
        })
    }

    /// Journal and grant, under the person's descriptor lock: read the other unrestored journals, refuse a launch
    /// that would expose one of them (or the ledger) to its shell or put its own journal in reach of another's,
    /// journal every object with its original descriptor (another journal's entry where one covers it), register
    /// the journal, then add this launch's ACEs.
    fn grant(&self) -> std::result::Result<(), Refused> {
        let unavailable = |what: &str, err: String| Refused::unavailable(what.to_owned(), Some(err));
        // Another launch editing descriptors past the wait: the same machine-readable answer as before concurrency.
        let _lock = exclusive::descriptors()
            .map_err(|err| Refused::busy(spec::requirement::EXCLUSIVE_LAUNCH, err.to_string()))?;
        let ledger_dir = ledger::directory()
            .map_err(|err| unavailable("the ledger of launches cannot be found", err.to_string()))?;
        let granted: Vec<String> = self.valid.grants.iter().map(|(path, _)| path.clone()).collect();
        let exposed = |target: &str| granted.iter().find(|path| is_within(target, path)).cloned();
        if let Some(path) = exposed(&ledger_dir) {
            return Err(Refused::unavailable(
                format!("{path:?} holds the sandbox's ledger of launches, which no launch may be granted"),
                None,
            ));
        }
        let others = ledger::others(&self.package_name)
            .map_err(|err| unavailable("the ledger of launches cannot be read", err.to_string()))?;
        let mut originals: HashMap<String, Entry> = HashMap::new();
        for other in &others {
            if let Some(path) = exposed(&other.journal) {
                return Err(Refused::unavailable(
                    format!(
                        "{path:?} holds another running or unrestored launch's journal, which this launch may not be granted"
                    ),
                    None,
                ));
            }
            let journal = Path::new(&other.journal);
            let summary = journal::read_summary(journal).map_err(|err| {
                unavailable("another launch's journal cannot be read", format!("{}: {err}", other.journal))
            })?;
            if !summary.complete {
                continue;
            }
            let theirs: Vec<String> = summary.roots.iter().map(|root| root.path.clone()).collect();
            // Only a grant would put this journal in reach of the other launch's shell. A denial over it keeps that
            // shell out (as a launch's own denial over its own journal does, W10), and the other launch's restore
            // only removes the ACEs it inherited there.
            if summary.roots.iter().any(|root| root.account && is_within(&self.journal_path, &root.path)) {
                return Err(Refused::unavailable(
                    "this launch's journal lies inside a path another running or unrestored launch grants".to_owned(),
                    None,
                ));
            }
            if !overlaps(&theirs, &self.roots) {
                continue;
            }
            let mut keep = |entry: Entry| {
                if self.roots.iter().any(|root| is_within(&entry.path, root)) {
                    originals.entry(key(&entry.path)).or_insert(entry);
                }
            };
            for root in summary.roots {
                keep(root);
            }
            journal::for_each_child(journal, keep).map_err(|err| {
                unavailable("another launch's journal cannot be read", format!("{}: {err}", other.journal))
            })?;
        }
        let granted_as = |path: &str, test: fn(spec::Access) -> bool| {
            self.valid.grants.iter().any(|(granted, access)| granted.eq_ignore_ascii_case(path) && test(*access))
        };
        // The original of an object another journal covers is that journal's entry, when it is the same object.
        let original = |mut entry: Entry| {
            if let Some(theirs) = originals.get(&key(&entry.path))
                && theirs.file_id == entry.file_id
            {
                entry.sddl = theirs.sddl.clone();
            }
            entry
        };
        let account = self.account.to_sddl();
        let group = self.group.to_sddl();
        let mut roots = Vec::new();
        for path in &self.roots {
            match acl::snapshot(path) {
                Ok(Some(entry)) => {
                    let entry = Entry {
                        labeled: granted_as(path, acl::needs_low_label),
                        account: granted_as(path, acl::names_account),
                        group: granted_as(path, acl::names_group),
                        ..original(entry)
                    };
                    // The last launch out removes every ACE naming the shared account (or, for a denial, the
                    // shared group) from a root itself; one the person (or a lost journal) set there before any
                    // launch would go with them. An inherited one comes from above and is inherited again.
                    let shared: Vec<String> = [(entry.account, &account), (entry.group, &group)]
                        .into_iter()
                        .filter(|(named, _)| *named)
                        .map(|(_, sid)| sid.clone())
                        .collect();
                    if !shared.is_empty() && dacl_part(&entry.sddl).is_some_and(|dacl| names_explicitly(dacl, &shared))
                    {
                        return Err(Refused::unavailable(
                            format!(
                                "{path:?} already names the sandbox account or group in its permissions; remove that \
                                 entry (or restore the launch that left it) first"
                            ),
                            None,
                        ));
                    }
                    roots.push(entry);
                }
                Ok(None) => eprintln!("tau-windows-sandbox launch: {path} does not exist; no ACL change"),
                Err(err) => return Err(unavailable("a path's ACL could not be read", err.to_string())),
            }
        }
        let header = Header {
            version: JOURNAL_VERSION,
            capability_sid: self.capability_sid.clone(),
            account_sid: account,
            group_sid: group,
            package_sid: self.package_sid.clone(),
            package_name: self.package_name.clone(),
            launcher_pid: unsafe { GetCurrentProcessId() },
        };
        write_journal(Path::new(&self.journal_path), &header, &roots, &self.directories, &original)?;
        self.journaled.set(true);
        ledger::register(&self.package_name, &self.journal_path)
            .map_err(|err| unavailable("the ledger of launches cannot be written", err.to_string()))?;
        self.apply_grants().map_err(|err| unavailable("the folder permissions could not be granted", err.to_string()))
    }

    /// Undo everything this launch changed. `Ok` only when the job (if any) is empty and every descriptor
    /// is confirmed restored; the journal is deleted only then.
    fn teardown(&self, job: Option<&Job>) -> std::result::Result<(), String> {
        let mut failures = Vec::new();
        if let Some(job) = job {
            match job.kill_and_wait(JOB_EMPTY_TIMEOUT) {
                Ok(true) => {}
                Ok(false) => failures.push("the sandbox job still has live processes".to_owned()),
                Err(err) => failures.push(format!("the sandbox job could not be checked: {err}")),
            }
        }
        if self.journaled.get() {
            match exclusive::descriptors() {
                Ok(_lock) => {
                    let restored = restore_journal(Path::new(&self.journal_path));
                    if restored.is_empty() {
                        if let Err(err) = std::fs::remove_file(&self.journal_path)
                            && err.kind() != ErrorKind::NotFound
                        {
                            failures.push(format!("the journal could not be deleted: {err}"));
                        } else if let Err(err) = ledger::unregister(&self.package_name) {
                            failures.push(format!("the ledger could not be updated: {err}"));
                        }
                    }
                    failures.extend(restored);
                }
                Err(err) => failures.push(err.to_string()),
            }
        }
        if failures.is_empty() { Ok(()) } else { Err(failures.join("; ")) }
    }

    fn apply_grants(&self) -> Result<()> {
        let grantees = acl::Grantees {
            account: self.account.clone(),
            group: self.group.clone(),
            capability: self.capability.clone(),
            package: self.package.clone(),
        };
        for (path, access) in &self.valid.grants {
            if !self.roots.iter().any(|root| root.eq_ignore_ascii_case(path)) {
                continue;
            }
            acl::apply(path, &acl::aces_for(*access, &grantees), acl::needs_low_label(*access))?;
        }
        Ok(())
    }

    /// Who joins the launch's own private desktop besides the person: the sandbox account, the launch's
    /// capability SID (the restricted pass) and its package SID (the AppContainer pass).
    fn participants(&self) -> [&Sid; 3] {
        [&self.account, &self.capability, &self.package]
    }

    fn run(self, stdin: HandleIo, sink: Sink) -> i32 {
        let started = self.start_runner();
        let (desktop, job, runner, to_runner, from_runner) = match started {
            Ok(parts) => parts,
            Err((job, err)) => {
                let cleanup = self.teardown(job.as_ref());
                return self.finish_refused(
                    &sink,
                    Refused::unavailable("the sandbox could not be started", Some(err.to_string())),
                    cleanup,
                );
            }
        };
        let job = Arc::new(job);
        let to_runner = Arc::new(Mutex::new(HandleIo(to_runner.raw())));
        let mut from_runner_io = HandleIo(from_runner.raw());

        // The runner's first frame other than a log line: ready, or why not.
        let first = loop {
            match read_frame(&mut from_runner_io) {
                Ok(Some(frame)) if frame.kind == frame::RUNNER_LOG => {
                    eprintln!("tau-windows-sandbox runner: {}", String::from_utf8_lossy(&frame.payload));
                }
                other => break other,
            }
        };
        match first {
            Ok(Some(frame)) if frame.kind == frame::READY => {}
            other => {
                let diagnostic = match other {
                    Ok(Some(frame)) if frame.kind == frame::RUNNER_ERROR => runner_error_text(&frame.payload),
                    Ok(_) => "the runner ended before it was ready".to_owned(),
                    Err(err) => err.to_string(),
                };
                drop(desktop);
                let cleanup = self.teardown(Some(&job));
                return self.finish_refused(
                    &sink,
                    Refused::unavailable("the sandbox runner failed", Some(diagnostic)),
                    cleanup,
                );
            }
        };
        // Journal and grant once the runner is up, so a runner that fails costs no descriptor edit.
        if let Err(refused) = self.grant() {
            drop(desktop);
            let cleanup = self.teardown(Some(&job));
            return self.finish_refused(&sink, refused, cleanup);
        }
        let ready = Ready {
            launcher_pid: unsafe { GetCurrentProcessId() },
            runner_pid: runner.pid,
            capability_sid: self.capability_sid.clone(),
            journal: self.journal_path.clone(),
        };
        send(&sink, &Frame::json(frame::READY, &ready));

        let killed = Arc::new(AtomicBool::new(false));
        host_reader(stdin, to_runner.clone(), job.clone(), killed.clone(), self.valid.stdio.clone());

        // Relay until the runner's pipe closes.
        let mut exit: Option<Exit> = None;
        let mut runner_error: Option<String> = None;
        let mut shell_started = false;
        while let Ok(Some(frame)) = read_frame(&mut from_runner_io) {
            match frame.kind {
                frame::STDOUT | frame::STDERR | frame::OUTPUT => send(&sink, &frame),
                frame::STARTED => {
                    shell_started = true;
                    send(&sink, &frame);
                }
                frame::EXIT => exit = serde_json::from_slice(&frame.payload).ok(),
                frame::RUNNER_ERROR => runner_error = Some(runner_error_text(&frame.payload)),
                frame::RUNNER_LOG => {
                    eprintln!("tau-windows-sandbox runner: {}", String::from_utf8_lossy(&frame.payload))
                }
                _ => {}
            }
        }
        unsafe { WaitForSingleObject(runner.process.raw(), RUNNER_EXIT_TIMEOUT.as_millis() as u32) };
        drop(desktop);
        let cleanup = self.teardown(Some(&job));
        if !shell_started && !killed.load(Ordering::SeqCst) {
            let diagnostic = runner_error.unwrap_or_else(|| "the runner ended before the shell started".to_owned());
            return self.finish_refused(
                &sink,
                Refused::unavailable("the shell could not be started", Some(diagnostic)),
                cleanup,
            );
        }
        match cleanup {
            Ok(()) => {
                // A job kill (terminate, closed stdin) takes the runner down before it can report a code.
                let exit = exit.unwrap_or_else(Exit::killed);
                send(&sink, &Frame::json(frame::EXIT, &exit));
            }
            Err(message) => send(&sink, &Frame::json(frame::CLEANUP_FAILED, &CleanupFailed { message })),
        }
        0
    }

    fn finish_refused(&self, sink: &Sink, refused: Refused, cleanup: std::result::Result<(), String>) -> i32 {
        match cleanup {
            Ok(()) => refuse(sink, &refused),
            Err(message) => {
                send(sink, &Frame::json(frame::CLEANUP_FAILED, &CleanupFailed { message }));
                0
            }
        }
    }

    #[allow(clippy::type_complexity)]
    fn start_runner(&self) -> std::result::Result<(PrivateDesktop, Job, Runner, Owned, Owned), (Option<Job>, Error)> {
        let desktop = PrivateDesktop::create(&self.station_name, &self.person, &self.participants())
            .map_err(|err| (None, err))?;
        let names = pipe::pipe_names().map_err(|err| (None, err))?;
        let to_runner =
            pipe::create_server(&names.to_runner, true, &self.person, &self.account).map_err(|err| (None, err))?;
        let from_runner =
            pipe::create_server(&names.from_runner, false, &self.person, &self.account).map_err(|err| (None, err))?;
        let job = Job::kill_on_close().map_err(|err| (None, err))?;
        let runner = match spawn_runner(&self.record, &names) {
            Ok(runner) => runner,
            Err(err) => return Err((Some(job), err)),
        };
        if let Err(err) = job.assign(runner.process.raw()) {
            unsafe { windows_sys::Win32::System::Threading::TerminateProcess(runner.process.raw(), 1) };
            return Err((Some(job), err));
        }
        if unsafe { ResumeThread(runner.thread.raw()) } == u32::MAX {
            return Err((Some(job), Error::last("ResumeThread")));
        }
        if let Err(err) = pipe::accept(&to_runner, &names.to_runner, runner.pid)
            .and_then(|()| pipe::accept(&from_runner, &names.from_runner, runner.pid))
        {
            return Err((Some(job), err));
        }
        let runner_spec = RunnerSpec {
            capability_sid: self.capability_sid.clone(),
            package_sid: self.package_sid.clone(),
            package_name: self.package_name.clone(),
            person_sid: self.person.to_sddl(),
            desktop: desktop.startup_name.clone(),
            executable: self.valid.executable.clone(),
            executable_digest: self.valid.executable_digest.as_ref().map(format_digest),
            arguments: self.valid.arguments.clone(),
            working_directory: self.valid.working_directory.clone(),
            environment: with_system_root(&self.valid.environment),
            stdio: self.valid.stdio.clone(),
        };
        if let Err(err) = write_frame(&mut HandleIo(to_runner.raw()), &Frame::json(frame::SPEC, &runner_spec)) {
            return Err((Some(job), err.into()));
        }
        Ok((desktop, job, runner, to_runner, from_runner))
    }
}

enum RootKind {
    Missing,
    File,
    Directory,
    /// A junction, symbolic link or other reparse point: the named ACL calls would act on its target while
    /// the journal records the link itself, so it is refused.
    Link,
}

fn root_kind(path: &str) -> std::io::Result<RootKind> {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(RootKind::Missing),
        Err(err) => return Err(err),
    };
    Ok(if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        RootKind::Link
    } else if metadata.is_dir() {
        RootKind::Directory
    } else {
        RootKind::File
    })
}

/// Write and fsync the whole journal: the header, every root, then every object under each directory
/// root, streamed as the walk finds it. A root nested in another is journaled once, under its own walk.
/// On failure the partial journal is removed (nothing has changed yet) and the launch is refused.
fn write_journal(
    path: &Path,
    header: &Header,
    roots: &[Entry],
    directories: &[String],
    original: &dyn Fn(Entry) -> Entry,
) -> std::result::Result<(), Refused> {
    let mut writer = match JournalWriter::create(path, header) {
        Ok(writer) => writer,
        Err(err) => {
            let message = if err.kind() == ErrorKind::AlreadyExists {
                "a previous launch's ACL journal is still present; run restore first"
            } else {
                "the ACL journal could not be written"
            };
            return Err(Refused::unavailable(message, Some(err.to_string())));
        }
    };
    let mut skipped = Sample::default();
    let mut unreadable = Sample::default();
    let written = (|| -> std::io::Result<()> {
        for root in roots {
            writer.root(root.clone())?;
        }
        for directory in directories {
            // Another journaled root nested in this one, or the journal itself, which lies inside a denied root when
            // the host keeps its journals in denied app data: it is being written and is deleted at teardown.
            let other_root = |candidate: &Path| {
                let candidate = candidate.to_string_lossy();
                candidate.eq_ignore_ascii_case(&path.to_string_lossy())
                    || roots.iter().any(|root| {
                        root.path != *directory
                            && is_within(&candidate, &root.path)
                            && is_within(&root.path, &candidate)
                    })
            };
            tree::walk(
                Path::new(directory),
                other_root,
                |child| {
                    let child = child.to_string_lossy();
                    match acl::snapshot(&child) {
                        Ok(Some(entry)) => writer.child(original(entry)),
                        Ok(None) => Ok(()),
                        // An object the person cannot read is one ACL propagation cannot change either.
                        Err(err) => {
                            unreadable.note(format!("{child}: {err}"));
                            Ok(())
                        }
                    }
                },
                &mut skipped,
            )?;
        }
        Ok(())
    })();
    let finished = written.and_then(|()| writer.finish());
    for (sample, what) in
        [(&skipped, "director(ies) could not be listed"), (&unreadable, "object(s) could not be read")]
    {
        if !sample.is_empty() {
            eprintln!(
                "tau-windows-sandbox launch: {} {what} under the granted paths and were not journaled: {}",
                sample.count,
                sample.messages().join("; ")
            );
        }
    }
    if let Err(err) = finished {
        let _ = std::fs::remove_file(path);
        return Err(Refused::unavailable("the ACL journal could not be written", Some(err.to_string())));
    }
    Ok(())
}

/// PowerShell and most Win32 code need `SystemRoot`; supply it only when the host left it out.
fn with_system_root(environment: &BTreeMap<String, String>) -> BTreeMap<String, String> {
    let mut environment = environment.clone();
    if !environment.keys().any(|k| k.eq_ignore_ascii_case("SystemRoot"))
        && let Ok(root) = system_root()
    {
        environment.insert("SystemRoot".to_owned(), root);
    }
    environment
}

/// The runner's error as `<stage>: <message>`, also written to the diagnostic log so the host sees it
/// whatever the launch then reports.
fn runner_error_text(payload: &[u8]) -> String {
    let text = serde_json::from_slice::<RunnerError>(payload)
        .map(|e| format!("{}: {}", e.stage, e.message))
        .unwrap_or_else(|_| "the runner reported an unreadable error".to_owned());
    eprintln!("tau-windows-sandbox runner error: {text}");
    text
}

struct Runner {
    process: Owned,
    thread: Owned,
    pid: u32,
}

/// Start the installed runner as the sandbox account, suspended, with its profile loaded, so the shell's
/// `HKCU` is the account's own hive (`profile.rs`).
fn spawn_runner(record: &InstallRecord, names: &pipe::PipeNames) -> Result<Runner> {
    let application = wide(&record.runner);
    let mut command = wide(&format!(
        "{} runner --pipe-in {} --pipe-out {} --launcher-pid {}",
        quote_arg(&record.runner),
        quote_arg(&names.to_runner),
        quote_arg(&names.from_runner),
        unsafe { GetCurrentProcessId() }
    ));
    let user = wide(&record.account);
    let domain = wide(".");
    let cwd = wide(&system_root()?);
    let mut secret = load_password()?;
    let mut password: Vec<u16> = String::from_utf8_lossy(&secret).encode_utf16().chain(std::iter::once(0)).collect();
    wipe(&mut secret);

    // The runner, and through it the shell, copies this process's "ignore Ctrl-C" flag; whatever started
    // the launcher may have set it (Node, a process-group parent). Clear it here as well as in the runner.
    eprintln!("tau-windows-sandbox launch: {}", clear_ctrl_c_ignore());
    let mut startup: STARTUPINFOW = unsafe { std::mem::zeroed() };
    startup.cb = size_of::<STARTUPINFOW>() as u32;
    startup.dwFlags = STARTF_FORCEOFFFEEDBACK;
    let mut info: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };
    let previous = unsafe { SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX) };
    let ok = unsafe {
        CreateProcessWithLogonW(
            user.as_ptr(),
            domain.as_ptr(),
            password.as_ptr(),
            LOGON_WITH_PROFILE,
            application.as_ptr(),
            command.as_mut_ptr(),
            CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT | CREATE_SUSPENDED,
            std::ptr::null(),
            cwd.as_ptr(),
            &startup,
            &mut info,
        )
    };
    let code = if ok == 0 { Some(unsafe { GetLastError() }) } else { None };
    unsafe { SetErrorMode(previous) };
    wipe_wide(&mut password);
    if let Some(code) = code {
        return Err(Error::code("CreateProcessWithLogonW", code));
    }
    Ok(Runner { process: Owned(info.hProcess), thread: Owned(info.hThread), pid: info.dwProcessId })
}

/// Forward host frames to the runner: `input` for a terminal or for pipes that take input, `close-input` for
/// the latter, `resize` for a terminal. `terminate` or a closed stdin kills the whole job.
fn host_reader(mut stdin: HandleIo, to_runner: Sink, job: Arc<Job>, killed: Arc<AtomicBool>, stdio: spec::Stdio) {
    std::thread::spawn(move || {
        let terminal = matches!(stdio, spec::Stdio::Terminal { .. });
        while let Ok(Some(frame)) = read_frame(&mut stdin) {
            match frame.kind {
                frame::START => send(&to_runner, &frame),
                frame::INPUT if stdio.takes_input() => send(&to_runner, &frame),
                frame::CLOSE_INPUT if stdio.closes_input() => send(&to_runner, &frame),
                frame::RESIZE if terminal => send(&to_runner, &frame),
                frame::TERMINATE => break,
                _ => {}
            }
        }
        killed.store(true, Ordering::SeqCst);
        let _ = job.terminate();
    });
}
