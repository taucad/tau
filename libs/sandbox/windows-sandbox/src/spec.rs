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
    pub const ABSOLUTE_PATHS: &str = "absolute-paths";
    pub const ENVIRONMENT: &str = "environment";
    pub const STDIO: &str = "stdio";
    pub const NETWORK_ISOLATION: &str = "network-isolation";
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum Stdio {
    Pipes,
    Terminal { columns: u16, rows: u16 },
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

/// Where a shell executable may live: `%ProgramFiles%` and `%SystemRoot%`, as the OS reports them.
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

pub fn check_executable(executable: &str, roots: &ExecutableRoots) -> Result<String, Refused> {
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
    let allowed = [program_files, system_root].into_iter().flatten().any(|root| is_within(&path, &root));
    if !allowed {
        return Err(refuse("the executable must lie under %ProgramFiles% or %SystemRoot%".to_owned()));
    }
    Ok(path)
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
    let executable = check_executable(&spec.executable, roots)?;
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
    for (path, _) in &grants {
        if is_within(&journal, path) {
            return Err(Refused::unsupported(
                requirement::SPEC,
                "the journal must not lie inside a path the sandbox is granted or denied",
            ));
        }
    }
    // Stable order: by access class, then by depth so parents come before their children.
    grants.sort_by(|(a_path, a_access), (b_path, b_access)| {
        a_access.cmp(b_access).then(a_path.matches('\\').count().cmp(&b_path.matches('\\').count()))
    });

    Ok(ValidSpec {
        executable,
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
    fn deduplicates_paths_case_insensitively() {
        let mut spec = base();
        spec["filesystem"]["writable"] = serde_json::json!(["C:\\Users\\a\\home", "c:\\users\\A\\HOME\\"]);
        let valid = check(spec).unwrap();
        assert_eq!(valid.grants.iter().filter(|(_, a)| *a == Access::Write).count(), 1);
    }
}
