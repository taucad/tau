//! Journal replay, shared by `launch` teardown and `restore --journal`.

use std::path::Path;

use super::acl;
use super::desktop::{WindowStation, current_session};
use super::setup::load_record;
use crate::journal::Journal;

/// Restore every journaled descriptor (children before parents, the reverse of application order) and
/// confirm each. Returns the failures; an empty list means the journal may be deleted.
pub fn restore_journal(journal: &Journal, principal_sids: &[String]) -> Vec<String> {
    let mut failures = Vec::new();
    for entry in journal.entries.iter().rev() {
        if let Err(err) = acl::restore(entry) {
            failures.push(format!("{}: {err}", entry.path));
        }
    }
    for entry in &journal.entries {
        match acl::verify_restored(entry, principal_sids) {
            Ok(true) => {}
            Ok(false) => failures.push(format!("{}: the restored DACL does not match the journal", entry.path)),
            Err(err) => failures.push(format!("{}: {err}", entry.path)),
        }
    }
    if let Some(station) = &journal.window_station {
        match current_session() {
            Ok(session) if session == station.session_id => {
                if let Err(err) = WindowStation::open_current().and_then(|ws| ws.restore(station)) {
                    failures.push(format!("window station {}: {err}", station.name));
                }
            }
            Ok(_) => failures.push(format!(
                "window station {} belongs to session {}; run restore from that session",
                station.name, station.session_id
            )),
            Err(err) => failures.push(format!("window station: {err}")),
        }
    }
    failures
}

/// The SIDs whose ACEs a restore must have removed: the launch's capability SID and, when an install
/// record is readable, the sandbox account and group.
pub fn principal_sids(journal: &Journal) -> Vec<String> {
    let mut sids = vec![journal.capability_sid.clone()];
    if let Ok(Some(record)) = load_record() {
        sids.push(record.account_sid);
        sids.push(record.group_sid);
    }
    sids
}

/// `restore --journal <path>`: idempotent. A missing journal means there is nothing left to restore.
pub fn run(path: &str) -> i32 {
    let path = Path::new(path);
    let journal = match Journal::load(path) {
        Ok(journal) => journal,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            println!("{{\"restored\":true}}");
            return 0;
        }
        Err(err) => {
            eprintln!("tau-windows-sandbox restore: cannot read the journal: {err}");
            return 1;
        }
    };
    let failures = restore_journal(&journal, &principal_sids(&journal));
    if failures.is_empty() {
        if let Err(err) = std::fs::remove_file(path)
            && err.kind() != std::io::ErrorKind::NotFound
        {
            eprintln!("tau-windows-sandbox restore: restored, but the journal could not be deleted: {err}");
            return 1;
        }
        println!("{{\"restored\":true}}");
        0
    } else {
        for failure in &failures {
            eprintln!("tau-windows-sandbox restore: {failure}");
        }
        println!("{}", serde_json::json!({ "restored": false, "failures": failures }));
        1
    }
}
