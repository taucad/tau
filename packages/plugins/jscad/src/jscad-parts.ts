import type { JscadModeling } from '#jscad-modeling.js';
import { resolveShapeName, uniqueShapeName } from '@taucad/geometry-core';

/**
 * Ordered JSCAD geometry plus the display/export name Tau resolved for it.
 */
export type JscadPartDescriptor = {
  shape: unknown;
  name: string;
  index: number;
  sourceName?: string;
};

function flattenJscadResult(value: unknown, output: unknown[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      flattenJscadResult(item, output);
    }
    return;
  }

  if (value) {
    output.push(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getShapeName(shape: unknown): string | undefined {
  if (!isRecord(shape)) {
    return undefined;
  }

  const { name } = shape;
  if (typeof name !== 'string') {
    return undefined;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getDescriptorName(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const { name } = value;
  if (typeof name !== 'string') {
    return undefined;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isJscadGeometry(value: unknown, modeling: JscadModeling): boolean {
  const { geometries } = modeling;
  return geometries.geom3.isA(value) || geometries.geom2.isA(value) || geometries.path2.isA(value);
}

/**
 * Whether a normalized JSCAD part can be rendered by Tau's GLB path.
 *
 * @param part - normalized JSCAD part descriptor
 * @param modeling - resolved `@jscad/modeling` API from the kernel context
 * @returns true when the part is a 3D JSCAD geometry
 */
export function isRenderableJscadPart(part: JscadPartDescriptor, modeling: JscadModeling): boolean {
  return modeling.geometries.geom3.isA(part.shape);
}

function unwrapDescriptor(value: unknown): { shape: unknown; sourceName?: string } | undefined {
  if (!isRecord(value) || !('shape' in value)) {
    return undefined;
  }

  return {
    shape: value['shape'],
    sourceName: getDescriptorName(value),
  };
}

/**
 * Attach a name to a JSCAD geometry object when restoring metadata.
 *
 * @param shape - JSCAD geometry object
 * @param name - resolved part name
 * @returns the same shape object
 */
export function assignJscadPartName<T>(shape: T, name: string): T {
  if (isRecord(shape)) {
    const namedShape = shape as Record<string, unknown>;
    namedShape['name'] = name;
  }
  return shape;
}

/**
 * Normalize a JSCAD main() return value into ordered, named geometry parts.
 *
 * @param value - JSCAD output, nested arrays, or existing descriptors
 * @param modeling - resolved `@jscad/modeling` API from the kernel context
 * @returns normalized descriptors for supported JSCAD geometry values
 */
export function normalizeJscadParts(value: unknown, modeling: JscadModeling): JscadPartDescriptor[] {
  const flattened: unknown[] = [];
  flattenJscadResult(value, flattened);

  const parts: JscadPartDescriptor[] = [];
  const usedNames = new Map<string, number>();

  for (const candidate of flattened) {
    const descriptor = unwrapDescriptor(candidate);
    const shape = descriptor?.shape ?? candidate;
    if (!isJscadGeometry(shape, modeling)) {
      continue;
    }

    const index = parts.length;
    const sourceName = descriptor?.sourceName ?? getShapeName(shape);
    const baseName = resolveShapeName({ index, name: sourceName, source: 'authored' });
    const name = uniqueShapeName(baseName, usedNames);
    parts.push({
      shape,
      name,
      index,
      ...(sourceName ? { sourceName } : {}),
    });
  }

  return parts;
}

/**
 * Normalize a JSCAD return value and keep only geom3 parts renderable as GLB.
 *
 * @param value - JSCAD output, nested arrays, or existing descriptors
 * @param modeling - resolved `@jscad/modeling` API from the kernel context
 * @returns normalized 3D descriptors
 */
export function getRenderableJscadParts(value: unknown, modeling: JscadModeling): JscadPartDescriptor[] {
  return normalizeJscadParts(value, modeling).filter((part) => isRenderableJscadPart(part, modeling));
}
