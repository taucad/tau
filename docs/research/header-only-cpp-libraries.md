---
title: 'Header-Only C++ Libraries — Concept Reference'
description: 'Reference explainer on what header-only C++ libraries are, why they exist, their trade-offs, and where they appear across the tau monorepo (rapidjson, OCCT NCollection, libc++, embind).'
status: active
created: '2026-05-20'
updated: '2026-05-20'
category: reference
related:
  - docs/research/emscripten-optimization-flags.md
  - docs/research/occt-wasm-module-system.md
  - docs/research/ocjs-libclang-target-triple-mismatch-poc.md
---

# Header-Only C++ Libraries — Concept Reference

A foundational reference on header-only C/C++ libraries: what they are, why they're significant, when to use them, and how they appear across the tau monorepo's C++/WASM toolchain.

## Executive Summary

A **header-only** C/C++ library is one whose entire implementation lives in `.h`/`.hpp` files — there are no separate `.c`/`.cpp` files to compile and no static or shared archives to link against. The consumer `#include`s the headers and the compiler instantiates everything inside the consumer's own translation units.

This pattern emerged because **C++ templates require their bodies to be visible at the point of use** (the compiler must see the template body to instantiate `std::vector<MyType>`), so any generic library is forced into header-only form. From there it became the dominant distribution model for modern utility libraries because it eliminates build coordination, sidesteps the C++ ABI problem, and enables aggressive cross-boundary inlining — at the cost of substantially longer compile times.

Header-only is especially significant in **WebAssembly / Emscripten contexts** where pre-built native binaries are useless (wrong architecture, wrong ABI) and everything must be compiled from source anyway. In the tau monorepo, `rapidjson` is the canonical header-only dependency; `FreeType`, `OCCT`'s `.cxx` sources, and `libc++` are not.

## Problem Statement

The term "header-only library" appears throughout build documentation, dependency manifests, and architecture discussions in this repo (e.g. `repos/opencascade.js/BUILD_SYSTEM.md` describes rapidjson as "header-only" and FreeType as not). Without a shared reference, contributors hit recurring confusion:

- "Why does rapidjson have no separate build step but FreeType does?"
- "Why does adding `#include <nlohmann/json.hpp>` make my build 10× slower?"
- "Why can't I link against a precompiled `libfoo.a` from the OS?"
- "Why are OCCT's `NCollection_*<T>` containers special when we enumerate them in the bindgen?"

All of these reduce to one concept. This doc captures it once so the rest of the workspace can link here rather than re-explaining.

## Definition

> A **header-only library** is a C or C++ library whose complete implementation is provided via header files (`.h`, `.hpp`, `.hxx`, `.ipp`), with no separately compiled translation units. Consumers obtain the library by adding its include directory to their compile flags and `#include`-ing its headers; no linker step against a library binary is required.

The phrase is sometimes informally extended to libraries that _can_ be used header-only (e.g. `fmt` with `-DFMT_HEADER_ONLY`) but ship with an optional precompiled mode for faster builds.

## How It Works Mechanically

A traditional C++ library splits into two halves: **declarations** in `.h` (what types and functions exist) and **implementations** in `.cpp` (the bodies). The `.cpp` files compile once into an object archive (`.a`, `.lib`) or shared object (`.so`, `.dll`, `.dylib`), and every consumer links against the resulting binary.

A header-only library puts _both_ halves in the header. To remain legal under C++'s **One Definition Rule** (ODR), implementations are written using language features that explicitly permit multiple identical definitions across translation units:

| Mechanism                                 | Why it permits header-only                                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`inline` functions**                    | The language explicitly allows `inline` definitions to appear in every TU that `#include`s them. The linker dedupes them into one symbol at link time via weak linkage.                                                                           |
| **Templates**                             | Function and class templates _require_ their definitions to be visible at the point of instantiation — the compiler can't generate code for `std::vector<MyType>` without seeing the template body. Templates are header-only by language design. |
| **`constexpr` / `consteval`**             | Bodies must be visible to evaluate at compile time.                                                                                                                                                                                               |
| **`inline` static data members** (C++17+) | Allow class-scope variables to live entirely in headers without needing a `.cpp` definition.                                                                                                                                                      |
| **`inline` variables** (C++17+)           | Same idea at namespace scope.                                                                                                                                                                                                                     |

When you `#include "rapidjson/document.h"` and declare `rapidjson::Document doc;`, the compiler reads the entire `Document` class definition from the header and instantiates everything inside _your_ translation unit. No external library is consulted at link time.

## Why Header-Only Libraries Exist

Five compounding drivers, in roughly the order they became significant historically:

### 1. Templates forced the issue

Once a library is generic over types — `std::vector<T>`, `std::optional<T>`, expression-template math libraries like Eigen — it **cannot** be precompiled. The compiler needs the template body to instantiate `T = your_custom_struct` in your TU. Header-only isn't a stylistic choice for template libraries; it's the only legal form. As C++ became more template-heavy from C++98 → C++11 → C++17 → C++20, the header-only model became the default for utility libraries.

### 2. Zero build integration

Consuming a header-only library is the simplest possible workflow: drop the folder into `deps/`, add `-Ideps/foo/include` to your compile command, done. No `./configure && make && make install`, no `find_package(Foo)` in CMake, no version-matched `.so` to track. This matters enormously for:

- Cross-platform code (no per-OS build dance)
- Embedded targets (no native build toolchain available)
- Exotic toolchains like Emscripten (pre-built binaries don't exist for wasm32 anyway)
- CI pipelines (one fewer thing that can break)

### 3. Perfect ABI match

Because the consumer's own compiler compiles the library's code in the consumer's own translation units, there is **no possibility of ABI mismatch**. The library is automatically built with:

- Same compiler version
- Same `-std=c++17`/`-std=c++20`/`-std=c++23`
- Same exception model (`-fno-exceptions`, `-fwasm-exceptions`, etc.)
- Same standard library (libc++ vs libstdc++, and the exact version of each)
- Same sanitiser flags
- Same `_GLIBCXX_USE_CXX11_ABI` value

Compare this to dropping a `libfoo.so` built with GCC 11 + libstdc++ into a Clang 18 + libc++ project — you can hit silent memory corruption on `std::string` layout differences. Header-only sidesteps the entire C++ ABI problem.

### 4. Aggressive inlining

Because every function body is visible at every call site, the optimiser can inline freely across what would normally be a library boundary. A header-only matrix library can collapse `A * B * C` into a single fused loop with no temporaries; a precompiled `libmatrix.so` cannot, because the optimiser sees only the call boundary. For performance-sensitive numerical, serialisation, and formatting code (Eigen, GLM, rapidjson, nlohmann/json, `fmt`), this often outweighs the compile-time cost.

### 5. Trivially vendorable

You can copy a header-only library into your repo and commit it as source. No submodule, no package manager, no build-step coordination. This is how `stb_image.h` became ubiquitous in game development — a single ~7000-line header you paste into your project and use forever.

## Trade-offs

| Aspect                              | Header-only                      | Precompiled                             |
| ----------------------------------- | -------------------------------- | --------------------------------------- |
| **Install/setup**                   | `#include` and go                | Build, install, configure linker        |
| **Cross-compilation**               | Trivial (compile in target)      | Need target-built binaries              |
| **ABI mismatch risk**               | Zero                             | High (compiler/stdlib/flags must match) |
| **Inlining across boundary**        | Full                             | None (only LTO can partially recover)   |
| **Compile time per consumer TU**    | High (re-parse + re-instantiate) | Low (just link)                         |
| **Object file size before linking** | Large (weak-symbol copies)       | Small                                   |
| **Final binary size**               | Same after linker dedup          | Same                                    |
| **Implementation hiding**           | None (headers leak everything)   | Yes (Pimpl, `.so` private symbols)      |
| **Cross-language FFI**              | Hard (need C-shim layer)         | Easy (link against `.so`)               |
| **Versioning enforcement**          | Informal (no linkable artifact)  | Strict (sonames)                        |
| **Refactoring impact**              | Recompiles all consumers         | Often just relink                       |

### When compile time matters

The biggest practical cost. A project with 100 `.cpp` files each `#include`-ing `nlohmann/json.hpp` parses approximately 25,000 lines × 100 = **2.5 million lines of JSON library code per build**. Mitigations exist but each has limits:

- **Precompiled headers (PCH)**: parse the headers once into a binary, reuse in every TU. Used by `repos/opencascade.js` for OCCT — see `BUILD_SYSTEM.md` § Component Glossary G. Gives the typical ~25× speedup.
- **Explicit template instantiation**: declare `extern template class std::vector<int>;` in headers and provide `template class std::vector<int>;` once in a `.cpp`. Pushes specific instantiations into a single TU. Used by some "hybrid" libraries.
- **C++20 modules**: the long-term solution. Headers become `.cppm` modules that compile once. Toolchain support is still patchy in 2026.
- **Header-only mode toggles**: `fmt` ships with `FMT_HEADER_ONLY` undefined by default and consumers link against `libfmt.a`. The library is _capable_ of header-only but doesn't default to it.

### When ABI matching matters more

For systems where the consumer's build environment is _known and controlled_ (a single-team monorepo, a CI-controlled pipeline), precompiled libraries are tolerable. For libraries published to the world to be consumed by unknown projects, header-only is much safer.

## Decision Guide

When considering whether to write or adopt a library in header-only form:

| Situation                                                         | Recommendation                                                              |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Template-heavy API (containers, algorithms, expression templates) | **Header-only** — language forces it                                        |
| Pure utility code (strings, hashes, math, parsers)                | **Header-only** — convenience usually outweighs compile cost                |
| I/O, system calls, large state machines, codecs                   | **Precompiled** — compile cost dominates and inlining gain is small         |
| Need ABI stability across consumer toolchains                     | **Header-only** — eliminates the problem                                    |
| Need to be called from non-C++ (Python, Rust, JS)                 | **Precompiled C shim** — header-only templates can't cross the FFI boundary |
| Large library (>10 KLOC) consumed widely                          | **Hybrid** (provide both modes, like `fmt`)                                 |
| Targeting WebAssembly / cross-compile to exotic targets           | **Header-only** — eliminates target-build coordination                      |
| Library has trade secrets in implementation                       | **Precompiled** — headers leak everything                                   |

## Significance in WebAssembly / Emscripten Contexts

Header-only libraries are a particularly natural fit for Emscripten-based builds:

1. **The toolchain is cross-compiling.** Distributing precompiled `.a` archives for `wasm32-unknown-emscripten` is uncommon; almost everyone ships source and lets `emcc` compile in-target. Header-only short-circuits this entirely — there's no archive to build in the first place.

2. **Pre-built native binaries are useless.** A `libfoo.so` from `apt install libfoo-dev` is x86_64 ELF and cannot be linked into wasm. You'd need to rebuild from source anyway, so the apparent "easier consumption" of precompiled native packages evaporates.

3. **ABI portability matters more, not less.** Emscripten's wasm ABI evolves (memory64, threads, exceptions, GC); header-only avoids tying you to any specific snapshot of a precompiled artifact.

4. **Tree-shaking is more effective.** Because the compiler sees the full implementation, dead-code elimination at the wasm link step can drop unused functions more aggressively than it can across a precompiled boundary.

5. **It composes with PCH.** Header-only's compile-time cost is the main drawback, and Emscripten supports the same `-Xclang -fno-pch-timestamp` PCH workflow as native clang, recovering most of the lost time.

This is one reason WebAssembly C++ codebases skew heavily header-only relative to native server C++ codebases of similar size.

## Examples Across the Ecosystem

| library                                                        | what it is                                                                                                                                                      | header-only?                                                |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Eigen**                                                      | Linear algebra (vectors, matrices, decompositions)                                                                                                              | yes                                                         |
| **GLM**                                                        | Graphics-focused vector/matrix math (`vec3`, `mat4`)                                                                                                            | yes                                                         |
| **nlohmann/json**                                              | JSON parser with STL-like API                                                                                                                                   | yes                                                         |
| **rapidjson**                                                  | JSON parser optimised for speed                                                                                                                                 | yes                                                         |
| **fmt**                                                        | String formatting (the C++23 `std::format` ancestor)                                                                                                            | optionally — has `FMT_HEADER_ONLY` mode                     |
| **{fmt}**'s spdlog                                             | Logging                                                                                                                                                         | optionally                                                  |
| **stb\_\*** family (`stb_image`, `stb_truetype`, `stb_vorbis`) | Single-file media libraries using the `STB_*_IMPLEMENTATION` macro to gate function bodies into one TU                                                          | yes                                                         |
| **doctest**, **Catch2 v2**                                     | Test frameworks                                                                                                                                                 | yes                                                         |
| **Catch2 v3**                                                  | Test framework                                                                                                                                                  | **no** — became a compiled library for compile-time reasons |
| **Boost**                                                      | Mixed — some libraries header-only (`Boost.Optional`, `Boost.Hana`, `Boost.MPL`), others compiled (`Boost.Filesystem` pre-C++17, `Boost.Regex`, `Boost.Thread`) | per-library                                                 |
| **range-v3**, **expected**, **outcome**                        | Modern utility libraries                                                                                                                                        | yes                                                         |
| **GoogleTest**, **GoogleMock**                                 | Test frameworks                                                                                                                                                 | no — compiled archives                                      |
| **glog**, **gflags**                                           | Google logging/flags                                                                                                                                            | no                                                          |
| **FreeType**, **HarfBuzz**, **ICU**                            | Font rendering, text shaping, Unicode                                                                                                                           | no — substantial C implementation files                     |

The pattern: **template-heavy → header-only; I/O-heavy or large non-generic implementations → compiled**.

## How Header-Only Appears in the tau Monorepo

The C++/WASM toolchain spans several packages with different header-only profiles:

### rapidjson (header-only)

The canonical example. Used by OCCT for glTF I/O. Cloned to `repos/opencascade.js/deps/rapidjson/` and consumed via `-Ideps/rapidjson/include`. **There is no `librapidjson.a` ever built**; `emcc` compiles its templates directly into our `.wasm` as part of the OCCT translation units that include it. Documented in `repos/opencascade.js/BUILD_SYSTEM.md` § Component Glossary E.

### FreeType (not header-only)

The contrast case. Substantial `.c` implementation under `base/`, `truetype/`, `sfnt/`, `cff/`, etc. Our pipeline has explicit `emcc` compile steps for these `.c` files, producing `.o` archives that `wasm-ld` links into the final wasm. This is why the pipeline treats FreeType differently from rapidjson — the difference is structural, not stylistic.

### OCCT (not header-only, but template-heavy)

OCCT itself is a precompiled library — its `Standard_EXPORT` macros emit visibility attributes and its `.cxx` files compile into archives. **But** OCCT exposes template-heavy APIs (`NCollection_*<T>`, `Handle<T>`) that _are_ effectively header-only within their `.hxx` files. Instantiations like `NCollection_HArray1<gp_Pnt>` are realised at the consumer's compile site, not in OCCT's archives. This is why the bindgen has a "discover" pass that enumerates which template instantiations exist anywhere in OCCT's public API — they have no precompiled symbols to introspect; the only way to find them is to walk the headers with libclang. See `docs/research/ocjs-libclang-target-triple-mismatch-poc.md` for the consequences when that walk fails.

### libc++ (not header-only — but its templates effectively are)

libc++ ships both as headers (`std::vector`, `std::optional`, …) and as a precompiled `libc++.{a,so,dylib}` containing the non-template parts (`std::string`'s long-string allocator, `std::cout` global, exception runtime). Most STL usage instantiates templates from headers in your TU; only a small handful of symbols are actually drawn from the precompiled archive. This is why "libc++ headers" and "libc++ runtime" can drift in version while still appearing to work — until they don't (the version-skew investigation in `docs/research/ocjs-libclang-target-triple-mismatch-poc.md` documents exactly this failure mode).

### embind (header-only template machinery)

Emscripten's C++/JS binding system at `system/include/emscripten/bind.h`. Pure templates and macros; expands at the consumer's compile site to generate the JS-callable glue. Header-only by necessity — it must specialise on each bound type.

### Manifold, JSCAD, Replicad packages

Each of these consumes a different OCCT-or-equivalent C++ geometry kernel via the same general pattern: template instantiations realised at compile time in the consumer's wasm, plus precompiled object archives from the kernel's `.cxx` sources.

## Common Misconceptions

| Claim                                         | Reality                                                                                                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Header-only libraries are slower at runtime" | False. After linking they produce identical or _better_ binaries due to inlining opportunities.                                                                                                                       |
| "Header-only libraries make my binary bigger" | Usually false. Per-TU duplication is deduped by the linker's weak symbol handling; final binary size is comparable.                                                                                                   |
| "Header-only is a Modern C++ thing"           | Partly. The pattern existed in C (single-file libraries with `static inline` everything) and old C++ (templates have always required it), but became widespread post-C++11 as templates and `constexpr` proliferated. |
| "I should make all my libraries header-only"  | No. The compile-time cost is real and compounds as your project grows. Reserve header-only for genuinely generic code or small utilities.                                                                             |
| "Header-only means no compilation needed"     | The _library_ requires no compilation; the _consumer's_ compilation still happens (and is slower than against a precompiled library).                                                                                 |
| "Header-only and single-header are the same"  | Related but distinct. "Single-header" specifically means the whole library is one `.h` file (stb_image, doctest). Header-only libraries can span many headers (Boost.Hana).                                           |

## References

- C++ One Definition Rule — [cppreference.com/w/cpp/language/definition](https://en.cppreference.com/w/cpp/language/definition) — defines the legal-multi-definition rules header-only relies on
- "Single-file C/C++ libraries" — [github.com/nothings/single_file_libs](https://github.com/nothings/single_file_libs) — Sean Barrett's curated list of the single-header variant
- libc++ ABI Guarantees — [libcxx.llvm.org/ABIGuarantees.html](https://libcxx.llvm.org/ABIGuarantees.html) — illustrates the ABI risks header-only sidesteps
- C++20 modules — [isocpp.org/blog/category/modules](https://isocpp.org/blog/category/modules) — the long-term replacement for the header-only / precompiled trade-off
- `repos/opencascade.js/BUILD_SYSTEM.md` § Component Glossary — concrete examples of header-only (rapidjson) vs compiled (FreeType) dependencies in our wasm pipeline
- Related: `docs/research/emscripten-optimization-flags.md` — flag patterns that interact with header-only inlining
- Related: `docs/research/occt-wasm-module-system.md` — how OCCT's template-heavy API interacts with wasm linking
- Related: `docs/research/ocjs-libclang-target-triple-mismatch-poc.md` — failure mode when libc++ headers (effectively header-only) drift from the libclang version reading them
