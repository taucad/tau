//! LSP requests.

use std::collections::{BTreeMap, HashMap, HashSet};

use serde_json::{Value, json};
use tree_sitter::Node;

use crate::context::{self, CallContext};
use crate::docs::{self, LinkTarget};
use crate::document::Document;
use crate::index::{Decl, DeclKind, ImportKind, Namespace, is_comment};
use crate::resolve::{Resolved, Resolver, Role, Target, references as find_references, target_at, target_for_node};
use crate::server::{RpcError, RpcResult, invalid_params, text_document_position};
use crate::text::Range;
use crate::workspace::{BUILTINS_URI, Visibility, Workspace, display_path, relative_import_path, resolve_import_path};

pub const TOKEN_TYPES: [&str; 5] = ["module", "function", "variable", "parameter", "property"];
pub const TOKEN_MODIFIERS: [&str; 3] = ["declaration", "defaultLibrary", "readonly"];

const COMPLETION_LIMIT: usize = 3000;
/// Auto-import items per request; more set `isIncomplete`.
const AUTO_IMPORT_LIMIT: usize = 100;

/// A declaration offered for completion, borrowed from its document.
struct Candidate<'a> {
    uri: &'a str,
    decl: &'a Decl,
    visibility: Option<Visibility>,
}
const DIAGNOSTIC_LIMIT: usize = 200;

const STATEMENT_KEYWORDS: [(&str, &str, &str); 9] = [
    ("module", "module ${1:name}(${2}) {\n\t$0\n}", "Declare a module"),
    ("function", "function ${1:name}(${2}) = $0;", "Declare a function"),
    ("for", "for (${1:i} = [${2:0}:${3:9}]) {\n\t$0\n}", "Repeat for each value"),
    ("if", "if (${1:condition}) {\n\t$0\n}", "Conditional instantiation"),
    ("else", "else {\n\t$0\n}", "Alternative branch"),
    ("let", "let (${1:name} = ${2:value}) {\n\t$0\n}", "Bind values for the children"),
    ("intersection_for", "intersection_for (${1:i} = [${2:0}:${3:9}]) {\n\t$0\n}", "Intersect each iteration"),
    ("use", "use <${1:file.scad}>", "Import modules and functions"),
    ("include", "include <${1:file.scad}>", "Include a file's source"),
];

const EXPRESSION_KEYWORDS: [(&str, &str, &str); 8] = [
    ("true", "true", "Boolean true"),
    ("false", "false", "Boolean false"),
    ("undef", "undef", "The undefined value"),
    ("let", "let (${1:name} = ${2:value}) $0", "Bind values for an expression"),
    ("function", "function (${1:x}) $0", "Function literal"),
    ("each", "each $0", "Flatten a list into a list comprehension"),
    ("for", "for (${1:i} = ${2:list}) $0", "List comprehension"),
    ("if", "if (${1:condition}) $0", "Conditional list element"),
];

fn document<'w>(workspace: &'w Workspace, params: &Value) -> Result<&'w Document, RpcError> {
    let uri = params
        .pointer("/textDocument/uri")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid_params("textDocument.uri"))?;
    workspace.get(uri).ok_or_else(|| RpcError(-32602, format!("Unknown document {uri}")))
}

fn located<'w>(workspace: &'w Workspace, params: &Value) -> Result<(&'w Document, usize), RpcError> {
    let (uri, position) = text_document_position(params)?;
    let document = workspace.get(uri).ok_or_else(|| RpcError(-32602, format!("Unknown document {uri}")))?;
    Ok((document, document.offset(position)))
}

fn range_json(document: &Document, range: (usize, usize)) -> Value {
    document.range(range.0, range.1).to_json()
}

fn location_json(workspace: &Workspace, uri: &str, range: (usize, usize)) -> Value {
    let range = workspace.get(uri).map_or_else(|| Range::default().to_json(), |document| range_json(document, range));
    json!({ "uri": uri, "range": range })
}

/// Resolve doc-comment links in the scope of the file that declares the documented symbol.
fn link_resolver<'w>(workspace: &'w Workspace, uri: &str) -> impl Fn(&str) -> Option<LinkTarget> + 'w {
    let document = workspace.get(uri);
    move |name: &str| {
        let document = document?;
        let resolver = Resolver::new(workspace, document);
        let resolved = [Namespace::Module, Namespace::Function, Namespace::Variable]
            .into_iter()
            .find_map(|namespace| resolver.global(name, namespace))?;
        let target = workspace.get(&resolved.uri)?;
        let position = target.lines.position(&target.text, resolved.decl.name_range.0);
        Some(LinkTarget { uri: resolved.uri, line: position.line, character: position.character })
    }
}

fn origin_line(workspace: &Workspace, resolved: &Resolved, from: &Document) -> Option<String> {
    if resolved.is_builtin() {
        return Some("*OpenSCAD built-in*".to_owned());
    }
    if resolved.uri == from.uri {
        return None;
    }
    let target = workspace.get(&resolved.uri)?;
    let how = match resolved.visibility {
        Some(Visibility::Used) => "used from",
        Some(Visibility::Included) => "included from",
        None => "from",
    };
    Some(format!("*{how}* `{}`", display_path(&target.path)))
}

fn decl_markdown(workspace: &Workspace, resolved: &Resolved, from: &Document) -> String {
    let resolve_link = link_resolver(workspace, &resolved.uri);
    docs::markdown(&resolved.decl, origin_line(workspace, resolved, from).as_deref(), &resolve_link)
}

// Completion -----------------------------------------------------------------------------------------------------

pub fn completion(workspace: &Workspace, params: &Value) -> RpcResult {
    let (document, offset) = located(workspace, params)?;
    let text = document.text.as_str();
    let lexed = context::scan(text, offset);
    if lexed.in_comment || lexed.in_string {
        return Ok(json!({ "isIncomplete": false, "items": [] }));
    }
    if let Some(start) = lexed.import_path_start {
        return Ok(json!({ "isIncomplete": false, "items": path_completions(workspace, document, start, offset) }));
    }
    let (word_start, prefix) = context::word_before(text, offset);
    let word_end = context::word_end(text, offset);
    let replace = range_json(document, (word_start, word_end));
    // `.x`, `.y` and `.z` are the only members.
    if word_start > 0 && text.as_bytes()[word_start - 1] == b'.' {
        let items: Vec<Value> = ["x", "y", "z"]
            .iter()
            .map(|member| json!({ "label": member, "kind": 10, "detail": "vector component", "textEdit": { "range": replace, "newText": member } }))
            .collect();
        return Ok(json!({ "isIncomplete": false, "items": items }));
    }
    let statement = context::is_statement_position(text, word_start);
    let resolver = Resolver::new(workspace, document);
    let mut items = Vec::new();
    let mut seen: HashSet<(String, Namespace)> = HashSet::new();
    let fits = |namespace: Namespace| {
        !(statement && namespace == Namespace::Function || !statement && namespace == Namespace::Module)
    };
    let mut push_decl = |items: &mut Vec<Value>, candidate: Candidate<'_>, rank: u8| {
        let namespace = candidate.decl.namespace();
        if fits(namespace) && seen.insert((candidate.decl.name.clone(), namespace)) {
            items.push(decl_completion(workspace, document, &candidate, rank, &replace, statement));
        }
    };
    if let Some(call) =
        context::call_at(text, offset, &lexed).filter(|call| call.at_argument_start && call.named.is_none())
    {
        items.extend(argument_name_completions(&resolver, &call, &replace));
    }
    let locals = resolver.locals_at(offset);
    let here = document.uri.as_str();
    for decl in &locals {
        push_decl(&mut items, Candidate { uri: here, decl, visibility: None }, 1);
    }
    for decl in &document.index.decls {
        push_decl(&mut items, Candidate { uri: here, decl, visibility: None }, 2);
    }
    for item in &resolver.imported {
        push_decl(&mut items, Candidate { uri: item.uri, decl: item.decl, visibility: Some(item.visibility) }, 3);
    }
    for decl in &workspace.builtins.index.decls {
        push_decl(&mut items, Candidate { uri: BUILTINS_URI, decl, visibility: None }, 4);
    }
    let keywords: &[(&str, &str, &str)] = if statement { &STATEMENT_KEYWORDS } else { &EXPRESSION_KEYWORDS };
    for (keyword, snippet, detail) in keywords {
        items.push(json!({
            "label": keyword,
            "kind": 14,
            "detail": detail,
            "sortText": format!("5{keyword}"),
            "insertTextFormat": 2,
            "textEdit": { "range": replace, "newText": snippet },
        }));
    }
    // Declarations from project files this file does not import yet; accepting one adds the import. Prefix matches
    // come first, and past the limit the list is incomplete so the editor asks again as the word grows.
    let mut incomplete = false;
    if !prefix.is_empty() {
        let visible: HashSet<&str> = resolver.imported.iter().map(|item| item.uri).collect();
        let mut candidates: Vec<(bool, &Document, &Decl)> = Vec::new();
        for other in workspace.documents() {
            if other.uri == document.uri || visible.contains(other.uri.as_str()) {
                continue;
            }
            for decl in &other.index.decls {
                let namespace = decl.namespace();
                if fits(namespace)
                    && !decl.name.starts_with('_')
                    && !seen.contains(&(decl.name.clone(), namespace))
                    && fuzzy_prefix(&decl.name, prefix)
                {
                    candidates.push((!starts_with_ignoring_case(&decl.name, prefix), other, decl));
                }
            }
        }
        candidates
            .sort_by(|left, right| (left.0, &left.2.name, &left.1.path).cmp(&(right.0, &right.2.name, &right.1.path)));
        incomplete = candidates.len() > AUTO_IMPORT_LIMIT;
        for (_, other, decl) in candidates.into_iter().take(AUTO_IMPORT_LIMIT) {
            let namespace = decl.namespace();
            if !seen.insert((decl.name.clone(), namespace)) {
                continue;
            }
            let kind = if namespace == Namespace::Variable { ImportKind::Include } else { ImportKind::Use };
            let visibility = Some(if kind == ImportKind::Use { Visibility::Used } else { Visibility::Included });
            let candidate = Candidate { uri: &other.uri, decl, visibility };
            let mut item = decl_completion(workspace, document, &candidate, 6, &replace, statement);
            let path = relative_import_path(&document.path, &other.path);
            item["detail"] = json!(format!("{} — auto-import from {path}", decl.signature()));
            item["labelDetails"] = json!({ "description": path });
            item["additionalTextEdits"] = json!([import_edit(document, kind, &path)]);
            items.push(item);
        }
    }
    let incomplete = incomplete || items.len() > COMPLETION_LIMIT;
    items.truncate(COMPLETION_LIMIT);
    Ok(json!({ "isIncomplete": incomplete, "items": items }))
}

fn starts_with_ignoring_case(name: &str, prefix: &str) -> bool {
    name.len() >= prefix.len() && name.as_bytes()[..prefix.len()].eq_ignore_ascii_case(prefix.as_bytes())
}

fn fuzzy_prefix(name: &str, prefix: &str) -> bool {
    let mut characters = name.chars().map(|character| character.to_ascii_lowercase());
    prefix
        .chars()
        .map(|character| character.to_ascii_lowercase())
        .all(|wanted| characters.any(|character| character == wanted))
}

/// Insert `use <path>` after the last existing import, or at the top of the file.
pub fn import_edit(document: &Document, kind: ImportKind, path: &str) -> Value {
    let line = document
        .index
        .imports
        .iter()
        .map(|import| document.lines.line_of(import.statement_range.1) + 1)
        .max()
        .unwrap_or(0) as u32;
    let position = json!({ "line": line, "character": 0 });
    json!({ "range": { "start": position, "end": position }, "newText": format!("{} <{path}>\n", kind.keyword()) })
}

fn decl_completion(
    workspace: &Workspace,
    from: &Document,
    candidate: &Candidate<'_>,
    rank: u8,
    replace: &Value,
    statement: bool,
) -> Value {
    let decl = candidate.decl;
    let kind = match decl.kind {
        DeclKind::Module | DeclKind::Function => 3,
        DeclKind::Parameter => 6,
        DeclKind::Variable if decl.name.starts_with('$') || candidate.uri == BUILTINS_URI => 21,
        _ => 6,
    };
    let callable = matches!(decl.kind, DeclKind::Module | DeclKind::Function) || !decl.params.is_empty();
    let insert = if callable {
        let has_params = !decl.params.is_empty();
        let name = escape_snippet(&decl.name);
        match (has_params, statement && decl.kind == DeclKind::Module) {
            (true, _) => format!("{name}($1)$0"),
            (false, _) => format!("{name}()$0"),
        }
    } else {
        escape_snippet(&decl.name)
    };
    let mut item = json!({
        "label": decl.name,
        "kind": kind,
        "detail": decl.signature(),
        "sortText": format!("{rank}{}", decl.name.trim_start_matches('$')),
        "filterText": decl.name,
        "insertTextFormat": 2,
        "textEdit": { "range": replace, "newText": insert },
    });
    if rank <= 2 {
        let resolved = Resolved { uri: candidate.uri.to_owned(), decl: decl.clone(), visibility: candidate.visibility };
        item["documentation"] = json!({ "kind": "markdown", "value": decl_markdown(workspace, &resolved, from) });
    } else {
        // Imported, built-in and auto-import items are many; `completionItem/resolve` renders their documentation.
        item["data"] = json!({
            "uri": candidate.uri,
            "name": decl.name,
            "namespace": namespace_name(decl.namespace()),
            "visibility": candidate.visibility.map(|visibility| match visibility {
                Visibility::Used => "used",
                Visibility::Included => "included",
            }),
            "from": from.uri,
        });
    }
    if callable {
        item["command"] = json!({ "title": "Signature help", "command": "editor.action.triggerParameterHints" });
    }
    item
}

fn namespace_name(namespace: Namespace) -> &'static str {
    match namespace {
        Namespace::Module => "module",
        Namespace::Function => "function",
        Namespace::Variable => "variable",
    }
}

/// Add the documentation that `completion` deferred to an imported, built-in or auto-import item.
pub fn completion_resolve(workspace: &Workspace, params: &Value) -> RpcResult {
    let mut item = params.clone();
    let Some(data) = params.get("data") else { return Ok(item) };
    let field = |name: &str| data.get(name).and_then(Value::as_str).unwrap_or_default();
    let namespace = match field("namespace") {
        "module" => Namespace::Module,
        "function" => Namespace::Function,
        _ => Namespace::Variable,
    };
    let (Some(target), Some(from)) = (workspace.get(field("uri")), workspace.get(field("from"))) else {
        return Ok(item);
    };
    let Some(decl) = target.index.decls.iter().find(|decl| decl.name == field("name") && decl.namespace() == namespace)
    else {
        return Ok(item);
    };
    let resolved = Resolved {
        uri: target.uri.clone(),
        decl: decl.clone(),
        visibility: match field("visibility") {
            "used" => Some(Visibility::Used),
            "included" => Some(Visibility::Included),
            _ => None,
        },
    };
    item["documentation"] = json!({ "kind": "markdown", "value": decl_markdown(workspace, &resolved, from) });
    Ok(item)
}

fn escape_snippet(text: &str) -> String {
    text.replace('\\', "\\\\").replace('$', "\\$").replace('}', "\\}")
}

fn argument_name_completions(resolver: &Resolver, call: &CallContext, replace: &Value) -> Vec<Value> {
    let Some(owner) = resolve_callee(resolver, call) else { return Vec::new() };
    let owner_doc = docs::DocComment::parse(&owner.decl.doc);
    owner
        .decl
        .params
        .iter()
        .filter(|param| !call.used.contains(&param.name))
        .enumerate()
        .map(|(position, param)| {
            let description = owner_doc.param(&param.name).unwrap_or_default();
            let mut documentation = format!("```openscad\n(parameter of {}) {}\n```", owner.decl.name, param.label());
            if !description.is_empty() {
                documentation.push_str("\n\n");
                documentation.push_str(description);
            }
            json!({
                "label": format!("{} =", param.name),
                "filterText": param.name,
                "kind": 5,
                "detail": param.label(),
                "sortText": format!("0{position:03}"),
                "insertTextFormat": 2,
                "textEdit": { "range": replace, "newText": format!("{} = $0", escape_snippet(&param.name)) },
                "documentation": { "kind": "markdown", "value": documentation },
            })
        })
        .collect()
}

fn resolve_callee(resolver: &Resolver, call: &CallContext) -> Option<Resolved> {
    let node = resolver.document.tree.root_node().descendant_for_byte_range(call.callee.0, call.callee.1)?;
    let order = if call.statement {
        [Namespace::Module, Namespace::Function, Namespace::Variable]
    } else {
        [Namespace::Function, Namespace::Variable, Namespace::Module]
    };
    order.into_iter().find_map(|namespace| resolver.lookup(node, &call.name, namespace)).filter(|resolved| {
        matches!(resolved.decl.kind, DeclKind::Module | DeclKind::Function) || !resolved.decl.params.is_empty()
    })
}

fn path_completions(workspace: &Workspace, document: &Document, start: usize, offset: usize) -> Vec<Value> {
    let typed = &document.text[start..offset];
    let end = document.text[offset..].find(['>', '\n']).map_or(offset, |length| offset + length);
    let range = range_json(document, (start, end));
    workspace
        .sorted_documents()
        .into_iter()
        .filter(|other| other.uri != document.uri)
        .filter_map(|other| {
            let path = relative_import_path(&document.path, &other.path);
            path.starts_with(typed).then(|| {
                let summary = file_summary(other);
                json!({
                    "label": path,
                    "kind": 17,
                    "detail": summary,
                    "sortText": format!("{}{path}", path.matches("../").count()),
                    "textEdit": { "range": range, "newText": path },
                })
            })
        })
        .collect()
}

fn file_summary(document: &Document) -> String {
    let count = |kind: DeclKind, noun: &str| {
        let count = document.index.decls.iter().filter(|decl| decl.kind == kind).count();
        format!("{count} {noun}{}", if count == 1 { "" } else { "s" })
    };
    format!(
        "{}, {}, {}",
        count(DeclKind::Module, "module"),
        count(DeclKind::Function, "function"),
        count(DeclKind::Variable, "variable")
    )
}

// Hover ----------------------------------------------------------------------------------------------------------

pub fn hover(workspace: &Workspace, params: &Value) -> RpcResult {
    let (document, offset) = located(workspace, params)?;
    if let Some(target) = target_at(document, offset) {
        if let Role::ImportPath(position) = target.role {
            let import = &document.index.imports[position];
            let resolved = workspace.resolve_import(document, &import.path);
            let value = match resolved {
                Some(file) => format!(
                    "```openscad\n{} <{}>\n```\n\n`{}`: {}\n\n{}",
                    import.kind.keyword(),
                    import.path,
                    display_path(&file.path),
                    file_summary(file),
                    if import.kind == ImportKind::Use {
                        "`use` imports the file's modules and functions."
                    } else {
                        "`include` evaluates the whole file here, variables and geometry included."
                    }
                ),
                None => format!("Cannot find `{}`", display_path(&resolve_import_path(&document.path, &import.path))),
            };
            return Ok(
                json!({ "contents": { "kind": "markdown", "value": value }, "range": range_json(document, target.range) }),
            );
        }
        let resolver = Resolver::new(workspace, document);
        if let Some(resolved) = resolver.resolve(&target) {
            return Ok(json!({
                "contents": { "kind": "markdown", "value": decl_markdown(workspace, &resolved, document) },
                "range": range_json(document, target.range),
            }));
        }
        return Ok(Value::Null);
    }
    // A customizer group comment, `/* [Size] */`, titles the parameters below it.
    if let Some(comment) =
        document.tree.root_node().descendant_for_byte_range(offset, offset).filter(|node| is_comment(*node))
        && let Some(group) = customizer_group(document.node_text(comment))
    {
        let value = format!("Customizer group **{group}**: the parameters below it are listed under *{group}*.");
        let range = (comment.start_byte(), comment.end_byte());
        return Ok(json!({ "contents": { "kind": "markdown", "value": value }, "range": range_json(document, range) }));
    }
    // Keywords that are also built-ins: `assert`, `echo`, `let`, `for`, `each`, `if`.
    let (start, word) = context::word_before(&document.text, context::word_end(&document.text, offset));
    if let Some(decl) = keyword_decl(workspace, word) {
        let resolved = Resolved { uri: BUILTINS_URI.to_owned(), decl, visibility: None };
        return Ok(json!({
            "contents": { "kind": "markdown", "value": decl_markdown(workspace, &resolved, document) },
            "range": range_json(document, (start, start + word.len())),
        }));
    }
    Ok(Value::Null)
}

fn customizer_group(comment: &str) -> Option<&str> {
    let inner = comment.strip_prefix("/*")?.strip_suffix("*/")?.trim();
    let name = inner.strip_prefix('[')?.strip_suffix(']')?.trim();
    (!name.is_empty() && !name.contains(['[', ']'])).then_some(name)
}

fn keyword_decl(workspace: &Workspace, word: &str) -> Option<Decl> {
    match word {
        "assert" | "echo" => workspace.builtin(word, Namespace::Module).cloned(),
        _ => None,
    }
}

// Signature help -------------------------------------------------------------------------------------------------

pub fn signature_help(workspace: &Workspace, params: &Value) -> RpcResult {
    let (document, offset) = located(workspace, params)?;
    let lexed = context::scan(&document.text, offset);
    if lexed.in_comment || lexed.in_string {
        return Ok(Value::Null);
    }
    let Some(call) = context::call_at(&document.text, offset, &lexed) else { return Ok(Value::Null) };
    let resolver = Resolver::new(workspace, document);
    let Some(owner) = resolve_callee(&resolver, &call) else { return Ok(Value::Null) };
    let decl = &owner.decl;
    let doc = docs::DocComment::parse(&decl.doc);
    let resolve_link = link_resolver(workspace, &owner.uri);
    let prefix = match decl.kind {
        DeclKind::Module | DeclKind::Function => format!("{} {}(", decl.kind.label(), decl.name),
        _ => format!("{}(", decl.name),
    };
    let mut label = prefix;
    let mut parameters = Vec::new();
    for (position, param) in decl.params.iter().enumerate() {
        if position > 0 {
            label.push_str(", ");
        }
        let start = label.encode_utf16().count();
        label.push_str(&param.label());
        let end = label.encode_utf16().count();
        let mut parameter = json!({ "label": [start, end] });
        if let Some(text) = doc.param(&param.name).filter(|text| !text.is_empty()) {
            parameter["documentation"] =
                json!({ "kind": "markdown", "value": docs::render_links(text, &resolve_link) });
        }
        parameters.push(parameter);
    }
    label.push(')');
    let active = match &call.named {
        Some(name) => decl.params.iter().position(|param| &param.name == name),
        None => {
            // Positional arguments fill parameters in order, skipping those given by name.
            let unnamed: Vec<usize> =
                (0..decl.params.len()).filter(|index| !call.used.contains(&decl.params[*index].name)).collect();
            let positional = call.argument.saturating_sub(call.used.len());
            unnamed.get(positional).copied()
        }
    };
    let mut signature = json!({ "label": label, "parameters": parameters });
    if !doc.description.is_empty() {
        signature["documentation"] =
            json!({ "kind": "markdown", "value": docs::render_links(&doc.description, &resolve_link) });
    }
    Ok(json!({
        "signatures": [signature],
        "activeSignature": 0,
        "activeParameter": active.map_or(json!(decl.params.len()), |active| json!(active)),
    }))
}

// Navigation -----------------------------------------------------------------------------------------------------

pub fn definition(workspace: &Workspace, params: &Value) -> RpcResult {
    let (document, offset) = located(workspace, params)?;
    let Some(target) = target_at(document, offset) else { return Ok(json!([])) };
    if let Role::ImportPath(position) = target.role {
        let import = &document.index.imports[position];
        return Ok(match workspace.resolve_import(document, &import.path) {
            Some(file) => json!([{
                "originSelectionRange": range_json(document, target.range),
                "targetUri": file.uri,
                "targetRange": range_json(file, (0, 0)),
                "targetSelectionRange": range_json(file, (0, 0)),
            }]),
            None => json!([]),
        });
    }
    let resolver = Resolver::new(workspace, document);
    let Some(resolved) = resolver.resolve(&target) else { return Ok(json!([])) };
    let Some(file) = workspace.get(&resolved.uri) else { return Ok(json!([])) };
    Ok(json!([{
        "originSelectionRange": range_json(document, target.range),
        "targetUri": resolved.uri,
        "targetRange": range_json(file, resolved.decl.node_range),
        "targetSelectionRange": range_json(file, resolved.decl.name_range),
    }]))
}

fn declaration_at(workspace: &Workspace, document: &Document, offset: usize) -> Option<((usize, usize), Resolved)> {
    let target = target_at(document, offset)?;
    if matches!(target.role, Role::ImportPath(_)) {
        return None;
    }
    let resolver = Resolver::new(workspace, document);
    resolver.resolve(&target).map(|resolved| (target.range, resolved))
}

pub fn references(workspace: &Workspace, params: &Value) -> RpcResult {
    let (document, offset) = located(workspace, params)?;
    let Some((_, declaration)) = declaration_at(workspace, document, offset) else { return Ok(json!([])) };
    let include_declaration = params.pointer("/context/includeDeclaration").and_then(Value::as_bool).unwrap_or(true);
    let mut locations: Vec<Value> = Vec::new();
    if include_declaration && declaration.is_builtin() {
        locations.push(location_json(workspace, BUILTINS_URI, declaration.decl.name_range));
    }
    for (uri, range) in find_references(workspace, &declaration) {
        if !include_declaration && uri == declaration.uri && range == declaration.decl.name_range {
            continue;
        }
        locations.push(location_json(workspace, &uri, range));
    }
    Ok(Value::Array(locations))
}

pub fn document_highlight(workspace: &Workspace, params: &Value) -> RpcResult {
    let (document, offset) = located(workspace, params)?;
    let Some((_, declaration)) = declaration_at(workspace, document, offset) else { return Ok(json!([])) };
    let highlights: Vec<Value> = find_references(workspace, &declaration)
        .into_iter()
        .filter(|(uri, _)| uri == &document.uri)
        .map(|(_, range)| {
            let write = declaration.uri == document.uri && range == declaration.decl.name_range;
            json!({ "range": range_json(document, range), "kind": if write { 3 } else { 2 } })
        })
        .collect();
    Ok(Value::Array(highlights))
}

pub fn prepare_rename(workspace: &Workspace, params: &Value) -> RpcResult {
    let (document, offset) = located(workspace, params)?;
    let Some((range, declaration)) = declaration_at(workspace, document, offset) else { return Ok(Value::Null) };
    if declaration.is_builtin() {
        return Err(RpcError(
            -32803,
            format!("`{}` is an OpenSCAD built-in and cannot be renamed", declaration.decl.name),
        ));
    }
    Ok(json!({ "range": range_json(document, range), "placeholder": declaration.decl.name }))
}

pub fn rename(workspace: &Workspace, params: &Value) -> RpcResult {
    let (document, offset) = located(workspace, params)?;
    let new_name = params.get("newName").and_then(Value::as_str).ok_or_else(|| invalid_params("newName"))?;
    let Some((_, declaration)) = declaration_at(workspace, document, offset) else { return Ok(Value::Null) };
    if declaration.is_builtin() {
        return Err(RpcError(
            -32803,
            format!("`{}` is an OpenSCAD built-in and cannot be renamed", declaration.decl.name),
        ));
    }
    let special = declaration.decl.name.starts_with('$');
    let valid = new_name.starts_with('$') == special
        && new_name.trim_start_matches('$').bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
        && new_name
            .trim_start_matches('$')
            .bytes()
            .next()
            .is_some_and(|byte| byte.is_ascii_alphabetic() || byte == b'_');
    if !valid {
        return Err(RpcError(-32602, format!("`{new_name}` is not a valid OpenSCAD identifier")));
    }
    let mut by_uri: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for (uri, range) in find_references(workspace, &declaration) {
        let Some(file) = workspace.get(&uri) else { continue };
        by_uri.entry(uri).or_default().push(json!({ "range": range_json(file, range), "newText": new_name }));
    }
    let document_changes: Vec<Value> = by_uri
        .into_iter()
        .map(|(uri, edits)| {
            let version = workspace.get(&uri).and_then(|file| file.version);
            json!({ "textDocument": { "uri": uri, "version": version }, "edits": edits })
        })
        .collect();
    Ok(json!({ "documentChanges": document_changes }))
}

// Diagnostics and semantic tokens --------------------------------------------------------------------------------

struct Occurrence<'t> {
    target: Target<'t>,
    resolved: Option<Resolved>,
    in_error: bool,
}

/// Every identifier in the document with its resolution, in source order.
fn analyze<'w>(resolver: &Resolver<'w>, document: &'w Document) -> Vec<Occurrence<'w>> {
    let mut occurrences = Vec::new();
    let mut cursor = document.tree.walk();
    let mut error_depth = 0usize;
    let parents = resolver.record_parents();
    loop {
        let node = cursor.node();
        let entered_error = node.kind() == "ERROR";
        if entered_error {
            error_depth += 1;
        }
        let is_name = node.kind() == "special_variable"
            || (node.kind() == "identifier"
                && parents.get(node).is_none_or(|parent| parent.kind() != "special_variable"));
        if is_name && let Some(target) = target_for_node(document, parents, node) {
            let resolved = resolver.resolve(&target);
            occurrences.push(Occurrence { target, resolved, in_error: error_depth > 0 });
        }
        let descend = node.kind() != "special_variable" && cursor.goto_first_child();
        if descend {
            continue;
        }
        loop {
            if cursor.node().kind() == "ERROR" {
                error_depth = error_depth.saturating_sub(1);
            }
            if cursor.goto_next_sibling() {
                break;
            }
            if !cursor.goto_parent() {
                return occurrences;
            }
        }
    }
}

pub fn diagnostic(workspace: &Workspace, params: &Value) -> RpcResult {
    let document = document(workspace, params)?;
    Ok(json!({ "kind": "full", "items": diagnostics(workspace, document) }))
}

pub fn diagnostics(workspace: &Workspace, document: &Document) -> Vec<Value> {
    let mut items = Vec::new();
    syntax_diagnostics(document, document.tree.root_node(), &mut items);
    for import in &document.index.imports {
        if workspace.resolve_import(document, &import.path).is_none() {
            items.push(json!({
                "range": range_json(document, import.path_range),
                "severity": 2,
                "code": "unresolved-import",
                "source": "openscad",
                "message": format!("Cannot find `{}` in the project", display_path(&resolve_import_path(&document.path, &import.path))),
            }));
        }
    }
    // Unresolved imports may declare anything, so unknown names are only reported when every import resolves.
    if workspace.imports_resolve(document) {
        let resolver = Resolver::new(workspace, document);
        for occurrence in analyze(&resolver, document) {
            if occurrence.in_error || items.len() >= DIAGNOSTIC_LIMIT {
                continue;
            }
            let name = &occurrence.target.name;
            let (code, message) = match (&occurrence.target.role, &occurrence.resolved) {
                (Role::Usage(_), _) if name.starts_with('$') => continue,
                (Role::Usage(Namespace::Module), None) => ("unknown-module", format!("Unknown module `{name}`")),
                (Role::Usage(Namespace::Function), None) => ("unknown-function", format!("Unknown function `{name}`")),
                (Role::Usage(Namespace::Variable), None) => ("unknown-variable", format!("Unknown variable `{name}`")),
                (Role::NamedArgument { .. }, None) if !name.starts_with('$') => {
                    let Role::NamedArgument { callee, callee_namespace } = occurrence.target.role else { continue };
                    let Some(callee_node) = document.tree.root_node().descendant_for_byte_range(callee.0, callee.1)
                    else {
                        continue;
                    };
                    let callee_name = document.node_text(callee_node);
                    match resolver.lookup(callee_node, callee_name, callee_namespace) {
                        Some(owner)
                            if !owner.is_builtin()
                                && matches!(owner.decl.kind, DeclKind::Module | DeclKind::Function) =>
                        {
                            (
                                "unknown-parameter",
                                format!("`{name}` is not a parameter of {} `{callee_name}`", owner.decl.kind.label()),
                            )
                        }
                        _ => continue,
                    }
                }
                _ => continue,
            };
            items.push(json!({
                "range": range_json(document, occurrence.target.range),
                "severity": 2,
                "code": code,
                "source": "openscad",
                "message": message,
                "data": { "name": name },
            }));
        }
    }
    items.truncate(DIAGNOSTIC_LIMIT);
    items
}

fn syntax_diagnostics(document: &Document, node: Node, items: &mut Vec<Value>) {
    if items.len() >= DIAGNOSTIC_LIMIT || !node.has_error() {
        return;
    }
    if node.is_missing() {
        let label = if node.is_named() { node.kind().replace('_', " ") } else { format!("`{}`", node.kind()) };
        items.push(json!({
            "range": range_json(document, (node.start_byte(), node.end_byte())),
            "severity": 1,
            "code": "syntax",
            "source": "openscad",
            "message": format!("Missing {label}"),
        }));
        return;
    }
    if node.is_error() {
        let first = first_leaf(node);
        let line_end = document.text[node.start_byte()..node.end_byte()]
            .find('\n')
            .map_or(node.end_byte(), |end| node.start_byte() + end);
        let token = first.map(|leaf| document.node_text(leaf)).filter(|token| !token.trim().is_empty());
        items.push(json!({
            "range": range_json(document, (node.start_byte(), line_end.max(node.start_byte()))),
            "severity": 1,
            "code": "syntax",
            "source": "openscad",
            "message": match token {
                Some(token) => format!("Syntax error near `{}`", crate::index::abbreviate(token, 40)),
                None => "Syntax error".to_owned(),
            },
        }));
        // Nested errors inside one error node repeat the same problem.
        return;
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        syntax_diagnostics(document, child, items);
    }
}

fn first_leaf(node: Node) -> Option<Node> {
    let mut current = node;
    while let Some(child) = current.child(0) {
        current = child;
    }
    (current.id() != node.id() || node.child_count() == 0).then_some(current)
}

pub fn semantic_tokens(workspace: &Workspace, params: &Value) -> RpcResult {
    let document = document(workspace, params)?;
    let mut data = Vec::new();
    let mut previous = (0u32, 0u32);
    let resolver = Resolver::new(workspace, document);
    for occurrence in analyze(&resolver, document) {
        let Some(resolved) = &occurrence.resolved else { continue };
        let token_type = match (&occurrence.target.role, resolved.decl.kind) {
            (Role::NamedArgument { .. }, _) => 4,
            (_, DeclKind::Module) => 0,
            (_, DeclKind::Function) => 1,
            (_, DeclKind::Parameter) => 3,
            _ => 2,
        };
        let mut modifiers = 0u32;
        if matches!(occurrence.target.role, Role::Declaration) {
            modifiers |= 1;
        }
        if resolved.is_builtin() {
            modifiers |= 2;
        }
        if resolved.decl.kind == DeclKind::LoopVariable {
            modifiers |= 4;
        }
        let (start, end) = occurrence.target.range;
        let position = document.lines.position(&document.text, start);
        let length = document.text[start..end].encode_utf16().count() as u32;
        let delta_line = position.line - previous.0;
        let delta_start = if delta_line == 0 { position.character - previous.1 } else { position.character };
        data.extend([delta_line, delta_start, length, token_type, modifiers]);
        previous = (position.line, position.character);
    }
    Ok(json!({ "data": data }))
}

// Code actions ---------------------------------------------------------------------------------------------------

pub fn code_action(workspace: &Workspace, params: &Value) -> RpcResult {
    let document = document(workspace, params)?;
    let range = params.get("range").and_then(Range::from_json).ok_or_else(|| invalid_params("range"))?;
    let start = document.offset(range.start);
    let end = document.offset(range.end);
    let mut actions = Vec::new();
    let mut offered = HashSet::new();
    for diagnostic in diagnostics(workspace, document) {
        let Some(code) = diagnostic.get("code").and_then(Value::as_str) else { continue };
        let Some(diagnostic_range) = diagnostic.get("range").and_then(Range::from_json) else { continue };
        let (from, to) = (document.offset(diagnostic_range.start), document.offset(diagnostic_range.end));
        if to < start || from > end {
            continue;
        }
        let namespace = match code {
            "unknown-module" => Namespace::Module,
            "unknown-function" => Namespace::Function,
            "unknown-variable" => Namespace::Variable,
            _ => continue,
        };
        let name = &document.text[from..to];
        for other in workspace.sorted_documents() {
            if other.uri == document.uri {
                continue;
            }
            let declares = other.index.decls.iter().any(|decl| decl.name == name && decl.namespace() == namespace)
                || (namespace == Namespace::Function
                    && other.index.decls.iter().any(|decl| decl.name == name && !decl.params.is_empty()));
            if !declares {
                continue;
            }
            let kind = if namespace == Namespace::Variable { ImportKind::Include } else { ImportKind::Use };
            let path = relative_import_path(&document.path, &other.path);
            if !offered.insert((kind.keyword(), path.clone())) {
                continue;
            }
            actions.push(json!({
                "title": format!("Add `{} <{path}>`", kind.keyword()),
                "kind": "quickfix",
                "diagnostics": [diagnostic],
                "isPreferred": actions.is_empty(),
                "edit": { "documentChanges": [{
                    "textDocument": { "uri": document.uri, "version": document.version },
                    "edits": [import_edit(document, kind, &path)],
                }] },
            }));
        }
    }
    Ok(Value::Array(actions))
}

// Structure ------------------------------------------------------------------------------------------------------

fn symbol_kind(decl: &Decl) -> u32 {
    match decl.kind {
        DeclKind::Module => 2,
        DeclKind::Function => 12,
        DeclKind::Variable if decl.name.starts_with('$') => 14,
        _ => 13,
    }
}

pub fn document_symbol(workspace: &Workspace, params: &Value) -> RpcResult {
    let document = document(workspace, params)?;
    Ok(Value::Array(document_symbols(document, document.tree.root_node())))
}

fn document_symbols(document: &Document, parent: Node) -> Vec<Value> {
    let mut symbols = Vec::new();
    let mut cursor = parent.walk();
    for child in parent.named_children(&mut cursor) {
        if is_comment(child) {
            continue;
        }
        if child.kind() == "ERROR" {
            symbols.extend(document_symbols(document, child));
            continue;
        }
        for decl in crate::index::declarations_of(&document.text, child) {
            let mut symbol = json!({
                "name": decl.name,
                "detail": match decl.kind {
                    DeclKind::Module | DeclKind::Function => format!("({})", decl.parameter_list()),
                    _ => decl.value.as_deref().map(|value| crate::index::abbreviate(value, 60)).unwrap_or_default(),
                },
                "kind": symbol_kind(&decl),
                "range": range_json(document, decl.node_range),
                "selectionRange": range_json(document, decl.name_range),
            });
            if decl.kind == DeclKind::Module
                && let Some(body) = child.child_by_field_name("body").filter(|body| body.kind() == "union_block")
            {
                let children = document_symbols(document, body);
                if !children.is_empty() {
                    symbol["children"] = Value::Array(children);
                }
            }
            symbols.push(symbol);
        }
    }
    symbols
}

pub fn workspace_symbol(workspace: &Workspace, params: &Value) -> RpcResult {
    let query = params.get("query").and_then(Value::as_str).unwrap_or_default();
    let mut symbols = Vec::new();
    for document in workspace.sorted_documents() {
        for decl in &document.index.decls {
            if fuzzy_prefix(&decl.name, query) {
                symbols.push(json!({
                    "name": decl.name,
                    "kind": symbol_kind(decl),
                    "containerName": display_path(&document.path),
                    "location": { "uri": document.uri, "range": range_json(document, decl.name_range) },
                }));
            }
        }
        if symbols.len() > 1000 {
            break;
        }
    }
    Ok(Value::Array(symbols))
}

pub fn folding_range(workspace: &Workspace, params: &Value) -> RpcResult {
    let document = document(workspace, params)?;
    let mut ranges = Vec::new();
    let mut seen: HashMap<u32, u32> = HashMap::new();
    let mut push = |ranges: &mut Vec<Value>, start: usize, end: usize, kind: Option<&str>| {
        let start_line = document.lines.line_of(start) as u32;
        let end_line = document.lines.line_of(end) as u32;
        if end_line <= start_line || seen.get(&start_line).is_some_and(|existing| *existing >= end_line) {
            return;
        }
        seen.insert(start_line, end_line);
        let mut range = json!({ "startLine": start_line, "endLine": end_line });
        if let Some(kind) = kind {
            range["kind"] = json!(kind);
        }
        ranges.push(range);
    };
    let mut cursor = document.tree.walk();
    let mut comment_run: Option<(usize, usize)> = None;
    'walk: loop {
        let node = cursor.node();
        match node.kind() {
            "union_block" | "list" | "arguments" | "parameters" | "assignments" => {
                push(&mut ranges, node.start_byte(), node.end_byte().saturating_sub(1), None);
            }
            "block_comment" => push(&mut ranges, node.start_byte(), node.end_byte(), Some("comment")),
            _ => {}
        }
        if node.kind() == "line_comment" {
            let row = node.start_position().row;
            comment_run = match comment_run {
                Some((start, last)) if last + 1 == row => Some((start, row)),
                Some((start, last)) => {
                    push_lines(&mut ranges, &mut push, document, start, last);
                    Some((row, row))
                }
                None => Some((row, row)),
            };
        }
        if cursor.goto_first_child() {
            continue;
        }
        loop {
            if cursor.goto_next_sibling() {
                break;
            }
            if !cursor.goto_parent() {
                break 'walk;
            }
        }
    }
    if let Some((start, last)) = comment_run {
        push_lines(&mut ranges, &mut push, document, start, last);
    }
    if let (Some(first), Some(last)) = (document.index.imports.first(), document.index.imports.last()) {
        push(&mut ranges, first.statement_range.0, last.statement_range.1, Some("imports"));
    }
    Ok(Value::Array(ranges))
}

type FoldPush<'a> = dyn FnMut(&mut Vec<Value>, usize, usize, Option<&str>) + 'a;

fn push_lines(ranges: &mut Vec<Value>, push: &mut FoldPush, document: &Document, start: usize, last: usize) {
    if last > start {
        push(ranges, document.lines.line_start(start), document.lines.line_start(last), Some("comment"));
    }
}

// Formatting -----------------------------------------------------------------------------------------------------

pub fn formatting(workspace: &Workspace, params: &Value) -> RpcResult {
    let document = document(workspace, params)?;
    let indent = crate::format::Indent::from_options(params.get("options"));
    Ok(Value::Array(crate::format::format_edits(document, &indent)))
}

// Call hierarchy -------------------------------------------------------------------------------------------------

fn is_callable(node: Node) -> bool {
    matches!(node.kind(), "module_item" | "function_item")
}

fn call_item(document: &Document, decl: &Decl) -> Value {
    json!({
        "name": decl.name,
        "kind": symbol_kind(decl),
        "detail": format!("({})", decl.parameter_list()),
        "uri": document.uri,
        "range": range_json(document, decl.node_range),
        "selectionRange": range_json(document, decl.name_range),
    })
}

/// Calls at the top level of a file come from the file itself.
fn file_item(document: &Document) -> Value {
    json!({
        "name": display_path(&document.path),
        "kind": 1,
        "uri": document.uri,
        "range": range_json(document, (0, document.text.len())),
        "selectionRange": range_json(document, (0, 0)),
    })
}

/// The module or function declaration around `offset`.
fn enclosing_callable(document: &Document, offset: usize) -> Option<Node<'_>> {
    let mut node = document.tree.root_node().descendant_for_byte_range(offset, offset)?;
    loop {
        if is_callable(node) {
            return Some(node);
        }
        node = node.parent()?;
    }
}

pub fn prepare_call_hierarchy(workspace: &Workspace, params: &Value) -> RpcResult {
    let (document, offset) = located(workspace, params)?;
    let Some((_, declaration)) = declaration_at(workspace, document, offset) else { return Ok(Value::Null) };
    let Some(file) = workspace.get(&declaration.uri) else { return Ok(Value::Null) };
    if !matches!(declaration.decl.kind, DeclKind::Module | DeclKind::Function) {
        return Ok(Value::Null);
    }
    Ok(json!([call_item(file, &declaration.decl)]))
}

/// The module or function a call hierarchy item names, found again from its `selectionRange`.
fn item_declaration(workspace: &Workspace, params: &Value) -> Result<Option<Resolved>, RpcError> {
    let item = params.get("item").ok_or_else(|| invalid_params("item"))?;
    let uri = item.get("uri").and_then(Value::as_str).ok_or_else(|| invalid_params("item.uri"))?;
    let start = item
        .pointer("/selectionRange/start")
        .and_then(crate::text::Position::from_json)
        .ok_or_else(|| invalid_params("item.selectionRange"))?;
    let Some(document) = workspace.get(uri) else { return Ok(None) };
    Ok(declaration_at(workspace, document, document.offset(start))
        .map(|(_, declaration)| declaration)
        .filter(|declaration| matches!(declaration.decl.kind, DeclKind::Module | DeclKind::Function)))
}

/// Every call of the item, grouped by the module or function (or file top level) that makes it.
pub fn incoming_calls(workspace: &Workspace, params: &Value) -> RpcResult {
    let Some(declaration) = item_declaration(workspace, params)? else { return Ok(json!([])) };
    let mut callers: BTreeMap<(String, usize), (Value, Vec<Value>)> = BTreeMap::new();
    for (uri, range) in find_references(workspace, &declaration) {
        if uri == declaration.uri && range == declaration.decl.name_range {
            continue;
        }
        let Some(file) = workspace.get(&uri) else { continue };
        let caller = enclosing_callable(file, range.0).and_then(|node| crate::index::callable_of(&file.text, node));
        let key = (uri.clone(), caller.as_ref().map_or(usize::MAX, |decl| decl.name_range.0));
        let entry = callers.entry(key).or_insert_with(|| {
            (caller.as_ref().map_or_else(|| file_item(file), |decl| call_item(file, decl)), Vec::new())
        });
        entry.1.push(range_json(file, range));
    }
    Ok(Value::Array(
        callers.into_values().map(|(from, ranges)| json!({ "from": from, "fromRanges": ranges })).collect(),
    ))
}

/// Every module and function the item's body calls, grouped by callee, in first-call order.
pub fn outgoing_calls(workspace: &Workspace, params: &Value) -> RpcResult {
    let Some(declaration) = item_declaration(workspace, params)? else { return Ok(json!([])) };
    let Some(document) = workspace.get(&declaration.uri) else { return Ok(json!([])) };
    let Some(callable) = enclosing_callable(document, declaration.decl.name_range.0) else { return Ok(json!([])) };
    let resolver = Resolver::new(workspace, document);
    let mut order: Vec<(String, usize)> = Vec::new();
    let mut callees: HashMap<(String, usize), (Value, Vec<Value>)> = HashMap::new();
    let mut pending = vec![callable];
    while let Some(node) = pending.pop() {
        let mut cursor = node.walk();
        for child in node.named_children(&mut cursor) {
            // A nested declaration's calls belong to it.
            if !is_callable(child) {
                pending.push(child);
            }
        }
        if !matches!(node.kind(), "module_call" | "function_call") {
            continue;
        }
        let Some(name) = node.child_by_field_name("name").filter(|name| name.kind() == "identifier") else { continue };
        let Some(target) = target_at(document, name.start_byte()) else { continue };
        let Some(callee) = resolver.resolve(&target) else { continue };
        let Some(file) = workspace.get(&callee.uri) else { continue };
        if !matches!(callee.decl.kind, DeclKind::Module | DeclKind::Function) {
            continue;
        }
        let key = (callee.uri.clone(), callee.decl.name_range.0);
        if !callees.contains_key(&key) {
            order.push(key.clone());
        }
        callees
            .entry(key)
            .or_insert_with(|| (call_item(file, &callee.decl), Vec::new()))
            .1
            .push(range_json(document, target.range));
    }
    let mut calls = Vec::with_capacity(order.len());
    for key in order {
        if let Some((to, mut ranges)) = callees.remove(&key) {
            ranges.sort_by_key(|range| (range["start"]["line"].as_u64(), range["start"]["character"].as_u64()));
            calls.push(json!({ "to": to, "fromRanges": ranges }));
        }
    }
    let first = |call: &Value| {
        let start = &call["fromRanges"][0]["start"];
        (start["line"].as_u64(), start["character"].as_u64())
    };
    calls.sort_by_key(first);
    Ok(Value::Array(calls))
}
