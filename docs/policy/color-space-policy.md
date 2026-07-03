---
title: 'Color Space Policy'
description: 'Canonical handling of sRGB vs linear color in glTF/GLB output across kernels and exporters.'
status: active
created: '2026-04-21'
updated: '2026-04-21'
related:
  - docs/research/kernel-color-space-srgb-conversion.md
  - docs/research/cross-kernel-color-parity.md
---

# Color Space Policy

Internal reference for how sRGB and linear color values flow through Tau's
geometry, glTF/GLB writers, and renderer.

## Rationale

The glTF 2.0 specification mandates that `pbrMetallicRoughness.baseColorFactor`
is in **linear** color space; Three.js (and every conformant viewer) applies the
linear → sRGB OETF on the way to the framebuffer. CSS hex strings, OFF integer
colors, JSCAD `colorize()` tuples, and all common author-facing color formats
are **sRGB**. Without an explicit sRGB → linear conversion at the writer
boundary, the rendered output is washed out (mid-tones land at 0.5 instead of
0.216), and kernels that do convert (Replicad) and kernels that don't (OpenSCAD,
JSCAD, OCCT-PBR) produce visibly different colors for the same author input.
This policy locks in the conversion boundary so all kernels are
visually-consistent end-to-end.

## Rules

### 1. `baseColorFactor` MUST Be Linear

Every glTF/GLB writer in `packages/runtime` MUST write `baseColorFactor` in
linear color space.

**Why**: Required by the glTF 2.0 spec; consumed verbatim by Three.js and every
conformant viewer. Writing sRGB into `baseColorFactor` produces washed-out
output across the entire renderer/exporter stack.

CORRECT:

```typescript
import { srgbTupleToLinear } from '#utils/color-space.js';

const linear = srgbTupleToLinear(srgbColor);
material.baseColorFactor = linear;
```

INCORRECT:

```typescript
material.baseColorFactor = srgbColor;
```

### 2. Convert at the Writer Boundary, Not in User Code

Author-facing inputs (CSS hex strings, OFF integer colors, JSCAD `colorize()`
tuples) MUST be treated as sRGB and converted to linear at the **glTF writer**
layer — never in user code, render pipelines, or material editors.

**Why**: Authors think in sRGB; writers speak glTF (linear). Pushing the
conversion any earlier loses information and forces every consumer to know about
color spaces. The writer is the single boundary where the conversion is
unambiguously needed.

CORRECT:

```typescript
function colorGroupToPrimitive(geometry: ColorGroupGeometry): GlbPrimitive {
  const linearBaseColor = srgbTupleToLinear(geometry.color);
  return {
    material: {
      baseColorFactor: linearBaseColor,
      // ...
    },
  };
}
```

INCORRECT (conversion in user code):

```typescript
const userColor = srgbToLinear(parseHex('#1565C0'));
shape.color = userColor;
```

### 3. Use the Shared Helper

All sRGB ↔ linear conversion MUST go through
`packages/runtime/src/utils/color-space.ts`. Do not inline the gamma curve, copy
constants, or use Three.js's `Color.convertSRGBToLinear()` from inside the
runtime package.

**Why**: Eliminates per-channel arithmetic drift, keeps the canonical sRGB EOTF
in one place, and makes regressions caught by a single unit-test fixture.

CORRECT:

```typescript
import { srgbToLinear, srgbTupleToLinear, srgbHexToLinearTuple } from '#utils/color-space.js';
```

INCORRECT:

```typescript
const linear = ((c + 0.055) / 1.055) ** 2.4;
```

### 4. OpenCASCADE — Use the Right Constructor

When constructing OCCT colors from sRGB inputs:

- **Non-PBR path** (`Quantity_Color`): use the `Quantity_TypeOfColor.Quantity_TOC_sRGB` constructor; OCCT performs the linearisation internally.
- **PBR path** (`Quantity_ColorRGBA`): the 4-double constructor assumes **linear** input; convert each channel with `srgbToLinear` before construction.

**Why**: The two OCCT constructors take inputs in different color spaces. The
PBR `Quantity_ColorRGBA(double, double, double, double)` overload silently
treats sRGB as linear and produces washed-out PBR materials.

CORRECT (PBR):

```typescript
const baseColor = new oc.Quantity_ColorRGBA(srgbToLinear(sr), srgbToLinear(sg), srgbToLinear(sb), entry.opacity ?? 1);
```

INCORRECT (PBR):

```typescript
const baseColor = new oc.Quantity_ColorRGBA(sr, sg, sb, alpha);
```

### 5. Author-Provided Linear Values (Manifold/Zoo)

Manifold's `GLTFNode.material.baseColorFactor` and KCL/Zoo's external
glTF output are treated as **already linear** — Tau code MUST NOT post-process
them (no second sRGB→linear pass, no gamma adjustment).

**Why**: These pipelines hand author-supplied values straight to the glTF
writer per the spec. Re-encoding them would compound the gamma curve and break
upstream contracts.

### 6. Three.js Output Color Space MUST Stay sRGB

`renderer.outputColorSpace` MUST remain `THREE.SRGBColorSpace` (the Three.js
default since r152). Do not switch to `LinearSRGBColorSpace` to "compensate"
for an upstream sRGB-as-linear bug — fix the upstream writer instead.

**Why**: Three.js's default pipeline assumes linear inputs in
`baseColorFactor` and applies the OETF for display. Changing the output color
space hides bugs in the writer chain and breaks every other consumer of the
GLB.

## Conversion Boundary Summary

| Source                                        | Color space at source    | Conversion site                                 | Final `baseColorFactor` |
| --------------------------------------------- | ------------------------ | ----------------------------------------------- | ----------------------- |
| Replicad CSS hex → `replicad-to-gltf.ts`      | sRGB                     | `srgbHexToLinearTuple` in writer                | Linear                  |
| OpenSCAD OFF integer colors → `export-glb.ts` | sRGB (0..1 normalised)   | `srgbTupleToLinear` in `colorGroupToPrimitive`  | Linear                  |
| JSCAD `colorize()` tuple → `jscad-to-gltf.ts` | sRGB                     | `srgbTupleToLinear` in JSCAD GLB adapter        | Linear                  |
| OCCT non-PBR CSS hex → `Quantity_Color`       | sRGB                     | OCCT internal (`Quantity_TOC_sRGB` constructor) | Linear                  |
| OCCT PBR CSS hex → `Quantity_ColorRGBA`       | sRGB                     | `srgbToLinear` per channel before constructor   | Linear                  |
| Manifold `GLTFNode.material.baseColorFactor`  | Linear (author supplied) | None — passthrough                              | Linear                  |
| Zoo/KCL external glTF                         | Linear (engine emits)    | None — passthrough                              | Linear                  |

## Anti-Patterns

- **Tweaking the renderer to fix a writer bug.** If colors look washed out,
  fix the writer (sRGB→linear at the boundary), not
  `renderer.outputColorSpace` or material parameters.
- **Per-kernel color helpers.** Every kernel must use the shared
  `color-space.ts` helpers. Local copies will drift.
- **Pre-converting author input.** Author values are sRGB until they reach the
  writer. Do not "normalise" them in user code, render middleware, or
  parameter parsing.
- **Re-encoding linear values.** When a value is documented as linear (Manifold
  GLTFNode, Zoo glTF output, OCCT post-conversion), do not run it through
  `srgbToLinear` again.

## Testing

Each kernel that owns a writer MUST have a `*-rendering.test.ts` companion
that asserts linear `baseColorFactor` for a shared color matrix
(`packages/runtime/src/testing/color-testing.utils.ts` →
`colorParityCases`). The cross-kernel guarantee is enforced by
`packages/runtime/src/kernels/cross-kernel-mesh-parity.test.ts`, which
parameterises both the non-PBR and PBR paths over the same matrix.

The mid-grey case (`#808080` → linear ≈ 0.216) is the **discriminator**: any
implementation that confuses sRGB and linear will land at 0.502 instead.

## Summary Checklist

- [ ] Writer applies sRGB → linear conversion at the glTF/GLB boundary
- [ ] Author input is documented as sRGB (CSS hex, OFF int, JSCAD colorize tuple)
- [ ] Conversion uses helpers from `packages/runtime/src/utils/color-space.ts`
- [ ] Per-kernel `*-rendering.test.ts` parameterised over `colorParityCases`
- [ ] Cross-kernel parity test covers both non-PBR and PBR paths
- [ ] No second sRGB→linear pass on already-linear values (Manifold, Zoo)
- [ ] Three.js `outputColorSpace` left at default `SRGBColorSpace`

## References

- [glTF 2.0 — `pbrMetallicRoughness.baseColorFactor`](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#reference-pbrmetallicroughness)
- [glTF 2.0 — Color Spaces](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#color-spaces)
- [Three.js — Color Management](https://threejs.org/docs/#manual/en/introduction/Color-management)
- Research: `docs/research/kernel-color-space-srgb-conversion.md`
- Research: `docs/research/cross-kernel-color-parity.md`
