//! A stand-in native worker for the WIN-X64 conformance row (`NW01`): it reads one JSON request per stdin line
//! and answers each with one JSON line on stdout, so the row can prove from inside the sandbox what a worker
//! can and cannot do. At end of input it prints `{"op":"eof","lines":n}` and exits 0.
//!
//! Requests: `{"op":"echo","value":…}`; `{"op":"read","path":…}`; `{"op":"write","path":…,"text":…}`;
//! `{"op":"load","path":…}` (`LoadLibraryW`, answering the loaded module's own file name); and
//! `{"op":"connect","address":"ip:port"}` (TCP, three seconds); `{"op":"environment"}` (every variable the
//! worker sees, as an object); and `{"op":"session"}` (the DACLs of the process's window station and thread desktop
//! as SDDL, whether it can create a window there, and the DACL of every fixed volume's root folder: the conformance
//! suite runs it as the person after every row, so a launch that leaves the person's session unusable for GUI
//! processes, or a volume root changed, fails). Every answer carries `ok`, and
//! `error` when it is false.

use std::io::{BufRead, Write};

use serde_json::{Value, json};

#[cfg(windows)]
fn load(path: &str) -> Result<String, String> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn LoadLibraryW(name: *const u16) -> *mut std::ffi::c_void;
        fn GetModuleFileNameW(module: *mut std::ffi::c_void, name: *mut u16, size: u32) -> u32;
    }
    let wide: Vec<u16> = std::ffi::OsStr::new(path).encode_wide().chain(std::iter::once(0)).collect();
    let module = unsafe { LoadLibraryW(wide.as_ptr()) };
    if module.is_null() {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let mut name = vec![0u16; 32_768];
    let length = unsafe { GetModuleFileNameW(module, name.as_mut_ptr(), name.len() as u32) } as usize;
    if length == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(String::from_utf16_lossy(&name[..length]))
}

#[cfg(not(windows))]
fn load(_path: &str) -> Result<String, String> {
    Err("LoadLibraryW exists only on Windows".to_owned())
}

#[cfg(windows)]
fn session() -> Result<Value, String> {
    use std::ffi::c_void;

    #[link(name = "user32")]
    unsafe extern "system" {
        fn GetProcessWindowStation() -> *mut c_void;
        fn GetThreadDesktop(thread: u32) -> *mut c_void;
        fn GetUserObjectSecurity(
            object: *mut c_void,
            info: *const u32,
            sd: *mut c_void,
            length: u32,
            needed: *mut u32,
        ) -> i32;
        fn CreateWindowExW(
            ex_style: u32,
            class: *const u16,
            name: *const u16,
            style: u32,
            x: i32,
            y: i32,
            width: i32,
            height: i32,
            parent: *mut c_void,
            menu: *mut c_void,
            instance: *mut c_void,
            param: *mut c_void,
        ) -> *mut c_void;
        fn DestroyWindow(window: *mut c_void) -> i32;
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetCurrentThreadId() -> u32;
        fn LocalFree(memory: *mut c_void) -> *mut c_void;
        fn GetLogicalDrives() -> u32;
        fn GetDriveTypeW(root: *const u16) -> u32;
    }
    #[link(name = "advapi32")]
    unsafe extern "system" {
        fn GetFileSecurityW(path: *const u16, info: u32, sd: *mut c_void, length: u32, needed: *mut u32) -> i32;
        fn ConvertSecurityDescriptorToStringSecurityDescriptorW(
            sd: *mut c_void,
            revision: u32,
            info: u32,
            text: *mut *mut u16,
            length: *mut u32,
        ) -> i32;
    }
    const DACL_SECURITY_INFORMATION: u32 = 4;
    let last = || std::io::Error::last_os_error().to_string();
    let dacl = |object: *mut c_void, what: &str| -> Result<String, String> {
        let info = DACL_SECURITY_INFORMATION;
        let mut needed = 0u32;
        unsafe { GetUserObjectSecurity(object, &info, std::ptr::null_mut(), 0, &mut needed) };
        let mut buffer = vec![0u64; (needed as usize).div_ceil(8).max(1)];
        if unsafe { GetUserObjectSecurity(object, &info, buffer.as_mut_ptr().cast(), needed, &mut needed) } == 0 {
            return Err(format!("GetUserObjectSecurity({what}): {}", last()));
        }
        let mut text: *mut u16 = std::ptr::null_mut();
        let mut length = 0u32;
        if unsafe {
            ConvertSecurityDescriptorToStringSecurityDescriptorW(
                buffer.as_mut_ptr().cast(),
                1,
                info,
                &mut text,
                &mut length,
            )
        } == 0
        {
            return Err(format!("ConvertSecurityDescriptorToStringSecurityDescriptorW({what}): {}", last()));
        }
        let sddl = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(text, length as usize) });
        unsafe { LocalFree(text.cast()) };
        Ok(sddl.trim_end_matches('\0').to_owned())
    };
    let sddl_of = |buffer: &mut [u64], what: &str| -> Result<String, String> {
        let mut text: *mut u16 = std::ptr::null_mut();
        let mut length = 0u32;
        if unsafe {
            ConvertSecurityDescriptorToStringSecurityDescriptorW(
                buffer.as_mut_ptr().cast(),
                1,
                DACL_SECURITY_INFORMATION,
                &mut text,
                &mut length,
            )
        } == 0
        {
            return Err(format!("ConvertSecurityDescriptorToStringSecurityDescriptorW({what}): {}", last()));
        }
        let sddl = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(text, length as usize) });
        unsafe { LocalFree(text.cast()) };
        Ok(sddl.trim_end_matches('\0').to_owned())
    };
    // Every fixed volume's root folder (`DRIVE_FIXED`), which `setup` gives the volume capability and no launch may
    // change.
    let mut volumes = serde_json::Map::new();
    let drives = unsafe { GetLogicalDrives() };
    for letter in (0..26u8).filter(|bit| drives & (1 << bit) != 0) {
        let root = format!("{}:\\", char::from(b'A' + letter));
        let wide: Vec<u16> = root.encode_utf16().chain(std::iter::once(0)).collect();
        if unsafe { GetDriveTypeW(wide.as_ptr()) } != 3 {
            continue;
        }
        let mut needed = 0u32;
        unsafe { GetFileSecurityW(wide.as_ptr(), DACL_SECURITY_INFORMATION, std::ptr::null_mut(), 0, &mut needed) };
        let mut buffer = vec![0u64; (needed as usize).div_ceil(8).max(1)];
        if unsafe {
            GetFileSecurityW(wide.as_ptr(), DACL_SECURITY_INFORMATION, buffer.as_mut_ptr().cast(), needed, &mut needed)
        } == 0
        {
            return Err(format!("GetFileSecurityW({root}): {}", last()));
        }
        volumes.insert(root.clone(), Value::String(sddl_of(&mut buffer, &root)?));
    }
    let station = dacl(unsafe { GetProcessWindowStation() }, "window station")?;
    let desktop = dacl(unsafe { GetThreadDesktop(GetCurrentThreadId()) }, "desktop")?;
    // A hidden window of the predefined STATIC class on the thread's desktop.
    let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
    let window = unsafe {
        CreateWindowExW(
            0,
            class.as_ptr(),
            class.as_ptr(),
            0,
            0,
            0,
            1,
            1,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    let window_error = if window.is_null() { Some(last()) } else { None };
    if !window.is_null() {
        unsafe { DestroyWindow(window) };
    }
    Ok(json!({
        "station": station,
        "desktop": desktop,
        "window": window_error.is_none(),
        "windowError": window_error,
        "volumes": volumes,
    }))
}

#[cfg(not(windows))]
fn session() -> Result<Value, String> {
    Err("window stations exist only on Windows".to_owned())
}

fn connect(address: &str) -> Result<(), String> {
    let address: std::net::SocketAddr = address.parse().map_err(|err| format!("{err}"))?;
    std::net::TcpStream::connect_timeout(&address, std::time::Duration::from_secs(3))
        .map(|_| ())
        .map_err(|err| err.to_string())
}

fn text(request: &Value, key: &str) -> String {
    request.get(key).and_then(Value::as_str).unwrap_or_default().to_owned()
}

fn answer(request: &Value) -> Value {
    let op = text(request, "op");
    let outcome = match op.as_str() {
        "environment" => {
            return json!({ "op": op, "ok": true, "value": std::env::vars().map(|(name, value)| (name, Value::String(value))).collect::<serde_json::Map<String, Value>>() });
        }
        "echo" => return json!({ "op": op, "ok": true, "value": request.get("value").cloned().unwrap_or(Value::Null) }),
        "read" => match std::fs::read_to_string(text(request, "path")) {
            Ok(content) => return json!({ "op": op, "ok": true, "text": content }),
            Err(err) => Err(err.to_string()),
        },
        "write" => std::fs::write(text(request, "path"), text(request, "text")).map_err(|err| err.to_string()),
        "load" => match load(&text(request, "path")) {
            Ok(module) => return json!({ "op": op, "ok": true, "module": module }),
            Err(err) => Err(err),
        },
        "connect" => connect(&text(request, "address")),
        "session" => match session() {
            Ok(value) => return json!({ "op": op, "ok": true, "value": value }),
            Err(err) => Err(err),
        },
        _ => Err(format!("unknown op {op:?}")),
    };
    match outcome {
        Ok(()) => json!({ "op": op, "ok": true }),
        Err(error) => json!({ "op": op, "ok": false, "error": error }),
    }
}

fn main() {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    let mut lines = 0u64;
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        lines += 1;
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(request) => answer(&request),
            Err(err) => json!({ "op": "parse", "ok": false, "error": err.to_string() }),
        };
        let _ = writeln!(stdout, "{reply}");
        let _ = stdout.flush();
    }
    let _ = writeln!(stdout, "{}", json!({ "op": "eof", "lines": lines }));
    let _ = stdout.flush();
}
