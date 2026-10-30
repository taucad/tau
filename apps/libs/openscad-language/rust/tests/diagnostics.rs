mod fixture;
mod harness;

use harness::{Harness, uri};
use serde_json::{Value, json};

fn diagnostics(harness: &mut Harness, path: &str) -> Vec<Value> {
    let report = harness.request("textDocument/diagnostic", json!({ "textDocument": { "uri": uri(path) } }));
    assert_eq!(report["kind"], "full");
    report["items"].as_array().unwrap().clone()
}

fn summary(items: &[Value]) -> Vec<(String, String)> {
    items
        .iter()
        .map(|item| (item["code"].as_str().unwrap().to_owned(), item["message"].as_str().unwrap().to_owned()))
        .collect()
}

#[test]
fn reports_nothing_for_a_valid_project() {
    let mut harness = Harness::new(&fixture::project());
    for path in ["main.scad", "lib/gears.scad", "config.scad", "parts/bracket.scad"] {
        assert_eq!(diagnostics(&mut harness, path), Vec::<Value>::new(), "{path}");
    }
}

#[test]
fn reports_unknown_names_like_openscad() {
    let source = "use <lib/gears.scad>\ncub(1);\nx = fooo(2) + $t;\ny = zz;\nspur_gear(teth = 3, $fn = 12);\necho(gear_secret);\n";
    let mut files = fixture::project();
    files.push(("bad.scad", source));
    let mut harness = Harness::new(&files);
    let items = diagnostics(&mut harness, "bad.scad");
    assert_eq!(
        summary(&items),
        vec![
            ("unknown-module".to_owned(), "Unknown module `cub`".to_owned()),
            ("unknown-function".to_owned(), "Unknown function `fooo`".to_owned()),
            ("unknown-variable".to_owned(), "Unknown variable `zz`".to_owned()),
            ("unknown-parameter".to_owned(), "`teth` is not a parameter of module `spur_gear`".to_owned()),
            ("unknown-variable".to_owned(), "Unknown variable `gear_secret`".to_owned()),
        ]
    );
    assert_eq!(items[0]["severity"], 2);
    assert_eq!(
        items[0]["range"],
        json!({ "start": { "line": 1, "character": 0 }, "end": { "line": 1, "character": 3 } })
    );
}

#[test]
fn reports_unresolved_imports_without_guessing_names() {
    let source = "use <missing/library.scad>\nwidget(3);\n";
    let mut harness = Harness::new(&[("model.scad", source)]);
    assert_eq!(
        summary(&diagnostics(&mut harness, "model.scad")),
        vec![("unresolved-import".to_owned(), "Cannot find `missing/library.scad` in the project".to_owned())]
    );
}

#[test]
fn reports_syntax_errors() {
    let mut harness = Harness::new(&[("model.scad", "cube(1)\nsphere(2);\nmodule m( { }\n")]);
    let items = diagnostics(&mut harness, "model.scad");
    assert!(!items.is_empty());
    assert!(items.iter().all(|item| item["code"] == "syntax" && item["severity"] == 1), "{items:?}");
}

#[test]
fn offers_import_quick_fixes() {
    let source = "bracket(2);\nr = hole_radius;\n";
    let mut files = fixture::project();
    files.push(("model.scad", source));
    let mut harness = Harness::new(&files);
    harness.open("model.scad");
    let actions = harness.request(
        "textDocument/codeAction",
        json!({
            "textDocument": { "uri": uri("model.scad") },
            "range": { "start": { "line": 0, "character": 0 }, "end": { "line": 1, "character": 10 } },
            "context": { "diagnostics": [] },
        }),
    );
    let titles: Vec<&str> =
        actions.as_array().unwrap().iter().map(|action| action["title"].as_str().unwrap()).collect();
    assert_eq!(titles, vec!["Add `use <parts/bracket.scad>`", "Add `include <config.scad>`"]);
    let change = &actions[0]["edit"]["documentChanges"][0];
    assert_eq!(change["textDocument"], json!({ "uri": uri("model.scad"), "version": 1 }));
    assert_eq!(change["edits"][0]["newText"], "use <parts/bracket.scad>\n");
}
