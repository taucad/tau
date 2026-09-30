# Authoring contract

Run everything from the Tau root. Brain holds the guide; Tau holds the runner, the renderer and the
checker. The guide reuses the design-canvas runner, so tokens, fonts and `@taucad/ui` components are
the shipped ones. Apply the idioms and evidence requirements in the relevant language skill.

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

Each open question shows its status in the contents and on its card. A question is `open` until a
decision's `settles` names it: `accepted` (ruled as recommended), `amended` (ruled another way) or
`deferred` (set aside; the ruling says until when). The card of an amended or deferred question
shows its ruling. One decision may settle several questions, and a later one overrides an earlier
one. Record a ruling once, under `decisions`; do not rewrite the recommendation to announce it.

Write each question for a reviewer who has not read the guide. `question` is the decision in one
sentence. `context` gives the background in two to four sentences: what the surface is, who meets
it, what happens today and what hangs on the answer, with any charter shorthand (I15, D7) spelled
out. Each `consequence` names the concrete trade-off. Flag the recommended option with
`recommended: true`, never "(recommended)" in its label, and make `recommendation` say why it wins
and when to revisit, not which option it is. With nothing flagged, no option is preselected and
`recommendation` says what the call turns on. A guide's prose strings are Markdown (GFM), so
backticks, bold and links render.

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
node .agents/skills/create-api/scripts/check-design.mjs \
  docs/research/artifacts/<subject>/api --project <workspace-project>
```

`--project` is the workspace project whose dependencies the sketches may import (for a middleware
design, `packages/plugins/middleware`). Bare imports resolve as if the sketch lived in that
project's `src/`, which is how a file in Brain compiles against Tau. The checker exits non-zero on
any diagnostic, including an `@ts-expect-error` that stopped erroring, and rewrites
`design/evidence.json`. Prove it is reading real types once per guide: introduce a deliberate type
error against an imported Tau type, see it fail, remove it.

A guide that designs a C# surface adds `design/**/*.cs` and passes `--dotnet <sdk dotnet>` and one
`--reference <assembly>` per assembly the sketches use (for PicoGK, the SDK under
`out/cache/picogk/` and the worker's `PicoGK.dll`). The C# sketches compile as one program (at most
one file with top-level statements) with nullable references and warnings as errors, in a project
the checker writes to `node_modules/.cache/check-design/`. Expected misuse is a
`// expect-error CSxxxx` line, which fails unless the next line raises that error. Python and OpenSCAD
sketches stay source excerpts; Python's child skill requires separate runnable evidence.

KCL sketches (`design/**/*.kcl`) parse and run with the workspace's `@taucad/kcl-wasm-lib` against a
mock engine, with no Zoo connection: each directory's `main.kcl` runs with its siblings importable, or
every file runs when there is none. Parse issues, warnings and a failed run are diagnostics at the
file and line KCL reports. A guide with KCL sketches passes `languages: tauCustomShikiLanguages` (from
`@taucad/grammars`) so the renderer can highlight them.

## Serve and build

```bash
TAU_CANVAS_PATH=docs/research/artifacts/<subject>/api \
  pnpm exec portless run --name <subject>-api pnpm run canvas:dev

TAU_CANVAS_PATH=docs/research/artifacts/<subject>/api \
  pnpm exec vite build --config scripts/src/canvas-vite.config.ts
```

Use the named localhost URL printed by Portless. It allocates the backend port and supplies Vite's
host, port and allowed-host settings; `run` adds a worktree prefix when appropriate. Use a distinct
stable name per guide, retain it across restarts, and verify the printed URL before delivering it.
Do not hand-pick a port, disable host checks or take over another route with `--force`. A named
address still needs a running server. If no proxy is running and sudo cannot prompt, start
`pnpm exec portless proxy start --port 1355 --https`; the named URL then includes `:1355`.
Reuse a running proxy's settings. In Claude Desktop add a `.claude/launch.json` entry for the
same launch command and use the preview tools instead of a shell server. Build products go to
`out/research`, never Brain.

## Index

`index.md` records: the owning document and work package, the launch command and named URL, each
revision with its date and what changed, the checker command with its result and TypeScript version,
the browser checks performed, the transcript or source evidence behind the rubric scores, the
operator's rulings, and what remains unverified. A ruling changes `guide.ts` (`decisions` with
`settles`, `status`, `revision`) and the owning document in the same turn.
