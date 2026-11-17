//! Pure builders for what `CreateProcess*` takes: the command line, the environment block, and the
//! per-launch capability SID string.

use std::collections::BTreeMap;

/// Quote one argument by the MSVC CRT rules (`CommandLineToArgvW`): wrap in quotes when it is empty or
/// holds whitespace or a quote, double the backslashes that precede a quote or the closing quote.
pub fn quote_arg(arg: &str) -> String {
    if !arg.is_empty() && !arg.chars().any(|c| matches!(c, ' ' | '\t' | '\n' | '\x0b' | '"')) {
        return arg.to_owned();
    }
    let mut out = String::with_capacity(arg.len() + 2);
    out.push('"');
    let mut backslashes = 0usize;
    for c in arg.chars() {
        match c {
            '\\' => backslashes += 1,
            '"' => {
                out.extend(std::iter::repeat_n('\\', backslashes * 2 + 1));
                out.push('"');
                backslashes = 0;
            }
            _ => {
                out.extend(std::iter::repeat_n('\\', backslashes));
                out.push(c);
                backslashes = 0;
            }
        }
    }
    out.extend(std::iter::repeat_n('\\', backslashes * 2));
    out.push('"');
    out
}

/// The full command line: the executable, always quoted, then each argument.
pub fn command_line(executable: &str, arguments: &[String]) -> String {
    let mut line = format!("\"{executable}\"");
    for arg in arguments {
        line.push(' ');
        line.push_str(&quote_arg(arg));
    }
    line
}

/// A `CREATE_UNICODE_ENVIRONMENT` block: `NAME=value\0` entries sorted case-insensitively (as Windows
/// expects), then a terminating `\0`. An empty map still yields a valid, doubly terminated block.
pub fn environment_block(environment: &BTreeMap<String, String>) -> Vec<u16> {
    let mut entries: Vec<(&String, &String)> = environment.iter().collect();
    entries.sort_by_key(|(name, _)| name.to_uppercase());
    let mut block = Vec::new();
    for (name, value) in entries {
        block.extend(name.encode_utf16());
        block.push(u16::from(b'='));
        block.extend(value.encode_utf16());
        block.push(0);
    }
    if block.is_empty() {
        block.push(0);
    }
    block.push(0);
    block
}

/// The environment `CreateProcess` is given for the shell. For an AppContainer, Windows derives the package's
/// `LOCALAPPDATA`, `TEMP` and `TMP` from the block's `LOCALAPPDATA` while it creates the process, and fails with
/// `ERROR_ENVVAR_NOT_FOUND` (203) when the block has none (WIN-X64 job 133892533972: a native worker whose launch
/// names only `SystemRoot`). So a launch without `LOCALAPPDATA` is created with the sandbox account's own, where
/// its package is registered; the runner then gives the suspended process exactly the launch's environment
/// (`win/environment.rs`), so the worker never sees it. A launch that names `LOCALAPPDATA` is created as given.
pub fn creation_environment(
    given: &BTreeMap<String, String>,
    account_local_app_data: &str,
) -> BTreeMap<String, String> {
    let mut environment = given.clone();
    if !environment.keys().any(|name| name.eq_ignore_ascii_case("LOCALAPPDATA")) {
        environment.insert("LOCALAPPDATA".to_owned(), account_local_app_data.to_owned());
    }
    environment
}

/// The `NAME=value` entries of an environment block (UTF-16, each entry NUL-terminated, the block ended by an
/// empty entry), or `None` when `block` is not a well-formed block. Entries whose name starts with `=` (the
/// per-drive current directories) are kept like any other.
pub fn parse_environment_block(block: &[u16]) -> Option<Vec<(String, String)>> {
    let mut entries = Vec::new();
    let mut rest = block;
    loop {
        let end = rest.iter().position(|&unit| unit == 0)?;
        if end == 0 {
            return Some(entries);
        }
        let entry = String::from_utf16(&rest[..end]).ok()?;
        // `=C:=C:\…` style entries: the separator is the first `=` after the first character.
        let split = entry.char_indices().skip(1).find(|&(_, c)| c == '=').map(|(i, _)| i)?;
        entries.push((entry[..split].to_owned(), entry[split + 1..].to_owned()));
        rest = &rest[end + 1..];
    }
}

/// The names (sorted, case-insensitively unique) whose value differs between the environment the launch
/// gave and the one a process actually received, including names only one of them has.
pub fn changed_environment_names(given: &BTreeMap<String, String>, actual: &[(String, String)]) -> Vec<String> {
    let upper = |entries: &mut dyn Iterator<Item = (&String, &String)>| -> BTreeMap<String, String> {
        entries.map(|(name, value)| (name.to_uppercase(), value.clone())).collect()
    };
    let given = upper(&mut given.iter());
    let actual = upper(&mut actual.iter().map(|(name, value)| (name, value)));
    let mut names: Vec<String> =
        given.keys().chain(actual.keys()).filter(|name| given.get(*name) != actual.get(*name)).cloned().collect();
    names.sort();
    names.dedup();
    names
}

/// A per-launch capability SID in the `S-1-5-21-a-b-c-d` shape Codex's `cap.rs` uses: a valid,
/// unresolvable domain-relative SID that only that launch's token carries as a restricting SID.
pub fn capability_sid(sub_authorities: [u32; 4]) -> String {
    let [a, b, c, d] = sub_authorities;
    format!("S-1-5-21-{a}-{b}-{c}-{d}")
}

/// Whether `sid` is the shape [`capability_sid`] produces.
pub fn is_capability_sid(sid: &str) -> bool {
    let Some(rest) = sid.strip_prefix("S-1-5-21-") else { return false };
    let parts: Vec<&str> = rest.split('-').collect();
    parts.len() == 4 && parts.iter().all(|p| !p.is_empty() && p.len() <= 10 && p.parse::<u32>().is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn block_of(entries: &[&str]) -> Vec<u16> {
        let mut block: Vec<u16> = Vec::new();
        for entry in entries {
            block.extend(entry.encode_utf16());
            block.push(0);
        }
        block.push(0);
        block
    }

    #[test]
    fn parses_environment_blocks_and_refuses_malformed_ones() {
        let block = block_of(&["=C:=C:\\work", "TEMP=C:\\t", "PATH=a;b=c"]);
        assert_eq!(
            parse_environment_block(&block),
            Some(vec![
                ("=C:".to_owned(), "C:\\work".to_owned()),
                ("TEMP".to_owned(), "C:\\t".to_owned()),
                ("PATH".to_owned(), "a;b=c".to_owned()),
            ])
        );
        assert_eq!(parse_environment_block(&[0]), Some(vec![]));
        let mut unterminated = block_of(&["A=1"]);
        unterminated.truncate(unterminated.len() - 1);
        assert_eq!(parse_environment_block(&unterminated), None);
        assert_eq!(parse_environment_block(&block_of(&["NOVALUE"])), None);
        let ours: BTreeMap<String, String> =
            [("TEMP".to_owned(), "x".to_owned()), ("PATH".to_owned(), "p".to_owned())].into();
        assert_eq!(parse_environment_block(&environment_block(&ours)).map(|e| e.len()), Some(2));
    }

    #[test]
    fn names_what_windows_changed_in_the_environment() {
        let given: BTreeMap<String, String> = [
            ("TEMP".to_owned(), "C:\\work\\temp".to_owned()),
            ("LOCALAPPDATA".to_owned(), "C:\\home\\AppData\\Local".to_owned()),
            ("Path".to_owned(), "p".to_owned()),
        ]
        .into();
        let actual = vec![
            ("TEMP".to_owned(), "C:\\home\\AppData\\Local\\Packages\\x\\AC\\Temp".to_owned()),
            ("LOCALAPPDATA".to_owned(), "C:\\home\\AppData\\Local\\Packages\\x\\AC".to_owned()),
            ("PATH".to_owned(), "p".to_owned()),
            ("EXTRA".to_owned(), "1".to_owned()),
        ];
        assert_eq!(changed_environment_names(&given, &actual), ["EXTRA", "LOCALAPPDATA", "TEMP"]);
        let same: Vec<(String, String)> = given.iter().map(|(n, v)| (n.clone(), v.clone())).collect();
        assert!(changed_environment_names(&given, &same).is_empty());
    }

    #[test]
    fn quotes_by_the_crt_rules() {
        assert_eq!(quote_arg("plain"), "plain");
        assert_eq!(quote_arg(""), "\"\"");
        assert_eq!(quote_arg("a b"), "\"a b\"");
        assert_eq!(quote_arg("say \"hi\""), "\"say \\\"hi\\\"\"");
        assert_eq!(quote_arg("C:\\dir with space\\"), "\"C:\\dir with space\\\\\"");
        assert_eq!(quote_arg("a\\\\\"b"), "\"a\\\\\\\\\\\"b\"");
        assert_eq!(quote_arg("C:\\no\\space"), "C:\\no\\space");
    }

    #[test]
    fn builds_the_command_line() {
        let line = command_line(
            "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
            &["-NoLogo".into(), "-Command".into(), "Write-Host \"x y\"".into()],
        );
        assert_eq!(line, "\"C:\\Program Files\\PowerShell\\7\\pwsh.exe\" -NoLogo -Command \"Write-Host \\\"x y\\\"\"");
    }

    #[test]
    fn environment_block_is_sorted_and_doubly_terminated() {
        let mut env = BTreeMap::new();
        env.insert("b".to_owned(), "2".to_owned());
        env.insert("A".to_owned(), "1".to_owned());
        env.insert("Path".to_owned(), "C:\\x".to_owned());
        let block = String::from_utf16(&environment_block(&env)).unwrap();
        assert_eq!(block, "A=1\0b=2\0Path=C:\\x\0\0");
        assert_eq!(environment_block(&BTreeMap::new()), vec![0, 0]);
    }

    #[test]
    fn capability_sids_round_trip_the_shape_check() {
        let sid = capability_sid([1, 4_294_967_295, 0, 42]);
        assert_eq!(sid, "S-1-5-21-1-4294967295-0-42");
        assert!(is_capability_sid(&sid));
        assert!(!is_capability_sid("S-1-5-21-1-2-3"));
        assert!(!is_capability_sid("S-1-5-32-544"));
        assert!(!is_capability_sid("S-1-5-21-1-2-3-4294967296"));
    }

    #[test]
    fn creates_an_appcontainer_with_a_local_app_data_only_when_the_launch_has_none() {
        let account = r"C:\Users\TauSandbox\AppData\Local";
        let worker: BTreeMap<String, String> = [("SystemRoot".to_owned(), r"C:\Windows".to_owned())].into();
        let created = creation_environment(&worker, account);
        assert_eq!(created.get("LOCALAPPDATA").map(String::as_str), Some(account));
        assert_eq!(created.get("SystemRoot"), worker.get("SystemRoot"));
        assert_eq!(
            changed_environment_names(&worker, &created.clone().into_iter().collect::<Vec<_>>()),
            ["LOCALAPPDATA"]
        );
        let shell: BTreeMap<String, String> = [("LocalAppData".to_owned(), r"C:\Temp\home\local".to_owned())].into();
        assert_eq!(creation_environment(&shell, account), shell);
    }
}
