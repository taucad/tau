/**
 * Reference FFF engine: planar slicing on `manifold-3d`.
 *
 * Deterministic G-code for simple parts (blueprint D11). The companion
 * service remains the qualified production engine; this one gives an offline
 * path, fixtures and tests.
 *
 * @module
 */

import { getManifoldModule, setWasmUrl } from 'manifold-3d/lib/wasm.js';
import type { CrossSection, Manifold, ManifoldToplevel, SimplePolygon } from 'manifold-3d';

import type { TriangleMesh } from '#glb-mesh.js';
import type { ResolvedSlicerOptions } from '#slicer-options.js';

/** Input to {@link sliceReference}. @internal */
export type ReferenceSliceInput = Readonly<{
  mesh: TriangleMesh;
  options: ResolvedSlicerOptions;
  signal: AbortSignal;
}>;

/** What the reference engine produced. @internal */
export type ReferenceSliceResult = Readonly<{
  gcode: string;
  layerCount: number;
  /** Layers that received at least one extrusion. */
  extrudedLayerCount: number;
  /** Millimetres of filament. */
  filamentLength: number;
  /** Extrusion bounds in printer millimetres. */
  bounds: Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>;
}>;

/** Stable refusal codes raised by {@link sliceReference}. @internal */
export type ReferenceEngineErrorCode = 'GEOMETRY_INVALID' | 'GEOMETRY_TOO_LARGE';

/** Typed refusal raised by {@link sliceReference}. @internal */
export class ReferenceEngineError extends Error {
  public readonly code: ReferenceEngineErrorCode;

  public constructor(code: ReferenceEngineErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReferenceEngineError';
    this.code = code;
  }
}

const manifoldWasmUrl = new URL(import.meta.resolve('manifold-3d/manifold.wasm')).href;
let manifoldModule: Promise<ManifoldToplevel> | undefined;

const loadManifold = async (): Promise<ManifoldToplevel> => {
  if (manifoldModule === undefined) {
    setWasmUrl(manifoldWasmUrl);
    manifoldModule = getManifoldModule();
  }
  return manifoldModule;
};

const buildHeight = 256;
const bottomSolidLayers = 3;
const topSolidLayers = 4;
const retractLength = 0.8;
const retractSpeed = 30;
const zSpeed = 20;
const retractMinimumTravel = 1.5;
const purgeSpeed = 20;
const firstLayerSpeedFactor = 0.5;
const outerWallSpeedFactor = 0.75;
const purgeInset = 20;
const purgeY = 5;
const minimumInfillSpan = 0.4;
const layerEpsilon = 1e-6;

type Segment = readonly [x0: number, y0: number, x1: number, y1: number];

const formatNumber = (value: number, digits: number): string => {
  const text = value.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
};

/**
 * Even-odd scanline clipping of parallel infill lines against a set of contours.
 *
 * Lines run at `angleDegrees`; consecutive lines alternate direction so the
 * head zigzags. Spans shorter than one extrusion width are dropped.
 *
 * @param contours - Closed contours of the region to fill.
 * @param spacing - Millimetres between lines.
 * @param angleDegrees - Line direction.
 * @returns Ordered extrusion spans.
 */
const scanlineSpans = (contours: readonly SimplePolygon[], spacing: number, angleDegrees: number): Segment[] => {
  const angle = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotated = contours.map((contour) =>
    contour.map(([x, y]): readonly [number, number] => [x * cos + y * sin, -x * sin + y * cos]),
  );
  let minY = Infinity;
  let maxY = -Infinity;
  for (const contour of rotated) {
    for (const [, y] of contour) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const spans: Segment[] = [];
  if (!Number.isFinite(minY)) {
    return spans;
  }
  const unrotate = (x: number, y: number): readonly [number, number] => [x * cos - y * sin, x * sin + y * cos];
  let lineIndex = 0;
  for (let y = (Math.floor(minY / spacing) + 0.5) * spacing; y < maxY; y += spacing) {
    const crossings: number[] = [];
    for (const contour of rotated) {
      for (const [index, point] of contour.entries()) {
        const next = contour[(index + 1) % contour.length]!;
        if (point[1] > y !== next[1] > y) {
          crossings.push(point[0] + ((y - point[1]) * (next[0] - point[0])) / (next[1] - point[1]));
        }
      }
    }
    crossings.sort((left, right) => left - right);
    const lineSpans: Segment[] = [];
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const start = crossings[index]!;
      const end = crossings[index + 1]!;
      if (end - start >= minimumInfillSpan) {
        const [x0, y0] = unrotate(start, y);
        const [x1, y1] = unrotate(end, y);
        lineSpans.push([x0, y0, x1, y1]);
      }
    }
    if (lineIndex % 2 === 1) {
      lineSpans.reverse();
      spans.push(...lineSpans.map(([x0, y0, x1, y1]): Segment => [x1, y1, x0, y0]));
    } else {
      spans.push(...lineSpans);
    }
    lineIndex += 1;
  }
  return spans;
};

const optionLines = (options: ResolvedSlicerOptions): string[] =>
  Object.entries(options)
    .filter(([key]) => key !== 'service')
    .map(([key, value]) => `; tau:option ${key}=${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);

const withCrossSection = <T>(section: CrossSection, use: (section: CrossSection) => T): T => {
  try {
    return use(section);
  } finally {
    section.delete();
  }
};

/**
 * Slice a welded mesh into reference X1C G-code.
 *
 * @param input - Mesh, resolved options and cancellation.
 * @returns G-code text and summary counts.
 * @throws ReferenceEngineError - When the mesh is not a closed manifold or does not fit the bed.
 * @internal
 */
// ponytail: convex-safe walls from manifold offsets, no supports, no bridging, no overhang
// detection and no seam or path ordering; features thinner than one extrusion width are dropped.
export const sliceReference = async (input: ReferenceSliceInput): Promise<ReferenceSliceResult> => {
  const { options, signal } = input;
  signal.throwIfAborted();
  const module = await loadManifold();
  const { layerHeight } = options;
  const width = options.nozzleDiameter;
  const filamentArea = Math.PI * (options.filamentDiameter / 2) ** 2;
  const density = options.infillPercent / 100;

  const ofMesh = (triVerts: Uint32Array): Manifold =>
    module.Manifold.ofMesh(new module.Mesh({ numProp: 3, vertProperties: input.mesh.positions, triVerts }));
  let manifold: Manifold;
  try {
    manifold = ofMesh(input.mesh.indices);
    // A closed mesh wound inside out (an OpenSCAD polyhedron with its faces listed the other way)
    // is a valid manifold with negative volume, and every slice of it is empty: turn it right side out.
    if (manifold.status() === 'NoError' && manifold.volume() < 0) {
      manifold.delete();
      const flipped = Uint32Array.from(input.mesh.indices);
      for (let index = 0; index < flipped.length; index += 3) {
        [flipped[index + 1], flipped[index + 2]] = [flipped[index + 2]!, flipped[index + 1]!];
      }
      manifold = ofMesh(flipped);
    }
  } catch (error) {
    throw new ReferenceEngineError('GEOMETRY_INVALID', 'The mesh is not a closed, consistently oriented manifold.', {
      cause: error,
    });
  }
  const status = manifold.status();
  if (status !== 'NoError') {
    manifold.delete();
    throw new ReferenceEngineError('GEOMETRY_INVALID', `The mesh is not a printable manifold (${status}).`);
  }

  const lines: string[] = [];
  let filamentLength = 0;
  let extrudedLayerCount = 0;
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  // The nozzle starts unprimed: the first extrusion is preceded by one prime of `retractLength`.
  const head = { x: 0, y: 0, z: 0, feed: 0, retracted: true };

  const feedFor = (millimetresPerSecond: number): string => {
    const feed = Math.round(millimetresPerSecond * 60);
    if (feed === head.feed) {
      return '';
    }
    head.feed = feed;
    return ` F${feed}`;
  };
  const retract = (): void => {
    if (!head.retracted) {
      lines.push(`G1 E-${formatNumber(retractLength, 3)}${feedFor(retractSpeed)}`);
      head.retracted = true;
    }
  };
  const unretract = (): void => {
    if (head.retracted) {
      lines.push(`G1 E${formatNumber(retractLength, 3)}${feedFor(retractSpeed)}`);
      head.retracted = false;
    }
  };
  const travel = (x: number, y: number): void => {
    const distance = Math.hypot(x - head.x, y - head.y);
    if (distance === 0) {
      return;
    }
    if (distance > retractMinimumTravel) {
      retract();
    }
    lines.push(`G0 X${formatNumber(x, 3)} Y${formatNumber(y, 3)}${feedFor(options.travelSpeed)}`);
    head.x = x;
    head.y = y;
  };
  const extrude = (x: number, y: number, speed: number): void => {
    const length = Math.hypot(x - head.x, y - head.y);
    if (length === 0) {
      return;
    }
    unretract();
    const filament = (width * layerHeight * length) / filamentArea;
    filamentLength += filament;
    lines.push(`G1 X${formatNumber(x, 3)} Y${formatNumber(y, 3)} E${formatNumber(filament, 5)}${feedFor(speed)}`);
    for (const point of [
      [head.x, head.y],
      [x, y],
    ]) {
      bounds.min[0] = Math.min(bounds.min[0]!, point[0]!);
      bounds.min[1] = Math.min(bounds.min[1]!, point[1]!);
      bounds.max[0] = Math.max(bounds.max[0]!, point[0]!);
      bounds.max[1] = Math.max(bounds.max[1]!, point[1]!);
    }
    bounds.min[2] = Math.min(bounds.min[2]!, head.z);
    bounds.max[2] = Math.max(bounds.max[2]!, head.z);
    head.x = x;
    head.y = y;
  };
  const moveZ = (z: number): void => {
    lines.push(`G1 Z${formatNumber(z, 3)}${feedFor(zSpeed)}`);
    head.z = z;
  };
  const loop = (contour: SimplePolygon, speed: number): void => {
    const [first] = contour;
    if (first === undefined || contour.length < 3) {
      return;
    }
    travel(first[0], first[1]);
    for (const [x, y] of contour.slice(1)) {
      extrude(x, y, speed);
    }
    extrude(first[0], first[1], speed);
  };

  try {
    const box = manifold.boundingBox();
    const size = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
    if (size[0]! > options.bedSize.x || size[1]! > options.bedSize.y || size[2]! > buildHeight) {
      throw new ReferenceEngineError(
        'GEOMETRY_TOO_LARGE',
        `The part measures ${size.map((value) => formatNumber(value, 2)).join(' × ')} mm; the bed is ${options.bedSize.x} × ${options.bedSize.y} × ${buildHeight} mm.`,
      );
    }
    const centered = manifold.translate(
      options.bedSize.x / 2 - (box.min[0] + box.max[0]) / 2,
      options.bedSize.y / 2 - (box.min[1] + box.max[1]) / 2,
      -box.min[2],
    );
    manifold.delete();
    manifold = centered;
    const height = size[2]!;
    const layerCount = Math.max(1, Math.ceil((height - layerEpsilon) / layerHeight));

    lines.push(
      '; generated by @taucad/slicer reference engine',
      ...optionLines(options),
      `; tau:layer-count ${layerCount}`,
      `M140 S${formatNumber(options.bedTemperature, 0)}`,
      `M104 S${formatNumber(options.nozzleTemperature, 0)}`,
      'G28',
      `M190 S${formatNumber(options.bedTemperature, 0)}`,
      `M109 S${formatNumber(options.nozzleTemperature, 0)}`,
      'G90',
      'M83',
      'G92 E0',
      'M106 S0',
      ';TYPE:Custom',
    );
    // Purge line along the front edge, inside the usable bed.
    moveZ(layerHeight);
    travel(purgeInset, purgeY);
    extrude(options.bedSize.x - purgeInset, purgeY, purgeSpeed);
    travel(options.bedSize.x - purgeInset, purgeY + width);
    extrude(purgeInset, purgeY + width, purgeSpeed);
    retract();

    for (let layer = 0; layer < layerCount; layer += 1) {
      signal.throwIfAborted();
      const top = Math.min((layer + 1) * layerHeight, height);
      const sliceHeight = Math.min((layer + 0.5) * layerHeight, height - layerEpsilon);
      const speedFactor = layer === 0 ? firstLayerSpeedFactor : 1;
      lines.push(';LAYER_CHANGE', `;Z:${formatNumber(top, 3)}`, `;LAYER:${layer}`);
      if (layer === 1) {
        lines.push('M106 S255');
      }
      moveZ(top);
      const extruded = withCrossSection(manifold.slice(sliceHeight), (section): boolean => {
        let layerExtruded = false;
        if (section.isEmpty()) {
          return layerExtruded;
        }
        for (let wall = options.walls - 1; wall >= 0; wall -= 1) {
          const contours = withCrossSection(section.offset(-(wall + 0.5) * width, 'Miter', 2), (offsetSection) =>
            withCrossSection(offsetSection.simplify(1e-3), (simplified) => simplified.toPolygons()),
          );
          if (contours.length === 0) {
            continue;
          }
          lines.push(wall === 0 ? ';TYPE:Outer wall' : ';TYPE:Inner wall');
          const speed = options.printSpeed * speedFactor * (wall === 0 ? outerWallSpeedFactor : 1);
          for (const contour of contours) {
            loop(contour, speed);
            layerExtruded = true;
          }
        }
        const solid = layer < bottomSolidLayers || layer >= layerCount - topSolidLayers;
        if (!solid && density <= 0) {
          return layerExtruded;
        }
        const region = withCrossSection(section.offset(-(options.walls + 0.1) * width, 'Miter', 2), (offsetSection) =>
          withCrossSection(offsetSection.simplify(1e-3), (simplified) => simplified.toPolygons()),
        );
        if (region.length === 0) {
          return layerExtruded;
        }
        const families =
          solid || options.infillPattern === 'rectilinear'
            ? [{ spacing: solid ? width : width / density, angle: layer % 2 === 0 ? 45 : 135 }]
            : [
                { spacing: (2 * width) / density, angle: 45 },
                { spacing: (2 * width) / density, angle: 135 },
              ];
        const spans = families.flatMap((family) => scanlineSpans(region, family.spacing, family.angle));
        if (spans.length === 0) {
          return layerExtruded;
        }
        lines.push(solid ? ';TYPE:Internal solid infill' : ';TYPE:Sparse infill');
        for (const [x0, y0, x1, y1] of spans) {
          travel(x0, y0);
          extrude(x1, y1, options.printSpeed * speedFactor);
        }
        return true;
      });
      if (extruded) {
        extrudedLayerCount += 1;
      }
    }
    if (extrudedLayerCount === 0) {
      throw new ReferenceEngineError(
        'GEOMETRY_INVALID',
        `Nothing to print: no layer of the part has anything to extrude. Features thinner than the ${formatNumber(width, 2)} mm extrusion are dropped.`,
      );
    }

    lines.push(';END');
    retract();
    lines.push(
      'M140 S0',
      'M104 S0',
      'M107',
      'G91',
      `G1 Z${formatNumber(Math.min(10, buildHeight - head.z), 3)} F600`,
      'G90',
      'M84',
      `; tau:filament-length ${formatNumber(filamentLength, 2)}`,
      '',
    );
    const finite = Number.isFinite(bounds.min[0]);
    return {
      gcode: lines.join('\n'),
      layerCount,
      extrudedLayerCount,
      filamentLength,
      bounds: finite
        ? {
            min: [bounds.min[0]!, bounds.min[1]!, bounds.min[2]!],
            max: [bounds.max[0]!, bounds.max[1]!, bounds.max[2]!],
          }
        : { min: [0, 0, 0], max: [0, 0, 0] },
    };
  } finally {
    manifold.delete();
  }
};
