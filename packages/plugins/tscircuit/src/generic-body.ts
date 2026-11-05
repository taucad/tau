/**
 * Generic 3D bodies for parts with no model.
 *
 * A part tscircuit gives no model (an inline `<footprint>`, a footprint with no generic body) would
 * otherwise render as bare pads: the converter skips any `cad_component` with no model source. The
 * kernel gives each such part a moulded box sized from its courtyard (else its pads) and coloured by
 * its kind, served as a `tau-models:generic/...` GLB in KiCad's frame: Z-up millimetres, the
 * component centre at the origin, the board surface at z = 0.
 */

import { Document, VertexLayout, WebIO } from '@gltf-transform/core';

import { packModelScheme } from '#kicad-pack.js';

/** The finish a generic body reads as: moulded power parts, black IC packages, ceramic, or grey plastic. */
export type GenericBodyKind = 'moulded' | 'package' | 'ceramic' | 'plastic';

/** A generic body in the component's own frame (before its rotation), in millimetres. */
export type GenericBody = {
  readonly kind: GenericBodyKind;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  /** The body centre's offset from the component centre. */
  readonly x: number;
  readonly y: number;
};

type Element = { readonly type: string } & Record<string, unknown>;
type Point = { x: number; y: number };

const genericPrefix = `${packModelScheme}generic/`;

/** sRGB base colours the presentation materials classify as the kind's finish. */
const kindColors: Readonly<Record<GenericBodyKind, readonly [number, number, number]>> = {
  moulded: [0.17, 0.17, 0.18],
  package: [0.09, 0.09, 0.1],
  ceramic: [0.71, 0.56, 0.42],
  plastic: [0.36, 0.36, 0.38],
};

/** Height per unit of the body's smaller side, clamped to what parts of the kind are. */
const kindHeights: Readonly<Record<GenericBodyKind, readonly [ratio: number, min: number, max: number]>> = {
  moulded: [0.4, 0.8, 6],
  package: [0.25, 0.5, 2.5],
  ceramic: [0.5, 0.3, 2.5],
  plastic: [0.35, 0.5, 5],
};

/** Parts that are only copper or a hole: they have no body. */
const bodilessFtype = /test_?point|fiducial|hole|solder_?jumper|via|copper/u;

const kindOf = (ftype: string | undefined): GenericBodyKind => {
  switch (ftype) {
    case 'simple_inductor':
    case 'simple_fuse': {
      return 'moulded';
    }
    case 'simple_capacitor': {
      return 'ceramic';
    }
    case 'simple_chip':
    case 'simple_resistor':
    case 'simple_diode':
    case 'simple_led':
    case 'simple_transistor':
    case 'simple_mosfet': {
      return 'package';
    }
    default: {
      return 'plastic';
    }
  }
};

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const pointOf = (value: unknown): Point | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { x, y } = value as Record<string, unknown>;
  return isNumber(x) && isNumber(y) ? { x, y } : undefined;
};

const rectCorners = (center: Point, width: number, height: number, degrees = 0): Point[] => {
  const angle = (degrees * Math.PI) / 180;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx = 0, sy = 0]) => {
    const [dx, dy] = [(sx * width) / 2, (sy * height) / 2];
    return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
  });
};

/** The outline points of a courtyard, pad or plated hole, in board coordinates. */
const outlineOf = (element: Element): Point[] => {
  const points = element['points'] ?? element['outline'];
  if (Array.isArray(points)) {
    return points.flatMap((point) => pointOf(point) ?? []);
  }
  const center = pointOf(element['center']) ?? pointOf(element);
  if (!center) {
    return [];
  }
  const rotation = isNumber(element['ccw_rotation']) ? element['ccw_rotation'] : 0;
  const width = [element['width'], element['outer_width'], element['outer_diameter']].find(isNumber);
  const height = [element['height'], element['outer_height'], element['outer_diameter']].find(isNumber);
  if (width !== undefined && height !== undefined) {
    return rectCorners(center, width, height, rotation);
  }
  const radius = element['radius'];
  return isNumber(radius) ? rectCorners(center, radius * 2, radius * 2) : [];
};

/** Courtyards are drawn a little outside the body (IPC-7351's 0.25 mm courtyard excess). */
const courtyardExcess = 0.25;

/**
 * The generic body a part should have: its courtyard less the courtyard excess, else its pad
 * bounds, in the component's own frame; `undefined` for a part with no body (a test point, a
 * fiducial) or with nothing to size it from.
 *
 * @public
 */
export const genericBodyOf = (
  circuitJson: readonly Element[],
  pcbComponentId: string,
  ftype: string | undefined,
): GenericBody | undefined => {
  if (ftype !== undefined && bodilessFtype.test(ftype)) {
    return undefined;
  }
  const component = circuitJson.find(
    (element) => element.type === 'pcb_component' && element['pcb_component_id'] === pcbComponentId,
  );
  const center = pointOf(component?.['center']);
  if (!component || !center) {
    return undefined;
  }
  const own = circuitJson.filter((element) => element['pcb_component_id'] === pcbComponentId);
  const courtyard = own.filter((element) => element.type.startsWith('pcb_courtyard')).flatMap(outlineOf);
  const pads = own
    .filter((element) => element.type === 'pcb_smtpad' || element.type === 'pcb_plated_hole')
    .flatMap(outlineOf);
  const points = courtyard.length > 0 ? courtyard : pads;
  if (points.length === 0) {
    return undefined;
  }
  // Undo the component's rotation, which the converter applies to the model again.
  const angle = -((isNumber(component['rotation']) ? component['rotation'] : 0) * Math.PI) / 180;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const local = points.map((point) => {
    const [dx, dy] = [point.x - center.x, point.y - center.y];
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  });
  const xs = local.map((point) => point.x);
  const ys = local.map((point) => point.y);
  const inset = courtyard.length > 0 ? courtyardExcess * 2 : 0;
  const width = Math.max(...xs) - Math.min(...xs) - inset;
  const depth = Math.max(...ys) - Math.min(...ys) - inset;
  if (width <= 0 || depth <= 0) {
    return undefined;
  }
  const kind = kindOf(ftype);
  const [ratio, min, max] = kindHeights[kind];
  const round = (value: number): number => Math.round(value * 100) / 100;
  return {
    kind,
    width: round(width),
    depth: round(depth),
    height: round(Math.min(Math.max(Math.min(width, depth) * ratio, min), max)),
    x: round((Math.max(...xs) + Math.min(...xs)) / 2),
    y: round((Math.max(...ys) + Math.min(...ys)) / 2),
  };
};

/** The converter-input URL that names a generic body; the kernel's fetch guard serves it. @public */
export const genericBodyUrl = (body: GenericBody): string =>
  `${genericPrefix}${body.kind}/${body.width}x${body.depth}x${body.height}@${body.x},${body.y}.glb`;

const genericBodyKinds: readonly GenericBodyKind[] = ['moulded', 'package', 'ceramic', 'plastic'];

const genericUrlPattern = /^(\w+)\/([\d.]+)x([\d.]+)x([\d.]+)@(-?[\d.]+),(-?[\d.]+)\.glb$/u;

/** The generic body a `tau-models:generic/...` URL names. @public */
export const parseGenericBodyUrl = (url: string): GenericBody | undefined => {
  if (!url.startsWith(genericPrefix)) {
    return undefined;
  }
  const match = genericUrlPattern.exec(url.slice(genericPrefix.length));
  if (!match) {
    return undefined;
  }
  const [, kindName = '', ...sizes] = match;
  const kind = genericBodyKinds.find((candidate) => candidate === kindName);
  const [width = 0, depth = 0, height = 0, x = 0, y = 0] = sizes.map(Number);
  if (!kind || ![width, depth, height, x, y].every(Number.isFinite) || Math.min(width, depth, height) <= 0) {
    return undefined;
  }
  return { kind, width, depth, height, x, y };
};

/** Each face of a box: its outward normal axis and sign. */
const faces = [
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [2, 1],
  [2, -1],
] as const;

/**
 * A generic body as GLB bytes: one box with flat-shaded faces, its bottom on z = 0.
 *
 * @public
 */
export const buildGenericBodyGlb = async (body: GenericBody): Promise<Uint8Array<ArrayBuffer>> => {
  const half = [body.width / 2, body.depth / 2, body.height / 2];
  const centre = [body.x, body.y, body.height / 2];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const [axis, sign] of faces) {
    const [u, v] = [(axis + 1) % 3, (axis + 2) % 3];
    const base = positions.length / 3;
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const corner = [0, 0, 0];
      corner[axis] = sign;
      corner[u] = su;
      corner[v] = sv;
      positions.push(...corner.map((value, index) => (centre[index] ?? 0) + value * (half[index] ?? 0)));
      normals.push(...[0, 1, 2].map((index) => (index === axis ? sign : 0)));
    }
    // Counter-clockwise seen from outside: (u, v) is right-handed with the normal for a positive face.
    indices.push(
      ...(sign > 0
        ? [base, base + 1, base + 2, base, base + 2, base + 3]
        : [base, base + 2, base + 1, base, base + 3, base + 2]),
    );
  }
  const document = new Document();
  const buffer = document.createBuffer();
  // The converter reads `baseColorFactor * 255` as sRGB, as the pack's KiCad models carry it.
  const [r, g, b] = kindColors[body.kind];
  const material = document
    .createMaterial(`generic-${body.kind}`)
    .setBaseColorFactor([r, g, b, 1])
    .setRoughnessFactor(0.6)
    .setMetallicFactor(0);
  const primitive = document
    .createPrimitive()
    .setAttribute(
      'POSITION',
      document.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      document.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer),
    )
    .setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer))
    .setMaterial(material);
  const node = document.createNode('body').setMesh(document.createMesh('body').addPrimitive(primitive));
  document.createScene().addChild(node);
  // The converter reads each attribute from its own buffer view, as the pack's models store them.
  return new WebIO().setVertexLayout(VertexLayout.SEPARATE).writeBinary(document);
};
