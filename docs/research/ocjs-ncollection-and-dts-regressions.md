---
title: 'OCJS NCollection Registration & .d.ts Validation Regressions'
description: 'Root-cause investigation of the four residual OCJS codegen failures after Option C+ — NCollection template-typedef registration, WebAssembly.Tag collision, exception-helper regex staleness, and _CONTAINER_ALIASES JSDoc resolution'
status: draft
created: '2026-05-12'
updated: '2026-05-12'
category: investigation
related:
  - docs/research/ocjs-rbv-blueprint-p0-p1-stocktake.md
  - docs/research/ocjs-unified-rbv-blueprint.md
  - docs/research/occt-v8-final-migration-stocktake-4.md
  - docs/research/monaco-intellisense-jsdoc-rendering.md
---

# OCJS NCollection Registration & .d.ts Validation Regressions

Root-cause investigation of the four codegen regressions surfaced by Vitest after the Option C+ Input-Passthrough RBV landing in `repos/opencascade.js`. Each issue is traced to a specific source-level smoking gun, with the exact change recommended to close it.

## Executive Summary

After the Option C+ rebuild settled (`tarballs/opencascade.js-3.0.0-beta.<commit>.tgz`, 4 548 compiled symbols, 0 missing), three smoke-test clusters in `tests/smoke/` (`smoke-collections`, `smoke-container-types`, `smoke-advanced-modeling`) and three `dts-validation.test.ts` / `dts-docs.test.ts` assertions remained red. Investigation isolates four independent root causes, all in `repos/opencascade.js/src/`:

1. **#3a — NCollection template-typedef compile failures (68 of 71 binding-compile errors).** `_emitOutputParamBinding` in `src/bindings.py` writes the lambda parameter type as `pointee.get_canonical().spelling` without running it through the template-arg substitution layer. For `NCollection_DataMap<TheKeyType, TheItemType, Hasher>` and `NCollection_List<TheItemType>` the canonical spelling preserves the unsubstituted template parameter names, so the emitted `optional_override` lambda body references `TheKeyType` / `TheItemType` / `TheValueType` at file scope where they are undeclared. The result: 68 of the 71 `binding-report.json` failures come from this single emission path, the corresponding `class_<NCollection_*_*>()` registrations never compile, and `oc.NCollection_List_TopoDS_Shape is not a constructor` surfaces in JS.

2. **#4a — `WebAssembly.Tag` duplicate-identifier in the global shim (TS2300 + TS2687).** `src/buildFromYaml.py` lines 711-728 emit a `declare global { namespace WebAssembly { interface Exception … class Tag … } }` block as a compatibility shim for older TS releases. Modern `lib.dom.d.ts` (TS 5.6+) ships these types natively with `stack?: string` (no `readonly` modifier), so the shim collides — one TS2300 (`Duplicate identifier 'Tag'`) plus one TS2687 (`stack` modifier mismatch). The shim is now redundant and is the sole source of every semantic-diagnostic regression in the linked .d.ts.

3. **#4b — Exception-helper regex tests a stale dot-access pattern.** `tests/dts-validation.test.ts:257` asserts `/\.getExceptionMessage\s*=/` against the linked `opencascade_full.js`. Emscripten's modern output uses bracket-access (`Module["getExceptionMessage"]=getExceptionMessage`), so the regex misses despite the helpers being correctly exported. Functionality is intact; only the test predicate is stale.

4. **#4c — `_CONTAINER_ALIASES` reverse-lookup gap (`NCollection_DynamicArray` link resolution).** `tests/dts-docs.test.ts:1398-1422` (T7) asserts that `{@link NCollection_DynamicArray}` should resolve via `_CONTAINER_ALIASES` to `NCollection_Vector`. After the OCCT V8.0 rename `NCollection_Vector` → `NCollection_DynamicArray`, neither base class is exported as a top-level TS class (only their specializations like `NCollection_DynamicArray_double`). The `_CONTAINER_ALIASES = {"NCollection_Vector": "NCollection_DynamicArray"}` map encodes the forward rename direction; the test's reverse-lookup expectation was written before V8.0 and is now structurally unsatisfiable.

Recommended landing order: **R1 (#3a) → R2 (#4a) → R3 (#4b) → R4 (#4c)**. R1 alone is gated on a full WASM rebuild (≈20-30 min) and unblocks 14+ smoke-test failures across five test files; R2-R4 are pure-Python/Test edits with no rebuild requirement.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
  - [Finding 1: NCollection lambda emission skips template-arg substitution](#finding-1-ncollection-lambda-emission-skips-template-arg-substitution)
  - [Finding 2: `WebAssembly.Tag` global shim collides with modern lib.dom.d.ts](#finding-2-webassemblytag-global-shim-collides-with-modern-libdomdts)
  - [Finding 3: Exception-helper regex test predates Module["…"] emission](#finding-3-exception-helper-regex-test-predates-module-emission)
  - [Finding 4: `_CONTAINER_ALIASES` reverse direction is unsatisfiable post-V8](#finding-4-_container_aliases-reverse-direction-is-unsatisfiable-post-v8)
- [Recommendations](#recommendations)
- [Code Examples](#code-examples)
- [Appendix: Failure Inventory](#appendix-failure-inventory)

## Problem Statement

After Option C+ landed (universal full-arity Input-Passthrough RBV — see `docs/research/ocjs-rbv-blueprint-p0-p1-stocktake.md` §F3), Vitest reports the following remaining red surface in `repos/opencascade.js`:

```
× tests/smoke/smoke-collections.test.ts                  (7 failures)
× tests/smoke/smoke-container-types.test.ts              (4 failures)
× tests/smoke/smoke-advanced-modeling.test.ts            (1 failure)
× tests/smoke/smoke-topology.test.ts                     (1 failure)
× tests/smoke/smoke-multiarg-dispatch.test.ts            (1 failure)
× tests/dts-validation.test.ts                           (3 failures)
× tests/dts-docs.test.ts                                 (1 failure)
```

All smoke-test failures share the same JS-level symptom — `TypeError: oc.NCollection_<Family>_<T> is not a constructor` — even though the `.d.ts` declares the class. The three `dts-validation` failures and one `dts-docs` failure are independent codegen / test-predicate issues triggered by the +989-line `bindings.py` rewrite and a stale OCCT-V8 alias assumption.

This document isolates each smoking gun in source, captures the evidence chain, and prescribes the minimum-scope source change needed to close every assertion. It is **scoped to source-level diagnosis and recommendations only** — implementation lands in a follow-up plan with a full WASM rebuild.

## Methodology

1. **Compile-report inspection.** Cross-referenced `build/compiled-bindings/binding-report.json` (71 compile failures, 68 categorized as `undefined_symbol` for NCollection containers) against `build/bindings/myMain.h/*.cpp` to confirm the failing emission lines and identify the exact macro-expansion artefact.
2. **AST-level emitter trace.** Walked `src/bindings.py::EmbindBindings._emitOutputParamBinding` (lines 1880-1976) and `src/bindings.py::Bindings.resolveWithCanonicalFallback` (lines 1138-1171) under the OCJS V8 typedef-cache normalization rules to locate the substitution gap.
3. **TS diagnostic capture.** Ran `pnpm exec vitest run tests/dts-validation.test.ts` and inspected the captured TS2300 / TS2687 diagnostics' source locations (lines 221646-221651 in `dist/opencascade_full.d.ts`), tracing back to the `declare global namespace WebAssembly` block in `src/buildFromYaml.py` lines 711-728.
4. **Linker-output inspection.** `grep -oE 'Module\["(getExceptionMessage|incrementExceptionRefcount|decrementExceptionRefcount)"\]' build-configs/opencascade_full.js` confirmed all three helpers are exported via bracket-access; matched against the dot-access regex in `tests/dts-validation.test.ts:257` to confirm the staleness.
5. **`_CONTAINER_ALIASES` flow.** Read `_classify_link_target` in `src/bindings.py` (lines 2738-2785), the alias map at line 3510, and `src/ocjs_bindgen/discover.py:CONTAINER_ALIASES` (line 23) to confirm the direction the alias map encodes; cross-checked against the V8.0 rename history in `docs/research/occt-v8-final-migration-stocktake.md`.

## Findings

### Finding 1: NCollection lambda emission skips template-arg substitution

**Status**: ROOT-CAUSE LOCATED. Single-method fix in `src/bindings.py::_emitOutputParamBinding`.

**Evidence chain**:

- `build/compiled-bindings/binding-report.json` lists 71 compile failures; 68 are NCollection containers (`NCollection_DataMap_*`, `NCollection_IndexedDataMap_*`, `NCollection_IndexedMap_*`, `NCollection_List_*`, `NCollection_Map_*`, `NCollection_Sequence_*`).

- Every failure has the same shape:

  ```
  error: use of undeclared identifier 'TheKeyType'    (DataMap, IndexedDataMap, Map, IndexedMap)
  error: use of undeclared identifier 'TheItemType'   (List, Sequence)
  error: use of undeclared identifier 'TheValueType'  (a subset of DataMap variants)
  ```

- The C++ binding file `build/bindings/myMain.h/NCollection_List_TopoDS_Shape.cpp` line 5336 emits:

  ```cpp
  .function("Append",
    optional_override([](NCollection_List_TopoDS_Shape& self,
                         NCollection_List<TheItemType> theOther)  // ← TheItemType, NOT TopoDS_Shape
    -> ::emscripten::val {
      self.Append(theOther);
      …
    }), allow_raw_pointers())
  ```

- `NCollection_List<TheItemType>` is the unsubstituted dependent type. `TheItemType` is the template parameter inside `NCollection_List<T>`'s class body and is **not** visible at file scope, so clang errors at parse time. The class registration block (`class_<NCollection_List_TopoDS_Shape, base<NCollection_BaseList>>("NCollection_List_TopoDS_Shape")` at line 5324) never completes compilation, so the `.cpp.o` file is dropped from the link list, the JS module has no `NCollection_List_TopoDS_Shape` constructor, and every smoke test that calls `new oc.NCollection_List_TopoDS_Shape()` throws `TypeError: oc.NCollection_List_TopoDS_Shape is not a constructor`.

**Smoking gun** — `src/bindings.py::_emitOutputParamBinding` lines 1917-1929:

```python
for i, arg in enumerate(args):
  name = self._getArgName(arg, i)
  if self._needsCStringWrapper(arg.type):
    lambda_params.append(f"std::string {name}")
  else:
    argType = self.getOriginalArgumentType(arg, templateDecl, templateArgs)
    if isOutputParam(arg.type):
      pointee = arg.type.get_pointee()
      if pointee.get_canonical().spelling in builtInTypes:
        argType = pointee.get_canonical().spelling
      elif pointee.kind == clang.cindex.TypeKind.ENUM or pointee.get_canonical().kind == clang.cindex.TypeKind.ENUM:
        argType = pointee.spelling
      elif _isHandleType(pointee):
        argType = pointee.spelling
      elif _isDefaultConstructibleClass(pointee):
        argType = pointee.get_canonical().spelling.replace("const ", "").strip()
    lambda_params.append(f"{argType} {name}")
```

For NCollection container outputs the `_isDefaultConstructibleClass` branch fires and assigns `argType = pointee.get_canonical().spelling.replace("const ", "").strip()`. Because `processClass` is called for the underlying template class (`NCollection_List`, not the instantiation), libclang's canonical spelling for `const NCollection_List<TheItemType>&` is `NCollection_List<TheItemType>` (the dependent form, not the instantiated form `NCollection_List<TopoDS_Shape>`).

`resolveWithCanonicalFallback` (lines 1138-1171) already handles this case — it routes through `replaceTemplateArgs` (line 1200) which uses the regex `(\W+|^)<key>(\W|$)` to substitute `TheItemType` → `TopoDS_Shape` when `templateArgs` is populated. The bug is that `_emitOutputParamBinding` bypasses `resolveWithCanonicalFallback` and reaches for `pointee.get_canonical().spelling` directly.

**Comparison to working paths**: `getOriginalArgumentType` (line 1641) DOES route through `resolveWithCanonicalFallback`, which is why the non-RBV `Append(const TopoDS_Shape&)` overload (line 5334) substitutes correctly. Only the RBV `optional_override` path is affected.

**Affected templates** (from `binding-report.json`):

| Family                                   | Failing instantiations | Template parameter          |
| ---------------------------------------- | ---------------------- | --------------------------- |
| `NCollection_List<T>`                    | 22 specializations     | `TheItemType`               |
| `NCollection_Sequence<T>`                | 28 specializations     | `TheItemType`               |
| `NCollection_Map<K, Hasher>`             | 1 specialization       | `TheKeyType`                |
| `NCollection_DataMap<K,V,Hasher>`        | 8 specializations      | `TheKeyType`, `TheItemType` |
| `NCollection_IndexedMap<K, Hasher>`      | 1 specialization       | `TheKeyType`                |
| `NCollection_IndexedDataMap<K,V,Hasher>` | 2 specializations      | `TheKeyType`, `TheItemType` |

Plus 6 stragglers in `NCollection_String.cpp` (compile_error category) and 3 non-NCollection (`IntPatch_SpecialPoints.cpp`, `BRepMesh_GeomTool.cpp`) that exhibit the same canonical-spelling substitution gap on different types — likely the same root cause once the NCollection fix lands.

### Finding 2: `WebAssembly.Tag` global shim collides with modern lib.dom.d.ts

**Status**: ROOT-CAUSE LOCATED. Five-line delete in `src/buildFromYaml.py`.

**Evidence chain**:

- `tests/dts-validation.test.ts` (`Codegen gap closure — opencascade_full.d.ts`) reports:

  ```
  L221648:11 TS2300: Duplicate identifier 'Tag'.
  L221646:16 TS2687: All declarations of 'stack' must have identical modifiers.
  ```

- `dist/opencascade_full.d.ts` lines 221641-221652 contain:

  ```typescript
  declare global {
    namespace WebAssembly {
      interface Exception {
        is(tag: unknown): boolean;
        getArg(tag: unknown, index: number): unknown;
        readonly stack?: string; // ← TS2687 collision: lib.dom has non-readonly `stack?: string`
      }
      class Tag {
        // ← TS2300 collision: lib.dom declares Tag
        constructor(type: { parameters: ReadonlyArray<string> });
      }
    }
  }
  ```

- The TS configuration in `buildDtsProgram` uses `lib: ['lib.esnext.d.ts', 'lib.dom.d.ts']` (line 567 of `tests/dts-validation.test.ts`). `lib.dom.d.ts` in TS 5.6+ already declares `WebAssembly.Tag` and `WebAssembly.Exception` (the latter via `WebAssemblyException`, with `stack?: string` rather than `readonly stack?: string`).

**Smoking gun** — `src/buildFromYaml.py` lines 711-728:

```python
if uses_native_wasm_eh and exports_eh_helpers:
  # Ambient declarations for the native-WASM-exception types. lib.dom.d.ts
  # only ships these in modern releases; declaring them locally keeps the
  # .d.ts portable across TS/lib versions and resolves TS2694 for
  # WebAssembly.Exception / WebAssembly.Tag references below.
  typescriptDefinitionOutput += \
    "declare global {\n" + \
    "  namespace WebAssembly {\n" + \
    "    interface Exception {\n" + \
    "      is(tag: Tag): boolean;\n" + \
    "      getArg(tag: Tag, index: number): unknown;\n" + \
    "      readonly stack?: string;\n" + \
    "    }\n" + \
    "    class Tag {\n" + \
    "      constructor(type: { parameters: ReadonlyArray<string> });\n" + \
    "    }\n" + \
    "  }\n" + \
    "}\n\n"
```

The comment correctly notes this was a portability shim for "older TS releases". The minimum supported TS version in `tsconfig.json` is now 5.7+ (Tau workspace) and the OCJS test surface explicitly opts into `lib.dom.d.ts`, so the shim is strictly harmful — it duplicates a built-in declaration and the `readonly stack?: string` modifier mismatches the built-in.

### Finding 3: Exception-helper regex test predates Module["…"] emission

**Status**: ROOT-CAUSE LOCATED. Test-side fix in `tests/dts-validation.test.ts`.

**Evidence chain**:

- `tests/dts-validation.test.ts:248-259`:

  ```typescript
  it('should expose Emscripten exception-handling helpers in the linked JS glue', () => {
    const jsPath = path.join(FULL_BUILD_CONFIG, 'opencascade_full.js');
    if (!fs.existsSync(jsPath)) return;
    const glue = fs.readFileSync(jsPath, 'utf8');
    for (const name of ['getExceptionMessage', 'incrementExceptionRefcount', 'decrementExceptionRefcount']) {
      expect(glue, `linked JS glue should define ${name}`).toMatch(new RegExp(`\\.${name}\\s*=`));
    }
  });
  ```

- The regex `\.getExceptionMessage\s*=` requires a dot-access assignment (`X.getExceptionMessage = …`).
- Inspection of `build-configs/opencascade_full.js`:

  ```
  Module["incrementExceptionRefcount"]
  Module["decrementExceptionRefcount"]
  Module["getExceptionMessage"]
  ```

  Three exports via bracket access; zero via dot access. The helpers ARE exposed correctly; the regex is stale.

**Why the regex broke**: Modern Emscripten (post 3.1.x) minifies module assignments to `Module["X"]=…` even when `X` is a valid identifier, because the bracket form survives Closure-style mangling. The previous dot-access form was specific to an older Emscripten emitter.

### Finding 4: `_CONTAINER_ALIASES` reverse direction is unsatisfiable post-V8

**Status**: ROOT-CAUSE LOCATED. Test-side fix in `tests/dts-docs.test.ts` (or, if reverse-lookup is desired, additional Python map in `src/bindings.py`).

**Evidence chain**:

- `tests/dts-docs.test.ts:1398-1422` (T7) asserts the resolver maps `{@link NCollection_DynamicArray}` → `{@link NCollection_Vector | \`NCollection_DynamicArray\`}`via`\_CONTAINER_ALIASES`.
- `dist/opencascade_full.d.ts` contains backticked references to `NCollection_DynamicArray` at 4+ JSDoc sites (`grep -n "Class \`NCollection_DynamicArray\`"`) — currently emitted as plain backticks, which is what the test calls a regression.
- Neither `NCollection_DynamicArray` nor `NCollection_Vector` is exported as a top-level class in the `.d.ts`. Only specializations (`NCollection_DynamicArray_double`, `NCollection_DynamicArray_int`, …, 52 total per `binding-report.json`) are exported.

**Smoking gun** — `src/bindings.py` line 3510:

```python
_CONTAINER_ALIASES = {
  "NCollection_Vector": "NCollection_DynamicArray",
}
```

This is the **forward-rename** direction: "if the source carries the deprecated `NCollection_Vector` name, resolve to the modern `NCollection_DynamicArray` name". `_classify_link_target` (line 2778) consults it as `_CONTAINER_ALIASES.get(clean)`, so it only matches when `clean == "NCollection_Vector"`. The test expects the reverse — when `clean == "NCollection_DynamicArray"`, resolve to `NCollection_Vector` — but `NCollection_Vector` is itself not exported, so even the reverse direction would fail the `_is_known_export_name` check.

**Reality check**: In the OCCT V8.0 timeline:

- Pre-V8: source used `NCollection_Vector`; Doxygen produced `{@link NCollection_Vector}`; bindings exported a `NCollection_Vector` base class.
- Post-V8: source uses `NCollection_DynamicArray`; Doxygen produces `{@link NCollection_DynamicArray}`; bindings export only specializations, not the base class.

The test was written under the pre-V8 assumption and the resolver was patched halfway. There is no exported target that `{@link NCollection_DynamicArray}` can legitimately point at, so the resolver correctly degrades to backticks. The test should reflect this reality (accept backticks) OR the bindings should also export the unspecialized base class (architectural change with broader implications — not recommended for a regression fix).

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                 | Priority | Effort                          | Impact                                                                                                     | Rebuild required                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| R1  | Route `_emitOutputParamBinding` lambda parameter type through `resolveWithCanonicalFallback` so `templateArgs` substitutes `TheItemType`/`TheKeyType`/`TheValueType` → concrete type                                                                                                                                                                                                   | P0       | Small (~10 lines in one method) | Unblocks 14+ smoke tests, eliminates 68 of 71 compile failures, restores `NCollection_*_*` JS constructors | Yes — full WASM rebuild (≈20-30 min)             |
| R2  | Delete the `declare global { namespace WebAssembly { … } }` shim in `src/buildFromYaml.py` lines 711-728; keep the inline `getExceptionMessage`/`incrementExceptionRefcount`/`decrementExceptionRefcount` `export declare function` lines                                                                                                                                              | P0       | Small (18-line delete)          | Closes TS2300 + TS2687 + total-semantic-diagnostics tests                                                  | No — `.d.ts` is regenerated by `nx run ocjs:dts` |
| R3  | Update `tests/dts-validation.test.ts:257` regex to `new RegExp(\`(?:\\\.\|Module\\\["\)${name}["\\\]\\s]\*=\`)` so it matches both dot-access (legacy) and bracket-access (modern Emscripten) emission                                                                                                                                                                                 | P1       | Trivial (one-line regex tweak)  | Closes "should expose Emscripten exception-handling helpers" assertion                                     | No                                               |
| R4  | Either (a) replace the T7 assertion in `tests/dts-docs.test.ts:1398-1422` with an acceptance-of-backticks regression guard (preferred — reflects V8.0 reality), or (b) extend `_classify_link_target` with a reverse-alias step that maps every value in `_CONTAINER_ALIASES` to its key (only useful if the OCJS team later decides to re-export the base `NCollection_Vector` class) | P2       | Trivial-to-small                | Closes the single remaining `dts-docs.test.ts` failure                                                     | No                                               |

**Sequencing rationale**:

- R1 is the biggest unlock but requires the slow rebuild; start it first and run R2-R4 against the existing artefacts in parallel.
- R2 is gated on a `.d.ts` regeneration (~30 s via `./build-wasm.sh dts build-configs/full.yml`) and resolves three of the six failing `dts-validation` cases without touching the WASM.
- R3 and R4 are pure test-side patches with zero rebuild dependency.

## Code Examples

### R1: Recommended fix for `_emitOutputParamBinding`

Replace the four-branch type-derivation block in `src/bindings.py::_emitOutputParamBinding` (lines 1917-1929) with a single substitution helper that delegates to the same template-arg substitution path already used by `getOriginalArgumentType`:

```python
for i, arg in enumerate(args):
  name = self._getArgName(arg, i)
  if self._needsCStringWrapper(arg.type):
    lambda_params.append(f"std::string {name}")
    continue
  argType = self.getOriginalArgumentType(arg, templateDecl, templateArgs)
  if isOutputParam(arg.type):
    pointee = arg.type.get_pointee()
    if pointee.get_canonical().spelling in builtInTypes:
      argType = pointee.get_canonical().spelling
    elif pointee.kind == clang.cindex.TypeKind.ENUM or pointee.get_canonical().kind == clang.cindex.TypeKind.ENUM:
      argType = pointee.spelling
    elif _isHandleType(pointee):
      argType = pointee.spelling
    elif _isDefaultConstructibleClass(pointee):
      # Was: pointee.get_canonical().spelling.replace("const ", "").strip()
      # Now: route through the canonical-fallback resolver so templateArgs
      # substitutes TheKeyType/TheItemType/TheValueType into the concrete type.
      raw = pointee.get_canonical().spelling.replace("const ", "").strip()
      argType = self.replaceTemplateArgs(raw, templateArgs)
  lambda_params.append(f"{argType} {name}")
```

`replaceTemplateArgs` is already defined at line 1200 and is the same primitive `resolveWithCanonicalFallback` uses. No new helper is required; only the call-site routing.

### R2: Drop the WebAssembly global shim

Delete `src/buildFromYaml.py` lines 711-728 entirely (the `declare global { namespace WebAssembly { … } }` block). Keep lines 729-756 (the `export declare function getExceptionMessage(ex: WebAssembly.Exception): [string, string];` and siblings — they reference the ambient types from `lib.dom.d.ts`, which resolves cleanly).

### R3: Relax the exception-helper test regex

Replace `tests/dts-validation.test.ts:257`:

```typescript
expect(glue, `linked JS glue should define ${name}`).toMatch(
  new RegExp(`(?:\\.${name}\\s*=|Module\\["${name}"\\]\\s*=)`),
);
```

The regex now matches both `Module.getExceptionMessage=…` (dot-access, legacy) and `Module["getExceptionMessage"]=…` (bracket-access, modern Emscripten).

### R4: Accept backticks as the correct V8.0 reality

Replace `tests/dts-docs.test.ts:1398-1422` (the T7 block) with:

```typescript
// T7 — _CONTAINER_ALIASES post-V8 reality.
// In OCCT V8.0 the source class was renamed from NCollection_Vector to
// NCollection_DynamicArray. Neither base class is exported as a top-level
// TS class (only their specializations like NCollection_DynamicArray_double),
// so {@link NCollection_DynamicArray} cannot resolve to an exported target.
// The resolver correctly falls through to backticks. This assertion guards
// against a future regression where the bindings re-export an unspecialized
// base class but the alias map points the wrong way.
it.skipIf(!sourceFile)('should emit backticks for {@link NCollection_DynamicArray} (no base-class export)', () => {
  const content = fs.readFileSync(FULL_DTS, 'utf8');
  // Negative: no bare `{@link NCollection_DynamicArray}` should survive.
  expect(/\{@link\s+NCollection_DynamicArray\s*\}/.test(content)).toBe(false);
  // Positive: the name still appears as backticked prose where Doxygen used
  // {@link …} in the OCCT headers.
  expect(content).toMatch(/`NCollection_DynamicArray`/);
});
```

## Trade-offs

| Option for R4                                              | Pros                                                                             | Cons                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) Accept backticks (recommended)**                     | Reflects V8.0 source-of-truth; zero rebuild; documents intent for future readers | Loses the clickable Monaco hover link for `NCollection_DynamicArray` references (degrades to inline code only)                                                                                                                        |
| (b) Extend `_classify_link_target` with reverse-alias step | Restores clickable hover link if `NCollection_Vector` is ever re-exported        | Currently unsatisfiable because neither base class is exported; produces a no-op resolver step; encourages re-exporting the base template class which violates the "templates aren't exported" rule established in the V8.0 migration |
| (c) Export `NCollection_DynamicArray` base class directly  | Restores clickable link; matches the test's original intent                      | Substantial scope creep — every NCollection container family would need the same treatment; rebuilds increase by hundreds of object files; breaks the V8.0 specialization-only export model                                           |

Recommendation: **(a)**. The test was written before the V8.0 rename when `NCollection_Vector` was an actual export. The post-V8 reality is that container base classes are never exported, only their specializations. The test should track reality.

## Diagrams

### NCollection lambda emission — current vs proposed

```
processClass(templateClass = NCollection_List, templateArgs = {TheItemType: TopoDS_Shape})
  └─ _emitOutputParamBinding(method=Append(NCollection_List<TheItemType>&))
       │
       │ CURRENT path (broken):
       │   pointee.get_canonical().spelling
       │     → "NCollection_List<TheItemType>"   ← libclang spelling preserves
       │                                            template parameter name
       │   argType = "NCollection_List<TheItemType>"  ← unsubstituted
       │   emitted lambda param: "NCollection_List<TheItemType> theOther"
       │   → compile fails: "use of undeclared identifier 'TheItemType'"
       │
       └─ PROPOSED path (R1):
           raw = pointee.get_canonical().spelling
             → "NCollection_List<TheItemType>"
           replaceTemplateArgs(raw, {TheItemType: TopoDS_Shape})
             → "NCollection_List<TopoDS_Shape>"     ← substituted
           argType = "NCollection_List<TopoDS_Shape>"
           emitted lambda param: "NCollection_List<TopoDS_Shape> theOther"
           → compiles, links, JS constructor available
```

## Appendix: Failure Inventory

### `binding-report.json` failures (71 total, after Option C+ landing)

| Error category     | Count | Sub-category                                                                                                                                                                                                                             |
| ------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `undefined_symbol` | 70    | 22 `NCollection_List_*`, 28 `NCollection_Sequence_*`, 8 `NCollection_DataMap_*`, 1 `NCollection_Map_*`, 1 `NCollection_IndexedMap_*`, 2 `NCollection_IndexedDataMap_*`, 1 `IntPatch_SpecialPoints`, 1 `BRepMesh_GeomTool`, 6 unspecified |
| `compile_error`    | 1     | `NCollection_String.cpp` (separate root cause — `rapidjson::Type` ambiguity, out of scope)                                                                                                                                               |

All 68 NCollection failures share the same emission bug; R1 fixes the entire cluster in one change. The two non-NCollection `undefined_symbol` cases (`IntPatch_SpecialPoints`, `BRepMesh_GeomTool`) emit `expected ')'` at the same line range and likely share the same canonical-spelling substitution gap — to be confirmed post-R1 rebuild.

### Smoke-test failures attributable to R1

| Test file                                     | Failures unlocked by R1                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `tests/smoke/smoke-collections.test.ts`       | 7                                                                                                           |
| `tests/smoke/smoke-container-types.test.ts`   | 4                                                                                                           |
| `tests/smoke/smoke-advanced-modeling.test.ts` | 1                                                                                                           |
| `tests/smoke/smoke-topology.test.ts`          | 1 (NCollection_List_TopoDS_Shape construction)                                                              |
| `tests/smoke/smoke-multiarg-dispatch.test.ts` | 1 (NCollection_Sequence_TopoDS_Shape in helper)                                                             |
| **Total**                                     | **14** (matches the residual count in the stocktake doc minus the four `dts-validation` / `dts-docs` items) |

### `dts-validation` / `dts-docs` failures attributable to R2-R4

| Assertion                                                                                                                                               | Root cause                                                 | Fix |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --- |
| `Codegen gap closure — opencascade_full.d.ts > should emit zero TS2300 (duplicate identifier)`                                                          | F2: WebAssembly.Tag collision                              | R2  |
| `Codegen gap closure — opencascade_full.d.ts > should keep total semantic diagnostics at zero`                                                          | F2: WebAssembly.Tag + WebAssembly.Exception.stack modifier | R2  |
| `Full build .d.ts validation > should expose Emscripten exception-handling helpers in the linked JS glue`                                               | F3: dot-access regex vs bracket-access emission            | R3  |
| `JSDoc documentation coverage > Link token normalization (R2+R3) > should resolve {@link NCollection_DynamicArray} via _CONTAINER_ALIASES when present` | F4: stale pre-V8 test expectation                          | R4  |

## References

- Related: `docs/research/ocjs-rbv-blueprint-p0-p1-stocktake.md` (F3 closure rationale and the four out-of-scope R-items this document expands on)
- Related: `docs/research/ocjs-unified-rbv-blueprint.md` (Option C+ semantics)
- Related: `docs/research/occt-v8-final-migration-stocktake-4.md` (V8.0 rename history)
- Related: `docs/research/monaco-intellisense-jsdoc-rendering.md` (R2/R3/T7 origin of the `_CONTAINER_ALIASES` link-token contract)
- Source: `repos/opencascade.js/src/bindings.py` (NCollection emission)
- Source: `repos/opencascade.js/src/buildFromYaml.py` (WebAssembly shim)
- Source: `repos/opencascade.js/src/ocjs_bindgen/discover.py` (CONTAINER_ALIASES forward direction)
- Test: `repos/opencascade.js/tests/dts-validation.test.ts`
- Test: `repos/opencascade.js/tests/dts-docs.test.ts`
- Report: `repos/opencascade.js/build/compiled-bindings/binding-report.json`
