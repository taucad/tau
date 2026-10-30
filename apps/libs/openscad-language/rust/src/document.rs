//! One OpenSCAD source: text, syntax tree and the declarations it contributes.

use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hasher};

use tree_sitter::{InputEdit, Node, Parser, Point, Tree};

use crate::index::FileIndex;
use crate::text::{LineIndex, Position};

unsafe extern "C" {
    fn tree_sitter_openscad() -> *const ();
}

const LANGUAGE: tree_sitter_language::LanguageFn =
    unsafe { tree_sitter_language::LanguageFn::from_raw(tree_sitter_openscad) };

pub fn language() -> tree_sitter::Language {
    LANGUAGE.into()
}

pub fn new_parser() -> Parser {
    let mut parser = Parser::new();
    parser.set_language(&language()).expect("the vendored grammar matches the tree-sitter ABI");
    parser
}

pub struct Document {
    pub uri: String,
    /// Workspace path without percent-encoding, used for import resolution and display.
    pub path: String,
    pub text: String,
    pub tree: Tree,
    pub lines: LineIndex,
    /// Set while the editor owns the text; closed files follow workspace snapshots.
    pub version: Option<i64>,
    pub index: FileIndex,
}

impl Document {
    pub fn new(parser: &mut Parser, uri: String, path: String, text: String) -> Self {
        let tree = parse(parser, &text, None);
        let lines = LineIndex::new(&text);
        let index = FileIndex::build(&text, &tree);
        Self { uri, path, text, tree, lines, version: None, index }
    }

    pub fn replace(&mut self, parser: &mut Parser, text: String) {
        self.tree = parse(parser, &text, None);
        self.lines = LineIndex::new(&text);
        self.text = text;
        self.index = FileIndex::build(&self.text, &self.tree);
    }

    /// Apply one LSP range change and reparse incrementally.
    pub fn edit(&mut self, start: Position, end: Position, inserted: &str) {
        let start_byte = self.lines.offset(&self.text, start);
        let old_end_byte = self.lines.offset(&self.text, end).max(start_byte);
        let start_point = self.point(start_byte);
        let old_end_point = self.point(old_end_byte);
        self.text.replace_range(start_byte..old_end_byte, inserted);
        let new_end_byte = start_byte + inserted.len();
        let new_end_point = match inserted.rfind('\n') {
            Some(last) => {
                Point { row: start_point.row + inserted.matches('\n').count(), column: inserted.len() - last - 1 }
            }
            None => Point { row: start_point.row, column: start_point.column + inserted.len() },
        };
        self.tree.edit(&InputEdit {
            start_byte,
            old_end_byte,
            new_end_byte,
            start_position: start_point,
            old_end_position: old_end_point,
            new_end_position: new_end_point,
        });
        self.lines = LineIndex::new(&self.text);
    }

    /// Reparse after one or more `edit` calls.
    pub fn reparse(&mut self, parser: &mut Parser) {
        self.tree = parse(parser, &self.text, Some(&self.tree));
        self.index = FileIndex::build(&self.text, &self.tree);
    }

    fn point(&self, offset: usize) -> Point {
        let line = self.lines.line_of(offset);
        Point { row: line, column: offset - self.lines.line_start(line) }
    }

    pub fn node_text(&self, node: Node) -> &str {
        &self.text[node.byte_range()]
    }

    pub fn range(&self, start: usize, end: usize) -> crate::text::Range {
        self.lines.range(&self.text, start, end)
    }

    pub fn offset(&self, position: Position) -> usize {
        self.lines.offset(&self.text, position)
    }
}

fn parse(parser: &mut Parser, text: &str, old: Option<&Tree>) -> Tree {
    parser
        .parse(text, old)
        .unwrap_or_else(|| parser.parse(text, None).expect("parsing without a timeout always completes"))
}

/// Parent links for one syntax tree. tree-sitter finds a node's parent by descending from the root and scanning each
/// level's children, so in a long module body every step up costs the body's length; requests that resolve many names
/// record the links once instead. The default asks tree-sitter.
#[derive(Default)]
pub struct Parents<'t>(Option<HashMap<usize, Node<'t>, BuildHasherDefault<NodeIdHasher>>>);

impl<'t> Parents<'t> {
    pub fn of(root: Node<'t>) -> Self {
        let mut links = HashMap::with_capacity_and_hasher(root.descendant_count(), BuildHasherDefault::default());
        let mut cursor = root.walk();
        let mut ancestors = vec![root];
        'walk: loop {
            if cursor.goto_first_child() {
                let node = cursor.node();
                links.insert(node.id(), *ancestors.last().expect("a child has a parent"));
                ancestors.push(node);
                continue;
            }
            loop {
                ancestors.pop();
                if cursor.goto_next_sibling() {
                    let node = cursor.node();
                    links.insert(node.id(), *ancestors.last().expect("a sibling has a parent"));
                    ancestors.push(node);
                    continue 'walk;
                }
                if !cursor.goto_parent() {
                    break 'walk;
                }
            }
        }
        Self(Some(links))
    }

    pub fn get(&self, node: Node<'t>) -> Option<Node<'t>> {
        match &self.0 {
            Some(links) => links.get(&node.id()).copied(),
            None => node.parent(),
        }
    }
}

/// Node ids are distinct addresses, so a multiplicative mix is enough and far cheaper than SipHash.
#[derive(Default)]
pub struct NodeIdHasher(u64);

impl Hasher for NodeIdHasher {
    fn finish(&self) -> u64 {
        self.0
    }

    fn write(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.0 = (self.0.rotate_left(8) ^ u64::from(*byte)).wrapping_mul(0x9E37_79B9_7F4A_7C15);
        }
    }

    fn write_usize(&mut self, value: usize) {
        self.0 = (value as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    }
}
