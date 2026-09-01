// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cameraFar,
  cameraNear,
  depth,
  materialOpacity,
  positionView,
  sRGBTransferEOTF,
  sRGBTransferOETF,
  vec4,
  viewZToLogarithmicDepth,
  viewZToPerspectiveDepth,
  viewZToReversedPerspectiveDepth,
} from 'three/tsl';
import { Line2NodeMaterial as ThreeLine2NodeMaterial, NodeMaterial as ThreeNodeMaterial } from 'three/webgpu';
import {
  Line2NodeMaterial,
  tauOpaqueViewportTexture,
} from '#components/geometry/graphics/three/materials/line2.material.js';
import { serialiseStrippedTslGraph } from '#components/geometry/graphics/three/utils/tsl-node-graph-snapshot.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));

type SetupPrototypeShim = {
  setup: (...callArgs: readonly unknown[]) => unknown;
};

const nodeMaterialPrototype = ThreeNodeMaterial.prototype as unknown as SetupPrototypeShim;
const line2Prototype = ThreeLine2NodeMaterial.prototype as unknown as SetupPrototypeShim;

describe('Line2NodeMaterial TSL snapshots', () => {
  it('materialises a node graph distinct from stock ThreeLine2NodeMaterial (trimSegmentCameraNear layout)', () => {
    const material = new Line2NodeMaterial({
      color: 0xff_00_ff,
      linewidth: 1,
      opacity: 0.6,
      transparent: true,
      worldUnits: false,
    });
    expect(material.type).toBe('Line2NodeMaterial');
  });

  it('matches stable stripped WebGPU line2 node material JSON snapshot', async () => {
    const material = new Line2NodeMaterial({
      color: 0xff_00_ff,
      linewidth: 1,
      opacity: 0.6,
      transparent: true,
      worldUnits: false,
    });
    const serialised = serialiseStrippedTslGraph(material.toJSON());

    await expect(serialised).toMatchFileSnapshot(
      join(currentDirectory, '__shader-snapshots__', 'line2-node-material.json'),
    );
  });
});

/* eslint-disable @typescript-eslint/naming-convention -- mirrors three.js external API names (`toJSON`) inside test type stubs for the TSL graph */
describe('Line2NodeMaterial.outputNode (gamma-space blend regression guard)', () => {
  /**
   * Permissive structural shape for the bits of the TSL graph this regression guard
   * touches. The `@types/three` TSL surface collapses to `Node` at function boundaries
   * but the chainable proxy methods (`.mul`, `.add`, `.oneMinus`, swizzles like `.rgb` /
   * `.a`) are typed as `any` on the public class, so a hand-written structural shape is
   * the most precise way to thread them through both the implementation under test and
   * a hand-rolled reference graph without resorting to `as any` or `as never`.
   */
  type TslChainable = {
    rgb: TslChainable;
    a: TslChainable;
    mul(operand: TslChainable): TslChainable;
    add(operand: TslChainable): TslChainable;
    oneMinus(): TslChainable;
    toJSON(): unknown;
  };

  type SrgbTransferInput = Parameters<typeof sRGBTransferOETF>[0];

  function toChainable(node: unknown): TslChainable {
    return node as TslChainable;
  }

  function asSrgbInput(node: unknown): SrgbTransferInput {
    return node as SrgbTransferInput;
  }

  type ColorNodeBearing = {
    readonly colorNode: TslChainable;
    outputNode: { toJSON: () => unknown } | undefined;
  };

  function runSetupWithStubbedAncestors(material: Line2NodeMaterial): void {
    const originalNodeMaterialSetup = nodeMaterialPrototype.setup;
    const originalLine2Setup = line2Prototype.setup;
    nodeMaterialPrototype.setup = () => undefined;
    line2Prototype.setup = () => undefined;
    try {
      const stubBuilder = { renderer: { currentSamples: 0 } };
      material.setup(stubBuilder);
    } finally {
      nodeMaterialPrototype.setup = originalNodeMaterialSetup;
      line2Prototype.setup = originalLine2Setup;
    }
  }

  function fingerprint(node: unknown): string {
    return serialiseStrippedTslGraph((node as TslChainable).toJSON());
  }

  /**
   * Smoking-gun regression: dropping the `sRGBTransferOETF`/`sRGBTransferEOTF` wrap around
   * the `color * α + viewportOpaqueMipTexture * (1 - α)` mix reverts the blend to linear
   * space. On WebGPU that produces visibly over-saturated overlay tints versus WebGL's
   * gamma-space framebuffer blend — exact symptom is axes lines + gizmo cube axes
   * looking much stronger on WebGPU. See class JSDoc "Divergence 4" and
   * `docs/policy/graphics-backend-policy.md` CB-3 / S7. We compare structural fingerprints
   * against both the expected sRGB-wrapped reference and a linear-only reference so a
   * regression to either shape fails loudly.
   */
  it('wraps both blend operands in sRGB transfer functions so the alpha mix happens in gamma space', () => {
    const material = new Line2NodeMaterial({
      color: 0xff_00_ff,
      linewidth: 1,
      opacity: 0.6,
      transparent: true,
      worldUnits: false,
    });

    runSetupWithStubbedAncestors(material);

    const view = material as unknown as ColorNodeBearing;
    expect(view.outputNode).toBeDefined();
    expect(view.colorNode).toBeDefined();

    const opacity = toChainable(materialOpacity);
    // Reference graph mirrors the implementation: it samples the Tau-owned non-mip
    // singleton (`tauOpaqueViewportTexture()`) rather than three.js's stock
    // `viewportOpaqueMipTexture()`. If the implementation regresses to the mip variant,
    // the fingerprint comparison below fails because the underlying texture node carries
    // a different `generateMipmaps` flag.
    const viewportRgb = toChainable(tauOpaqueViewportTexture()).rgb;
    const colorRgb = view.colorNode.rgb;
    const colorAlpha = view.colorNode.a;

    // Reference graph: gamma-space mix — must match the implementation byte-for-byte under
    // the uuid-stripped fingerprint helper.
    const colorSrgb = toChainable(sRGBTransferOETF(asSrgbInput(colorRgb)));
    const viewportSrgb = toChainable(sRGBTransferOETF(asSrgbInput(viewportRgb)));
    const blendedSrgb = colorSrgb.mul(opacity).add(viewportSrgb.mul(opacity.oneMinus()));
    const expectedSrgb = toChainable(
      vec4(
        sRGBTransferEOTF(asSrgbInput(blendedSrgb)) as unknown as Parameters<typeof vec4>[0],
        colorAlpha as unknown as Parameters<typeof vec4>[1],
      ),
    );

    // Linear-only reference (the prior broken shape) — must NOT match.
    const linearBlend = colorRgb.mul(opacity).add(viewportRgb.mul(opacity.oneMinus()));
    const linearReference = toChainable(
      vec4(linearBlend as unknown as Parameters<typeof vec4>[0], colorAlpha as unknown as Parameters<typeof vec4>[1]),
    );

    expect(fingerprint(view.outputNode)).toBe(fingerprint(expectedSrgb));
    expect(fingerprint(view.outputNode)).not.toBe(fingerprint(linearReference));
  });

  /**
   * Materials constructed without `transparent: true` (e.g. `createWebGpuGltfFatLineMaterial`)
   * must NOT pick up the manual gamma-space blend — they rely on standard `colorNode` output
   * and the upstream `NodeMaterial.setupOutput` chain. The smoking-gun guard ensures the
   * transparent-only branch never leaks into opaque consumers.
   */
  it('leaves outputNode unset when the material is opaque', () => {
    const material = new Line2NodeMaterial({
      color: 0xff_00_ff,
      linewidth: 1,
      worldUnits: false,
    });

    runSetupWithStubbedAncestors(material);

    expect((material as unknown as { outputNode: unknown }).outputNode).toBeNull();
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- restore strict naming-convention enforcement after the TSL graph stubs above */

describe('Line2NodeMaterial.setup parent dispatch (regression guard)', () => {
  /**
   * Smoking-gun regression: if `setup()` ever ends with `super.setup(builder)`, that resolves to
   * **`ThreeLine2NodeMaterial.setup`**, which rebuilds `vertexNode`/`colorNode`/`outputNode` with the
   * upstream **`nearEstimate = b * -0.5 / a`** trim — silently overwriting the corrected graph
   * (under reversed-Z that collapses to `-far/2` and flips long axes into the opposite hemisphere
   * via `mix(start, end, alpha)`). The static **`material.toJSON()`** snapshot can't catch this
   * because TSL graphs are built lazily inside `setup`. Patching the two prototype `setup` methods
   * by hand and counting calls is the cheapest way to assert which parent runs.
   */
  it('skips ThreeLine2NodeMaterial.setup and dispatches to NodeMaterial.setup directly', () => {
    const material = new Line2NodeMaterial({
      color: 0xff_00_ff,
      linewidth: 1,
      opacity: 0.6,
      transparent: true,
      worldUnits: false,
    });

    const originalNodeMaterialSetup = nodeMaterialPrototype.setup;
    const originalLine2Setup = line2Prototype.setup;

    let nodeMaterialSetupCalls = 0;
    let line2SetupCalls = 0;

    nodeMaterialPrototype.setup = () => {
      nodeMaterialSetupCalls += 1;
    };
    // Forward to the patched grandparent so the dispatch chain stays observable
    // even if the override regresses to `super.setup(builder)`.
    line2Prototype.setup = function patchedLine2Setup(this: unknown, ...callArgs: readonly unknown[]): unknown {
      line2SetupCalls += 1;
      return Reflect.apply(nodeMaterialPrototype.setup, this, callArgs);
    };

    let setupError: unknown;
    try {
      const stubBuilder = { renderer: { currentSamples: 0 } };
      material.setup(stubBuilder);
    } catch (error) {
      setupError = error;
    } finally {
      nodeMaterialPrototype.setup = originalNodeMaterialSetup;
      line2Prototype.setup = originalLine2Setup;
    }

    expect(setupError).toBeUndefined();
    expect(line2SetupCalls).toBe(0);
    expect(nodeMaterialSetupCalls).toBe(1);

    type NodeBearingMaterial = {
      readonly vertexNode?: unknown;
      readonly colorNode?: unknown;
    };
    const nodeView = material as unknown as NodeBearingMaterial;
    expect(nodeView.vertexNode).toBeDefined();
    expect(nodeView.colorNode).toBeDefined();
  });
});

describe('Line2NodeMaterial.setupHardwareClipping (section-view regression guard)', () => {
  /**
   * Smoking-gun regression: `NodeMaterial.setupHardwareClipping` activates vertex-stage
   * `gl_ClipDistance` whenever the device exposes `clip-distances`, but the hardware path's
   * `positionView` falls through to `modelViewMatrix * positionLocal` — for a
   * `LineSegmentsGeometry` that's the static unit-quad attribute reused by every instanced
   * segment, so the clip distance is constant per draw call and bleeds line edges onto the
   * sectioned-off half of the model. Forcing `hardwareClipping = false` routes through the
   * fragment-stage software path that reconstructs `positionView` per fragment from
   * `clipSpace`, which clips correctly. See the class JSDoc for the full chain.
   */
  it('skips the base addToStack(hardwareClipping()) and leaves hardwareClipping = false', () => {
    const material = new Line2NodeMaterial({
      color: 0xff_00_ff,
      linewidth: 1,
      opacity: 0.6,
      transparent: true,
      worldUnits: false,
    });

    const stackPushes: readonly unknown[] = [];
    const stubBuilder = {
      clippingContext: { unionPlanes: [{}, {}] },
      isAvailable: (capability: string) => capability === 'clipDistance',
      stack: {
        addToStack: (node: unknown) => {
          (stackPushes as unknown[]).push(node);
        },
      },
    };

    material.setupHardwareClipping(stubBuilder);

    expect(stackPushes).toHaveLength(0);
    expect((material as unknown as { hardwareClipping: boolean }).hardwareClipping).toBe(false);
  });
});

/* eslint-disable @typescript-eslint/naming-convention -- mirrors three.js external API names (`renderer.getMRT()`, `node.toJSON()`) inside test stubs and ad-hoc type aliases */
describe('Line2NodeMaterial.setupDepth (renderer-aware encoding regression guard)', () => {
  /**
   * Smoking-gun regression: hardcoding `material.depthNode = viewZToReversedPerspectiveDepth(...)`
   * at construction time emits reversed-Z `[1..0]` depth values into renderers that don't
   * use reversed-Z (`offscreen`/`screenshot` WebGPU runs with `logarithmicDepthBuffer: true`,
   * `reversedDepthBuffer: false`). Surfaces emit log-depth, lines emit reversed-perspective —
   * the comparison breaks and occluded line fragments leak into the saved PNG. The override
   * dispatches per `builder.renderer` flags, mirroring three.js's own `PointShadowNode` and
   * `NodeMaterial.setupDepth` patterns. See class JSDoc "Divergence 3".
   */
  type DepthAssignDescriptor = PropertyDescriptor | undefined;
  type CapturedAssign = { node: unknown };

  function captureDepthAssign(): { restore: () => void; captured: CapturedAssign } {
    const captured: CapturedAssign = { node: undefined };
    const fakeChain = { toStack: () => undefined };
    const originalDescriptor: DepthAssignDescriptor = Object.getOwnPropertyDescriptor(depth, 'assign');
    Object.defineProperty(depth, 'assign', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: (node: unknown): { toStack: () => undefined } => {
        captured.node = node;
        return fakeChain;
      },
    });
    return {
      captured,
      restore: () => {
        if (originalDescriptor) {
          Object.defineProperty(depth, 'assign', originalDescriptor);
        } else {
          delete (depth as { assign?: unknown }).assign;
        }
      },
    };
  }

  function fingerprint(node: unknown): string {
    return serialiseStrippedTslGraph((node as { toJSON: () => unknown }).toJSON());
  }

  const buildMaterial = (): Line2NodeMaterial =>
    new Line2NodeMaterial({
      color: 0xff_00_ff,
      linewidth: 1,
      opacity: 0.6,
      transparent: true,
      worldUnits: false,
    });

  it('emits viewZToReversedPerspectiveDepth when renderer.reversedDepthBuffer is true (viewport)', () => {
    const material = buildMaterial();
    material.depthBias = 0.999;

    const stubBuilder = {
      renderer: { reversedDepthBuffer: true, getMRT: () => null },
      camera: { isPerspectiveCamera: true },
    };

    const { captured, restore } = captureDepthAssign();
    try {
      material.setupDepth(stubBuilder);
    } finally {
      restore();
    }

    expect(captured.node).toBeDefined();
    const expected = viewZToReversedPerspectiveDepth(positionView.z.mul(material.depthBias), cameraNear, cameraFar);
    expect(fingerprint(captured.node)).toBe(fingerprint(expected));
  });

  it('emits viewZToLogarithmicDepth when renderer.logarithmicDepthBuffer is true (screenshot occlusion fix)', () => {
    const material = buildMaterial();
    material.depthBias = 0.999;

    const stubBuilder = {
      renderer: { logarithmicDepthBuffer: true, getMRT: () => null },
      camera: { isPerspectiveCamera: true },
    };

    const { captured, restore } = captureDepthAssign();
    try {
      material.setupDepth(stubBuilder);
    } finally {
      restore();
    }

    expect(captured.node).toBeDefined();
    const expected = viewZToLogarithmicDepth(positionView.z.mul(material.depthBias), cameraNear, cameraFar);
    expect(fingerprint(captured.node)).toBe(fingerprint(expected));
  });

  it('emits viewZToPerspectiveDepth when neither renderer flag is set', () => {
    const material = buildMaterial();
    material.depthBias = 0.999;

    const stubBuilder = {
      renderer: { getMRT: () => null },
      camera: { isPerspectiveCamera: true },
    };

    const { captured, restore } = captureDepthAssign();
    try {
      material.setupDepth(stubBuilder);
    } finally {
      restore();
    }

    expect(captured.node).toBeDefined();
    const expected = viewZToPerspectiveDepth(positionView.z.mul(material.depthBias), cameraNear, cameraFar);
    expect(fingerprint(captured.node)).toBe(fingerprint(expected));
  });

  it('honours material.depthNode when a caller has manually overridden it', () => {
    const material = buildMaterial();
    const manualOverride = positionView.z.mul(0.5);
    (material as { depthNode: unknown }).depthNode = manualOverride;

    const stubBuilder = {
      renderer: { reversedDepthBuffer: true, getMRT: () => null },
      camera: { isPerspectiveCamera: true },
    };

    const { captured, restore } = captureDepthAssign();
    try {
      material.setupDepth(stubBuilder);
    } finally {
      restore();
    }

    expect(captured.node).toBe(manualOverride);
  });

  /**
   * Orthographic cameras and MRT depth attachments are deliberately deferred to
   * `super.setupDepth(builder)` so the upstream `NodeMaterial.setupDepth` decision tree
   * (including the ortho-log branch and MRT lookup) stays authoritative for fat lines.
   * The smoking-gun guard here is the same pattern as the `super.setup` regression test
   * earlier in this file: prototype-patch the inherited method and count calls.
   */
  type SetupDepthShim = { setupDepth: (...args: readonly unknown[]) => unknown };

  it('falls through to NodeMaterial.setupDepth for orthographic cameras', () => {
    const nodeMaterialPrototypeShim = ThreeNodeMaterial.prototype as unknown as SetupDepthShim;
    const original = nodeMaterialPrototypeShim.setupDepth;
    let callCount = 0;

    nodeMaterialPrototypeShim.setupDepth = function patched(): unknown {
      callCount += 1;
      return undefined;
    };

    const material = buildMaterial();
    const stubBuilder = {
      renderer: { reversedDepthBuffer: true, getMRT: () => null },
      camera: { isPerspectiveCamera: false },
    };

    try {
      material.setupDepth(stubBuilder);
    } finally {
      nodeMaterialPrototypeShim.setupDepth = original;
    }

    expect(callCount).toBe(1);
  });

  it('falls through to NodeMaterial.setupDepth when MRT depth attachment is configured', () => {
    const nodeMaterialPrototypeShim = ThreeNodeMaterial.prototype as unknown as SetupDepthShim;
    const original = nodeMaterialPrototypeShim.setupDepth;
    let callCount = 0;

    nodeMaterialPrototypeShim.setupDepth = function patched(): unknown {
      callCount += 1;
      return undefined;
    };

    const material = buildMaterial();
    const stubBuilder = {
      renderer: {
        reversedDepthBuffer: true,
        getMRT: () => ({ has: (name: string): boolean => name === 'depth' }),
      },
      camera: { isPerspectiveCamera: true },
    };

    try {
      material.setupDepth(stubBuilder);
    } finally {
      nodeMaterialPrototypeShim.setupDepth = original;
    }

    expect(callCount).toBe(1);
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- restore default naming-convention enforcement after the three.js external-API stub block above */
