// @vitest-environment node
/**
 * Native/WebAssembly parity gate.
 *
 * `@taulabs/openrscad-engine` is one Rust pipeline behind two marshalling
 * layers, so this asserts **equality, not tolerance**: byte-identical GLB and
 * 3MF, and identical triangle/vertex counts, volume and area. That is stronger
 * than `apps/runtime-e2e/src/cross-kernel-mesh-parity.test.ts`, which compares
 * two genuinely different kernels and therefore has to match normals spatially.
 *
 * Both backends are loaded in *this* process, and both run through the Tau
 * kernel path, because that path is what a cache entry is produced by:
 *
 * * the addon comes from the bare `@taulabs/openrscad-engine` import, exactly
 *   as `openrscadKernel` loads it — the `node` condition binds the addon. The
 *   suite asserts `backend === 'native'` first, so a host without the addon
 *   fails loudly instead of silently comparing WebAssembly against itself.
 * * the WebAssembly side is rebuilt here from the engine's own parts:
 *   `makeApi()` (`./core`) over the wasm Node glue (`./node`). Same facade the
 *   package's entries use, so only the marshalling layer differs.
 *
 * 3MF is not optional here. It is the only artifact OpenRSCAD emits that
 * carries full f64: GLB and STL are f32 by format, and OBJ/OFF/AMF serialize an
 * f32-quantized mesh. A gate over GLB alone is compatible with an f64 geometry
 * divergence of arbitrary sub-f32 size, so it certifies the encoder, not the
 * solid.
 */
import { describe, expect, it } from 'vitest';
import type * as OpenRscadModule from '@taulabs/openrscad-engine';
import type { RawEngine } from '@taulabs/openrscad-engine/core';
import { makeApi } from '@taulabs/openrscad-engine/core';
import * as wasmGlue from '@taulabs/openrscad-engine/node';
import type { AnyKernelDefinition } from '@taucad/runtime/kernel';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createMockKernelRuntime } from '@taucad/runtime-testing';

import { createOpenrscadKernel, openrscadKernel } from '#openrscad.kernel.js';

const entryPath = 'project/model.scad';
const options = { tessellation: { segments: 32, minimumAngle: 12, minimumSize: 2 } } as const;

/** The WebAssembly backend, assembled from the engine's own facade and glue. */
const wasmKernel = createOpenrscadKernel({
  loadBackend: async () =>
    ({
      ...makeApi(wasmGlue as unknown as RawEngine, async () => undefined),
      ensureReady: async () => undefined,
      backend: 'wasm',
      backendCause: undefined,
    }) as unknown as typeof OpenRscadModule,
});

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

describe('@taulabs/openrscad-engine native/WebAssembly parity', () => {
  it('binds the addon for the default kernel, so the comparison is not wasm against itself', async () => {
    const engine = await import('@taulabs/openrscad-engine');
    expect([engine.backend, engine.backendCause]).toEqual(['native', undefined]);
  });

  for (const [name, source] of Object.entries(fixtures)) {
    for (const format of ['glb', '3mf'] as const) {
      it(`emits a byte-identical ${format} for ${name}`, async () => {
        const wasm = await buildAndExport(wasmKernel, source, format);
        const native = await buildAndExport(openrscadKernel, source, format);
        expect(native.file.bytes.byteLength).toBe(wasm.file.bytes.byteLength);
        expect(Buffer.from(native.file.bytes).equals(Buffer.from(wasm.file.bytes))).toBe(true);
      });
    }

    it(`reports identical geometry statistics for ${name}`, async () => {
      const wasm = await buildAndExport(wasmKernel, source, 'glb');
      const native = await buildAndExport(openrscadKernel, source, 'glb');
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
