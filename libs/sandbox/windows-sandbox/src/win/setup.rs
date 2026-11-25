//! `status`, `setup` and `revoke`.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use windows_sys::Win32::Foundation::GENERIC_WRITE;
use windows_sys::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1, SE_FILE_OBJECT, SetNamedSecurityInfoW,
};
use windows_sys::Win32::Security::{
    ACL, CheckTokenMembership, DACL_SECURITY_INFORMATION, GetSecurityDescriptorDacl,
    PROTECTED_DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES,
};
use windows_sys::Win32::Storage::FileSystem::{CREATE_NEW, CreateFileW, FILE_ATTRIBUTE_NORMAL};

use super::account;
use super::dpapi;
use super::firewall;
use super::pipe::HandleIo;
use super::profile;
use super::sid::{ADMINISTRATORS, Sid};
use super::util::{Error, Local, Owned, Result, check, check_status, program_data, random_bytes, wide, wipe};
use super::volume;
use super::wfp;
use crate::install::{
    ACCOUNT, FIREWALL_RULES, GROUP, INSTALL_DIR, InstallRecord, PASSWORD_FILE, RECORD_FILE, RECORD_VERSION, RUNNER_DIR,
    RUNNER_FILE, password_from,
};

pub fn install_dir() -> Result<PathBuf> {
    Ok(Path::new(&program_data()?).join(INSTALL_DIR))
}

/// The install record, `None` when there is none.
pub fn load_record() -> Result<Option<InstallRecord>> {
    let path = install_dir()?.join(RECORD_FILE);
    match fs::read(&path) {
        Ok(bytes) => InstallRecord::parse(&bytes).map(Some).map_err(Error::msg),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(err.into()),
    }
}

/// The account password, decrypted. The caller wipes it after use; it is never printed.
pub fn load_password() -> Result<Vec<u8>> {
    let blob = fs::read(install_dir()?.join(PASSWORD_FILE))?;
    dpapi::unprotect(&blob)
}

/// The network fence as it stands: Windows Firewall per current profile, the four firewall rules and the
/// WFP filters. Read-only; runs as the person.
pub struct Fence {
    /// Current profiles whose firewall is off.
    pub off_profiles: Vec<&'static str>,
    /// Why the rules or filters would not hold; empty when every one is present and enabled.
    pub problems: Vec<String>,
}

impl Fence {
    pub fn firewall_enabled(&self) -> bool {
        self.off_profiles.is_empty()
    }

    pub fn rules_present(&self) -> bool {
        self.problems.is_empty()
    }
}

pub fn fence(record: Option<&InstallRecord>) -> Result<Fence> {
    let state = firewall::state(record.map(|r| r.account_sid.as_str()))?;
    let mut problems = state.rule_problems;
    if let Some(record) = record {
        problems
            .extend(wfp::missing(&record.proxy_ports)?.into_iter().map(|name| format!("WFP filter {name} is missing")));
    }
    Ok(Fence { off_profiles: state.off_profiles, problems })
}

fn with_fence(mut value: serde_json::Value, record: Option<&InstallRecord>) -> serde_json::Value {
    let (enabled, present) = match fence(record) {
        Ok(fence) => {
            if !fence.firewall_enabled() {
                eprintln!("tau-windows-sandbox status: Windows Firewall is off for {}", fence.off_profiles.join(", "));
            }
            for problem in &fence.problems {
                eprintln!("tau-windows-sandbox status: {problem}");
            }
            (fence.firewall_enabled(), fence.rules_present())
        }
        Err(err) => {
            eprintln!("tau-windows-sandbox status: the network fence cannot be read: {err}");
            (false, false)
        }
    };
    value["firewallEnabled"] = enabled.into();
    value["rulesPresent"] = present.into();
    value
}

/// `%SystemDrive%\`, the volume root that must carry the volume capability's grant.
fn system_drive_root() -> String {
    let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_owned());
    format!("{}\\", drive.trim_end_matches('\\'))
}

/// Whether the record names the volume capability this build derives and every recorded root still carries
/// its grant, the system drive's among them.
pub fn volume_roots_granted(record: &InstallRecord) -> bool {
    let Ok(sid) = volume::capability_sid() else { return false };
    let system_root = system_drive_root();
    record.volume_capability_sid.as_deref().is_some_and(|recorded| recorded.eq_ignore_ascii_case(&sid.to_sddl()))
        && record.volume_roots.iter().any(|root| root.eq_ignore_ascii_case(&system_root))
        && record.volume_roots.iter().all(|root| volume::granted(root, &sid))
}

/// `status`: the install record with `installed`, `profilePresent`, `volumeRootsGranted` and the network fence.
/// `quick` stops after the record and the profile: a host asking only whether setup has run (the services probe, at
/// app start) must not wait on the firewall's COM API and the WFP engine, which a launch checks for itself anyway.
pub fn status(quick: bool) -> i32 {
    let value = match load_record() {
        Ok(Some(record)) => {
            let mut value = serde_json::to_value(&record).unwrap_or_default();
            value["installed"] = true.into();
            value["profilePresent"] =
                Sid::parse(&record.account_sid).map(|sid| profile::present(&sid)).unwrap_or(false).into();
            if quick {
                value
            } else {
                value["volumeRootsGranted"] = volume_roots_granted(&record).into();
                with_fence(value, Some(&record))
            }
        }
        Ok(None) if quick => serde_json::json!({ "installed": false }),
        Ok(None) => with_fence(serde_json::json!({ "installed": false }), None),
        Err(err) => {
            eprintln!("tau-windows-sandbox status: {err}");
            let value = serde_json::json!({ "installed": false });
            if quick { value } else { with_fence(value, None) }
        }
    };
    println!("{value}");
    0
}

fn is_elevated_admin() -> Result<bool> {
    let admins = Sid::parse(ADMINISTRATORS)?;
    let mut member = 0;
    check(
        unsafe { CheckTokenMembership(std::ptr::null_mut(), admins.as_psid(), &mut member) },
        "CheckTokenMembership",
    )?;
    Ok(member != 0)
}

fn with_descriptor<T>(sddl: &str, f: impl FnOnce(PSECURITY_DESCRIPTOR) -> Result<T>) -> Result<T> {
    let sddl_w = wide(sddl);
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
        "ConvertStringSecurityDescriptorToSecurityDescriptorW",
    )?;
    let sd = Local(sd);
    f(sd.0)
}

/// Replace a directory's DACL with a protected one (no inheritance from `%ProgramData%`).
fn protect_dir(path: &Path, sddl: &str) -> Result<()> {
    with_descriptor(sddl, |sd| {
        let mut present = 0;
        let mut defaulted = 0;
        let mut dacl: *mut ACL = std::ptr::null_mut();
        check(
            unsafe { GetSecurityDescriptorDacl(sd, &mut present, &mut dacl, &mut defaulted) },
            "GetSecurityDescriptorDacl",
        )?;
        let path_w = wide(&path.to_string_lossy());
        check_status(
            unsafe {
                SetNamedSecurityInfoW(
                    path_w.as_ptr(),
                    SE_FILE_OBJECT,
                    DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    dacl,
                    std::ptr::null(),
                )
            },
            "SetNamedSecurityInfoW(install dir)",
        )
    })
}

/// Create `path` afresh with `sddl` as its DACL from the first instant, then write `bytes`.
fn write_new_protected(path: &Path, sddl: &str, bytes: &[u8]) -> Result<()> {
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => return Err(err.into()),
    }
    with_descriptor(sddl, |sd| {
        let attributes = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: sd,
            bInheritHandle: 0,
        };
        let path_w = wide(&path.to_string_lossy());
        let handle = Owned::new(
            unsafe {
                CreateFileW(
                    path_w.as_ptr(),
                    GENERIC_WRITE,
                    0,
                    &attributes,
                    CREATE_NEW,
                    FILE_ATTRIBUTE_NORMAL,
                    std::ptr::null_mut(),
                )
            },
            "CreateFileW(password)",
        )?;
        let mut io = HandleIo(handle.raw());
        io.write_all(bytes)?;
        Ok(())
    })
}

pub struct SetupOptions {
    pub for_user: String,
    pub proxy_ports: Vec<u16>,
}

pub fn setup(options: &SetupOptions) -> Result<InstallRecord> {
    if !is_elevated_admin()? {
        return Err(Error::msg("setup must run elevated (as Administrator)"));
    }
    let for_user = Sid::parse(&options.for_user)?;
    let for_user_sddl = for_user.to_sddl();

    account::ensure_group(GROUP)?;
    let mut random = random_bytes(32)?;
    let mut password = password_from(&random).into_bytes();
    wipe(&mut random);
    let created = account::ensure_user(ACCOUNT, std::str::from_utf8(&password).unwrap_or_default());
    let protected = created.and_then(|()| dpapi::protect(&password));
    wipe(&mut password);
    let protected = protected?;
    account::add_member(GROUP, ACCOUNT)?;
    if account::is_administrator(ACCOUNT)? {
        account::delete_user(ACCOUNT)?;
        return Err(Error::msg("the sandbox account is a member of Administrators; it was removed, refusing"));
    }
    account::hide_from_sign_in(ACCOUNT)?;
    let account_sid = Sid::lookup(ACCOUNT)?.ok_or_else(|| Error::msg("the sandbox account has no SID"))?;
    let group_sid = Sid::lookup(GROUP)?.ok_or_else(|| Error::msg("the sandbox group has no SID"))?;
    // The account's own profile, so its HKCU is its own hive and not `HKU\.DEFAULT` (`profile.rs`).
    profile::ensure(&account_sid, ACCOUNT)?;

    let dir = install_dir()?;
    fs::create_dir_all(&dir)?;
    protect_dir(&dir, &format!("D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;{for_user_sddl})"))?;
    let bin = dir.join(RUNNER_DIR);
    fs::create_dir_all(&bin)?;
    protect_dir(
        &bin,
        &format!(
            "D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;{for_user_sddl})(A;OICI;0x1200a9;;;{})",
            group_sid.to_sddl()
        ),
    )?;
    let runner = bin.join(RUNNER_FILE);
    fs::copy(std::env::current_exe()?, &runner)?;

    write_new_protected(
        &dir.join(PASSWORD_FILE),
        &format!("D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;{for_user_sddl})"),
        &protected,
    )?;

    // The volume capability's root grants (`volume.rs`). The system drive must take it; another fixed volume
    // that refuses (locked, or not NTFS) is reported and left out.
    let volume_sid = volume::capability_sid()?;
    let system_root = system_drive_root();
    let mut volume_roots = Vec::new();
    for root in volume::fixed_roots() {
        match volume::grant(&root, &volume_sid) {
            Ok(()) => volume_roots.push(root),
            Err(err) if !root.eq_ignore_ascii_case(&system_root) => {
                eprintln!("tau-windows-sandbox setup: {root} not granted to the volume capability: {err}");
            }
            Err(err) => return Err(err),
        }
    }

    let rules = firewall::ensure_rules(&account_sid.to_sddl(), &options.proxy_ports)?;
    let filters = wfp::install(&account_sid.to_sddl(), &options.proxy_ports)?;

    let record = InstallRecord {
        version: RECORD_VERSION,
        account: ACCOUNT.to_owned(),
        account_sid: account_sid.to_sddl(),
        group: GROUP.to_owned(),
        group_sid: group_sid.to_sddl(),
        proxy_ports: options.proxy_ports.clone(),
        firewall_rules: rules,
        wfp_filters: filters,
        for_user: for_user_sddl,
        runner: runner.to_string_lossy().into_owned(),
        volume_capability_sid: Some(volume_sid.to_sddl()),
        volume_roots,
    };
    let bytes = serde_json::to_vec_pretty(&record).map_err(|err| Error::msg(err.to_string()))?;
    let record_path = dir.join(RECORD_FILE);
    let staged = dir.join("install.json.tmp");
    fs::write(&staged, &bytes)?;
    fs::rename(&staged, &record_path)?;
    Ok(record)
}

pub fn revoke() -> Result<()> {
    if !is_elevated_admin()? {
        return Err(Error::msg("revoke must run elevated (as Administrator)"));
    }
    let mut errors = Vec::new();
    let mut note = |result: Result<()>| {
        if let Err(err) = result {
            errors.push(err.to_string());
        }
    };
    let record = load_record().ok().flatten();
    // The volume capability's grants: every recorded root, and every fixed root now, in case a record was lost.
    if let Ok(volume_sid) = volume::capability_sid() {
        let mut roots = record.as_ref().map(|r| r.volume_roots.clone()).unwrap_or_default();
        for root in volume::fixed_roots() {
            if !roots.iter().any(|known| known.eq_ignore_ascii_case(&root)) {
                roots.push(root);
            }
        }
        for root in roots {
            note(volume::revoke(&root, &volume_sid));
        }
    }
    let recorded = record.map(|r| r.firewall_rules).unwrap_or_default();
    let mut names: Vec<&str> = FIREWALL_RULES.to_vec();
    for name in &recorded {
        if name.starts_with("tau_sandbox_") && !names.contains(&name.as_str()) {
            names.push(name);
        }
    }
    note(firewall::remove_rules(&names));
    note(wfp::remove());
    match Sid::lookup(ACCOUNT) {
        Ok(Some(sid)) => note(profile::remove(&sid)),
        Ok(None) => {}
        Err(err) => note(Err(err)),
    }
    note(account::delete_user(ACCOUNT));
    note(account::delete_group(GROUP));
    note(account::unhide(ACCOUNT));
    if let Ok(dir) = install_dir() {
        match fs::remove_dir_all(&dir) {
            Ok(()) => {}
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
            Err(err) => errors.push(format!("remove {}: {err}", dir.display())),
        }
    }
    if errors.is_empty() { Ok(()) } else { Err(Error::msg(errors.join("; "))) }
}
