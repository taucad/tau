//! The store policy: the top-level names of a git directory that the guard keeps read-only, each with everything
//! under it. The list is not compiled in: the host passes Tau's one `terminalGitStorePolicy` list as arguments, so the
//! Seatbelt profile on macOS and this guard on Linux enforce the same names.

use std::ffi::OsString;
use std::os::unix::ffi::OsStrExt;
use std::path::{Component, Path};

/// The protected names of one store, compared as exact bytes: Linux volumes are case-sensitive.
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
            Some(Component::Normal(first)) => self.names.iter().any(|name| name.as_os_str() == first),
            _ => false,
        }
    }
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
        assert!(!policy.protects(Path::new("CONFIG")));
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
