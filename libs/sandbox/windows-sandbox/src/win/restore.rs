//! Journal replay, shared by `launch` teardown and `restore --journal` (README "ACL lifecycle", "Sessions").
//! Every caller holds the person's descriptor lock (`exclusive.rs`).

use std::collections::HashSet;
use std::path::Path;

use super::acl::{self, Exact};
use super::exclusive;
use super::ledger;
use crate::journal::{self, Entry, Header};
use crate::overlap::{Coverage, key};
use crate::paths::is_within;
use crate::tree::Sample;

/// What the other unrestored journals in the person's ledger cover of `ours`.
fn coverage(header: &Header, ours: &HashSet<String>, failures: &mut Sample) -> Coverage {
    let mut coverage = Coverage::default();
    let others = match ledger::others(&header.package_name) {
        Ok(others) => others,
        Err(err) => {
            // Unknown coverage: restoring flags another journal still owes would be wrong, so restore none.
            failures.note(format!("the ledger of other launches cannot be read: {err}"));
            return coverage;
        }
    };
    for other in others {
        let path = Path::new(&other.journal);
        let summary = match journal::read_summary(path) {
            Ok(summary) => summary,
            Err(err) => {
                failures.note(format!("{}: {err}", other.journal));
                continue;
            }
        };
        // A journal cut short belongs to a launch that changed nothing.
        if !summary.complete {
            continue;
        }
        let labeled: Vec<String> =
            summary.roots.iter().filter(|root| root.labeled).map(|root| root.path.clone()).collect();
        for root in &summary.roots {
            coverage.note(ours, &root.path, &labeled);
            if root.account {
                coverage.note_account(ours, &root.path);
            }
            if root.group {
                coverage.note_group(ours, &root.path);
            }
        }
        if let Err(err) = journal::for_each_child(path, |child| coverage.note(ours, &child.path, &labeled)) {
            failures.note(format!("{}: {err}", other.journal));
        }
    }
    coverage
}

/// Restore what a journal recorded and confirm it. Returns the failures (a bounded sample plus a count); an
/// empty list means the journal may be deleted and unregistered.
///
/// 1. Each root loses every ACE naming one of the launch's own SIDs, and, when no other unrestored journal grants the
///    account on the same root, every ACE naming the account; written back with propagation, children before parents
///    (the reverse of application order), so every descendant, including objects created during the launch, loses
///    the copies it inherited, and keeps those another journal's root above it gives it. A writable root no other journal's writable root covers gets its
///    journaled label back the same way.
/// 2. Every journaled descendant, then every root, is read through its handle: it must name none of the launch's
///    SIDs. Where no other unrestored journal covers it, it gets its journaled control flags back, and, under a
///    writable root of this launch's that no other journal's writable root covers, its journaled label, and is
///    read back. Where one does, those are that journal's to restore, from the same original (`overlap.rs`).
///
/// A journal without its `end` line was cut short before any ACL changed: there is nothing to restore. The
/// package's registration (`container.rs`) lives in the sandbox account's profile, which the person cannot change:
/// the next launch's runner deletes it when its runner is gone, and `revoke` deletes the whole profile.
pub fn restore_journal(path: &Path) -> Vec<String> {
    let summary = match journal::read_summary(path) {
        Ok(summary) => summary,
        Err(err) => return vec![format!("the journal cannot be read: {err}")],
    };
    if !summary.complete {
        eprintln!("tau-windows-sandbox: the journal was cut short before any ACL changed; nothing to restore");
        return Vec::new();
    }
    let own = summary.header.own_sids();
    let mut failures = Sample::default();
    let mut ours: HashSet<String> = summary.roots.iter().map(|root| key(&root.path)).collect();
    if let Err(err) = journal::for_each_child(path, |child| {
        ours.insert(key(&child.path));
    }) {
        return vec![format!("the journal cannot be read: {err}")];
    }
    let coverage = coverage(&summary.header, &ours, &mut failures);
    let coverage_known = failures.is_empty();
    let labeled: Vec<&Entry> = summary.roots.iter().filter(|root| root.labeled).collect();

    for root in summary.roots.iter().rev() {
        // With the coverage unknown, the account's ACEs stay: the failure keeps the journal for a later restore.
        let mut removed = own.clone();
        if root.account && coverage_known && !coverage.account_covered(&root.path) {
            removed.push(summary.header.account_sid.clone());
        }
        if root.group && coverage_known && !coverage.group_covered(&root.path) {
            removed.push(summary.header.group_sid.clone());
        }
        if let Err(err) = acl::remove_propagating(&root.path, &removed) {
            failures.note(format!("{}: {err}", root.path));
        }
    }
    for root in labeled.iter().rev() {
        if coverage_known
            && !coverage.label_covered(&root.path)
            && let Err(err) = acl::restore_label_propagating(root)
        {
            failures.note(format!("{}: {err}", root.path));
        }
    }
    let (mut rewritten, mut replaced, mut deferred) = (0u64, 0u64, 0u64);
    let mut settle = |entry: &Entry, failures: &mut Sample| {
        let flags = coverage_known && !coverage.flags_covered(&entry.path);
        let label = coverage_known
            && !coverage.label_covered(&entry.path)
            && labeled.iter().any(|root| is_within(&entry.path, &root.path));
        if !flags {
            deferred += 1;
        }
        match acl::settle(entry, &own, flags, label) {
            Ok(Exact::Rewritten) => rewritten += 1,
            Ok(Exact::Replaced) => replaced += 1,
            Ok(Exact::Matched | Exact::Missing) => {}
            Err(err) => failures.note(format!("{}: {err}", entry.path)),
        }
    };
    let streamed = journal::for_each_child(path, |child| settle(&child, &mut failures));
    if let Err(err) = streamed {
        failures.note(format!("the journal cannot be read: {err}"));
    }
    for root in &summary.roots {
        settle(root, &mut failures);
    }
    eprintln!(
        "tau-windows-sandbox: restored {rewritten} descriptor(s) beyond their ACEs; {replaced} journaled object(s) were \
         replaced during the launch; {deferred} left to the other unrestored launch(es) covering them"
    );
    failures.messages()
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
    let header = match journal::read_summary(path) {
        Ok(summary) => summary.header,
        Err(err) => {
            eprintln!("tau-windows-sandbox restore: cannot read the journal: {err}");
            return 1;
        }
    };
    // A live launch restores its own journal at its end; restoring it now would take its grants away.
    if exclusive::is_live(&header.package_name) {
        let failure = "the launch that wrote this journal is still running; it restores the journal when it ends";
        eprintln!("tau-windows-sandbox restore: {failure}; the journal is kept");
        println!("{}", serde_json::json!({ "restored": false, "failures": [failure] }));
        return 1;
    }
    let _lock = match exclusive::descriptors() {
        Ok(lock) => lock,
        Err(err) => {
            eprintln!("tau-windows-sandbox restore: {err}; the journal is kept");
            println!(
                "{}",
                serde_json::json!({
                    "restored": false,
                    "requirement": crate::spec::requirement::EXCLUSIVE_LAUNCH,
                    "failures": [err.to_string()]
                })
            );
            return 1;
        }
    };
    let failures = restore_journal(path);
    if failures.is_empty() {
        if let Err(err) = std::fs::remove_file(path)
            && err.kind() != std::io::ErrorKind::NotFound
        {
            eprintln!("tau-windows-sandbox restore: restored, but the journal could not be deleted: {err}");
            return 1;
        }
        if let Err(err) = ledger::unregister(&header.package_name) {
            eprintln!("tau-windows-sandbox restore: restored, but the ledger could not be updated: {err}");
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
