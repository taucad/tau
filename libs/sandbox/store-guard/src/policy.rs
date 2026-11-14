//! The store policy: the top-level names of a git directory that the guard keeps read-only, each with everything
//! under it. The list is not compiled in: the host passes Tau's one `terminalGitStorePolicy` list as arguments, so the
//! Seatbelt profile on macOS and this guard on Linux enforce the same names.

use std::ffi::OsString;
use std::os::unix::ffi::OsStrExt;
use std::path::{Component, Path};

/// The protected names of one store. A name matches every spelling a case-folding volume reads as it: Linux volumes
/// are case-sensitive, but an ext4 or f2fs directory with the casefold attribute folds names as Unicode does, so
/// `HOOKS`, `ſ` (U+017F) for `s`, `K` (U+212A) for `k` and `ﬁ` (U+FB01) for `fi` all reach the protected entry there.
#[derive(Clone, Debug)]
pub struct Policy {
    names: Vec<OsString>,
}

impl Policy {
    /// A policy over `names`. Each must be one plain path segment, so a name can never reach outside the store.
    pub fn new(names: Vec<OsString>) -> Result<Self, String> {
        if names.is_empty() {
            return Err("the store policy names no protected entry".into());
        }
        for name in &names {
            let bytes = name.as_bytes();
            if bytes.is_empty() || bytes == b"." || bytes == b".." || bytes.contains(&b'/') || bytes.contains(&0) {
                return Err(format!("{} is not one plain name", name.to_string_lossy()));
            }
        }
        Ok(Self { names })
    }

    /// Whether `relative`, a path inside the store, is a protected name or lies under one. The store's root is not.
    pub fn protects(&self, relative: &Path) -> bool {
        match relative.components().next() {
            Some(Component::Normal(first)) => {
                let folded = fold(first.as_bytes());
                self.names.iter().any(|name| fold(name.as_bytes()) == folded)
            }
            _ => false,
        }
    }
}

/// `bytes` as a case-folding volume compares it, for the policy's ASCII names: ASCII letters lowered and the three
/// characters whose case folding is ASCII replaced. A name that is not UTF-8 is compared as it is, as such a volume
/// does.
fn fold(bytes: &[u8]) -> Vec<u8> {
    let Ok(text) = std::str::from_utf8(bytes) else {
        return bytes.to_vec();
    };
    let mut folded = String::with_capacity(text.len());
    for character in text.chars() {
        match character {
            '\u{017F}' => folded.push('s'),
            '\u{212A}' => folded.push('k'),
            '\u{FB01}' => folded.push_str("fi"),
            other => folded.push(other.to_ascii_lowercase()),
        }
    }
    folded.into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy() -> Policy {
        Policy::new(["config", "hooks", "commondir", "worktrees"].iter().map(OsString::from).collect()).unwrap()
    }

    #[test]
    fn protects_names_and_everything_under_them() {
        let policy = policy();
        assert!(policy.protects(Path::new("config")));
        assert!(policy.protects(Path::new("hooks/pre-commit")));
        assert!(policy.protects(Path::new("worktrees/main/commondir")));
        assert!(!policy.protects(Path::new("")));
        assert!(!policy.protects(Path::new("config.lock")));
        assert!(policy.protects(Path::new("CONFIG")));
        assert!(policy.protects(Path::new("Hoo\u{212A}s/pre-commit")));
        assert!(policy.protects(Path::new("hook\u{017F}")));
        assert!(policy.protects(Path::new("con\u{FB01}g")));
        assert!(!policy.protects(Path::new("hooks2")));
        assert!(!policy.protects(Path::new(std::ffi::OsStr::from_bytes(b"conf\xffig"))));
        assert!(!policy.protects(Path::new("refs/heads/config")));
        assert!(!policy.protects(Path::new("index")));
    }

    #[test]
    fn refuses_names_that_are_not_one_segment() {
        for bad in ["", ".", "..", "a/b"] {
            assert!(Policy::new(vec![OsString::from(bad)]).is_err(), "{bad}");
        }
        assert!(Policy::new(Vec::new()).is_err());
    }
}
