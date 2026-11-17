//! The ACL journal: every security descriptor `launch` is about to change, as it was before the change.
//!
//! `launch` writes and fsyncs the journal before it changes any ACL, restores exactly these descriptors at
//! exit, and deletes the journal only once every restore is confirmed. `restore --journal` replays it after
//! a crash. Restoring writes back the recorded DACL and its protected state; it never removes an ACE that
//! was not added by the launch, because it never edits ACEs at all.

use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::Path;

pub const JOURNAL_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileEntry {
    pub path: String,
    /// The DACL as SDDL (`D:...`), exactly as `GetNamedSecurityInfoW` reported it.
    pub sddl: String,
    /// Whether `SE_DACL_PROTECTED` was set (inheritance from the parent blocked).
    pub protected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WindowStationEntry {
    /// The Terminal Services session whose window station this is; a restore from another session skips it.
    pub session_id: u32,
    pub name: String,
    /// The self-relative security descriptor (DACL only), hex, restored byte for byte.
    pub descriptor: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Journal {
    pub version: u32,
    pub capability_sid: String,
    pub launcher_pid: u32,
    pub entries: Vec<FileEntry>,
    #[serde(default)]
    pub window_station: Option<WindowStationEntry>,
}

impl Journal {
    pub fn parse(bytes: &[u8]) -> io::Result<Self> {
        let journal: Journal =
            serde_json::from_slice(bytes).map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err.to_string()))?;
        if journal.version != JOURNAL_VERSION {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("journal version {} is not supported", journal.version),
            ));
        }
        Ok(journal)
    }

    pub fn load(path: &Path) -> io::Result<Self> {
        Self::parse(&fs::read(path)?)
    }

    /// Create the journal (it must not already exist: a leftover belongs to a crashed launch and must be
    /// restored first), write it and flush it to disk.
    pub fn create(&self, path: &Path) -> io::Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
        self.write_to(&mut file)
    }

    fn write_to(&self, file: &mut File) -> io::Result<()> {
        let bytes = serde_json::to_vec_pretty(self).map_err(|err| io::Error::other(err.to_string()))?;
        file.write_all(&bytes)?;
        file.sync_all()
    }
}

pub fn to_hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 0x0f) as usize] as char);
    }
    out
}

pub fn from_hex(text: &str) -> Option<Vec<u8>> {
    if !text.len().is_multiple_of(2) {
        return None;
    }
    let digit = |c: u8| -> Option<u8> {
        match c {
            b'0'..=b'9' => Some(c - b'0'),
            b'a'..=b'f' => Some(c - b'a' + 10),
            b'A'..=b'F' => Some(c - b'A' + 10),
            _ => None,
        }
    };
    text.as_bytes().chunks(2).map(|pair| Some(digit(pair[0])? << 4 | digit(pair[1])?)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Journal {
        Journal {
            version: JOURNAL_VERSION,
            capability_sid: "S-1-5-21-1-2-3-4".into(),
            launcher_pid: 77,
            entries: vec![
                FileEntry { path: "C:\\Users\\a\\home".into(), sddl: "D:(A;OICI;FA;;;SY)".into(), protected: false },
                FileEntry { path: "C:\\Users\\a\\x".into(), sddl: "D:P(A;;FA;;;BA)".into(), protected: true },
            ],
            window_station: Some(WindowStationEntry {
                session_id: 1,
                name: "WinSta0".into(),
                descriptor: to_hex(&[1, 0, 4, 0x80, 0xff]),
            }),
        }
    }

    #[test]
    fn round_trips_through_json() {
        let journal = sample();
        let bytes = serde_json::to_vec(&journal).unwrap();
        assert_eq!(Journal::parse(&bytes).unwrap(), journal);
        let text = String::from_utf8(bytes).unwrap();
        assert!(text.contains("\"capabilitySid\""));
        assert!(text.contains("\"windowStation\""));
        assert!(text.contains("\"sessionId\""));
    }

    #[test]
    fn refuses_other_versions_and_unknown_fields() {
        let mut journal = sample();
        journal.version = 2;
        assert!(Journal::parse(&serde_json::to_vec(&journal).unwrap()).is_err());
        assert!(
            Journal::parse(br#"{"version":1,"capabilitySid":"x","launcherPid":1,"entries":[],"extra":1}"#).is_err()
        );
    }

    #[test]
    fn create_refuses_to_overwrite_a_leftover_journal() {
        let dir = std::env::temp_dir().join(format!("tau-ws-journal-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("nested").join("x.acl.json");
        let journal = sample();
        journal.create(&path).unwrap();
        assert_eq!(Journal::load(&path).unwrap(), journal);
        assert_eq!(journal.create(&path).unwrap_err().kind(), io::ErrorKind::AlreadyExists);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn hex_round_trips() {
        let bytes: Vec<u8> = (0..=255).collect();
        assert_eq!(from_hex(&to_hex(&bytes)).unwrap(), bytes);
        assert_eq!(from_hex("0"), None);
        assert_eq!(from_hex("zz"), None);
        assert_eq!(from_hex("AB").unwrap(), vec![0xab]);
    }
}
