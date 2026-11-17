//! Byte I/O over raw handles, and the launcher ↔ runner named-pipe channel.
//!
//! Two one-way pipes (synchronous I/O on one duplex handle would serialise reads behind writes). Each pipe
//! has a protected DACL naming only the person running `launch` and the `TauSandbox` account, rejects
//! remote clients, and is created with `FILE_FLAG_FIRST_PIPE_INSTANCE` so nobody can pre-create the name.
//! The launcher checks the connected client's PID is the runner it started; the runner checks the server's
//! PID is the launcher named on its command line.

use std::io::{self, Read, Write};
use std::sync::mpsc;
use std::time::Duration;

use windows_sys::Win32::Foundation::{
    ERROR_BROKEN_PIPE, ERROR_NO_DATA, ERROR_PIPE_CONNECTED, GENERIC_READ, GENERIC_WRITE, GetLastError, HANDLE,
};
use windows_sys::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows_sys::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAG_FIRST_PIPE_INSTANCE, OPEN_EXISTING, PIPE_ACCESS_INBOUND, PIPE_ACCESS_OUTBOUND, ReadFile,
    SECURITY_IDENTIFICATION, SECURITY_SQOS_PRESENT, WriteFile,
};
use windows_sys::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, GetNamedPipeClientProcessId, GetNamedPipeServerProcessId, PIPE_READMODE_BYTE,
    PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_WAIT,
};

use super::sid::Sid;
use super::util::{Error, Local, Owned, Result, check, random_u32s, wide};

const PIPE_BUFFER: u32 = 64 * 1024;
pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);

/// `Read`/`Write` over a borrowed handle. A broken pipe reads as end of stream.
pub struct HandleIo(pub HANDLE);

// SAFETY: a handle is a process-wide token; the owner keeps it open while this is used.
unsafe impl Send for HandleIo {}

impl Read for HandleIo {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let mut read = 0u32;
        let len = buf.len().min(u32::MAX as usize) as u32;
        if unsafe { ReadFile(self.0, buf.as_mut_ptr(), len, &mut read, std::ptr::null_mut()) } == 0 {
            let code = unsafe { GetLastError() };
            if code == ERROR_BROKEN_PIPE {
                return Ok(0);
            }
            return Err(io::Error::from_raw_os_error(code as i32));
        }
        Ok(read as usize)
    }
}

impl Write for HandleIo {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let mut written = 0u32;
        let len = buf.len().min(u32::MAX as usize) as u32;
        if unsafe { WriteFile(self.0, buf.as_ptr(), len, &mut written, std::ptr::null_mut()) } == 0 {
            let code = unsafe { GetLastError() };
            if code == ERROR_BROKEN_PIPE || code == ERROR_NO_DATA {
                return Err(io::Error::new(io::ErrorKind::BrokenPipe, "pipe closed"));
            }
            return Err(io::Error::from_raw_os_error(code as i32));
        }
        Ok(written as usize)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

pub struct PipeNames {
    pub to_runner: String,
    pub from_runner: String,
}

pub fn pipe_names() -> Result<PipeNames> {
    let [a, b, c, d] = random_u32s::<4>()?;
    let base = format!("\\\\.\\pipe\\tau-sandbox-{a:08x}{b:08x}{c:08x}{d:08x}");
    Ok(PipeNames { to_runner: format!("{base}-in"), from_runner: format!("{base}-out") })
}

/// Create the server end of one runner pipe, writable only by `person` and `account`.
pub fn create_server(name: &str, outbound: bool, person: &Sid, account: &Sid) -> Result<Owned> {
    let sddl = format!("D:P(A;;GA;;;{})(A;;GA;;;{})", person.to_sddl(), account.to_sddl());
    let sddl_w = wide(&sddl);
    let mut sd: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
    check(
        unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl_w.as_ptr(),
                SDDL_REVISION_1,
                &mut sd,
                std::ptr::null_mut(),
            )
        },
        "ConvertStringSecurityDescriptorToSecurityDescriptorW(pipe)",
    )?;
    let sd = Local(sd);
    let attributes = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: sd.0,
        bInheritHandle: 0,
    };
    let name_w = wide(name);
    let access = if outbound { PIPE_ACCESS_OUTBOUND } else { PIPE_ACCESS_INBOUND };
    let handle = unsafe {
        CreateNamedPipeW(
            name_w.as_ptr(),
            access | FILE_FLAG_FIRST_PIPE_INSTANCE,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            1,
            PIPE_BUFFER,
            PIPE_BUFFER,
            0,
            &attributes,
        )
    };
    Owned::new(handle, "CreateNamedPipeW")
}

/// Wait for the runner to connect to `pipe`, at most [`CONNECT_TIMEOUT`], and check the client is
/// `expected_pid`. On timeout the launcher connects to its own pipe to release the waiting thread; the
/// PID check then fails.
pub fn accept(pipe: &Owned, name: &str, expected_pid: u32) -> Result<()> {
    let raw = HandleIo(pipe.raw());
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let raw = raw;
        let ok = unsafe { ConnectNamedPipe(raw.0, std::ptr::null_mut()) };
        let code = if ok == 0 { unsafe { GetLastError() } } else { 0 };
        let _ = tx.send(code);
    });
    let code = match rx.recv_timeout(CONNECT_TIMEOUT) {
        Ok(code) => code,
        Err(_) => {
            let _poke = open_client(name, true);
            let _ = rx.recv_timeout(Duration::from_secs(5));
            return Err(Error::msg("the runner did not connect to its pipe in time"));
        }
    };
    if code != 0 && code != ERROR_PIPE_CONNECTED {
        return Err(Error::code("ConnectNamedPipe", code));
    }
    let mut client = 0u32;
    check(unsafe { GetNamedPipeClientProcessId(pipe.raw(), &mut client) }, "GetNamedPipeClientProcessId")?;
    if client != expected_pid {
        return Err(Error::msg(format!("pipe client pid {client} is not the runner {expected_pid}")));
    }
    Ok(())
}

/// The runner's end. `read` opens for reading, otherwise for writing. Identification-level impersonation
/// only, so the server cannot act as the client.
pub fn open_client(name: &str, read: bool) -> Result<Owned> {
    let name_w = wide(name);
    let handle = unsafe {
        CreateFileW(
            name_w.as_ptr(),
            if read { GENERIC_READ } else { GENERIC_WRITE },
            0,
            std::ptr::null(),
            OPEN_EXISTING,
            SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION,
            std::ptr::null_mut(),
        )
    };
    Owned::new(handle, "CreateFileW(pipe)")
}

pub fn check_server(pipe: &Owned, expected_pid: u32) -> Result<()> {
    let mut server = 0u32;
    check(unsafe { GetNamedPipeServerProcessId(pipe.raw(), &mut server) }, "GetNamedPipeServerProcessId")?;
    if server != expected_pid {
        return Err(Error::msg(format!("pipe server pid {server} is not the launcher {expected_pid}")));
    }
    Ok(())
}
