//! A stand-in native worker for the WIN-X64 conformance row (`NW01`): it reads one JSON request per stdin line
//! and answers each with one JSON line on stdout, so the row can prove from inside the sandbox what a worker
//! can and cannot do. At end of input it prints `{"op":"eof","lines":n}` and exits 0.
//!
//! Requests: `{"op":"echo","value":…}`; `{"op":"read","path":…}`; `{"op":"write","path":…,"text":…}`;
//! `{"op":"load","path":…}` (`LoadLibraryW`, answering the loaded module's own file name); and
//! `{"op":"connect","address":"ip:port"}` (TCP, three seconds); and `{"op":"environment"}` (every variable the
//! worker sees, as an object). Every answer carries `ok`, and `error` when
//! it is false.

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
