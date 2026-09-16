# Authoring contract

Run from the Tau repository root. The optional Brain checkout holds scenes;
Tau holds the runner and the actual component/token library.

## One route for creation and editing

Choose `docs/research/artifacts/<subject>/canvas/` for a new canvas, or retain
an established scene directory. Use `index.html` and `main.tsx`; split scene
modules only when they make an existing large scenario set easier to edit.
The minimal HTML is:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tau design review</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

`main.tsx` mounts React with `createRoot` and imports real modules such as
`@taucad/ui/components/button`, `@taucad/ui/components/dialog`, and
`@taucad/ui/components/collapsible`. Inspect each export before using its API.
Provide `TooltipProvider` when using tooltips. Use semantic Tailwind classes
and the package's `cn` helper, not a canvas-specific control library.

For a real app renderer with service dependencies, the runner resolves app `#`
imports only for app/research source (never rewriting another package's imports).
If a fixture provider is necessary, add `canvas.aliases.json` beside the entry:

```json
{
  "#hooks/use-theme.js": "docs/research/artifacts/example/canvas/fixtures.tsx"
}
```

Keys are exact app `#` imports; values are existing repository-relative fixture
files. Use only the entries the imported component actually needs, document the
substitution, and verify its provider contract. No wildcard mocks or transformed
production source. This optional map is not another Vite configuration. Importing
a component with service effects requires a local fixture that prevents external
calls; do not connect the canvas to a real project/account merely to render it.

```bash
TAU_CANVAS_PATH=docs/research/artifacts/<subject>/canvas \
  pnpm exec vite --config scripts/src/canvas-vite.config.ts --host 127.0.0.1

TAU_CANVAS_PATH=docs/research/artifacts/<subject>/canvas \
  pnpm exec vite build --config scripts/src/canvas-vite.config.ts

pnpm nx test scripts --watch=false --args=src/canvas-vite.config.test.ts
```

The shared runner injects compiled Tailwind, current
`@taucad/ui/styles/tokens.css`, and the shipped local Geist fonts. Do not add
a copied stylesheet or per-scene Vite config. Build products belong in
`out/research`; source and compact evidence belong in Brain. Preview the Vite
URL, not an uncompiled HTML file served by a generic static server.
Use an explicit free `--port` when running several canvases; occupied ports
fail rather than silently opening the wrong scene. The regression check exercises
both production compilation and live-browser component geometry.

## Scene contract

Keep a stable named scenario inventory in scene data or its review manifest.
Use one scenario state to derive related UI labels. Theme controls apply the
actual root classes: light (none), `dark`, `dark black`, and `dark high-contrast`;
check current tokens for supported combinations. Reset restores local fixture
state. A source-fidelity dialog identifies imported components, proposed layout,
simulated data and unavailable actions. Do not present a CSS model as real CAD.

Editing does not require a new canvas or framework. Modify the existing scene,
rerun its checks, refresh its evidence and update the same index. For historical
sources, add a successor directory and link both identities instead.

## Styling baseline

The operator-selected reference is `out/research/agent-ux-exact/tau-agent-activity.html`.
Its durable source/review lives in
`docs/research/artifacts/agent-streaming-fidelity-restoration/ux-closeout/canvas/exact/`.
Treat the rendered canvas body as a composition reference. Canonical requirements
live in [DESIGN.md](../../../DESIGN.md#design-and-critique-workflow).
Read its `main.tsx`, `frames.tsx` and `style.css` when available;
the disposable HTML bundle is not a dependency of new scenes. If it cannot be
opened, use the supplied screenshot and source; record that limitation.

Reuse the shared runner above. The reference's old source transforms and
captured-agent pipeline are historical experiments, not authoring techniques.

## Acceptance evidence

Retain a small `review.md` with owner link, original source paths/hashes,
scenario/interaction checklist, reused component imports, launch/build/check
commands, browser/tool versions, screenshots and limitations. Browser assertions
use roles and accessible names. Test every scenario, not just the initial page.
Explicitly inspect long labels, nested disclosure, failure copy, keyboard focus,
the narrow layout, fonts, themes and state consistency. A build alone is not a
design review; an axe pass alone is not WCAG certification.

The revision-story successor remains an interaction/reuse example. Both examples
are evaluated against current DESIGN.md when edited.
