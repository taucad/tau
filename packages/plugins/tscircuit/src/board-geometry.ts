/**
 * Presentation board geometry.
 *
 * Builds the printed circuit board as a stack of real layers from circuit JSON, in place of
 * `circuit-json-to-gltf`'s single textured slab: an FR-4 core, copper, solder mask (lighter where
 * it covers copper), exposed pad finish, silkscreen and plated barrels, each with its own PBR
 * material. Every layer is polygon geometry, so it stays sharp at any zoom and no raster texture is
 * needed. Polygons are built with Manifold's `CrossSection` booleans and extruded to thin solids.
 *
 * Coordinates match the converter's scene: Y-up millimetres with scene X = -pcb.x and scene Z = pcb.y,
 * so the converter's component bodies sit on this board unchanged.
 */

import type { Document, Extension, Material, Node } from '@gltf-transform/core';
import { lineAlphabet } from '#engine/alphabet.js';
import type { CrossSection, ManifoldToplevel, Vec2 } from '@tscircuit/manifold-2d';
import { allExtensions } from '@taucad/geometry-core';

import type { Rgb } from '#board-colors.js';
import { boardColorsOf, lighten } from '#board-colors.js';

// =============================================================================
// Style
// =============================================================================

/** Exposed-copper surface finish. @public */
export type BoardFinish = 'enig' | 'hasl' | 'bare';

/** Presentation options read from the board view options. @public */
export type BoardPresentationOptions = {
  /** Surface finish of exposed pads; ENIG (gold) by default. */
  finish?: BoardFinish;
};

const finishColors: Record<BoardFinish, { color: Rgb; roughness: number }> = {
  enig: { color: [0.98, 0.78, 0.42], roughness: 0.24 },
  hasl: { color: [0.86, 0.87, 0.88], roughness: 0.3 },
  bare: { color: [0.85, 0.47, 0.32], roughness: 0.3 },
};

/** Converts sRGB (0–1) to linear, as glTF base colours are linear. */
const toLinear = (value: number): number => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const linear = (rgb: Rgb): [number, number, number, number] => [
  toLinear(rgb[0]),
  toLinear(rgb[1]),
  toLinear(rgb[2]),
  1,
];

// =============================================================================
// Layer stack (millimetres)
// =============================================================================

const copperThickness = 0.035;
const maskThickness = 0.022;
const silkscreenThickness = 0.012;
const maskExpansion = 0.05;
const holeMaskExpansion = 0.1;
const barrelWall = 0.025;
const circleSegments = 32;

// =============================================================================
// Circuit JSON access
// =============================================================================

type Element = Record<string, unknown> & { type: string };
type Point = { x: number; y: number };
type Side = 'top' | 'bottom';

const numberOf = (element: Element, key: string, fallback = 0): number => {
  const value = element[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const pointsOf = (value: unknown): Point[] =>
  Array.isArray(value)
    ? value.filter(
        (point): point is Point =>
          typeof point === 'object' &&
          point !== null &&
          typeof (point as Point).x === 'number' &&
          typeof (point as Point).y === 'number',
      )
    : [];

const layersOf = (element: Element): Side[] => {
  const { layers } = element;
  if (Array.isArray(layers)) {
    return (['top', 'bottom'] as const).filter((side) => layers.includes(side));
  }
  return element['layer'] === 'bottom' ? ['bottom'] : ['top'];
};

// =============================================================================
// 2D primitives
// =============================================================================

type Shapes = {
  readonly m: ManifoldToplevel;
  circle: (x: number, y: number, radius: number) => CrossSection;
  // oxlint-disable-next-line eslint/max-params -- a rectangle's centre, size, rotation and corner radius, as Manifold takes them.
  rect: (x: number, y: number, width: number, height: number, rotation?: number, radius?: number) => CrossSection;
  polygon: (points: Point[]) => CrossSection | undefined;
  stroke: (points: Point[], width: number) => CrossSection | undefined;
  union: (parts: CrossSection[]) => CrossSection;
};

const createShapes = (m: ManifoldToplevel): Shapes => {
  const empty = (): CrossSection =>
    new m.CrossSection(
      [
        [
          [0, 0],
          [0, 0],
          [0, 0],
        ],
      ],
      'Positive',
    );
  const circle = (x: number, y: number, radius: number): CrossSection =>
    m.CrossSection.circle(Math.max(radius, 1e-4), circleSegments).translate([x, y]);
  // oxlint-disable-next-line eslint/max-params -- matches `Shapes.rect`.
  const rect = (x: number, y: number, width: number, height: number, rotation = 0, radius = 0): CrossSection => {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    const core =
      r > 0
        ? m.CrossSection.square([Math.max(width - 2 * r, 1e-4), Math.max(height - 2 * r, 1e-4)], true).offset(
            r,
            'Round',
            2,
            circleSegments,
          )
        : m.CrossSection.square([Math.max(width, 1e-4), Math.max(height, 1e-4)], true);
    return core.rotate(rotation).translate([x, y]);
  };
  const polygon = (points: Point[]): CrossSection | undefined =>
    points.length < 3 ? undefined : new m.CrossSection([points.map((point): Vec2 => [point.x, point.y])], 'Positive');
  const stroke = (points: Point[], width: number): CrossSection | undefined => {
    if (points.length === 0 || width <= 0) {
      return undefined;
    }
    const radius = width / 2;
    if (points.length === 1) {
      return circle(points[0]!.x, points[0]!.y, radius);
    }
    const segments: CrossSection[] = [];
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1]!;
      const b = points[index]!;
      segments.push(m.CrossSection.hull([circle(a.x, a.y, radius), circle(b.x, b.y, radius)]));
    }
    return m.CrossSection.union(segments);
  };
  const union = (parts: CrossSection[]): CrossSection => (parts.length === 0 ? empty() : m.CrossSection.union(parts));
  return { m, circle, rect, polygon, stroke, union };
};

// =============================================================================
// Board features to 2D regions
// =============================================================================

type SideRegions = { copper: CrossSection[]; openings: CrossSection[]; silkscreen: CrossSection[] };

type BoardRegions = {
  outline: CrossSection;
  thickness: number;
  maskColor: Rgb;
  bottomMaskColor: Rgb;
  silkColor: Rgb;
  bottomSilkColor: Rgb;
  drills: CrossSection[];
  barrels: CrossSection[];
  sides: Record<Side, SideRegions>;
};

const smtPadShape = (shapes: Shapes, pad: Element, grow: number): CrossSection | undefined => {
  const x = numberOf(pad, 'x');
  const y = numberOf(pad, 'y');
  const rotation = numberOf(pad, 'ccw_rotation');
  switch (pad['shape']) {
    case 'circle': {
      return shapes.circle(x, y, numberOf(pad, 'radius') + grow);
    }
    case 'pill':
    case 'rotated_pill': {
      const width = numberOf(pad, 'width') + 2 * grow;
      const height = numberOf(pad, 'height') + 2 * grow;
      return shapes.rect(x, y, width, height, rotation, Math.min(width, height) / 2);
    }
    case 'polygon': {
      const polygon = shapes.polygon(pointsOf(pad['points']));
      return polygon && grow > 0 ? polygon.offset(grow, 'Round') : polygon;
    }
    default: {
      const radius = numberOf(pad, 'corner_radius', numberOf(pad, 'rect_border_radius'));
      return shapes.rect(
        x,
        y,
        numberOf(pad, 'width') + 2 * grow,
        numberOf(pad, 'height') + 2 * grow,
        rotation,
        radius + grow,
      );
    }
  }
};

const platedHoleShapes = (
  shapes: Shapes,
  hole: Element,
  grow: number,
): { pad: CrossSection | undefined; drill: CrossSection | undefined } => {
  const x = numberOf(hole, 'x');
  const y = numberOf(hole, 'y');
  const rotation = numberOf(hole, 'ccw_rotation', numberOf(hole, 'rect_ccw_rotation'));
  const holeX = x + numberOf(hole, 'hole_offset_x');
  const holeY = y + numberOf(hole, 'hole_offset_y');
  const drillOf = (): CrossSection | undefined => {
    if (typeof hole['hole_diameter'] === 'number') {
      return shapes.circle(holeX, holeY, numberOf(hole, 'hole_diameter') / 2);
    }
    const width = numberOf(hole, 'hole_width');
    const height = numberOf(hole, 'hole_height');
    return width > 0 && height > 0
      ? shapes.rect(holeX, holeY, width, height, rotation, Math.min(width, height) / 2)
      : undefined;
  };
  switch (hole['shape']) {
    case 'circle': {
      return { pad: shapes.circle(x, y, numberOf(hole, 'outer_diameter') / 2 + grow), drill: drillOf() };
    }
    case 'oval':
    case 'pill': {
      const width = numberOf(hole, 'outer_width') + 2 * grow;
      const height = numberOf(hole, 'outer_height') + 2 * grow;
      return { pad: shapes.rect(x, y, width, height, rotation, Math.min(width, height) / 2), drill: drillOf() };
    }
    case 'hole_with_polygon_pad': {
      const outline = pointsOf(hole['pad_outline']).map((point) => ({ x: x + point.x, y: y + point.y }));
      const pad = shapes.polygon(outline);
      return { pad: pad && grow > 0 ? pad.offset(grow, 'Round') : pad, drill: drillOf() };
    }
    default: {
      const width = numberOf(hole, 'rect_pad_width', numberOf(hole, 'outer_diameter')) + 2 * grow;
      const height = numberOf(hole, 'rect_pad_height', numberOf(hole, 'outer_diameter')) + 2 * grow;
      return {
        pad: shapes.rect(x, y, width, height, rotation, numberOf(hole, 'rect_border_radius') + grow),
        drill: drillOf(),
      };
    }
  }
};

const npthShape = (shapes: Shapes, hole: Element, grow: number): CrossSection | undefined => {
  const x = numberOf(hole, 'x');
  const y = numberOf(hole, 'y');
  const shape = hole['hole_shape'];
  if (shape === 'circle' || shape === 'round' || typeof hole['hole_diameter'] === 'number') {
    return shapes.circle(x, y, numberOf(hole, 'hole_diameter', numberOf(hole, 'hole_width')) / 2 + grow);
  }
  const width = numberOf(hole, 'hole_width') + 2 * grow;
  const height = numberOf(hole, 'hole_height', width) + 2 * grow;
  const radius = shape === 'rect' || shape === 'square' ? 0 : Math.min(width, height) / 2;
  return width > 0 ? shapes.rect(x, y, width, height, numberOf(hole, 'ccw_rotation'), radius) : undefined;
};

/** The stroke-font text that circuit-to-svg draws for knockout silkscreen, in pcb coordinates (Y up). */
const alphabetBounds = (() => {
  let maxX = 0;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const segments of Object.values(lineAlphabet)) {
    for (const segment of segments) {
      maxX = Math.max(maxX, segment.x1, segment.x2);
      minY = Math.min(minY, segment.y1, segment.y2);
      maxY = Math.max(maxY, segment.y1, segment.y2);
    }
  }
  return { width: maxX, height: maxY - minY };
})();

const textSegments = (element: Element): { segments: Array<[Point, Point]>; strokeWidth: number } => {
  const text = typeof element['text'] === 'string' ? element['text'] : '';
  const fontSize = numberOf(element, 'font_size', 1);
  const scale = (fontSize * (2 / 3)) / alphabetBounds.height;
  const spacing = alphabetBounds.width * 0.2;
  const advance = (alphabetBounds.width + spacing) * scale;
  const space = advance * 0.6;
  const lineHeight = scale * alphabetBounds.height * 1.1;
  const lines = text.split('\n');
  const raw: Array<[Point, Point]> = [];
  for (const [lineIndex, line] of lines.entries()) {
    let width = 0;
    for (const char of line) {
      width += char === ' ' ? space : advance;
    }
    width = width > 0 ? width - spacing * scale : 0;
    let cursor = -width / 2;
    const baseline = ((lines.length - 1) / 2 - lineIndex) * lineHeight - (scale * alphabetBounds.height) / 2;
    for (const char of line) {
      if (char === ' ') {
        cursor += space;
        continue;
      }
      for (const segment of lineAlphabet[char] ?? lineAlphabet[char.toUpperCase()] ?? []) {
        raw.push([
          { x: cursor + segment.x1 * scale, y: baseline + segment.y1 * scale },
          { x: cursor + segment.x2 * scale, y: baseline + segment.y2 * scale },
        ]);
      }
      cursor += advance;
    }
  }
  if (raw.length === 0) {
    return { segments: [], strokeWidth: 0 };
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [a, b] of raw) {
    minX = Math.min(minX, a.x, b.x);
    maxX = Math.max(maxX, a.x, b.x);
    minY = Math.min(minY, a.y, b.y);
    maxY = Math.max(maxY, a.y, b.y);
  }
  const alignment = typeof element['anchor_alignment'] === 'string' ? element['anchor_alignment'] : 'center';
  const anchorX = alignment.endsWith('left') ? minX : alignment.endsWith('right') ? maxX : (minX + maxX) / 2;
  const anchorY = alignment.startsWith('top') ? maxY : alignment.startsWith('bottom') ? minY : (minY + maxY) / 2;
  const anchor = (element['anchor_position'] ?? { x: 0, y: 0 }) as Point;
  const mirror = element['layer'] === 'bottom' || element['is_mirrored'] === true ? -1 : 1;
  const angle = (numberOf(element, 'ccw_rotation') * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const place = (point: Point): Point => {
    const lx = (point.x - anchorX) * mirror;
    const ly = point.y - anchorY;
    return { x: anchor.x + lx * cos - ly * sin, y: anchor.y + lx * sin + ly * cos };
  };
  return { segments: raw.map(([a, b]) => [place(a), place(b)]), strokeWidth: Math.max(fontSize * 0.1, 0.1) };
};

const collectRegions = (shapes: Shapes, elements: Element[], board: Element): BoardRegions => {
  const sides: Record<Side, SideRegions> = {
    top: { copper: [], openings: [], silkscreen: [] },
    bottom: { copper: [], openings: [], silkscreen: [] },
  };
  const drills: CrossSection[] = [];
  const barrels: CrossSection[] = [];
  const push = (side: Side, key: keyof SideRegions, shape: CrossSection | undefined): void => {
    if (shape) {
      sides[side][key].push(shape);
    }
  };

  for (const element of elements) {
    switch (element.type) {
      case 'pcb_smtpad': {
        const [side = 'top'] = layersOf(element);
        push(side, 'copper', smtPadShape(shapes, element, 0));
        if (element['is_covered_with_solder_mask'] !== true) {
          push(side, 'openings', smtPadShape(shapes, element, numberOf(element, 'soldermask_margin', maskExpansion)));
        }
        break;
      }
      case 'pcb_plated_hole': {
        const { pad, drill } = platedHoleShapes(shapes, element, 0);
        const { pad: opening } = platedHoleShapes(shapes, element, maskExpansion);
        for (const side of layersOf(element)) {
          push(side, 'copper', pad);
          if (element['is_covered_with_solder_mask'] !== true) {
            push(side, 'openings', opening);
          }
        }
        if (drill) {
          drills.push(drill);
          barrels.push(drill.offset(barrelWall, 'Round').subtract(drill));
        }
        break;
      }
      case 'pcb_via': {
        const x = numberOf(element, 'x');
        const y = numberOf(element, 'y');
        const pad = shapes.circle(x, y, numberOf(element, 'outer_diameter', 0.6) / 2);
        const drill = shapes.circle(x, y, numberOf(element, 'hole_diameter', 0.3) / 2);
        push('top', 'copper', pad);
        push('bottom', 'copper', pad);
        drills.push(drill);
        barrels.push(drill.offset(barrelWall, 'Round').subtract(drill));
        break;
      }
      case 'pcb_hole': {
        const drill = npthShape(shapes, element, 0);
        if (drill) {
          drills.push(drill);
          push('top', 'openings', npthShape(shapes, element, holeMaskExpansion));
          push('bottom', 'openings', npthShape(shapes, element, holeMaskExpansion));
        }
        break;
      }
      case 'pcb_trace': {
        const route = Array.isArray(element['route']) ? (element['route'] as Element[]) : [];
        let run: Point[] = [];
        let runLayer: Side | undefined;
        let runWidth = 0;
        const flush = (): void => {
          if (runLayer && run.length > 1) {
            push(runLayer, 'copper', shapes.stroke(run, runWidth));
          }
          run = [];
        };
        for (const point of route) {
          if (point['route_type'] !== 'wire') {
            flush();
            runLayer = undefined;
            continue;
          }
          const layer: Side = point['layer'] === 'bottom' ? 'bottom' : 'top';
          if (layer !== runLayer) {
            flush();
            runLayer = layer;
          }
          runWidth = Math.max(runWidth, numberOf(point, 'width', 0.15));
          run.push({ x: numberOf(point, 'x'), y: numberOf(point, 'y') });
        }
        flush();
        break;
      }
      case 'pcb_copper_pour': {
        const [side = 'top'] = layersOf(element);
        switch (element['shape']) {
          case 'brep': {
            const brep = element['brep_shape'] as {
              outer_ring?: { vertices?: unknown };
              inner_rings?: Array<{ vertices?: unknown }>;
            };
            const outer = shapes.polygon(pointsOf(brep.outer_ring?.vertices));
            if (outer) {
              const inner = (brep.inner_rings ?? [])
                .map((ring) => shapes.polygon(pointsOf(ring.vertices)))
                .filter((ring) => ring !== undefined);
              push(side, 'copper', inner.length > 0 ? outer.subtract(shapes.union(inner)) : outer);
            }
            break;
          }
          case 'polygon': {
            push(side, 'copper', shapes.polygon(pointsOf(element['points'])));
            break;
          }
          case 'rect': {
            const center = (element['center'] ?? { x: 0, y: 0 }) as Point;
            push(
              side,
              'copper',
              shapes.rect(
                center.x,
                center.y,
                numberOf(element, 'width'),
                numberOf(element, 'height'),
                numberOf(element, 'rotation'),
              ),
            );
            break;
          }
          default: {
            break;
          }
        }
        break;
      }
      case 'pcb_silkscreen_path': {
        const [side = 'top'] = layersOf(element);
        push(side, 'silkscreen', shapes.stroke(pointsOf(element['route']), numberOf(element, 'stroke_width', 0.1)));
        break;
      }
      case 'pcb_silkscreen_line': {
        const [side = 'top'] = layersOf(element);
        const points = [
          { x: numberOf(element, 'x1'), y: numberOf(element, 'y1') },
          { x: numberOf(element, 'x2'), y: numberOf(element, 'y2') },
        ];
        push(side, 'silkscreen', shapes.stroke(points, numberOf(element, 'stroke_width', 0.1)));
        break;
      }
      case 'pcb_silkscreen_rect': {
        const [side = 'top'] = layersOf(element);
        const center = (element['center'] ?? { x: 0, y: 0 }) as Point;
        const width = numberOf(element, 'width');
        const height = numberOf(element, 'height');
        const strokeWidth = numberOf(element, 'stroke_width', 0.1);
        const outer = shapes.rect(center.x, center.y, width + strokeWidth, height + strokeWidth);
        push(
          side,
          'silkscreen',
          element['is_filled'] === true
            ? outer
            : outer.subtract(
                shapes.rect(center.x, center.y, Math.max(width - strokeWidth, 0), Math.max(height - strokeWidth, 0)),
              ),
        );
        break;
      }
      case 'pcb_silkscreen_circle': {
        const [side = 'top'] = layersOf(element);
        const center = (element['center'] ?? { x: 0, y: 0 }) as Point;
        const radius = numberOf(element, 'radius');
        const strokeWidth = numberOf(element, 'stroke_width', 0.1);
        push(
          side,
          'silkscreen',
          shapes
            .circle(center.x, center.y, radius + strokeWidth / 2)
            .subtract(shapes.circle(center.x, center.y, Math.max(radius - strokeWidth / 2, 0))),
        );
        break;
      }
      case 'pcb_silkscreen_text': {
        const [side = 'top'] = layersOf(element);
        const { segments, strokeWidth } = textSegments(element);
        const strokes = segments
          .map(([a, b]) => shapes.stroke([a, b], strokeWidth))
          .filter((stroke) => stroke !== undefined);
        if (strokes.length > 0) {
          push(side, 'silkscreen', shapes.union(strokes));
        }
        break;
      }
      default: {
        break;
      }
    }
  }

  const center = (board['center'] ?? { x: 0, y: 0 }) as Point;
  const outlinePoints = pointsOf(board['outline']);
  const outline =
    shapes.polygon(outlinePoints) ??
    shapes.rect(
      center.x,
      center.y,
      numberOf(board, 'width', 10),
      numberOf(board, 'height', 10),
      0,
      numberOf(board, 'border_radius'),
    );
  const { maskColor, bottomMaskColor, silkColor, bottomSilkColor } = boardColorsOf(board);
  return {
    outline,
    thickness: numberOf(board, 'thickness', 1.6),
    maskColor,
    bottomMaskColor,
    silkColor,
    bottomSilkColor,
    drills,
    barrels,
    sides,
  };
};

// =============================================================================
// Meshing
// =============================================================================

type LayerMaterials = {
  core: Material;
  copper: Material;
  finish: Material;
  mask: Record<Side, Material>;
  maskOverCopper: Record<Side, Material>;
  silkscreen: Record<Side, Material>;
};

const createMaterials = (
  document: Document,
  regions: BoardRegions,
  options: BoardPresentationOptions,
): LayerMaterials => {
  const clearcoatExtension = allExtensions.find(
    (extension) => extension.EXTENSION_NAME === 'KHR_materials_clearcoat',
  ) as (new (document: Document) => Extension) | undefined;
  const clearcoat = clearcoatExtension ? document.createExtension(clearcoatExtension) : undefined;
  // oxlint-disable-next-line eslint/max-params -- a material's PBR factors, read as one row per layer below.
  const make = (name: string, rgb: Rgb, roughness: number, metallic = 0, coat = false): Material => {
    const material = document
      .createMaterial(name)
      .setBaseColorFactor(linear(rgb))
      .setRoughnessFactor(roughness)
      .setMetallicFactor(metallic);
    if (coat && clearcoat) {
      const property = (
        clearcoat as unknown as {
          createClearcoat: () => {
            setClearcoatFactor: (v: number) => unknown;
            setClearcoatRoughnessFactor: (v: number) => unknown;
          };
        }
      ).createClearcoat();
      property.setClearcoatFactor(1);
      property.setClearcoatRoughnessFactor(0.12);
      material.setExtension('KHR_materials_clearcoat', property as unknown as Parameters<Material['setExtension']>[1]);
    }
    return material;
  };
  const finish = finishColors[options.finish ?? 'enig'];
  return {
    core: make('pcb-core', [0.62, 0.52, 0.32], 0.75),
    copper: make('pcb-copper', [0.85, 0.47, 0.32], 0.35, 1),
    finish: make('pcb-finish', finish.color, finish.roughness, 1),
    mask: {
      top: make('pcb-mask-top', regions.maskColor, 0.42, 0, true),
      bottom: make('pcb-mask-bottom', regions.bottomMaskColor, 0.42, 0, true),
    },
    maskOverCopper: {
      top: make('pcb-mask-copper-top', lighten(regions.maskColor, 0.1), 0.38, 0, true),
      bottom: make('pcb-mask-copper-bottom', lighten(regions.bottomMaskColor, 0.1), 0.38, 0, true),
    },
    silkscreen: {
      top: make('pcb-silkscreen-top', regions.silkColor, 0.65),
      bottom: make('pcb-silkscreen-bottom', regions.bottomSilkColor, 0.65),
    },
  };
};

/** Extrude a region between two board heights and append it to `mesh` as one flat-shaded primitive. */
// oxlint-disable-next-line eslint/max-params -- one slab is a region, a height span and a material, read as a row per layer.
const addSlab = (
  document: Document,
  node: Node,
  name: string,
  region: CrossSection,
  z0: number,
  z1: number,
  material: Material,
): void => {
  if (region.isEmpty() || z1 <= z0) {
    return;
  }
  const solid = region.extrude(z1 - z0).translate([0, 0, z0]);
  const mesh = solid.getMesh();
  solid.delete();
  const { numProp, vertProperties, triVerts } = mesh;
  const triangleCount = triVerts.length / 3;
  if (triangleCount === 0) {
    return;
  }
  const positions = new Float32Array(triangleCount * 9);
  const normals = new Float32Array(triangleCount * 9);
  for (let tri = 0; tri < triangleCount; tri++) {
    const corners: Array<[number, number, number]> = [];
    for (let corner = 0; corner < 3; corner++) {
      const vertex = triVerts[tri * 3 + corner]!;
      const px = vertProperties[vertex * numProp]!;
      const py = vertProperties[vertex * numProp + 1]!;
      const pz = vertProperties[vertex * numProp + 2]!;
      // PCB (x, y, z) to the converter's scene (-x, z, y): a proper rotation, so winding holds.
      corners.push([-px, pz, py]);
    }
    const [a, b, c] = corners as [[number, number, number], [number, number, number], [number, number, number]];
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    for (let corner = 0; corner < 3; corner++) {
      const offset = tri * 9 + corner * 3;
      positions.set(corners[corner]!, offset);
      normals[offset] = nx;
      normals[offset + 1] = ny;
      normals[offset + 2] = nz;
    }
  }
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
  const primitive = document
    .createPrimitive()
    .setMaterial(material)
    .setAttribute(
      'POSITION',
      document.createAccessor(`${name}-position`).setType('VEC3').setArray(positions).setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      document.createAccessor(`${name}-normal`).setType('VEC3').setArray(normals).setBuffer(buffer),
    );
  let target = node.getMesh();
  if (!target) {
    target = document.createMesh('pcb');
    node.setMesh(target);
  }
  target.addPrimitive(primitive);
};

/**
 * Build the layered board for every `pcb_board` in `circuitJson` and return its node, in the
 * converter's scene frame (Y-up millimetres). Returns `undefined` when the circuit has no board.
 *
 * @public
 */
export const buildPresentationBoard = async (
  document: Document,
  circuitJson: ReadonlyArray<{ type: string }>,
  options: BoardPresentationOptions = {},
): Promise<Node | undefined> => {
  const elements = circuitJson as Element[];
  const boards = elements.filter((element) => element.type === 'pcb_board');
  if (boards.length === 0) {
    return undefined;
  }
  const { getManifoldModule } = await import('@tscircuit/manifold-2d');
  const m = await getManifoldModule();
  const shapes = createShapes(m);
  const root = document.createNode('pcb');

  for (const board of boards) {
    const regions = collectRegions(shapes, elements, board);
    const materials = createMaterials(document, regions, options);
    const { outline, thickness } = regions;
    const half = thickness / 2;
    const drills = shapes.union(regions.drills);
    const boardArea = outline.subtract(drills);

    addSlab(document, root, 'core', boardArea, -half, half, materials.core);
    addSlab(
      document,
      root,
      'barrels',
      shapes.union(regions.barrels).intersect(outline),
      -half - copperThickness,
      half + copperThickness,
      materials.finish,
    );

    for (const side of ['top', 'bottom'] as const) {
      const { copper: copperParts, openings: openingParts, silkscreen: silkParts } = regions.sides[side];
      const copper = shapes.union(copperParts).intersect(boardArea);
      const openings = shapes.union(openingParts);
      const maskArea = boardArea.subtract(openings);
      const maskOnCopper = maskArea.intersect(copper);
      const maskOnLaminate = maskArea.subtract(copper);
      const exposed = copper.intersect(openings);
      const silk = shapes.union(silkParts).intersect(maskArea);
      // Heights measured outward from the core face; the bottom side mirrors them.
      const span = (from: number, to: number): [number, number] =>
        side === 'top' ? [half + from, half + to] : [-half - to, -half - from];
      addSlab(document, root, `${side}-copper`, maskOnCopper, ...span(0, copperThickness), materials.copper);
      addSlab(document, root, `${side}-finish`, exposed, ...span(0, copperThickness + 0.004), materials.finish);
      addSlab(
        document,
        root,
        `${side}-mask-copper`,
        maskOnCopper,
        ...span(copperThickness, copperThickness + maskThickness),
        materials.maskOverCopper[side],
      );
      addSlab(document, root, `${side}-mask`, maskOnLaminate, ...span(0, maskThickness), materials.mask[side]);
      addSlab(
        document,
        root,
        `${side}-silkscreen`,
        silk,
        ...span(0, copperThickness + maskThickness + silkscreenThickness),
        materials.silkscreen[side],
      );
    }
  }
  return root;
};
