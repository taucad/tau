//! `tau-store-guard`: the Linux Terminal's git store guard (Linux Terminal git parity blueprint, LP2).
//!
//! ```text
//! tau-store-guard launch --protect <name>... --store <git dir>... [--bypass <name>...] -- <command> [<argument>...]
//! tau-store-guard check <git dir> <protected name>
//! tau-store-guard --version
//! ```
//!
//! `launch` runs inside an outer namespace with `CAP_SYS_ADMIN`; see [`launch`]. `check` runs inside the nested
//! sandbox during the host's start check. Exit codes: 0 success; 1 a failed check; 2 usage; 3 a store that cannot be
//! opened; 4 a refused mount; 5 a server that cannot start; 6 a bypass bind; 7 the capability drop; 8 the exec.

mod guard;
mod launch;
mod policy;
mod sys;

use std::ffi::OsString;
use std::path::PathBuf;
use std::process::ExitCode;

const USAGE: &str = "usage: tau-store-guard launch --protect <name>... --store <git dir>... [--bypass <name>...] -- <command>...\n       tau-store-guard check <git dir> <protected name>";

fn parse_launch(arguments: Vec<OsString>) -> Result<launch::Launch, String> {
    let mut names = Vec::new();
    let mut stores = Vec::new();
    let mut bypass = Vec::new();
    let mut rest = arguments.into_iter();
    while let Some(flag) = rest.next() {
        if flag == "--" {
            break;
        }
        let value = rest.next().ok_or_else(|| format!("{} needs a value", flag.to_string_lossy()))?;
        match flag.to_str() {
            Some("--protect") => names.push(value),
            Some("--store") => stores.push(PathBuf::from(value)),
            Some("--bypass") => bypass.push(value),
            _ => return Err(format!("unknown option {}", flag.to_string_lossy())),
        }
    }
    let command: Vec<OsString> = rest.collect();
    let policy = policy::Policy::new(names)?;
    // A bypassed name skips the guard, so it may never be a protected one.
    for name in &bypass {
        let path = PathBuf::from(name);
        let plain = matches!(path.components().collect::<Vec<_>>()[..], [std::path::Component::Normal(_)]);
        if policy.protects(&path) || !plain {
            return Err(format!("{} may not bypass the guard", name.to_string_lossy()));
        }
    }
    Ok(launch::Launch { policy, stores, bypass, command })
}

fn main() -> ExitCode {
    let mut arguments: Vec<OsString> = std::env::args_os().skip(1).collect();
    if arguments.is_empty() {
        eprintln!("{USAGE}");
        return ExitCode::from(2);
    }
    let mode = arguments.remove(0);
    match mode.to_str() {
        Some("--version") => {
            println!("tau-store-guard {}", env!("CARGO_PKG_VERSION"));
            ExitCode::SUCCESS
        }
        Some("launch") => match parse_launch(arguments) {
            Ok(request) => {
                let failure = launch::launch(request);
                eprintln!("tau-store-guard: {}", failure.message);
                ExitCode::from(u8::try_from(failure.code).unwrap_or(1))
            }
            Err(message) => {
                eprintln!("tau-store-guard: {message}\n{USAGE}");
                ExitCode::from(2)
            }
        },
        Some("check") if arguments.len() == 2 => match launch::check(&PathBuf::from(&arguments[0]), &arguments[1]) {
            Ok(()) => {
                println!("ok");
                ExitCode::SUCCESS
            }
            Err(message) => {
                eprintln!("tau-store-guard: check: {message}");
                ExitCode::from(1)
            }
        },
        _ => {
            eprintln!("{USAGE}");
            ExitCode::from(2)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments(text: &[&str]) -> Vec<OsString> {
        text.iter().map(OsString::from).collect()
    }

    #[test]
    fn parses_a_launch() {
        let launch = parse_launch(arguments(&[
            "--protect",
            "config",
            "--store",
            "/p/.git",
            "--bypass",
            "objects",
            "--",
            "bwrap",
            "--",
            "sh",
        ]))
        .unwrap();
        assert_eq!(launch.stores, vec![PathBuf::from("/p/.git")]);
        assert_eq!(launch.command, arguments(&["bwrap", "--", "sh"]));
    }

    #[test]
    fn refuses_a_protected_or_nested_bypass() {
        for bypass in ["config", "objects/pack", ".."] {
            assert!(
                parse_launch(arguments(&["--protect", "config", "--bypass", bypass, "--store", "/s", "--", "x"]))
                    .is_err(),
                "{bypass}"
            );
        }
    }
}
