//! Name resolution: which declaration an identifier refers to, following OpenSCAD's lexical scopes and its separate
//! module, function and variable namespaces.

use std::cell::{OnceCell, RefCell};
use std::collections::HashMap;

use tree_sitter::Node;

use crate::docs::DocComment;
use crate::document::{Document, Parents};
use crate::index::{
    Decl, DeclKind, Namespace, assignment_decl, callable_of, declarations_of, doc_for, is_comment, named_child_of_kind,
    params_of,
};
use crate::workspace::{BUILTINS_URI, Imported, Visibility, Workspace};

/// What the identifier under the cursor is.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Role {
    /// A reference to a module, function or variable.
    Usage(Namespace),
    /// The name in a declaration.
    Declaration,
    /// `name` in `call(name = value)`: a parameter of the callee.
    NamedArgument { callee: (usize, usize), callee_namespace: Namespace },
    /// The path in `use <path>` or `include <path>`.
    ImportPath(usize),
}

#[derive(Clone, Debug)]
pub struct Target<'t> {
    pub name: String,
    pub range: (usize, usize),
    pub role: Role,
    pub node: Node<'t>,
}

/// A resolved declaration with its file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Resolved {
    pub uri: String,
    pub decl: Decl,
    /// Set when the declaration comes from another file through `use` or `include`.
    pub visibility: Option<Visibility>,
}

impl Resolved {
    pub fn is_builtin(&self) -> bool {
        self.uri == BUILTINS_URI
    }

    pub fn same_declaration(&self, other: &Self) -> bool {
        self.uri == other.uri && self.decl.name_range == other.decl.name_range
    }
}

pub fn is_identifier_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'$'
}

/// Find the identifier, special variable or import path at a byte offset; the cursor may sit just after it.
pub fn target_at(document: &Document, offset: usize) -> Option<Target<'_>> {
    let root = document.tree.root_node();
    let candidates = [offset, offset.saturating_sub(1)];
    for candidate in candidates {
        let Some(node) = root.named_descendant_for_byte_range(candidate, candidate) else { continue };
        if let Some(target) = target_for_node(document, &Parents::default(), node)
            && target.range.0 <= offset
            && offset <= target.range.1
        {
            return Some(target);
        }
    }
    None
}

pub fn target_for_node<'t>(document: &'t Document, parents: &Parents<'t>, node: Node<'t>) -> Option<Target<'t>> {
    if node.kind() == "include_path" {
        let statement = parents.get(node)?;
        let position =
            document.index.imports.iter().position(|import| import.statement_range.0 == statement.start_byte())?;
        let import = &document.index.imports[position];
        return Some(Target {
            name: import.path.clone(),
            range: import.path_range,
            role: Role::ImportPath(position),
            node,
        });
    }
    let name_node = match node.kind() {
        "identifier" => match parents.get(node) {
            Some(parent) if parent.kind() == "special_variable" => parent,
            _ => node,
        },
        "special_variable" => node,
        _ => return None,
    };
    let parent = parents.get(name_node)?;
    let is_name_field = |owner: Node| owner.child_by_field_name("name").is_some_and(|name| name.id() == name_node.id());
    let role = match parent.kind() {
        "module_call" if is_name_field(parent) => Role::Usage(Namespace::Module),
        "function_call" if is_name_field(parent) => Role::Usage(Namespace::Function),
        "module_item" | "function_item" if is_name_field(parent) => Role::Declaration,
        "assignment" if is_name_field(parent) => match parents.get(parent) {
            Some(arguments) if arguments.kind() == "arguments" => {
                let call = parents.get(arguments)?;
                let callee = call.child_by_field_name("name")?;
                Role::NamedArgument {
                    callee: (callee.start_byte(), callee.end_byte()),
                    callee_namespace: if call.kind() == "module_call" {
                        Namespace::Module
                    } else {
                        Namespace::Function
                    },
                }
            }
            _ => Role::Declaration,
        },
        "parameter" => Role::Declaration,
        "dot_index_expression"
            if parent.child_by_field_name("index").is_some_and(|index| index.id() == name_node.id()) =>
        {
            return None;
        }
        _ => Role::Usage(Namespace::Variable),
    };
    Some(Target {
        name: document.node_text(name_node).to_owned(),
        range: (name_node.start_byte(), name_node.end_byte()),
        role,
        node: name_node,
    })
}

/// Child positions of the declarations in one `{ … }` block, by name.
type BlockNames = HashMap<(String, Namespace), usize>;
/// An owner declaration's uri and name range, and a parameter name.
type ParameterKey = (String, (usize, usize), String);

/// Scopes the server looks through for one document, with its imported and built-in declarations indexed by name.
pub struct Resolver<'w> {
    pub workspace: &'w Workspace,
    pub document: &'w Document,
    pub imported: Vec<Imported<'w>>,
    imported_names: HashMap<(&'w str, Namespace), usize>,
    top_names: HashMap<(&'w str, Namespace), usize>,
    /// Names each `{ … }` block declares, by block node id: a long module body is indexed once per request, not
    /// once per identifier.
    blocks: RefCell<HashMap<usize, BlockNames>>,
    /// Parameters by owner and name, so each owner's documentation is parsed once per request.
    parameters: RefCell<HashMap<ParameterKey, Option<Resolved>>>,
    /// Parent links, recorded by `record_parents` for requests that resolve every name in the document.
    parents: OnceCell<Parents<'w>>,
    direct: Parents<'w>,
}

impl<'w> Resolver<'w> {
    pub fn new(workspace: &'w Workspace, document: &'w Document) -> Self {
        let imported = workspace.imported(document);
        let mut imported_names = HashMap::new();
        for (position, item) in imported.iter().enumerate() {
            imported_names.entry((item.decl.name.as_str(), item.decl.namespace())).or_insert(position);
        }
        let mut top_names = HashMap::new();
        for (position, decl) in document.index.decls.iter().enumerate() {
            top_names.entry((decl.name.as_str(), decl.namespace())).or_insert(position);
        }
        Self {
            workspace,
            document,
            imported,
            imported_names,
            top_names,
            blocks: RefCell::default(),
            parameters: RefCell::default(),
            parents: OnceCell::new(),
            direct: Parents::default(),
        }
    }

    /// Record the document's parent links; worth it only before resolving many names.
    pub fn record_parents(&self) -> &Parents<'w> {
        self.parents.get_or_init(|| Parents::of(self.document.tree.root_node()))
    }

    pub fn parents(&self) -> &Parents<'w> {
        self.parents.get().unwrap_or(&self.direct)
    }

    /// The child of `block` that declares `name`, from the per-request block index.
    fn block_binding<'t>(&self, block: Node<'t>, name: &str, namespace: Namespace) -> Option<Node<'t>> {
        let mut blocks = self.blocks.borrow_mut();
        let names = blocks.entry(block.id()).or_insert_with(|| {
            let mut names = HashMap::new();
            let mut cursor = block.walk();
            for (position, child) in block.named_children(&mut cursor).enumerate() {
                if let Some((name, namespace)) = block_binding_name(child) {
                    names.entry((self.document.node_text(name).to_owned(), namespace)).or_insert(position);
                }
            }
            names
        });
        let position = *names.get(&(name.to_owned(), namespace))?;
        block.named_child(position as u32)
    }

    pub fn resolve(&self, target: &Target<'w>) -> Option<Resolved> {
        match &target.role {
            Role::ImportPath(_) => None,
            Role::Declaration => self.declaration_at(target.node),
            Role::Usage(namespace) => {
                let found = self.lookup(target.node, &target.name, *namespace);
                if found.is_none() && *namespace == Namespace::Function {
                    // A variable may hold a function literal.
                    return self.lookup(target.node, &target.name, Namespace::Variable);
                }
                found
            }
            Role::NamedArgument { callee, callee_namespace } => {
                let callee_node = self.document.tree.root_node().descendant_for_byte_range(callee.0, callee.1)?;
                let callee_name = self.document.node_text(callee_node).to_owned();
                let owner = self
                    .lookup(callee_node, &callee_name, *callee_namespace)
                    .or_else(|| self.lookup(callee_node, &callee_name, Namespace::Variable))?;
                let key = (owner.uri.clone(), owner.decl.name_range, target.name.clone());
                self.parameters.borrow_mut().entry(key).or_insert_with(|| parameter_of(&owner, &target.name)).clone()
            }
        }
    }

    /// The declaration whose name is `node`.
    fn declaration_at(&self, node: Node<'w>) -> Option<Resolved> {
        let parents = self.parents();
        let parent = parents.get(node)?;
        let text = self.document.text.as_str();
        let local = |decl: Decl| Some(Resolved { uri: self.document.uri.clone(), decl, visibility: None });
        match parent.kind() {
            "module_item" | "function_item" => local(callable_of(text, parent)?),
            "parameter" => parameter_decl(self.document, parents, parent, node),
            "assignment" => {
                let holder = parents.get(parent)?;
                if holder.kind() == "parameter" {
                    return parameter_decl(self.document, parents, holder, node);
                }
                let kind = binding_kind(parents, holder);
                let anchor = if holder.kind() == "var_declaration" { holder } else { parent };
                let doc = if holder.kind() == "var_declaration" { doc_for(text, holder) } else { String::new() };
                local(assignment_decl(text, parent, kind, anchor, doc)?)
            }
            _ => None,
        }
    }

    /// Walk outward from `node` through every enclosing scope, then imports, then built-ins.
    pub fn lookup(&self, node: Node<'w>, name: &str, namespace: Namespace) -> Option<Resolved> {
        let parents = self.parents();
        let mut via = node;
        let mut current = parents.get(node);
        while let Some(scope) = current {
            match scope.kind() {
                // Top-level names are indexed once in `global`.
                "source_file" => break,
                "union_block" => {
                    if let Some(child) = self.block_binding(scope, name, namespace) {
                        let decl = declarations_of(&self.document.text, child).into_iter().next()?;
                        return Some(Resolved { uri: self.document.uri.clone(), decl, visibility: None });
                    }
                    via = scope;
                    current = parents.get(scope);
                    continue;
                }
                _ => {}
            }
            let mut found = None;
            for_each_binding(self.document, parents, scope, via, node.start_byte(), &mut |binding| {
                if binding.name == name && binding.namespace == namespace {
                    found = Some((binding.make)());
                    return true;
                }
                false
            });
            if let Some(decl) = found {
                return Some(Resolved { uri: self.document.uri.clone(), decl, visibility: None });
            }
            via = scope;
            current = parents.get(scope);
        }
        self.global(name, namespace)
    }

    /// A top-level, imported or built-in declaration.
    pub fn global(&self, name: &str, namespace: Namespace) -> Option<Resolved> {
        if let Some(position) = self.top_names.get(&(name, namespace)) {
            let decl = &self.document.index.decls[*position];
            return Some(Resolved { uri: self.document.uri.clone(), decl: decl.clone(), visibility: None });
        }
        if let Some(position) = self.imported_names.get(&(name, namespace)) {
            let item = &self.imported[*position];
            return Some(Resolved {
                uri: item.uri.to_owned(),
                decl: item.decl.clone(),
                visibility: Some(item.visibility),
            });
        }
        self.workspace.builtin(name, namespace).map(|decl| Resolved {
            uri: BUILTINS_URI.to_owned(),
            decl: decl.clone(),
            visibility: None,
        })
    }

    /// Every local binding visible at `offset`, innermost first, without duplicates.
    pub fn locals_at(&self, offset: usize) -> Vec<Decl> {
        let root = self.document.tree.root_node();
        let Some(node) = root.descendant_for_byte_range(offset, offset) else { return Vec::new() };
        let parents = self.parents();
        let mut seen = std::collections::HashSet::new();
        let mut result = Vec::new();
        let mut via = node;
        let mut current = Some(node);
        while let Some(scope) = current {
            if scope.kind() != "source_file" {
                for_each_binding(self.document, parents, scope, via, offset, &mut |binding| {
                    if seen.insert((binding.name.to_owned(), binding.namespace)) {
                        result.push((binding.make)());
                    }
                    false
                });
            }
            via = scope;
            current = parents.get(scope);
        }
        result
    }
}

/// The parameter `name` of a resolved module, function or function-literal variable.
pub fn parameter_of(owner: &Resolved, name: &str) -> Option<Resolved> {
    let param = owner.decl.params.iter().find(|param| param.name == name)?;
    let doc = DocComment::parse(&owner.decl.doc).param(name).unwrap_or_default().to_owned();
    Some(Resolved {
        uri: owner.uri.clone(),
        decl: Decl {
            name: param.name.clone(),
            kind: DeclKind::Parameter,
            name_range: param.range,
            node_range: param.range,
            params: Vec::new(),
            value: param.default.clone(),
            doc,
            owner: Some(owner.decl.name.clone()),
        },
        visibility: owner.visibility,
    })
}

fn parameter_decl<'t>(document: &Document, parents: &Parents<'t>, parameter: Node<'t>, name: Node) -> Option<Resolved> {
    let list = parents.get(parameter)?;
    let callable = parents.get(list)?;
    let text = document.text.as_str();
    let (owner, doc) = match callable.kind() {
        "module_item" | "function_item" => (
            callable.child_by_field_name("name").map(|owner| text[owner.byte_range()].to_owned()),
            doc_for(text, callable),
        ),
        _ => (None, String::new()),
    };
    let param_name = &text[name.byte_range()];
    let param = params_of(text, list).into_iter().find(|param| param.range.0 == name.start_byte())?;
    Some(Resolved {
        uri: document.uri.clone(),
        decl: Decl {
            name: param_name.to_owned(),
            kind: DeclKind::Parameter,
            name_range: param.range,
            node_range: (parameter.start_byte(), parameter.end_byte()),
            params: Vec::new(),
            value: param.default,
            doc: DocComment::parse(&doc).param(param_name).unwrap_or_default().to_owned(),
            owner,
        },
        visibility: None,
    })
}

fn binding_kind<'t>(parents: &Parents<'t>, holder: Node<'t>) -> DeclKind {
    let scope = if holder.kind() == "assignments" { parents.get(holder) } else { Some(holder) };
    match scope.map(|scope| scope.kind()) {
        Some("for_block" | "intersection_for_block" | "for_clause" | "condition_update_clause") => {
            DeclKind::LoopVariable
        }
        Some("let_block" | "let_expression" | "let_prefix" | "assign_block") => DeclKind::LetVariable,
        _ => DeclKind::Variable,
    }
}

pub struct Binding<'a> {
    pub name: &'a str,
    pub namespace: Namespace,
    pub make: &'a dyn Fn() -> Decl,
}

/// Visit the names `scope` binds for a use inside its child `via` at `offset`. The visitor returns `true` to stop.
fn for_each_binding<'t>(
    document: &Document,
    parents: &Parents<'t>,
    scope: Node<'t>,
    via: Node<'t>,
    offset: usize,
    visit: &mut dyn FnMut(Binding) -> bool,
) {
    let text = document.text.as_str();
    match scope.kind() {
        "source_file" => {
            for decl in &document.index.decls {
                let make = || decl.clone();
                if visit(Binding { name: &decl.name, namespace: decl.namespace(), make: &make }) {
                    return;
                }
            }
        }
        "union_block" => {
            let mut cursor = scope.walk();
            for child in scope.named_children(&mut cursor) {
                if is_comment(child) {
                    continue;
                }
                let Some((name, namespace)) = block_binding_name(child) else { continue };
                let make =
                    || declarations_of(text, child).into_iter().next().expect("binding name implies a declaration");
                if visit(Binding { name: &text[name.byte_range()], namespace, make: &make }) {
                    return;
                }
            }
        }
        "module_item" | "function_item" | "function_lit" => {
            let Some(list) = scope.child_by_field_name("parameters") else { return };
            // Default values evaluate where the module is called, not inside it.
            if via.id() == list.id() {
                return;
            }
            let mut cursor = list.walk();
            for parameter in list.named_children(&mut cursor).filter(|child| child.kind() == "parameter") {
                let Some(name) = parameter_name(parameter) else { continue };
                let make = || {
                    parameter_decl(document, parents, parameter, name)
                        .map(|resolved| resolved.decl)
                        .expect("parameter has a name")
                };
                if visit(Binding { name: &text[name.byte_range()], namespace: Namespace::Variable, make: &make }) {
                    return;
                }
            }
        }
        "for_block"
        | "intersection_for_block"
        | "let_block"
        | "assign_block"
        | "let_expression"
        | "let_prefix"
        | "for_clause"
        | "if_clause"
        | "condition_update_clause" => {
            let mut cursor = scope.walk();
            let children: Vec<Node> = scope.named_children(&mut cursor).collect();
            for child in children {
                let lists: Vec<Node> = match child.kind() {
                    "assignments" => vec![child],
                    "let_prefix" if child.id() != via.id() => {
                        named_child_of_kind(child, "assignments").into_iter().collect()
                    }
                    "assignment" if scope.kind() == "condition_update_clause" => vec![scope],
                    _ => continue,
                };
                for list in lists {
                    let inside_list = via.id() == list.id()
                        || (list.start_byte() <= via.start_byte() && via.end_byte() <= list.end_byte());
                    let mut assignment_cursor = list.walk();
                    for assignment in
                        list.named_children(&mut assignment_cursor).filter(|child| child.kind() == "assignment")
                    {
                        // Inside the list, only earlier assignments are visible (`let (a = 1, b = a)`).
                        if inside_list && assignment.end_byte() > offset {
                            continue;
                        }
                        let Some(name) = assignment.child_by_field_name("name") else { continue };
                        let kind = binding_kind(parents, list);
                        let make = || {
                            assignment_decl(text, assignment, kind, assignment, String::new())
                                .expect("assignment has a name")
                        };
                        if visit(Binding {
                            name: &text[name.byte_range()],
                            namespace: Namespace::Variable,
                            make: &make,
                        }) {
                            return;
                        }
                    }
                    if scope.kind() == "condition_update_clause" {
                        return;
                    }
                }
            }
        }
        _ => {}
    }
}

fn block_binding_name(child: Node) -> Option<(Node, Namespace)> {
    match child.kind() {
        "module_item" => Some((child.child_by_field_name("name")?, Namespace::Module)),
        "function_item" => Some((child.child_by_field_name("name")?, Namespace::Function)),
        "var_declaration" => {
            Some((named_child_of_kind(child, "assignment")?.child_by_field_name("name")?, Namespace::Variable))
        }
        _ => None,
    }
}

fn parameter_name(parameter: Node) -> Option<Node> {
    let first = parameter.named_child(0)?;
    if first.kind() == "assignment" { first.child_by_field_name("name") } else { Some(first) }
}

/// Every occurrence in the workspace that resolves to `declaration`, including the declaration itself.
pub fn references(workspace: &Workspace, declaration: &Resolved) -> Vec<(String, (usize, usize))> {
    let mut result = Vec::new();
    let name = declaration.decl.name.as_str();
    for document in workspace.sorted_documents() {
        if !document.text.contains(name) {
            continue;
        }
        let resolver = Resolver::new(workspace, document);
        let bytes = document.text.as_bytes();
        for (start, _) in document.text.match_indices(name) {
            let end = start + name.len();
            let before = start.checked_sub(1).map(|index| bytes[index]);
            let after = bytes.get(end).copied();
            if before.is_some_and(is_identifier_byte) || after.is_some_and(is_identifier_byte) {
                continue;
            }
            let Some(target) = target_at(document, start) else { continue };
            if target.range != (start, end) {
                continue;
            }
            if resolver.resolve(&target).is_some_and(|resolved| resolved.same_declaration(declaration)) {
                result.push((document.uri.clone(), target.range));
            }
        }
    }
    result
}
