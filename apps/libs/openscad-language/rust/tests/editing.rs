mod fixture;
mod harness;

use harness::{Harness, item, labels, uri};
use serde_json::json;

fn with(path: &'static str, source: &'static str) -> Harness {
    let mut files = fixture::project();
    files.push((path, source));
    let mut harness = Harness::new(&files);
    harness.open(path);
    harness
}

#[test]
fn completes_modules_in_statement_position() {
    let source = "use <lib/gears.scad>\ninclude <config.scad>\n|";
    let mut harness = with("model.scad", source);
    let result = harness.request("textDocument/completion", harness.at("model.scad", source));
    let names = labels(&result);
    for expected in ["spur_gear", "cube", "translate", "for", "module", "hole_radius"] {
        assert!(names.contains(&expected.to_owned()), "missing {expected}");
    }
    for unexpected in ["sin", "pitch_radius", "gear_secret"] {
        assert!(!names.contains(&unexpected.to_owned()), "unexpected {unexpected}");
    }
    let cube = item(&result, "cube");
    assert_eq!(cube["detail"], "module cube(size = [1, 1, 1], center = false)");
    assert!(cube["documentation"].is_null(), "built-in documentation resolves lazily");
    let cube = harness.request("completionItem/resolve", cube.clone());
    assert!(cube["documentation"]["value"].as_str().unwrap().contains("Creates a cube"));
    assert_eq!(cube["textEdit"]["newText"], "cube($1)$0");
}

#[test]
fn completes_functions_and_variables_in_expressions() {
    let source = "use <lib/gears.scad>\ninclude <config.scad>\nx = |";
    let mut harness = with("model.scad", source);
    let result = harness.request("textDocument/completion", harness.at("model.scad", source));
    let names = labels(&result);
    for expected in ["gear_ratio", "pitch_radius", "hole_radius", "sin", "PI", "$fn", "true"] {
        assert!(names.contains(&expected.to_owned()), "missing {expected}");
    }
    // `use` imports modules and functions, never variables; modules are not expressions.
    for unexpected in ["gear_secret", "spur_gear", "cube"] {
        assert!(!names.contains(&unexpected.to_owned()), "unexpected {unexpected}");
    }
    let hole_radius = harness.request("completionItem/resolve", item(&result, "hole_radius").clone());
    let documentation = hole_radius["documentation"]["value"].as_str().unwrap().to_owned();
    assert!(documentation.contains("*included from* `config.scad`"), "{documentation}");
}

#[test]
fn completes_argument_names_and_locals() {
    let source = "module m(size = 1, $fn = 8) {\n  for (step = [0:2]) translate([step, 0, 0]) cube(|);\n}";
    let mut harness = with("model.scad", source);
    let result = harness.request("textDocument/completion", harness.at("model.scad", source));
    let names = labels(&result);
    assert_eq!(&names[..2], &["size =".to_owned(), "center =".to_owned()]);
    assert!(names.contains(&"step".to_owned()));
    assert!(names.contains(&"size".to_owned()));
    let used = "cube(size = 2, |)";
    let mut harness = with("model.scad", used);
    let names = labels(&harness.request("textDocument/completion", harness.at("model.scad", used)));
    assert!(!names.contains(&"size =".to_owned()));
    assert!(names.contains(&"center =".to_owned()));
}

#[test]
fn auto_imports_project_declarations() {
    let source = "use <lib/gears.scad>\n\nbrack|";
    let mut harness = with("model.scad", source);
    let result = harness.request("textDocument/completion", harness.at("model.scad", source));
    let bracket = item(&result, "bracket");
    assert_eq!(
        bracket["additionalTextEdits"],
        json!([{
            "range": { "start": { "line": 1, "character": 0 }, "end": { "line": 1, "character": 0 } },
            "newText": "use <parts/bracket.scad>\n",
        }])
    );
    assert_eq!(bracket["labelDetails"]["description"], "parts/bracket.scad");
    let bracket = harness.request("completionItem/resolve", bracket.clone());
    assert!(bracket["documentation"]["value"].as_str().unwrap().contains("An L bracket."));
    // Variables need `include`, from a nested file the path climbs out of its directory.
    let nested = "x = hole_r|";
    let mut harness = with("models/deep/model.scad", nested);
    let result = harness.request("textDocument/completion", harness.at("models/deep/model.scad", nested));
    assert_eq!(item(&result, "hole_radius")["additionalTextEdits"][0]["newText"], "include <../../config.scad>\n");
}

#[test]
fn completes_import_paths() {
    let source = "use <|";
    let mut harness = with("model.scad", source);
    let names = labels(&harness.request("textDocument/completion", harness.at("model.scad", source)));
    assert_eq!(names, vec!["config.scad", "lib/gears.scad", "main.scad", "parts/bracket.scad"]);
    let partial = "include <lib/|>";
    let mut harness = with("model.scad", partial);
    let result = harness.request("textDocument/completion", harness.at("model.scad", partial));
    assert_eq!(labels(&result), vec!["lib/gears.scad"]);
    assert_eq!(result["items"][0]["textEdit"]["range"]["start"]["character"], 9);
}

#[test]
fn offers_nothing_in_comments_and_strings() {
    for source in ["// cu|", "/* cu|", "echo(\"cu|"] {
        let mut harness = with("model.scad", source);
        let result = harness.request("textDocument/completion", harness.at("model.scad", source));
        assert_eq!(result["items"], json!([]), "{source}");
    }
}

#[test]
fn shows_signature_help_with_the_active_parameter() {
    let source = "cylinder(h = 2, |";
    let mut harness = with("model.scad", source);
    let help = harness.request("textDocument/signatureHelp", harness.at("model.scad", source));
    let label = help["signatures"][0]["label"].as_str().unwrap();
    assert!(label.starts_with("module cylinder(h = 1, r1 = 1"), "{label}");
    assert_eq!(help["activeParameter"], 1);
    let parameter = &help["signatures"][0]["parameters"][1];
    let range = parameter["label"].as_array().unwrap();
    let units: Vec<u16> = label.encode_utf16().collect();
    let text =
        String::from_utf16(&units[range[0].as_u64().unwrap() as usize..range[1].as_u64().unwrap() as usize]).unwrap();
    assert_eq!(text, "r1 = 1");
    assert_eq!(parameter["documentation"]["value"], "Radius at the bottom.");

    let named = "use <lib/gears.scad>\nspur_gear(module_size = |";
    let mut harness = with("model.scad", named);
    let help = harness.request("textDocument/signatureHelp", harness.at("model.scad", named));
    assert_eq!(help["signatures"][0]["label"], "module spur_gear(teeth = 20, module_size = 1)");
    assert_eq!(help["activeParameter"], 1);
    assert_eq!(help["signatures"][0]["documentation"]["value"], "A spur gear.");

    let function = "use <lib/gears.scad>\nr = pitch_radius(12, |";
    let mut harness = with("model.scad", function);
    let help = harness.request("textDocument/signatureHelp", harness.at("model.scad", function));
    assert_eq!(help["signatures"][0]["label"], "function pitch_radius(teeth, module_size)");
    assert_eq!(help["activeParameter"], 1);
}

#[test]
fn applies_incremental_changes() {
    let mut harness = Harness::new(&fixture::project());
    harness.open("main.scad");
    let end = harness.text("main.scad").lines().count();
    harness.notify(
        "textDocument/didChange",
        json!({
            "textDocument": { "uri": uri("main.scad"), "version": 2 },
            "contentChanges": [
                { "range": { "start": { "line": end, "character": 0 }, "end": { "line": end, "character": 0 } }, "text": "module rim(d = 1) {}\nri" },
            ],
        }),
    );
    let result = harness.request(
        "textDocument/completion",
        json!({ "textDocument": { "uri": uri("main.scad") }, "position": { "line": end + 1, "character": 2 } }),
    );
    assert!(labels(&result).contains(&"rim".to_owned()));
    // A closed-file snapshot does not overwrite the open editor text.
    harness.notify("tau/workspaceFiles", json!({ "files": [{ "uri": uri("main.scad"), "text": "" }] }));
    let symbols =
        harness.request("textDocument/documentSymbol", json!({ "textDocument": { "uri": uri("main.scad") } }));
    assert!(symbols.as_array().unwrap().iter().any(|symbol| symbol["name"] == "rim"));
}

#[test]
fn caps_auto_import_items_and_ranks_prefix_matches_first() {
    let paths: Vec<String> = (0..150).map(|index| format!("parts/part_{index:03}.scad")).collect();
    let texts: Vec<String> =
        (0..150).map(|index| format!("module part_{index:03}() {{}}\nmodule xpart_{index:03}() {{}}\n")).collect();
    let mut files: Vec<(&str, &str)> = paths.iter().map(String::as_str).zip(texts.iter().map(String::as_str)).collect();
    let source = "par|";
    files.push(("model.scad", source));
    let mut harness = Harness::new(&files);
    harness.open("model.scad");
    let result = harness.request("textDocument/completion", harness.at("model.scad", source));
    let imports: Vec<&str> = result["items"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|item| item["additionalTextEdits"].is_array())
        .map(|item| item["label"].as_str().unwrap())
        .collect();
    assert_eq!(result["isIncomplete"], true);
    assert_eq!(imports.len(), 100);
    assert!(imports.iter().all(|label| label.starts_with("part_")), "{imports:?}");
}
