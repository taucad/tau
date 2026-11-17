//! Concurrent launches over overlapping paths (README "Sessions"): the portable half.
//!
//! A launch changes four things on the objects it journals, and restore undoes exactly those:
//!
//! - **Its own ACEs.** Every ACE a launch adds names its capability SID or its package SID, or the shared sandbox
//!   account (below). Restore removes the ACEs naming its own two SIDs and no other ([`dacl_without_all`]).
//! - **Its group ACEs.** A denial also denies the sandbox group, which every launch's first pass carries (the
//!   AppContainer pass alone does not hold a deny for certain). Restored like the account's: a root keeps them while
//!   another unrestored journal denies the same root ([`Coverage::group_covered`]), and they deny every launch's shell
//!   meanwhile, which fails closed.
//! - **Its account ACEs.** The first pass can only be granted to the sandbox account, which every launch shares, and
//!   `SetEntriesInAclW` merges two launches' grants to it on one root into one ACE. So a root keeps its account ACEs
//!   while another unrestored journal grants the same root ([`Coverage::account_covered`]), and the last launch
//!   granting it removes them all. A launch refuses a root whose original DACL already names the account, so that
//!   leaves the root's original ACEs. Until then the merged ACE may grant the account more than the remaining launches
//!   asked for, which no shell can use: every access must also pass its own package SID and, for a write, its own
//!   capability SID.
//! - **The DACL's control flags.** Propagation sets `SE_DACL_AUTO_INHERITED` (`AI`) on every object under a root. Each
//!   object's original flags are restored by whichever launch covering it ends last: an object another unrestored
//!   journal also covers keeps its flags ([`Coverage`]), and that journal's restore writes them later.
//! - **The mandatory label** of a writable root's tree, likewise, by the last launch whose writable root covers it.
//!
//! "Original" is the descriptor before any launch covering the object changed it: a launch that journals an object
//! another unrestored journal already covers copies that journal's entry instead of its own snapshot, so the last
//! to end restores the true original whatever the order of ends.

use std::collections::HashSet;

use crate::appcontainer::{dacl_aces, split_sacl};
use crate::paths::is_within;

/// The case-folded key of a path, as overlap compares them.
pub fn key(path: &str) -> String {
    path.to_lowercase()
}

/// The DACL part (`D:<flags>(ace)…`) of a full SDDL string, without its owner, group or SACL. `None` without one.
pub fn dacl_part(sddl: &str) -> Option<&str> {
    let (rest, _) = split_sacl(sddl);
    let bytes = rest.as_bytes();
    let mut depth = 0usize;
    for (index, &byte) in bytes.iter().enumerate() {
        match byte {
            b'(' => depth += 1,
            b')' => depth = depth.saturating_sub(1),
            b'D' if depth == 0 && bytes.get(index + 1) == Some(&b':') => return Some(&rest[index..]),
            _ => {}
        }
    }
    None
}

/// The SID field of one ACE string.
fn ace_sid(ace: &str) -> Option<&str> {
    ace.strip_prefix('(')?.strip_suffix(')')?.split(';').nth(5)
}

/// Whether any ACE of `dacl` names one of `sids`.
pub fn names_any(dacl: &str, sids: &[String]) -> bool {
    dacl_aces(dacl).is_some_and(|(_, aces)| {
        aces.iter().any(|ace| ace_sid(ace).is_some_and(|sid| sids.iter().any(|own| own.eq_ignore_ascii_case(sid))))
    })
}

/// Whether an ACE of `dacl` set on the object itself (not inherited: no `ID` flag) names one of `sids`.
pub fn names_explicitly(dacl: &str, sids: &[String]) -> bool {
    dacl_aces(dacl).is_some_and(|(_, aces)| {
        aces.iter().any(|ace| {
            let inherited = ace
                .strip_prefix('(')
                .and_then(|ace| ace.split(';').nth(1))
                .is_some_and(|flags| flags.as_bytes().chunks(2).any(|flag| flag == b"ID"));
            !inherited && ace_sid(ace).is_some_and(|sid| sids.iter().any(|own| own.eq_ignore_ascii_case(sid)))
        })
    })
}

/// `dacl` without every ACE naming one of `sids`, its flags and every other ACE in order. `None` when it does not parse.
pub fn dacl_without_all(dacl: &str, sids: &[String]) -> Option<String> {
    let (prefix, aces) = dacl_aces(dacl)?;
    let kept: String = aces
        .into_iter()
        .filter(|ace| !ace_sid(ace).is_some_and(|sid| sids.iter().any(|own| own.eq_ignore_ascii_case(sid))))
        .collect();
    Some(format!("{prefix}{kept}"))
}

/// The DACL's control flags (`P`, `AI`, `AR`), as written after `D:`.
pub fn dacl_flags(dacl: &str) -> Option<&str> {
    dacl_aces(dacl).map(|(prefix, _)| &prefix[2..])
}

/// `current`'s ACEs under `original`'s control flags: what restore writes to give an object its flags back without
/// touching any ACE.
pub fn with_flags_of(current: &str, original: &str) -> Option<String> {
    let (_, aces) = dacl_aces(current)?;
    Some(format!("D:{}{}", dacl_flags(original)?, aces.concat()))
}

/// What other unrestored journals cover among one launch's objects.
#[derive(Debug, Default)]
pub struct Coverage {
    /// Objects another journal also holds: their control flags are that journal's to restore.
    pub covered: HashSet<String>,
    /// Objects under another journal's writable root: their label is that journal's to restore.
    pub labeled: HashSet<String>,
    /// Objects another journal grants the account on as a root: their account ACEs are the last such journal's to
    /// remove.
    pub accounted: HashSet<String>,
    /// Objects another journal denies the group on as a root: likewise for the group's deny ACEs.
    pub grouped: HashSet<String>,
}

impl Coverage {
    /// Note one of another journal's entries. `ours` holds this launch's keys; `their_labeled_roots` are that
    /// journal's writable roots.
    pub fn note(&mut self, ours: &HashSet<String>, path: &str, their_labeled_roots: &[String]) {
        let key = key(path);
        if !ours.contains(&key) {
            return;
        }
        if their_labeled_roots.iter().any(|root| is_within(path, root)) {
            self.labeled.insert(key.clone());
        }
        self.covered.insert(key);
    }

    /// Note one of another journal's roots whose grant names the account.
    pub fn note_account(&mut self, ours: &HashSet<String>, path: &str) {
        let key = key(path);
        if ours.contains(&key) {
            self.accounted.insert(key);
        }
    }

    /// Whether another unrestored journal grants the account on this object as a root of its own.
    pub fn account_covered(&self, path: &str) -> bool {
        self.accounted.contains(&key(path))
    }

    /// Note one of another journal's roots whose denial names the group.
    pub fn note_group(&mut self, ours: &HashSet<String>, path: &str) {
        let key = key(path);
        if ours.contains(&key) {
            self.grouped.insert(key);
        }
    }

    /// Whether another unrestored journal denies the group on this object as a root of its own.
    pub fn group_covered(&self, path: &str) -> bool {
        self.grouped.contains(&key(path))
    }

    pub fn flags_covered(&self, path: &str) -> bool {
        self.covered.contains(&key(path))
    }

    pub fn label_covered(&self, path: &str) -> bool {
        self.labeled.contains(&key(path))
    }
}

/// Whether two sets of paths overlap: one equals, contains or lies inside the other.
pub fn overlaps(left: &[String], right: &[String]) -> bool {
    left.iter().any(|a| right.iter().any(|b| is_within(a, b) || is_within(b, a)))
}

#[cfg(test)]
mod tests {
    use super::*;

    const CAPABILITY: &str = "S-1-5-21-1-2-3-4";
    const PACKAGE: &str = "S-1-15-2-1-2-3-4-5-6-7";
    const OTHER: &str = "S-1-15-2-9-9-9-9-9-9-9";

    fn own() -> Vec<String> {
        vec![CAPABILITY.to_owned(), PACKAGE.to_owned()]
    }

    #[test]
    fn finds_the_dacl_part_between_group_and_label() {
        let sddl =
            format!("O:S-1-5-21-1G:S-1-5-21-2D:AI(A;OICI;FA;;;SY)(A;;0x1200a9;;;{CAPABILITY})S:(ML;OICI;NW;;;LW)");
        assert_eq!(dacl_part(&sddl), Some(format!("D:AI(A;OICI;FA;;;SY)(A;;0x1200a9;;;{CAPABILITY})").as_str()));
        assert_eq!(dacl_part("O:SYG:SY"), None);
        // An SID inside an ACE never starts the DACL part.
        assert_eq!(dacl_part("O:BAD:P(A;;FA;;;S-1-5-21-1)"), Some("D:P(A;;FA;;;S-1-5-21-1)"));
    }

    #[test]
    fn removes_exactly_the_launch_own_aces() {
        let dacl = format!(
            "D:AI(D;OICI;FA;;;{CAPABILITY})(A;OICI;FA;;;SY)(A;OICI;0x1200a9;;;{OTHER})(A;OICIID;0x1200a9;;;{PACKAGE})(A;;FA;;;BA)"
        );
        assert!(names_any(&dacl, &own()));
        let kept = dacl_without_all(&dacl, &own()).unwrap();
        assert_eq!(kept, format!("D:AI(A;OICI;FA;;;SY)(A;OICI;0x1200a9;;;{OTHER})(A;;FA;;;BA)"));
        assert!(!names_any(&kept, &own()));
        // Another launch's ACEs are not ours, and SIDs compare case-insensitively.
        assert!(names_any(&kept, &[OTHER.to_lowercase()]));
        assert_eq!(dacl_without_all("not a dacl", &own()), None);
        // Only an ACE set on the object itself counts as named explicitly; `ID` marks an inherited one.
        assert!(names_explicitly(&dacl, &own()));
        assert!(!names_explicitly(&format!("D:AI(A;OICIID;FA;;;{PACKAGE})(A;;FA;;;SY)"), &own()));
        assert!(names_explicitly(&format!("D:AI(A;OICIID;FA;;;{PACKAGE})(A;;FA;;;{PACKAGE})"), &own()));
        assert!(!names_explicitly("not a dacl", &own()));
    }

    #[test]
    fn gives_back_the_original_flags_over_the_current_aces() {
        let current = format!("D:AI(A;OICI;FA;;;SY)(A;OICIID;0x1200a9;;;{OTHER})");
        assert_eq!(dacl_flags(&current), Some("AI"));
        assert_eq!(
            with_flags_of(&current, "D:(A;;FA;;;SY)").unwrap(),
            format!("D:(A;OICI;FA;;;SY)(A;OICIID;0x1200a9;;;{OTHER})")
        );
        assert_eq!(
            with_flags_of(&current, "D:PAI(A;;FA;;;SY)").unwrap(),
            format!("D:PAI(A;OICI;FA;;;SY)(A;OICIID;0x1200a9;;;{OTHER})")
        );
        assert_eq!(with_flags_of("D:AI", "D:P").unwrap(), "D:P");
    }

    #[test]
    fn covers_only_this_launch_objects_and_labels_only_under_writable_roots() {
        let ours: HashSet<String> =
            [r"C:\Runtime", r"C:\Runtime\python.exe", r"C:\Work\out"].into_iter().map(key).collect();
        let mut coverage = Coverage::default();
        // A worker that read the runtime root and wrote its own output.
        let labeled = vec![r"C:\Other\out".to_owned()];
        coverage.note(&ours, r"c:\runtime", &labeled);
        coverage.note(&ours, r"C:\Runtime\python.exe", &labeled);
        coverage.note(&ours, r"C:\Other\out", &labeled);
        // A shell that wrote over the whole work folder.
        coverage.note(&ours, r"C:\Work\out", &[r"C:\Work".to_owned()]);
        assert!(coverage.flags_covered(r"C:\Runtime") && coverage.flags_covered(r"C:\RUNTIME\python.exe"));
        assert!(!coverage.label_covered(r"C:\Runtime"));
        assert!(coverage.flags_covered(r"C:\Work\out") && coverage.label_covered(r"C:\Work\out"));
        assert!(!coverage.flags_covered(r"C:\Other\out"));
        // Only a root another journal grants the account on keeps the account's ACEs.
        assert!(!coverage.account_covered(r"C:\Runtime"));
        coverage.note_account(&ours, r"C:\RUNTIME");
        coverage.note_account(&ours, r"C:\Other\out");
        assert!(coverage.account_covered(r"c:\runtime"));
        assert!(!coverage.account_covered(r"C:\Other\out") && !coverage.account_covered(r"C:\Work\out"));
        // The group's deny ACEs, likewise, and independently of the account's.
        coverage.note_group(&ours, r"C:\Work\out");
        assert!(coverage.group_covered(r"c:\work\OUT") && !coverage.group_covered(r"C:\Runtime"));
        assert!(!coverage.account_covered(r"C:\Work\out"));
    }

    #[test]
    fn overlap_is_equality_or_containment_either_way() {
        let runtime = vec![r"C:\Runtime".to_owned()];
        assert!(overlaps(&runtime, &[r"C:\Runtime".to_owned()]));
        assert!(overlaps(&runtime, &[r"C:\Runtime\Lib".to_owned()]));
        assert!(overlaps(&[r"C:\Runtime\Lib".to_owned()], &runtime));
        assert!(!overlaps(&runtime, &[r"C:\Runtime2".to_owned()]));
    }
}
