//! A streaming, depth-first walk of the objects under a directory, for the ACL journal.
//!
//! The walk holds one open directory iterator per level, never the whole listing, so memory grows with the
//! depth of the tree and not its size. It never follows a reparse point: a junction, a symbolic link or any
//! other reparse point is visited as a leaf, because `SetNamedSecurityInfoW` changes the link's own
//! descriptor but does not propagate through it.

use std::fs::{self, DirEntry, ReadDir};
use std::io;
use std::path::{Path, PathBuf};

/// A counted list that keeps only its first few items: what a walk could not enter (an object the person
/// cannot list or read is one ACL propagation cannot reach either), or what a restore could not confirm.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Sample {
    pub count: u64,
    /// The first few, for the diagnostic log.
    pub first: Vec<String>,
}

impl Sample {
    const KEEP: usize = 8;

    pub fn note(&mut self, what: String) {
        self.count += 1;
        if self.first.len() < Self::KEEP {
            self.first.push(what);
        }
    }

    pub fn is_empty(&self) -> bool {
        self.count == 0
    }

    /// The kept items, then one line counting the rest.
    pub fn messages(&self) -> Vec<String> {
        let mut messages = self.first.clone();
        let rest = self.count - self.first.len() as u64;
        if rest > 0 {
            messages.push(format!("and {rest} more"));
        }
        messages
    }
}

/// Whether to descend into `entry`: a real directory, not a reparse point of any kind.
fn descend(entry: &DirEntry) -> io::Result<bool> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x10;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        // On Windows `DirEntry::metadata` comes from the directory listing and does not follow links.
        let attributes = entry.metadata()?.file_attributes();
        Ok(attributes & FILE_ATTRIBUTE_DIRECTORY != 0 && attributes & FILE_ATTRIBUTE_REPARSE_POINT == 0)
    }
    #[cfg(not(windows))]
    {
        // `DirEntry::file_type` does not follow symbolic links.
        Ok(entry.file_type()?.is_dir())
    }
}

/// Visit every object under `root` (not `root` itself), parents before their children. `skip` prunes an
/// object and everything under it (another journaled root nested in this one). An error from `visit` ends
/// the walk; a directory that cannot be read is noted in `skipped` and passed over.
pub fn walk(
    root: &Path,
    skip: impl Fn(&Path) -> bool,
    mut visit: impl FnMut(&Path) -> io::Result<()>,
    skipped: &mut Sample,
) -> io::Result<()> {
    let mut stack: Vec<ReadDir> = match fs::read_dir(root) {
        Ok(entries) => vec![entries],
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(err) => {
            skipped.note(format!("{}: {err}", root.display()));
            return Ok(());
        }
    };
    while let Some(entries) = stack.last_mut() {
        let Some(next) = entries.next() else {
            stack.pop();
            continue;
        };
        let entry = match next {
            Ok(entry) => entry,
            Err(err) => {
                skipped.note(format!("an entry under {}: {err}", root.display()));
                continue;
            }
        };
        let path: PathBuf = entry.path();
        if skip(&path) {
            continue;
        }
        visit(&path)?;
        match descend(&entry) {
            Ok(true) => match fs::read_dir(&path) {
                Ok(children) => stack.push(children),
                Err(err) if err.kind() == io::ErrorKind::NotFound => {}
                Err(err) => skipped.note(format!("{}: {err}", path.display())),
            },
            Ok(false) => {}
            Err(err) => skipped.note(format!("{}: {err}", path.display())),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tau-ws-tree-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn collect(root: &Path, skip: impl Fn(&Path) -> bool) -> Vec<String> {
        let mut seen = Vec::new();
        let mut skipped = Sample::default();
        walk(
            root,
            skip,
            |path| {
                seen.push(path.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/"));
                Ok(())
            },
            &mut skipped,
        )
        .unwrap();
        assert_eq!(skipped, Sample::default());
        seen
    }

    #[test]
    fn visits_every_descendant_parents_first() {
        let root = temp("all");
        fs::create_dir_all(root.join("a/b/c")).unwrap();
        fs::write(root.join("a/b/c/f.txt"), "x").unwrap();
        fs::write(root.join("a/g.txt"), "x").unwrap();
        fs::create_dir(root.join("e")).unwrap();
        let mut seen = collect(&root, |_| false);
        for (index, path) in seen.iter().enumerate() {
            if let Some((parent, _)) = path.rsplit_once('/') {
                let parent_at = seen.iter().position(|p| p == parent).unwrap();
                assert!(parent_at < index, "{parent} after {path}");
            }
        }
        seen.sort();
        assert_eq!(seen, ["a", "a/b", "a/b/c", "a/b/c/f.txt", "a/g.txt", "e"]);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn prunes_skipped_subtrees() {
        let root = temp("skip");
        fs::create_dir_all(root.join("keep/inner")).unwrap();
        fs::create_dir_all(root.join("nested-root/inner")).unwrap();
        let nested = root.join("nested-root");
        let mut seen = collect(&root, |path| path == nested);
        seen.sort();
        assert_eq!(seen, ["keep", "keep/inner"]);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_missing_root_has_no_descendants() {
        let root = temp("missing").join("absent");
        assert!(collect(&root, |_| false).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn links_are_leaves() {
        let root = temp("links");
        let outside = temp("links-outside");
        fs::write(outside.join("secret.txt"), "x").unwrap();
        fs::create_dir(root.join("d")).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("d/out")).unwrap();
        std::os::unix::fs::symlink(&root, root.join("d/loop")).unwrap();
        let mut seen = collect(&root, |_| false);
        seen.sort();
        assert_eq!(seen, ["d", "d/loop", "d/out"]);
        fs::remove_dir_all(&root).unwrap();
        fs::remove_dir_all(&outside).unwrap();
    }

    #[test]
    fn visit_errors_end_the_walk() {
        let root = temp("error");
        fs::create_dir_all(root.join("a/b")).unwrap();
        let mut skipped = Sample::default();
        let result = walk(&root, |_| false, |_| Err(io::Error::other("disk full")), &mut skipped);
        assert_eq!(result.unwrap_err().to_string(), "disk full");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn skipped_keeps_a_bounded_sample() {
        let mut skipped = Sample::default();
        for index in 0..20 {
            skipped.note(format!("x{index}"));
        }
        assert_eq!(skipped.count, 20);
        assert_eq!(skipped.first.len(), Sample::KEEP);
        let messages = skipped.messages();
        assert_eq!(messages.len(), Sample::KEEP + 1);
        assert_eq!(messages.last().unwrap(), "and 12 more");
        let mut few = Sample::default();
        assert!(few.is_empty());
        few.note("one".into());
        assert_eq!(few.messages(), ["one"]);
    }
}
