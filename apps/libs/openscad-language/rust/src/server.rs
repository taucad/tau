//! JSON-RPC dispatch, document synchronization and server capabilities.

use serde_json::{Value, json};

use crate::features;
use crate::text::{Position, Range};
use crate::workspace::{BUILTINS_URI, MAXIMUM_FILES, Workspace};

pub struct Server {
    pub workspace: Workspace,
    shutdown: bool,
}

impl Default for Server {
    fn default() -> Self {
        Self::new()
    }
}

/// A JSON-RPC error: code and message.
pub struct RpcError(pub i64, pub String);

pub type RpcResult = Result<Value, RpcError>;

pub fn invalid_params(message: &str) -> RpcError {
    RpcError(-32602, message.to_owned())
}

impl Server {
    pub fn new() -> Self {
        Self { workspace: Workspace::new(), shutdown: false }
    }

    /// Handle one JSON-RPC message; returns the response for a request and `None` for a notification.
    pub fn handle(&mut self, message: &str) -> Option<String> {
        let parsed: Value = match serde_json::from_str(message) {
            Ok(value) => value,
            Err(error) => {
                return Some(error_response(&Value::Null, -32700, &format!("Parse error: {error}")));
            }
        };
        let method = parsed.get("method").and_then(Value::as_str).unwrap_or_default();
        let params = parsed.get("params").cloned().unwrap_or(Value::Null);
        match parsed.get("id") {
            Some(id) if !id.is_null() => {
                let response = match self.request(method, &params) {
                    Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string(),
                    Err(RpcError(code, message)) => error_response(id, code, &message),
                };
                Some(response)
            }
            _ => {
                self.notification(method, &params);
                None
            }
        }
    }

    fn request(&mut self, method: &str, params: &Value) -> RpcResult {
        if self.shutdown && method != "shutdown" {
            return Err(RpcError(-32600, "The server is shut down".to_owned()));
        }
        let workspace = &self.workspace;
        match method {
            "initialize" => Ok(json!({
                "capabilities": capabilities(),
                "serverInfo": { "name": "tau-openscad-language", "version": env!("CARGO_PKG_VERSION") },
            })),
            "shutdown" => {
                self.shutdown = true;
                Ok(Value::Null)
            }
            "textDocument/completion" => features::completion(workspace, params),
            "completionItem/resolve" => features::completion_resolve(workspace, params),
            "textDocument/hover" => features::hover(workspace, params),
            "textDocument/signatureHelp" => features::signature_help(workspace, params),
            "textDocument/definition" | "textDocument/declaration" => features::definition(workspace, params),
            "textDocument/references" => features::references(workspace, params),
            "textDocument/documentHighlight" => features::document_highlight(workspace, params),
            "textDocument/prepareRename" => features::prepare_rename(workspace, params),
            "textDocument/rename" => features::rename(workspace, params),
            "textDocument/diagnostic" => features::diagnostic(workspace, params),
            "textDocument/documentSymbol" => features::document_symbol(workspace, params),
            "workspace/symbol" => features::workspace_symbol(workspace, params),
            "textDocument/foldingRange" => features::folding_range(workspace, params),
            "textDocument/codeAction" => features::code_action(workspace, params),
            "textDocument/formatting" => features::formatting(workspace, params),
            "textDocument/prepareCallHierarchy" => features::prepare_call_hierarchy(workspace, params),
            "callHierarchy/incomingCalls" => features::incoming_calls(workspace, params),
            "callHierarchy/outgoingCalls" => features::outgoing_calls(workspace, params),
            "textDocument/semanticTokens/full" => features::semantic_tokens(workspace, params),
            "tau/declarationSource" => {
                let uri = params.get("uri").and_then(Value::as_str).ok_or_else(|| invalid_params("uri"))?;
                if uri != BUILTINS_URI {
                    return Err(invalid_params("Only built-in declarations have generated source"));
                }
                Ok(json!({ "text": self.workspace.builtins.text }))
            }
            _ => Err(RpcError(-32601, format!("Unhandled method {method}"))),
        }
    }

    fn notification(&mut self, method: &str, params: &Value) {
        match method {
            "textDocument/didOpen" => {
                let Some(item) = params.get("textDocument") else { return };
                let (Some(uri), Some(text)) =
                    (item.get("uri").and_then(Value::as_str), item.get("text").and_then(Value::as_str))
                else {
                    return;
                };
                self.workspace.set_text(uri, text.to_owned(), true);
                if let Some(document) = self.workspace.get_mut(uri) {
                    document.version = Some(item.get("version").and_then(Value::as_i64).unwrap_or(0));
                }
            }
            "textDocument/didChange" => self.did_change(params),
            "textDocument/didClose" => {
                let uri = params.pointer("/textDocument/uri").and_then(Value::as_str).unwrap_or_default().to_owned();
                if let Some(document) = self.workspace.get_mut(&uri) {
                    document.version = None;
                }
            }
            "tau/workspaceFiles" => self.workspace_files(params),
            _ => {}
        }
    }

    fn did_change(&mut self, params: &Value) {
        let Some(uri) = params.pointer("/textDocument/uri").and_then(Value::as_str).map(str::to_owned) else { return };
        let version = params.pointer("/textDocument/version").and_then(Value::as_i64);
        let workspace = &mut self.workspace;
        let mut pending = false;
        for change in params.get("contentChanges").and_then(Value::as_array).into_iter().flatten() {
            let Some(text) = change.get("text").and_then(Value::as_str) else { continue };
            match change.get("range").and_then(Range::from_json) {
                Some(range) => {
                    if let Some(document) = workspace.get_mut(&uri) {
                        document.edit(range.start, range.end, text);
                        pending = true;
                    }
                }
                None => {
                    workspace.set_text(&uri, text.to_owned(), true);
                    pending = false;
                }
            }
        }
        if pending {
            workspace.reparse(&uri);
        }
        if let Some(document) = workspace.get_mut(&uri) {
            document.version = version.or(document.version).or(Some(0));
        }
    }

    fn workspace_files(&mut self, params: &Value) {
        if params.get("replace").and_then(Value::as_bool).unwrap_or(false) {
            self.workspace.clear_closed();
        }
        for file in params.get("files").and_then(Value::as_array).into_iter().flatten() {
            let Some(uri) = file.get("uri").and_then(Value::as_str) else { continue };
            match file.get("text").and_then(Value::as_str) {
                Some(text) if self.workspace.len() < MAXIMUM_FILES || self.workspace.get(uri).is_some() => {
                    self.workspace.set_text(uri, text.to_owned(), false);
                }
                Some(_) => {}
                None => {
                    if self.workspace.get(uri).is_some_and(|document| document.version.is_none()) {
                        self.workspace.remove(uri);
                    }
                }
            }
        }
    }
}

pub fn capabilities() -> Value {
    json!({
        "positionEncoding": "utf-16",
        "textDocumentSync": { "openClose": true, "change": 2 },
        "completionProvider": { "triggerCharacters": ["<", "/", "$", "(", ","], "resolveProvider": true },
        "hoverProvider": true,
        "signatureHelpProvider": { "triggerCharacters": ["(", ","], "retriggerCharacters": [","] },
        "definitionProvider": true,
        "declarationProvider": true,
        "referencesProvider": true,
        "documentHighlightProvider": true,
        "renameProvider": { "prepareProvider": true },
        "documentSymbolProvider": true,
        "workspaceSymbolProvider": true,
        "foldingRangeProvider": true,
        "codeActionProvider": { "codeActionKinds": ["quickfix"] },
        "documentFormattingProvider": true,
        "callHierarchyProvider": true,
        "diagnosticProvider": { "interFileDependencies": true, "workspaceDiagnostics": false },
        "semanticTokensProvider": {
            "legend": { "tokenTypes": features::TOKEN_TYPES, "tokenModifiers": features::TOKEN_MODIFIERS },
            "full": true,
        },
    })
}

fn error_response(id: &Value, code: i64, message: &str) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }).to_string()
}

/// `textDocument.uri` and `position` from request params.
pub fn text_document_position(params: &Value) -> Result<(&str, Position), RpcError> {
    let uri = params
        .pointer("/textDocument/uri")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid_params("textDocument.uri"))?;
    let position = params.get("position").and_then(Position::from_json).ok_or_else(|| invalid_params("position"))?;
    Ok((uri, position))
}
