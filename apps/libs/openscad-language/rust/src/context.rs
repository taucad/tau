//! Lexical context of a cursor, for requests made while the code is incomplete and the syntax tree has errors.

use crate::resolve::is_identifier_byte;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct CursorContext {
    pub in_comment: bool,
    pub in_string: bool,
    /// Start of the path typed after `use <` or `include <`.
    pub import_path_start: Option<usize>,
    /// Innermost unclosed bracket: `(`, `[` or `{` and its offset.
    pub open: Vec<(u8, usize)>,
}

pub fn scan(text: &str, end: usize) -> CursorContext {
    let bytes = &text.as_bytes()[..end.min(text.len())];
    let mut context = CursorContext::default();
    let mut index = 0;
    while index < bytes.len() {
        let byte = bytes[index];
        match byte {
            b'/' if bytes.get(index + 1) == Some(&b'/') => {
                match bytes[index..].iter().position(|byte| *byte == b'\n') {
                    Some(newline) => index += newline,
                    None => {
                        context.in_comment = true;
                        return context;
                    }
                }
            }
            b'/' if bytes.get(index + 1) == Some(&b'*') => match find(bytes, index + 2, b"*/") {
                Some(close) => index = close + 1,
                None => {
                    context.in_comment = true;
                    return context;
                }
            },
            b'"' => {
                let mut cursor = index + 1;
                loop {
                    match bytes.get(cursor) {
                        None => {
                            context.in_string = true;
                            return context;
                        }
                        Some(b'\\') => cursor += 2,
                        Some(b'"') => break,
                        Some(_) => cursor += 1,
                    }
                }
                index = cursor;
            }
            b'<' if import_keyword_before(bytes, index) => {
                match bytes[index..].iter().position(|byte| matches!(byte, b'>' | b'\n')) {
                    Some(close) => index += close,
                    None => {
                        context.import_path_start = Some(index + 1);
                        return context;
                    }
                }
            }
            b'(' | b'[' | b'{' => context.open.push((byte, index)),
            b')' | b']' | b'}' => {
                context.open.pop();
            }
            _ => {}
        }
        index += 1;
    }
    context
}

fn find(bytes: &[u8], from: usize, needle: &[u8]) -> Option<usize> {
    bytes.get(from..)?.windows(needle.len()).position(|window| window == needle).map(|position| from + position)
}

fn import_keyword_before(bytes: &[u8], index: usize) -> bool {
    let before = trim_end(bytes, index);
    ends_with_word(bytes, before, b"use") || ends_with_word(bytes, before, b"include")
}

fn trim_end(bytes: &[u8], mut index: usize) -> usize {
    while index > 0 && bytes[index - 1].is_ascii_whitespace() {
        index -= 1;
    }
    index
}

fn ends_with_word(bytes: &[u8], end: usize, word: &[u8]) -> bool {
    end >= word.len()
        && &bytes[end - word.len()..end] == word
        && (end == word.len() || !is_identifier_byte(bytes[end - word.len() - 1]))
}

/// The identifier characters ending at `offset`.
pub fn word_before(text: &str, offset: usize) -> (usize, &str) {
    let bytes = text.as_bytes();
    let mut start = offset.min(bytes.len());
    while start > 0 && is_identifier_byte(bytes[start - 1]) {
        start -= 1;
    }
    (start, &text[start..offset.min(bytes.len())])
}

pub fn word_end(text: &str, offset: usize) -> usize {
    let bytes = text.as_bytes();
    let mut end = offset;
    while end < bytes.len() && is_identifier_byte(bytes[end]) {
        end += 1;
    }
    end
}

/// Whether a name typed at `start` begins a statement (module instantiation, declaration) rather than an expression.
pub fn is_statement_position(text: &str, start: usize) -> bool {
    let bytes = text.as_bytes();
    let mut index = trim_end(bytes, start);
    // Skip modifier characters: `#cube()`, `%`, `!` and `*` disable or highlight a statement.
    while index > 0 && matches!(bytes[index - 1], b'#' | b'%' | b'!' | b'*') {
        let before = trim_end(bytes, index - 1);
        if before == 0 || matches!(bytes[before - 1], b';' | b'{' | b'}' | b')') {
            index = before;
        } else {
            break;
        }
    }
    if index == 0 {
        return true;
    }
    match bytes[index - 1] {
        b';' | b'{' | b'}' => true,
        // `translate(v) cube()` and `if (c) cube()` continue a statement; `x = f(a) …` does not.
        b')' => matching_open(bytes, index - 1).is_some_and(|open| {
            let (word_start, word) =
                word_before(std::str::from_utf8(&bytes[..open]).unwrap_or(""), trim_end(bytes, open));
            !word.is_empty() && is_statement_position(text, word_start)
        }),
        b'e' => ends_with_word(bytes, index, b"else"),
        // `use <file.scad>` and `include <file.scad>` end without a semicolon.
        b'>' => {
            let line_start = bytes[..index].iter().rposition(|byte| *byte == b'\n').map_or(0, |newline| newline + 1);
            let line = std::str::from_utf8(&bytes[line_start..index]).unwrap_or("").trim_start();
            line.starts_with("use") || line.starts_with("include")
        }
        _ => false,
    }
}

fn matching_open(bytes: &[u8], close: usize) -> Option<usize> {
    let mut depth = 0usize;
    for index in (0..=close).rev() {
        match bytes[index] {
            b')' | b']' => depth += 1,
            b'(' | b'[' => {
                depth -= 1;
                if depth == 0 {
                    return Some(index);
                }
            }
            _ => {}
        }
    }
    None
}

#[derive(Debug, PartialEq, Eq)]
pub struct CallContext {
    /// Byte range of the callee name.
    pub callee: (usize, usize),
    pub name: String,
    /// Zero-based index of the argument under the cursor.
    pub argument: usize,
    /// Name of the argument under the cursor when it is written `name = value`.
    pub named: Option<String>,
    /// Named arguments already written.
    pub used: Vec<String>,
    /// Whether the cursor is where an argument name may start.
    pub at_argument_start: bool,
    /// Whether the call is a module instantiation.
    pub statement: bool,
}

/// The innermost call whose argument list contains `offset`.
pub fn call_at(text: &str, offset: usize, context: &CursorContext) -> Option<CallContext> {
    let (kind, open) = *context.open.last()?;
    if kind != b'(' {
        return None;
    }
    let (callee_start, name) = word_before(text, trim_end(text.as_bytes(), open));
    if name.is_empty() || matches!(name, "for" | "if" | "let" | "intersection_for" | "function" | "module" | "each") {
        return None;
    }
    let arguments = split_arguments(&text[open + 1..offset]);
    let current = arguments.last().map_or("", |argument| argument.as_str());
    let named_in = |argument: &str| -> Option<String> {
        let (name, rest) = argument.split_once('=')?;
        if rest.starts_with('=') {
            return None;
        }
        let name = name.trim();
        (!name.is_empty() && name.bytes().all(is_identifier_byte)).then(|| name.to_owned())
    };
    let used =
        arguments[..arguments.len().saturating_sub(1)].iter().filter_map(|argument| named_in(argument)).collect();
    let at_argument_start = current.trim_start().bytes().all(is_identifier_byte);
    Some(CallContext {
        callee: (callee_start, callee_start + name.len()),
        name: name.to_owned(),
        argument: arguments.len().saturating_sub(1),
        named: named_in(current),
        used,
        at_argument_start,
        statement: is_statement_position(text, callee_start),
    })
}

/// Split call arguments at top-level commas, skipping strings and nested brackets.
fn split_arguments(text: &str) -> Vec<String> {
    let mut parts = vec![String::new()];
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escaped = false;
    for character in text.chars() {
        if in_string {
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                in_string = false;
            }
        } else {
            match character {
                '"' => in_string = true,
                '(' | '[' | '{' => depth += 1,
                ')' | ']' | '}' => depth -= 1,
                ',' if depth == 0 => {
                    parts.push(String::new());
                    continue;
                }
                _ => {}
            }
        }
        if let Some(last) = parts.last_mut() {
            last.push(character);
        }
    }
    parts
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context_at(text: &str) -> (String, usize) {
        let offset = text.find('|').unwrap();
        (text.replacen('|', "", 1), offset)
    }

    #[test]
    fn finds_import_paths_and_comments() {
        let (text, offset) = context_at("use <lib/ge|");
        assert_eq!(scan(&text, offset).import_path_start, Some(5));
        let (text, offset) = context_at("x = 1; // cu|");
        assert!(scan(&text, offset).in_comment);
        let (text, offset) = context_at("echo(\"cu|");
        assert!(scan(&text, offset).in_string);
        let (text, offset) = context_at("a = b < c; cu|");
        assert_eq!(scan(&text, offset), CursorContext::default());
    }

    #[test]
    fn finds_calls() {
        let (text, offset) = context_at("cube(size = [1, 2, 3], ce|");
        let call = call_at(&text, offset, &scan(&text, offset)).unwrap();
        assert_eq!(call.name, "cube");
        assert_eq!(call.argument, 1);
        assert_eq!(call.used, vec!["size".to_owned()]);
        assert!(call.at_argument_start);
        assert!(call.statement);
        let (text, offset) = context_at("x = max(1, sin(|");
        let call = call_at(&text, offset, &scan(&text, offset)).unwrap();
        assert_eq!(call.name, "sin");
        assert!(!call.statement);
    }

    #[test]
    fn classifies_statement_positions() {
        for (source, expected) in [
            ("|", true),
            ("cube(1); |", true),
            ("translate([1, 0, 0]) |", true),
            ("module m() { |", true),
            ("#|", true),
            ("x = |", false),
            ("x = a * |", false),
            ("f(1, |", false),
            ("if (a) cube(1); else |", true),
            ("use <a.scad>\n|", true),
            ("x = a > |", false),
        ] {
            let (text, offset) = context_at(source);
            assert_eq!(is_statement_position(&text, offset), expected, "{source}");
        }
    }
}
