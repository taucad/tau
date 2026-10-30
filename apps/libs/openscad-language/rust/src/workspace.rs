//! Every project source the server knows, plus the built-in declarations, and `use`/`include` resolution.

use std::collections::{HashMap, HashSet};

use tree_sitter::Parser;

use crate::document::{Document, new_parser};
use crate::index::{Decl, ImportKind, Namespace};

/// Generated declaration source for built-ins; the editor opens it read-only, as it does library declarations.
pub const BUILTINS_URI: &str = "file:///__openscad_builtins__/builtins.scad";
const BUILTINS_SOURCE: &str = include_str!("builtins.scad");

/// Bound shared with the TypeScript worker.
pub const MAXIMUM_FILES: usize = 2000;

pub struct Workspace {
    pub parser: Parser,
    documents: HashMap<String, Document>,
    /// Decoded absolute path (`/dir/file.scad`) to URI.
    paths: HashMap<String, String>,
    pub builtins: Document,
    builtin_names: HashMap<(String, Namespace), usize>,
}

/// A declaration and the file that declares it.
#[derive(Clone, Copy)]
pub struct Located<'w> {
    pub uri: &'w str,
    pub decl: &'w Decl,
}

/// How a file sees the top-level declarations of another file.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Visibility {
    Included,
    Used,
}

#[derive(Clone, Copy)]
pub struct Imported<'w> {
    pub uri: &'w str,
    pub path: &'w str,
    pub decl: &'w Decl,
    pub visibility: Visibility,
}

impl Default for Workspace {
    fn default() -> Self {
        Self::new()
    }
}

impl Workspace {
    pub fn new() -> Self {
        let mut parser = new_parser();
        let builtins =
            Document::new(&mut parser, BUILTINS_URI.to_owned(), "builtins.scad".to_owned(), BUILTINS_SOURCE.to_owned());
        let mut builtin_names = HashMap::new();
        for (position, decl) in builtins.index.decls.iter().enumerate() {
            builtin_names.entry((decl.name.clone(), decl.namespace())).or_insert(position);
        }
        Self { parser, documents: HashMap::new(), paths: HashMap::new(), builtins, builtin_names }
    }

    pub fn len(&self) -> usize {
        self.documents.len()
    }

    pub fn is_empty(&self) -> bool {
        self.documents.is_empty()
    }

    pub fn get(&self, uri: &str) -> Option<&Document> {
        if uri == BUILTINS_URI { Some(&self.builtins) } else { self.documents.get(uri) }
    }

    pub fn get_mut(&mut self, uri: &str) -> Option<&mut Document> {
        self.documents.get_mut(uri)
    }

    pub fn documents(&self) -> impl Iterator<Item = &Document> {
        self.documents.values()
    }

    /// Sorted for deterministic results across requests.
    pub fn sorted_documents(&self) -> Vec<&Document> {
        let mut documents: Vec<&Document> = self.documents.values().collect();
        documents.sort_by(|left, right| left.path.cmp(&right.path));
        documents
    }

    /// Insert or replace a file's text. Open documents keep the editor's text unless `force` is set.
    pub fn set_text(&mut self, uri: &str, text: String, force: bool) {
        if let Some(document) = self.documents.get_mut(uri) {
            if document.version.is_some() && !force {
                return;
            }
            if document.text != text {
                document.replace(&mut self.parser, text);
            }
            return;
        }
        let path = uri_to_path(uri);
        let document = Document::new(&mut self.parser, uri.to_owned(), path.clone(), text);
        self.paths.insert(path, uri.to_owned());
        self.documents.insert(uri.to_owned(), document);
    }

    /// Reparse a document after `Document::edit` calls.
    pub fn reparse(&mut self, uri: &str) {
        if let Some(document) = self.documents.get_mut(uri) {
            document.reparse(&mut self.parser);
        }
    }

    pub fn remove(&mut self, uri: &str) {
        if let Some(document) = self.documents.remove(uri) {
            self.paths.remove(&document.path);
        }
    }

    pub fn clear_closed(&mut self) {
        let closed: Vec<String> = self
            .documents
            .values()
            .filter(|document| document.version.is_none())
            .map(|document| document.uri.clone())
            .collect();
        for uri in closed {
            self.remove(&uri);
        }
    }

    pub fn uri_for_path(&self, path: &str) -> Option<&str> {
        self.paths.get(path).map(String::as_str)
    }

    /// Resolve `use <path>` / `include <path>` the way the OpenSCAD kernel does: relative to the importing file, or
    /// from the project root for a leading `/`.
    pub fn resolve_import(&self, from: &Document, path: &str) -> Option<&Document> {
        let absolute = resolve_import_path(&from.path, path);
        self.uri_for_path(&absolute).and_then(|uri| self.documents.get(uri))
    }

    pub fn builtin(&self, name: &str, namespace: Namespace) -> Option<&Decl> {
        self.builtin_names.get(&(name.to_owned(), namespace)).map(|position| &self.builtins.index.decls[*position])
    }

    /// Declarations other files contribute to `document`: `include` brings every top-level declaration (and the
    /// included file's own imports, since inclusion is textual); `use` brings modules and functions only.
    pub fn imported<'w>(&'w self, document: &'w Document) -> Vec<Imported<'w>> {
        let mut result = Vec::new();
        let mut visited = HashSet::from([document.uri.as_str()]);
        let mut used = Vec::new();
        self.collect_included(document, &mut visited, &mut used, &mut result);
        let mut used_seen = HashSet::new();
        for target in used {
            if !used_seen.insert(target.uri.as_str()) || target.uri == document.uri {
                continue;
            }
            let mut library = Vec::new();
            let mut library_visited = HashSet::from([target.uri.as_str()]);
            push_decls(target, Visibility::Used, &mut library);
            // A used library sees its own includes; its own `use` lines stay private to it.
            self.collect_included(target, &mut library_visited, &mut Vec::new(), &mut library);
            result.extend(
                library
                    .into_iter()
                    .filter(|item| item.decl.namespace() != Namespace::Variable)
                    .map(|item| Imported { visibility: Visibility::Used, ..item }),
            );
        }
        result
    }

    fn collect_included<'w>(
        &'w self,
        document: &'w Document,
        visited: &mut HashSet<&'w str>,
        used: &mut Vec<&'w Document>,
        result: &mut Vec<Imported<'w>>,
    ) {
        for import in &document.index.imports {
            let Some(target) = self.resolve_import(document, &import.path) else { continue };
            match import.kind {
                ImportKind::Use => used.push(target),
                ImportKind::Include => {
                    if visited.insert(target.uri.as_str()) {
                        push_decls(target, Visibility::Included, result);
                        self.collect_included(target, visited, used, result);
                    }
                }
            }
        }
    }

    /// Whether every import reachable from `document` resolves to a project file.
    pub fn imports_resolve(&self, document: &Document) -> bool {
        let mut pending = vec![document];
        let mut visited = HashSet::from([document.uri.as_str()]);
        while let Some(current) = pending.pop() {
            for import in &current.index.imports {
                match self.resolve_import(current, &import.path) {
                    Some(target) => {
                        if visited.insert(target.uri.as_str()) {
                            pending.push(target);
                        }
                    }
                    None => return false,
                }
            }
        }
        true
    }
}

fn push_decls<'w>(document: &'w Document, visibility: Visibility, result: &mut Vec<Imported<'w>>) {
    result.extend(document.index.decls.iter().map(|decl| Imported {
        uri: &document.uri,
        path: &document.path,
        decl,
        visibility,
    }));
}

pub fn resolve_import_path(from_path: &str, import: &str) -> String {
    if import.starts_with('/') {
        return normalize(import);
    }
    let directory = from_path.rsplit_once('/').map_or("", |(directory, _)| directory);
    normalize(&format!("{directory}/{import}"))
}

fn normalize(path: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split(['/', '\\']) {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            part => parts.push(part),
        }
    }
    format!("/{}", parts.join("/"))
}

/// The import path that reaches `target` from `from`, relative when it shares a directory tree.
pub fn relative_import_path(from_path: &str, target_path: &str) -> String {
    let from: Vec<&str> = from_path.trim_start_matches('/').split('/').collect();
    let target: Vec<&str> = target_path.trim_start_matches('/').split('/').collect();
    let from_directory = &from[..from.len().saturating_sub(1)];
    let shared = from_directory.iter().zip(&target).take_while(|(left, right)| left == right).count();
    let mut parts: Vec<&str> = std::iter::repeat_n("..", from_directory.len() - shared).collect();
    parts.extend(&target[shared..]);
    parts.join("/")
}

pub fn uri_to_path(uri: &str) -> String {
    let path = uri.strip_prefix("file://").unwrap_or(uri);
    let path = path.split(['?', '#']).next().unwrap_or(path);
    let decoded = percent_decode(path);
    if decoded.starts_with('/') { decoded } else { format!("/{decoded}") }
}

pub fn path_to_uri(path: &str) -> String {
    let mut uri = String::from("file://");
    for byte in path.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'-' | b'.' | b'_' | b'~') {
            uri.push(byte as char);
        } else {
            uri.push_str(&format!("%{byte:02X}"));
        }
    }
    uri
}

fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%'
            && index + 2 < bytes.len()
            && let Some(byte) =
                std::str::from_utf8(&bytes[index + 1..index + 3]).ok().and_then(|hex| u8::from_str_radix(hex, 16).ok())
        {
            decoded.push(byte);
            index += 3;
            continue;
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

/// A display path relative to the project root.
pub fn display_path(path: &str) -> &str {
    path.trim_start_matches('/')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_import_paths() {
        assert_eq!(resolve_import_path("/models/main.scad", "lib/gears.scad"), "/models/lib/gears.scad");
        assert_eq!(resolve_import_path("/models/main.scad", "../util.scad"), "/util.scad");
        assert_eq!(resolve_import_path("/models/main.scad", "/shared/a.scad"), "/shared/a.scad");
        assert_eq!(relative_import_path("/models/main.scad", "/models/lib/gears.scad"), "lib/gears.scad");
        assert_eq!(relative_import_path("/models/deep/main.scad", "/util.scad"), "../../util.scad");
        assert_eq!(relative_import_path("/main.scad", "/util.scad"), "util.scad");
    }

    #[test]
    fn round_trips_uris() {
        assert_eq!(uri_to_path("file:///my%20models/a.scad"), "/my models/a.scad");
        assert_eq!(path_to_uri("/my models/a.scad"), "file:///my%20models/a.scad");
    }

    #[test]
    fn builtins_parse_without_errors() {
        let workspace = Workspace::new();
        assert!(!workspace.builtins.tree.root_node().has_error(), "builtins.scad has a syntax error");
        for (name, namespace) in [
            ("cube", Namespace::Module),
            ("import", Namespace::Module),
            ("children", Namespace::Module),
            ("sin", Namespace::Function),
            ("$fn", Namespace::Variable),
            ("PI", Namespace::Variable),
        ] {
            assert!(workspace.builtin(name, namespace).is_some(), "missing built-in {name}");
        }
    }
}
