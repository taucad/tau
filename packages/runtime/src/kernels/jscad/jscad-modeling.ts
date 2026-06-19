import type { geometries as JscadGeometries, maths as JscadMaths } from '@jscad/modeling';

export type JscadModeling = {
  geometries: typeof JscadGeometries;
  maths: typeof JscadMaths;
  modifiers: {
    generalize: (options: { snap: boolean; triangulate: boolean }, ...geometries: unknown[]) => unknown;
    retessellate: (geometry: unknown) => unknown;
  };
};

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Resolve the runtime shape exposed by `@jscad/modeling`.
 *
 * Node ESM exposes the useful runtime API under `default`, while Vite/Vitest can
 * expose named properties directly. All kernel paths should go through this
 * resolver so rendering, serialization, and deserialization agree.
 */
export const resolveJscadModeling = (module: unknown): JscadModeling => {
  if (!isRecordObject(module)) {
    throw new TypeError('Invalid @jscad/modeling import shape: expected an object.');
  }

  const candidate = module['default'] ?? module;
  if (!isRecordObject(candidate) || !isRecordObject(candidate['geometries'])) {
    throw new TypeError('Invalid @jscad/modeling import shape: missing geometries export.');
  }

  return candidate as JscadModeling;
};
