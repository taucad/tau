//! A stand-in native worker for the WIN-X64 conformance row (`NW01`): it reads one JSON request per stdin line
//! and answers each with one JSON line on stdout, so the row can prove from inside the sandbox what a worker
//! can and cannot do. At end of input it prints `{"op":"eof","lines":n}` and exits 0.
//!
//! Requests: `{"op":"echo","value":…}`; `{"op":"read","path":…}`; `{"op":"write","path":…,"text":…}`;
//! `{"op":"load","path":…}` (`LoadLibraryW`, answering the loaded module's own file name); and
//! `{"op":"connect","address":"ip:port"}` (TCP, three seconds); `{"op":"environment"}` (every variable the
//! worker sees, as an object); and `{"op":"session"}` (the DACLs of the process's window station and thread desktop
//! as SDDL, whether it can create a window there, what a Chromium-style restricted, Low-integrity child on an
//! alternate desktop makes of the session (`restrictedChild`), the DACL and label of its temporary folder, and the DACL of every fixed volume's root folder: the conformance
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
    // The person's temporary folder (DACL and label), which Chromium and the GPU driver write beneath.
    let temp_path = std::env::temp_dir().to_string_lossy().into_owned();
    let temp_wide: Vec<u16> = temp_path.encode_utf16().chain(std::iter::once(0)).collect();
    const LABEL_SECURITY_INFORMATION: u32 = 0x10;
    let temp_info = DACL_SECURITY_INFORMATION | LABEL_SECURITY_INFORMATION;
    let mut needed = 0u32;
    unsafe { GetFileSecurityW(temp_wide.as_ptr(), temp_info, std::ptr::null_mut(), 0, &mut needed) };
    let mut temp_buffer = vec![0u64; (needed as usize).div_ceil(8).max(1)];
    if unsafe { GetFileSecurityW(temp_wide.as_ptr(), temp_info, temp_buffer.as_mut_ptr().cast(), needed, &mut needed) }
        == 0
    {
        return Err(format!("GetFileSecurityW({temp_path}): {}", last()));
    }
    let mut text: *mut u16 = std::ptr::null_mut();
    let mut length = 0u32;
    if unsafe {
        ConvertSecurityDescriptorToStringSecurityDescriptorW(
            temp_buffer.as_mut_ptr().cast(),
            1,
            temp_info,
            &mut text,
            &mut length,
        )
    } == 0
    {
        return Err(format!("ConvertSecurityDescriptorToStringSecurityDescriptorW({temp_path}): {}", last()));
    }
    let temporary_sddl = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(text, length as usize) })
        .trim_end_matches('\0')
        .to_owned();
    unsafe { LocalFree(text.cast()) };
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
        "restrictedChild": restricted_child()?,
        "temporaryFolder": { "path": temp_path, "sddl": temporary_sddl },
        "volumes": volumes,
    }))
}

#[cfg(not(windows))]
fn session() -> Result<Value, String> {
    Err("window stations exist only on Windows".to_owned())
}

/// What a Chromium GPU or renderer process needs from the person's session, done the way Chromium's sandbox does it
/// (`sandbox/win/src/window.cc`, `restricted_token_utils.cc`): from the person's own context, create an alternate
/// desktop on the current window station with the thread desktop's DACL and a Low label, then start this probe again
/// with `--window` on that desktop under a restricted token (every group deny-only but Users, Everyone, Interactive and
/// Authenticated Users; restricting SIDs Users, Everyone, RESTRICTED and the logon SID; no privileges), at Low
/// integrity, in a kill-on-close job that may not switch desktops. The child creates a window and exits 0; a child
/// that cannot attach to the station or desktop dies in DLL initialization (0xC0000142), which is how Chromium's GPU
/// process dies when the session's station or desktop no longer admits it.
#[cfg(windows)]
fn restricted_child() -> Result<Value, String> {
    use std::ffi::c_void;

    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, LocalFree, WAIT_OBJECT_0};
    use windows_sys::Win32::Security::Authorization::{
        ConvertStringSecurityDescriptorToSecurityDescriptorW, SE_WINDOW_OBJECT, SetSecurityInfo,
    };
    use windows_sys::Win32::Security::{
        CreateRestrictedToken, CreateWellKnownSid, DACL_SECURITY_INFORMATION, DISABLE_MAX_PRIVILEGE, EqualSid,
        GetSecurityDescriptorSacl, GetTokenInformation, GetUserObjectSecurity, LABEL_SECURITY_INFORMATION, PSID,
        SECURITY_ATTRIBUTES, SID_AND_ATTRIBUTES, SetTokenInformation, TOKEN_GROUPS, TOKEN_MANDATORY_LABEL, TokenGroups,
        TokenIntegrityLevel, WinAuthenticatedUserSid, WinBuiltinUsersSid, WinInteractiveSid, WinLowLabelSid,
        WinRestrictedCodeSid, WinWorldSid,
    };
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOB_OBJECT_UILIMIT_DESKTOP,
        JOB_OBJECT_UILIMIT_DISPLAYSETTINGS, JOB_OBJECT_UILIMIT_EXITWINDOWS, JOB_OBJECT_UILIMIT_SYSTEMPARAMETERS,
        JOBOBJECT_BASIC_UI_RESTRICTIONS, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectBasicUIRestrictions,
        JobObjectExtendedLimitInformation, SetInformationJobObject,
    };
    use windows_sys::Win32::System::StationsAndDesktops::{
        CloseDesktop, CreateDesktopW, GetProcessWindowStation, GetThreadDesktop, GetUserObjectInformationW, UOI_NAME,
    };
    use windows_sys::Win32::System::Threading::{
        CREATE_SUSPENDED, CreateProcessAsUserW, GetCurrentProcess, GetCurrentThreadId, GetExitCodeProcess,
        OpenProcessToken, PROCESS_INFORMATION, ResumeThread, STARTUPINFOW, TerminateProcess, WaitForSingleObject,
    };

    const SE_GROUP_USE_FOR_DENY_ONLY: u32 = 0x10;
    const SE_GROUP_INTEGRITY: u32 = 0x20;
    const SE_GROUP_LOGON_ID: u32 = 0xC000_0000;
    const TOKEN_ALL: u32 = 0x000F_01FF;
    // DESKTOP_CREATEWINDOW | DESKTOP_READOBJECTS | READ_CONTROL | WRITE_DAC | WRITE_OWNER, as Chromium asks.
    const DESKTOP_ACCESS: u32 = 0x0002 | 0x0001 | 0x0002_0000 | 0x0004_0000 | 0x0008_0000;

    struct Handle(HANDLE);
    impl Drop for Handle {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { CloseHandle(self.0) };
            }
        }
    }
    let last = |what: &str| format!("{what}: {}", std::io::Error::last_os_error());
    let wide = |text: &str| text.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let well_known = |kind| -> Result<Vec<u8>, String> {
        let mut sid = vec![0u8; 68];
        let mut size = sid.len() as u32;
        if unsafe { CreateWellKnownSid(kind, std::ptr::null_mut(), sid.as_mut_ptr().cast(), &mut size) } == 0 {
            return Err(last("CreateWellKnownSid"));
        }
        sid.truncate(size as usize);
        Ok(sid)
    };

    // The alternate desktop, on the current station, with the thread desktop's DACL and a Low label.
    let mut name = [0u16; 256];
    let mut needed = 0u32;
    if unsafe {
        GetUserObjectInformationW(
            GetProcessWindowStation(),
            UOI_NAME,
            name.as_mut_ptr().cast(),
            (name.len() * 2) as u32,
            &mut needed,
        )
    } == 0
    {
        return Err(last("GetUserObjectInformationW(station)"));
    }
    let station = String::from_utf16_lossy(&name[..name.iter().position(|c| *c == 0).unwrap_or(0)]);
    let current = unsafe { GetThreadDesktop(GetCurrentThreadId()) };
    let info = DACL_SECURITY_INFORMATION;
    unsafe { GetUserObjectSecurity(current, &info, std::ptr::null_mut(), 0, &mut needed) };
    let mut descriptor = vec![0u64; (needed as usize).div_ceil(8).max(1)];
    if unsafe { GetUserObjectSecurity(current, &info, descriptor.as_mut_ptr().cast(), needed, &mut needed) } == 0 {
        return Err(last("GetUserObjectSecurity(desktop)"));
    }
    let attributes = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: descriptor.as_mut_ptr().cast(),
        bInheritHandle: 0,
    };
    let desktop_name = format!("tau_probe_alternate_desktop_{}", std::process::id());
    let desktop_wide = wide(&desktop_name);
    let desktop = unsafe {
        CreateDesktopW(desktop_wide.as_ptr(), std::ptr::null(), std::ptr::null(), 0, DESKTOP_ACCESS, &attributes)
    };
    if desktop.is_null() {
        return Ok(json!({ "stage": "CreateDesktopW", "error": last("CreateDesktopW") }));
    }
    struct Desktop(*mut c_void);
    impl Drop for Desktop {
        fn drop(&mut self) {
            unsafe { CloseDesktop(self.0) };
        }
    }
    let _desktop = Desktop(desktop);
    let label = wide("S:(ML;;NW;;;LW)");
    let mut label_sd: *mut c_void = std::ptr::null_mut();
    if unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(label.as_ptr(), 1, &mut label_sd, std::ptr::null_mut())
    } == 0
    {
        return Err(last("ConvertStringSecurityDescriptorToSecurityDescriptorW(label)"));
    }
    let (mut present, mut defaulted) = (0, 0);
    let mut sacl = std::ptr::null_mut();
    unsafe { GetSecurityDescriptorSacl(label_sd, &mut present, &mut sacl, &mut defaulted) };
    let labelled = unsafe {
        SetSecurityInfo(
            desktop,
            SE_WINDOW_OBJECT,
            LABEL_SECURITY_INFORMATION,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null(),
            sacl,
        )
    };
    unsafe { LocalFree(label_sd) };
    if labelled != 0 {
        return Ok(json!({ "stage": "label", "error": format!("SetSecurityInfo(desktop label): {labelled}") }));
    }

    // The restricted, Low-integrity token.
    let mut token: HANDLE = std::ptr::null_mut();
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_ALL, &mut token) } == 0 {
        return Err(last("OpenProcessToken"));
    }
    let token = Handle(token);
    unsafe { GetTokenInformation(token.0, TokenGroups, std::ptr::null_mut(), 0, &mut needed) };
    let mut groups_buffer = vec![0u64; (needed as usize).div_ceil(8).max(1)];
    if unsafe { GetTokenInformation(token.0, TokenGroups, groups_buffer.as_mut_ptr().cast(), needed, &mut needed) } == 0
    {
        return Err(last("GetTokenInformation(TokenGroups)"));
    }
    let groups = unsafe { &*(groups_buffer.as_ptr() as *const TOKEN_GROUPS) };
    let groups = unsafe { std::slice::from_raw_parts(groups.Groups.as_ptr(), groups.GroupCount as usize) }.to_vec();
    let kept_enabled = [WinBuiltinUsersSid, WinWorldSid, WinInteractiveSid, WinAuthenticatedUserSid]
        .into_iter()
        .map(well_known)
        .collect::<Result<Vec<_>, _>>()?;
    let is_kept = |sid: PSID| kept_enabled.iter().any(|kept| unsafe { EqualSid(kept.as_ptr() as PSID, sid) } != 0);
    let mut deny_only: Vec<SID_AND_ATTRIBUTES> = Vec::new();
    let mut logon: Option<PSID> = None;
    for group in &groups {
        if group.Attributes & SE_GROUP_LOGON_ID == SE_GROUP_LOGON_ID {
            logon = Some(group.Sid);
            continue;
        }
        if group.Attributes & (SE_GROUP_INTEGRITY | SE_GROUP_USE_FOR_DENY_ONLY) != 0 || is_kept(group.Sid) {
            continue;
        }
        deny_only.push(SID_AND_ATTRIBUTES { Sid: group.Sid, Attributes: 0 });
    }
    let mut restricting_sids = [WinBuiltinUsersSid, WinWorldSid, WinRestrictedCodeSid]
        .into_iter()
        .map(well_known)
        .collect::<Result<Vec<_>, _>>()?;
    let mut restricting: Vec<SID_AND_ATTRIBUTES> = restricting_sids
        .iter_mut()
        .map(|sid| SID_AND_ATTRIBUTES { Sid: sid.as_mut_ptr().cast(), Attributes: 0 })
        .collect();
    if let Some(logon) = logon {
        restricting.push(SID_AND_ATTRIBUTES { Sid: logon, Attributes: 0 });
    }
    let mut restricted: HANDLE = std::ptr::null_mut();
    if unsafe {
        CreateRestrictedToken(
            token.0,
            DISABLE_MAX_PRIVILEGE,
            deny_only.len() as u32,
            deny_only.as_ptr(),
            0,
            std::ptr::null(),
            restricting.len() as u32,
            restricting.as_ptr(),
            &mut restricted,
        )
    } == 0
    {
        return Ok(json!({ "stage": "CreateRestrictedToken", "error": last("CreateRestrictedToken") }));
    }
    let restricted = Handle(restricted);
    let mut low = well_known(WinLowLabelSid)?;
    let integrity = TOKEN_MANDATORY_LABEL {
        Label: SID_AND_ATTRIBUTES { Sid: low.as_mut_ptr().cast(), Attributes: SE_GROUP_INTEGRITY },
    };
    if unsafe {
        SetTokenInformation(
            restricted.0,
            TokenIntegrityLevel,
            (&integrity as *const TOKEN_MANDATORY_LABEL).cast(),
            (size_of::<TOKEN_MANDATORY_LABEL>() + low.len()) as u32,
        )
    } == 0
    {
        return Ok(
            json!({ "stage": "TokenIntegrityLevel", "error": last("SetTokenInformation(TokenIntegrityLevel)") }),
        );
    }

    // The job: killed with its handle, and no desktop switching.
    let job = Handle(unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) });
    if job.0.is_null() {
        return Err(last("CreateJobObjectW"));
    }
    let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    let ui = JOBOBJECT_BASIC_UI_RESTRICTIONS {
        UIRestrictionsClass: JOB_OBJECT_UILIMIT_DESKTOP
            | JOB_OBJECT_UILIMIT_DISPLAYSETTINGS
            | JOB_OBJECT_UILIMIT_EXITWINDOWS
            | JOB_OBJECT_UILIMIT_SYSTEMPARAMETERS,
    };
    if unsafe {
        SetInformationJobObject(
            job.0,
            JobObjectExtendedLimitInformation,
            (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    } == 0
        || unsafe {
            SetInformationJobObject(
                job.0,
                JobObjectBasicUIRestrictions,
                (&ui as *const JOBOBJECT_BASIC_UI_RESTRICTIONS).cast(),
                size_of::<JOBOBJECT_BASIC_UI_RESTRICTIONS>() as u32,
            )
        } == 0
    {
        return Err(last("SetInformationJobObject"));
    }

    // This probe again, `--window`, on the alternate desktop.
    let executable = std::env::current_exe().map_err(|err| err.to_string())?;
    let mut command = wide(&format!("\"{}\" --window", executable.display()));
    let mut startup_desktop = wide(&format!("{station}\\{desktop_name}"));
    let startup = STARTUPINFOW {
        cb: size_of::<STARTUPINFOW>() as u32,
        lpDesktop: startup_desktop.as_mut_ptr(),
        ..Default::default()
    };
    let mut process: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };
    if unsafe {
        CreateProcessAsUserW(
            restricted.0,
            std::ptr::null(),
            command.as_mut_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            0,
            CREATE_SUSPENDED,
            std::ptr::null(),
            std::ptr::null(),
            &startup,
            &mut process,
        )
    } == 0
    {
        return Ok(json!({ "stage": "CreateProcessAsUserW", "error": last("CreateProcessAsUserW") }));
    }
    let child = Handle(process.hProcess);
    let thread = Handle(process.hThread);
    if unsafe { AssignProcessToJobObject(job.0, child.0) } == 0 {
        let error = last("AssignProcessToJobObject");
        unsafe { TerminateProcess(child.0, 1) };
        return Ok(json!({ "stage": "AssignProcessToJobObject", "error": error }));
    }
    unsafe { ResumeThread(thread.0) };
    if unsafe { WaitForSingleObject(child.0, 30_000) } != WAIT_OBJECT_0 {
        unsafe { TerminateProcess(child.0, 1) };
        return Ok(json!({ "stage": "wait", "error": "the restricted child did not exit within 30 s" }));
    }
    let mut code = 0u32;
    unsafe { GetExitCodeProcess(child.0, &mut code) };
    Ok(json!({ "stage": "exit", "exitCode": format!("0x{code:08x}") }))
}

/// `--window`: create a hidden window of the predefined STATIC class on this process's desktop; exit 0 when it
/// exists, 2 when it does not.
#[cfg(windows)]
fn window_child() -> i32 {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn CreateWindowExW(
            ex_style: u32,
            class: *const u16,
            name: *const u16,
            style: u32,
            x: i32,
            y: i32,
            width: i32,
            height: i32,
            parent: *mut std::ffi::c_void,
            menu: *mut std::ffi::c_void,
            instance: *mut std::ffi::c_void,
            param: *mut std::ffi::c_void,
        ) -> *mut std::ffi::c_void;
    }
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
    if window.is_null() { 2 } else { 0 }
}

#[cfg(not(windows))]
fn window_child() -> i32 {
    2
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
    if std::env::args().nth(1).as_deref() == Some("--window") {
        std::process::exit(window_child());
    }
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
