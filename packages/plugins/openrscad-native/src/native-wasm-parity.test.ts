/* eslint-disable @typescript-eslint/naming-convention -- fixture keys are virtual file paths. */
// @vitest-environment node
/**
 * Native/WebAssembly parity gate.
 *
 * `@taucad/openrscad` and `@taucad/openrscad-native` are the same Rust pipeline
 * behind two marshalling layers, so this asserts **equality, not tolerance**:
 * byte-identical GLB and 3MF, and identical triangle/vertex counts, volume and
 * area. That is stronger than `apps/runtime-e2e/src/cross-kernel-mesh-parity.test.ts`,
 * which compares two genuinely different kernels and therefore has to match
 * normals spatially.
 *
 * 3MF is not optional here. It is the only artifact OpenRSCAD emits that
 * carries full f64: GLB and STL are f32 by format, and OBJ/OFF/AMF serialize an
 * f32-quantized mesh. A gate over GLB alone is compatible with an f64 geometry
 * divergence of arbitrary sub-f32 size, so it certifies the encoder, not the
 * solid.
 *
 * Requires a local build of `repos/openrscad/packages/npm-native` (and of
 * `packages/npm`, which it links against). Comparing against the published
 * engine would compare two different Rust revisions.
 */
import { describe, expect, it } from 'vitest';
import { openrscadKernel } from '@taucad/openrscad';
import type { AnyKernelDefinition } from '@taucad/runtime/kernel';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createMockKernelRuntime } from '@taucad/runtime-testing';

import { openrscadNativeKernel } from '#openrscad-native.kernel.js';

const entryPath = 'project/model.scad';
const options = { tessellation: { segments: 32, minimumAngle: 12, minimumSize: 2 } } as const;

/**
 * One case per divergence class the spike found, so a regression names its own
 * cause: `hull` covers the convex-hull horizon order, `trig` the f64
 * transcendentals, `boolean` the CSG relation kernel, `color` the sRGB curve
 * that reaches every GLB material, `scad-math` the SCAD language's own
 * `sin`/`pow` builtins, and `extrude` the 2D → 3D tessellators.
 */
const fixtures = {
  hull: 'hull() { cylinder(h=6, r=6); translate([40, 0, 0]) cylinder(h=6, r=6); }',
  trig: 'rotate([0, 0, 37]) cylinder(h=10, r=5); translate([20, 0, 0]) sphere(6);',
  boolean: 'difference() { cube(20, center=true); rotate([25, 0, 0]) cylinder(h=40, r=6, center=true); }',
  color: 'color("red") cube(8); translate([10, 0, 0]) color("#3f7fbf") sphere(4);',
  'scad-math': 'for (i = [0:11]) translate([10 * cos(i * 30), 10 * sin(i * 30), 0]) cube(pow(1.2, i));',
  extrude: 'linear_extrude(6, twist=45) circle(5); translate([20, 0, 0]) rotate_extrude() translate([6, 0]) circle(2);',
} as const;

const exportOptions = {
  glb: { ...options, coordinateSystem: 'y-up', unit: { length: 'millimeter' } },
  '3mf': options,
} as const;

const buildAndExport = async (kernel: typeof openrscadKernel, source: string, format: 'glb' | '3mf') => {
  const definition: AnyKernelDefinition = await resolveRuntimePluginDefinition('kernel', kernel());
  const runtime = createMockKernelRuntime({
    filesystemOverrides: {
      readFileResult: async (path) => {
        if (path === entryPath) {
          return source;
        }
        throw Object.assign(new Error(`Missing ${path}`), { code: 'ENOENT' });
      },
    },
  });
  const context: unknown = await definition.initialize({}, runtime);
  const created = (await definition.createGeometry({ entryPath, parameters: {}, options }, runtime, context)) as {
    nativeHandle: { stats: { triangleCount: number; vertexCount: number; volume: number; area: number } };
  };
  const exported = await definition.exportGeometry(
    { format, nativeHandle: created.nativeHandle, options: exportOptions[format] },
    runtime,
    context,
  );
  if (!exported.success) {
    throw new Error(`${format} export failed: ${JSON.stringify(exported.issues)}`);
  }
  await definition.cleanup?.(context);
  return { file: exported.data[0]!, stats: created.nativeHandle.stats };
};

describe('@taucad/openrscad-native parity with @taucad/openrscad', () => {
  it('carries a distinct version, because the build cache is keyed on it', async () => {
    // The shared capability id is asserted in `openrscad-native.plugin.test.ts`
    // (it is on the plugin capability, not on the resolved kernel definition).
    // The versions must differ: the runtime's native-build cache key covers
    // kernel version, so two engines sharing one key could serve each other's
    // artifacts — invisibly, and only on whichever host warmed the cache.
    const native = await resolveRuntimePluginDefinition('kernel', openrscadNativeKernel());
    const wasm = await resolveRuntimePluginDefinition('kernel', openrscadKernel());
    expect(native.version).not.toBe(wasm.version);
    expect(native.version).toContain('+native');
  });

  for (const [name, source] of Object.entries(fixtures)) {
    for (const format of ['glb', '3mf'] as const) {
      it(`emits a byte-identical ${format} for ${name}`, async () => {
        const wasm = await buildAndExport(openrscadKernel, source, format);
        const native = await buildAndExport(openrscadNativeKernel, source, format);
        expect(native.file.bytes.byteLength).toBe(wasm.file.bytes.byteLength);
        expect(Buffer.from(native.file.bytes).equals(Buffer.from(wasm.file.bytes))).toBe(true);
      });
    }

    it(`reports identical geometry statistics for ${name}`, async () => {
      const wasm = await buildAndExport(openrscadKernel, source, 'glb');
      const native = await buildAndExport(openrscadNativeKernel, source, 'glb');
      // Byte equality already implies these, but they survive a future
      // `tolerant(ε)` verdict on the bytes and they name the failure better.
      expect(native.stats.triangleCount).toBe(wasm.stats.triangleCount);
      expect(native.stats.vertexCount).toBe(wasm.stats.vertexCount);
      const relative = (left: number, right: number) => Math.abs(left - right) / Math.max(Math.abs(right), 1);
      expect(relative(native.stats.volume, wasm.stats.volume)).toBeLessThanOrEqual(1e-12);
      expect(relative(native.stats.area, wasm.stats.area)).toBeLessThanOrEqual(1e-12);
    });
  }
});
