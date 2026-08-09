# GeoSpec Fixture Corpus

The committed, adversarial STEP fixture corpus and its manifests — the red/green contract the selector engine (SB3) and relationship evidence engine (SB4) are verified against, and the conformance suite for the GeoSpec AP242 profile (a producer is GeoSpec-compatible exactly when its output passes this harness). Blueprint: `docs/research/geospec-fixture-acceptance-blueprint.md`; fixture semantics are transcribed from the V8 audit's fixture acceptance specs (`docs/research/v8-engine-brep-current-manufacturability-audit.md`), which remain normative.

## Layout

```
fixtures/
  README.md                # this file
  xde/                     # SB1's hand-authored reader fixtures (established there)
  contact/                 # contact.* family — one directory per fixture
  clearance/               # clearance.* family
  mate/                    # mate.* family
  containment/             # containment.* family
  selector/                # selector-behavior fixtures (ambiguity, unnamed, drift,
                           # second-producer transformed-instance)
  interop/nist-pmi/        # pristine third-party AP242 GD&T files (NIST PMI corpus) —
                           # never regenerate; provenance + license in PROVENANCE.md
  scripts/                 # generation scripts (replicad model code run through the runtime CLI)
    regenerate.mjs         # corpus regeneration driver
    <family>/<name>/main.ts
```

Each fixture directory holds exactly two files:

- `model.step` — the committed STEP AP242 artifact. Tests never depend on the runtime to run.
- `manifest.json` — the single source the acceptance harness reads expectations from: generator provenance (`script` + `parameters`, exactly the CLI invocation), tolerance context, selector expectations (statuses, entity counts, subject-frame facts, diagnostic mentions — selectors are **full composed names**, `<occurrencePath>.<interfaceName>`), relationship expectations with explicit `broadPhase`/`final` separation, and optional `adversarialAabb` (the whole-part AABB-overlap premise of master acceptance case 6). Schema: `src/acceptance/manifest-types.ts`; harness: `src/acceptance/acceptance.test.ts`.

## Regeneration

One command per fixture, via the runtime CLI (model frame / z-up is the default — never pass `y-up`):

```bash
node packages/cli/dist/bin/taucad.mjs export packages/geospec/fixtures/scripts/contact/flange-face/main.ts \
  --ext=step --output=packages/geospec/fixtures/contact/flange-face-gap-negative/model.step \
  --params='{"gap":0.5}'
```

Or regenerate everything (or a named subset) from the manifests — this removes the CLI's `.tau` cache directories and verifies each output is STEP text with NAUO structure:

```bash
node packages/geospec/fixtures/scripts/regenerate.mjs [fixtureId ...]
```

The generation scripts are verbatim-normative model code (the sub-blueprint's authoring sources) executed by the runtime VM — they are lint-ignored as fixture inputs, like `experiments/**`.

One fixture is not CLI-generated:

- `selector/second-producer-transformed/model.step` is **hand-authored source** (the AP242 text is the artifact): a producer sharing zero code with tau's exporters, with named face and native datum-placement evidence under a non-identity occurrence transform.

## Determinism rule

Regenerating a fixture from its script must produce **geometrically identical** STEP. Byte identity is not required (header timestamps and entity ids may differ); the harness compares via reader-derived structure, resolved selector facts, and native datum-placement rows — never bytes.

## Budgets

- **Corpus size**: total committed `model.step` bytes stay under **5 MiB** (enforced by the harness; currently ~1.6 MiB across 36 fixtures). Keep geometry primitive and dimensions exact.
- **Performance canary**: the largest fixture (`mate.dowel-located-flange-positive`) records a wall-clock budget in its manifest (`budgets.loadAndResolve`, milliseconds) for the full public path `loadStep → selector index → resolve-all`; SB4's broad phase is accountable to it.

## Conventions

- Dimensions are millimetres, model frame (z-up), transcribed from the audit's specs — do not invent semantics.
- Interface names follow the master profile grammar (camelCase segments; group members `prefix[1]`…`prefix[N]`, contiguous from 1; indices come only from `group()` membership).
- Probe points in scripts live in the part's **placed** frame — displace them together with the part (see `mate/dowel-located-flange/main.ts`'s `moved()`).
- Faces that stay axis-aligned are found with `inPlane`; displaced faces with `containsPoint`. Note replicad's named `'XZ'` plane has normal `[0, -1, 0]` — an offset of `+10` selects the `y = -10` plane.
- Every adversarial `aabb-*` fixture declares both the naive premise (`adversarialAabb`) and the exact-proof failure, so the broad-phase/final separation is asserted explicitly.
- Relationship rows carrying a `pending` marker are normative expectations awaiting engine semantics (reason recorded on the row and in the sub-blueprint's Implementation Status); the harness skips them visibly. Remove the marker when the engine lands the behavior.
