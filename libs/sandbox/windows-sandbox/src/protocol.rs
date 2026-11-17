//! JSON payloads of the framed protocol (README "Launch protocol") and of the internal runner channel.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::spec::Stdio;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Ready {
    pub launcher_pid: u32,
    pub runner_pid: u32,
    pub capability_sid: String,
    pub journal: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Started {
    pub shell_pid: u32,
}

/// `exit`: `{ "exitCode": n }` when the shell ended by itself, `{ "signal": "SIGKILL" }` when the job was
/// killed (`terminate`, closed stdin, or the runner died).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(untagged)]
pub enum Exit {
    Code {
        #[serde(rename = "exitCode")]
        exit_code: i64,
    },
    Signal {
        signal: String,
    },
}

impl Exit {
    pub fn killed() -> Self {
        Exit::Signal { signal: "SIGKILL".to_owned() }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RefusedStatus {
    SandboxUnavailable,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Refused {
    pub status: RefusedStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requirement: Option<String>,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagnostic: Option<String>,
}

impl Refused {
    pub fn unavailable(message: impl Into<String>, diagnostic: Option<String>) -> Self {
        Self { status: RefusedStatus::SandboxUnavailable, requirement: None, message: message.into(), diagnostic }
    }

    /// `sandbox-unavailable` while another launch holds what this one needs; `requirement` says what.
    pub fn busy(requirement: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            status: RefusedStatus::SandboxUnavailable,
            requirement: Some(requirement.into()),
            message: message.into(),
            diagnostic: None,
        }
    }

    pub fn unsupported(requirement: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            status: RefusedStatus::Unsupported,
            requirement: Some(requirement.into()),
            message: message.into(),
            diagnostic: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CleanupFailed {
    pub message: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Resize {
    pub columns: u16,
    pub rows: u16,
}

/// What `launch` sends the runner as its first frame. The runner re-checks the executable.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunnerSpec {
    pub capability_sid: String,
    /// The launch's fresh AppContainer package SID; the shell's lowbox token is minted for it.
    pub package_sid: String,
    /// The name `package_sid` was derived from; the runner registers it with `CreateAppContainerProfile` for
    /// the launch and deletes it at the end.
    pub package_name: String,
    /// The person running `launch`: the runner grants it query access to the shell's process and token, so
    /// the host can check the token from outside.
    pub person_sid: String,
    /// `WinSta0\<private desktop>`, created by `launch`.
    pub desktop: String,
    pub executable: String,
    /// The launch's `executableDigest`, which `launch` already checked on a handle it holds until the process
    /// exists. The runner needs it only to admit an executable outside the fixed roots.
    #[serde(default)]
    pub executable_digest: Option<String>,
    pub arguments: Vec<String>,
    pub working_directory: String,
    pub environment: BTreeMap<String, String>,
    pub stdio: Stdio,
}

/// Runner to launcher: why the shell could not be prepared or started.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunnerError {
    pub stage: String,
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exit_payloads_match_the_readme() {
        assert_eq!(serde_json::to_string(&Exit::Code { exit_code: 1 }).unwrap(), r#"{"exitCode":1}"#);
        assert_eq!(serde_json::to_string(&Exit::killed()).unwrap(), r#"{"signal":"SIGKILL"}"#);
    }

    #[test]
    fn refused_payloads_match_the_readme() {
        let refused = Refused::unsupported("network-isolation", "no proxy yet");
        assert_eq!(
            serde_json::to_string(&refused).unwrap(),
            r#"{"status":"unsupported","requirement":"network-isolation","message":"no proxy yet"}"#
        );
        let refused = Refused::unavailable("not installed", None);
        assert_eq!(
            serde_json::to_string(&refused).unwrap(),
            r#"{"status":"sandbox-unavailable","message":"not installed"}"#
        );
    }

    #[test]
    fn ready_uses_camel_case() {
        let ready = Ready {
            launcher_pid: 1,
            runner_pid: 2,
            capability_sid: "S-1-5-21-1-2-3-4".into(),
            journal: "C:\\j".into(),
        };
        assert_eq!(
            serde_json::to_string(&ready).unwrap(),
            r#"{"launcherPid":1,"runnerPid":2,"capabilitySid":"S-1-5-21-1-2-3-4","journal":"C:\\j"}"#
        );
    }

    #[test]
    fn resize_rejects_unknown_fields() {
        assert_eq!(
            serde_json::from_str::<Resize>(r#"{"columns":80,"rows":24}"#).unwrap(),
            Resize { columns: 80, rows: 24 }
        );
        assert!(serde_json::from_str::<Resize>(r#"{"columns":80,"rows":24,"x":1}"#).is_err());
    }
}
