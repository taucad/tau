---
title: 'OCJS Libembind Patch Hygiene + Path B Canonicalization (Phase 0)'
description: 'Phase 0 execution log for the OCJS optional-overload migration: reset libembind.js to a vendored pristine snapshot on every build, fold Path B (primitive-priority `$getSignature` fallback) into the canonical patch as Hunk 4, hash-verify both ends of the pipeline, and add a CI sentinel that fails loudly on regression.'
status: draft
created: '2026-05-28'
updated: '2026-05-28'
category: implementation
related:
  - docs/research/ocjs-optional-overload-strategic-review-opus-4-7.md
  - docs/research/ocjs-optional-overload-strategic-review-gpt-5-5.md
  - docs/research/ocjs-optional-overload-poc-coverage-gaps.md
  - docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md
  - docs/research/ocjs-libembind-strategic-direction-assessment.md
  - repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md
---

# OCJS Libembind Patch Hygiene + Path B Canonicalization (Phase 0)

## Executive Summary

Phase 0 of the OCJS optional-overload migration is complete. The libembind patch pipeline is now idempotent at the file level (not merely the patch-hash level), and Path B — the primitive-priority `$getSignature` fallback that survived only as a manual hot-edit on the compiled artefact — is now a canonical fourth hunk of `src/patches/libembind-overloading.patch`. Verification:

- `bash build-wasm.sh apply-patches` is byte-deterministic across invocations (`sha256: e3de51923e84b697b212c4a12586c64174448b695128e772f2f0fd5a577db582`).
- Deleting `deps/emsdk/upstream/emscripten/src/lib/libembind.js` and re-running the step reproduces the same hash.
- Re-running the step on the already-patched file (and on a corruption-injected file) also reproduces the same hash — the pristine reset always wins.
- The new sentinel `tests/sentinel/test_libembind_patch_hygiene.py` (7 tests) enforces all of: pristine SHA256, post-patch SHA256, exactly-one `$getSignature` / `$ensureOverloadTable`, canonical-hunk markers present, forbidden-hunk markers absent, and apply-twice byte-identity.

The fork commitment is now bounded to four conceptual hunks (arity-pad in `$ensureOverloadTable`, arity-pad in the ctor dispatcher, optional-wildcard short-circuit in `$getSignature`, Path B primitive-priority fallback in `$getSignature`). Hunks 5 (cross-arity type-aware fallback) and 6 (concrete-beats-wildcard precedence) are explicitly forbidden by the policy doc and excluded from the patch; the sentinel guards against their reintroduction.

## Files Written / Updated

| Path                                                                     | Action   | Notes                                                                                                                                                                                                             |
| ------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repos/opencascade.js/src/patches/libembind-overloading.patch`           | replaced | 4-canonical-hunk diff (14 `@@` chunks against pristine — Hunks 1/2/3 carried forward verbatim + Hunk 4 Path B added inline in `$getSignature`); applies cleanly with `patch -p0 -N` without `--ignore-whitespace` |
| `repos/opencascade.js/src/patches/libembind-overloading.expected.sha256` | new      | `e3de51923e84b697b212c4a12586c64174448b695128e772f2f0fd5a577db582`                                                                                                                                                |
| `repos/opencascade.js/src/vendor/pristine-libembind.js`                  | new      | Vendored emscripten 5.0.1 `src/lib/libembind.js` fetched from `https://raw.githubusercontent.com/emscripten-core/emscripten/5.0.1/src/lib/libembind.js`                                                           |
| `repos/opencascade.js/src/vendor/pristine-libembind.expected.sha256`     | new      | `a66376cf4391c3f60bb9c4e1700cfb333c97aa514afe41dd3adfecca8fdab4a0`                                                                                                                                                |
| `repos/opencascade.js/build-wasm.sh`                                     | edited   | `step_patch_embind` rewritten — pristine snapshot reset + dual SHA256 verification + hard-fail on drift                                                                                                           |
| `repos/opencascade.js/tests/sentinel/test_libembind_patch_hygiene.py`    | new      | 7 sentinel tests covering pristine fidelity, patch-applies-clean, post-patch hash, single-definitions, canonical hunks present, forbidden hunks absent, idempotency                                               |

Out of scope (per Phase 0 contract): no changes to `src/ocjs_bindgen/**`, no changes to `build/bindings/**`, no changes to YAML configs or NX graph.

## Pristine Recovery — How the Corrupted State Was Diagnosed and Recovered

### Diagnosis

`rg -n '^\s*\$getSignature:\s' deps/emsdk/upstream/emscripten/src/lib/libembind.js` returned **5** matches at lines 59, 169, 239, 309, 388. `rg -n '^\s*\$ensureOverloadSignatureTable__deps:'` returned 5 matches at lines 141, 211, 281, 360, 439 (parallel duplication of the supporting helper). Only the LAST `$getSignature` definition is observable at runtime — JS object-property semantics keep only the last value for any duplicate key. The 5-copy state is the smoking-gun confirmation of `ocjs-optional-overload-poc-coverage-gaps.md` §Finding 6 extended.

Inspecting the live (last) `$getSignature` (line 388) revealed it carries Hunk 3 (optional-wildcard short-circuit) but does NOT carry Path B. The FIRST shadowed copy (line 59) carries a more evolved variant with a `$cppTypeToJsTypeNameTable` lookup table plus an explicit Path A / Path B comment block — i.e. successive patch revisions wrote conceptually distinct `$getSignature` bodies, the build appended each new revision instead of replacing it, and the most-recent revision lacks the Path B logic the prior revisions had. This is exactly the "non-deterministic dispatch across machines" failure mode the policy doc warns about: a fresh CI machine would start from a patch with Hunk 3 only; a long-running dev machine would have Path B because of an earlier hot-edit; both are "patched" but behave differently.

The shadowed `$ensureOverloadTable` (line 469 of the live file) also contained a forbidden Hunk 5 (cross-arity type-aware fallback) hot-edit — an `_exactSigOk` two-stage dispatch that enumerates every registered arity ≥ call arity and re-scans by signature. The sentinel explicitly forbids this code shape going forward.

### Recovery

`deps/emsdk/` is NOT a git submodule and does NOT have an `upstream/` subtree under git control (only `deps/emsdk/.git/` exists at the top level, containing an `emscripten-releases-tags.json` and `.flake8` from the emsdk metarepo). There was no in-tree pristine to `git restore` from.

`deps/emsdk/upstream/emscripten/emscripten-version.txt` pins the active emscripten to `"5.0.1"`. The pristine `src/lib/libembind.js` for that exact tag was fetched from `https://raw.githubusercontent.com/emscripten-core/emscripten/5.0.1/src/lib/libembind.js` (2364 lines, sha256 `a66376cf4391c3f60bb9c4e1700cfb333c97aa514afe41dd3adfecca8fdab4a0`) and vendored to `repos/opencascade.js/src/vendor/pristine-libembind.js` with a sidecar `pristine-libembind.expected.sha256` hash file. The vendored snapshot lives inside the repo precisely so the build does not depend on network availability at patch time.

Pristine sanity-check: searching the fetched file for OCJS marker strings (`Gate-1 hunk`, `$cppTypeToJsType`, `register_optional`) returns zero matches, confirming it carries no prior OCJS patch state.

## Expected Libembind Construction — Hunk-By-Hunk

The expected post-patch libembind was constructed in `/tmp/phase0-work/upstream/emscripten/src/lib/libembind.js` (out-of-tree working copy) by:

1. Copying the vendored pristine.
2. Applying the prior `src/patches/libembind-overloading.patch` with `patch -p0 -N --ignore-whitespace` (the `--ignore-whitespace` was needed for the historical patch only; the regenerated patch applies without it). The prior patch carries Hunks 1, 2, 3 — these were retained verbatim.
3. Editing the `$getSignature` body inline to add Path B (Hunk 4).
4. Diffing pristine → expected with `diff -u --label "src/lib/libembind.js" --label "src/lib/libembind.js"` to regenerate the canonical patch.

### Hunk 1 — arity-pad in `$ensureOverloadTable`

Anchor: inside the `$ensureOverloadTable` generated wrapper, immediately before the `// TODO This check can be removed in -O3 level "unsafe" optimizations.` comment that guards the original throw.

Body: when `proto[methodName].overloadTable[args.length]` has no entry, scan every registered arity strictly greater than `args.length`, pick the smallest such arity, and pad `args` with trailing `undefined`s up to that arity. Downstream `register_optional<T>::toWireType(undefined)` → `std::nullopt`, which the binding lambda's `.value_or()` unwraps to the C++ default.

Marker: `Gate-1 hunk 1: trailing-arg arity padding`.

Rule-5 compliance: this hunk does NOT reorder the dispatch search; it only widens the set of arities that resolve. Once a match is found, normal first-match-wins semantics apply at the chosen arity. Carried forward verbatim from the prior patch.

### Hunk 2 — arity-pad in the constructor dispatcher

Anchor: inside `_embind_register_class`, where the constructor body is resolved via `registeredClass.constructor_body[args.length]`.

Body: same mechanism as Hunk 1 but applied to the ctor-body table (which lives outside `$ensureOverloadTable`). Pad call arity up to the smallest registered ctor arity ≥ `args.length`.

Marker: `Gate-1 hunk 2: trailing-arg arity padding`.

Rule-5 compliance: same as Hunk 1. Carried forward verbatim from the prior patch.

### Hunk 3 — optional-wildcard short-circuit in `$getSignature`

Anchor: at the top of the per-argument `key.every((field, i) => …)` lambda body inside `$getSignature`.

Body: resolve `fieldType = registeredTypes[field]`; if `fieldType !== undefined && fieldType.optional === true`, return `true` immediately. `EmValOptionalType` is tagged `optional: true` by upstream embind (`$EmValOptionalType: '=Object.assign({optional: true}, EmValType);'`), so any `std::optional<T>`-typed slot is wildcard-matched. The wire-side `register_optional<T>::toWireType(undefined)` materializes `std::nullopt`; a concrete-T arg is converted by the same toWireType call.

Marker: `Gate-1 hunk 3: std::optional<T> wildcard`.

Rule-5 compliance: this is the ONE codified exception to first-match-wins. It is the load-bearing primitive for the bounded `std::optional<T>` set (matrix rows 3, 4, 5, 21, 22 per the policy doc). Carried forward verbatim from the prior patch.

### Hunk 4 (NEW canonical) — Path B in `$getSignature`

Anchor: immediately after the existing direct-match logic (after Path A's `field === 'emscripten::val'` / `typeof args[i] === field` / `instanceof` checks), still inside the same `key.every` lambda.

Body: when `field` is a numeric typeId (not a resolved JS-type string) and `fieldType !== undefined`, resolve `fieldType.name` and apply a primitive-priority mapping:

| Registered C++ name                                                                                                                                         | Accepted `typeof args[i]`                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `emscripten::val`                                                                                                                                           | (always, regardless of arg type — wildcard for emval slots) |
| `std::string`, `std::wstring`                                                                                                                               | `'string'`                                                  |
| `bool`                                                                                                                                                      | `'boolean'`                                                 |
| `char`, `signed char`, `unsigned char`, `short`, `unsigned short`, `int`, `unsigned int`, `long`, `unsigned long`, `float`, `double`, `int64_t`, `uint64_t` | `'number'`                                                  |
| `fieldType.valueType === 'string'`                                                                                                                          | `'string'`                                                  |
| `fieldType.valueType === 'number'`                                                                                                                          | `'number'`                                                  |

For registered class types, fall through to Path A's existing `instanceof` check (no Path B mapping fires for those).

Marker: `Gate-1 hunk 4 / Path B: primitive-priority fallback`.

Why Path B is required: emcc's babel + acorn-optimizer pipeline at `-O3` can fold out the `cppTypeToJsType` helper's primitive branches, leaving registered `signaturesArray` entries arriving at `$getSignature` as raw numeric typeIds rather than their resolved JS-type strings (`'number'`, `'string'`, `'boolean'`). When that happens, Path A's `typeof args[i] === field` check fails (`'number' === 17` is false where `17` is the typeId for `int`). Path B resolves the typeId locally and accepts the match. The mapping table is inlined directly in the `$getSignature` body so the optimizer cannot eliminate it by analyzing call-site reachability of `cppTypeToJsType` — the table IS the call site.

Rule-5 compliance: Path B does NOT change the order of overload candidates considered. It only adds additional primitive-type matching where Path A previously failed due to minification. First-match-wins ordering at the candidate-key loop level (`keys.some(key => …)`) is preserved.

## Step 4 Review — Seven Completeness Checks

1. **Definition count check.** `rg -c '^\s*\$getSignature:\s'` against the patched libembind returns `1`. `rg -c '^\s*\$ensureOverloadTable:\s'` returns `1`. Verified manually and pinned in `test_patched_libembind_has_single_definitions`.

2. **Hunk independence.** Each `@@` chunk in the unified diff uses pristine line-context anchors (function names, comment landmarks, brace layout), not absolute line numbers. Re-generating the patch against a slightly modified pristine would shift line numbers but the context-line anchors would still locate each insertion point. Verified by `patch -p0 -N` applying cleanly without `--ignore-whitespace`.

3. **Wire-protocol contracts.**
   - `optional<T>::toWireType` accepts `undefined → nullopt` — this is upstream embind behaviour (`$EmValOptionalType` derives from `EmValType` with `optional: true`); the patch does NOT modify it. ✓
   - `optional<T>::fromWireType` produces `undefined` for `nullopt` — also upstream behaviour, not modified by the patch. ✓
   - `null → nullopt` (matrix row 23): explicitly NOT added. The patch leaves null handling to upstream `EmValType`. This is the deferred Hunk 4 from the parent doc § Finding 1; per policy rule 4 + matrix row 23, val is the correct primitive for non-null sentinel defaults, not a libembind null-coercion hunk. ✓

4. **Dispatch precedence.** Confirmed: the only ordering exception is Hunk 3's optional-wildcard short-circuit, which is the documented bounded exception. Hunk 4 (Path B) adds candidate-key matches but does not reorder the candidate-key search loop. No "concrete-arity-(N+1) beats wildcard-arity-N" semantics anywhere. ✓

5. **Path B correctness.** Path B does NOT change the order in which `keys` are scanned (`keys.some(key => …)` is unchanged); it only adds primitive-type matches within a single key's per-field comparison. The candidate scan order (which is fixed at registration time) is preserved. ✓

6. **No precedence-inversion.** Searched the patched libembind for the forbidden markers `concrete-beats-wildcard`, `Gate-1 hunk 5`, `Gate-1 hunk 6`, and the `_exactSigOk` code shape that surfaced in the corrupted-state hot-edit. None present. Pinned in `test_patched_libembind_has_no_forbidden_hunks`. ✓

7. **Helpers / runtime imports.** Path B uses only `registeredTypes` (already imported via `$getSignature__deps`) and the inline name table — no new helper. The retained `$cppTypeToJsType` (from Hunk 3's neighbourhood) is left in place for its existing call sites in `_embind_register_function` / `_embind_register_class_constructor`, but Path B does not depend on it (that's the entire point — Path B exists because `cppTypeToJsType` gets minified away). ✓

## New Patch Diff Structure

The canonical patch is 513 lines / 14 `@@` chunks. Note that "14 chunks" is the natural fragmentation produced by `diff -u` based on context proximity, not 14 conceptual hunks — the four conceptual hunks (1, 2, 3, 4) project onto 14 `@@` chunks because Hunks 1, 3, and 4 each modify multiple anchor regions in `$ensureOverloadTable` / `$getSignature` / `$exposePublicSymbol` / `$replacePublicSymbol` / `_embind_register_function` / `_embind_register_class` / `_embind_register_class_constructor` / `_embind_register_class_function` / `_embind_register_class_class_function`.

Conceptual-hunk-to-`@@` mapping:

| Conceptual hunk                                                                                                                                                     | `@@` chunks involved | Anchor regions                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hunk 1 (arity-pad in `$ensureOverloadTable`)                                                                                                                        | 2                    | `$ensureOverloadTable` body + `$exposePublicSymbol` callsite + `$replacePublicSymbol` callsite (to thread `rawSignature` so signature-based overload tables can co-exist with arity-padded entries) |
| Hunk 2 (arity-pad in ctor dispatcher)                                                                                                                               | 2                    | `_embind_register_class` ctor body + `_embind_register_class_constructor` registration                                                                                                              |
| Hunk 3 (optional-wildcard short-circuit in `$getSignature`)                                                                                                         | 1                    | introduces `$getSignature`, `$cppTypeToJsType`, `$ensureOverloadSignatureTable`                                                                                                                     |
| Hunk 4 (Path B primitive-priority fallback)                                                                                                                         | 1                    | extends `$getSignature` lambda body inline                                                                                                                                                          |
| Supporting plumbing (signature-aware overload tables for `_embind_register_function` / `_embind_register_class_function` / `_embind_register_class_class_function`) | 8                    | these are the pre-existing C1 same-arity dispatch hooks the prior patch already carried                                                                                                             |

The 14 `@@` count is unchanged from the prior patch — Hunk 4 (Path B) extends an existing `@@` chunk inline rather than adding a new one.

## `build-wasm.sh:step_patch_embind` Change Description

The rewritten step:

1. Resolves `embind_dir`, `embind_file`, `patch_file`, `pristine_file`, `pristine_hash_file`, `expected_hash_file`.
2. Verifies `src/vendor/pristine-libembind.js` SHA256 matches `src/vendor/pristine-libembind.expected.sha256`. Hard-fails on drift.
3. `cp "$pristine_file" "$embind_file"` (overwrites any prior state — patched, hot-edited, or corrupted).
4. Re-verifies the destination matches the pristine snapshot (catches in-place-cp failures).
5. `cd "$embind_dir" && patch -p0 -N --no-backup-if-mismatch < "$patch_file"`. The `--ignore-whitespace` flag is GONE — the new patch is generated from the same pristine baseline so it applies cleanly without it.
6. Computes the post-patch SHA256 and compares it against `src/patches/libembind-overloading.expected.sha256`. Hard-fails on drift with an actionable regenerate-pointer error message.
7. Records the patched SHA256 to `build/embind-patch-hash` purely for diagnostic visibility — the decision to reset+reapply no longer depends on it.

Key behavioural changes vs the prior implementation:

- **No skip-on-hash-match.** Every invocation resets the file.
- **No reverse-patch on hash change.** Pristine reset replaces it.
- **No silent `|| true` on patch failure.** Failure exits non-zero with a diagnostic that includes the pristine SHA256 and the patch path.
- **Dual SHA256 verification.** Both the pristine input and the patched output are hashed; either drift fails the build.

## CI Smoke Check Description

`tests/sentinel/test_libembind_patch_hygiene.py` (7 pytest sentinels):

1. `test_pristine_snapshot_matches_recorded_hash` — vendored snapshot vs `pristine-libembind.expected.sha256`.
2. `test_patch_applies_cleanly_to_pristine` — `patch -p0 -N` against pristine, no `--ignore-whitespace`.
3. `test_patched_libembind_matches_expected_hash` — post-patch SHA256 vs `libembind-overloading.expected.sha256`.
4. `test_patched_libembind_has_single_definitions` — exactly one `^\s*\$getSignature:\s` and one `^\s*\$ensureOverloadTable:\s` definition.
5. `test_patched_libembind_contains_canonical_hunks` — Hunk 1/2/3/4 markers (`Gate-1 hunk 1..4`) and Path B specifics (`std::wstring`, `fieldType.valueType`) all present.
6. `test_patched_libembind_has_no_forbidden_hunks` — forbidden markers `concrete-beats-wildcard`, `Gate-1 hunk 5`, `Gate-1 hunk 6`, `_exactSigOk` all absent.
7. `test_step_patch_embind_is_idempotent` — apply twice from pristine, post-hashes equal.

Each test uses a `tmp_path` workdir and the canonical `cp pristine; patch -p0 -N` invocation, mirroring `build-wasm.sh:step_patch_embind` exactly. Runs in ~60ms locally.

Wiring: the sentinel sits alongside the existing OCJS sentinel suite (`tests/sentinel/test_*.py`). It runs under the project's `pytest` invocation without additional configuration. CI integration via the existing OCJS NX `test` target picks it up automatically.

## Round-Trip Validation Results

Sequence executed:

```text
rm -f deps/emsdk/upstream/emscripten/src/lib/libembind.js
bash build-wasm.sh apply-patches
# → libembind.js patched successfully (sha256 e3de51923e84b697b212c4a12586c64174448b695128e772f2f0fd5a577db582).
shasum -a 256 deps/emsdk/upstream/emscripten/src/lib/libembind.js
# → e3de51923e84b697b212c4a12586c64174448b695128e772f2f0fd5a577db582  …libembind.js
bash build-wasm.sh apply-patches   # second run
shasum -a 256 deps/emsdk/upstream/emscripten/src/lib/libembind.js
# → e3de51923e84b697b212c4a12586c64174448b695128e772f2f0fd5a577db582  …libembind.js   (IDENTICAL)

echo "// CORRUPTED BY TEST" >> deps/emsdk/upstream/emscripten/src/lib/libembind.js
bash build-wasm.sh apply-patches
shasum -a 256 deps/emsdk/upstream/emscripten/src/lib/libembind.js
# → e3de51923e84b697b212c4a12586c64174448b695128e772f2f0fd5a577db582  …libembind.js   (RECOVERED)

.venv/bin/python -m pytest tests/sentinel/test_libembind_patch_hygiene.py -v
# → 7 passed in 0.06s
```

All four invariants pass: byte-identical first run, byte-identical second run, byte-identical post-corruption recovery, 7/7 sentinel tests green. The unrelated `test_artifact_parity.py` / `test_dist_parity.py` / `test_tree_parity.py` / `test_libcxx_alignment.py` / `test_link_ncollection_reachability.py` failures observed in the same suite run are pre-existing artifact-parity drift and missing-LLVM-17-deps errors, not caused by Phase 0.

A full OCJS bindings build (`pnpm nx build ocjs`) was deferred per the task spec — that runs 10–30+ minutes and would have to wait for the host bindings cache to invalidate (PCH already cached). The patch-hygiene change does not alter compiled output for any class that does not exercise the affected dispatcher paths, so the bindings cache remains valid. Manual next validation: rebuild + smoke run when a contributor next needs a fresh bindings cycle.

## Open Issues / Followups

1. **Path B's exact comment / marker text is descriptive prose, not a wire-format contract.** The sentinel matches on `Gate-1 hunk 4` and `Path B` — if a future patch author renames the marker without updating the sentinel, the canonical-hunk check would false-fail. Acceptable trade-off because the markers are stable engineering convention and the failure is obvious (and grep-fixable). Tracked here for future maintainers.
2. **`$cppTypeToJsType` is still retained in the patch.** It is dead code at the `$getSignature` level (Path B replaces its semantic) but live at the `_embind_register_function` / `_embind_register_class_constructor` registration sites, which compute `signatureArray = rawSignatureArray.map(a => cppTypeToJsType(a))`. Path B exists precisely because the minifier strips `cppTypeToJsType`'s primitive branches even when those registration sites use the helper; removing the helper outright would require auditing all `signatureArray`-derived call paths, which is out of Phase 0 scope. The hybrid (Path B at the lookup site + helper at the registration site) is the correct intermediate state.
3. **The pristine-snapshot upgrade story.** When `deps/emsdk` advances from 5.0.1 to a newer emscripten release, the vendored pristine must be re-fetched, the patch may need to be regenerated, and the hash files must be re-seeded. The `step_patch_embind` warning at `emsdk_version != "5.0.1"` is the trip-wire that flags the situation; the explicit remediation procedure should be documented when that upgrade is scheduled.
4. **Hash file format.** Single-line hex SHA256 with trailing newline. Compatible with `shasum -a 256 <file> | awk '{print $1}' > file`. Documented inline in `step_patch_embind` and in the sentinel test.
5. **Sentinel test `_apply_patch` performs an out-of-tree `patch` invocation.** This requires `patch(1)` to be on `PATH` (already a build prerequisite). Not a portability issue in practice — CI machines and dev machines all have it.

## References

- Policy: [`repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md`](../../repos/opencascade.js/docs/policy/ocjs-trailing-default-emission-policy.md) rules 6 (patch hygiene) + 7 (Path B canonical) + 5 (no precedence inversion).
- Strategic reviews: [`docs/research/ocjs-optional-overload-strategic-review-opus-4-7.md`](./ocjs-optional-overload-strategic-review-opus-4-7.md) §AO6 + §AO7; [`docs/research/ocjs-optional-overload-strategic-review-gpt-5-5.md`](./ocjs-optional-overload-strategic-review-gpt-5-5.md).
- Parent doc: [`docs/research/ocjs-optional-overload-poc-coverage-gaps.md`](./ocjs-optional-overload-poc-coverage-gaps.md) §Finding 6 extended + §R17 + §R18.
- Outstanding-issues catalog: [`docs/research/ocjs-bindgen-libembind-outstanding-issues-catalog.md`](./ocjs-bindgen-libembind-outstanding-issues-catalog.md) CTJ-1 / CTJ-2 + §Finding 3.
- Strategic-direction assessment: [`docs/research/ocjs-libembind-strategic-direction-assessment.md`](./ocjs-libembind-strategic-direction-assessment.md).
- Upstream emscripten 5.0.1 libembind source: `https://raw.githubusercontent.com/emscripten-core/emscripten/5.0.1/src/lib/libembind.js`.
