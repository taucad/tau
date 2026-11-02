//! Document formatting. Only whitespace outside strings changes: each line's indentation follows the syntax tree,
//! trailing whitespace goes, runs of blank lines collapse to one and the file ends with one newline. A file with
//! syntax errors is left alone, because its tree does not say where blocks end.

use std::collections::{HashMap, HashSet};

use serde_json::{Value, json};
use tree_sitter::Node;

use crate::document::Document;

/// Statements whose child statement (the part after `translate(...)`, `if (...)`, `for (...)`) may start a new line.
const CHILD_OWNERS: [&str; 6] =
    ["transform_chain", "if_block", "for_block", "intersection_for_block", "let_block", "assert_statement"];
/// Child statements that indent under their owner when they start on a later line. A `{ }` block does not: its
/// braces indent its contents.
const CHILD_STATEMENTS: [&str; 6] =
    ["transform_chain", "if_block", "for_block", "intersection_for_block", "let_block", "assert_statement"];
/// Declarations whose expression continues on later lines with one extra level.
const HANGING: [&str; 2] = ["var_declaration", "function_item"];

/// The indentation unit and tab width from LSP `FormattingOptions`.
pub struct Indent {
    pub tab_size: usize,
    pub insert_spaces: bool,
}

impl Indent {
    pub fn from_options(options: Option<&Value>) -> Self {
        let tab_size = options
            .and_then(|options| options.get("tabSize"))
            .and_then(Value::as_u64)
            .filter(|size| (1..=16).contains(size))
            .unwrap_or(2) as usize;
        let insert_spaces =
            options.and_then(|options| options.get("insertSpaces")).and_then(Value::as_bool).unwrap_or(true);
        Self { tab_size, insert_spaces }
    }

    fn columns(&self, whitespace: &str) -> usize {
        whitespace.chars().map(|character| if character == '\t' { self.tab_size } else { 1 }).sum()
    }

    fn render(&self, columns: usize) -> String {
        if self.insert_spaces {
            " ".repeat(columns)
        } else {
            format!("{}{}", "\t".repeat(columns / self.tab_size), " ".repeat(columns % self.tab_size))
        }
    }
}

/// Lines whose first character falls in `[from, to)` indent one level for `key`; levels sharing a key count once, so
/// `f([` opens one level, not two.
struct Level {
    from: usize,
    to: usize,
    key: usize,
}

struct Structure {
    levels: Vec<Level>,
    /// Closing bracket offset to the line its opening bracket is on.
    closers: HashMap<usize, usize>,
    /// Strings that span lines: their inner lines keep every byte.
    strings: Vec<(usize, usize)>,
    /// Block comments that span lines: their inner lines move with the comment's first line.
    comments: Vec<(usize, usize)>,
}

fn collect(document: &Document) -> Structure {
    let mut structure =
        Structure { levels: Vec::new(), closers: HashMap::new(), strings: Vec::new(), comments: Vec::new() };
    let mut open: Vec<(usize, u8)> = Vec::new();
    let line = |offset: usize| document.lines.line_of(offset);
    let mut cursor = document.tree.walk();
    loop {
        let node = cursor.node();
        let atomic = matches!(node.kind(), "string" | "block_comment" | "line_comment");
        visit(document, node, &mut structure, &mut open, line);
        if !atomic && cursor.goto_first_child() {
            continue;
        }
        loop {
            if cursor.goto_next_sibling() {
                break;
            }
            if !cursor.goto_parent() {
                return structure;
            }
        }
    }
}

fn visit(
    document: &Document,
    node: Node,
    structure: &mut Structure,
    open: &mut Vec<(usize, u8)>,
    line: impl Fn(usize) -> usize,
) {
    let (start, end) = (node.start_byte(), node.end_byte());
    let spans_lines = line(start) != line(end);
    match node.kind() {
        "string" if spans_lines => structure.strings.push((start, end)),
        "block_comment" if spans_lines => structure.comments.push((start, end)),
        "{" | "(" | "[" if node.child_count() == 0 => open.push((start, document.text.as_bytes()[start])),
        "}" | ")" | "]" if node.child_count() == 0 => {
            let expected = match document.text.as_bytes()[start] {
                b'}' => b'{',
                b')' => b'(',
                _ => b'[',
            };
            if open.last().is_some_and(|(_, bracket)| *bracket == expected) {
                let (opened, _) = open.pop().expect("checked above");
                structure.levels.push(Level { from: opened + 1, to: start + 1, key: line(opened) });
                structure.closers.insert(start, line(opened));
            }
        }
        kind if CHILD_OWNERS.contains(&kind) => {
            let mut children = node.walk();
            for child in node.named_children(&mut children) {
                if CHILD_STATEMENTS.contains(&child.kind()) && line(child.start_byte()) > line(start) {
                    structure.levels.push(Level { from: child.start_byte(), to: child.end_byte(), key: line(start) });
                }
            }
        }
        kind if HANGING.contains(&kind) && spans_lines => {
            structure.levels.push(Level { from: start + 1, to: end, key: line(start) });
        }
        _ => {}
    }
}

fn is_blank_byte(byte: u8) -> bool {
    byte == b' ' || byte == b'\t'
}

/// The `TextEdit`s that format `document`, in document order.
pub fn format_edits(document: &Document, indent: &Indent) -> Vec<Value> {
    if document.tree.root_node().has_error() {
        return Vec::new();
    }
    let text = document.text.as_str();
    let bytes = text.as_bytes();
    let structure = collect(document);
    let line_count = document.lines.line_count();
    // The empty line after a final newline is the end of the file, not a line.
    let lines = if text.ends_with('\n') || text.is_empty() { line_count - 1 } else { line_count };
    let bounds = |index: usize| {
        let start = document.lines.line_start(index);
        let end = if index + 1 < line_count { document.lines.line_start(index + 1) - 1 } else { text.len() };
        (start, end)
    };
    let inside = |spans: &[(usize, usize)], offset: usize| {
        spans.iter().find(|(from, to)| *from < offset && offset < *to).copied()
    };
    let mut plans: Vec<Plan> = Vec::with_capacity(lines);
    let mut shifts: Vec<isize> = Vec::with_capacity(lines);
    for index in 0..lines {
        let (start, end) = bounds(index);
        if inside(&structure.strings, start).is_some() {
            plans.push(Plan::Keep);
            shifts.push(0);
            continue;
        }
        let first = (start..end).find(|offset| !is_blank_byte(bytes[*offset]));
        // Whitespace before a newline inside a string belongs to the string.
        let content_end = if inside(&structure.strings, end).is_some() {
            end
        } else {
            (start..end).rev().find(|offset| !is_blank_byte(bytes[*offset])).map_or(start, |offset| offset + 1)
        };
        let Some(first) = first else {
            plans.push(Plan::Blank);
            shifts.push(0);
            continue;
        };
        let current = indent.columns(&text[start..first]);
        let columns = match inside(&structure.comments, start) {
            Some((comment, _)) => {
                let shift = shifts[document.lines.line_of(comment)];
                current.saturating_add_signed(shift)
            }
            None => depth(&structure, bytes, first) * indent.tab_size,
        };
        shifts.push(columns as isize - current as isize);
        plans.push(Plan::Content { first, content_end, indent: indent.render(columns) });
    }
    let last_content = plans.iter().rposition(|plan| matches!(plan, Plan::Content { .. } | Plan::Keep));
    let mut edits = Vec::new();
    let mut previous_blank = true;
    for (index, plan) in plans.iter().enumerate() {
        let (start, end) = bounds(index);
        match plan {
            Plan::Keep => previous_blank = false,
            Plan::Blank => {
                let trailing = last_content.is_none_or(|last| index > last);
                if previous_blank || trailing {
                    let next = if index + 1 < line_count { document.lines.line_start(index + 1) } else { text.len() };
                    edits.push(edit(document, start, next, ""));
                } else if end > start {
                    edits.push(edit(document, start, end, ""));
                }
                previous_blank = true;
            }
            Plan::Content { first, content_end, indent } => {
                if text[start..*first] != **indent {
                    edits.push(edit(document, start, *first, indent));
                }
                let final_line = index + 1 == lines && !text.ends_with('\n');
                let trailing = if final_line { "\n" } else { "" };
                if *content_end < end || !trailing.is_empty() {
                    edits.push(edit(document, *content_end, end, trailing));
                }
                previous_blank = false;
            }
        }
    }
    edits
}

enum Plan {
    /// A line inside a multi-line string.
    Keep,
    Blank,
    Content {
        first: usize,
        content_end: usize,
        indent: String,
    },
}

/// Indentation levels for a line whose first character is at `first`.
fn depth(structure: &Structure, bytes: &[u8], first: usize) -> usize {
    let mut keys: HashSet<usize> = structure
        .levels
        .iter()
        .filter(|level| level.from <= first && first < level.to)
        .map(|level| level.key)
        .collect();
    // `}`, `)` and `]` at the start of a line close their opener's level.
    let mut offset = first;
    while offset < bytes.len() && matches!(bytes[offset], b'}' | b')' | b']' | b' ' | b'\t') {
        if let Some(opened) = structure.closers.get(&offset) {
            keys.remove(opened);
        }
        offset += 1;
    }
    keys.len()
}

fn edit(document: &Document, from: usize, to: usize, new_text: &str) -> Value {
    json!({ "range": document.range(from, to).to_json(), "newText": new_text })
}
