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
}
