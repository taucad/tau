mod fixture;
mod harness;

use harness::{Harness, uri};
use serde_json::{Value, json};

const BUILTINS: &str = "file:///__openscad_builtins__/builtins.scad";

fn project() -> Harness {
    let mut harness = Harness::new(&fixture::project());
    harness.open("main.scad");
    harness
}

fn hover(harness: &mut Harness, path: &str, needle: &str, offset: usize) -> String {
    let result = harness.request("textDocument/hover", harness.at_text(path, needle, offset));
    result["contents"]["value"].as_str().unwrap_or_default().to_owned()
}

fn definition(harness: &mut Harness, path: &str, needle: &str, offset: usize) -> (String, Value) {
    let result = harness.request("textDocument/definition", harness.at_text(path, needle, offset));
    let first = &result[0];
    (first["targetUri"].as_str().unwrap_or_default().to_owned(), first["targetSelectionRange"]["start"].clone())
}

#[test]
fn hovers_project_declarations_with_documentation() {
    let mut harness = project();
    let gear = hover(&mut harness, "main.scad", "spur_gear(teeth", 2);
    assert!(gear.contains("```openscad\nmodule spur_gear(teeth = 20, module_size = 1)\n```"), "{gear}");
    assert!(gear.contains("A spur gear."));
    assert!(gear.contains("*@param* `teeth` — Tooth count"));
    assert!(gear.contains("*used from* `lib/gears.scad`"));

    let plate = hover(&mut harness, "main.scad", "plate(width = 60", 1);
    assert!(plate.contains("A mounting plate. Pair it with [`spur_gear`](file:///lib/gears.scad#L6,8)."), "{plate}");

    let thickness = hover(&mut harness, "main.scad", "thickness]", 1);
    assert!(thickness.contains("thickness = 2"));
    assert!(thickness.contains("Plate thickness\n[1:10]"), "{thickness}");

    let radius = hover(&mut harness, "main.scad", "hole_radius)", 0);
    assert!(radius.contains("Radius of mounting holes"));
    assert!(radius.contains("*included from* `config.scad`"));
}

#[test]
fn hovers_parameters_builtins_and_imports() {
    let mut harness = project();
    let named = hover(&mut harness, "main.scad", "width = 60", 0);
    assert!(named.contains("(parameter of plate) width = 40"), "{named}");
    assert!(named.contains("Plate width"));

    let usage = hover(&mut harness, "main.scad", "holes - 1", 0);
    assert!(usage.contains("(parameter of plate) holes = 4"));
    assert!(usage.contains("Number of holes"));

    let loop_variable = hover(&mut harness, "main.scad", "i * 10", 0);
    assert!(loop_variable.contains("(loop variable) i = [0:holes - 1]"), "{loop_variable}");

    let cube = hover(&mut harness, "main.scad", "cube([width", 1);
    assert!(cube.contains("module cube(size = [1, 1, 1], center = false)"));
    assert!(cube.contains("*OpenSCAD built-in*"));
    assert!(cube.contains("*@example*"));

    let fragments = hover(&mut harness, "lib/gears.scad", "cylinder(", 2);
    assert!(fragments.contains("[`$fn`](file:///__openscad_builtins__/builtins.scad#L"), "{fragments}");

    let import = hover(&mut harness, "main.scad", "lib/gears.scad", 2);
    assert!(import.contains("`lib/gears.scad`: 1 module, 2 functions, 1 variable"), "{import}");
    assert!(import.contains("`use` imports the file's modules and functions."));

    let mut grouped = Harness::new(&[("model.scad", "/* [Size] */\nwidth = 10;\n")]);
    grouped.open("model.scad");
    let group = hover(&mut grouped, "model.scad", "Size", 0);
    assert!(group.contains("Customizer group **Size**"), "{group}");
}

#[test]
fn goes_to_definitions_across_files() {
    let mut harness = project();
    assert_eq!(
        definition(&mut harness, "main.scad", "spur_gear(teeth", 0),
        (uri("lib/gears.scad"), json!({ "line": 5, "character": 7 }))
    );
    assert_eq!(
        definition(&mut harness, "main.scad", "hole_radius)", 3),
        (uri("config.scad"), json!({ "line": 1, "character": 0 }))
    );
    assert_eq!(
        definition(&mut harness, "main.scad", "gear_ratio(", 0),
        (uri("lib/gears.scad"), json!({ "line": 12, "character": 9 }))
    );
    // Named arguments open the callee's parameter.
    assert_eq!(
        definition(&mut harness, "main.scad", "teeth = 12", 0),
        (uri("lib/gears.scad"), json!({ "line": 5, "character": 17 }))
    );
    assert_eq!(
        definition(&mut harness, "main.scad", "width, width", 0),
        (uri("main.scad"), json!({ "line": 12, "character": 13 }))
    );
    assert_eq!(
        definition(&mut harness, "main.scad", "i * 10", 0),
        (uri("main.scad"), json!({ "line": 15, "character": 9 }))
    );
    assert_eq!(
        definition(&mut harness, "main.scad", "config.scad", 1),
        (uri("config.scad"), json!({ "line": 0, "character": 0 }))
    );
}

#[test]
fn opens_builtin_declarations_as_generated_source() {
    let mut harness = project();
    let (target, start) = definition(&mut harness, "main.scad", "cube([", 0);
    assert_eq!(target, BUILTINS);
    let source = harness.request("tau/declarationSource", json!({ "uri": BUILTINS }));
    let text = source["text"].as_str().unwrap();
    let line = text.lines().nth(start["line"].as_u64().unwrap() as usize).unwrap();
    assert!(line[start["character"].as_u64().unwrap() as usize..].starts_with("cube(size"), "{line}");
    // Built-in documentation links resolve inside the generated source.
    let fn_hover = harness.request(
        "textDocument/hover",
        json!({ "textDocument": { "uri": BUILTINS }, "position": { "line": start["line"], "character": start["character"] } }),
    );
    assert!(fn_hover["contents"]["value"].as_str().unwrap().contains("Creates a cube"));
}

#[test]
fn finds_references_and_highlights() {
    let mut harness = project();
    let references = harness.request(
        "textDocument/references",
        merge(json!({ "context": { "includeDeclaration": true } }), harness.at_text("main.scad", "spur_gear(teeth", 0)),
    );
    let mut found: Vec<(String, u64)> = references
        .as_array()
        .unwrap()
        .iter()
        .map(|location| {
            (location["uri"].as_str().unwrap().to_owned(), location["range"]["start"]["line"].as_u64().unwrap())
        })
        .collect();
    found.sort();
    assert_eq!(found, vec![(uri("lib/gears.scad"), 5), (uri("main.scad"), 20)]);

    let width = harness.request("textDocument/documentHighlight", harness.at_text("main.scad", "width = 40", 0));
    let kinds: Vec<u64> =
        width.as_array().unwrap().iter().map(|highlight| highlight["kind"].as_u64().unwrap()).collect();
    // The declaration, two uses in the body and the named argument at the call.
    assert_eq!(kinds, vec![3, 2, 2, 2]);

    let without = harness.request(
        "textDocument/references",
        merge(json!({ "context": { "includeDeclaration": false } }), harness.at_text("config.scad", "hole_radius", 0)),
    );
    assert_eq!(without.as_array().unwrap().len(), 1);
}

#[test]
fn renames_across_files_and_refuses_builtins() {
    let mut harness = project();
    let prepared = harness.request("textDocument/prepareRename", harness.at_text("main.scad", "hole_radius)", 2));
    assert_eq!(prepared["placeholder"], "hole_radius");
    let edit = harness.request(
        "textDocument/rename",
        merge(json!({ "newName": "hole_r" }), harness.at_text("main.scad", "hole_radius)", 2)),
    );
    let changes = edit["documentChanges"].as_array().unwrap();
    let uris: Vec<&str> = changes.iter().map(|change| change["textDocument"]["uri"].as_str().unwrap()).collect();
    assert_eq!(uris, vec![uri("config.scad"), uri("main.scad")]);
    assert_eq!(changes[1]["textDocument"]["version"], 1);
    assert_eq!(changes[0]["textDocument"]["version"], Value::Null);
    assert_eq!(changes[0]["edits"][0]["newText"], "hole_r");

    let error = harness.request_error("textDocument/prepareRename", harness.at_text("main.scad", "cube(", 0));
    assert!(error["message"].as_str().unwrap().contains("built-in"));
    let invalid = harness.request_error(
        "textDocument/rename",
        merge(json!({ "newName": "2x" }), harness.at_text("main.scad", "plate(width = 60", 0)),
    );
    assert!(invalid["message"].as_str().unwrap().contains("not a valid"));
}

#[test]
fn resolves_scopes_and_namespaces() {
    let source = r#"size = 1;
module size() { cube(size); }
function size() = size;
module wrap(size = 2) {
  let (size = size + 1, other = size) echo(size, other);
  inner = [for (size = [0:3]) let (k = size * 2) k];
}
size();
x = size();
"#;
    let mut harness = Harness::new(&[("scope.scad", source)]);
    let declaration_line = |harness: &mut Harness, needle: &str, offset: usize| {
        let result = harness.request("textDocument/definition", harness.at_text("scope.scad", needle, offset));
        result[0]["targetSelectionRange"]["start"].clone()
    };
    // The module body sees the top-level variable, not the module of the same name.
    assert_eq!(declaration_line(&mut harness, "cube(size", 5), json!({ "line": 0, "character": 0 }));
    assert_eq!(declaration_line(&mut harness, "= size;", 2), json!({ "line": 0, "character": 0 }));
    assert_eq!(declaration_line(&mut harness, "size();\nx", 0), json!({ "line": 1, "character": 7 }));
    assert_eq!(declaration_line(&mut harness, "size();\n", 4), json!({ "line": 1, "character": 7 }));
    assert_eq!(declaration_line(&mut harness, "x = size()", 4), json!({ "line": 2, "character": 9 }));
    // `let` assignments see earlier ones and the enclosing parameter, and the body sees all of them.
    assert_eq!(declaration_line(&mut harness, "size + 1", 0), json!({ "line": 3, "character": 12 }));
    assert_eq!(declaration_line(&mut harness, "other = size", 8), json!({ "line": 4, "character": 7 }));
    assert_eq!(declaration_line(&mut harness, "echo(size", 5), json!({ "line": 4, "character": 7 }));
    assert_eq!(declaration_line(&mut harness, "size * 2", 0), json!({ "line": 5, "character": 16 }));
    assert_eq!(declaration_line(&mut harness, ") k]", 2), json!({ "line": 5, "character": 35 }));
}

fn merge(mut base: Value, extra: Value) -> Value {
    for (key, value) in extra.as_object().unwrap() {
        base[key] = value.clone();
    }
    base
}

#[test]
fn shows_incoming_and_outgoing_calls() {
    let mut harness = project();
    let gears = fixture::GEARS;
    let offset = gears.find("pitch_radius(teeth").unwrap() + 1;
    let items = harness.request(
        "textDocument/prepareCallHierarchy",
        json!({ "textDocument": { "uri": uri("lib/gears.scad") }, "position": harness::position(gears, offset) }),
    );
    let item = items[0].clone();
    assert_eq!(item["name"], "pitch_radius");
    assert_eq!(item["kind"], 12);
    let incoming = harness.request("callHierarchy/incomingCalls", json!({ "item": item }));
    let callers: Vec<&str> =
        incoming.as_array().unwrap().iter().map(|call| call["from"]["name"].as_str().unwrap()).collect();
    assert_eq!(callers, vec!["spur_gear"]);

    let main = fixture::MAIN;
    let plate = main.find("module plate").unwrap() + 8;
    let items = harness.request(
        "textDocument/prepareCallHierarchy",
        json!({ "textDocument": { "uri": uri("main.scad") }, "position": harness::position(main, plate) }),
    );
    let outgoing = harness.request("callHierarchy/outgoingCalls", json!({ "item": items[0] }));
    let callees: Vec<(&str, &str)> = outgoing
        .as_array()
        .unwrap()
        .iter()
        .map(|call| (call["to"]["name"].as_str().unwrap(), call["to"]["uri"].as_str().unwrap()))
        .collect();
    assert_eq!(
        callees,
        vec![("difference", BUILTINS), ("cube", BUILTINS), ("translate", BUILTINS), ("cylinder", BUILTINS)]
    );

    // Calls at the top level come from the file; variables have no call hierarchy.
    let spur = gears.find("spur_gear").unwrap();
    let items = harness.request(
        "textDocument/prepareCallHierarchy",
        json!({ "textDocument": { "uri": uri("lib/gears.scad") }, "position": harness::position(gears, spur) }),
    );
    let incoming = harness.request("callHierarchy/incomingCalls", json!({ "item": items[0] }));
    assert_eq!(incoming[0]["from"]["name"], "main.scad");
    assert_eq!(incoming[0]["from"]["kind"], 1);
    let thickness = main.find("thickness =").unwrap();
    let none = harness.request(
        "textDocument/prepareCallHierarchy",
        json!({ "textDocument": { "uri": uri("main.scad") }, "position": harness::position(main, thickness) }),
    );
    assert!(none.is_null());
}
