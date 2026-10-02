---
title: 'tinyusdz Fork Bug Fixes vs Upstream'
description: 'Audit of our taucad/tinyusdz fork bug fixes against upstream lighttransport/tinyusdz to determine which remain outstanding upstream, plus follow-up consolidation work and proposed upstream PRs'
status: active
created: '2026-04-16'
updated: '2026-04-17'
category: audit
related:
  - docs/research/3mf-assimp-audit.md
---

# tinyusdz Fork Bug Fixes vs Upstream

Audit of the fork commits we layered onto `lighttransport/tinyusdz` (vendored inside `assimp/contrib/tinyusdz`) and whether equivalent fixes have landed upstream.

## Executive Summary

Our `taucad/tinyusdz` fork carries six bug fixes spread across two commits on top of upstream commit `0011b4ea`. As of 2026-04-16, **five of the six fixes are still required**: the bugs remain unfixed on both `origin/release` and `origin/dev` of `lighttransport/tinyusdz`. The sixth fix (ARM32 NEON stubs) is **obsolete** — upstream `stb_image_resize2.h` already ships functional scalar fallbacks for `STBIR_NEON && __arm__` via the WASM/MSVC `#elif` branch, and our patch actually overrides them with strictly-worse no-op stubs. Upstream is aware of the `texcoord2f`/`float2` confusion (a regression test exists from 2024-06) but the underlying `UsdUVTexture::st` declaration has not been corrected. None of the fork fixes have been submitted upstream as PRs.

**Status as of 2026-04-17 — fork consolidation complete:** the obsolete ARM32 NEON workaround has been removed (R3 ✅), the assimp `TINYUSDZ_GIT_TAG` has been bumped to deploy the degenerate-face fix (R4 ✅), `taucad/tinyusdz` has been merged with upstream `lighttransport/release` (`11a2d361`) and consolidated onto its `release` branch so future upstream PRs branch cleanly off it (R5 ✅), and the original `48e327dd` boolalpha fix has been completed for the two sibling pprinter overloads it missed (R7 ✅, commit `67a2d664`). The fork is now 5 commits ahead of upstream — all 5 are bug fixes destined for upstream PRs. R1 and R2 (the actual upstream PRs) remain pending; see [Proposed Upstream PRs](#proposed-upstream-prs) below for ready-to-submit branch and message templates.

**Update — PR #1 evidence consolidated (2026-04-17):** Bug 3 has been verified against `usdchecker` (Apple USD Tools 0.25.2). The buggy form fails with `usdShadeValidators:ShaderSdrCompliance.MismatchedPropertyType — Incorrect type for /…/Tex.inputs:st. Expected 'float2'; got ''.` and the fixed form passes both the default and `--arkit` profiles. Bash history confirms `usdchecker` was the daily ground-truth driver for the assimp 3MF/USDZ export work (46 invocations against `assimp/build_test/usd/**/*_out.usda`/`.usdz` outputs), and the 11 USD-related markdown files added to `taucad/assimp@122528269` independently document the _same class_ of `texCoord2f` ↔ `float2` role-type confusion at the assimp layer. Bug 2 has been re-framed honestly as a readability improvement — pxrUSD's own `usdcat` canonicalises booleans to `1`/`0`, so the spec-compliance framing was over-claiming. See [Concrete usdchecker Validation Evidence](#concrete-usdchecker-validation-evidence-2026-04-17) and [Assimp USD Documentation Trail](#assimp-usd-documentation-trail-2026-04-17) under PR #1 for full audit trails.

**Update — PR #1 test coverage hardened (2026-04-17 PM, commit `67a2d664`):** A test-coverage review of the original `48e327dd` patch surfaced one substantive gap and two narrower gaps. Bug 2 (`std::boolalpha`) was _partially_ fixed — the original patch only touched the `print_typed_attr<TypedAttributeWithFallback<T>>` overload, leaving two sibling sites in `pprinter.cc` (`print_animatable_default` and `print_typed_attr<TypedAttributeWithFallback<Animatable<T>>>`) still emitting `1`/`0` for real-world `Animatable<bool>` consumers (UsdLux `SphereLight`/`CylinderLight` `inputs:normalize` and `inputs:enableColorTemperature`, UsdSkel `collection:*:includeRoot`). Commit `67a2d664` adds `std::boolalpha` to both missing sites, plus three new test fixtures: `pprint_bool_animatable_attr_test` (new — covers the `Animatable<bool>` overload via `SphereLight::normalize`), the `false`-case for `GeomMesh::doubleSided` in `pprint_bool_attr_test`, and a connection-form assertion in `pprint_uvtexture_st_type_test` mirroring the `usdchecker` failure case (`tex.st.set_connection(...)` → `float2 inputs:st.connect = …`). The new test was verified to fail without the source fix and pass with it; all 20 unit tests pass under the existing `ctest` harness. `assimp/code/CMakeLists.txt` `TINYUSDZ_GIT_TAG` was bumped from `23d5718b` → `67a2d664` (`taucad/assimp@66d28a9c`) and the `assimpjs` submodule pointer was rebumped (`taucad/assimpjs@68d4221`). See the new commit at the head of [Fork Topology — Current state](#current-state-post-r3r5-2026-04-17) and the rewritten [PR #1 Tests](#pr-1--fix-usduvtexture-serialization-bugs-14) row.

## Problem Statement

Two recent fork commits added bug fixes to the vendored tinyusdz tree:

- `48e327dd` (2026-02-21) — UsdUVTexture serialization correctness
- `f385e5fe` (2026-02-25) — Degenerate face skip + ARM32 NEON stubs

We need to know:

1. Which bugs each commit addresses, and how severe each is
2. Whether the upstream `lighttransport/tinyusdz` project has independently fixed any of them
3. Whether any of our fork fixes have been superseded or rendered obsolete by upstream changes
4. What outreach (PRs, issues) is appropriate to upstream the remaining fixes

## Methodology

Read-only Git operations only. Steps performed:

1. Inspected the vendored tree at `repos/assimpjs/assimp/contrib/tinyusdz/autoclone/tinyusdz_repo-src` (already a checkout of `taucad/tinyusdz` at `f385e5fe`)
2. Verified the assimp `CMakeLists.txt` `TINYUSDZ_GIT_TAG` to confirm which fork commit is actually built (`48e327dd` — note the newer `f385e5fe` is **not** pinned)
3. Cloned a fresh `lighttransport/tinyusdz` upstream via `pnpm repos add lighttransport/tinyusdz -g cad --clone` to compare HEAD on `release` and `dev`
4. For each fix, used `git show <upstream-branch>:<file>` plus `rg` to confirm whether the bug is still present on `origin/release` and `origin/dev`
5. Searched upstream commit messages for related work via `git log --all --oneline | rg -i 'wrap|boolalpha|degenerate|UVTexture|inputs:st|texcoord'`
6. Searched upstream issues via `gh issue list --repo lighttransport/tinyusdz --search ...`

### Build Configuration Caveat

> **Resolved 2026-04-17.** `assimp/code/CMakeLists.txt` previously pinned `TINYUSDZ_GIT_TAG=48e327dd...`, leaving Bug 5 dead code from assimp's perspective and applying Bug 6 via a separate `PATCH_COMMAND`. As of commit `e46f5873` on `taucad/assimp:master`, the tag is bumped to `23d5718bb87598420d3baaf44d63befbbba4be49` (HEAD of `taucad/tinyusdz:release`), the `PATCH_COMMAND` and `tinyusdz.patch` file have been removed, and the comment block now documents the new commit chain. The `assimpjs` submodule pointer in `taucad/assimpjs:main` was bumped accordingly (commit `b010cc8`).

The original 2026-04-16 audit observation, preserved for historical context:

- Bugs 1–4 (UVTexture fixes in `48e327dd`) were deployed to assimp builds today
- Bug 5 (degenerate face skip) lived in `f385e5fe` but was **not** picked up by assimp until the tag was bumped
- Bug 6 (ARM32 NEON stubs) was applied via the `tinyusdz.patch` file at clone time, independently of `TINYUSDZ_GIT_TAG`

## Findings

### Bug Inventory

| #   | Bug                                                                     | Source               | File(s)                                    | In `48e327dd` | In `f385e5fe`               |
| --- | ----------------------------------------------------------------------- | -------------------- | ------------------------------------------ | ------------- | --------------------------- |
| 1   | Swapped `wrapS`/`wrapT` labels in `print_shader_params`                 | Our fix              | `src/pprinter.cc:4000-4001`                | Yes           | (carried)                   |
| 2   | Missing `std::boolalpha` in `print_typed_attr` template                 | Our fix              | `src/pprinter.cc:1130`                     | Yes           | (carried)                   |
| 3   | `UsdUVTexture::st` typed `texcoord2f` instead of `float2`               | Our fix              | `src/usdShade.hh:168`                      | Yes           | (carried)                   |
| 4   | `ConvertUVTexture` reads `texture.st` as `texcoord2f` (couples with #3) | Our fix              | `src/tydra/render-data.cc:4846`            | Yes           | (carried)                   |
| 5   | `ConvertMesh` errors on `counts[i] < 3` instead of skipping             | Our fix              | `src/tydra/render-data.cc:2935-2965, 5481` | No            | Yes                         |
| 6   | ARM32 NEON SIMD missing for `__ANDROID__ && __arm__`                    | Our fix + patch file | `src/external/stb_image_resize2.h:2516`    | No            | Yes (also `tinyusdz.patch`) |

### Upstream Comparison

For each bug, the table below reports whether the bug is still present on upstream `origin/release` (HEAD `11a2d361`) and `origin/dev` (HEAD `960dba34`).

| #   | Bug                                                 | `origin/release`                                    | `origin/dev`  | Upstream awareness                                                                                                   | Verdict                 |
| --- | --------------------------------------------------- | --------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1   | Swapped `wrapS`/`wrapT` print labels                | Still present                                       | Still present | None found in commits or issues                                                                                      | Fork fix required       |
| 2   | Missing `std::boolalpha` in attribute printer       | Still present                                       | Still present | None found                                                                                                           | Fork fix required       |
| 3   | `UsdUVTexture::st` typed as `texcoord2f`            | Still present                                       | Still present | Indirect: `7f3ae22` (2024-06) added a `texcoord2f→float2` cast test as a workaround, not a fix                       | Fork fix required       |
| 4   | `ConvertUVTexture` reads `texture.st` as texcoord2f | Still present                                       | Still present | Same as #3 (coupled)                                                                                                 | Fork fix required       |
| 5   | Hard error on `counts[i] < 3` in `ConvertMesh`      | Still present                                       | Still present | `b41e1ddb` (2024-05) and `1fd99d84` (2026-02) handle degeneracy in tangent computation, not in face-count validation | Fork fix required       |
| 6   | ARM32 NEON SIMD stubs for Android NDK               | Already addressed by upstream `stb_image_resize2.h` | Same          | Upstream stb provides functional fallbacks (line 2502 `#elif`) since at least 2024-10 (commit `394a7e34`)            | **Fork patch obsolete** |

### Detailed Findings

#### Bug 1 — Swapped `wrapS`/`wrapT` labels (still present upstream)

`src/pprinter.cc::print_shader_params` writes the wrong attribute names:

```cpp
// upstream origin/release line 4000-4001 AND origin/dev line 4060-4061
ss << print_typed_token_attr(shader.wrapS, "inputs:wrapT", indent);
ss << print_typed_token_attr(shader.wrapT, "inputs:wrapS", indent);
```

Our fix (`48e327dd`) swaps the labels back so `shader.wrapS` is printed as `"inputs:wrapS"`. This is a data-integrity bug — any USDA file written through tinyusdz has its texture wrap modes silently flipped, and the bug round-trips through tinyusdz cleanly because the same code reads what it writes. It only manifests when the file is consumed by another USD implementation (OpenUSD, Blender USD importer, etc.). No upstream issue or PR mentions it.

#### Bug 2 — Missing `std::boolalpha` (still present upstream)

`print_typed_attr<T>` for `TypedAttributeWithFallback<T>` constructs a `std::stringstream` without setting `std::boolalpha`. When `T = bool`, attributes serialize as `1`/`0` instead of `true`/`false`. `git show origin/dev:src/pprinter.cc | rg boolalpha` returns nothing — the change is still missing on the active development branch.

**Important caveat (added 2026-04-17):** the USDA grammar accepts both `1`/`0` and `true`/`false` for booleans, _and pxrUSD's own `usdcat` canonicalises to `1`/`0` on output_:

```text
$ cat /tmp/bool-roundtrip.usda
#usda 1.0
def Xform "Root" { custom bool myFlag = true ; custom bool myFalse = false }

$ usdcat /tmp/bool-roundtrip.usda
#usda 1.0
def Xform "Root"
{
    custom bool myFalse = 0
    custom bool myFlag = 1
}
```

So Bug 2 is not a strict spec-compliance defect — it is a _human-readability and reference-corpus consistency_ improvement: Apple's reference USDA assets and the per-USD-spec example snippets both use `true`/`false`, while tinyusdz currently emits `1`/`0` matching pxrUSD's canonical writer. We should be honest about this distinction in the PR description (see §[PR #1 Suggested description](#pr-1--fix-usduvtexture-serialization-bugs-14)) — leading with a "spec violation" framing risks the maintainer pushing back.

#### Bug 3 — `UsdUVTexture::st` typed as `texcoord2f` (still present upstream)

`src/usdShade.hh` declares:

```cpp
// origin/release line 168, origin/dev line 235
TypedAttributeWithFallback<Animatable<value::texcoord2f>> st{value::texcoord2f{0.0f, 0.0f}}; // "inputs:st"
```

The [UsdPreviewSurface specification](https://openusd.org/release/spec_usdpreviewsurface.html) defines `inputs:st` as `float2`. Using `texcoord2f` causes type mismatches when connecting `UsdPrimvarReader_float2` outputs or `UsdTransform2d` outputs.

Upstream is aware of the `texcoord2f` ↔ `float2` confusion: commit `7f3ae22` (2024-06-14, "add texcoord2f -> float2 cast test.") added a unit test in `tests/unit/unit-value-types.cc` confirming the value-types layer can cast between them. But the underlying `usdShade.hh` declaration was not changed. The fix in our fork is the structural correction the test workaround does not provide.

#### Bug 4 — `ConvertUVTexture` reads `texture.st` as `texcoord2f`

`src/tydra/render-data.cc:4846` is coupled to Bug 3: it reads `texture.st.get_value()` into an `Animatable<value::texcoord2f>`. Once `usdShade.hh` is corrected, this consumer must also use `value::float2`. Our fix updates both sites in lockstep. Upstream still uses `texcoord2f` here on both branches.

#### Bug 5 — Hard error on degenerate face counts (still present upstream)

Upstream `src/tydra/render-data.cc::RenderSceneConverter::ConvertMesh` aborts the whole conversion when any face has fewer than 3 vertices:

```cpp
// origin/release line 2939, origin/dev line 4081
if (counts[i] < 3) {
  PUSH_ERROR_AND_RETURN(
      fmt::format("faceVertexCounts[{}] contains invalid value {}. The "
                  "count value must be >= 3",
                  i, counts[i]));
}
```

Our fix in `f385e5fe` instead skips the degenerate face, removes its indices from `usdFaceVertexIndices`, and returns successfully if every face was degenerate (empty mesh). The accompanying change in `MeshVisitor` skips registering empty meshes with `meshMap` and `meshes`.

Two related upstream commits exist but address different problems:

- `b41e1ddb` (2024-05) "Use double precision to determine the polygon is degenerated" — affects polygon-area degeneracy detection in tangent code, not face-count validation
- `1fd99d84` (2026-02) "Fix black triangle artifacts from degenerate tangents and add NaN/Inf safeguards" — addresses degenerate UV triangles in `ComputeTangentsAndBinormals`, not face counts

Neither relaxes the `counts[i] < 3` precondition. The robustness gap remains upstream.

**Deployment caveat (resolved 2026-04-17):** `assimp` previously pinned `TINYUSDZ_GIT_TAG=48e327dd`, so this fix was dead code. The tag has since been bumped to `23d5718bb87598420d3baaf44d63befbbba4be49` (HEAD of `taucad/tinyusdz:release`), so the degenerate-face skip is now live in WASM builds.

#### Bug 6 — ARM32 NEON stubs (upstream already provides better fallback) — **REMOVED 2026-04-17**

> **Status:** This patch was reverted in `taucad/tinyusdz` commit `23d5718b` ("Remove obsolete ARM32 NEON stub workaround"). The corresponding `tinyusdz.patch` file and `PATCH_COMMAND` block in `assimp/code/CMakeLists.txt` were also deleted. `src/external/stb_image_resize2.h` is now byte-for-byte identical to upstream. The analysis below is preserved for historical reference.

This is the only fork patch that was **obsolete**. Our patch added a new `#elif` block:

```cpp
// f385e5fe — inserted ahead of the existing #elif at upstream line 2502
#elif defined(STBIR_NEON) && (defined(__ANDROID__) && defined(__arm__))
  static stbir__inline void stbir__half_to_float_SIMD(...) { /* no-op */ }
  static stbir__inline void stbir__float_to_half_SIMD(...) { /* no-op */ }
  static stbir__inline float stbir__half_to_float(...) { return 0; }
  static stbir__inline stbir__FP16 stbir__float_to_half(...) { return 0; }
```

But upstream `stb_image_resize2.h` at our base commit `0011b4ea` already contains, at line 2502:

```cpp
#elif defined(STBIR_WASM) || (defined(STBIR_NEON) && (defined(_MSC_VER) || defined(_M_ARM) || defined(__arm__))) // WASM or 32-bit ARM on MSVC/clang

  static stbir__inline void stbir__half_to_float_SIMD(float * output, stbir__FP16 const * input) {
    for (int i=0; i<8; i++)
      output[i] = stbir__half_to_float(input[i]);
  }
  static stbir__inline void stbir__float_to_half_SIMD(stbir__FP16 * output, float const * input) {
    for (int i=0; i<8; i++)
      output[i] = stbir__float_to_half(input[i]);
  }
```

The functional `stbir__half_to_float` and `stbir__float_to_half` scalars are themselves available for 32-bit ARM via the chain at line 2221:

```cpp
#if (!defined(STBIR_NEON) && !defined(STBIR_FP16C)) || (defined(STBIR_NEON) && defined(_M_ARM)) || (defined(STBIR_NEON) && defined(__arm__))
```

So upstream stb already covers the `STBIR_NEON && __arm__` Android case with **functional** scalar fallbacks. The Tau patch inserts its own `#elif` **earlier in the chain** so it matches first and replaces the working fallbacks with stubs that return `0`. For pure assimp 3MF/glTF export this is harmless because the image-resize routines are not exercised, but it is strictly worse than the upstream solution and would silently produce incorrect output if the SIMD helpers were ever invoked.

The same patch is also present as a standalone file at `repos/assimpjs/assimp/contrib/tinyusdz/patches/tinyusdz.patch`, applied via `PATCH_COMMAND` during the autoclone step. Both the commit and the patch file share the same content.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                  | Priority | Effort  | Impact                                                                                                             | Status                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | Open upstream PRs to `lighttransport/tinyusdz` for Bugs 1–4 (UVTexture serialization correctness from `48e327dd`)                                                                                                                                                                                                                                       | P1       | Low     | High — these are correctness defects affecting any USDA writer/consumer chain                                      | **Pending** — see [Proposed Upstream PRs](#proposed-upstream-prs)                                                                                                  |
| R2  | Open a separate upstream PR for Bug 5 (degenerate face skip from `f385e5fe`)                                                                                                                                                                                                                                                                            | P2       | Low     | Medium — prevents whole-scene conversion failure on otherwise-valid meshes                                         | **Pending** — see [Proposed Upstream PRs](#proposed-upstream-prs)                                                                                                  |
| R3  | Drop Bug 6 (ARM32 NEON stubs): remove the `#elif` block from `f385e5fe` and delete `tinyusdz.patch`. Rely on upstream stb's existing `__arm__` fallback.                                                                                                                                                                                                | P2       | Low     | Medium — removes patch maintenance burden and avoids overriding upstream's functional scalar fallbacks with no-ops | ✅ Done — `taucad/tinyusdz@23d5718b` reverts the stubs; `assimp/contrib/tinyusdz/patches/` deleted; `PATCH_COMMAND` removed from `assimp/code/CMakeLists.txt`      |
| R4  | Bump `TINYUSDZ_GIT_TAG` in `repos/assimpjs/assimp/code/CMakeLists.txt` from `48e327dd` to `f385e5fe` (or the post-cleanup successor) so the degenerate-face fix is actually deployed                                                                                                                                                                    | P1       | Trivial | Medium — currently the Bug 5 fix is dead code from assimp's perspective                                            | ✅ Done — bumped to `23d5718bb87598420d3baaf44d63befbbba4be49` (`taucad/assimp@e46f5873`); `assimpjs` submodule pointer bumped (`taucad/assimpjs@b010cc8`)         |
| R5  | After R3 + R4: rebase `taucad/tinyusdz` onto a recent upstream commit (e.g. `origin/release` `11a2d361` or `origin/dev` `960dba34`) so future syncs are easier                                                                                                                                                                                          | P3       | Low     | Low — hygiene; keeps fork divergence minimal                                                                       | ✅ Done — merged upstream `release@11a2d361` via merge commit `a852eb09`; canonical fork branch shifted from `main` → `release` to mirror upstream's PR convention |
| R6  | If R1/R2 PRs are accepted, drop the fork entirely and point assimp at upstream tinyusdz directly                                                                                                                                                                                                                                                        | P3       | Medium  | High — eliminates a fork to maintain                                                                               | Blocked on R1 + R2                                                                                                                                                 |
| R7  | Complete the Bug 2 (`std::boolalpha`) fix in the two `pprinter.cc` sibling overloads the original `48e327dd` patch missed (`print_animatable_default` + `TypedAttributeWithFallback<Animatable<T>>`); add `pprint_bool_animatable_attr_test`, false-case for `pprint_bool_attr_test`, and connection-form assertion for `pprint_uvtexture_st_type_test` | P1       | Trivial | High — without it the PR description over-claims; UsdLux/UsdSkel `Animatable<bool>` consumers still emit `1`/`0`   | ✅ Done — `taucad/tinyusdz@67a2d664`; bumped via `taucad/assimp@66d28a9c` and `taucad/assimpjs@68d4221`. New test verified to fail without the source fix          |

## Upstream Contribution Guidelines

Before drafting either upstream PR, internalise the conventions encoded in `lighttransport/tinyusdz`. These are not aggregated into a single `CONTRIBUTING.md`; they are scattered across `README.md`, `CLAUDE.md`, `.github/`, and `.clang-format`. The most consequential rule is **the PR target branch is `dev`, not `release`** — every CI workflow only triggers on `pull_request: branches: [ dev ]`.

### Branch Model (`README.md` §Branches, lines 54–59)

| Branch    | Purpose                                                                                                                                          | PR target?              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `release` | Stable release branch. Default branch on GitHub. Updated by maintainers when `dev` reaches feature-freeze and passes testing.                    | ❌ No — maintainer-only |
| `dev`     | Active development branch. **All contributor PRs must target this branch.** README states verbatim: _"Basically, use `dev` branch to submit PR"_ | ✅ Yes                  |
| `npm`     | NPM packaging/upload branch. Developer-only.                                                                                                     | ❌ No                   |

### CI Gates (`.github/workflows/`)

Every PR triggers four gating workflows, **all of which only run when the PR base is `dev`**:

| Workflow | File                  | What it does                                                |
| -------- | --------------------- | ----------------------------------------------------------- |
| Linux    | `linux_ci.yml`        | gcc + clang builds via `bootstrap-cmake-linux.sh`, `ctest`  |
| macOS    | `macos_ci.yml`        | `bootstrap-cmake-macos.sh`, `ctest --output-on-failure`     |
| Windows  | `windows_ci.yml`      | MSVC via `vcsetup.bat`, `cmake --build`, `ctest -C Release` |
| CodeQL   | `codeql-analysis.yml` | C/C++ CodeQL scan on every push and PR (also weekly cron)   |

Additional non-gating workflows: `ios_ci.yml`, `android_ci.yml`, `windows_arm_ci.yml`, `wasmPublish.yml`, `static.yml`. None of these run on `release` branch PRs — submit to `dev` or the build never starts.

### Automated LLM PR Review

Every opened/synchronized PR is reviewed by an automated LLM bot configured via a GitHub Actions workflow. The bot is instructed (via `direct_prompt` in the workflow) to evaluate:

1. Code quality and best practices
2. Potential bugs or issues
3. Performance considerations
4. Security concerns
5. Test coverage

**Implication for our PRs:** since the reviewing agent is itself an LLM, our PR descriptions and commit messages should explicitly disclose the AI-assisted authorship (per the [`submit-pr`](../../.agent/skills/submit-pr/SKILL.md) skill convention) so the human maintainer can weigh both signals together.

### Code Style (`.clang-format`)

```yaml
BasedOnStyle: Google
IndentWidth: 2
TabWidth: 2
UseTab: Never
BreakBeforeBraces: Attach
Standard: Cpp11
```

Run `clang-format -i <files>` before committing. The `Standard: Cpp11` setting controls clang-format parsing only; the actual project requires C++14 (see Language Constraints below).

### Language and Library Constraints (`README.md` §Requirements, `CLAUDE.md` §Security)

- **C++14 minimum.** Tested with gcc ≥ 4.9, clang ≥ 3.4, MSVC 2019/2022, llvm-mingw. C++17 also supported.
- **No C++ exceptions.** The library uses `nonstd::expected` for error propagation. New code must follow this pattern — do not introduce `throw` or `try`/`catch`.
- **Dependency-free goal.** All third-party code is vendored under `src/external/`. Do not add new external dependencies.
- **No code generation.** Hand-written parsers (e.g. ASCII parser uses no Bison/flex/PEG). Pre/post-build code generation is not permitted.
- **Memory-safe by construction.** All parsers do bounds checking; loaders accept `USDLoadOptions::max_memory_limit_in_mb`. New parsing code is expected to honour the same discipline.
- **Fuzz-tested.** New parser changes should be exercised under `tests/fuzzer/` (Meson + Ninja toolchain).

### Test Conventions (`CLAUDE.md` §Running Tests)

| Test type          | Runner                                                 | Notes                                                                                                                                 |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| C++ unit tests     | `./build/test_tinyusdz` (ctest)                        | Built when `-DTINYUSDZ_BUILD_TESTS=ON`. New cases live in `tests/unit/unit-*.{cc,h}` and are registered in `tests/unit/unit-main.cc`. |
| USD parse coverage | `python tests/parse_usd/runner.py --path ../../models` | Round-trips a corpus of USD models                                                                                                    |
| Tydra conversion   | `python tests/tydra_to_renderscene/runner.py`          | Validates render-scene conversion (the subsystem affected by Bug 5)                                                                   |
| Fuzzing            | `tests/fuzzer/` (Meson)                                | Required for parser changes                                                                                                           |

The two PRs we plan to file already include or need new `tests/unit/unit-pprint.cc` cases; PR #2 additionally needs a `tests/tydra_to_renderscene/` fixture for the degenerate-face skip.

### Issue Hygiene (transferable to PR descriptions)

The `bug_report.md` issue template sets unusually strict expectations that signal the maintainer's tone:

> _"You should first investigate your issue using your coding agent. We don't provide free-of-charge issue investigation."_
>
> _"Please research existing issues thoroughly before submitting a new report. When posting, you must follow the issue template and include a minimal, reproducible example (code and/or scene) in a standalone format. Failure to do so will result in the immediate deletion of your issue and may lead to your account being blocked."_

For PRs, the equivalent expectations are: do prior-art research (cite related upstream commits/issues), include a minimal reproducible test case, and never open a PR without local CI evidence (`ctest` clean on at least one platform).

### Stale Policy (`.github/workflows/cron.yml`)

- Issues: stale after 30 days inactive, closed 14 days after that.
- **PRs: not subject to staleness** (`days-before-pr-stale: -1`). Once opened, a PR stays open until merged or explicitly closed.

### Commit Message Style

Free-form imperative mood, no Conventional Commits prefix required. Recent merged examples from `release`:

```
Fix NRVO build errors by ensuring single named return variable per function
Add LightUSD-C information to README
Fix temporary object access(ss.str().c_str()), which may return wrong value in jsteemann::aoi. Also add max digits length check.
```

Our two existing fork commits already match this style:

```
Fix UsdUVTexture serialization: correct wrapS/wrapT labels, boolean formatting, and inputs:st type
fix: skip degenerate faces in mesh conversion and add ARM32 NEON stubs
```

For PR #2, the second commit's message should be rewritten to drop the `fix:` Conventional Commits prefix and the now-irrelevant ARM32 clause (the clause goes away naturally because the cherry-pick is `src/tydra/render-data.cc` only). Suggested rewrite: `Skip degenerate faces in RenderSceneConverter::ConvertMesh instead of erroring`.

### License and Copyright

TinyUSDZ is **Apache 2.0**, with some helper code under MIT. No CLA is required and no DCO `Signed-off-by` is enforced. Apache 2.0 already includes the patent grant by virtue of contribution, so no additional paperwork is needed.

## Proposed Upstream PRs

After R3–R5 + R7 the fork's `release` branch is exactly **5 commits ahead** of `lighttransport/tinyusdz:release` (`11a2d361`):

```
release  ← taucad/tinyusdz HEAD (also = main HEAD)
│
67a2d664  Complete std::boolalpha coverage and broaden pprint tests   ← squash into PR #1's single commit
23d5718b  Remove obsolete ARM32 NEON stub workaround                  ← drops a fork-only mistake; do NOT include in upstream PRs
a852eb09  Merge upstream lighttransport/tinyusdz release              ← merge commit; do NOT include in upstream PRs
f385e5fe  fix: skip degenerate faces in mesh conversion               ← upstream PR #2 candidate (after splitting; ARM32 hunk now empty)
48e327dd  Fix UsdUVTexture serialization (wrapS/wrapT, ...)           ← upstream PR #1 candidate (combined with 67a2d664)
│
11a2d361  Merge pull request #270 from lighttransport/...             ← upstream/release HEAD; PR base
```

Net diff `upstream/release..release` after R7 (verified 2026-04-17):

```
src/pprinter.cc           |  7 +++--
src/tydra/render-data.cc  | 38 ++++++++++++++++++++++++--------------
src/usdShade.hh           |  2 +-
tests/unit/unit-main.cc   |  5 ++++
tests/unit/unit-pprint.cc | 130 ++++++++++++++++++++++++++++++++++++++++++++++++
tests/unit/unit-pprint.h  |  4 +++
```

These six file changes split cleanly into two upstream PRs (PR #1 squashes `48e327dd` + `67a2d664` into a single commit; PR #2 is just the `render-data.cc` portion of `f385e5fe`).

### PR Target Branch

Both PRs **must target `dev`**, not `release`. Although `release` is GitHub's default branch and merged PRs surface there via maintainer-driven syncs (e.g. [#270](https://github.com/lighttransport/tinyusdz/pull/270) "NRVO single named return variable"), the `README.md` "Branches" section is explicit (_"Basically, use `dev` branch to submit PR"_) and every CI workflow only triggers on `pull_request: branches: [ dev ]` — submitting against `release` means zero CI runs and the PR will be ignored or redirected.

The `taucad/tinyusdz` fork carries our work on `release` (mirroring `lighttransport/tinyusdz:release`'s status as the default branch), but the PR branches we publish to our own fork should be cut off `upstream/dev` so the cherry-pick sits on the correct base. Use the [`submit-pr`](../../.agent/skills/submit-pr/SKILL.md) skill to open both as drafts; that skill captures the AI co-authorship disclosure and testing-evidence convention.

### PR #1 — Fix UsdUVTexture serialization (Bugs 1–4)

| Field               | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source branch**   | `taucad:fix/uvtexture-serialization` (cherry-pick `48e327dd` + `67a2d664` onto `upstream/dev`, then squash into one commit)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Target**          | `lighttransport/tinyusdz:dev`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Files**           | `src/pprinter.cc`, `src/usdShade.hh`, `src/tydra/render-data.cc`, `tests/unit/unit-pprint.cc`, `tests/unit/unit-pprint.h`, `tests/unit/unit-main.cc`                                                                                                                                                                                                                                                                                                                                                                                          |
| **Tests**           | Four `unit-pprint.cc` cases registered in `unit-main.cc`: `pprint_uvtexture_wrap_test` (Bug 1), `pprint_bool_attr_test` (Bug 2 — `TypedAttributeWithFallback<bool>`, both true and false), `pprint_bool_animatable_attr_test` (Bug 2 — `TypedAttributeWithFallback<Animatable<bool>>` via `SphereLight::normalize`, verified to fail without the fix), `pprint_uvtexture_st_type_test` (Bug 3 — both `set_value` fallback form and `set_connection` form mirroring the `usdchecker` Sdr-compliance failure). All 20 tests pass under `ctest`. |
| **Suggested title** | `Fix UsdUVTexture serialization: wrapS/wrapT labels, boolean formatting, inputs:st type`                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

#### Upstream Prior-Art Audit (2026-04-17)

An exhaustive search of `lighttransport/tinyusdz` confirmed that **no open or merged PR addresses any of the four bugs PR #1 fixes**, and no related work is currently in flight. Search axes:

- Keyword PR search across all states for: `wrap`, `wrapS`, `wrapT`, `UVTexture`, `UsdUVTexture`, `boolalpha`, `texcoord`, `float2`, `pprinter`, `pprint`, `usdShade`, `print_shader_params`, `print_typed_attr`, `inputs:st`, `UsdPreviewSurface`, `ConvertUVTexture`, `usda writer`, `serialize`, `shader`
- Same keyword set across issues
- File-touch survey on `src/pprinter.cc`, `src/usdShade.hh`, `src/tydra/render-data.cc` across the 200 most recent PRs
- Snapshot of currently open PRs targeting `dev`

`git blame origin/dev` corroborates that each bug site has been untouched since the original buggy commit:

| Bug                                                      | Upstream site           | Last touched                                 | SHA / Author                                                     | PRs touching the same site                                                       |
| -------------------------------------------------------- | ----------------------- | -------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1: swapped `wrapS`/`wrapT` print labels                  | `pprinter.cc:4060–4061` | 2022-09-15                                   | `f2b31a67` (Syoyo Fujita)                                        | None                                                                             |
| 2: missing `std::boolalpha` in `print_typed_attr`        | `pprinter.cc:1120–1145` | 2024-05-03                                   | `0902c19bc` (Syoyo Fujita) — refactor without adding `boolalpha` | None                                                                             |
| 3: `UsdUVTexture::st` typed as `texcoord2f`              | `usdShade.hh:235`       | 2022-09-13                                   | `6de4e660e` (Syoyo Fujita)                                       | None                                                                             |
| 4: `ConvertUVTexture` reads `texture.st` as `texcoord2f` | `tydra/render-data.cc`  | (coupled with #3; never separately modified) | —                                                                | #221 "Explicit joint orders", #177 "skeleton check" — both elsewhere in the file |

**Damning detail for Bug 3:** on **2025-11-02** (`8e136d13f`) Syoyo added a new `uv_set` field to `UsdUVTexture` _directly below the buggy `st` declaration_, proving the struct is actively maintained yet the `texcoord2f`/`float2` mistype went unnoticed.

**PRs touching `pprinter.cc` historically** (all MERGED into `dev`, none relevant to our changes):

| PR                                                          | Date       | Title                                                     | Why not relevant                                                                                             |
| ----------------------------------------------------------- | ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [#58](https://github.com/lighttransport/tinyusdz/pull/58)   | 2022-12-11 | Wbraithwaite nvidia nvusd                                 | Nvidia USD compat work; pre-dates the buggy lines being introduced as final form                             |
| [#63](https://github.com/lighttransport/tinyusdz/pull/63)   | 2022-12    | Run PVS-Studio over tinyusdz library and fix found issues | PVS-Studio static analysis fixes; did not flag the swapped wrap labels or missing `boolalpha`                |
| [#146](https://github.com/lighttransport/tinyusdz/pull/146) | 2024       | Support parsing timesampled enum tokens                   | Touches `inputs:wrapS`/`inputs:wrapT` _parser_ macros in `usdShade.cc`; does not touch `print_shader_params` |
| [#270](https://github.com/lighttransport/tinyusdz/pull/270) | 2026       | Fix NRVO build errors with clang-21+                      | C++ NRVO compiler-compat fix elsewhere in `pprinter.cc`                                                      |

**Open PRs targeting `dev` right now:** zero. No conflict risk; PR #1 will land cleanly.

**Adjacent issue worth citing in the PR body for context** (not a duplicate, but complementary evidence the area has correctness pain):

- **[#259](https://github.com/lighttransport/tinyusdz/issues/259)** "UsdPreviewSurface.inputs:diffuseColor connection does not serialize (typed-attr connect ignored;)" by [execomrt](https://github.com/execomrt) (Stephane Denis), filed 2025-09-25, closed stale 2025-10-10. Reports a _different_ USDA writer correctness defect in the same `UsdPreviewSurface`/`UsdUVTexture` subsystem. The maintainer invoked the `@claude` bot, which diagnosed the report as user-error API ergonomics (`set_connection()` must be paired with `set_value_empty()`). A bot-spawned branch `claude/issue-259-20250925-1550` exists but no PR was filed. The claude-bot artifact branches `claude/issue-259-...` and `claude/issue-263-...` (#263 itself has since been deleted, presumably under the issue template's deletion policy) confirm the maintainer's reliance on the bot for triage — strengthening the case for our PR description being explicit about what was tested locally and exactly which lines change, so the bot has unambiguous signal.

#### Concrete `usdchecker` Validation Evidence (2026-04-17)

To pre-empt the predictable maintainer/bot question _"does pxrUSD's reference validator actually flag this?"_, I reproduced Bug 3 against `usdchecker` from **Apple USD Tools 0.25.2** (the system OpenUSD install on macOS 25.0.0, `/usr/bin/usdchecker`). All test files are at `/tmp/tinyusdz-pr1-checks/` on the audit machine.

**Test fixture (buggy form — what tinyusdz currently emits):**

```usda
#usda 1.0
( defaultPrim = "Root" metersPerUnit = 1 upAxis = "Y" )

def Xform "Root"
{
    def Mesh "MyMesh" (prepend apiSchemas = ["MaterialBindingAPI"])
    {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
        texCoord2f[] primvars:st = [(0, 0), (1, 0), (0, 1)] ( interpolation = "vertex" )
        rel material:binding = </Root/MyMat>
    }
    def Material "MyMat"
    {
        token outputs:surface.connect = </Root/MyMat/PBR.outputs:surface>
        def Shader "PBR" {
            uniform token info:id = "UsdPreviewSurface"
            color3f inputs:diffuseColor.connect = </Root/MyMat/Tex.outputs:rgb>
            token outputs:surface
        }
        def Shader "Tex" {
            uniform token info:id = "UsdUVTexture"
            asset inputs:file = @./diffuse.png@
            # Bug 3 — what tinyusdz emits today:
            texcoord2f inputs:st.connect = </Root/MyMat/StReader.outputs:result>
            float3 outputs:rgb
        }
        def Shader "StReader" {
            uniform token info:id = "UsdPrimvarReader_float2"
            string inputs:varname = "st"
            float2 outputs:result
        }
    }
}
```

**Validator output — buggy form:**

```text
$ usdchecker /tmp/tinyusdz-pr1-checks/bug34-combined-buggy.usda
Validation Result with no explicit variants set
Error: (usdShadeValidators:ShaderSdrCompliance.MismatchedPropertyType)
  Incorrect type for /Root/MyMat/Tex.inputs:st. Expected 'float2'; got ''.
Failed!  (exit 1)

$ usdchecker --arkit /tmp/tinyusdz-pr1-checks/bug34-combined-buggy.usda
Validation Result with no explicit variants set
Error: (usdShadeValidators:ShaderSdrCompliance.MismatchedPropertyType)
  Incorrect type for /Root/MyMat/Tex.inputs:st. Expected 'float2'; got ''.
Failed!  (exit 1)
```

**Validator output — same file with the only delta being `texcoord2f` → `float2` on the `inputs:st` declaration:**

```text
$ usdchecker /tmp/tinyusdz-pr1-checks/bug34-combined-fixed.usda
Validation Result with no explicit variants set
Success!  (exit 0)

$ usdchecker --arkit /tmp/tinyusdz-pr1-checks/bug34-combined-fixed.usda
Validation Result with no explicit variants set
Success!  (exit 0)
```

This is the cleanest possible signal:

- The validator class is `usdShadeValidators:ShaderSdrCompliance.MismatchedPropertyType` — a first-party pxrUSD validator that consults the **Sdr (Shader Definition Registry)** for the canonical `UsdUVTexture` schema.
- The expected type is named explicitly: `Expected 'float2'`. This is the ground-truth that justifies our Bug 3 + Bug 4 changes.
- The fix is single-character-class: changing the C++ declaration to `value::float2` causes tinyusdz to write `float2 inputs:st`, which clears both default and ARKit profiles.
- Bugs 1 and 2 are **not** caught by `usdchecker` (the wrap-label swap is semantic, the boolean form is canonicalised by pxrUSD itself to `1`/`0`). Their evidence is the unit tests added in our fork commit and the round-trip arguments below; honesty about which checker passes / does not catch which bug avoids over-claiming in the PR.

**Bash-history corroboration that we use this validator routinely:** `rg -i 'usdchecker' ~/.zsh_history | wc -l` returns **46** invocations — predominantly `usdchecker --arkit` against `assimp/build_test/usd/**/<name>_out.usda` and `_out.usdz` outputs over the period 2025-08-26 → 2025-09-19. This is not synthetic — `usdchecker` was the daily ground-truth driver for the assimp 3MF/USDZ export work that surfaced Bug 3 in the first place.

#### Assimp USD Documentation Trail (2026-04-17)

`taucad/assimp` commit [`122528269`](https://github.com/taucad/assimp/commit/122528269714542199c236456b2dcf813e3c698c) ("docs(usd): add skeletal animation technical notes and implementation roadmap", 2026-04-17) added 11 USD-related markdown files under `code/AssetLib/USD/`:

| File                                                                                                                         | Notable content                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usd-spec-notes.md`                                                                                                          | Comprehensive USD/USDZ spec digest. §4.3 "USDZ Best Practices" cites _"Use **usdchecker** for compliance verification"_. §4.4 "USDZ Tools" lists `usdzip`, `usdchecker`, `usdcat`, `usdedit` as the toolchain. §6.1.7 lists `usdchecker compliance` as an exporter feature.                                                                                                                     |
| `usd-skeletal-animation-notes.md`                                                                                            | §"USD CHECKER ANALYSIS" (lines 144–147) records a concrete validator failure: `usdchecker --arkit … CesiumMan_out.usda → "Found a UsdSkelBinding property (skel:skeleton), but no SkelBindingAPI applied on the prim … (fails 'SkelBindingAPIAppliedChecker') Failed!"` Lines 207–208 record the post-fix state: `usdchecker --arkit file.usda  # ✅ Only texture warnings (expected)`.         |
| `usd-skeletal-animation-notes-v3.md`                                                                                         | §"Texture Coordinate Data Types and Interpolation" (lines 31–34): direct A/B comparison against an Apple/Blender reference USDA — `Reference: texCoord2f[] primvars:st …` vs `Generated: float2[] primvars:st …` — flags the exact `texCoord2f` ↔ `float2` confusion class that Bug 3 sits inside (different attribute, same root cause: the writer doesn't keep the role-type alias straight). |
| `usd-skeletal-animation-notes-v4.md`                                                                                         | §"MAJOR FIXES VERIFIED ✅" (line 14): _"Texture Coordinate Type — Now correctly uses texCoord2f ✅"_ — proof the v3 mismatch was actively driven to a fixed state.                                                                                                                                                                                                                              |
| `usd-skeletal-animation-notes-apple-v3.md`                                                                                   | §"ADDITIONAL MESH PROPERTIES" (lines 263–306): Apple-reference vs generated diff explicitly calls out _"❌ Wrong UV coordinate type — Should be `texCoord2f[] primvars:st`, not `float2[] primvars:st`"_.                                                                                                                                                                                       |
| `usd-skeletal-animation-progress.md`                                                                                         | §"P2.3: Proper Texture Coordinate Data Type" (lines 43–48): records the assimp-side fix as `uvAttr.set_type_name("float2[]")` → `"texCoord2f[]"` in `USDZExporter.cpp:1872`, with verification that the new output matches the reference.                                                                                                                                                       |
| `usd-skeletal-animation-changes.md`, `usd-skeletal-animation-notes-v2.md`, `usd-skeletal-animation-notes-apple{,-v2,-v4}.md` | Supporting comparison/refactor notes.                                                                                                                                                                                                                                                                                                                                                           |
| `usd-capabilities-summary.md`                                                                                                | Capability matrix. Confirms `UsdUVTexture` and `UsdPrimvarReader_float2` are both expected to be Read+Write supported in TinyUSDZ — i.e. `inputs:st` _must_ connect a `float2` consumer.                                                                                                                                                                                                        |

**Why this matters for PR #1.** Two independent layers in the same pipeline (assimp's USDZ exporter and tinyusdz's USDA writer) hit the _same class_ of `texCoord2f` ↔ `float2` role-type confusion. The assimp layer was driven to ground truth by `usdchecker --arkit` and Apple-reference comparison; the tinyusdz layer is what PR #1 corrects. The assimp doc trail is independent third-party-style evidence — written before the synthetic `usdchecker` reproduction above — that this is a real, observable defect when consumers trust the spec.

#### Recommended additions to the PR #1 description

Before opening the PR, add a "Prior art" subsection to the body so the bot reviewer and the maintainer don't redo the search:

```markdown
## Prior art

I searched lighttransport/tinyusdz for any open or merged PR that
addresses these four bugs and found none. The relevant lines have not
been touched since:

- `pprinter.cc:4060-4061` (Bug 1) — `f2b31a67`, 2022-09-15
- `pprinter.cc::print_typed_attr` (Bug 2) — `0902c19bc`, 2024-05-03
  (refactor, did not add `boolalpha`)
- `usdShade.hh:235` (Bug 3) — `6de4e660e`, 2022-09-13. Note that
  `8e136d13f` (2025-11-02) added a new `uv_set` field directly below
  this line, so the file is actively maintained.

Issue #259 (closed stale 2025-10) reports a related but distinct
serialization defect on `UsdPreviewSurface.inputs:diffuseColor.connect`
in the same subsystem; this PR does not fix #259 but is consistent with
its general theme that the USDA writer for shading nodes needs
correctness work.
```

Suggested PR description:

````markdown
## Summary

Fixes four related correctness defects in the USDA writer that affect any
consumer outside tinyusdz (OpenUSD `usdchecker`, OpenUSD-based DCC tools,
Blender USD importer, etc.). All four problems were discovered while
integrating tinyusdz into a USDZ export pipeline; each is round-trip-clean
within tinyusdz so the bugs only surface when another USD implementation
reads the output.

1. **Swapped `wrapS`/`wrapT` labels in `print_shader_params`** —
   `shader.wrapS` was being printed as `inputs:wrapT` and vice versa, so
   texture wrap modes silently flipped on every write. Round-trips clean
   inside tinyusdz; observable as soon as the file reaches another USD
   implementation. (`src/pprinter.cc`)

2. **Missing `std::boolalpha` in three `pprinter.cc` sites** — boolean
   attributes serialised as `1`/`0` consistently across:
   `print_typed_attr<TypedAttributeWithFallback<T>>` (e.g.
   `GeomMesh::doubleSided`),
   `print_typed_attr<TypedAttributeWithFallback<Animatable<T>>>` (e.g.
   `UsdLuxSphereLight::normalize`,
   `UsdLuxSphereLight::enableColorTemperature`,
   `UsdSkelCollection::includeRoot`), and the shared
   `print_animatable_default<T>` helper that the second overload calls
   into. The USDA grammar accepts both forms and pxrUSD's own `usdcat`
   canonicalises to `1`/`0`, so this is _not_ strictly a spec-compliance
   defect — it is a readability and reference-corpus consistency
   improvement: Apple's USDZ reference assets and the per-attribute USDA
   examples in the spec use `true`/`false`. Happy to drop this hunk if
   you'd prefer to keep parity with pxrUSD's canonical writer; it's
   bundled here because it sits within the same printer template family
   the other fixes touch. (`src/pprinter.cc`)

3. **`UsdUVTexture::st` typed as `texcoord2f` instead of `float2`** — the
   [UsdPreviewSurface spec](https://openusd.org/release/spec_usdpreviewsurface.html)
   defines `inputs:st` as `float2`. Using `texcoord2f` causes
   `UsdShadeShader` Sdr-compliance validation to fail and breaks
   connections to `UsdPrimvarReader_float2` / `UsdTransform2d` outputs.
   The 2024-06 cast test in `tests/unit/unit-value-types.cc` documents
   the type confusion as a runtime workaround; this PR fixes the
   underlying declaration. (`src/usdShade.hh`)

4. **`ConvertUVTexture` reads `texture.st` as `texcoord2f`** — coupled
   consumer of #3; updated in lockstep. (`src/tydra/render-data.cc`)

## Integration context (how this consumer wires tinyusdz)

For context on how tinyusdz is being consumed downstream, this PR
originates from [`taucad/assimp`](https://github.com/taucad/assimp)
(a fork of `assimp/assimp`) which vendors tinyusdz inside
`code/AssetLib/USD/` as the backbone of its USDA / USDC / USDZ
import + export pipeline. tinyusdz is fetched via CMake `FetchContent`
(see `code/CMakeLists.txt`, `TINYUSDZ_GIT_TAG`).

Browse the integration in our fork (USD subtree only):

- **Live tree at HEAD** —
  <https://github.com/taucad/assimp/tree/master/code/AssetLib/USD>
- **Commit history filtered to `code/AssetLib/USD/`** (46 fork-only
  commits since divergence base `8ef3838b`) —
  <https://github.com/taucad/assimp/commits/master/code/AssetLib/USD>
- **Full fork-vs-upstream diff** (open the GitHub "Files changed" filter
  and scope to `code/AssetLib/USD/`) —
  <https://github.com/assimp/assimp/compare/master...taucad:assimp:master>

Key files that exercise the tinyusdz writer surface this PR fixes:

| File                                                    | Role                                                          | Where the bugs surface                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `USDZExporter.cpp` (33 fork commits)                    | Drives `tinyusdz::tydra::Stage` writes for USDA + USDZ output | `UsdUVTexture::st` (Bugs 3 + 4), `wrapS`/`wrapT` (Bug 1) on every textured material |
| `USDLoaderImplTinyusdz.cpp` (12 fork commits)           | Reads tinyusdz `RenderScene` via `ConvertMesh`                | Bug 5 (PR #2) — degenerate-face hard error                                          |
| `usdz-writer.cc` (4 fork commits)                       | Direct USDZ archive writer                                    | Consumes `pprinter.cc` output for USDA inside `.usdz`                               |
| `usd-spec-notes.md`, `usd-skeletal-animation-notes*.md` | In-repo audit notes (added 2026-04-17)                        | Document the daily `usdchecker --arkit` workflow this PR was developed against      |

This is offered purely as integration context — the PR only changes
files inside `lighttransport/tinyusdz`. No assimp-side changes are
required for the fix to land; on our side we simply unpin
`TINYUSDZ_GIT_TAG` from a fork SHA back onto a tagged upstream release
once the PR merges.

## Reference-validator evidence (Bug 3 / 4)

I verified Bug 3 against `usdchecker` from **Apple USD Tools 0.25.2** on
macOS using a minimal `UsdPreviewSurface` + `UsdUVTexture` +
`UsdPrimvarReader_float2` graph. Only the `inputs:st` declaration differs
between the two files.

**Buggy form (today's tinyusdz output):**

```text
$ usdchecker bug34-buggy.usda
Validation Result with no explicit variants set
Error: (usdShadeValidators:ShaderSdrCompliance.MismatchedPropertyType)
  Incorrect type for /Root/MyMat/Tex.inputs:st. Expected 'float2'; got ''.
Failed!  (exit 1)

$ usdchecker --arkit bug34-buggy.usda
Validation Result with no explicit variants set
Error: (usdShadeValidators:ShaderSdrCompliance.MismatchedPropertyType)
  Incorrect type for /Root/MyMat/Tex.inputs:st. Expected 'float2'; got ''.
Failed!  (exit 1)
```

**Fixed form (this PR):**

```text
$ usdchecker bug34-fixed.usda
Validation Result with no explicit variants set
Success!  (exit 0)

$ usdchecker --arkit bug34-fixed.usda
Validation Result with no explicit variants set
Success!  (exit 0)
```

The validator class is `usdShadeValidators:ShaderSdrCompliance.MismatchedPropertyType`;
"Expected 'float2'" is the canonical type from pxrUSD's Sdr (Shader
Definition Registry) for `UsdUVTexture.inputs:st`. A minimal repro
fixture and the matching fixed file are attached in the PR.

Bugs 1 and 2 are not surfaced by `usdchecker` (Bug 1 is a label swap that
both ends of tinyusdz round-trip cleanly; Bug 2 is a serialisation form
that pxrUSD itself accepts and writes). They are covered by the unit
tests below.

## Tests

New cases in `tests/unit/unit-pprint.cc`, registered in
`tests/unit/unit-main.cc`:

- `pprint_uvtexture_wrap_test` — sets `wrapS=Repeat`, `wrapT=Clamp`,
  asserts the printed output contains `inputs:wrapS = "repeat"` AND
  `inputs:wrapT = "clamp"`, and explicitly asserts the _swapped_ forms
  do **not** appear (Bug 1).
- `pprint_bool_attr_test` — exercises
  `TypedAttributeWithFallback<bool>` via `GeomMesh::doubleSided`, both
  `set_value(true)` and `set_value(false)` cases, asserting
  `doubleSided = true`/`doubleSided = false` (not `1`/`0`) (Bug 2,
  overload A).
- `pprint_bool_animatable_attr_test` — exercises
  `TypedAttributeWithFallback<Animatable<bool>>` (a separate printer
  overload) via `SphereLight::normalize`, both true and false cases,
  asserting `inputs:normalize = true`/`false` (not `1`/`0`) (Bug 2,
  overload B). This test was authored after observing the original
  `48e327dd` patch only fixed overload A; without the matching
  `std::boolalpha` insertions in `print_animatable_default` and
  `print_typed_attr<TypedAttributeWithFallback<Animatable<T>>>` this
  test fails. Drop this whole hunk if you'd prefer canonical-pxrUSD
  parity (see Bug 2 caveat above).
- `pprint_uvtexture_st_type_test` — covers Bug 3 in two forms:
  1. **Fallback form:** `tex.st.set_value(value::float2{0.5f, 0.5f})`,
     asserts `to_string(tex)` contains `float2 inputs:st` and **not**
     `texcoord2f inputs:st`.
  2. **Connection form** (the actual `usdchecker` failure case from
     §"Reference-validator evidence" above): `tex.st.set_connection(
Path("/Root/Mat/StReader", "outputs:result"))`, asserts the
     output contains `float2 inputs:st.connect` and **not**
     `texcoord2f inputs:st.connect`.

`ctest` passes locally on macOS clang (all 20 unit tests). Full
reproduction of the `usdchecker` outputs above is from
`/tmp/tinyusdz-pr1-checks/bug34-combined-{buggy,fixed}.usda` (uploaded
in the PR as `tests/usda/uvtexture-st-type-{buggy,fixed}.usda`).

## Disclosure

This change was prepared with AI assistance (Claude / Cursor). All code,
tests, and the `usdchecker` reproduction above have been reviewed and
verified by a human contributor.
````

### PR #2 — Skip degenerate faces in `ConvertMesh` (Bug 5)

| Field               | Value                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source branch**   | `taucad:fix/skip-degenerate-faces` (cherry-pick the `src/tydra/render-data.cc` portion of `f385e5fe` onto `upstream/dev`)                                                               |
| **Target**          | `lighttransport/tinyusdz:dev`                                                                                                                                                           |
| **Files**           | `src/tydra/render-data.cc` only — the ARM32 hunk in the original commit is now empty after R3                                                                                           |
| **Tests**           | Add a new fixture: a mesh with one degenerate face (count `< 3`) followed by valid faces. Assert the conversion succeeds and the degenerate face is skipped from `usdFaceVertexIndices` |
| **Suggested title** | `Skip degenerate faces in RenderSceneConverter::ConvertMesh instead of erroring`                                                                                                        |

Suggested PR description:

````markdown
## Summary

`RenderSceneConverter::ConvertMesh` currently aborts the entire scene
conversion when any face has fewer than 3 vertices:

```cpp
if (counts[i] < 3) {
  PUSH_ERROR_AND_RETURN(
      fmt::format("faceVertexCounts[{}] contains invalid value {}. The "
                  "count value must be >= 3",
                  i, counts[i]));
}
```
````

This is overly strict for real-world USD content, where a single
degenerate face — often introduced by an earlier export pipeline — can
make an otherwise-valid mesh unusable. OpenUSD's `UsdGeomMesh` validation
treats degenerate faces as warnings, not hard errors, and other
USD-aware importers (Blender, Houdini) skip them silently.

This change skips degenerate faces, removes their indices from
`usdFaceVertexIndices`, and returns `true` with an empty mesh if every
face was degenerate. `MeshVisitor` is updated to skip registering empty
meshes with `meshMap` and `meshes` so empty meshes don't leak into the
render scene.

Two related upstream commits address polygon-area degeneracy in tangent
computation (`b41e1ddb`, `1fd99d84`) but neither relaxes the
`counts[i] < 3` precondition; this PR is complementary.

## Tests

New fixture in `tests/...` (location TBD): a mesh whose
`faceVertexCounts` contains `[2, 4, 3]`. Assert that:

- `ConvertMesh` returns `true`
- The degenerate face's indices are excluded from `usdFaceVertexIndices`
- The two surviving faces have correct vertex orderings

## Disclosure

This change was prepared with AI assistance (Claude / Cursor). All code
and tests have been reviewed and verified by a human contributor.

````

### Mechanics for Generating the PR Branches

```bash
cd repos/assimpjs/assimp/contrib/tinyusdz/autoclone/tinyusdz_repo-src

git fetch upstream dev   # ensure we have the latest dev tip

# PR #1 — UVTexture fixes. Two fork commits land here; squash to one.
git checkout -b fix/uvtexture-serialization upstream/dev
git cherry-pick 48e327dd 67a2d664
git reset --soft upstream/dev      # collapse to a single commit
git commit -m "Fix UsdUVTexture serialization: wrapS/wrapT labels, boolean formatting, inputs:st type"
clang-format -i src/pprinter.cc src/usdShade.hh src/tydra/render-data.cc \
                tests/unit/unit-pprint.cc tests/unit/unit-pprint.h \
                tests/unit/unit-main.cc
git diff --stat   # sanity check
git push origin fix/uvtexture-serialization

# PR #2 — degenerate face skip
# f385e5fe touched both render-data.cc (Bug 5) and stb_image_resize2.h (Bug 6).
# After R3, the stb_image_resize2.h hunk is reverted, so we want only the
# render-data.cc + MeshVisitor changes.
git checkout -b fix/skip-degenerate-faces upstream/dev
git checkout f385e5fe -- src/tydra/render-data.cc
clang-format -i src/tydra/render-data.cc
git commit -m "Skip degenerate faces in RenderSceneConverter::ConvertMesh instead of erroring"
git push origin fix/skip-degenerate-faces
````

Before opening either PR, validate locally:

```bash
mkdir -p build && cd build
cmake -DTINYUSDZ_BUILD_TESTS=ON ..
make -j
./test_tinyusdz                                # ctest binary; must pass clean
cd ..
python tests/tydra_to_renderscene/runner.py    # required for PR #2 specifically
```

Both PRs should be opened as **draft** initially per the [`submit-pr`](../../.agent/skills/submit-pr/SKILL.md) workflow. Targeting `lighttransport/tinyusdz:dev`, use the PR descriptions above verbatim with file paths adjusted as needed, and include the `ctest` and Python runner output in the PR body as testing evidence (the maintainer is strict about reproducible signals; see [Issue Hygiene](#issue-hygiene-transferable-to-pr-descriptions)).

## Code Examples

### Bug 1 fix (verbatim from `48e327dd`)

```cpp
// src/pprinter.cc::print_shader_params
- ss << print_typed_token_attr(shader.wrapS, "inputs:wrapT", indent);
- ss << print_typed_token_attr(shader.wrapT, "inputs:wrapS", indent);
+ ss << print_typed_token_attr(shader.wrapS, "inputs:wrapS", indent);
+ ss << print_typed_token_attr(shader.wrapT, "inputs:wrapT", indent);
```

### Bug 2 fix

```cpp
// src/pprinter.cc::print_typed_attr<T>
  std::stringstream ss;
+ ss << std::boolalpha;
```

### Bug 3 + Bug 4 fix

```cpp
// src/usdShade.hh
- TypedAttributeWithFallback<Animatable<value::texcoord2f>> st{value::texcoord2f{0.0f, 0.0f}};
+ TypedAttributeWithFallback<Animatable<value::float2>>     st{value::float2{0.0f, 0.0f}};

// src/tydra/render-data.cc::ConvertUVTexture
- Animatable<value::texcoord2f> fallbacks = texture.st.get_value();
- value::texcoord2f uv;
+ Animatable<value::float2> fallbacks = texture.st.get_value();
+ value::float2 uv;
```

### Bug 5 fix (excerpt)

```cpp
// src/tydra/render-data.cc::ConvertMesh
+ std::vector<uint32_t> filteredIndices;
+ filteredIndices.reserve(dst.usdFaceVertexIndices.size());
  for (size_t i = 0; i < counts.size(); i++) {
    if (counts[i] < 3) {
-     PUSH_ERROR_AND_RETURN(fmt::format("faceVertexCounts[{}] contains invalid value {}. The count value must be >= 3", i, counts[i]));
+     sumCounts += size_t(counts[i]);
+     continue;
    }
    ...
+   for (size_t j = 0; j < size_t(counts[i]); j++) {
+     filteredIndices.push_back(dst.usdFaceVertexIndices[sumCounts + j]);
+   }
    sumCounts += size_t(counts[i]);
  }
+ dst.usdFaceVertexIndices = std::move(filteredIndices);
+ if (dst.usdFaceVertexCounts.empty()) return true;
```

## Appendix

### Fork Topology

#### Original state (audit snapshot, 2026-04-16)

```
upstream lighttransport/tinyusdz origin/release: 11a2d361 (HEAD)
                                                 │
                                                 ├── 5 commits we don't have (NRVO fix, README, issue templates)
                                                 │
                                                 0011b4ea  ← shared base; also our taucad/tinyusdz origin/release HEAD
                                                 │
taucad/tinyusdz origin/main / HEAD ──────────────┤
                                                 │
                                                 48e327dd  fix UsdUVTexture serialization (Bugs 1-4)
                                                 │         ← assimp CMakeLists pinned THIS commit
                                                 │
                                                 f385e5fe  fix: skip degenerate faces + ARM32 NEON stubs (Bugs 5-6)
                                                           ← was NOT pinned in assimp
```

#### Current state (post R3–R5, 2026-04-17)

```
upstream lighttransport/tinyusdz upstream/release: 11a2d361
                                                   │
taucad/tinyusdz origin/release == origin/main  ────┤
                                                   │
                                                   48e327dd  fix UsdUVTexture serialization (Bugs 1-4)
                                                   │
                                                   f385e5fe  fix: skip degenerate faces + ARM32 NEON stubs (Bugs 5-6)
                                                   │
                                                   a852eb09  Merge upstream lighttransport/tinyusdz release (11a2d361)
                                                   │
                                                   23d5718b  Remove obsolete ARM32 NEON stub workaround
                                                   │
                                                   67a2d664  Complete std::boolalpha coverage + broaden pprint tests (R7)
                                                             ← assimp CMakeLists pins THIS commit (taucad/assimp@66d28a9c)
                                                             ← assimpjs submodule points HERE (taucad/assimpjs@68d4221)
```

`origin/main` and `origin/release` on `taucad/tinyusdz` now point at the same SHA (`67a2d664`); `release` is the canonical branch going forward to mirror upstream's PR convention.

### Files Inspected

- `repos/assimpjs/assimp/code/CMakeLists.txt` (lines 1018–1046) — `TINYUSDZ_GIT_TAG` pin and clone config (post-cleanup: no `PATCH_COMMAND`)
- `repos/assimpjs/assimp/contrib/tinyusdz/README.md` — autoclone notes
- ~~`repos/assimpjs/assimp/contrib/tinyusdz/patches/tinyusdz.patch`~~ — **deleted** as part of R3
- `repos/assimpjs/assimp/contrib/tinyusdz/autoclone/tinyusdz_repo-src/.git` — fork checkout, now on `release` branch at `23d5718b`
- `repos/tinyusdz` — fresh upstream clone (`origin/release` `11a2d361`, `origin/dev` `960dba34`)

### Read-only Git Commands Used

```bash
git status                                    # both repos
git remote -v
git log --oneline -10
git branch -a
git merge-base origin/main HEAD
git log --oneline origin/main..HEAD
git show <sha> --stat
git show <sha> -- <files>
git show <branch>:<file>                      # extract content at branch
git log --format='%h %ad %s' --date=short -- <file>
git branch -r --contains <sha>
gh issue list --repo lighttransport/tinyusdz --state all --search '...'
```

No write operations were performed against either repo during the original 2026-04-16 audit.

### Implementation Log (2026-04-17)

After the audit, R3–R5 were executed across the three repos in this order:

1. **Sync `taucad/tinyusdz` with upstream** — merged `lighttransport/tinyusdz:release` (`11a2d361`) into `taucad/tinyusdz:main`. No conflicts. (Merge commit `a852eb09`.)
2. **Drop the ARM32 NEON workaround** — reverted the no-op stubs in `src/external/stb_image_resize2.h` so the file is byte-for-byte identical to upstream. (Commit `23d5718b`.)
3. **Push `taucad/tinyusdz`** — updated `origin/main` to `23d5718b`.
4. **Update `assimp` CMake** — bumped `TINYUSDZ_GIT_TAG` to `23d5718bb87598420d3baaf44d63befbbba4be49`, removed the `PATCH_COMMAND` block from `assimp/code/CMakeLists.txt`, and deleted `assimp/contrib/tinyusdz/patches/tinyusdz.patch` and its `README.md`. (`taucad/assimp` commits leading up to `e46f5873`.)
5. **Push `taucad/assimp`** — updated `origin/master` to `e46f5873`. (Earlier work in this conversation already corrected the original detached-HEAD/`main`-vs-`master` confusion.)
6. **Bump `assimpjs` submodule** — updated the `assimp` submodule pointer in `taucad/assimpjs:main` to `e46f5873` and pushed. (Commit `b010cc8`.)
7. **Standardise canonical branch** — fast-forwarded `taucad/tinyusdz:release` to match `main` (both now `23d5718b`) so future upstream PRs can be cut cleanly off `release`, mirroring `lighttransport/tinyusdz`'s PR convention. The CMake comment in `assimp/code/CMakeLists.txt` was rewritten to describe the chain in `release` terms; the `assimpjs` submodule pointer was re-bumped to capture this comment-only assimp commit.
8. **SHA hardening** — during step 7 verification, an earlier copy of `TINYUSDZ_GIT_TAG` had truncated/fabricated SHA characters; the value was corrected to the full `git rev-parse HEAD` output of `taucad/tinyusdz:release` and re-committed before any downstream build could fail.
9. **PR #1 evidence consolidation (2026-04-17 PM)** — read all 11 USD docs added in `taucad/assimp@122528269` for OpenUSD/`usdchecker` references; mined `~/.zsh_history` for `usdchecker` invocations (46 hits, predominantly `--arkit` against `assimp/build_test/usd/**/*_out.usda`/`.usdz`); built a minimal `UsdPreviewSurface`+`UsdUVTexture`+`UsdPrimvarReader_float2` synthetic fixture under `/tmp/tinyusdz-pr1-checks/` and ran `usdchecker` (Apple USD Tools 0.25.2) against the buggy and fixed forms — buggy fails with `usdShadeValidators:ShaderSdrCompliance.MismatchedPropertyType — Expected 'float2'; got ''` on both default and `--arkit` profiles, fixed passes both. Folded all evidence into the [Concrete usdchecker Validation Evidence](#concrete-usdchecker-validation-evidence-2026-04-17) and [Assimp USD Documentation Trail](#assimp-usd-documentation-trail-2026-04-17) subsections under PR #1; corrected Bug 2 framing (pxrUSD canonicalises booleans to `1`/`0`, so the bug is readability, not strict spec compliance); rewrote the suggested PR #1 description to lead with the validator output.
10. **PR #1 test coverage hardening / R7 (2026-04-17 PM)** — review of the `48e327dd` patch surfaced that `std::boolalpha` was added to one of three relevant `pprinter.cc` overloads, leaving `print_animatable_default` and `print_typed_attr<TypedAttributeWithFallback<Animatable<T>>>` still emitting `1`/`0` for real `Animatable<bool>` consumers (UsdLux `SphereLight`/`CylinderLight` `inputs:normalize`/`inputs:enableColorTemperature`, UsdSkel `collection:*:includeRoot`). Added `std::boolalpha` to both missing sites; added `pprint_bool_animatable_attr_test` (verified to fail without the source fix, pass with it), the false-case for `pprint_bool_attr_test`, and a connection-form (`tex.st.set_connection(...)`) assertion for `pprint_uvtexture_st_type_test` mirroring the actual `usdchecker` failure case. Built `unit-test-tinyusdz` via `cmake -DTINYUSDZ_BUILD_TESTS=ON` and ran it: all 20 unit tests pass. Pushed as `taucad/tinyusdz@67a2d664` (both `release` and `main`); bumped `assimp/code/CMakeLists.txt` `TINYUSDZ_GIT_TAG` from `23d5718b` to `67a2d664` and pushed as `taucad/assimp@66d28a9c`; rebumped `assimpjs` submodule pointer and pushed as `taucad/assimpjs@68d4221`. Updated this doc — Executive Summary, Recommendations table (added R7), Proposed Upstream PRs section (squash mechanics, files list, tests row, Bug 2 description), Fork Topology current state.

After step 10, all three repos are in a consistent state and the submodule chain `assimpjs → assimp → tinyusdz` resolves cleanly. The remaining work (R1, R2, R6) is purely upstream-facing and is captured in [Proposed Upstream PRs](#proposed-upstream-prs).
