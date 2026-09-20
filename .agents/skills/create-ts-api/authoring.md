# Authoring contract

Run everything from the Tau root. Brain holds the guide; Tau holds the runner, the renderer and the
checker. The guide reuses the design-canvas runner, so tokens, fonts and `@taucad/ui` components are
the shipped ones.

## Files

```text
docs/research/artifacts/<subject>/api/
├── index.md            artifact index: owner, launch command, revisions, verification, decisions
├── index.html          the canvas HTML shell; only the <title> changes
├── main.tsx            two lines: import { mountApiGuide } from '@tau/api-guide'; mountApiGuide(guide)
├── guide.ts            the guide's data, typed `ApiGuide`; imports every sketch with `?raw`
└── design/
    ├── evidence.json   written by the checker; never edited by hand
    ├── shared/         fixtures and the call sites that are identical under every option
    └── <option-id>/    surface.ts, one file per audience call site, misuse.ts
```

`ApiGuide`, `GuideOption`, `Sketch` and `Evidence` are exported by
[`scripts/canvas/api-guide.tsx`](../../../scripts/canvas/api-guide.tsx); read them before writing
`guide.ts`. Sections render in a fixed order: problem, contract in words, options (call sites,
surface, misuse, gains, costs), shared host and agent call sites, scorecard, failures, open
questions, blast radius, decisions. Scorecard keys are the check ids in
[review-rubric.md](review-rubric.md). Add a section to the renderer only when two guides need it.

## Sketch rules

- A sketch file's first comment line says whose call site it is and under which option.
- Import real types from the package a caller would import them from (`@taucad/runtime/middleware`,
  `@taucad/parameters`). Proposed additions are declared in the option's `surface.ts` as extensions
  of the real types, so a rename upstream breaks the sketch instead of rotting it.
- Things that are not the subject (path helpers, a client) are `declare`d in `design/shared/` and
  labelled abridged. Never `any`, never a cast, to get a call site through.
- Relative imports between sketches carry the `.ts` extension.
- `// ^?` goes on the line under the token, caret under its first character. The renderer replaces
  the marker with the compiler's answer.
- "Today" code in `problem.today` is a quoted excerpt with its `path:line`; it is shown as a source
  excerpt, not as compiled evidence.

## Check

```bash
node .agents/skills/create-ts-api/scripts/check-design.mjs \
  docs/research/artifacts/<subject>/api --project <workspace-project>
```

`--project` is the workspace project whose dependencies the sketches may import (for a middleware
design, `packages/plugins/middleware`). Bare imports resolve as if the sketch lived in that
project's `src/`, which is how a file in Brain compiles against Tau. The checker exits non-zero on
any diagnostic, including an `@ts-expect-error` that stopped erroring, and rewrites
`design/evidence.json`. Prove it is reading real types once per guide: introduce a deliberate type
error against an imported Tau type, see it fail, remove it.

## Serve and build

```bash
TAU_CANVAS_PATH=docs/research/artifacts/<subject>/api \
  pnpm exec vite --config scripts/src/canvas-vite.config.ts --host 127.0.0.1 --port <free port>

TAU_CANVAS_PATH=docs/research/artifacts/<subject>/api \
  pnpm exec vite build --config scripts/src/canvas-vite.config.ts
```

Occupied ports fail rather than open the wrong page. In Claude Desktop add a `.claude/launch.json`
entry and use the preview tools instead of a shell server. Build products go to `out/research`,
never Brain.

## Index

`index.md` records: the owning document and work package, the launch command and port, each
revision with its date and what changed, the checker command with its result and TypeScript version,
the browser checks performed, the transcript or source evidence behind the rubric scores, the
operator's rulings, and what remains unverified. A ruling changes `guide.ts` (`decisions`, `status`,
`revision`) and the owning document in the same turn.
