// ============================================================================
// JSON EXPORT PATCH FOR ZOO KCL REPO
// ============================================================================
//
// This file contains the code additions needed for the Zoo Modeling App
// repository to export KCL standard library documentation as JSON.
//
// Add this code to: rust/kcl-lib/src/docs/gen_std_tests.rs
//
// ============================================================================

// -----------------------------------------------------------------------------
// STEP 1: Add these helper functions AFTER the `docs_for_type()` function
//         (around line 377 in the original file)
// -----------------------------------------------------------------------------

// ============================================================================
// JSON Export Helpers
// These functions build JSON objects that can be reused for both template
// rendering and JSON export for external tools.
// ============================================================================

/// Build JSON for a function (used by template rendering and JSON export)
fn build_function_json(function: &FnData, kcl_std: &ModData) -> serde_json::Value {
    let args = function
        .args
        .iter()
        .map(|arg| {
            let docs = arg.docs.clone();
            json!({
                "name": arg.name,
                "type_": arg.ty,
                "description": docs.or_else(|| arg.ty.as_ref().and_then(|t| docs_for_type(t, kcl_std))).unwrap_or_default(),
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
        "experimental": function.properties.experimental,
        "fn_signature": function.preferred_name.clone() + &function.fn_signature(),
        "args": args,
        "return_value": function.return_type.as_ref().map(|t| {
            json!({
                "type_": t,
                "description": docs_for_type(t, kcl_std).unwrap_or_default(),
            })
        }),
    })
}

/// Build JSON for a constant (used by template rendering and JSON export)
fn build_const_json(cnst: &ConstData, kcl_std: &ModData) -> serde_json::Value {
    json!({
        "name": cnst.preferred_name,
        "qual_name": cnst.qual_name,
        "module": mod_name_std(&cnst.module_name),
        "summary": cnst.summary,
        "description": cnst.description,
        "deprecated": cnst.properties.deprecated,
        "experimental": cnst.properties.experimental,
        "type_": cnst.ty,
        "type_desc": cnst.ty.as_ref().map(|t| docs_for_type(t, kcl_std).unwrap_or_default()),
        "value": cnst.value.as_deref().unwrap_or(""),
    })
}

/// Build JSON for a type (used by template rendering and JSON export)
fn build_type_json(ty: &TyData) -> serde_json::Value {
    json!({
        "name": ty.preferred_name,
        "qual_name": ty.qual_name,
        "module": mod_name_std(&ty.module_name),
        "definition": ty.alias.as_ref().map(|t| format!("type {} = {t}", ty.preferred_name)),
        "summary": ty.summary,
        "description": ty.description,
        "deprecated": ty.properties.deprecated,
        "experimental": ty.properties.experimental,
    })
}

/// Build JSON for a module (used by template rendering and JSON export)
fn build_module_json(m: &ModData) -> serde_json::Value {
    json!({
        "name": m.name,
        "qual_name": m.qual_name,
        "module": mod_name_std(&m.module_name),
        "summary": m.summary,
        "description": m.description,
    })
}

// -----------------------------------------------------------------------------
// STEP 2: Add this test function AFTER `test_generate_stdlib_markdown_docs()`
//         (around line 631 in the original file, after the closing brace)
// -----------------------------------------------------------------------------

/// Export the KCL standard library documentation to JSON format.
/// This JSON file can be consumed by external tools (like Tau's api-extractor)
/// to generate documentation in various formats.
#[test]
fn test_export_stdlib_json() {
    let kcl_std = crate::docs::kcl_doc::walk_prelude();

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
    // Add the root std module
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
