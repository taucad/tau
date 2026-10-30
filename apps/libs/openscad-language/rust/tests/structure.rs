mod fixture;
mod harness;

use harness::{Harness, uri};
use serde_json::{Value, json};

#[test]
fn answers_the_initialize_handshake() {
    let mut harness = Harness::new(&[]);
    let result = harness.request("initialize", json!({ "capabilities": {} }));
    let capabilities = &result["capabilities"];
    assert_eq!(capabilities["textDocumentSync"]["change"], 2);
    for provider in ["hoverProvider", "definitionProvider", "referencesProvider", "documentSymbolProvider"] {
        assert_eq!(capabilities[provider], true, "{provider}");
    }
    assert_eq!(capabilities["semanticTokensProvider"]["legend"]["tokenTypes"][0], "module");
    let error = harness.request_error("textDocument/inlayHint", json!({}));
    assert_eq!(error["code"], -32601);
    let parse = harness.server.handle("{").unwrap();
    assert!(parse.contains("-32700"));
}

#[test]
fn lists_document_and_workspace_symbols() {
    let mut harness = Harness::new(&fixture::project());
    let symbols =
        harness.request("textDocument/documentSymbol", json!({ "textDocument": { "uri": uri("main.scad") } }));
    let names: Vec<(&str, u64)> = symbols
        .as_array()
        .unwrap()
        .iter()
        .map(|symbol| (symbol["name"].as_str().unwrap(), symbol["kind"].as_u64().unwrap()))
        .collect();
    assert_eq!(names, vec![("thickness", 13), ("plate", 2)]);
    assert_eq!(symbols[1]["detail"], "(width = 40, holes = 4)");
    let found = harness.request("workspace/symbol", json!({ "query": "gear" }));
    let mut names: Vec<&str> =
        found.as_array().unwrap().iter().map(|symbol| symbol["name"].as_str().unwrap()).collect();
    names.sort_unstable();
    assert_eq!(names, vec!["gear_ratio", "gear_secret", "spur_gear"]);
}

#[test]
fn folds_blocks_comments_and_imports() {
    let mut harness = Harness::new(&fixture::project());
    let ranges = harness.request("textDocument/foldingRange", json!({ "textDocument": { "uri": uri("main.scad") } }));
    let ranges: Vec<(u64, u64, Value)> = ranges
        .as_array()
        .unwrap()
        .iter()
        .map(|range| (range["startLine"].as_u64().unwrap(), range["endLine"].as_u64().unwrap(), range["kind"].clone()))
        .collect();
    assert!(ranges.contains(&(0, 1, json!("imports"))), "{ranges:?}");
    assert!(ranges.contains(&(7, 11, json!("comment"))), "{ranges:?}");
    assert!(ranges.contains(&(12, 17, Value::Null)), "{ranges:?}");
    assert!(ranges.contains(&(13, 16, Value::Null)), "{ranges:?}");
}

#[test]
fn classifies_semantic_tokens() {
    let mut harness = Harness::new(&[("model.scad", "module m(size) { cube(size, center = true); }\nm(2);\n")]);
    let tokens =
        harness.request("textDocument/semanticTokens/full", json!({ "textDocument": { "uri": uri("model.scad") } }));
    let data: Vec<u64> = tokens["data"].as_array().unwrap().iter().map(|value| value.as_u64().unwrap()).collect();
    let decoded: Vec<[u64; 5]> =
        data.chunks(5).map(|chunk| [chunk[0], chunk[1], chunk[2], chunk[3], chunk[4]]).collect();
    assert_eq!(
        decoded,
        vec![
            [0, 7, 1, 0, 1], // m: module declaration
            [0, 2, 4, 3, 1], // size: parameter declaration
            [0, 8, 4, 0, 2], // cube: built-in module
            [0, 5, 4, 3, 0], // size: parameter
            [0, 6, 6, 4, 2], // center: named argument of a built-in
            [1, 0, 1, 0, 0], // m
        ]
    );
}

#[test]
fn follows_workspace_snapshots() {
    let mut harness = Harness::new(&fixture::project());
    harness.notify("tau/workspaceFiles", json!({ "files": [{ "uri": uri("parts/bracket.scad"), "text": null }] }));
    let found = harness.request("workspace/symbol", json!({ "query": "bracket" }));
    assert_eq!(found, json!([]));
    harness.notify(
        "tau/workspaceFiles",
        json!({ "replace": true, "files": [{ "uri": uri("only.scad"), "text": "a = 1;" }] }),
    );
    let found = harness.request("workspace/symbol", json!({ "query": "" }));
    assert_eq!(found.as_array().unwrap().len(), 1);
}
