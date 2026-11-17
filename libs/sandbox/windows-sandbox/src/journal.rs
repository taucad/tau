//! The ACL journal: every security descriptor `launch` is about to change, as it was before the change.
//!
//! The journal is JSON lines, written and read as a stream so a launch over a large tree never holds it in
//! memory: one `header` line, one `root` line per granted or denied path, one `child` line per object
//! under a directory root (granting through `SetNamedSecurityInfoW` propagates to every descendant and
//! sets `SE_DACL_AUTO_INHERITED` on each), then one `end` line with the counts. `launch` writes and fsyncs
//! the whole journal, `end` included, before it changes any ACL. A journal without a valid `end` therefore
//! belongs to a launch that changed nothing, and restoring it only deletes it.
//!
//! Each entry keeps the full descriptor (owner, group, DACL and its control flags, and the mandatory label)
//! as SDDL and the object's file id. Restoring writes back the recorded DACL with its control flags and the
//! recorded label; it never removes an ACE that was not added by the launch, because it never edits ACEs
//! at all.

use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, BufWriter, Write};
use std::path::Path;

/// Version 3 added the package name and SID and the mandatory label. Older journals are refused: version 2 shipped
/// only on unmerged branches, behind `TAU_WINDOWS_SHELL_SANDBOX`.
pub const JOURNAL_VERSION: u32 = 3;

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
pub struct Header {
    pub version: u32,
    pub capability_sid: String,
    /// The launch's AppContainer package SID (`S-1-15-2-…`): a restored root must not name it either.
    pub package_sid: String,
    /// The launch's AppContainer name (`tau.sandbox.<32 hex digits>`), which the runner registers in the
    /// sandbox account's profile and deletes at the end; a leftover from a crash is deleted by the next
    /// launch's runner or by `revoke`.
    pub package_name: String,
    pub launcher_pid: u32,
    #[serde(default)]
    pub window_station: Option<WindowStationEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Entry {
    pub path: String,
    /// Owner, group, DACL and mandatory label as SDDL (`O:…G:…D:AI(…)S:(ML;…)`), control flags included,
    /// exactly as read. The `S:` part is absent when the object has no explicit or inherited label.
    pub sddl: String,
    /// `<volume serial>:<file index>` in hex, to tell the journaled object from one put in its place.
    /// `None` when the object's attributes could not be read.
    #[serde(default)]
    pub file_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Line {
    Header(Header),
    Root(Entry),
    Child(Entry),
    End { roots: u64, children: u64 },
}

/// Streams a new journal to disk. Nothing is durable until [`JournalWriter::finish`] has returned.
pub struct JournalWriter {
    file: BufWriter<File>,
    roots: u64,
    children: u64,
}

impl JournalWriter {
    /// Create the journal (it must not already exist: a leftover belongs to a crashed launch and must be
    /// restored first) and write its header.
    pub fn create(path: &Path, header: &Header) -> io::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let file = OpenOptions::new().write(true).create_new(true).open(path)?;
        let mut writer = Self { file: BufWriter::new(file), roots: 0, children: 0 };
        writer.line(&Line::Header(header.clone()))?;
        Ok(writer)
    }

    fn line(&mut self, line: &Line) -> io::Result<()> {
        serde_json::to_writer(&mut self.file, line).map_err(|err| io::Error::other(err.to_string()))?;
        self.file.write_all(b"\n")
    }

    pub fn root(&mut self, entry: Entry) -> io::Result<()> {
        self.roots += 1;
        self.line(&Line::Root(entry))
    }

    pub fn child(&mut self, entry: Entry) -> io::Result<()> {
        self.children += 1;
        self.line(&Line::Child(entry))
    }

    /// Write the `end` line and flush everything to disk. Only after this may any ACL change.
    pub fn finish(mut self) -> io::Result<()> {
        let end = Line::End { roots: self.roots, children: self.children };
        self.line(&end)?;
        let file = self.file.into_inner().map_err(|err| err.into_error())?;
        file.sync_all()
    }
}

/// What a journal holds, without its children (which are streamed with [`for_each_child`]).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Summary {
    pub header: Header,
    /// In application order.
    pub roots: Vec<Entry>,
    /// Whether the `end` line is present and its counts match: only then may ACLs have changed.
    pub complete: bool,
}

fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message.into())
}

/// Read every line, handing each to `visit`. A malformed final line (a launch that crashed while
/// journaling) ends an incomplete journal; a malformed line anywhere else, a line after `end`, a missing
/// or unsupported header or a mismatched `end` is an error.
fn scan(path: &Path, mut visit: impl FnMut(Line) -> io::Result<()>) -> io::Result<Summary> {
    let mut lines = BufReader::new(File::open(path)?).lines();
    let first = lines.next().ok_or_else(|| invalid("the journal is empty"))??;
    let header = match serde_json::from_str::<Line>(&first) {
        Ok(Line::Header(header)) => header,
        _ => return Err(invalid(format!("the journal has no version {JOURNAL_VERSION} header"))),
    };
    if header.version != JOURNAL_VERSION {
        return Err(invalid(format!("journal version {} is not supported", header.version)));
    }
    let mut roots = Vec::new();
    let (mut seen_roots, mut seen_children) = (0u64, 0u64);
    let mut complete = false;
    let mut pending_error: Option<String> = None;
    for line in lines {
        let line = line?;
        if let Some(error) = pending_error.take() {
            return Err(invalid(error));
        }
        if complete {
            return Err(invalid("the journal continues after its end line"));
        }
        match serde_json::from_str::<Line>(&line) {
            Ok(Line::Header(_)) => return Err(invalid("the journal has a second header")),
            Ok(Line::Root(entry)) => {
                seen_roots += 1;
                roots.push(entry.clone());
                visit(Line::Root(entry))?;
            }
            Ok(Line::Child(entry)) => {
                seen_children += 1;
                visit(Line::Child(entry))?;
            }
            Ok(Line::End { roots, children }) => {
                if roots != seen_roots || children != seen_children {
                    return Err(invalid("the journal's end line does not match its entries"));
                }
                complete = true;
            }
            Err(err) => pending_error = Some(format!("malformed journal line: {err}")),
        }
    }
    Ok(Summary { header, roots, complete })
}

/// The header and roots, streaming past the children.
pub fn read_summary(path: &Path) -> io::Result<Summary> {
    scan(path, |_| Ok(()))
}

/// Stream every `child` entry to `visit`, in journal order.
pub fn for_each_child(path: &Path, mut visit: impl FnMut(Entry)) -> io::Result<()> {
    scan(path, |line| {
        if let Line::Child(entry) = line {
            visit(entry);
        }
        Ok(())
    })
    .map(|_| ())
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

/// `<volume serial>:<file index>` in hex, as journaled in [`Entry::file_id`].
pub fn file_id(volume_serial: u32, index: u64) -> String {
    format!("{volume_serial:08x}:{index:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn header() -> Header {
        Header {
            version: JOURNAL_VERSION,
            capability_sid: "S-1-5-21-1-2-3-4".into(),
            package_sid: "S-1-15-2-1-2-3-4-5-6-7".into(),
            package_name: "tau.sandbox.000000010000000200000003ffffffff".into(),
            launcher_pid: 77,
            window_station: Some(WindowStationEntry {
                session_id: 1,
                name: "WinSta0".into(),
                descriptor: to_hex(&[1, 0, 4, 0x80, 0xff]),
            }),
        }
    }

    fn entry(path: &str, sddl: &str) -> Entry {
        Entry { path: path.into(), sddl: sddl.into(), file_id: Some(file_id(0xabcd, 42)) }
    }

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tau-ws-journal-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    fn write_full(path: &Path) {
        let mut writer = JournalWriter::create(path, &header()).unwrap();
        writer.root(entry("C:\\Users\\a\\home", "O:S-1-5-21-9G:S-1-5-21-9D:(A;OICI;FA;;;SY)")).unwrap();
        writer.child(entry("C:\\Users\\a\\home\\x.txt", "O:BAG:SYD:AI(A;ID;FA;;;SY)")).unwrap();
        writer.child(entry("C:\\Users\\a\\home\\d", "O:BAG:SYD:PAI(A;OICI;FA;;;BA)")).unwrap();
        writer.root(entry("C:\\Users\\a\\x", "O:BAG:SYD:P(A;;FA;;;BA)")).unwrap();
        writer.finish().unwrap();
    }

    #[test]
    fn streams_a_complete_journal() {
        let dir = temp("full");
        let path = dir.join("nested").join("x.acl.jsonl");
        write_full(&path);
        let summary = read_summary(&path).unwrap();
        assert!(summary.complete);
        assert_eq!(summary.header, header());
        assert_eq!(
            summary.roots.iter().map(|r| r.path.as_str()).collect::<Vec<_>>(),
            ["C:\\Users\\a\\home", "C:\\Users\\a\\x"]
        );
        let mut children = Vec::new();
        for_each_child(&path, |child| children.push(child.sddl)).unwrap();
        assert_eq!(children, ["O:BAG:SYD:AI(A;ID;FA;;;SY)", "O:BAG:SYD:PAI(A;OICI;FA;;;BA)"]);
        let text = fs::read_to_string(&path).unwrap();
        assert_eq!(text.lines().count(), 6);
        assert!(text.lines().next().unwrap().contains("\"kind\":\"header\""));
        assert!(text.contains("\"capabilitySid\""));
        assert!(text.contains("\"packageSid\":\"S-1-15-2-1-2-3-4-5-6-7\""));
        assert!(text.contains("\"fileId\":\"0000abcd:000000000000002a\""));
        assert!(text.lines().last().unwrap().contains("\"kind\":\"end\""));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn create_refuses_to_overwrite_a_leftover_journal() {
        let dir = temp("leftover");
        let path = dir.join("x.acl.jsonl");
        write_full(&path);
        assert_eq!(JournalWriter::create(&path, &header()).err().unwrap().kind(), io::ErrorKind::AlreadyExists);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_journal_cut_short_is_incomplete_not_an_error() {
        let dir = temp("cut");
        let path = dir.join("x.acl.jsonl");
        write_full(&path);
        let text = fs::read_to_string(&path).unwrap();
        // Drop the end line, then also cut the last child line in half (a crash mid-write).
        let without_end: Vec<&str> = text.lines().take(5).collect();
        fs::write(&path, without_end.join("\n") + "\n").unwrap();
        let summary = read_summary(&path).unwrap();
        assert!(!summary.complete);
        assert_eq!(summary.roots.len(), 2);
        let cut = &text[..text.find("\"kind\":\"child\"").unwrap() + 20];
        fs::write(&path, cut).unwrap();
        assert!(!read_summary(&path).unwrap().complete);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn refuses_corrupt_or_foreign_journals() {
        let dir = temp("corrupt");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("x.acl.jsonl");
        let full = {
            write_full(&path);
            fs::read_to_string(&path).unwrap()
        };
        let lines: Vec<&str> = full.lines().collect();
        let cases = [
            // empty
            String::new(),
            // version 1 (one pretty-printed JSON document)
            "{\n  \"version\": 1,\n  \"capabilitySid\": \"x\",\n  \"launcherPid\": 1,\n  \"entries\": []\n}\n"
                .to_owned(),
            // a malformed line in the middle
            [lines[0], "{oops", lines[1], lines[5]].join("\n"),
            // a line after end
            [lines[0], lines[5], lines[1]].join("\n"),
            // end counts that do not match
            [lines[0], lines[1], lines[5]].join("\n"),
            // two headers
            [lines[0], lines[0], lines[5]].join("\n"),
            // unknown field
            [lines[0].replace("\"launcherPid\"", "\"extra\":1,\"launcherPid\"").as_str(), lines[5]].join("\n"),
            // version 2 (no package SID, no labels)
            [lines[0].replace("\"version\":3", "\"version\":2").as_str(), lines[5]].join("\n"),
            // a later version
            [lines[0].replace("\"version\":3", "\"version\":4").as_str(), lines[5]].join("\n"),
            // a version 3 header without its package SID
            [lines[0].replace("\"packageSid\":\"S-1-15-2-1-2-3-4-5-6-7\",", "").as_str(), lines[5]].join("\n"),
        ];
        for (index, case) in cases.iter().enumerate() {
            fs::write(&path, case).unwrap();
            let result = read_summary(&path);
            assert_eq!(result.err().map(|e| e.kind()), Some(io::ErrorKind::InvalidData), "case {index}");
        }
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
