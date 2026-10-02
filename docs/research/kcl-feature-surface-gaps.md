---
title: 'KCL feature surface gaps (Tau vs modeling-app)'
description: 'Tracks Zoo kernel capabilities present in upstream KCL WASM (ProjectManager, sketch APIs) that Tau still routes through the simpler host FileSystemManager-only integration.'
status: active
created: '2026-05-04'
updated: '2026-05-04'
category: audit
related:
  - docs/research/zoo-kcl-148-integration-audit.md
  - docs/research/zoo-kcl-std-prelude-load-failure.md
  - .agent/skills/rebuild-kcl-wasm-lib/SKILL.md
---

# KCL feature surface gaps (Tau vs modeling-app)

Tau’s Zoo kernel wires `FileSystemManager` and `EngineConnection` (transport + bridge + session) for module resolution and cloud execution. Upstream `@taucad/kcl-wasm-lib` also exposes a **project** and **sketch** API surface on `Context` (`open_project`, `add_file`, `new_sketch`, `execute_trim`, undo checkpoints, and related methods) backed by KCL’s internal `ProjectManager`.

## What `ProjectManager` actually owns

Per `repos/zoo-modeling-app/rust/kcl-lib/src/project/mod.rs`, `ProjectManager` is a standalone `lazy_static! static ref PROJECT: Arc<RwLock<Option<Project>>>` consumed only by sketch-editing entry points (`new_sketch`, `add_segment`, `edit_constraint`, `restore_sketch_checkpoint`, `trim`, `hack_set_program`) and project-introspection getters (`get_project`, `get_file`).

It is **not** read by `Context.execute`, `Context.executeMock`, the module loader, `read_std()`, or `ExecutorContext.fs`. See [`zoo-kcl-std-prelude-load-failure.md` Finding 10](./zoo-kcl-std-prelude-load-failure.md#finding-10-projectmanager-is-exclusively-a-sketch-editing-state-container--multi-file-imports-already-work-via-filesystemmanager) for the full source-level trace.

## Deferred scope (sketch-editing only)

- **Project lifecycle in WASM** (`open_project`, `switch_file`, `refresh`, `add_file`, `remove_file`, `update_file`): primes the in-WASM `ProjectManager` mirror so sketch APIs can read source for `add_segment`/`edit_constraint`/etc.
- **Sketch-block editing loops**: `new_sketch`, `sketch_execute_mock`, `trim`, constraint edits, and checkpoint restore — today Tau does not drive these entry points.
- **Undo / checkpoints**: `restore_sketch_checkpoint` and related sketch state not surfaced in the editor UX.
- **`hack_set_program`**: temporary direct-edit hook that bypasses the ProjectManager but still depends on `FrontendState.point_freedom_cache` mutation. Sketch-editing only.

## What is **not** deferred

**Multi-file KCL geometry execution is not in scope of the deferred work** — it already functions through the host `FileSystemManager`:

- `import "./other.kcl"` resolves via `ImportPath::Kcl → ModulePath::Local::source → fs.read_to_string` (`exec_ast.rs:833`), which calls into Tau's `ZooFileSystemManager.readFile`.
- `discoverKclDependencies` in `zoo.kernel.ts` walks the import graph for cache-keying and watch-priming; transitively-imported files are tracked end-to-end.
- Modeling-app sets `projectFsManager.dir = projectPath` exactly the same way Tau passes `basePath` to `ZooFileSystemManager`. From that point, `Context.execute` resolves local imports through the FS adapter — `open_project` plays no role in module resolution.

If Tau ever ships sketch-block editing UI, ProjectManager adoption becomes mandatory; until then, deferral is correct and does not constrain multi-file project support.

## Near-term integration notes

The engine bridge rewrite (`ZooWebSocketTransport`, `ZooEngineBridge`, `ZooEngineSession`) aligns websocket I/O with kcl-lib expectations (`sendResponse`, four-arg `fire`/`send`). Adopting the project/sketch APIs is orthogonal and should be scheduled when the editor needs parity with Zoo’s modeling-app sketch workflows.

## References

- [`zoo-kcl-148-integration-audit.md`](./zoo-kcl-148-integration-audit.md) — historical ABI drift and remediation.
- [Rebuild kcl-wasm-lib skill](../.agent/skills/rebuild-kcl-wasm-lib/SKILL.md) — rebuild checklist and WASM ABI audit.
