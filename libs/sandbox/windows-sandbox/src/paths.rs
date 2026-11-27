//! Windows path checks over plain strings, so they run and are tested on any host.
//!
//! The host hands the helper resolved, absolute paths. The helper still refuses every spelling that could
//! alias another file: relative or drive-relative paths, `.`/`..` components, device and UNC prefixes,
//! alternate data streams, wildcards, and components with the trailing dots or spaces Win32 strips.

use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PathError {
    Empty,
    NotDriveAbsolute,
    Nul,
    ForbiddenCharacter(char),
    EmptyComponent,
    DotComponent,
    TrailingDotOrSpace,
}

impl fmt::Display for PathError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PathError::Empty => write!(f, "path is empty"),
            PathError::NotDriveAbsolute => write!(f, "path is not an absolute drive path (X:\\...)"),
            PathError::Nul => write!(f, "path contains NUL"),
            PathError::ForbiddenCharacter(c) => write!(f, "path contains forbidden character {c:?}"),
            PathError::EmptyComponent => write!(f, "path contains an empty component"),
            PathError::DotComponent => write!(f, "path contains a '.' or '..' component"),
            PathError::TrailingDotOrSpace => write!(f, "a path component ends in a dot or space"),
        }
    }
}

/// Normalise an absolute drive path: `/` becomes `\`, the drive letter is upper-cased and a trailing
/// separator is dropped (except on a drive root, `C:\`). Everything else must already be canonical.
pub fn normalize_absolute(input: &str) -> Result<String, PathError> {
    if input.is_empty() {
        return Err(PathError::Empty);
    }
    if input.contains('\0') {
        return Err(PathError::Nul);
    }
    let path = input.replace('/', "\\");
    let bytes = path.as_bytes();
    if bytes.len() < 3 || !bytes[0].is_ascii_alphabetic() || bytes[1] != b':' || bytes[2] != b'\\' {
        return Err(PathError::NotDriveAbsolute);
    }
    let rest = &path[3..];
    for c in rest.chars() {
        if matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|') || (c as u32) < 0x20 {
            return Err(PathError::ForbiddenCharacter(c));
        }
    }
    let trimmed = rest.strip_suffix('\\').unwrap_or(rest);
    let mut out = String::with_capacity(path.len());
    out.push(bytes[0].to_ascii_uppercase() as char);
    out.push_str(":\\");
    if trimmed.is_empty() {
        return Ok(out);
    }
    for (index, component) in trimmed.split('\\').enumerate() {
        if component.is_empty() {
            return Err(PathError::EmptyComponent);
        }
        if component == "." || component == ".." {
            return Err(PathError::DotComponent);
        }
        if component.ends_with('.') || component.ends_with(' ') {
            return Err(PathError::TrailingDotOrSpace);
        }
        if index > 0 {
            out.push('\\');
        }
        out.push_str(component);
    }
    Ok(out)
}

fn fold(s: &str) -> String {
    s.chars().flat_map(char::to_uppercase).collect()
}

/// Whether `path` is `root` or lies beneath it, compared case-insensitively on whole components. Both
/// arguments must already be normalised.
pub fn is_within(path: &str, root: &str) -> bool {
    let path = fold(path);
    let root = fold(root);
    if path == root {
        return true;
    }
    let prefix = if root.ends_with('\\') { root } else { format!("{root}\\") };
    path.starts_with(&prefix)
}

/// The final component's extension, lower-cased (`pwsh.exe` → `exe`).
pub fn extension(path: &str) -> Option<String> {
    let name = path.rsplit('\\').next()?;
    let (_, ext) = name.rsplit_once('.')?;
    Some(ext.to_ascii_lowercase())
}

/// The `\\?\` spelling of a drive path, so Win32 opens it without the `MAX_PATH` limit or any further
/// parsing. Anything else (already prefixed, or not a drive path) is returned unchanged.
pub fn extended(path: &str) -> String {
    let bytes = path.as_bytes();
    if bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'\\' {
        format!("\\\\?\\{path}")
    } else {
        path.to_owned()
    }
}

/// Whether the path `GetFinalPathNameByHandleW` reports for an open file (`\\?\C:\…`, every link and
/// junction resolved) names the same file as the normalised path it was opened by. A link anywhere along the
/// way makes them differ.
pub fn same_final_path(final_path: &str, path: &str) -> bool {
    let Some(drive_path) = final_path.strip_prefix("\\\\?\\") else { return false };
    match normalize_absolute(drive_path) {
        Ok(drive_path) => fold(&drive_path) == fold(path),
        Err(_) => false,
    }
}

/// The drive (`C:`) of a drive-rooted path such as the Windows directory, as `SystemDrive` spells it. `None` for a
/// path that does not start with a drive letter and a colon.
pub fn drive_of(path: &str) -> Option<String> {
    let mut chars = path.chars();
    match (chars.next(), chars.next()) {
        (Some(letter), Some(':')) if letter.is_ascii_alphabetic() => Some(format!("{}:", letter.to_ascii_uppercase())),
        _ => None,
    }
}

#[cfg(test)]
mod tests {

    #[test]
    fn names_the_drive_of_the_windows_directory() {
        assert_eq!(drive_of(r"C:\Windows").as_deref(), Some("C:"));
        assert_eq!(drive_of(r"d:\WINDOWS").as_deref(), Some("D:"));
        assert_eq!(drive_of(r"\\server\share"), None);
        assert_eq!(drive_of(""), None);
        assert_eq!(drive_of("1:"), None);
    }

    use super::*;

    #[test]
    fn normalizes_drive_paths() {
        assert_eq!(normalize_absolute("c:/Users/a/").unwrap(), "C:\\Users\\a");
        assert_eq!(normalize_absolute("C:\\").unwrap(), "C:\\");
        assert_eq!(normalize_absolute("d:\\x\\y.txt").unwrap(), "D:\\x\\y.txt");
    }

    #[test]
    fn refuses_aliasing_spellings() {
        for bad in [
            "",
            "relative\\path",
            "C:relative",
            "\\\\server\\share\\x",
            "\\\\?\\C:\\x",
            "\\\\.\\pipe\\x",
            "C:\\a\\..\\b",
            "C:\\a\\.\\b",
            "C:\\a\\\\b",
            "C:\\a\\file.txt:stream",
            "C:\\a\\b.",
            "C:\\a\\b \\c",
            "C:\\a\\*",
            "C:\\a\0b",
            "C:\\a\nb",
        ] {
            assert!(normalize_absolute(bad).is_err(), "{bad:?} should be refused");
        }
    }

    #[test]
    fn within_is_component_aware_and_case_insensitive() {
        assert!(is_within("C:\\Program Files\\PowerShell\\7\\pwsh.exe", "C:\\Program Files"));
        assert!(is_within("c:\\program files\\x.exe", "C:\\Program Files"));
        assert!(is_within("C:\\Windows", "C:\\Windows"));
        assert!(!is_within("C:\\Program Files (x86)\\x.exe", "C:\\Program Files"));
        assert!(!is_within("C:\\WindowsApps\\x.exe", "C:\\Windows"));
        assert!(is_within("C:\\x", "C:\\"));
    }

    #[test]
    fn extended_prefixes_drive_paths_only() {
        assert_eq!(extended("C:\\a\\b"), "\\\\?\\C:\\a\\b");
        assert_eq!(extended("\\\\?\\C:\\a"), "\\\\?\\C:\\a");
        assert_eq!(extended("relative"), "relative");
    }

    #[test]
    fn final_paths_must_name_the_opened_path() {
        assert!(same_final_path("\\\\?\\C:\\Users\\a\\rt\\python.exe", "C:\\Users\\a\\rt\\python.exe"));
        assert!(same_final_path("\\\\?\\c:\\users\\A\\RT\\Python.exe", "C:\\Users\\a\\rt\\python.exe"));
        // Through a junction: the final path is the target's.
        assert!(!same_final_path("\\\\?\\D:\\elsewhere\\python.exe", "C:\\Users\\a\\rt\\python.exe"));
        assert!(!same_final_path("\\\\?\\UNC\\server\\share\\python.exe", "C:\\Users\\a\\rt\\python.exe"));
        assert!(!same_final_path("C:\\Users\\a\\rt\\python.exe", "C:\\Users\\a\\rt\\python.exe"));
        // An 8.3 alias of the same file is not its final path.
        assert!(!same_final_path("\\\\?\\C:\\Users\\a\\runtime\\python.exe", "C:\\Users\\a\\RUNTIM~1\\python.exe"));
    }

    #[test]
    fn extension_is_lowercased() {
        assert_eq!(extension("C:\\a\\PWSH.EXE").as_deref(), Some("exe"));
        assert_eq!(extension("C:\\a.b\\noext"), None);
        assert_eq!(extension("C:\\a\\run.cmd").as_deref(), Some("cmd"));
    }
}
