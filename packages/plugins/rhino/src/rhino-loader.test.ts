/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- defineKernel intentionally erases private backend context */
/**
 * Rhino — a `.3dm` import deletes every rhino3dm object it obtained.
 *
 * rhino3dm objects are Embind handles over WebAssembly memory and have no finalizer, so the parsed file, its
 * tables, objects, geometry and attributes stay in the heap until something calls `delete()` (D-RT-17).
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Mesh, RhinoModule } from 'rhino3dm';
import { createMockKernelRuntime } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { rhinoKernel } from '#rhino.kernel.js';
import { ThreeDmLoader } from '#rhino-loader.js';

type Handle = { isDeleted(): boolean; delete(): void };

const isHandle = (value: unknown): value is Handle =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Partial<Handle>).isDeleted === 'function' &&
  typeof (value as Partial<Handle>).delete === 'function';

const skippedMembers = new Set(['constructor', 'delete', 'isDeleted', 'deleteLater', 'isAliasOf', 'clone']);

/**
 * Record every Embind handle a rhino3dm method, getter or static factory returns while `record` is on.
 *
 * @param rhino - The module instance the loader uses.
 * @returns The recorded handles and a restore function.
 */
const recordHandles = (rhino: RhinoModule): { handles: Handle[]; restore(): void } => {
  const handles: Handle[] = [];
  const restores: Array<() => void> = [];
  const wrap = (original: (...arguments_: unknown[]) => unknown) =>
    function (this: unknown, ...arguments_: unknown[]): unknown {
      const result = original.apply(this, arguments_);
      if (isHandle(result)) {
        handles.push(result);
      }
      return result;
    };
  const instrument = (target: Record<string, unknown>): void => {
    for (const key of Object.getOwnPropertyNames(target)) {
      if (skippedMembers.has(key)) {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (!descriptor?.configurable) {
        continue;
      }
      if (typeof descriptor.value === 'function') {
        Object.defineProperty(target, key, {
          ...descriptor,
          value: wrap(descriptor.value as (...arguments_: unknown[]) => unknown),
        });
      } else if (descriptor.get) {
        Object.defineProperty(target, key, { ...descriptor, get: wrap(descriptor.get) });
      } else {
        continue;
      }
      restores.push(() => {
        Object.defineProperty(target, key, descriptor);
      });
    }
  };
  for (const value of Object.values(rhino as unknown as Record<string, unknown>)) {
    if (
      typeof value === 'function' &&
      typeof (value.prototype as Partial<Handle> | undefined)?.isDeleted === 'function'
    ) {
      instrument(value as unknown as Record<string, unknown>);
      instrument(value.prototype as Record<string, unknown>);
    }
  }
  return {
    handles,
    restore() {
      for (const restore of restores.reverse()) {
        restore();
      }
    },
  };
};

/**
 * A `.3dm` file with a layer, a material, a mesh, a point and a curve.
 *
 * @param rhino - The rhino3dm module.
 * @returns The file's bytes.
 */
const buildMixedFile = (rhino: RhinoModule): Uint8Array<ArrayBuffer> => {
  const file = new rhino.File3dm();
  const layer = new rhino.Layer();
  layer.name = 'Parts';
  const layerIndex = file.layers().add(layer);
  const material = new rhino.Material();
  file.materials().add(material);
  const attributes = new rhino.ObjectAttributes();
  attributes.layerIndex = layerIndex;
  attributes.materialIndex = 0;
  const fixture = rhino.File3dm.fromByteArray(
    new Uint8Array(readFileSync(new URL('fixtures/cube-mesh.3dm', import.meta.url))),
  );
  const fixtureObject = fixture.objects().get(0);
  const mesh = fixtureObject.geometry() as Mesh;
  file.objects().addMesh(mesh, attributes);
  file.objects().addPoint([1, 2, 3], attributes);
  const curve = new rhino.LineCurve([0, 0, 0], [10, 0, 0]);
  file.objects().addCurve(curve, attributes);
  const bytes = new Uint8Array(file.toByteArray());
  // The tables this helper read are left to the test process; only the import under test is measured.
  for (const owned of [curve, mesh, fixtureObject, fixture, attributes, material, layer, file]) {
    (owned as unknown as Handle).delete();
  }
  return bytes;
};

const definition = await resolveRuntimePluginDefinition('kernel', rhinoKernel());
let rhino!: RhinoModule;
let recording: ReturnType<typeof recordHandles> | undefined;

beforeAll(async () => {
  const context: { rhino: RhinoModule } = await definition.initialize({}, createMockKernelRuntime());
  ({ rhino } = context);
});

afterEach(() => {
  recording?.restore();
  recording = undefined;
});

describe('ThreeDmLoader', () => {
  it.each([
    ['a mesh file', () => new Uint8Array(readFileSync(new URL('fixtures/cube-mesh.3dm', import.meta.url)))],
    ['a file with layers, materials, a mesh, a point and a curve', () => buildMixedFile(rhino)],
  ])('deletes every rhino3dm object it obtained while importing %s', async (_name, bytesFor) => {
    const bytes = bytesFor();
    recording = recordHandles(rhino);

    const glb = await new ThreeDmLoader(rhino).initialize({ format: '3dm' }).load([{ name: 'model.3dm', bytes }]);

    expect(glb.byteLength).toBeGreaterThan(0);
    expect(recording.handles.length).toBeGreaterThan(0);
    expect(recording.handles.filter((handle) => !handle.isDeleted())).toHaveLength(0);
  });
});
