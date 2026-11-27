//! The ACL journal: every security descriptor `launch` is about to change, as it was before the change.
//!
//! The journal is JSON lines, written and read as a stream so a launch over a large tree never holds it in
//! memory: one `header` line, one `root` line per granted or denied path, one `child` line per object
//! under a directory root (granting through `SetNamedSecurityInfoW` propagates to every descendant and
//! sets `SE_DACL_AUTO_INHERITED` on each), then one `end` line with the counts. `launch` writes and fsyncs
//! the whole journal, `end` included, before it changes any ACL. A journal without a valid `end` therefore
//! belongs to a launch that changed nothing, and restoring it only deletes it.
//!
//! Each entry keeps the object's original descriptor (owner, group, DACL and its control flags, and the mandatory
//! label) as SDDL and its file id. "Original" means before any launch covering the object changed it: an object
//! another unrestored journal already holds is recorded with that journal's entry (`overlap.rs`). Restoring removes
//! the ACEs naming the launch's own SIDs from each root (and those naming the shared account where no other unrestored
//! journal grants the same root) and, where no other unrestored journal covers an object, writes back its recorded
//! control flags and label. It never writes back an ACE list, so it never touches an ACE another launch or the person
//! added.

use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, BufWriter, Write};
use std::path::Path;

/// Version 6 grants the first pass to the shared sandbox account and denies the shared sandbox group and the launch's
/// package, records which roots are writable and which name the account or the group, and restores by SID (concurrent
/// launches, README "Sessions"). Version 7 drops the window station, which no launch changes any more. Older journals
/// are refused: versions 2 to 6 shipped only on unmerged branches, behind `TAU_WINDOWS_SHELL_SANDBOX`.
pub const JOURNAL_VERSION: u32 = 7;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Header {
    pub version: u32,
    pub capability_sid: String,
    /// The sandbox account's SID, which every first-pass grant names. Every launch shares it (the runner's logon SID
    /// is the person's own, `CreateProcessWithLogonW` hands the caller's to the new logon), so it is never one of
    /// [`Header::own_sids`]: a root loses its ACEs naming it only when no other unrestored journal grants that root.
    pub account_sid: String,
    /// The sandbox group's SID, which every denial names (in every launch's first pass). Shared like the account and
    /// removed from a root the same way.
    pub group_sid: String,
    /// The launch's AppContainer package SID (`S-1-15-2-…`): a restored root must not name it either.
    pub package_sid: String,
    /// The launch's AppContainer name (`tau.sandbox.<32 hex digits>`), which the runner registers in the
    /// sandbox account's profile and deletes at the end; a leftover from a crash is deleted by the next
    /// launch's runner or by `revoke`.
    pub package_name: String,
    pub launcher_pid: u32,
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
    /// A writable root, whose tree's mandatory label the launch lowered.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub labeled: bool,
    /// A root whose grant names the sandbox account (every grant but a denial).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub account: bool,
    /// A root whose denial names the sandbox group.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub group: bool,
}

impl Header {
    /// The SIDs only this launch's ACEs name: restore removes every ACE naming one, everywhere it granted.
    pub fn own_sids(&self) -> Vec<String> {
        vec![self.capability_sid.clone(), self.package_sid.clone()]
    }
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
            account_sid: "S-1-5-21-9-9-9-1005".into(),
            group_sid: "S-1-5-21-9-9-9-1006".into(),
            package_sid: "S-1-15-2-1-2-3-4-5-6-7".into(),
            package_name: "tau.sandbox.000000010000000200000003ffffffff".into(),
            launcher_pid: 77,
        }
    }

    fn entry(path: &str, sddl: &str) -> Entry {
        Entry {
            path: path.into(),
            sddl: sddl.into(),
            file_id: Some(file_id(0xabcd, 42)),
            labeled: false,
            account: false,
            group: false,
        }
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
            // an earlier version (6 named the window station)
            [lines[0].replace("\"version\":7", "\"version\":6").as_str(), lines[5]].join("\n"),
            // a later version
            [lines[0].replace("\"version\":7", "\"version\":8").as_str(), lines[5]].join("\n"),
            // a header without the group SID
            [lines[0].replace("\"groupSid\":\"S-1-5-21-9-9-9-1006\",", "").as_str(), lines[5]].join("\n"),
            // a version 4 header, with the runner's logon SID in place of the account
            [lines[0].replace("\"accountSid\"", "\"logonSid\"").as_str(), lines[5]].join("\n"),
            // a header without its package SID
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
    fn keeps_writable_roots_and_names_the_launch_own_sids() {
        let path = temp("labeled").join("journal.json");
        let mut writer = JournalWriter::create(&path, &header()).unwrap();
        writer.root(Entry { labeled: true, account: true, ..entry(r"C:\w", "O:BAG:BAD:(A;;FA;;;SY)") }).unwrap();
        writer.root(Entry { account: true, ..entry(r"C:\r", "O:BAG:BAD:(A;;FA;;;SY)") }).unwrap();
        writer.root(Entry { group: true, ..entry(r"C:\d", "O:BAG:BAD:(A;;FA;;;SY)") }).unwrap();
        writer.finish().unwrap();
        let text = fs::read_to_string(&path).unwrap();
        // Only a writable root spells `labeled` out, and only a root that grants the account `account`.
        assert_eq!(text.matches("\"labeled\":true").count(), 1);
        assert_eq!(text.matches("\"account\":true").count(), 2);
        assert_eq!(text.matches("\"group\":true").count(), 1);
        assert!(!text.contains(":false"));
        let summary = read_summary(&path).unwrap();
        assert_eq!(summary.roots.iter().map(|root| root.labeled).collect::<Vec<_>>(), [true, false, false]);
        assert_eq!(summary.roots.iter().map(|root| root.account).collect::<Vec<_>>(), [true, true, false]);
        assert_eq!(summary.roots.iter().map(|root| root.group).collect::<Vec<_>>(), [false, false, true]);
        // The shared account is never one of the launch's own SIDs.
        assert_eq!(summary.header.own_sids(), ["S-1-5-21-1-2-3-4", "S-1-15-2-1-2-3-4-5-6-7"]);
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
