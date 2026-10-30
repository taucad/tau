//! Drives the server over its JSON-RPC surface, the way the browser worker does.

#![allow(dead_code)]

use serde_json::{Value, json};
use tau_openscad_language::Server;

pub struct Harness {
    pub server: Server,
    next_id: i64,
    files: Vec<(String, String)>,
}

impl Harness {
    /// Files are `(path, text)`; `|` in a text marks a cursor and is removed.
    pub fn new(files: &[(&str, &str)]) -> Self {
        let mut harness = Self { server: Server::new(), next_id: 0, files: Vec::new() };
        harness.request("initialize", json!({ "capabilities": {} }));
        harness.notify("initialized", json!({}));
        let files: Vec<Value> = files
            .iter()
            .map(|(path, text)| {
                let text = text.replace('|', "");
                harness.files.push(((*path).to_owned(), text.clone()));
                json!({ "uri": uri(path), "text": text })
            })
            .collect();
        harness.notify("tau/workspaceFiles", json!({ "replace": true, "files": files }));
        harness
    }

    pub fn open(&mut self, path: &str) {
        let text = self.text(path);
        self.notify(
            "textDocument/didOpen",
            json!({ "textDocument": { "uri": uri(path), "languageId": "openscad", "version": 1, "text": text } }),
        );
    }

    pub fn text(&self, path: &str) -> String {
        self.files.iter().find(|(candidate, _)| candidate == path).map(|(_, text)| text.clone()).unwrap_or_default()
    }

    pub fn request(&mut self, method: &str, params: Value) -> Value {
        self.next_id += 1;
        let id = self.next_id;
        let raw = self
            .server
            .handle(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }).to_string())
            .expect("requests always get a response");
        let response: Value = serde_json::from_str(&raw).expect("responses are JSON");
        assert_eq!(response["id"], json!(id));
        if let Some(error) = response.get("error") {
            panic!("{method} failed: {error}");
        }
        response["result"].clone()
    }

    pub fn request_error(&mut self, method: &str, params: Value) -> Value {
        self.next_id += 1;
        let raw = self
            .server
            .handle(&json!({ "jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params }).to_string())
            .unwrap();
        let response: Value = serde_json::from_str(&raw).unwrap();
        response["error"].clone()
    }

    pub fn notify(&mut self, method: &str, params: Value) {
        assert!(
            self.server.handle(&json!({ "jsonrpc": "2.0", "method": method, "params": params }).to_string()).is_none(),
            "notifications have no response"
        );
    }

    /// `textDocument` and `position` for the `|` marker of `source` inside file `path`.
    pub fn at(&self, path: &str, source: &str) -> Value {
        json!({ "textDocument": { "uri": uri(path) }, "position": marker(source) })
    }

    pub fn at_text(&self, path: &str, needle: &str, offset: usize) -> Value {
        let text = self.text(path);
        let index = text.find(needle).unwrap_or_else(|| panic!("{needle} not in {path}")) + offset;
        json!({ "textDocument": { "uri": uri(path) }, "position": position(&text, index) })
    }
}

pub fn uri(path: &str) -> String {
    format!("file:///{}", path.trim_start_matches('/'))
}

pub fn marker(source: &str) -> Value {
    let index = source.find('|').expect("a | cursor marker");
    position(source, index)
}

pub fn position(text: &str, index: usize) -> Value {
    let before = &text[..index];
    let line = before.matches('\n').count();
    let character = before.rsplit('\n').next().unwrap_or("").encode_utf16().count();
    json!({ "line": line, "character": character })
}

pub fn labels(result: &Value) -> Vec<String> {
    result["items"].as_array().unwrap().iter().map(|item| item["label"].as_str().unwrap().to_owned()).collect()
}

pub fn item<'a>(result: &'a Value, label: &str) -> &'a Value {
    result["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["label"] == label)
        .unwrap_or_else(|| panic!("no completion {label} in {:?}", labels(result)))
}
