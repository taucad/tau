//! The launch spec (`0x01`) and its validation. Anything the helper cannot enforce is refused as
//! `unsupported` with a `requirement`, before any ACL, account or process is touched.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

use crate::paths::{extension, is_within, normalize_absolute};
use crate::protocol::Refused;

pub const SPEC_VERSION: u32 = 1;

/// `requirement` values of an `unsupported` refusal.
pub mod requirement {
    pub const SPEC: &str = "spec";
    pub const SPEC_VERSION: &str = "spec-version";
    pub const EXECUTABLE: &str = "executable";
    pub const EXECUTABLE_DIGEST: &str = "executable-digest";
    pub const ABSOLUTE_PATHS: &str = "absolute-paths";
    pub const ENVIRONMENT: &str = "environment";
    pub const STDIO: &str = "stdio";
    pub const NETWORK_ISOLATION: &str = "network-isolation";
    /// Not an `unsupported` value: the requirement a `sandbox-unavailable` refusal carries while another launch
    /// holds the sandbox (README "Sessions"), so a host can wait and retry without matching the message.
    pub const EXCLUSIVE_LAUNCH: &str = "exclusive-launch";
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum Stdio {
    /// `input: true` gives the child a stdin pipe the host writes with `input` and ends with `close-input`;
    /// without it the child's stdin is `NUL`, as it always was.
    Pipes {
        #[serde(default)]
        input: bool,
    },
    Terminal {
        columns: u16,
        rows: u16,
    },
}

impl Stdio {
    /// Whether the host's `input` frames reach the child.
    pub fn takes_input(&self) -> bool {
        matches!(self, Stdio::Terminal { .. } | Stdio::Pipes { input: true })
    }

    /// Whether the host's `close-input` frame ends the child's stdin.
    pub fn closes_input(&self) -> bool {
        matches!(self, Stdio::Pipes { input: true })
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Filesystem {
    #[serde(default)]
    pub readable: Vec<String>,
    #[serde(default)]
    pub writable: Vec<String>,
    #[serde(default)]
    pub read_only: Vec<String>,
    #[serde(default)]
    pub denied: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Network {
    #[serde(default)]
    pub domains: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LaunchSpec {
    pub version: u32,
    pub executable: String,
    /// `sha256:<64 lowercase hex>` of the executable's bytes. Required for an executable outside the fixed
    /// roots; checked when given for one inside them.
    #[serde(default)]
    pub executable_digest: Option<String>,
    #[serde(default)]
    pub arguments: Vec<String>,
    pub working_directory: String,
    #[serde(default)]
    pub environment: BTreeMap<String, String>,
    pub stdio: Stdio,
    #[serde(default)]
    pub filesystem: Filesystem,
    #[serde(default)]
    pub network: Option<Network>,
    pub journal: String,
}

/// The fixed roots an executable may lie under without more: `%ProgramFiles%` and `%SystemRoot%`, as the OS
/// reports them. An executable elsewhere is a native worker's, admitted only with its digest and an unwritable
/// runtime root ([`validate`]).
#[derive(Debug, Clone)]
pub struct ExecutableRoots {
    pub program_files: String,
    pub system_root: String,
}

/// What a grant does to a path. A path named in several sets gets every grant; `Denied` wins for reads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Access {
    /// Account read and execute.
    Read,
    /// Account and capability SID read, write and delete.
    Write,
    /// Account read; capability SID denied every write right, so a read-only path inside a writable root
    /// stays read-only.
    ReadOnly,
    /// `TauSandboxUsers` denied all access.
    Denied,
}

/// A validated spec: every path normalised, the executable checked, the ACL plan in a stable order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidSpec {
    pub executable: String,
    /// The SHA-256 the executable's bytes must have, checked on a handle held until the process exists.
    pub executable_digest: Option<[u8; 32]>,
    /// The folder holding an executable outside the fixed roots: granted readable, never writable.
    pub runtime_root: Option<String>,
    pub arguments: Vec<String>,
    pub working_directory: String,
    pub environment: BTreeMap<String, String>,
    pub stdio: Stdio,
    pub journal: String,
    /// (path, access) in application order: grants first, then read-only, then denials.
    pub grants: Vec<(String, Access)>,
}

pub fn parse(payload: &[u8]) -> Result<LaunchSpec, Refused> {
    serde_json::from_slice(payload)
        .map_err(|err| Refused::unsupported(requirement::SPEC, format!("the launch spec is not understood: {err}")))
}

/// Where an admitted executable lies.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Executable {
    pub path: String,
    /// `None` under the fixed roots; otherwise the executable's folder, the runtime root.
    pub runtime_root: Option<String>,
}

/// Parse `sha256:<64 lowercase hex>`.
pub fn parse_digest(digest: &str) -> Result<[u8; 32], Refused> {
    let refuse = || {
        Refused::unsupported(
            requirement::EXECUTABLE_DIGEST,
            "executableDigest must be sha256:<64 lowercase hex digits>",
        )
    };
    let hex = digest.strip_prefix("sha256:").ok_or_else(refuse)?;
    if hex.len() != 64 || !hex.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
        return Err(refuse());
    }
    let mut bytes = [0u8; 32];
    for (index, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16).map_err(|_| refuse())?;
    }
    Ok(bytes)
}

/// `sha256:<64 lowercase hex>` for a digest.
pub fn format_digest(digest: &[u8; 32]) -> String {
    let mut text = String::from("sha256:");
    for byte in digest {
        text.push_str(&format!("{byte:02x}"));
    }
    text
}

/// The executable's path checks, made by `launch` and again by the runner: an absolute `.exe`, under the
/// fixed roots, or anywhere else only with a digest and below a folder that is not a drive root.
pub fn check_executable(
    executable: &str,
    digest: Option<&str>,
    roots: &ExecutableRoots,
) -> Result<Executable, Refused> {
    let refuse = |message: String| Refused::unsupported(requirement::EXECUTABLE, message);
    let path =
        normalize_absolute(executable).map_err(|err| refuse(format!("the executable path is refused: {err}")))?;
    match extension(&path).as_deref() {
        Some("exe") => {}
        Some("cmd" | "bat") => return Err(refuse("batch files are not launched".to_owned())),
        _ => return Err(refuse("the executable must be an .exe".to_owned())),
    }
    let program_files = normalize_absolute(&roots.program_files).ok();
    let system_root = normalize_absolute(&roots.system_root).ok();
    let fixed = [program_files, system_root].into_iter().flatten().any(|root| is_within(&path, &root));
    if fixed {
        return Ok(Executable { path, runtime_root: None });
    }
    if digest.is_none() {
        return Err(refuse(
            "an executable outside %ProgramFiles% and %SystemRoot% needs its executableDigest".to_owned(),
        ));
    }
    let runtime_root = match path.rsplit_once('\\') {
        Some((parent, _)) if parent.len() > 2 => parent.to_owned(),
        _ => return Err(refuse("an executable outside the fixed roots must not lie in a drive root".to_owned())),
    };
    Ok(Executable { path, runtime_root: Some(runtime_root) })
}

/// A runtime root must be readable through a `readable` or `readOnly` grant that covers it, and no `writable`
/// grant may equal, contain or lie inside it: the worker loads DLLs and extension modules from that tree.
fn check_runtime_root(runtime_root: &str, grants: &[(String, Access)]) -> Result<(), Refused> {
    let refuse = |message: String| Refused::unsupported(requirement::EXECUTABLE, message);
    let covered = grants
        .iter()
        .any(|(path, access)| matches!(access, Access::Read | Access::ReadOnly) && is_within(runtime_root, path));
    if !covered {
        return Err(refuse(format!(
            "the runtime root {runtime_root:?} must be covered by a filesystem.readable or filesystem.readOnly path"
        )));
    }
    if let Some((path, _)) = grants.iter().find(|(path, access)| {
        *access == Access::Write && (is_within(path, runtime_root) || is_within(runtime_root, path))
    }) {
        return Err(refuse(format!(
            "the writable path {path:?} overlaps the runtime root {runtime_root:?}, which must stay unwritable"
        )));
    }
    Ok(())
}

fn absolute(path: &str, what: &str) -> Result<String, Refused> {
    normalize_absolute(path)
        .map_err(|err| Refused::unsupported(requirement::ABSOLUTE_PATHS, format!("{what} {path:?} is refused: {err}")))
}

pub fn validate(spec: LaunchSpec, roots: &ExecutableRoots) -> Result<ValidSpec, Refused> {
    if spec.version != SPEC_VERSION {
        return Err(Refused::unsupported(
            requirement::SPEC_VERSION,
            format!("launch spec version {} is not supported (expected {SPEC_VERSION})", spec.version),
        ));
    }
    if let Some(network) = &spec.network
        && !network.domains.is_empty()
    {
        return Err(Refused::unsupported(
            requirement::NETWORK_ISOLATION,
            "per-launch network domains need the sandbox proxy, which this helper does not provide yet",
        ));
    }
    let executable = check_executable(&spec.executable, spec.executable_digest.as_deref(), roots)?;
    let executable_digest = spec.executable_digest.as_deref().map(parse_digest).transpose()?;
    if spec.arguments.iter().any(|arg| arg.contains('\0')) {
        return Err(Refused::unsupported(requirement::SPEC, "an argument contains NUL"));
    }
    let mut seen = BTreeSet::new();
    for (name, value) in &spec.environment {
        if name.is_empty() || name.contains('=') || name.contains('\0') || value.contains('\0') {
            return Err(Refused::unsupported(
                requirement::ENVIRONMENT,
                format!("environment variable {name:?} cannot be expressed in a Windows environment block"),
            ));
        }
        if !seen.insert(name.to_uppercase()) {
            return Err(Refused::unsupported(
                requirement::ENVIRONMENT,
                format!("environment variable {name:?} is given twice with different case"),
            ));
        }
    }
    if let Stdio::Terminal { columns, rows } = spec.stdio
        && (columns == 0 || rows == 0)
    {
        return Err(Refused::unsupported(requirement::STDIO, "terminal size must be at least 1x1"));
    }
    let working_directory = absolute(&spec.working_directory, "workingDirectory")?;
    let journal = absolute(&spec.journal, "journal")?;

    let mut grants = Vec::new();
    let sets: [(&[String], Access, &str); 4] = [
        (&spec.filesystem.readable, Access::Read, "filesystem.readable"),
        (&spec.filesystem.writable, Access::Write, "filesystem.writable"),
        (&spec.filesystem.read_only, Access::ReadOnly, "filesystem.readOnly"),
        (&spec.filesystem.denied, Access::Denied, "filesystem.denied"),
    ];
    let mut planned = BTreeSet::new();
    for (paths, access, what) in sets {
        for path in paths {
            let path = absolute(path, what)?;
            if planned.insert((path.to_uppercase(), access)) {
                grants.push((path, access));
            }
        }
    }
    if let Some(runtime_root) = &executable.runtime_root {
        check_runtime_root(runtime_root, &grants)?;
    }
    // The shell must never read or rewrite the record that restores the descriptors: no granted path may hold it.
    // A denied path may, and is the natural place (Tau keeps its journals in its own app data, which every launch
    // denies whole): the deny is the strongest protection the journal can have, and `launch` leaves the journal out
    // of the descriptors it records.
    for (path, access) in &grants {
        if *access != Access::Denied && is_within(&journal, path) {
            return Err(Refused::unsupported(
                requirement::SPEC,
                "the journal must not lie inside a path the sandbox is granted",
            ));
        }
    }
    // Stable order: by access class, then by depth so parents come before their children.
    grants.sort_by(|(a_path, a_access), (b_path, b_access)| {
        a_access.cmp(b_access).then(a_path.matches('\\').count().cmp(&b_path.matches('\\').count()))
    });

    Ok(ValidSpec {
        executable: executable.path,
        executable_digest,
        runtime_root: executable.runtime_root,
        arguments: spec.arguments,
        working_directory,
        environment: spec.environment,
        stdio: spec.stdio,
        journal,
        grants,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::RefusedStatus;

    fn roots() -> ExecutableRoots {
        ExecutableRoots { program_files: "C:\\Program Files".into(), system_root: "C:\\Windows".into() }
    }

    fn base() -> serde_json::Value {
        serde_json::json!({
            "version": 1,
            "executable": "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
            "arguments": ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "Get-Date"],
            "workingDirectory": "C:\\Users\\a\\project",
            "environment": { "PATH": "C:\\Windows\\System32", "TEMP": "C:\\Users\\a\\tmp" },
            "stdio": { "kind": "pipes" },
            "filesystem": {
                "readable": ["C:\\Users\\a\\project"],
                "writable": ["C:\\Users\\a\\home", "C:\\Users\\a\\tmp"],
                "readOnly": ["C:\\Users\\a\\home\\.git"],
                "denied": ["C:\\Users\\a\\project\\.env"]
            },
            "journal": "C:\\Users\\a\\AppData\\Roaming\\Tau\\shell-custody\\x.acl.json"
        })
    }

    fn check(value: serde_json::Value) -> Result<ValidSpec, Refused> {
        validate(parse(&serde_json::to_vec(&value).unwrap())?, &roots())
    }

    fn requirement_of(value: serde_json::Value) -> String {
        let refused = check(value).unwrap_err();
        assert_eq!(refused.status, RefusedStatus::Unsupported);
        refused.requirement.unwrap()
    }

    #[test]
    fn accepts_the_readme_spec_and_plans_grants_in_order() {
        let valid = check(base()).unwrap();
        assert_eq!(valid.executable, "C:\\Program Files\\PowerShell\\7\\pwsh.exe");
        let accesses: Vec<Access> = valid.grants.iter().map(|(_, a)| *a).collect();
        assert_eq!(accesses, vec![Access::Read, Access::Write, Access::Write, Access::ReadOnly, Access::Denied]);
    }

    #[test]
    fn accepts_windows_powershell_and_a_terminal() {
        let mut spec = base();
        spec["executable"] = "c:/windows/System32/WindowsPowerShell/v1.0/powershell.exe".into();
        spec["stdio"] = serde_json::json!({ "kind": "terminal", "columns": 120, "rows": 30 });
        let valid = check(spec).unwrap();
        assert_eq!(valid.stdio, Stdio::Terminal { columns: 120, rows: 30 });
    }

    #[test]
    fn refuses_other_versions() {
        let mut spec = base();
        spec["version"] = 2.into();
        assert_eq!(requirement_of(spec), requirement::SPEC_VERSION);
    }

    #[test]
    fn refuses_unknown_fields_fail_closed() {
        let mut spec = base();
        spec["timeoutMs"] = 5.into();
        assert_eq!(requirement_of(spec), requirement::SPEC);
        let mut spec = base();
        spec["filesystem"]["hidden"] = serde_json::json!([]);
        assert_eq!(requirement_of(spec), requirement::SPEC);
    }

    #[test]
    fn refuses_executables_outside_the_fixed_roots_or_batch_files() {
        for exe in [
            "C:\\Users\\a\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe",
            "C:\\Program Files (x86)\\x\\pwsh.exe",
            "C:\\Windows\\System32\\cmd.cmd",
            "C:\\Windows\\System32\\x.bat",
            "C:\\Program Files\\PowerShell\\7\\pwsh",
            "pwsh.exe",
            "C:\\Program Files\\..\\Users\\a\\pwsh.exe",
            "\\\\server\\share\\pwsh.exe",
        ] {
            let mut spec = base();
            spec["executable"] = exe.into();
            assert_eq!(requirement_of(spec), requirement::EXECUTABLE, "{exe}");
        }
    }

    #[test]
    fn refuses_relative_paths() {
        let mut spec = base();
        spec["workingDirectory"] = "project".into();
        assert_eq!(requirement_of(spec), requirement::ABSOLUTE_PATHS);
        let mut spec = base();
        spec["filesystem"]["writable"] = serde_json::json!(["..\\x"]);
        assert_eq!(requirement_of(spec), requirement::ABSOLUTE_PATHS);
        let mut spec = base();
        spec["journal"] = "x.json".into();
        assert_eq!(requirement_of(spec), requirement::ABSOLUTE_PATHS);
    }

    #[test]
    fn refuses_network_domains_until_the_proxy_lands() {
        let mut spec = base();
        spec["network"] = serde_json::json!({ "domains": ["example.com"] });
        assert_eq!(requirement_of(spec), requirement::NETWORK_ISOLATION);
        let mut spec = base();
        spec["network"] = serde_json::json!({ "domains": [] });
        assert!(check(spec).is_ok());
    }

    #[test]
    fn refuses_inexpressible_environments() {
        let mut spec = base();
        spec["environment"] = serde_json::json!({ "A=B": "x" });
        assert_eq!(requirement_of(spec), requirement::ENVIRONMENT);
        let mut spec = base();
        spec["environment"] = serde_json::json!({ "Path": "a", "PATH": "b" });
        assert_eq!(requirement_of(spec), requirement::ENVIRONMENT);
    }

    #[test]
    fn refuses_a_zero_sized_terminal() {
        let mut spec = base();
        spec["stdio"] = serde_json::json!({ "kind": "terminal", "columns": 0, "rows": 30 });
        assert_eq!(requirement_of(spec), requirement::STDIO);
    }

    #[test]
    fn refuses_a_journal_inside_a_granted_root() {
        let mut spec = base();
        spec["journal"] = "C:\\Users\\a\\home\\j.json".into();
        assert_eq!(requirement_of(spec), requirement::SPEC);
    }

    #[test]
    fn refuses_a_journal_inside_a_readable_or_read_only_root() {
        for set in ["readable", "readOnly"] {
            let mut spec = base();
            spec["filesystem"][set] = serde_json::json!(["C:\\Users\\a\\AppData\\Roaming\\Tau"]);
            spec["journal"] = "C:\\Users\\a\\AppData\\Roaming\\Tau\\shell-custody\\j.acl.json".into();
            assert_eq!(requirement_of(spec), requirement::SPEC, "{set}");
        }
    }

    #[test]
    fn accepts_a_journal_inside_a_denied_root() {
        // Tau's desktop keeps its journals in its own app data, under the person's profile, and denies that whole.
        let mut spec = base();
        spec["filesystem"]["denied"] = serde_json::json!(["C:\\Users\\a\\AppData\\Roaming\\Tau"]);
        spec["journal"] = "C:\\Users\\a\\AppData\\Roaming\\Tau\\shell-custody\\j.acl.json".into();
        let valid = check(spec).unwrap();
        assert!(valid.grants.iter().any(|(path, access)| *access == Access::Denied && path.ends_with("Tau")));
    }

    #[test]
    fn deduplicates_paths_case_insensitively() {
        let mut spec = base();
        spec["filesystem"]["writable"] = serde_json::json!(["C:\\Users\\a\\home", "c:\\users\\A\\HOME\\"]);
        let valid = check(spec).unwrap();
        assert_eq!(valid.grants.iter().filter(|(_, a)| *a == Access::Write).count(), 1);
    }

    const DIGEST: &str = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    /// A native worker: an executable outside the fixed roots, its folder readable, an artifact folder writable.
    fn worker() -> serde_json::Value {
        serde_json::json!({
            "version": 1,
            "executable": "C:\\Users\\a\\runtime\\python\\python.exe",
            "executableDigest": DIGEST,
            "arguments": ["-I", "-m", "worker"],
            "workingDirectory": "C:\\Users\\a\\artifacts",
            "stdio": { "kind": "pipes", "input": true },
            "filesystem": {
                "readable": ["C:\\Users\\a\\runtime\\python"],
                "writable": ["C:\\Users\\a\\artifacts"]
            },
            "journal": "C:\\Users\\a\\AppData\\Roaming\\Tau\\shell-custody\\w.acl.json"
        })
    }

    #[test]
    fn accepts_a_native_worker_with_its_digest_and_runtime_root() {
        let valid = check(worker()).unwrap();
        assert_eq!(valid.executable, "C:\\Users\\a\\runtime\\python\\python.exe");
        assert_eq!(valid.runtime_root.as_deref(), Some("C:\\Users\\a\\runtime\\python"));
        let digest = valid.executable_digest.unwrap();
        assert_eq!(digest[0], 0x01);
        assert_eq!(digest[31], 0xef);
        assert_eq!(valid.stdio, Stdio::Pipes { input: true });
    }

    #[test]
    fn digests_round_trip() {
        assert_eq!(format_digest(&parse_digest(DIGEST).unwrap()), DIGEST);
    }

    #[test]
    fn requires_a_digest_outside_the_fixed_roots() {
        let mut spec = worker();
        spec.as_object_mut().unwrap().remove("executableDigest");
        assert_eq!(requirement_of(spec), requirement::EXECUTABLE);
        let mut spec = worker();
        spec["executableDigest"] = serde_json::Value::Null;
        assert_eq!(requirement_of(spec), requirement::EXECUTABLE);
    }

    #[test]
    fn refuses_a_malformed_digest() {
        for digest in [
            "sha256:0123",
            "sha256:0123456789ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef",
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "sha512:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdeg",
            "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0",
        ] {
            let mut spec = worker();
            spec["executableDigest"] = digest.into();
            assert_eq!(requirement_of(spec), requirement::EXECUTABLE_DIGEST, "{digest}");
        }
    }

    #[test]
    fn checks_a_digest_given_for_a_fixed_root_executable() {
        let mut spec = base();
        spec["executableDigest"] = DIGEST.into();
        let valid = check(spec).unwrap();
        assert!(valid.executable_digest.is_some());
        assert_eq!(valid.runtime_root, None);
        let mut spec = base();
        spec["executableDigest"] = "sha256:x".into();
        assert_eq!(requirement_of(spec), requirement::EXECUTABLE_DIGEST);
        assert_eq!(check(base()).unwrap().executable_digest, None);
    }

    #[test]
    fn refuses_a_worker_in_a_drive_root() {
        let mut spec = worker();
        spec["executable"] = "D:\\python.exe".into();
        spec["filesystem"]["readable"] = serde_json::json!(["D:\\"]);
        assert_eq!(requirement_of(spec), requirement::EXECUTABLE);
    }

    #[test]
    fn requires_the_runtime_root_to_be_readable() {
        let mut spec = worker();
        spec["filesystem"]["readable"] = serde_json::json!([]);
        assert_eq!(requirement_of(spec), requirement::EXECUTABLE);
        // A grant below the root does not cover it.
        let mut spec = worker();
        spec["filesystem"]["readable"] = serde_json::json!(["C:\\Users\\a\\runtime\\python\\Lib"]);
        assert_eq!(requirement_of(spec), requirement::EXECUTABLE);
        // A denial is not a grant.
        let mut spec = worker();
        spec["filesystem"]["readable"] = serde_json::json!([]);
        spec["filesystem"]["denied"] = serde_json::json!(["C:\\Users\\a\\runtime\\python"]);
        assert_eq!(requirement_of(spec), requirement::EXECUTABLE);
        // An ancestor's grant, or a read-only one, covers it.
        let mut spec = worker();
        spec["filesystem"]["readable"] = serde_json::json!(["c:\\users\\A\\Runtime"]);
        assert!(check(spec).is_ok());
        let mut spec = worker();
        spec["filesystem"]["readable"] = serde_json::json!([]);
        spec["filesystem"]["readOnly"] = serde_json::json!(["C:\\Users\\a\\runtime\\python"]);
        assert!(check(spec).is_ok());
    }

    #[test]
    fn refuses_a_writable_path_that_overlaps_the_runtime_root() {
        for writable in [
            "C:\\Users\\a\\runtime\\python",
            "c:\\users\\a\\RUNTIME\\python\\",
            "C:\\Users\\a\\runtime\\python\\Lib\\site-packages",
            "C:\\Users\\a\\runtime",
            "C:\\Users",
            "C:\\",
        ] {
            let mut spec = worker();
            spec["filesystem"]["writable"] = serde_json::json!(["C:\\Users\\a\\artifacts", writable]);
            assert_eq!(requirement_of(spec), requirement::EXECUTABLE, "{writable}");
        }
        // A sibling whose name shares a prefix does not overlap.
        let mut spec = worker();
        spec["filesystem"]["writable"] = serde_json::json!(["C:\\Users\\a\\runtime\\python-artifacts"]);
        assert!(check(spec).is_ok());
    }

    #[test]
    fn pipes_take_input_only_when_asked() {
        let mut spec = base();
        spec["stdio"] = serde_json::json!({ "kind": "pipes" });
        let stdio = check(spec).unwrap().stdio;
        assert_eq!(stdio, Stdio::Pipes { input: false });
        assert!(!stdio.takes_input() && !stdio.closes_input());
        let mut spec = base();
        spec["stdio"] = serde_json::json!({ "kind": "pipes", "input": true });
        let stdio = check(spec).unwrap().stdio;
        assert!(stdio.takes_input() && stdio.closes_input());
        let terminal = Stdio::Terminal { columns: 80, rows: 24 };
        assert!(terminal.takes_input() && !terminal.closes_input());
        let mut spec = base();
        spec["stdio"] = serde_json::json!({ "kind": "pipes", "input": "yes" });
        assert_eq!(requirement_of(spec), requirement::SPEC);
        let mut spec = base();
        spec["stdio"] = serde_json::json!({ "kind": "pipes", "echo": true });
        assert_eq!(requirement_of(spec), requirement::SPEC);
    }

    #[test]
    fn the_runner_check_admits_what_launch_admitted() {
        let roots = roots();
        let worker = "C:\\Users\\a\\runtime\\python\\python.exe";
        assert!(check_executable(worker, None, &roots).is_err());
        assert_eq!(
            check_executable(worker, Some(DIGEST), &roots).unwrap().runtime_root.as_deref(),
            Some("C:\\Users\\a\\runtime\\python")
        );
        assert_eq!(check_executable("C:\\Windows\\System32\\cmd.exe", None, &roots).unwrap().runtime_root, None);
    }
}
