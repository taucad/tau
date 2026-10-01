# Filesystem scene spike

An isolated, source-only Node/Linux scene ingestion experiment. It does not
change production `workbenchRecords`, UI routing, compute caches or renderer
selection. See [CONTRACT.md](./CONTRACT.md) for the renderer adapter handoff.

From the repository root after `pnpm install --frozen-lockfile`:

```bash
pnpm nx test workbench --watch=false
node packages/workbench/src/experiments/filesystem-scene/example.ts
node packages/workbench/src/experiments/filesystem-scene/example.ts out/research/filesystem-scene/live --watch
```

The first example creates a valid triangle GLB and a view record, parses it into
real glTF Transform scene documents, atomically replaces the view file with a
new camera/lights/grid/axes configuration, and proves geometry preparation stays
at one. It then simulates an interrupted JSON write, reports retained revision
identity, and restores the original file. No network, credentials, paid resource,
CAD code execution or physical operation occurs.

The watch example leaves editable files under its explicit output root. Edit
`.tau/workbench/views/front.json`; copy closed GLB files into `assets/` or remove
them. An update is an accepted asset inventory, not a per-file transaction. Use a
new completed folder and then update `assetDirectory` (and `entryPath`) for a
coherent multi-asset replacement. `.tmp` files are ignored. An invalid staged
`.glb` refuses the entire candidate and retains the current scene. Keep the
entry staged or set `entryPath: null` when intentionally emptying the folder.

Limits: 64 KiB view, 64 GLBs, 16 MiB per asset, 64 MiB total, 1024 directory entries examined per scan. Only canonical
project-relative paths, real regular files, no symlinks/hardlinks, closed GLB
2.0 with embedded BIN resources and no required extensions. Decoder failures
stay last-known-good. Renderer preparation must qualify full geometry semantics;
the ingestion guard validates envelope and resource closure, not engineering
correctness. Studio lighting fields mirror the current Three.js owner; this
example exposes presentation state but does not produce pixels.

Polling performs full reconciliation at startup and every second; directory
watch events are hints. Stable double reads catch replacements and interrupted
writes, but cannot infer an author's intended multi-file transaction. A manual
concurrent reconcile cancels an older preparation. All timers and prepared
resources have explicit disposal. Last-known-good is session-local; invalid
input on a fresh process yields no scene. Durable host-store recovery and real
Three.js/native-renderer integration remain acceptance gates.

Production integration must use the existing composed rooted filesystem,
masked watches and host-owned durable store. This local adapter's native root
is selected by the operator; it is not a new authorization route. Declarative
presentation never grants authority to publish, share, spend, change secrets or
permissions, or operate a printer. Future work is separate in the capability
matrix, not marked implemented by this experiment.

## Verification at the checkpoint

2026-10-01, Node 24.19.0, pnpm 11.19.0, base
`faecc9ac8f456b7fa5639fc0eb146012e3e499c8`:

- `pnpm nx test workbench --watch=false`: 19 tests passed (11 spike, 8 existing), plus type fixtures; no type errors.
- `pnpm nx lint workbench`: passed; existing JSDoc warnings in unchanged record/section schemas.
- `pnpm nx typecheck workbench`, `build workbench`, `size workbench`: passed.
- `pnpm nx pkgcheck workbench`: package/export/type/size checks passed, including publint and attw; overall failure is the existing workspace font-copy check for tracked `apps/ui/public/fonts/Geist-Variable.woff2` and `GeistMono-Variable.woff2`.
- `pnpm docs:validate`: zero errors, 86 existing warnings. Public matrix links checked locally.
- Runnable example: passed, one mesh and one geometry preparation across presentation edits; interrupted write preserved last-good revision.

The frozen dependency install required `--ignore-scripts` after unrelated Vale
DNS/canvas installation failures. This does not establish native canvas or Vale
readiness. No browser UI, native renderer pixels, cloud deployment, or entire
kernel parity suite was run. No production-ready or released claim is made.
