// ============================================================================
// JSON EXPORT PATCH FOR ZOO KCL REPO
// ============================================================================
//
// Append this file verbatim to `rust/kcl-lib/src/docs/gen_std_tests.rs`
// (verified against kcl-lib 0.2.184, modeling-app 9b0ecedff5). It only uses
// items that module already imports or defines: `json!`, `DocData`, `FnData`,
// `TyData`, `ConstData`, `ModData`, `ExampleProperties`, `mod_name_std` and
// `docs_for_type`.
//
//   cat gen_std_tests.patch.rs >> rust/kcl-lib/src/docs/gen_std_tests.rs
//
// ============================================================================

/// Examples as written in the doc comments, with the sketch syntax each uses
/// (`SketchSolve` = `sketch(on = …) { … }` blocks, `Legacy` = `startSketchOn`).
fn build_examples_json(examples: &[(String, ExampleProperties)]) -> Vec<serde_json::Value> {
    examples
        .iter()
        .map(|(code, props)| {
            json!({
                "code": code,
                "sketch_syntax": format!("{:?}", props.sketch_syntax),
            })
        })
        .collect()
}

fn build_function_json(function: &FnData, kcl_std: &ModData) -> serde_json::Value {
    let args = function
        .args
        .iter()
        .map(|arg| {
            json!({
                "name": arg.name,
                "type_": arg.ty,
                "description": arg
                    .docs
                    .clone()
                    .or_else(|| arg.ty.as_ref().and_then(|t| docs_for_type(t, kcl_std)))
                    .unwrap_or_default(),
                "required": arg.kind.required(),
            })
        })
        .collect::<Vec<_>>();

    json!({
        "name": function.preferred_name,
        "qual_name": function.qual_name,
        "module": mod_name_std(&function.module_name),
        "summary": function.summary,
        "description": function.description,
        "deprecated": function.properties.deprecated,
        "deprecated_since": function.properties.deprecated_since.as_ref().map(ToString::to_string),
        "experimental": function.properties.experimental,
        "fn_signature": function.preferred_name.clone() + &function.fn_signature(),
        "args": args,
        "return_value": function.return_type.as_ref().map(|t| {
            json!({
                "type_": t,
                "description": docs_for_type(t, kcl_std).unwrap_or_default(),
            })
        }),
        "examples": build_examples_json(&function.examples),
    })
}

fn build_const_json(cnst: &ConstData, kcl_std: &ModData) -> serde_json::Value {
    json!({
        "name": cnst.preferred_name,
        "qual_name": cnst.qual_name,
        "module": mod_name_std(&cnst.module_name),
        "summary": cnst.summary,
        "description": cnst.description,
        "deprecated": cnst.properties.deprecated,
        "deprecated_since": cnst.properties.deprecated_since.as_ref().map(ToString::to_string),
        "experimental": cnst.properties.experimental,
        "type_": cnst.ty,
        "type_desc": cnst.ty.as_ref().map(|t| docs_for_type(t, kcl_std).unwrap_or_default()),
        "value": cnst.value.as_deref().unwrap_or(""),
        "examples": build_examples_json(&cnst.examples),
    })
}

fn build_type_json(ty: &TyData) -> serde_json::Value {
    // Same rule as `render_type_page`: an alias, else an enum of its variants.
    let definition = if let Some(t) = ty.alias.as_ref() {
        Some(format!("type {} = {t}", ty.preferred_name))
    } else if !ty.variants.is_empty() {
        let arms = ty
            .variants
            .iter()
            .map(|v| format!("  | {}", v.name))
            .collect::<Vec<_>>()
            .join("\n");
        Some(format!("type {} {{\n{arms}\n}}", ty.name))
    } else {
        None
    };

    json!({
        "name": ty.preferred_name,
        "qual_name": ty.qual_name,
        "module": mod_name_std(&ty.module_name),
        "definition": definition,
        "summary": ty.summary,
        "description": ty.description,
        "deprecated": ty.properties.deprecated,
        "deprecated_since": ty.properties.deprecated_since.as_ref().map(ToString::to_string),
        "experimental": ty.properties.experimental,
        "examples": build_examples_json(&ty.examples),
    })
}

fn build_module_json(m: &ModData) -> serde_json::Value {
    json!({
        "name": m.name,
        "qual_name": m.qual_name,
        "module": mod_name_std(&m.module_name),
        "summary": m.summary,
        "description": m.description,
        "experimental": m.properties.experimental,
    })
}

/// Export the KCL standard library documentation as JSON for Tau's
/// api-extractor. `walk_stdlib` (not `walk_prelude`) so non-prelude modules
/// such as `std::solver` — the sketch-block constraint API — are included.
#[test]
fn test_export_stdlib_json() {
    let kcl_std = crate::docs::kcl_doc::walk_stdlib();

    let mut functions = Vec::new();
    let mut types = Vec::new();
    let mut constants = Vec::new();
    let mut modules = Vec::new();

    for d in kcl_std.all_docs() {
        if d.hide() {
            continue;
        }
        match d {
            DocData::Fn(f) => functions.push(build_function_json(f, &kcl_std)),
            DocData::Ty(t) => types.push(build_type_json(t)),
            DocData::Const(c) => constants.push(build_const_json(c, &kcl_std)),
            DocData::Mod(m) => modules.push(build_module_json(m)),
        }
    }
    modules.push(build_module_json(&kcl_std));

    let output = json!({
        "metadata": {
            "version": env!("CARGO_PKG_VERSION"),
        },
        "functions": functions,
        "types": types,
        "constants": constants,
        "modules": modules,
    });

    let json_str = serde_json::to_string_pretty(&output).unwrap();
    expectorate::assert_contents("../../docs/kcl-std/kcl-stdlib-export.json", &json_str);
}
