import type { GeoSpecVoidContinuityExpectation } from 'geospec';
import type { PartDefinition, PartExpectations, ParameterDomain } from '#definition.js';

type Dimensions = Readonly<Record<string, number>>;
const value = (parameters: Dimensions, key: string): number => {
  const result = parameters[key];
  if (result === undefined) {
    throw new Error(`Missing engineering dimension ${key}`);
  }
  return result;
};
const acceptance = (x: number, y: number, z: number): PartExpectations => ({ bounds: { x, y, z }, solids: 1 });
const centralBore = (diameter: number) => ({ diameter, center: { x: 0, y: 0 }, axis: 'z' }) as const;
// Each overlapping proof box remains inside the fitting's outer wall and
// clips off open ends. Exterior air therefore cannot connect blocked passages.
const elbowPassages = (length: number, bore: number): GeoSpecVoidContinuityExpectation[] => {
  const bend = length * 0.4;
  const inset = length * 0.02;
  const points: Array<[number, number, number]> = [[0, 0, inset]];
  for (let index = 0; index <= 4; index++) {
    const angle = (index * Math.PI) / 8;
    points.push([bend * (1 - Math.cos(angle)), 0, length * 0.3 + bend * Math.sin(angle)]);
  }
  points.push([length * 0.7 - inset, 0, length * 0.7]);
  const padding = bore * 0.3;
  return points.slice(1).map((end, index) => {
    const start = points[index]!;
    return {
      path: [start, end],
      bounds: {
        min: [
          Math.min(start[0], end[0]) - padding,
          -padding,
          Math.max(inset / 2, Math.min(start[2], end[2]) - padding),
        ],
        max: [
          Math.min(length * 0.7 - inset / 2, Math.max(start[0], end[0]) + padding),
          padding,
          Math.max(start[2], end[2]) + padding,
        ],
      },
    };
  });
};
type DefinitionInput = {
  id: string;
  name: string;
  category: string;
  description: string;
  parameters: Dimensions;
  expected: (parameters: Dimensions) => PartExpectations;
  domains?: Readonly<Record<string, ParameterDomain>>;
  fidelity?: string;
};
const define = (input: DefinitionInput): PartDefinition => {
  const domains: Readonly<Record<string, ParameterDomain>> =
    input.domains ??
    Object.fromEntries(
      Object.entries(input.parameters).map(([name, number]) => [name, { min: number * 0.9, max: number * 1.1 }]),
    );
  const cases = Object.entries(domains).flatMap(([name, domain]) =>
    (domain.values ?? [domain.min, domain.max]).map((number) => ({
      name: `${name} ${number}`,
      parameters: { [name]: number },
      expectations: input.expected({ ...input.parameters, [name]: number }),
    })),
  );
  for (const boundary of ['min', 'max'] as const) {
    const parameters = Object.fromEntries(Object.entries(domains).map(([name, domain]) => [name, domain[boundary]]));
    cases.push({ name: `combined ${boundary}`, parameters, expectations: input.expected(parameters) });
  }
  const wallParameters = new Set(['bore', 'wall', 'hole', 'wire']);
  if (Object.keys(domains).some((name) => wallParameters.has(name))) {
    const parameters = Object.fromEntries(
      Object.entries(domains).map(([name, domain]) => [name, wallParameters.has(name) ? domain.max : domain.min]),
    );
    cases.push({ name: 'minimum envelope maximum openings', parameters, expectations: input.expected(parameters) });
  }
  return {
    id: input.id,
    name: input.name,
    category: input.category,
    description: input.description,
    design: input.id,
    parameters: input.parameters,
    domains,
    cases,
    expectations: input.expected(input.parameters),
    fidelity:
      input.fidelity ??
      'Detailed generic assembly geometry with actual functional openings and explicit millimetre dimensions. No supplier SKU, material strength, load rating, fit class or standard certification is claimed. Change parameters only within the declared domain; qualify any extension with the local GeoSpec suite.',
  };
};

const rotaryNames = [
  ['sleeve-bushing', 'Plain sleeve bushing', 'Chamfered annular sleeve with a continuous shaft bore.'],
  ['flanged-bushing', 'Flanged sleeve bushing', 'Shouldered sleeve with an integral axial locating flange.'],
  ['split-bushing', 'Split sleeve bushing', 'Slotted sleeve that can accommodate radial compression.'],
  ['grooved-bushing', 'Lubricated bushing', 'Sleeve with an internal oil-distribution groove and radial oil port.'],
  ['keyed-shaft', 'Keyed shaft', 'Chamfered shaft with a finite-length milled key seat.'],
  ['stepped-shaft', 'Stepped shaft', 'Turned shaft with two reduced journals and a full-diameter central shoulder.'],
  ['d-shaft', 'D-flat shaft', 'Round shaft with one drive flat over its exposed end.'],
  ['grooved-shaft', 'Retaining-groove shaft', 'Turned shaft with two circumferential retention grooves.'],
  [
    'rigid-coupling',
    'Rigid shaft coupling',
    'Through-bored coupling with two independently placed radial set-screw holes.',
  ],
  ['set-screw-collar', 'Set-screw shaft collar', 'Axial stop collar with a radial screw opening.'],
  ['split-collar', 'Split clamp collar', 'Slit collar with a transverse clamping screw opening.'],
  ['v-belt-pulley', 'V-groove pulley', 'Turned sheave with sloping groove flanks and a central shaft bore.'],
  ['flat-belt-pulley', 'Crowned flat-belt pulley', 'Crowned belt-running surface with a through-bored hub.'],
  ['flanged-idler', 'Flanged guide roller', 'Guide roller with two retaining flanges and an axle bore.'],
] as const;
const shafts = new Set(['keyed-shaft', 'stepped-shaft', 'd-shaft', 'grooved-shaft']);
const rotaryParts = rotaryNames.map(([id, name, description]) =>
  define({
    id,
    name,
    description,
    category: 'Shafts and bushings',
    parameters: shafts.has(id) ? { diameter: 20, length: 60 } : { diameter: 30, length: 20, bore: 12 },
    expected: (parameters) => {
      const diameter = value(parameters, 'diameter');
      const length = value(parameters, 'length');
      const result = acceptance(diameter, diameter, length);
      if (id === 'keyed-shaft' || id === 'd-shaft') {
        return {
          ...result,
          planes: [
            {
              normal: [0, 1, 0],
              offset: diameter * 0.35,
              // Rectangular key-seat floor; D-flat has a longer chordal face,
              // with a small end-chamfer deduction, so use its conservative area.
              area: id === 'keyed-shaft' ? diameter * 0.25 * length * 0.7 : { greaterThan: diameter * length * 0.5 },
              tolerance: 0.03,
            },
          ],
        };
      }
      if (id === 'split-bushing' || id === 'split-collar') {
        const bore = value(parameters, 'bore');
        const middle = (diameter + bore) / 4;
        const radialPadding = (diameter - bore) * 0.05;
        return {
          ...result,
          holes: [centralBore(bore)],
          voids: [
            {
              path: [
                [0, middle, length * 0.1],
                [0, middle, length * 0.9],
              ],
              bounds: {
                min: [-diameter * 0.02, middle - radialPadding, length * 0.05],
                max: [diameter * 0.02, middle + radialPadding, length * 0.95],
              },
            },
          ],
        };
      }
      return shafts.has(id) ? result : { ...result, holes: [centralBore(value(parameters, 'bore'))] };
    },
    fidelity:
      'Generic detailed turned geometry. Radial screw threads are represented by nominal cylindrical openings; no helical thread or fit/load certification. Shaft keys and mating fasteners remain separate parts.',
  }),
);

const gearNames = [
  ['spur-gear', 'Involute spur gear'],
  ['ring-gear', 'Internal ring gear'],
  ['helical-gear', 'Helical gear'],
  ['gear-rack', 'Straight gear rack'],
] as const;
const gearParts = gearNames.map(([id, name]) =>
  define({
    id,
    name,
    category: 'Gears and transmission',
    description:
      'Metric-module, 20-degree involute transmission geometry with real teeth and a declared datum. Tooth profiles are reused from Tau’s planetary gear design.',
    parameters:
      id === 'ring-gear' || id === 'gear-rack'
        ? { module: 2, teeth: 24, width: 12 }
        : { module: 2, teeth: 24, width: 12, bore: 10 },
    domains: {
      module: { min: 1.5, max: 2.5 },
      teeth: { min: 20, max: 32, integer: true, values: [20, 24, 32] },
      width: { min: 8, max: 16 },
      ...(id === 'ring-gear' || id === 'gear-rack' ? {} : { bore: { min: 8, max: 12 } }),
    },
    expected: (parameters) => {
      const module = value(parameters, 'module');
      const teeth = value(parameters, 'teeth');
      const width = value(parameters, 'width');
      if (id === 'gear-rack') {
        // Pitch-length rectangular backing plus trapezoidal 20-degree teeth.
        const toothArea = 2.25 * module * ((Math.PI * module) / 2 + 0.25 * module * Math.tan(Math.PI / 9));
        const volume = teeth * (2 * Math.PI * module ** 2 + toothArea) * width;
        return {
          ...acceptance(module * teeth * Math.PI, module * 4.25, width),
          volume: { min: volume * 0.999, max: volume * 1.001 },
        };
      }
      const diameter = module * (teeth + (id === 'ring-gear' ? 8 : 2));
      const internal = id === 'ring-gear';
      const root = module * (teeth / 2 - (internal ? 1 : 1.25));
      const tip = module * (teeth / 2 + (internal ? 1.25 : 1));
      const toothAnnulus = Math.PI * (tip ** 2 - root ** 2) * width;
      const backing =
        Math.PI *
        (internal ? (diameter / 2) ** 2 - tip ** 2 : root ** 2 - (value(parameters, 'bore') / 2) ** 2) *
        width;
      // Conservative tooth-band occupancy, independent of BRep face splitting.
      // The admitted involute teeth occupy a substantial but incomplete band;
      // neither a root-cylinder nor a tip-cylinder blank can pass this interval.
      // Helical twist preserves cross-sectional area and therefore this volume.
      const volume = { min: backing + toothAnnulus * 0.15, max: backing + toothAnnulus * 0.85 };
      return {
        ...acceptance(diameter, diameter, width),
        volume,
        ...(id === 'ring-gear' ? {} : { holes: [centralBore(value(parameters, 'bore'))] }),
      };
    },
    fidelity:
      'Actual tooth geometry: involute B-spline flanks with root/tip arcs, transverse metric module and 20-degree pressure angle. Helical version uses a 15-degree total twist over the face width. KHK dimensional reference: https://khkgears.net/gear-knowledge/gear-technical-reference/calculation-gear-dimensions/ . Profile approximation, backlash and root blends follow the local Tau example; these are assembly parts, not certified production gear cutters. Load, undercut and mating-pair qualification are separate.',
  }),
);

const stockNames = [
  ['t-slot-extrusion', 'Four-slot extrusion'],
  ['angle-profile', 'Angle profile'],
  ['u-channel', 'U-channel'],
  ['i-beam', 'I-beam'],
  ['rectangular-tube', 'Rectangular hollow section'],
  ['round-tube', 'Round tube'],
  ['hex-bar', 'Hexagonal bar'],
  ['square-bar', 'Rectangular bar'],
] as const;
const stockParts = stockNames.map(([id, name]) =>
  define({
    id,
    name,
    category: 'Structural profiles',
    description:
      'Constant-section stock profile with genuine openings where applicable, adjustable section dimensions and cut length.',
    parameters:
      id === 'hex-bar'
        ? { width: 24, length: 80 }
        : id === 'square-bar'
          ? { width: 40, height: 30, length: 80, radius: 1 }
          : id === 'round-tube' || id === 't-slot-extrusion'
            ? { width: 30, length: 80, wall: 3 }
            : { width: 40, height: 30, length: 80, wall: 3 },
    expected: (parameters) => {
      const width = value(parameters, 'width');
      const height = parameters['height'] ?? width;
      const length = value(parameters, 'length');
      const result = acceptance(id === 'hex-bar' ? (width * 2) / Math.sqrt(3) : width, height, length);
      const wall = parameters['wall'] ?? (parameters['radius'] ?? 0) * 3;
      const area =
        id === 'hex-bar'
          ? (Math.sqrt(3) / 2) * width ** 2
          : id === 'round-tube'
            ? Math.PI * wall * (width - wall)
            : id === 'square-bar'
              ? width * height - (4 - Math.PI) * (wall / 3) ** 2
              : id === 'rectangular-tube'
                ? width * height -
                  (width - 2 * wall) * (height - 2 * wall) -
                  (4 - Math.PI) * (wall ** 2 - (wall / 3) ** 2)
                : undefined;
      return {
        ...result,
        ...(area === undefined ? {} : { volume: { min: area * length * 0.999, max: area * length * 1.001 } }),
        ...(id === 'round-tube' ? { holes: [centralBore(width - 2 * wall)] } : {}),
      };
    },
    fidelity:
      'Generic custom section with actual cross-section and declared wall/edge radii; not a claim of compatibility with any proprietary extrusion series or structural section standard. Four-slot section has four open T-slots and a central bore.',
  }),
);

const mountingNames = [
  ['perforated-plate', 'Four-hole mounting plate'],
  ['slotted-plate', 'Slotted adjustment plate'],
  ['window-plate', 'Windowed mounting plate'],
  ['cross-plate', 'Cross mounting plate'],
  ['gusset-plate', 'Triangular gusset'],
  ['circular-flange', 'Circular adapter flange'],
  ['motor-plate', 'Motor mounting plate'],
  ['l-bracket', 'L mounting bracket'],
  ['u-bracket', 'U mounting bracket'],
  ['z-bracket', 'Offset Z bracket'],
  ['mounting-disc', 'Four-hole mounting disc'],
] as const;
const mountingParts = mountingNames.map(([id, name]) =>
  define({
    id,
    name,
    category: 'Brackets and plates',
    description:
      'Parametric mounting geometry with real fastening openings and rounded section corners. Dimensions and patterns are generic, fully editable design inputs.',
    parameters:
      id === 'circular-flange' || id === 'mounting-disc'
        ? { width: 80, height: 4, hole: 5 }
        : { width: 80, depth: 60, height: 4, hole: 5 },
    expected: (parameters) => {
      const width = value(parameters, 'width');
      const depth = parameters['depth'] ?? width;
      const height = value(parameters, 'height');
      const hole = value(parameters, 'hole');
      if (id === 'l-bracket' || id === 'u-bracket' || id === 'z-bracket') {
        return acceptance(width, id === 'z-bracket' ? depth * 2 : depth, depth);
      }
      if (id === 'gusset-plate') {
        return acceptance(
          width - (height / 3) * (Math.sqrt((width / depth) ** 2 + 1) + width / depth - 1),
          depth - (height / 3) * (Math.sqrt((depth / width) ** 2 + 1) + depth / width - 1),
          height,
        );
      }
      const result = acceptance(width, depth, height);
      if (id === 'motor-plate' || id === 'circular-flange') {
        const pitchRadius = Math.min(width, depth) * 0.32;
        return {
          ...result,
          holes: [
            centralBore(Math.min(width, depth) * 0.38),
            ...[0, 90, 180, 270].map(
              (angle) =>
                ({
                  diameter: hole,
                  center: {
                    x: pitchRadius * Math.cos((angle * Math.PI) / 180),
                    y: pitchRadius * Math.sin((angle * Math.PI) / 180),
                  },
                  axis: 'z',
                }) as const,
            ),
          ],
        };
      }
      if (id === 'perforated-plate' || id === 'window-plate') {
        return {
          ...result,
          holes: [-1, 1].flatMap((x) =>
            [-1, 1].map(
              (y) =>
                ({
                  diameter: hole,
                  center: { x: x * width * 0.325, y: y * depth * 0.325 },
                  axis: 'z',
                }) as const,
            ),
          ),
        };
      }
      if (id === 'mounting-disc' || id === 'cross-plate') {
        const pitch = id === 'mounting-disc' ? 0.32 : 0.35;
        return {
          ...result,
          holes: [0, 90, 180, 270].map(
            (angle) =>
              ({
                diameter: hole,
                center: {
                  x: width * pitch * Math.cos((angle * Math.PI) / 180),
                  y: depth * pitch * Math.sin((angle * Math.PI) / 180),
                },
                axis: 'z',
              }) as const,
          ),
        };
      }
      return result;
    },
  }),
);

const bearingParts = (
  [
    ['ball-bearing', 'Open ball bearing'],
    ['flanged-ball-bearing', 'Flanged ball bearing'],
    ['thrust-bearing', 'Thrust ball bearing'],
  ] as const
).map(([id, name]) =>
  define({
    id,
    name,
    category: 'Bearings',
    description:
      'Two separate races and eight separately named rolling balls, with a through shaft opening and explicit outer envelope.',
    parameters: { diameter: 30, bore: 12, length: 10 },
    expected: (parameters) => ({
      ...acceptance(
        value(parameters, 'diameter') * (id === 'flanged-ball-bearing' ? 1.15 : 1),
        value(parameters, 'diameter') * (id === 'flanged-ball-bearing' ? 1.15 : 1),
        value(parameters, 'length'),
      ),
      solids: 10,
    }),
    fidelity:
      'Detailed generic rolling-element assembly with separate races and balls. Cage and shields omitted; no supplier designation, exact race conformity, life, preload, lubrication or load rating is claimed. This is not a substituted 608/6000-series manufacturer model.',
  }),
);

const fittingNames = [
  ['hose-barb', 'Hose barb adapter'],
  ['pipe-elbow', 'Swept pipe elbow'],
  ['pipe-tee', 'Pipe tee'],
  ['concentric-reducer', 'Concentric reducer'],
  ['pipe-flange', 'Hubbed pipe flange'],
  ['blind-flange', 'Blind pipe flange'],
  ['socket-plug', 'Hex-socket plug'],
  ['pipe-nipple', 'Hex pipe nipple'],
] as const;
const fittingParts = fittingNames.map(([id, name]) =>
  define({
    id,
    name,
    category: 'Fluid fittings',
    description:
      'Generic fitting with a deliberately modeled flow passage, wall and end interfaces; plugs and blind flanges intentionally close the passage.',
    parameters:
      id === 'blind-flange' || id === 'socket-plug'
        ? { diameter: 30, length: id === 'blind-flange' ? 8 : 40 }
        : { diameter: 30, bore: 12, length: 60 },
    expected: (parameters) => {
      const diameter = value(parameters, 'diameter');
      const length = value(parameters, 'length');
      if (id === 'pipe-elbow') {
        return {
          ...acceptance(length * 0.7 + diameter / 2, diameter, length * 0.7 + diameter / 2),
          voids: elbowPassages(length, value(parameters, 'bore')),
          planes: [
            {
              normal: [0, 0, 1],
              offset: 0,
              area: (Math.PI * (diameter ** 2 - value(parameters, 'bore') ** 2)) / 4,
              tolerance: 0.03,
            },
            {
              normal: [1, 0, 0],
              offset: length * 0.7,
              area: (Math.PI * (diameter ** 2 - value(parameters, 'bore') ** 2)) / 4,
              tolerance: 0.03,
            },
          ],
        };
      }
      if (id === 'pipe-tee') {
        const padding = value(parameters, 'bore') * 0.3;
        const inset = length * 0.02;
        return {
          ...acceptance(length / 2 + diameter / 2, diameter, length),
          planes: [
            {
              normal: [0, 0, 1],
              offset: 0,
              area: (Math.PI * (diameter ** 2 - value(parameters, 'bore') ** 2)) / 4,
              tolerance: 0.03,
            },
            {
              normal: [0, 0, 1],
              offset: length,
              area: (Math.PI * (diameter ** 2 - value(parameters, 'bore') ** 2)) / 4,
              tolerance: 0.03,
            },
            {
              normal: [1, 0, 0],
              offset: length / 2,
              area: (Math.PI * (diameter ** 2 - value(parameters, 'bore') ** 2)) / 4,
              tolerance: 0.03,
            },
          ],
          voids: [
            {
              path: [
                [0, 0, inset],
                [0, 0, length - inset],
              ],
              bounds: { min: [-padding, -padding, inset / 2], max: [padding, padding, length - inset / 2] },
            },
            {
              path: [
                [0, 0, length / 2],
                [length / 2 - inset, 0, length / 2],
              ],
              bounds: {
                min: [-padding, -padding, length / 2 - padding],
                max: [length / 2 - inset / 2, padding, length / 2 + padding],
              },
            },
          ],
        };
      }
      const result = acceptance(diameter, id === 'pipe-nipple' ? (diameter * Math.sqrt(3)) / 2 : diameter, length);
      return ['hose-barb', 'pipe-flange', 'pipe-nipple'].includes(id)
        ? { ...result, holes: [centralBore(value(parameters, 'bore'))] }
        : result;
    },
    fidelity:
      'Detailed generic geometry, with true bores and connected passages in open fittings. Nominal pipe threads are symbolic (smooth envelope), not helically cut. No pipe schedule, pressure, seal, sanitary or supplier compatibility certification. Elbow uses a swept continuous path, not mitred cylinders.',
  }),
);

const handleParts = (
  [
    ['star-knob', 'Six-lobe hand knob'],
    ['thumbwheel', 'Scalloped thumbwheel'],
    ['handwheel', 'Four-spoke handwheel'],
    ['lever-handle', 'Flat lever handle'],
    ['pull-handle', 'Loop pull handle'],
  ] as const
).map(([id, name]) =>
  define({
    id,
    name,
    category: 'Handles and controls',
    description:
      'Editable hand-operated component with shaped gripping surfaces and an actual hub opening where applicable.',
    parameters: id === 'pull-handle' ? { diameter: 60, length: 20 } : { diameter: 60, bore: 8, length: 12 },
    expected: (parameters) => {
      const diameter = value(parameters, 'diameter');
      const length = value(parameters, 'length');
      if (id === 'star-knob') {
        return {
          ...acceptance(diameter, diameter * (0.38 * Math.sqrt(3) + 0.24), length),
          holes: [centralBore(value(parameters, 'bore'))],
        };
      }
      if (id === 'lever-handle' || id === 'pull-handle') {
        return acceptance(diameter, length, length / 2);
      }
      return { ...acceptance(diameter, diameter, length), holes: [centralBore(value(parameters, 'bore'))] };
    },
  }),
);

const spring = define({
  id: 'compression-spring',
  name: 'Open-end compression spring',
  category: 'Springs',
  description:
    'A true helical round-wire spring with individually adjustable outer diameter, wire diameter, pitch and integral coil count.',
  parameters: { diameter: 24, wire: 2, pitch: 5, turns: 6 },
  domains: {
    diameter: { min: 20, max: 28 },
    wire: { min: 1.5, max: 2.5 },
    pitch: { min: 4, max: 6 },
    turns: { min: 4, max: 8, integer: true, values: [4, 5, 6, 7, 8] },
  },
  expected: (parameters) =>
    acceptance(
      value(parameters, 'diameter'),
      value(parameters, 'diameter'),
      value(parameters, 'pitch') * value(parameters, 'turns') + value(parameters, 'wire'),
    ),
  fidelity:
    'Round-wire helix with open, unground ends. Free geometry only; spring rate, stress, fatigue, preload and solid-height service limits are not certified. Integer turns preserve the declared datum and end orientation.',
});

/** Authored mechanical catalog; parameter variants do not inflate its design count. @internal */
export const parts: readonly PartDefinition[] = [
  ...rotaryParts,
  ...gearParts,
  ...stockParts,
  ...mountingParts,
  ...bearingParts,
  ...fittingParts,
  ...handleParts,
  spring,
];
