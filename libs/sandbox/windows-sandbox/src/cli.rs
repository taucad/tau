//! Command-line parsing (README "Subcommands").

use crate::install::{PROXY_PORTS, parse_ports};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    /// `quick`: the install record and the account's profile only, without the network fence or the volume roots.
    Status {
        quick: bool,
    },
    Setup {
        for_user: String,
        proxy_ports: Vec<u16>,
    },
    Revoke,
    Launch,
    Runner {
        pipe_in: String,
        pipe_out: String,
        launcher_pid: u32,
    },
    Restore {
        journal: String,
    },
}

pub const USAGE: &str = "usage: tau-windows-sandbox <status [--quick] | setup --for-user <SID> [--proxy-ports <ports>] | revoke | launch | restore --journal <path>>";

fn options(args: &[String], allowed: &[&str]) -> Result<Vec<(String, String)>, String> {
    let mut out: Vec<(String, String)> = Vec::new();
    let mut iter = args.iter();
    while let Some(flag) = iter.next() {
        if !allowed.contains(&flag.as_str()) {
            return Err(format!("unknown option {flag:?}"));
        }
        if out.iter().any(|(f, _)| f == flag) {
            return Err(format!("option {flag} given twice"));
        }
        let value = iter.next().ok_or_else(|| format!("option {flag} needs a value"))?;
        out.push((flag.clone(), value.clone()));
    }
    Ok(out)
}

fn take(options: &[(String, String)], flag: &str) -> Option<String> {
    options.iter().find(|(f, _)| f == flag).map(|(_, v)| v.clone())
}

fn is_sid(text: &str) -> bool {
    text.strip_prefix("S-1-").is_some_and(|rest| {
        !rest.is_empty() && rest.split('-').all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
    })
}

pub fn parse(args: &[String]) -> Result<Command, String> {
    let (command, rest) = args.split_first().ok_or_else(|| USAGE.to_owned())?;
    match command.as_str() {
        "status" if rest.len() == 1 && rest[0] == "--quick" => Ok(Command::Status { quick: true }),
        "status" | "revoke" | "launch" if !rest.is_empty() => Err(format!("{command} takes no options")),
        "status" => Ok(Command::Status { quick: false }),
        "revoke" => Ok(Command::Revoke),
        "launch" => Ok(Command::Launch),
        "setup" => {
            let opts = options(rest, &["--for-user", "--proxy-ports"])?;
            let for_user = take(&opts, "--for-user").ok_or("setup needs --for-user <SID>")?;
            if !is_sid(&for_user) {
                return Err(format!("--for-user {for_user:?} is not a SID"));
            }
            let proxy_ports = match take(&opts, "--proxy-ports") {
                Some(text) => parse_ports(&text)?,
                None => PROXY_PORTS.to_vec(),
            };
            Ok(Command::Setup { for_user, proxy_ports })
        }
        "runner" => {
            let opts = options(rest, &["--pipe-in", "--pipe-out", "--launcher-pid"])?;
            let pipe = |flag: &str| -> Result<String, String> {
                let name = take(&opts, flag).ok_or(format!("runner needs {flag}"))?;
                if !name.starts_with("\\\\.\\pipe\\tau-sandbox-") {
                    return Err(format!("{flag} is not a sandbox pipe"));
                }
                Ok(name)
            };
            let launcher_pid = take(&opts, "--launcher-pid")
                .and_then(|pid| pid.parse::<u32>().ok())
                .ok_or("runner needs --launcher-pid <pid>")?;
            Ok(Command::Runner { pipe_in: pipe("--pipe-in")?, pipe_out: pipe("--pipe-out")?, launcher_pid })
        }
        "restore" => {
            let opts = options(rest, &["--journal"])?;
            Ok(Command::Restore { journal: take(&opts, "--journal").ok_or("restore needs --journal <path>")? })
        }
        other => Err(format!("unknown command {other:?}\n{USAGE}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(text: &[&str]) -> Vec<String> {
        text.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parses_every_subcommand() {
        assert_eq!(parse(&args(&["status"])).unwrap(), Command::Status { quick: false });
        assert_eq!(parse(&args(&["status", "--quick"])).unwrap(), Command::Status { quick: true });
        assert_eq!(parse(&args(&["revoke"])).unwrap(), Command::Revoke);
        assert_eq!(parse(&args(&["launch"])).unwrap(), Command::Launch);
        assert_eq!(
            parse(&args(&["setup", "--for-user", "S-1-5-21-1-2-3-1001"])).unwrap(),
            Command::Setup { for_user: "S-1-5-21-1-2-3-1001".into(), proxy_ports: PROXY_PORTS.to_vec() }
        );
        assert_eq!(
            parse(&args(&["setup", "--proxy-ports", "5000-5001", "--for-user", "S-1-5-21-1-2-3-1001"])).unwrap(),
            Command::Setup { for_user: "S-1-5-21-1-2-3-1001".into(), proxy_ports: vec![5000, 5001] }
        );
        assert_eq!(
            parse(&args(&["restore", "--journal", "C:\\j.json"])).unwrap(),
            Command::Restore { journal: "C:\\j.json".into() }
        );
        assert_eq!(
            parse(&args(&[
                "runner",
                "--pipe-in",
                "\\\\.\\pipe\\tau-sandbox-ab-in",
                "--pipe-out",
                "\\\\.\\pipe\\tau-sandbox-ab-out",
                "--launcher-pid",
                "42"
            ]))
            .unwrap(),
            Command::Runner {
                pipe_in: "\\\\.\\pipe\\tau-sandbox-ab-in".into(),
                pipe_out: "\\\\.\\pipe\\tau-sandbox-ab-out".into(),
                launcher_pid: 42
            }
        );
    }

    #[test]
    fn refuses_malformed_invocations() {
        for bad in [
            &[][..],
            &["frobnicate"],
            &["status", "--x", "1"],
            &["status", "--quick", "--quick"],
            &["status", "--quick", "1"],
            &["setup"],
            &["setup", "--for-user", "alice"],
            &["setup", "--for-user", "S-1-5-21-1", "--for-user", "S-1-5-21-2"],
            &["setup", "--for-user"],
            &["restore"],
            &[
                "runner",
                "--pipe-in",
                "\\\\.\\pipe\\other",
                "--pipe-out",
                "\\\\.\\pipe\\tau-sandbox-x",
                "--launcher-pid",
                "1",
            ],
            &["runner", "--pipe-in", "\\\\.\\pipe\\tau-sandbox-a", "--pipe-out", "\\\\.\\pipe\\tau-sandbox-b"],
        ] {
            assert!(parse(&args(bad)).is_err(), "{bad:?}");
        }
    }
}
