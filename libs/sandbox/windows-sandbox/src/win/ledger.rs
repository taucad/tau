//! The person's ledger of unrestored journals (README "Sessions"): one file per launch that may have changed a
//! descriptor, `<package name>.journal`, holding its journal's path. It lives in the person's own
//! `%LOCALAPPDATA%\Tau\windows-sandbox\live`, which no launch may grant, and is read and written only under the
//! descriptor lock (`exclusive.rs`). A launch registers once its journal is complete and fsynced and before it
//! changes anything; it is unregistered when its journal is restored, by its own teardown or by `restore`.
//!
//! Every launch reads it to find the other journals covering its objects: a live launch's and a dead one's alike,
//! since a dead launch's ACEs, flags and labels stay on disk until `restore` takes them off.

use std::io::Write;
use std::path::{Path, PathBuf};

use super::container::own_local_app_data;
use super::util::{Error, Result};

const SUFFIX: &str = ".journal";

/// One other launch's journal.
pub struct Listed {
    pub journal: String,
}

/// The ledger directory.
pub fn directory() -> Result<String> {
    let base = own_local_app_data()?;
    Ok(format!("{}\\Tau\\windows-sandbox\\live", base.trim_end_matches('\\')))
}

fn pointer(package: &str) -> Result<PathBuf> {
    Ok(Path::new(&directory()?).join(format!("{package}{SUFFIX}")))
}

/// Record `journal` as `package`'s, durably.
pub fn register(package: &str, journal: &str) -> Result<()> {
    let path = pointer(package)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| Error::msg(format!("{}: {err}", parent.display())))?;
    }
    let write = || -> std::io::Result<()> {
        let mut file = std::fs::File::create(&path)?;
        file.write_all(journal.as_bytes())?;
        file.sync_all()
    };
    write().map_err(|err| Error::msg(format!("{}: {err}", path.display())))
}

/// Forget `package`'s journal; nothing to forget is fine.
pub fn unregister(package: &str) -> Result<()> {
    let path = pointer(package)?;
    match std::fs::remove_file(&path) {
        Err(err) if err.kind() != std::io::ErrorKind::NotFound => Err(Error::msg(format!("{}: {err}", path.display()))),
        _ => Ok(()),
    }
}

/// Every registered journal but `except`'s. A pointer whose journal is gone (restored by a helper that died before
/// it unregistered) is removed.
pub fn others(except: &str) -> Result<Vec<Listed>> {
    let directory = directory()?;
    let entries = match std::fs::read_dir(&directory) {
        Ok(entries) => entries,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(Error::msg(format!("{directory}: {err}"))),
    };
    let mut listed = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(package) = name.strip_suffix(SUFFIX) else { continue };
        if package.eq_ignore_ascii_case(except) {
            continue;
        }
        let journal = std::fs::read_to_string(entry.path())
            .map_err(|err| Error::msg(format!("{}: {err}", entry.path().display())))?;
        if Path::new(&journal).exists() {
            listed.push(Listed { journal });
        } else {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    Ok(listed)
}
