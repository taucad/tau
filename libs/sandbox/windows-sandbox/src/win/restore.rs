//! Journal replay, shared by `launch` teardown and `restore --journal`.

use std::path::Path;

use super::acl::{self, Exact};
use super::desktop::{WindowStation, current_session};
use super::setup::load_record;
use crate::journal::{self, Header};
use crate::tree::Sample;

/// Restore everything a journal recorded and confirm it. Returns the failures (a bounded sample plus a
/// count); an empty list means the journal may be deleted.
///
/// 1. Each root's journaled DACL is written back with propagation, children before parents (the reverse
///    of application order), so every descendant, including objects created during the launch, loses the
///    ACEs it inherited from the grant.
/// 2. Every journaled descendant, then every root, gets its exact original DACL and control flags back
///    through its handle, without propagation, and is read back and compared as full SDDL.
/// 3. The window station is restored when this runs in the journaled session.
///
/// A journal without its `end` line was cut short before any ACL changed: there is nothing to restore.
/// `account_sids` are the sandbox account and group, when known; the capability and package SIDs come from
/// the journal. The package's registration (`container.rs`) lives in the sandbox account's profile, which the
/// person cannot change: the next launch's runner deletes it when its runner is gone, and `revoke` deletes the
/// whole profile. No durable named object exists for it.
pub fn restore_journal(path: &Path, account_sids: &[String]) -> Vec<String> {
    let summary = match journal::read_summary(path) {
        Ok(summary) => summary,
        Err(err) => return vec![format!("the journal cannot be read: {err}")],
    };
    if !summary.complete {
        eprintln!("tau-windows-sandbox: the journal was cut short before any ACL changed; nothing to restore");
        return Vec::new();
    }
    eprintln!(
        "tau-windows-sandbox: AppContainer {} stays registered in the sandbox account's profile until the next launch \
         or revoke deletes it",
        summary.header.package_name
    );
    let mut principals = vec![summary.header.capability_sid.clone(), summary.header.package_sid.clone()];
    principals.extend(account_sids.iter().cloned());
    let mut failures = Sample::default();

    for root in summary.roots.iter().rev() {
        if let Err(err) = acl::restore_propagating(root) {
            failures.note(format!("{}: {err}", root.path));
        }
    }
    let (mut rewritten, mut replaced) = (0u64, 0u64);
    let streamed = journal::for_each_child(path, |child| match acl::restore_exact(&child) {
        Ok(Exact::Rewritten) => rewritten += 1,
        Ok(Exact::Replaced) => replaced += 1,
        Ok(Exact::Matched | Exact::Missing) => {}
        Err(err) => failures.note(format!("{}: {err}", child.path)),
    });
    if let Err(err) = streamed {
        failures.note(format!("the journal cannot be read: {err}"));
    }
    for root in &summary.roots {
        match acl::restore_exact(root) {
            Ok(Exact::Matched | Exact::Rewritten | Exact::Missing) => {}
            // Another directory now stands at the root: it cannot match the journal, but it must not keep
            // any of the launch's ACEs.
            Ok(Exact::Replaced) => match acl::dacl_names_any(&root.path, &principals) {
                Ok(false) => {}
                Ok(true) => failures.note(format!("{}: the replaced root still names a sandbox principal", root.path)),
                Err(err) => failures.note(format!("{}: {err}", root.path)),
            },
            Err(err) => failures.note(format!("{}: {err}", root.path)),
        }
    }
    if rewritten > 0 || replaced > 0 {
        eprintln!(
            "tau-windows-sandbox: rewrote {rewritten} descendant descriptor(s); {replaced} journaled object(s) were replaced during the launch"
        );
    }
    restore_station(&summary.header, &mut failures);
    failures.messages()
}

fn restore_station(header: &Header, failures: &mut Sample) {
    let Some(station) = &header.window_station else { return };
    match current_session() {
        Ok(session) if session == station.session_id => {
            if let Err(err) = WindowStation::open_current().and_then(|ws| ws.restore(station)) {
                failures.note(format!("window station {}: {err}", station.name));
            }
        }
        Ok(_) => failures.note(format!(
            "window station {} belongs to session {}; run restore from that session",
            station.name, station.session_id
        )),
        Err(err) => failures.note(format!("window station: {err}")),
    }
}

/// The sandbox account and group SIDs from the install record, when it is readable: a restored root must
/// not name them.
pub fn account_sids() -> Vec<String> {
    match load_record() {
        Ok(Some(record)) => vec![record.account_sid, record.group_sid],
        _ => Vec::new(),
    }
}

/// `restore --journal <path>`: idempotent. A missing journal means there is nothing left to restore.
pub fn run(path: &str) -> i32 {
    let path = Path::new(path);
    match std::fs::metadata(path) {
        Ok(_) => {}
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            println!("{{\"restored\":true}}");
            return 0;
        }
        Err(err) => {
            eprintln!("tau-windows-sandbox restore: cannot read the journal: {err}");
            return 1;
        }
    }
    // Never beside a live launch: its snapshot and this journal's would each undo the other (`exclusive.rs`).
    let _exclusive = match super::exclusive::try_acquire() {
        Ok(Some(exclusive)) => exclusive,
        Ok(None) => {
            eprintln!("tau-windows-sandbox restore: {}; the journal is kept", super::exclusive::BUSY);
            println!("{}", serde_json::json!({ "restored": false, "failures": [super::exclusive::BUSY] }));
            return 1;
        }
        Err(err) => {
            eprintln!("tau-windows-sandbox restore: {err}; the journal is kept");
            return 1;
        }
    };
    let failures = restore_journal(path, &account_sids());
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
