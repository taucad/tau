//! Declarations and imports extracted from a syntax tree.

use tree_sitter::{Node, Tree};

/// OpenSCAD keeps modules, functions and variables in separate namespaces.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Namespace {
    Module,
    Function,
    Variable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DeclKind {
    Module,
    Function,
    Variable,
    Parameter,
    LoopVariable,
    LetVariable,
}

impl DeclKind {
    pub fn namespace(self) -> Namespace {
        match self {
            Self::Module => Namespace::Module,
            Self::Function => Namespace::Function,
            _ => Namespace::Variable,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Module => "module",
            Self::Function => "function",
            Self::Variable => "variable",
            Self::Parameter => "parameter",
            Self::LoopVariable => "loop variable",
            Self::LetVariable => "let variable",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Param {
    pub name: String,
    pub default: Option<String>,
    pub range: (usize, usize),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Decl {
    pub name: String,
    pub kind: DeclKind,
    /// Byte range of the declared name.
    pub name_range: (usize, usize),
    /// Byte range of the whole declaration, for document symbols and folding.
    pub node_range: (usize, usize),
    pub params: Vec<Param>,
    /// Initializer source of a variable or parameter, or the body of a one-line function.
    pub value: Option<String>,
    /// Comment text attached to the declaration, without comment markers.
    pub doc: String,
    /// The module or function a parameter belongs to.
    pub owner: Option<String>,
}

impl Decl {
    pub fn namespace(&self) -> Namespace {
        self.kind.namespace()
    }

    /// `module name(a = 1, b)` / `function name(x)` / `name = value`.
    pub fn signature(&self) -> String {
        match self.kind {
            DeclKind::Module | DeclKind::Function => {
                format!("{} {}({})", self.kind.label(), self.name, self.parameter_list())
            }
            _ => match &self.value {
                Some(value) => format!("{} = {}", self.name, abbreviate(value, 120)),
                None => self.name.clone(),
            },
        }
    }

    pub fn parameter_list(&self) -> String {
        self.params.iter().map(Param::label).collect::<Vec<_>>().join(", ")
    }
}

impl Param {
    pub fn label(&self) -> String {
        match &self.default {
            Some(default) => format!("{} = {}", self.name, abbreviate(default, 40)),
            None => self.name.clone(),
        }
    }
}

pub fn abbreviate(text: &str, limit: usize) -> String {
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() <= limit {
        return collapsed;
    }
    let mut short: String = collapsed.chars().take(limit.saturating_sub(1)).collect();
    short.push('…');
    short
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImportKind {
    Use,
    Include,
}

impl ImportKind {
    pub fn keyword(self) -> &'static str {
        match self {
            Self::Use => "use",
            Self::Include => "include",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Import {
    pub kind: ImportKind,
    /// The path between the angle brackets.
    pub path: String,
    /// Byte range of `path`.
    pub path_range: (usize, usize),
    pub statement_range: (usize, usize),
}

#[derive(Clone, Debug, Default)]
pub struct FileIndex {
    /// Top-level declarations in source order.
    pub decls: Vec<Decl>,
    pub imports: Vec<Import>,
}

impl FileIndex {
    pub fn build(text: &str, tree: &Tree) -> Self {
        let mut index = Self::default();
        collect_top_level(text, tree.root_node(), &mut index);
        index
    }
}

fn collect_top_level(text: &str, parent: Node, index: &mut FileIndex) {
    let mut cursor = parent.walk();
    for child in parent.named_children(&mut cursor) {
        match child.kind() {
            "use_statement" | "include_statement" => {
                if let Some(import) = import_of(text, child) {
                    index.imports.push(import);
                }
            }
            "ERROR" => collect_top_level(text, child, index),
            _ => index.decls.extend(declarations_of(text, child)),
        }
    }
}

fn import_of(text: &str, statement: Node) -> Option<Import> {
    let path_node = named_child_of_kind(statement, "include_path")?;
    let raw = &text[path_node.byte_range()];
    let inner_start = path_node.start_byte() + usize::from(raw.starts_with('<'));
    let inner_end = path_node.end_byte() - usize::from(raw.ends_with('>') && raw.len() > 1);
    Some(Import {
        kind: if statement.kind() == "use_statement" { ImportKind::Use } else { ImportKind::Include },
        path: text[inner_start..inner_end.max(inner_start)].trim().to_owned(),
        path_range: (inner_start, inner_end.max(inner_start)),
        statement_range: (statement.start_byte(), statement.end_byte()),
    })
}

/// The declarations a block-level node introduces into its enclosing block.
pub fn declarations_of(text: &str, node: Node) -> Vec<Decl> {
    match node.kind() {
        "module_item" | "function_item" => callable_of(text, node).into_iter().collect(),
        "var_declaration" => {
            let doc = doc_for(text, node);
            named_child_of_kind(node, "assignment")
                .and_then(|assignment| assignment_decl(text, assignment, DeclKind::Variable, node, doc))
                .into_iter()
                .collect()
        }
        _ => Vec::new(),
    }
}

pub fn callable_of(text: &str, node: Node) -> Option<Decl> {
    let name = node.child_by_field_name("name")?;
    let kind = if node.kind() == "module_item" { DeclKind::Module } else { DeclKind::Function };
    let owner = text[name.byte_range()].to_owned();
    let params = node.child_by_field_name("parameters").map(|list| params_of(text, list)).unwrap_or_default();
    let value = if kind == DeclKind::Function {
        let mut cursor = node.walk();
        node.named_children(&mut cursor)
            .filter(|child| child.id() != name.id() && child.kind() != "parameters" && !is_comment(*child))
            .last()
            .map(|body| text[body.byte_range()].to_owned())
    } else {
        None
    };
    Some(Decl {
        name: owner,
        kind,
        name_range: (name.start_byte(), name.end_byte()),
        node_range: (node.start_byte(), node.end_byte()),
        params,
        value,
        doc: doc_for(text, node),
        owner: None,
    })
}

pub fn params_of(text: &str, list: Node) -> Vec<Param> {
    let mut params = Vec::new();
    let mut cursor = list.walk();
    for parameter in list.named_children(&mut cursor).filter(|child| child.kind() == "parameter") {
        let Some(first) = parameter.named_child(0) else { continue };
        let (name, default) = if first.kind() == "assignment" {
            match first.child_by_field_name("name") {
                Some(name) => {
                    (name, first.child_by_field_name("value").map(|value| text[value.byte_range()].to_owned()))
                }
                None => continue,
            }
        } else {
            (first, None)
        };
        params.push(Param {
            name: text[name.byte_range()].to_owned(),
            default,
            range: (name.start_byte(), name.end_byte()),
        });
    }
    params
}

pub fn parameter_decls(text: &str, callable: Node) -> Vec<Decl> {
    let owner = callable.child_by_field_name("name").map(|name| text[name.byte_range()].to_owned());
    let Some(list) = callable.child_by_field_name("parameters") else { return Vec::new() };
    params_of(text, list)
        .into_iter()
        .map(|param| Decl {
            name: param.name,
            kind: DeclKind::Parameter,
            name_range: param.range,
            node_range: param.range,
            params: Vec::new(),
            value: param.default,
            doc: String::new(),
            owner: owner.clone(),
        })
        .collect()
}

pub fn assignment_decl(text: &str, assignment: Node, kind: DeclKind, anchor: Node, doc: String) -> Option<Decl> {
    let name = assignment.child_by_field_name("name")?;
    let value = assignment.child_by_field_name("value");
    let params = value
        .filter(|value| value.kind() == "function_lit")
        .and_then(|value| value.child_by_field_name("parameters"))
        .map(|list| params_of(text, list))
        .unwrap_or_default();
    Some(Decl {
        name: text[name.byte_range()].to_owned(),
        kind,
        name_range: (name.start_byte(), name.end_byte()),
        node_range: (anchor.start_byte(), anchor.end_byte()),
        params,
        value: value.map(|value| text[value.byte_range()].to_owned()),
        doc,
        owner: None,
    })
}

pub fn is_comment(node: Node) -> bool {
    matches!(node.kind(), "line_comment" | "block_comment")
}

pub fn named_child_of_kind<'tree>(node: Node<'tree>, kind: &str) -> Option<Node<'tree>> {
    let mut cursor = node.walk();
    node.named_children(&mut cursor).find(|child| child.kind() == kind)
}

/// The comments directly above a declaration, plus a trailing comment on its last line.
pub fn doc_for(text: &str, node: Node) -> String {
    let mut above = Vec::new();
    let mut next_row = node.start_position().row;
    let mut sibling = node.prev_sibling();
    while let Some(comment) = sibling.filter(|candidate| is_comment(*candidate)) {
        if comment.end_position().row + 1 < next_row {
            break;
        }
        // A comment that trails code on its own line belongs to that code.
        let shares_line_with_code = comment.prev_sibling().is_some_and(|previous| {
            !is_comment(previous) && previous.end_position().row == comment.start_position().row
        });
        if shares_line_with_code {
            break;
        }
        above.push(clean_comment(&text[comment.byte_range()]));
        next_row = comment.start_position().row;
        sibling = comment.prev_sibling();
    }
    above.reverse();
    let mut parts: Vec<String> =
        above.into_iter().filter(|part| !part.is_empty() && !is_customizer_group(part)).collect();
    if let Some(trailing) = node
        .next_sibling()
        .filter(|candidate| is_comment(*candidate) && candidate.start_position().row == node.end_position().row)
    {
        let cleaned = clean_comment(&text[trailing.byte_range()]);
        if !cleaned.is_empty() {
            parts.push(cleaned);
        }
    }
    parts.join("\n")
}

/// `/* [Dimensions] */` names a Customizer tab; it is not documentation.
fn is_customizer_group(text: &str) -> bool {
    text.starts_with('[') && text.ends_with(']') && !text.contains('\n') && !text.contains(':') && !text.contains(',')
}

pub fn clean_comment(raw: &str) -> String {
    if let Some(body) = raw.strip_prefix("/*") {
        let body = body.trim_start_matches('*');
        let body = body.strip_suffix("*/").unwrap_or(body).trim_end_matches('*');
        let lines: Vec<&str> = body
            .lines()
            .map(|line| {
                let trimmed = line.trim_start();
                trimmed.strip_prefix("* ").or_else(|| trimmed.strip_prefix('*')).unwrap_or(trimmed).trim_end()
            })
            .collect();
        return trim_blank_lines(&lines);
    }
    let lines: Vec<&str> = raw
        .lines()
        .map(|line| {
            let body = line.trim_start().trim_start_matches('/');
            body.strip_prefix(' ').unwrap_or(body).trim_end()
        })
        .collect();
    trim_blank_lines(&lines)
}

fn trim_blank_lines(lines: &[&str]) -> String {
    let start = lines.iter().position(|line| !line.trim().is_empty()).unwrap_or(lines.len());
    let end = lines.iter().rposition(|line| !line.trim().is_empty()).map_or(start, |end| end + 1);
    lines[start..end].join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::new_parser;

    #[test]
    fn indexes_declarations_with_documentation() {
        let text = [
            "use <lib/gears.scad>",
            "include <util.scad>",
            "/* [Size] */",
            "// Overall size",
            "size = 10; // [1:100]",
            "",
            "/**",
            " * A gear.",
            " * @param teeth Tooth count",
            " */",
            "module gear(teeth = 12, $fn = 32) { cylinder(h = 2, r = teeth); }",
            "function area(r) = PI * r * r;",
            "f = function (x) x + 1;",
        ]
        .join("\n");
        let tree = new_parser().parse(&text, None).unwrap();
        let index = FileIndex::build(&text, &tree);
        assert_eq!(
            index.imports.iter().map(|import| (import.kind, import.path.as_str())).collect::<Vec<_>>(),
            vec![(ImportKind::Use, "lib/gears.scad"), (ImportKind::Include, "util.scad")]
        );
        let names: Vec<_> = index.decls.iter().map(|decl| (decl.name.as_str(), decl.kind)).collect();
        assert_eq!(
            names,
            vec![
                ("size", DeclKind::Variable),
                ("gear", DeclKind::Module),
                ("area", DeclKind::Function),
                ("f", DeclKind::Variable)
            ]
        );
        assert_eq!(index.decls[0].doc, "Overall size\n[1:100]");
        assert_eq!(index.decls[1].doc, "A gear.\n@param teeth Tooth count");
        assert_eq!(index.decls[1].signature(), "module gear(teeth = 12, $fn = 32)");
        assert_eq!(index.decls[2].value.as_deref(), Some("PI * r * r"));
        assert_eq!(index.decls[3].params[0].name, "x");
    }
}
