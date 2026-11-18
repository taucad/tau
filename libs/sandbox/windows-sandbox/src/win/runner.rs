//! `runner`: started by `launch` as `TauSandbox` (`CreateProcessWithLogonW`, with its profile). It is not itself
//! restricted. It mints the write-restricted token from its own logon, prepares the job and stdio, reports
//! `ready`, and on `start` spawns the shell suspended with `CreateProcessAsUserW` and the launch's package as
//! `PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES`, so Windows derives the AppContainer token and its namespace
//! (`lowbox.rs`). It then reads the shell's own token back, refuses anything but this launch's bare
//! AppContainer, sets the token's default DACL, lets the person query the shell from outside, checks that the
//! token can read its `HKCU` (`profile.rs`), logs what the token can reach, and only then resumes the shell
//! (spike `token-runner.cs`, Codex `token.rs`, `process.rs`, `conpty/`).

use std::ffi::c_void;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use windows_sys::Win32::Foundation::{
    GENERIC_READ, GetLastError, HANDLE, HANDLE_FLAG_INHERIT, INVALID_HANDLE_VALUE, LUID, SetHandleInformation,
    WAIT_OBJECT_0,
};
use windows_sys::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows_sys::Win32::Security::{
    ACL, AdjustTokenPrivileges, CreateRestrictedToken, DISABLE_MAX_PRIVILEGE, GetSecurityDescriptorDacl, LUA_TOKEN,
    LUID_AND_ATTRIBUTES, LookupPrivilegeValueW, PSECURITY_DESCRIPTOR, SE_PRIVILEGE_ENABLED, SECURITY_ATTRIBUTES,
    SID_AND_ATTRIBUTES, SetTokenInformation, TOKEN_ADJUST_DEFAULT, TOKEN_ADJUST_PRIVILEGES, TOKEN_ADJUST_SESSIONID,
    TOKEN_ASSIGN_PRIMARY, TOKEN_DEFAULT_DACL, TOKEN_DUPLICATE, TOKEN_PRIVILEGES, TOKEN_QUERY, TokenDefaultDacl,
    WRITE_RESTRICTED,
};
use windows_sys::Win32::Storage::FileSystem::{CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING};
use windows_sys::Win32::Storage::FileSystem::{READ_CONTROL, WRITE_DAC};
use windows_sys::Win32::System::Console::{COORD, ClosePseudoConsole, CreatePseudoConsole, HPCON, ResizePseudoConsole};
use windows_sys::Win32::System::Diagnostics::Debug::{SEM_FAILCRITICALERRORS, SEM_NOGPFAULTERRORBOX, SetErrorMode};
use windows_sys::Win32::System::Pipes::CreatePipe;
use windows_sys::Win32::System::Threading::{
    CREATE_SUSPENDED, CREATE_UNICODE_ENVIRONMENT, CreateProcessAsUserW, DeleteProcThreadAttributeList,
    EXTENDED_STARTUPINFO_PRESENT, GetExitCodeProcess, INFINITE, InitializeProcThreadAttributeList, OpenProcessToken,
    PROC_THREAD_ATTRIBUTE_HANDLE_LIST, PROC_THREAD_ATTRIBUTE_JOB_LIST, PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
    PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, PROCESS_INFORMATION, PROCESS_QUERY_LIMITED_INFORMATION, ResumeThread,
    STARTF_USESTDHANDLES, STARTUPINFOEXW, TerminateProcess, UpdateProcThreadAttribute, WaitForSingleObject,
};

use super::container::{self, Container};
use super::environment;
use super::job::Job;
use super::lowbox::{self, Capabilities, grant_kernel_object, token_facts};
use super::pipe::{self, HandleIo};
use super::profile;
use super::sid::{EVERYONE, Sid, current_user, open_process_token, token_logon_sid};
use super::util::{Error, Local, Owned, Result, check, clear_ctrl_c_ignore, program_files, system_root, wide};
use super::volume;
use crate::appcontainer::{is_package_sid, verify_token};
use crate::cmdline::{command_line, creation_environment, environment_block, is_capability_sid};
use crate::frame::{self, Frame, read_frame, write_frame};
use crate::protocol::{Exit, Resize, RunnerError, RunnerSpec, Started};
use crate::spec::{ExecutableRoots, Stdio, check_executable};

/// `DISABLE_MAX_PRIVILEGE | LUA_TOKEN | WRITE_RESTRICTED` (0x0D).
const TOKEN_FLAGS: u32 = DISABLE_MAX_PRIVILEGE | LUA_TOKEN | WRITE_RESTRICTED;
/// `CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT` (0x80400), plus `CREATE_SUSPENDED` so the
/// shell's token is checked before it runs: never `CREATE_NEW_PROCESS_GROUP`, which would stop Ctrl-C
/// reaching the foreground pipeline.
const SPAWN_FLAGS: u32 = CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT | CREATE_SUSPENDED;
/// `TOKEN_QUERY`, the only token right the person gets on the shell's token.
const PERSON_TOKEN_ACCESS: u32 = TOKEN_QUERY;
const REAP_TIMEOUT: Duration = Duration::from_secs(10);

type Sink = Arc<Mutex<HandleIo>>;

fn send(sink: &Sink, frame: &Frame) {
    if let Ok(mut out) = sink.lock() {
        let _ = write_frame(&mut *out, frame);
    }
}

struct Failure {
    stage: &'static str,
    error: Error,
}

trait Stage<T> {
    fn at(self, stage: &'static str) -> std::result::Result<T, Failure>;
}

impl<T> Stage<T> for Result<T> {
    fn at(self, stage: &'static str) -> std::result::Result<T, Failure> {
        self.map_err(|error| Failure { stage, error })
    }
}

/// The write-restricted token: restricting SIDs are the launch's capability SID, the runner's logon SID
/// and Everyone. Returns it with the logon SID.
fn mint_restricted(capability: &Sid) -> Result<(Owned, Sid)> {
    let own = open_process_token(
        TOKEN_DUPLICATE
            | TOKEN_ASSIGN_PRIMARY
            | TOKEN_QUERY
            | TOKEN_ADJUST_DEFAULT
            | TOKEN_ADJUST_SESSIONID
            | TOKEN_ADJUST_PRIVILEGES,
    )?;
    let logon = token_logon_sid(own.raw())?;
    let everyone = Sid::parse(EVERYONE)?;
    let restricting =
        [capability, &logon, &everyone].map(|sid| SID_AND_ATTRIBUTES { Sid: sid.as_psid(), Attributes: 0 });
    let mut token: HANDLE = std::ptr::null_mut();
    check(
        unsafe {
            CreateRestrictedToken(
                own.raw(),
                TOKEN_FLAGS,
                0,
                std::ptr::null(),
                0,
                std::ptr::null(),
                restricting.len() as u32,
                restricting.as_ptr(),
                &mut token,
            )
        },
        "CreateRestrictedToken",
    )?;
    Ok((Owned(token), logon))
}

/// The default DACL of the shell's token: the logon SID and the package all access and `OWNER RIGHTS`
/// read-control only, so what the shell creates without a descriptor passes all three of its own access-check
/// passes and nothing else's.
fn set_default_dacl(token: HANDLE, logon: &Sid, package: &Sid) -> Result<()> {
    let sddl = wide(&format!("D:(A;;GA;;;{})(A;;GA;;;{})(A;;RC;;;S-1-3-4)", logon.to_sddl(), package.to_sddl()));
    let mut sd: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
    check(
        unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl.as_ptr(),
                SDDL_REVISION_1,
                &mut sd,
                std::ptr::null_mut(),
            )
        },
        "ConvertStringSecurityDescriptorToSecurityDescriptorW(default DACL)",
    )?;
    let sd = Local(sd);
    let mut present = 0;
    let mut defaulted = 0;
    let mut dacl: *mut ACL = std::ptr::null_mut();
    check(
        unsafe { GetSecurityDescriptorDacl(sd.0, &mut present, &mut dacl, &mut defaulted) },
        "GetSecurityDescriptorDacl",
    )?;
    let info = TOKEN_DEFAULT_DACL { DefaultDacl: dacl };
    check(
        unsafe {
            SetTokenInformation(
                token,
                TokenDefaultDacl,
                &info as *const _ as *const c_void,
                size_of::<TOKEN_DEFAULT_DACL>() as u32,
            )
        },
        "SetTokenInformation(TokenDefaultDacl)",
    )
}

/// The base of the shell's token: the write-restricted token with the shell's default DACL and
/// `SeChangeNotifyPrivilege` enabled. `CreateProcessAsUserW` derives the AppContainer token from it (Low
/// integrity, the restricting SIDs kept). Returns it with the logon SID.
fn mint_token(capability: &Sid, package: &Sid) -> Result<(Owned, Sid)> {
    let (token, logon) = mint_restricted(capability)?;
    set_default_dacl(token.raw(), &logon, package)?;
    let name = wide("SeChangeNotifyPrivilege");
    let mut luid = LUID { LowPart: 0, HighPart: 0 };
    check(unsafe { LookupPrivilegeValueW(std::ptr::null(), name.as_ptr(), &mut luid) }, "LookupPrivilegeValueW")?;
    let privileges = TOKEN_PRIVILEGES {
        PrivilegeCount: 1,
        Privileges: [LUID_AND_ATTRIBUTES { Luid: luid, Attributes: SE_PRIVILEGE_ENABLED }],
    };
    check(
        unsafe { AdjustTokenPrivileges(token.raw(), 0, &privileges, 0, std::ptr::null_mut(), std::ptr::null_mut()) },
        "AdjustTokenPrivileges",
    )?;
    Ok((token, logon))
}

/// A proc-thread attribute list sized for `count` attributes, freed on drop. The values passed to
/// [`AttributeList::set`] must outlive the `CreateProcessAsUserW` call.
struct AttributeList {
    buf: Vec<u64>,
}

impl AttributeList {
    fn new(count: u32) -> Result<Self> {
        let mut size = 0usize;
        unsafe { InitializeProcThreadAttributeList(std::ptr::null_mut(), count, 0, &mut size) };
        let mut buf = vec![0u64; size.div_ceil(8)];
        check(
            unsafe { InitializeProcThreadAttributeList(buf.as_mut_ptr() as *mut c_void, count, 0, &mut size) },
            "InitializeProcThreadAttributeList",
        )?;
        Ok(Self { buf })
    }

    fn ptr(&mut self) -> *mut c_void {
        self.buf.as_mut_ptr() as *mut c_void
    }

    fn set(&mut self, attribute: u32, value: *const c_void, size: usize, name: &str) -> Result<()> {
        check(
            unsafe {
                UpdateProcThreadAttribute(
                    self.ptr(),
                    0,
                    attribute as usize,
                    value,
                    size,
                    std::ptr::null_mut(),
                    std::ptr::null(),
                )
            },
            name,
        )
    }
}

impl Drop for AttributeList {
    fn drop(&mut self) {
        unsafe { DeleteProcThreadAttributeList(self.ptr()) };
    }
}

fn pipe_pair(inheritable_child_end: Option<bool>) -> Result<(Owned, Owned)> {
    let attributes = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: std::ptr::null_mut(),
        bInheritHandle: i32::from(inheritable_child_end.is_some()),
    };
    let mut read: HANDLE = std::ptr::null_mut();
    let mut write: HANDLE = std::ptr::null_mut();
    check(unsafe { CreatePipe(&mut read, &mut write, &attributes, 0) }, "CreatePipe")?;
    let (read, write) = (Owned(read), Owned(write));
    // Only the child's end stays inheritable: `Some(true)` keeps the write end, `Some(false)` the read end.
    if let Some(child_writes) = inheritable_child_end {
        let ours = if child_writes { &read } else { &write };
        check(unsafe { SetHandleInformation(ours.raw(), HANDLE_FLAG_INHERIT, 0) }, "SetHandleInformation")?;
    }
    Ok((read, write))
}

fn open_nul() -> Result<Owned> {
    let attributes = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: std::ptr::null_mut(),
        bInheritHandle: 1,
    };
    let name = wide("NUL");
    Owned::new(
        unsafe {
            CreateFileW(
                name.as_ptr(),
                GENERIC_READ,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                &attributes,
                OPEN_EXISTING,
                0,
                std::ptr::null_mut(),
            )
        },
        "CreateFileW(NUL)",
    )
}

struct PseudoConsole(HPCON);

// SAFETY: an HPCON is an opaque handle; resize and close are safe from any thread.
unsafe impl Send for PseudoConsole {}
unsafe impl Sync for PseudoConsole {}

impl PseudoConsole {
    fn resize(&self, columns: u16, rows: u16) {
        let size = COORD { X: columns.min(i16::MAX as u16) as i16, Y: rows.min(i16::MAX as u16) as i16 };
        unsafe { ResizePseudoConsole(self.0, size) };
    }

    fn close(&self) {
        unsafe { ClosePseudoConsole(self.0) };
    }
}

enum Prepared {
    /// `input` is the write end of the child's stdin pipe when the launch takes input; otherwise `stdin` is `NUL`.
    Pipes {
        stdin: Owned,
        input: Option<Owned>,
        stdout_child: Owned,
        stderr_child: Owned,
        stdout: Owned,
        stderr: Owned,
    },
    Terminal {
        console: Arc<PseudoConsole>,
        input: Owned,
        output: Owned,
    },
}

fn prepare_stdio(stdio: &Stdio) -> Result<Prepared> {
    match stdio {
        Stdio::Pipes { input } => {
            let (stdin, input) = if *input {
                let (child_reads, ours) = pipe_pair(Some(false))?;
                (child_reads, Some(ours))
            } else {
                (open_nul()?, None)
            };
            let (stdout, stdout_child) = pipe_pair(Some(true))?;
            let (stderr, stderr_child) = pipe_pair(Some(true))?;
            Ok(Prepared::Pipes { stdin, input, stdout_child, stderr_child, stdout, stderr })
        }
        Stdio::Terminal { columns, rows } => {
            let (in_read, input) = pipe_pair(None)?;
            let (output, out_write) = pipe_pair(None)?;
            let size = COORD { X: (*columns).min(i16::MAX as u16) as i16, Y: (*rows).min(i16::MAX as u16) as i16 };
            let mut console: HPCON = 0;
            let hr = unsafe { CreatePseudoConsole(size, in_read.raw(), out_write.raw(), 0, &mut console) };
            if hr < 0 {
                return Err(Error::code("CreatePseudoConsole", hr as u32));
            }
            // The pseudoconsole holds its own references to its ends.
            drop(in_read);
            drop(out_write);
            Ok(Prepared::Terminal { console: Arc::new(PseudoConsole(console)), input, output })
        }
    }
}

/// What the host sends a child's stdin pipe.
enum Input {
    Bytes(Vec<u8>),
    Close,
}

/// Write the host's input to the child's stdin on a thread of its own, so a child that does not read never
/// stalls the runner's frame loop (and with it `terminate`). `Close`, or the end of the launch, closes the pipe:
/// the child reads end of file. Input after a failed write (the child closed its stdin) is dropped.
fn feed(pipe: Owned, input: std::sync::mpsc::Receiver<Input>) {
    std::thread::spawn(move || {
        let mut writer = HandleIo(pipe.raw());
        let mut open = true;
        for event in input {
            match event {
                Input::Bytes(bytes) if open => open = writer.write_all(&bytes).is_ok(),
                Input::Bytes(_) => {}
                Input::Close => break,
            }
        }
        drop(pipe);
    });
}

fn pump(mut source: HandleIo, kind: u8, sink: Sink) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buf = vec![0u8; frame::IO_CHUNK];
        loop {
            match source.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => send(&sink, &Frame::new(kind, buf[..n].to_vec())),
            }
        }
    })
}

/// The shell, suspended until [`Shell::resume`]. Dropped before then, it is terminated.
struct Shell {
    process: Owned,
    thread: Owned,
    pid: u32,
    /// The shell's own primary token (query, duplicate), for the checks made before it runs.
    own_token: Owned,
    resumed: bool,
    /// The Ctrl-C diagnostic from just before the spawn, for the launcher's log.
    ctrl: String,
    /// What the shell's own token turned out to be, for the launcher's log.
    token: String,
}

impl Shell {
    fn resume(&mut self) -> Result<()> {
        if unsafe { ResumeThread(self.thread.raw()) } == u32::MAX {
            return Err(Error::last("ResumeThread(shell)"));
        }
        self.resumed = true;
        Ok(())
    }
}

impl Drop for Shell {
    fn drop(&mut self) {
        if !self.resumed {
            unsafe { TerminateProcess(self.process.raw(), 1) };
        }
    }
}

/// What the shell is started with besides its spec: the base token and the AppContainer it runs in.
struct Identity<'a> {
    token: &'a Owned,
    logon: &'a Sid,
    package: &'a Sid,
    person: &'a Sid,
    /// The volume capability (`volume.rs`), the shell's one capability.
    volume: &'a Sid,
}

/// Create the shell suspended in this launch's AppContainer and admit it ([`admit`]). It runs only once the
/// caller resumes it.
fn spawn(spec: &RunnerSpec, identity: &Identity, job: &Job, prepared: &Prepared) -> Result<Shell> {
    let mut command = wide(&command_line(&spec.executable, &spec.arguments));
    let application = wide(&spec.executable);
    let cwd = wide(&spec.working_directory);
    let mut desktop = wide(&spec.desktop);
    // Windows needs a `LOCALAPPDATA` to create an AppContainer process; `enforce` takes it away again.
    let local_app_data = container::own_local_app_data()?;
    let environment = environment_block(&creation_environment(&spec.environment, &local_app_data));
    let jobs = [job.raw()];

    let mut startup: STARTUPINFOEXW = unsafe { std::mem::zeroed() };
    startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
    startup.StartupInfo.lpDesktop = desktop.as_mut_ptr();
    let capabilities = Capabilities::new(identity.package, std::slice::from_ref(identity.volume));
    let mut attributes = AttributeList::new(3)?;
    attributes.set(
        PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,
        capabilities.as_ptr(),
        size_of::<windows_sys::Win32::Security::SECURITY_CAPABILITIES>(),
        "UpdateProcThreadAttribute(SECURITY_CAPABILITIES)",
    )?;
    attributes.set(
        PROC_THREAD_ATTRIBUTE_JOB_LIST,
        jobs.as_ptr() as *const c_void,
        size_of_val(&jobs),
        "UpdateProcThreadAttribute(JOB_LIST)",
    )?;
    let handles;
    let inherit = match prepared {
        Prepared::Pipes { stdin, stdout_child, stderr_child, .. } => {
            handles = [stdin.raw(), stdout_child.raw(), stderr_child.raw()];
            attributes.set(
                PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
                handles.as_ptr() as *const c_void,
                size_of_val(&handles),
                "UpdateProcThreadAttribute(HANDLE_LIST)",
            )?;
            startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
            startup.StartupInfo.hStdInput = stdin.raw();
            startup.StartupInfo.hStdOutput = stdout_child.raw();
            startup.StartupInfo.hStdError = stderr_child.raw();
            1
        }
        Prepared::Terminal { console, .. } => {
            attributes.set(
                PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
                console.0 as *const c_void,
                size_of::<HPCON>(),
                "UpdateProcThreadAttribute(PSEUDOCONSOLE)",
            )?;
            startup.StartupInfo.hStdInput = INVALID_HANDLE_VALUE;
            startup.StartupInfo.hStdOutput = INVALID_HANDLE_VALUE;
            startup.StartupInfo.hStdError = INVALID_HANDLE_VALUE;
            0
        }
    };
    startup.lpAttributeList = attributes.ptr();

    // The "ignore Ctrl-C" console flag is inherited; clear it so 0x03 interrupts the foreground pipeline.
    let ctrl = clear_ctrl_c_ignore();
    let mut info: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };
    let ok = unsafe {
        CreateProcessAsUserW(
            identity.token.raw(),
            application.as_ptr(),
            command.as_mut_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            inherit,
            SPAWN_FLAGS,
            environment.as_ptr() as *const c_void,
            cwd.as_ptr(),
            &startup.StartupInfo,
            &mut info,
        )
    };
    if ok == 0 {
        return Err(Error::code(
            "CreateProcessAsUserW(write-restricted token, SECURITY_CAPABILITIES for the package)",
            unsafe { GetLastError() },
        ));
    }
    let process = Owned(info.hProcess);
    let thread = Owned(info.hThread);
    // Suspended: nothing of the shell has run yet. Anything short of this launch's AppContainer kills it.
    match admit(&process, spec, identity) {
        Ok((own_token, token)) => {
            Ok(Shell { process, thread, pid: info.dwProcessId, own_token, resumed: false, ctrl, token })
        }
        Err(err) => {
            unsafe { TerminateProcess(process.raw(), 1) };
            Err(Error::msg(format!("the shell was not admitted: {err}")))
        }
    }
}

/// Check the suspended shell's own token (the one Windows derived and assigned, not the one passed in), give
/// it the shell's default DACL whatever `CreateProcess` set, and let the person query the shell's process and
/// token, so the host can confirm the AppContainer from outside. Returns the token and its description.
fn admit(process: &Owned, spec: &RunnerSpec, identity: &Identity) -> Result<(Owned, String)> {
    let mut raw: HANDLE = std::ptr::null_mut();
    check(
        unsafe {
            OpenProcessToken(
                process.raw(),
                TOKEN_QUERY | TOKEN_DUPLICATE | TOKEN_ADJUST_DEFAULT | READ_CONTROL | WRITE_DAC,
                &mut raw,
            )
        },
        "OpenProcessToken(shell)",
    )?;
    let token = Owned(raw);
    let facts = token_facts(token.raw())?;
    verify_token(&facts, &spec.package_sid, &spec.capability_sid, &[identity.volume.to_sddl().as_str()])
        .map_err(Error::msg)?;
    set_default_dacl(token.raw(), identity.logon, identity.package)?;
    grant_kernel_object(process.raw(), identity.person, PROCESS_QUERY_LIMITED_INFORMATION, "shell process")?;
    grant_kernel_object(token.raw(), identity.person, PERSON_TOKEN_ACCESS, "shell token")?;
    Ok((token, facts.describe()))
}

fn roots() -> Result<ExecutableRoots> {
    Ok(ExecutableRoots { program_files: program_files()?, system_root: system_root()? })
}

pub struct RunnerArgs {
    pub pipe_in: String,
    pub pipe_out: String,
    pub launcher_pid: u32,
}

pub fn run(args: &RunnerArgs) -> i32 {
    unsafe { SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX) };
    let (from_launcher, to_launcher) = match connect(args) {
        Ok(pipes) => pipes,
        Err(err) => {
            eprintln!("tau-windows-sandbox runner: {err}");
            return 1;
        }
    };
    let sink: Sink = Arc::new(Mutex::new(HandleIo(to_launcher.raw())));
    match serve(from_launcher, &sink) {
        Ok(code) => code,
        Err(failure) => {
            let error = RunnerError { stage: failure.stage.to_owned(), message: failure.error.to_string() };
            send(&sink, &Frame::json(frame::RUNNER_ERROR, &error));
            1
        }
    }
}

fn connect(args: &RunnerArgs) -> Result<(Owned, Owned)> {
    let from_launcher = pipe::open_client(&args.pipe_in, true)?;
    pipe::check_server(&from_launcher, args.launcher_pid)?;
    let to_launcher = pipe::open_client(&args.pipe_out, false)?;
    pipe::check_server(&to_launcher, args.launcher_pid)?;
    Ok((from_launcher, to_launcher))
}

fn serve(from_launcher: Owned, sink: &Sink) -> std::result::Result<i32, Failure> {
    let mut reader = HandleIo(from_launcher.raw());
    let first = read_frame(&mut reader).map_err(Error::from).at("spec")?;
    let spec: RunnerSpec = match first {
        Some(frame) if frame.kind == frame::SPEC => {
            serde_json::from_slice(&frame.payload).map_err(|err| Error::msg(err.to_string())).at("spec")?
        }
        _ => return Err(Error::msg("the first frame was not a runner spec")).at("spec"),
    };
    if !is_capability_sid(&spec.capability_sid) {
        return Err(Error::msg("the capability SID is malformed")).at("spec");
    }
    if !is_package_sid(&spec.package_sid) {
        return Err(Error::msg("the AppContainer package SID is malformed")).at("spec");
    }
    let person = Sid::parse(&spec.person_sid).at("spec")?;
    // `launch` checked the digest on a handle it holds until the launch ends; the runner re-checks the path.
    let executable = roots().and_then(|roots| {
        check_executable(&spec.executable, spec.executable_digest.as_deref(), &roots)
            .map(|executable| executable.path)
            .map_err(|r| Error::msg(r.message))
    });
    if executable.as_deref().ok() != Some(spec.executable.as_str()) {
        return Err(Error::msg("the runner refused the executable")).at("spec");
    }

    let capability = Sid::parse(&spec.capability_sid).at("token")?;
    let package = Sid::parse(&spec.package_sid).at("token")?;
    // Register this launch's AppContainer in the sandbox account's own profile (CreateProcess resolves the
    // package against it), after deleting what crashed launches left behind.
    send(sink, &Frame::new(frame::RUNNER_LOG, container::sweep().into_bytes()));
    let container = Arc::new(Container::create(&spec.package_name, &package).at("appcontainer")?);
    send(
        sink,
        &Frame::new(
            frame::RUNNER_LOG,
            format!("AppContainer {} registered; its folder is {}", container.name, container.folder).into_bytes(),
        ),
    );
    let (token, logon) = mint_token(&capability, &package).at("token")?;
    let account = current_user().at("registry")?;
    let volume = volume::capability_sid().at("token")?;
    let identity = Identity { token: &token, logon: &logon, package: &package, person: &person, volume: &volume };
    send(
        sink,
        &Frame::new(
            frame::RUNNER_LOG,
            format!(
                "restricted token minted: {}; the shell's AppContainer is {}",
                token_facts(token.raw()).map(|f| f.describe()).unwrap_or_else(|e| e.to_string()),
                package.to_sddl()
            )
            .into_bytes(),
        ),
    );
    let job = Arc::new(Job::kill_on_close().at("job")?);
    let prepared = prepare_stdio(&spec.stdio).at("stdio")?;
    send(sink, &Frame::json(frame::READY, &serde_json::json!({})));

    let mut prepared = Some(prepared);
    let mut console: Option<Arc<PseudoConsole>> = None;
    let mut terminal_input: Option<Owned> = None;
    // Input for a pipes launch that takes it, queued from `ready` on and fed once the child exists.
    let (stdin_sender, stdin_queue) = std::sync::mpsc::channel::<Input>();
    let mut stdin_queue = Some(stdin_queue);
    while let Ok(Some(frame)) = read_frame(&mut reader) {
        match frame.kind {
            frame::START => {
                let Some(ready) = prepared.take() else { continue };
                let mut shell = spawn(&spec, &identity, &job, &ready).at("spawn")?;
                send(
                    sink,
                    &Frame::new(
                        frame::RUNNER_LOG,
                        format!("{}; spawn flags {SPAWN_FLAGS:#x}; shell token: {}", shell.ctrl, shell.token)
                            .into_bytes(),
                    ),
                );
                // Windows rewrites LOCALAPPDATA, TEMP and TMP for a registered AppContainer: the launch's own
                // environment is the contract. Refused, the suspended shell is terminated when `shell` drops.
                let environment = environment::enforce(shell.process.raw(), &spec.environment).at("environment")?;
                send(sink, &Frame::new(frame::RUNNER_LOG, environment.into_bytes()));
                let namespace = lowbox::admit_namespace(shell.own_token.raw(), &logon)
                    .unwrap_or_else(|err| format!("namespace grant failed: {err}"));
                send(sink, &Frame::new(frame::RUNNER_LOG, namespace.into_bytes()));
                // PowerShell cannot start when its HKCU refuses it: check the hive as the shell's own token.
                // Refused, the suspended shell is terminated when `shell` drops.
                let hive = profile::check_hive(&shell.own_token, &account).at("registry")?;
                send(sink, &Frame::new(frame::RUNNER_LOG, hive.into_bytes()));
                let (station, desktop) = spec.desktop.split_once('\\').unwrap_or(("WinSta0", spec.desktop.as_str()));
                send(
                    sink,
                    &Frame::new(frame::RUNNER_LOG, lowbox::probe(shell.own_token.raw(), station, desktop).into_bytes()),
                );
                shell.resume().at("spawn")?;
                send(sink, &Frame::json(frame::STARTED, &Started { shell_pid: shell.pid }));
                let pumps = match ready {
                    Prepared::Pipes { stdin, input, stdout_child, stderr_child, stdout, stderr } => {
                        // The child holds its own copies now; ours would keep the pipes open forever.
                        drop((stdin, stdout_child, stderr_child));
                        if let (Some(pipe), Some(queue)) = (input, stdin_queue.take()) {
                            feed(pipe, queue);
                        }
                        let out = pump(HandleIo(stdout.raw()), frame::STDOUT, sink.clone());
                        let err = pump(HandleIo(stderr.raw()), frame::STDERR, sink.clone());
                        vec![(out, stdout), (err, stderr)]
                    }
                    Prepared::Terminal { console: pc, input, output } => {
                        console = Some(pc);
                        terminal_input = Some(input);
                        vec![(pump(HandleIo(output.raw()), frame::OUTPUT, sink.clone()), output)]
                    }
                };
                watch(shell, job.clone(), container.clone(), console.clone(), pumps, sink.clone());
            }
            frame::INPUT => {
                if let Some(input) = &terminal_input {
                    let _ = HandleIo(input.raw()).write_all(&frame.payload);
                } else if spec.stdio.closes_input() {
                    let _ = stdin_sender.send(Input::Bytes(frame.payload));
                }
            }
            frame::CLOSE_INPUT if spec.stdio.closes_input() => {
                let _ = stdin_sender.send(Input::Close);
            }
            frame::RESIZE => {
                if let (Some(pc), Ok(size)) = (&console, serde_json::from_slice::<Resize>(&frame.payload))
                    && size.columns > 0
                    && size.rows > 0
                {
                    pc.resize(size.columns, size.rows);
                }
            }
            frame::TERMINATE => {
                let _ = job.terminate();
            }
            _ => {}
        }
    }
    // The launcher went away: kill the shell tree, then delete the registration. The launcher's own job kills
    // this process too; a registration left by that is the next launch's sweep's.
    let _ = job.kill_and_wait(REAP_TIMEOUT);
    if let Err(err) = container.delete() {
        send(sink, &Frame::new(frame::RUNNER_LOG, err.to_string().into_bytes()));
    }
    std::process::exit(0);
}

/// Wait for the shell, reap whatever it left in the job, drain output, report `exit`, then end the runner.
fn watch(
    shell: Shell,
    job: Arc<Job>,
    container: Arc<Container>,
    console: Option<Arc<PseudoConsole>>,
    pumps: Vec<(std::thread::JoinHandle<()>, Owned)>,
    sink: Sink,
) {
    std::thread::spawn(move || {
        let waited = unsafe { WaitForSingleObject(shell.process.raw(), INFINITE) };
        let mut code = 0u32;
        let have_code = waited == WAIT_OBJECT_0 && unsafe { GetExitCodeProcess(shell.process.raw(), &mut code) } != 0;
        // Linux parity: descendants do not outlive the foreground shell.
        let emptied = job.kill_and_wait(REAP_TIMEOUT).unwrap_or(false);
        if let Some(pc) = &console {
            pc.close();
        }
        for (pump, handle) in pumps {
            let _ = pump.join();
            drop(handle);
        }
        // Only once nothing of the launch runs: the registration's folder is the package's.
        if emptied {
            let deleted = match container.delete() {
                Ok(()) => format!("AppContainer {} deleted", container.name),
                Err(err) => err.to_string(),
            };
            send(&sink, &Frame::new(frame::RUNNER_LOG, deleted.into_bytes()));
        }
        if emptied && have_code {
            send(&sink, &Frame::json(frame::EXIT, &Exit::Code { exit_code: i64::from(code) }));
        } else {
            let error = RunnerError {
                stage: "reap".to_owned(),
                message: if emptied { "no exit code".to_owned() } else { "the shell's job did not empty".to_owned() },
            };
            send(&sink, &Frame::json(frame::RUNNER_ERROR, &error));
        }
        std::process::exit(0);
    });
}
