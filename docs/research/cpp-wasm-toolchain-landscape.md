---
title: 'C/C++/WASM Toolchain Landscape — Reference Map'
description: 'Reference map of the C/C++/WebAssembly toolchain: emsdk, libclang, libc++, emcc, wasm-ld, embind, binaryen, sysroot. Covers component layering, the libclang↔libc++ pairing rule, and where each piece appears across tau.'
status: active
created: '2026-05-20'
updated: '2026-05-20'
category: reference
related:
  - docs/research/header-only-cpp-libraries.md
  - docs/research/emscripten-optimization-flags.md
  - docs/research/occt-wasm-module-system.md
  - docs/research/ocjs-libclang-target-triple-mismatch-poc.md
---

# C/C++/WASM Toolchain Landscape — Reference Map

A workspace-level reference for the C/C++/WebAssembly toolchain components that show up across every C++-consuming package in the tau monorepo. Disambiguates the named pieces (emsdk vs Emscripten vs emcc vs clang, libclang vs libc++, wasm-ld vs lld vs wasm-opt, sysroot vs resource directory) and documents the version-pairing rules between them.

## Executive Summary

Every C++/WASM build in this monorepo flows through the same conceptual pipeline: **source code is parsed by a frontend (libclang or clang), compiled to wasm object files by `emcc`, linked into a `.wasm` module by `wasm-ld`, optimised by `wasm-opt`, and wrapped with JS glue by embind**. Each stage is performed by a distinct tool with its own version, configuration, and failure modes.

The toolchain is delivered by the **Emscripten SDK (`emsdk`)** as a single versioned bundle — but `emsdk` itself is just a meta-installer; the actual work is done by vendored copies of LLVM tools (clang, libclang, lld, libc++) plus Emscripten-specific glue. **Two distinct clang installations** are typically in play (one inside emsdk for compiling, one as a pip-installed libclang for parsing/AST extraction in code generators); confusing them is a recurring source of bugs.

The most important invariant to internalise: **libclang and libc++ are released together from the LLVM monorepo and must stay paired within ±1 major release.** Mismatching them produces silent AST corruption (libcxx headers reference compiler intrinsics that the older libclang doesn't know about) rather than loud errors.

## Problem Statement

The toolchain names are confusing. Contributors regularly ask:

- "Is emsdk a compiler? A package manager? What's the difference between emsdk and Emscripten?"
- "Why are there two `clang` versions in the build, one in emsdk and one from pip?"
- "What's the difference between `libc++` and `libc++abi` and the `sysroot`?"
- "Why does `emcc` accept clang flags but also have its own `-s` flags? What's `wasm-ld`?"
- "What does `binaryen` do that `wasm-ld` doesn't already do?"

These reduce to a handful of underlying components with clear roles. This doc catalogs them once so the rest of the workspace can link here rather than re-explaining.

## Scope and Non-Goals

**In scope:** the toolchain components themselves — what each one is, what it does, where it comes from, how it pairs with the others, and how to recognise its failures.

**Out of scope:**

- Specific build flag recommendations — see `docs/research/emscripten-optimization-flags.md`.
- OCCT-specific binding mechanics — see `docs/research/occt-wasm-module-system.md` and `repos/opencascade.js/BUILD_SYSTEM.md`.
- Header-only vs precompiled trade-offs — see `docs/research/header-only-cpp-libraries.md`.
- Runtime/loader concerns (instantiation, memory growth, threading) — separate investigations.

## The Layered Architecture

Read top-to-bottom: source code enters at the top, a `.wasm` file exits at the bottom.

```
┌─────────────────────────────────────────────────────────────────┐
│  C++ source (your code, OCCT, rapidjson, manifold, …)           │
└─────────────────────────────────────────────────────────────────┘
                                  │
                       ┌──────────┴──────────┐
                       │                     │
              [PARSE PATH]            [COMPILE PATH]
                       │                     │
                       ▼                     ▼
        ┌──────────────────────┐  ┌──────────────────────┐
        │  libclang (Python)   │  │  emcc (clang wrapper)│
        │  reads → AST         │  │  reads → wasm32 .o   │
        └──────────────────────┘  └──────────────────────┘
                       │                     │
        reads headers from:       reads headers from:
        ┌──────────────────────────────────────────────┐
        │  libc++  +  libc++abi  +  emscripten sysroot │
        │  +  clang resource directory                  │
        └──────────────────────────────────────────────┘
                                                        │
                                                        ▼
                                  ┌──────────────────────────────┐
                                  │  wasm-ld (a.k.a. lld)         │
                                  │  links .o files → .wasm       │
                                  └──────────────────────────────┘
                                                        │
                                                        ▼
                                  ┌──────────────────────────────┐
                                  │  wasm-opt (binaryen)          │
                                  │  optimises .wasm bytecode     │
                                  └──────────────────────────────┘
                                                        │
                                                        ▼
                                  ┌──────────────────────────────┐
                                  │  embind runtime + emcc JS     │
                                  │  glue → .js wrapper           │
                                  └──────────────────────────────┘
                                                        │
                                                        ▼
                                  ┌──────────────────────────────┐
                                  │  .wasm + .js (+ .d.ts)        │
                                  └──────────────────────────────┘
```

The **PARSE PATH** is optional — it only exists for codebases that run a code-generation step (like ocjs's bindgen, or any project using `cppyy`, `swig`, `rust-bindgen`, or Python `clang.cindex`). The **COMPILE PATH** is mandatory for every wasm build.

## Component Catalog

### A. Toolchain meta-installers

| Component                  | What it is                                                                                                                                               | Notes                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **emsdk** (Emscripten SDK) | A Python-based meta-installer that downloads and version-locks the Emscripten toolchain (clang, `emcc`, libc++, sysroot, node, etc.) as a single bundle. | Itself does no compiling. The actual tools live under `deps/emsdk/upstream/`. Version is pinned per-package (e.g. `DEPS.json` in ocjs). |
| **Emscripten**             | The collection of tools and runtime libraries that emsdk installs. The user-facing name for the whole ecosystem.                                         | Often used interchangeably with emsdk; technically emsdk is the _installer_ and Emscripten is the _installed product_.                  |
| **uv** (Astral)            | Hermetic Python interpreter + venv manager. Reads `.python-version` and `requirements.txt`.                                                              | Has no C++ role at all — only sets up the Python that runs build/codegen scripts.                                                       |

### B. The C++ frontend (parses source code)

Two distinct copies of clang are typically in play. The distinction matters.

| Component                    | What it is                                                                                                                                                                                                       | Where it lives                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **clang** (the driver)       | The `clang++` executable. Drives preprocessing → parsing → codegen → linking. Wrapped by `emcc` to inject wasm-specific defaults.                                                                                | `deps/emsdk/upstream/bin/clang`. Version comes from emsdk.                                                                                                                                 |
| **libclang**                 | The C library form of the clang frontend. Same parser as the driver, exposed as a shared library for tools to embed. Python's `clang.cindex` module, Rust's `bindgen`, Vim's clang_complete, etc. all load this. | Pip package `libclang` (PyPI), Homebrew `llvm`, system `libclang-dev`. **Independent of the clang driver above.**                                                                          |
| **clang resource directory** | A small directory of compiler-builtin headers (`stddef.h`, `stdint.h`, intrinsic shims like `arm_neon.h`) that ships _with_ every clang.                                                                         | `<clang-install>/lib/clang/<N>/include/`. Defines macros and types that depend on the compiler's own version (`__INT32_C`, `__builtin_ctzg`); **must match the clang version reading it.** |

> **Important pairing rule:** libclang and libc++ are released together from the LLVM monorepo. The LLVM project only supports pairings within ±1 major release (per the official libc++ compiler-support policy). The parse-side libclang version and the libc++ headers it reads must stay aligned. See § Pairing Rules below.

### C. The C++ standard library

| Component                            | What it is                                                                                                                                                                 | Notes                                                                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **libc++** (a.k.a. **libcxx**)       | LLVM's C++ standard library implementation — `std::vector`, `std::optional`, `<algorithm>`, etc.                                                                           | **At parse time only the headers matter** (templates are header-only — see `header-only-cpp-libraries.md`). The runtime is irrelevant to libclang.                     |
| **libc++abi**                        | Companion runtime to libc++ providing exception types, RTTI helpers, demanglers.                                                                                           | Statically linked into the wasm. Not consumed during parse.                                                                                                            |
| **libstdc++** (GNU)                  | GCC's competing C++ standard library. **Not used in wasm builds** — Emscripten uses libc++ exclusively. Mentioned here so readers know they can ignore it in this context. | Lives in `/usr/include/c++/<N>/` on Linux GCC installs.                                                                                                                |
| **Apple libc++** (macOS, historical) | macOS-system-installed libc++ in `MacOSX.sdk/usr/include/c++/v1`, shipped with Xcode CLT. Tracks Apple clang (currently ~17 on Xcode 16.x).                                | Sometimes accidentally picked up by libclang during AST parsing on macOS, with surprising effects. See `ocjs-libclang-target-triple-mismatch-poc.md` for a case study. |

### D. The wasm-specific toolchain (Emscripten compile/link layer)

| Component                    | What it is                                                                                                                                                                                                                   | Where it lives                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **emcc** / **em++**          | Emscripten's `clang++` wrapper. Adds `-target wasm32-unknown-emscripten`, points clang at the emscripten sysroot, calls `wasm-ld` at link time, then runs `wasm-opt`. **Build scripts invoke `emcc`, not `clang` directly.** | `deps/emsdk/upstream/emscripten/emcc`                                                                                                                      |
| **wasm-ld** (a.k.a. **lld**) | LLVM's WebAssembly linker. Takes `.o` files compiled by emcc and links them into a `.wasm` module. Performs dead-code elimination of unreferenced symbols.                                                                   | `deps/emsdk/upstream/bin/wasm-ld`                                                                                                                          |
| **binaryen / wasm-opt**      | Post-link wasm bytecode optimiser. Shrinks and optimises the linked module. Operates on `.wasm` directly, not LLVM IR. Invoked by `emcc` at `-O2` and above.                                                                 | `deps/emsdk/upstream/bin/wasm-opt`                                                                                                                         |
| **emscripten sysroot**       | A faux POSIX environment for wasm builds (`inttypes.h`, `wchar.h`, pthread shims, OpenGL/EGL stubs, etc.) under `system/include/` and `cache/sysroot/include/`.                                                              | `deps/emsdk/upstream/emscripten/system/include/` and `cache/sysroot/include/`. Replaces the host OS's C library headers so wasm builds are OS-independent. |
| **embind**                   | C++ template library shipped inside emscripten that generates JS↔C++ glue from `EMSCRIPTEN_BINDINGS(name) { class_<X>(…); }` macro blocks.                                                                                   | `deps/emsdk/upstream/emscripten/system/include/emscripten/bind.h`. Header-only template machinery — expands at the consumer's compile site.                |
| **Closure Compiler**         | Google's JS minifier. Optionally run on the `.js` wrapper emcc emits to shrink it further.                                                                                                                                   | Bundled with emsdk under `third_party/closure-compiler-v20240317/` (or similar).                                                                           |

### E. C++ source ecosystem (what's being compiled)

Two structural categories of C++ source. Understanding which category a dependency falls into is critical for build planning.

| Category        | Mechanism                                                                                                          | Compile cost                                              | Examples in this monorepo                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Header-only** | Distribution is pure `.h`/`.hpp` files. Templates and `inline` functions force instantiation in the consumer's TU. | Higher per-TU compile time; no separate library to build. | rapidjson, GLM, Eigen, stb\_\*, embind itself. See `header-only-cpp-libraries.md`. |
| **Precompiled** | Distribution includes `.cpp`/`.cxx` source that compiles into `.o` archives the consumer links against.            | Lower per-TU; needs explicit build steps.                 | OCCT, FreeType, HarfBuzz, ICU, manifold's C++ core, OpenSCAD's CGAL backend.       |

OCCT is a hybrid: its `NCollection_*<T>` containers are template-heavy (effectively header-only) but its concrete classes (`TopoDS_Shape`, `BRepBuilderAPI_*`) live in `.cxx` files that must be precompiled.

### F. Output artifacts

Per-build artifacts every wasm pipeline produces.

| Artifact                        | What it is                                                                                                           | Consumed by                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **`.wasm`**                     | The compiled WebAssembly module. Pure bytecode; OS-independent; architecture-independent.                            | Browser / Node / Deno / wasmtime via `WebAssembly.instantiate()`. |
| **`.js`**                       | JS wrapper emitted by `emcc` — module loader, exported function thunks, embind runtime.                              | Imported by the application; in turn imports the `.wasm`.         |
| **`.d.ts`**                     | TypeScript declarations. Either emitted directly by emcc (`-sEMIT_TSD`) or by a codegen step on top of the bindings. | TypeScript consumers; the application's tsconfig include path.    |
| **`.symbols`**                  | Symbol table emitted by `wasm-ld`. Useful for diffing two builds to see which symbols were retained or dropped.      | Diagnostics only; not loaded at runtime.                          |
| **`.wasm.map`** / **`.js.map`** | Source maps. Optional.                                                                                               | Browser DevTools for debugging.                                   |

## Pairing Rules

Three pairing invariants the toolchain assumes are maintained. Violating any one of them produces silent or hard-to-attribute failures.

### Pairing 1: libclang ↔ libc++ (parse path)

**Rule:** libclang reading libc++ headers must be within ±1 LLVM major release of the libc++.

**Why:** libc++ headers `#include` compiler intrinsics (`__builtin_ctzg`, `__builtin_clzg`, `__hash_memory`, etc.) added in specific clang versions. Each libc++ release adds calls to new intrinsics from its own clang generation and gradually deletes the old-compiler fallbacks. An older libclang reading a much newer libc++ hits `use of undeclared identifier '__builtin_...'` errors during AST parsing.

**Failure mode:** silent AST corruption. libclang's parser is _resilient_ — it doesn't abort on errors; it abandons the offending class body and continues. Method declarations that depend on the failed parse silently vanish from the AST. Code generators that walk the AST then emit incomplete bindings, often surfacing as TypeScript `: number` or `: unknown` downgrades. See `docs/research/ocjs-libclang-target-triple-mismatch-poc.md` for a 596 → 164 declaration regression caused by exactly this skew (libclang 18.1.1 vs libc++ from clang 23-tip).

**LLVM's official position:** "libc++ supports back to the latest released version of Clang" — meaning libc++ N supports clang N and N-1, nothing older.

### Pairing 2: clang driver ↔ clang resource directory (compile path)

**Rule:** the clang driver's `-resource-dir` (or auto-detected resource directory at `<install>/lib/clang/<N>/include/`) must be the one shipped with that clang.

**Why:** the resource directory contains compiler-built-in headers (`stddef.h`, `stdint.h`, `__stddef_*.h`, intrinsic shims) that depend on the compiler's intrinsic table. A clang-23 driver loading a clang-18 resource directory will fail to find newer builtin types.

**Failure mode:** `'<intrinsic>.h' file not found` or `unknown type name '__bf16'` at compile time.

**Handled automatically** in normal `emcc` use — emcc points clang at its own bundled resource dir. Becomes a problem only when manually overriding `-resource-dir` or when libclang's Python binding is given paths from a different clang generation.

### Pairing 3: emcc ↔ emsdk-vendored clang (driver path)

**Rule:** `emcc` and the `clang` it wraps must come from the same emsdk install.

**Why:** `emcc` reads emsdk-vendored config files that hardcode expectations about clang flags, sysroot layout, and version-specific behavior. Mismatch produces `error: unknown argument` or wrong-target compilation.

**Failure mode:** loud — emcc detects mismatch and refuses to start.

**Handled automatically** in normal use. Risk surfaces when users symlink `clang` from a system install into emsdk's `bin/`.

## Where the Toolchain Appears in the Tau Monorepo

The toolchain is consumed by several packages, each with its own ingest model.

| Package / location                                | What it builds                                  | Toolchain ingest                                                                                                              |
| ------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `repos/opencascade.js/` (ocjs)                    | OCCT → WASM bindings via embind                 | Full pipeline: libclang for AST discovery + emcc/wasm-ld/wasm-opt for compile/link. Heaviest toolchain user in the workspace. |
| `kernels/openscad/` (`@taucad/openscad`)          | Wraps `openscad-wasm-prebuilt`                  | Consumes a pre-built `.wasm` upstream; no local C++ compilation. Toolchain-version-irrelevant.                                |
| `packages/runtime/src/kernels/manifold/`          | Wraps `manifold-3d` npm package                 | Consumes a pre-built `.wasm`. Same as above.                                                                                  |
| `packages/runtime/src/kernels/jscad/`             | Wraps `@jscad/modeling` (pure JS, no WASM)      | No toolchain involvement. Listed for completeness.                                                                            |
| `packages/runtime` (KCL)                          | Wraps `@taucad/kcl-wasm-lib`                    | Consumes a pre-built `.wasm` rebuilt from upstream via `rebuild-kcl-wasm-lib` skill.                                          |
| `repos/replicad/packages/replicad-opencascadejs/` | Distributable npm package of OCCT WASM bindings | Built by ocjs upstream; consumes ocjs's output.                                                                               |

**Pattern:** most workspace packages consume pre-built `.wasm` artifacts and only need to understand the _runtime_ side of the toolchain (how to instantiate, memory model, threading). Only ocjs (and any future first-party kernel built from C++ source) needs to understand the _build_ side.

## Two Common Confusions

### Confusion 1: "Which clang am I using?"

Almost every C++/WASM project has **two clang installations** in play:

1. **emsdk's clang** — the one `emcc` wraps. Used for compiling C++ to wasm. Version comes from emsdk.
2. **libclang Python binding (or system libclang)** — used for AST parsing by code generators (bindgens, doc extractors, IDE tools).

Both report a version when asked, but they're independent. emsdk's clang is currently bleeding-edge (tracks LLVM main); pip's libclang is capped at 18.1.1 (latest PyPI release). They will not match unless deliberately aligned.

When debugging a "weird parse" issue, always run both:

```bash
# emsdk's compile-side clang
$EMSDK/upstream/bin/clang --version

# pip's parse-side libclang (Python)
python -c "import clang.cindex; clang.cindex.Index.create(); print('loaded')"
# (libclang exposes no direct version API; check pip show libclang)
pip show libclang | grep Version
```

### Confusion 2: "Why does my header include fail when running through libclang but works under emcc?"

Because libclang and emcc resolve include paths differently:

- **emcc** auto-injects the emscripten sysroot, emsdk's libc++ headers, and the clang resource directory. You usually don't need to think about it.
- **libclang** does _not_ auto-inject these — it's a raw frontend. The Python binding needs explicit `-I` flags for every header tree it should consult.

A bindgen calling `libclang.Index.parse(filename, args=["-x", "c++", "-stdlib=libc++"])` without spelling out the include paths will fail to find `<inttypes.h>`, `<vector>`, or any system header. The fix is to enumerate the same paths emcc would use and pass them explicitly.

## Lifecycle Comparison: Pre-built `.wasm` vs Source-built `.wasm`

For new C++/WASM consumers in the workspace, the first architectural decision is whether to consume a pre-built artifact or build from source.

| Aspect                           | Pre-built `.wasm`                     | Source-built `.wasm`                                      |
| -------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| **Toolchain expertise required** | Runtime only (loaders, instantiation) | Full pipeline (this doc)                                  |
| **Build time**                   | Zero (consumed as npm package)        | Minutes to hours per cold build                           |
| **Customisation**                | None or via upstream flags            | Full control over flags, includes, link set               |
| **Disk weight**                  | Tens of MB (the artifact only)        | Hundreds of MB to GB (emsdk + LLVM + sources)             |
| **CI complexity**                | None                                  | Significant (toolchain caching, Docker, Nx orchestration) |
| **Examples in workspace**        | openscad, manifold, kcl-wasm-lib      | ocjs (only)                                               |

**Default to pre-built unless you have a reason not to.** Source-builds make sense when:

- Upstream doesn't publish a pre-built variant suitable for your target (e.g. needs custom emscripten flags, embind class subsets, threading model).
- You're producing the bindings _for_ downstream consumers (ocjs is the canonical example).
- You're investigating a bug at the C++ ↔ wasm boundary and need to iterate on flags.

## Diagnostics Checklist

When investigating any toolchain-layer issue, collect these facts first:

```bash
# emsdk install root + version
echo $EMSDK
$EMSDK/upstream/bin/clang --version
$EMSDK/upstream/emscripten/emcc --version
$EMSDK/upstream/bin/wasm-ld --version
$EMSDK/upstream/bin/wasm-opt --version

# Parse-side toolchain (if a codegen step is involved)
pip show libclang | grep -E "Version|Location"

# Effective include search path emcc uses for a probe TU
echo 'int main(){return 0;}' | $EMSDK/upstream/emscripten/em++ -x c++ -E -v - 2>&1 | head -50

# Identify the libc++ being read (look for emsdk vs system paths)
$EMSDK/upstream/emscripten/em++ -x c++ -E -v - <<< '#include <vector>' 2>&1 | rg 'vector|libcxx|c\+\+'
```

The most common single root cause of "wasm built but behaves weirdly" is **a libc++ from one LLVM version paired with a libclang from another.** Always confirm both are aligned before chasing higher-level hypotheses.

## References

### External

- Emscripten compiler documentation — [emscripten.org/docs/tools_reference/emcc.html](https://emscripten.org/docs/tools_reference/emcc.html) — canonical `emcc` flag reference
- Emscripten SDK overview — [emscripten.org/docs/tools_reference/emsdk.html](https://emscripten.org/docs/tools_reference/emsdk.html) — how emsdk manages tool versions
- LLVM monorepo releases — [github.com/llvm/llvm-project/releases](https://github.com/llvm/llvm-project/releases) — confirms libclang/libc++ ship together with a single version
- libc++ compiler support policy — [llvm-dev archive 2021-March](https://lists.llvm.org/pipermail/llvm-dev/2021-March/148881.html) — official "N and N-1 only" rule
- Binaryen / wasm-opt — [github.com/WebAssembly/binaryen](https://github.com/WebAssembly/binaryen) — what wasm-opt does after wasm-ld
- Embind documentation — [emscripten.org/docs/porting/connecting_cpp_and_javascript/embind.html](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/embind.html) — the JS↔C++ binding system
- emsdk libclang request — [emscripten-core/emsdk#1605](https://github.com/emscripten-core/emsdk/issues/1605) — open issue requesting emsdk ship `libclang.so` for bindgen tools

### Workspace

- `docs/research/header-only-cpp-libraries.md` — why some C++ libraries ship as pure headers
- `docs/research/emscripten-optimization-flags.md` — concrete `-O*`, `-s*`, `-flto` flag patterns
- `docs/research/occt-wasm-module-system.md` — how OCCT's module structure interacts with wasm linking
- `docs/research/modular-wasm-multithreading.md` — threading model considerations
- `docs/research/ocjs-libclang-target-triple-mismatch-poc.md` — case study of libclang↔libc++ pairing failure in ocjs
- `repos/opencascade.js/BUILD_SYSTEM.md` § Component Glossary — concrete instantiation of this landscape inside ocjs
