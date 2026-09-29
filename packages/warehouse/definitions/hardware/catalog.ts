import type { PartDefinition, PartExpectations } from '#definition.js';

type Parameters = Readonly<Record<string, number>>;

const symbolic =
  'Detailed generic BRep with explicit dimensions. Threads are smooth nominal envelopes; no ISO/DIN conformity, fit class, material or load rating is claimed.';
const geometric =
  'Detailed generic BRep with explicit dimensions. No supplier SKU, material, load rating or standards conformity is claimed.';
const value = (p: Parameters, key: keyof Parameters): number => {
  const result = p[key];
  if (result === undefined) {
    throw new Error(`Missing catalog dimension ${key}`);
  }
  return result;
};
const bounds = (x: number, y: number, z: number): PartExpectations => ({ bounds: { x, y, z }, solids: 1 });
const round = (p: Parameters): PartExpectations =>
  bounds(value(p, 'diameter'), value(p, 'diameter'), value(p, 'length'));
const washerBounds = (p: Parameters): PartExpectations =>
  bounds(value(p, 'diameter'), value(p, 'diameter'), value(p, 'thickness'));
const nutBounds = (p: Parameters): PartExpectations =>
  bounds((2 * value(p, 'width')) / Math.sqrt(3), value(p, 'width'), value(p, 'height'));
const screwBounds = (p: Parameters): PartExpectations =>
  bounds(value(p, 'headDiameter'), value(p, 'headDiameter'), value(p, 'length') + value(p, 'headHeight'));

const featureExpectations = (id: string, p: Parameters, expected: PartExpectations): PartExpectations => {
  const boreFamilies = [
    'hex-nut',
    'castle-nut',
    'nylon-insert-locknut',
    'hex-flange-nut',
    'wing-nut',
    't-slot-nut',
    'heat-set-insert',
    'rivet-nut',
    'tubular-spacer',
    'hex-standoff',
    'square-washer',
    'tab-washer',
    'cable-gland',
    'cable-grommet',
  ];
  let result = expected;
  if (boreFamilies.includes(id)) {
    result = { ...result, holes: [{ diameter: value(p, 'bore'), center: { x: 0, y: 0 }, axis: 'z' }] };
  }
  if (id === 'eye-bolt') {
    result = {
      ...result,
      holes: [
        {
          diameter: value(p, 'bore'),
          center: { x: 0, y: 0, z: value(p, 'length') + value(p, 'headDiameter') * 0.3 },
          axis: 'y',
        },
      ],
    };
  }
  if (id === 'flat-gasket' || id === 'fan-guard') {
    const inset = Math.max(value(p, 'hole') * 1.5, 4);
    result = {
      ...result,
      holes: [-1, 1].flatMap((x) =>
        [-1, 1].map(
          (y) =>
            ({
              diameter: value(p, 'hole'),
              center: { x: x * (value(p, 'width') / 2 - inset), y: y * (value(p, 'depth') / 2 - inset) },
              axis: 'z',
            }) as const,
        ),
      ),
    };
  }
  if (id === 'clevis-pin') {
    result = {
      ...result,
      holes: [{ diameter: value(p, 'hole'), center: { x: 0, y: 0, z: value(p, 'diameter') * 0.7 }, axis: 'x' }],
    };
  }
  let volume: number | undefined;
  if (id === 'tubular-spacer') {
    volume = (Math.PI * (value(p, 'diameter') ** 2 - value(p, 'bore') ** 2) * value(p, 'length')) / 4;
  }
  if (id === 'hex-standoff') {
    volume = ((Math.sqrt(3) * value(p, 'width') ** 2) / 2 - (Math.PI * value(p, 'bore') ** 2) / 4) * value(p, 'length');
  }
  if (id === 'woodruff-key') {
    volume = (Math.PI * value(p, 'diameter') ** 2 * value(p, 'width')) / 8;
  }
  if (id === 'parallel-key') {
    volume =
      (value(p, 'width') * (value(p, 'length') - value(p, 'width')) + (Math.PI * value(p, 'width') ** 2) / 4) *
      value(p, 'height');
  }
  return volume === undefined ? result : { ...result, volume: { min: volume - 0.001, max: volume + 0.001 } };
};

const family = (input: {
  id: string;
  name: string;
  category: string;
  description: string;
  parameters: Parameters;
  expect: (parameters: Parameters) => PartExpectations;
  fidelity?: string;
}): PartDefinition => {
  const expect = (p: Parameters): PartExpectations => featureExpectations(input.id, p, input.expect(p));
  const parameters: Record<string, number> = {};
  const domains: Record<string, { min: number; max: number }> = {};
  for (const [key, number] of Object.entries(input.parameters)) {
    parameters[key] = number;
    domains[key] = { min: number * 0.8, max: number * 1.2 };
  }
  if (input.id === 'external-retaining-ring') {
    domains['bore'] = { min: 12, max: 15.2 };
  }
  if (input.id === 'fan-guard') {
    domains['bore'] = { min: 35.2, max: 44 };
  }
  const cases = Object.entries(domains).flatMap(([key, domain]) =>
    [domain.min, domain.max].map((number, index) => {
      const changed = { ...parameters, [key]: number };
      return {
        name: `${key}-${index === 0 ? 'minimum' : 'maximum'}`,
        parameters: { [key]: number },
        expectations: expect(changed),
      };
    }),
  );
  for (const endpoint of ['min', 'max'] as const) {
    const changed = Object.fromEntries(Object.entries(domains).map(([key, domain]) => [key, domain[endpoint]]));
    cases.push({ name: `combined-${endpoint}`, parameters: changed, expectations: expect(changed) });
  }
  const outerKey = parameters['diameter'] === undefined ? 'width' : 'diameter';
  const outerDomain = domains[outerKey];
  const boreDomain = domains['bore'];
  if (boreDomain && outerDomain && input.id !== 'eye-bolt' && input.id !== 'fan-guard') {
    const changed = { ...parameters, [outerKey]: outerDomain.min, bore: boreDomain.max };
    cases.push({ name: 'thin-wall-corner', parameters: changed, expectations: expect(changed) });
  }
  return {
    id: input.id,
    name: input.name,
    category: input.category,
    description: input.description,
    design: input.id,
    parameters,
    domains,
    cases,
    expectations: expect(input.parameters),
    fidelity: input.fidelity ?? geometric,
  };
};

type FamilyInput = {
  id: string;
  name: string;
  parameters: Parameters;
  expect?: (parameters: Parameters) => PartExpectations;
};
const fastener = ({ id, name, parameters, expect = screwBounds }: FamilyInput): PartDefinition =>
  family({
    id,
    name,
    category: 'Fasteners',
    parameters,
    expect,
    fidelity: symbolic,
    description: `${name} with editable millimetre dimensions and a deliberately symbolic thread.`,
  });
const washer = ({ id, name, parameters, expect = washerBounds }: FamilyInput): PartDefinition =>
  family({
    id,
    name,
    category: 'Washers and spacers',
    parameters,
    expect,
    description: `${name} with a modeled opening and editable section dimensions.`,
  });

/** Independently specified generic hardware families. @internal */
const genericParts: readonly PartDefinition[] = [
  fastener({
    id: 'socket-head-cap-screw',
    name: 'Socket-head cap screw',
    parameters: { diameter: 6, length: 24, headDiameter: 10, headHeight: 6, socket: 5 },
  }),
  fastener({
    id: 'hex-head-bolt',
    name: 'Hex-head bolt',
    parameters: { diameter: 6, length: 24, headDiameter: 10, headHeight: 4 },
    expect: (p) =>
      bounds(
        (2 * value(p, 'headDiameter')) / Math.sqrt(3),
        value(p, 'headDiameter'),
        value(p, 'length') + value(p, 'headHeight'),
      ),
  }),
  fastener({
    id: 'button-head-socket-screw',
    name: 'Button-head socket screw',
    parameters: { diameter: 6, length: 20, headDiameter: 10.5, headHeight: 3.5, socket: 3 },
  }),
  fastener({
    id: 'countersunk-socket-screw',
    name: 'Countersunk socket screw',
    parameters: { diameter: 6, length: 24, headDiameter: 12, headHeight: 3, socket: 4 },
    expect: (p) => bounds(value(p, 'headDiameter'), value(p, 'headDiameter'), value(p, 'length')),
  }),
  fastener({
    id: 'pan-head-machine-screw',
    name: 'Pan-head machine screw',
    parameters: { diameter: 5, length: 20, headDiameter: 9, headHeight: 3, socket: 3 },
  }),
  fastener({
    id: 'socket-set-screw',
    name: 'Socket set screw',
    parameters: { diameter: 6, length: 10, socket: 3 },
    expect: round,
  }),
  fastener({
    id: 'shoulder-screw',
    name: 'Shoulder screw',
    parameters: { diameter: 6, length: 24, width: 8, headDiameter: 12, headHeight: 6, socket: 5 },
  }),
  fastener({
    id: 'threaded-stud',
    name: 'Slotted threaded stud',
    parameters: { diameter: 8, length: 40 },
    expect: round,
  }),
  fastener({
    id: 'carriage-bolt',
    name: 'Carriage bolt',
    parameters: { diameter: 6, length: 24, headDiameter: 14, headHeight: 5 },
  }),
  fastener({
    id: 'eye-bolt',
    name: 'Eye bolt',
    parameters: { diameter: 6, length: 24, headDiameter: 24, bore: 14 },
    expect: (p) =>
      bounds(value(p, 'headDiameter'), value(p, 'diameter'), value(p, 'length') + value(p, 'headDiameter') * 0.8),
  }),
  ...[
    ['hex-nut', 'Hex nut', 5],
    ['castle-nut', 'Castle nut', 8],
    ['nylon-insert-locknut', 'Nylon-insert locknut', 7],
    ['cap-nut', 'Cap nut', 12],
  ].map(([id, name, height]) => {
    if (typeof id !== 'string' || typeof name !== 'string' || typeof height !== 'number') {
      throw new TypeError('Invalid nut definition.');
    }
    return fastener({ id, name, parameters: { width: 10, height, bore: 5 }, expect: nutBounds });
  }),
  fastener({
    id: 'hex-flange-nut',
    name: 'Hex flange nut',
    parameters: { width: 10, height: 6, bore: 5, flangeDiameter: 15, flangeHeight: 1.5 },
    expect: (p) => bounds(value(p, 'flangeDiameter'), value(p, 'flangeDiameter'), value(p, 'height')),
  }),
  fastener({
    id: 'wing-nut',
    name: 'Wing nut',
    parameters: { width: 10, height: 8, bore: 5 },
    expect: (p) => bounds(value(p, 'width') * 2.6, value(p, 'width'), value(p, 'height')),
  }),
  fastener({
    id: 't-slot-nut',
    name: 'T-slot nut',
    parameters: { width: 10, height: 6, bore: 4.5, flangeDiameter: 16 },
    expect: (p) => bounds(value(p, 'flangeDiameter'), value(p, 'width'), value(p, 'height')),
  }),
  fastener({
    id: 'heat-set-insert',
    name: 'Heat-set insert',
    parameters: { diameter: 8, length: 10, bore: 4 },
    expect: round,
  }),
  fastener({
    id: 'rivet-nut',
    name: 'Rivet nut',
    parameters: { diameter: 8, length: 14, bore: 4, flangeDiameter: 12, flangeHeight: 1.5 },
    expect: (p) => bounds(value(p, 'flangeDiameter'), value(p, 'flangeDiameter'), value(p, 'length')),
  }),
  fastener({
    id: 'blind-rivet',
    name: 'Blind rivet',
    parameters: { diameter: 4, length: 12, headDiameter: 8, headHeight: 1.5 },
    expect: (p) =>
      bounds(value(p, 'headDiameter'), value(p, 'headDiameter'), value(p, 'length') * 1.6 + value(p, 'headHeight')),
  }),
  washer({ id: 'flat-washer', name: 'Flat washer', parameters: { diameter: 18, bore: 6.5, thickness: 1.5 } }),
  washer({
    id: 'split-lock-washer',
    name: 'Split lock washer',
    parameters: { diameter: 12, bore: 6.5, thickness: 1.5, height: 2, gap: 15 },
    expect: (p) => bounds(value(p, 'diameter'), value(p, 'diameter'), value(p, 'height') + value(p, 'thickness')),
  }),
  washer({
    id: 'belleville-washer',
    name: 'Belleville washer',
    parameters: { diameter: 20, bore: 8, thickness: 1, height: 2.5 },
    expect: (p) => bounds(value(p, 'diameter'), value(p, 'diameter'), value(p, 'height')),
  }),
  washer({
    id: 'internal-tooth-lock-washer',
    name: 'Internal-tooth lock washer',
    parameters: { diameter: 16, bore: 6, thickness: 1 },
  }),
  washer({
    id: 'tubular-spacer',
    name: 'Tubular spacer',
    parameters: { diameter: 10, bore: 6.5, length: 16 },
    expect: round,
  }),
  fastener({
    id: 'hex-standoff',
    name: 'Hex standoff',
    parameters: { width: 8, bore: 3.5, length: 20 },
    expect: (p) => bounds((value(p, 'width') * 2) / Math.sqrt(3), value(p, 'width'), value(p, 'length')),
  }),
  washer({
    id: 'slotted-shim',
    name: 'Slotted shim',
    parameters: { diameter: 18, bore: 10, thickness: 0.2 },
    expect: (p) =>
      bounds(
        value(p, 'diameter'),
        value(p, 'diameter') / 2 + Math.sqrt((value(p, 'diameter') / 2) ** 2 - (value(p, 'bore') / 2) ** 2),
        value(p, 'thickness'),
      ),
  }),
  family({
    id: 'dowel-pin',
    name: 'Dowel pin',
    category: 'Pins and retainers',
    description: 'Chamfered cylindrical locating pin.',
    parameters: { diameter: 6, length: 24 },
    expect: round,
  }),
  family({
    id: 'clevis-pin',
    name: 'Clevis pin',
    category: 'Pins and retainers',
    description: 'Headed pivot pin with a real transverse retaining hole.',
    parameters: { diameter: 8, length: 32, headDiameter: 12, headHeight: 3, hole: 2 },
    expect: screwBounds,
  }),
  washer({
    id: 'external-retaining-ring',
    name: 'External retaining ring',
    parameters: { diameter: 20, bore: 15, thickness: 1 },
    expect: (p) =>
      bounds(value(p, 'diameter'), value(p, 'diameter') * (0.5 + Math.sqrt(0.25 - 0.175 ** 2)), value(p, 'thickness')),
  }),
  ...['base', 'lid'].map((kind) =>
    family({
      id: `enclosure-${kind}`,
      name: `Enclosure ${kind}`,
      category: 'Enclosures',
      description: `Uniform-wall open electronics enclosure ${kind}; external dimensions and wall are editable.`,
      parameters: { width: 80, depth: 50, height: kind === 'base' ? 25 : 8, wall: 2 },
      expect: (p) => bounds(value(p, 'width'), value(p, 'depth'), value(p, 'height')),
    }),
  ),
  family({
    id: 'fan-guard',
    name: 'Fan guard',
    category: 'Enclosures',
    description: 'Perforated frame with four mounting holes, three protective bars and a central hub.',
    parameters: { width: 60, depth: 60, thickness: 2, hole: 4, bore: 44 },
    expect: (p) => bounds(value(p, 'width'), value(p, 'depth'), value(p, 'thickness')),
  }),
  family({
    id: 'cable-gland',
    name: 'Cable gland',
    category: 'Cable hardware',
    description: 'Through-bored gland with retaining flanges and wrench flats; sealing performance is unspecified.',
    parameters: { diameter: 16, height: 24, flangeDiameter: 22, thickness: 2, bore: 8 },
    expect: (p) =>
      bounds((value(p, 'flangeDiameter') * 0.9 * 2) / Math.sqrt(3), value(p, 'flangeDiameter'), value(p, 'height')),
    fidelity: symbolic,
  }),
  family({
    id: 'cable-grommet',
    name: 'Cable grommet',
    category: 'Cable hardware',
    description: 'Double-lip cable grommet with a real continuous bore and panel retention groove.',
    parameters: { diameter: 16, height: 8, flangeDiameter: 22, thickness: 1.5, bore: 10 },
    expect: (p) => bounds(value(p, 'flangeDiameter'), value(p, 'flangeDiameter'), value(p, 'height')),
  }),
  family({
    id: 'cable-clip',
    name: 'Cable clip',
    category: 'Cable hardware',
    description: 'Open cable-retention clip with a flat mounting foot.',
    parameters: { diameter: 10, width: 12, wall: 2 },
    expect: (p) =>
      bounds(
        value(p, 'diameter') + value(p, 'wall') * 2,
        value(p, 'diameter') / 2 +
          value(p, 'wall') * 1.5 +
          Math.sqrt((value(p, 'diameter') / 2 + value(p, 'wall')) ** 2 - (value(p, 'diameter') * 0.325) ** 2),
        value(p, 'width'),
      ),
  }),
  family({
    id: 'din-rail-clip',
    name: 'DIN-rail style mounting clip',
    category: 'Cable hardware',
    description:
      'Channel clip with inward retention lips; dimensions are generic and require qualification against the selected rail.',
    parameters: { width: 35, depth: 20, height: 8, wall: 2 },
    expect: (p) => bounds(value(p, 'width'), value(p, 'depth'), value(p, 'height')),
  }),
  family({
    id: 'panel-blanking-plug',
    name: 'Panel blanking plug',
    category: 'Enclosures',
    description: 'Solid blanking plug with two retention lips and a panel groove.',
    parameters: { diameter: 16, height: 8, flangeDiameter: 22, thickness: 1.5 },
    expect: (p) => bounds(value(p, 'flangeDiameter'), value(p, 'flangeDiameter'), value(p, 'height')),
  }),
  family({
    id: 'o-ring',
    name: 'O-ring',
    category: 'Seals',
    description: 'Circular-section toroidal O-ring in its undeformed free state.',
    parameters: { diameter: 20, thickness: 3 },
    expect: (p) =>
      bounds(
        value(p, 'diameter') + value(p, 'thickness') * 2,
        value(p, 'diameter') + value(p, 'thickness') * 2,
        value(p, 'thickness'),
      ),
  }),
  family({
    id: 'flat-gasket',
    name: 'Flat gasket',
    category: 'Seals',
    description: 'Rectangular sealing blank with an open window and four mounting holes.',
    parameters: { width: 80, depth: 50, thickness: 1.5, hole: 4 },
    expect: (p) => bounds(value(p, 'width'), value(p, 'depth'), value(p, 'thickness')),
  }),
  washer({ id: 'square-washer', name: 'Square washer', parameters: { diameter: 20, bore: 8, thickness: 2 } }),
  washer({
    id: 'tab-washer',
    name: 'Tab washer',
    parameters: { diameter: 20, bore: 8, thickness: 1 },
    expect: (p) => bounds(value(p, 'diameter'), value(p, 'diameter') * 1.25, value(p, 'thickness')),
  }),
  family({
    id: 'parallel-key',
    name: 'Parallel key',
    category: 'Pins and retainers',
    description: 'Round-ended parallel shaft key with editable length, width and height.',
    parameters: { width: 6, length: 24, height: 6 },
    expect: (p) => bounds(value(p, 'width'), value(p, 'length'), value(p, 'height')),
  }),
  family({
    id: 'woodruff-key',
    name: 'Woodruff key',
    category: 'Pins and retainers',
    description: 'Semicircular disk key with a flat top and cylindrical seating arc.',
    parameters: { diameter: 20, width: 5 },
    expect: (p) => bounds(value(p, 'diameter'), value(p, 'width'), value(p, 'diameter') / 2),
  }),
  family({
    id: 'slotted-spring-pin',
    name: 'Slotted spring pin',
    category: 'Pins and retainers',
    description: 'Hollow cylindrical spring pin with a full-length open slot.',
    parameters: { diameter: 8, bore: 5, length: 24, gap: 1 },
    expect: (p) =>
      bounds(
        value(p, 'diameter'),
        value(p, 'diameter') / 2 + Math.sqrt((value(p, 'diameter') / 2) ** 2 - (value(p, 'gap') / 2) ** 2),
        value(p, 'length'),
      ),
  }),
  fastener({
    id: 'knurled-thumbscrew',
    name: 'Knurled thumbscrew',
    parameters: { diameter: 6, length: 20, headDiameter: 18, headHeight: 6, socket: 4 },
  }),
];

// Acceptance values are transcribed independently from the cited supplier drawings;
// this oracle is intentionally not imported from the geometry generator.
const metricOracle = [
  {
    diameter: 3,
    cap: 5.68,
    hex: 5.5,
    boltHeight: 2,
    nut: 5.5,
    nutHeight: 2.4,
    washerBore: 3.2,
    washer: 7,
    thickness: 0.5,
  },
  {
    diameter: 4,
    cap: 7.22,
    hex: 7,
    boltHeight: 2.8,
    nut: 7,
    nutHeight: 3.2,
    washerBore: 4.3,
    washer: 9,
    thickness: 0.8,
  },
  {
    diameter: 5,
    cap: 8.72,
    hex: 8,
    boltHeight: 3.5,
    nut: 8,
    nutHeight: 4.7,
    washerBore: 5.3,
    washer: 10,
    thickness: 1,
  },
  {
    diameter: 6,
    cap: 10.22,
    hex: 10,
    boltHeight: 4,
    nut: 10,
    nutHeight: 5.2,
    washerBore: 6.4,
    washer: 12,
    thickness: 1.6,
  },
  {
    diameter: 8,
    cap: 13.27,
    hex: 13,
    boltHeight: 5.3,
    nut: 13,
    nutHeight: 6.8,
    washerBore: 8.4,
    washer: 16,
    thickness: 1.6,
  },
  {
    diameter: 10,
    cap: 16.27,
    hex: 17,
    boltHeight: 6.4,
    nut: 16,
    nutHeight: 8.4,
    washerBore: 10.5,
    washer: 20,
    thickness: 2,
  },
];
const metricExpect = (design: string, diameter: number, length: number): PartExpectations => {
  const size = metricOracle.find((entry) => entry.diameter === diameter);
  if (!size) {
    throw new Error('Unsupported metric acceptance diameter.');
  }
  if (design === 'flat-washer') {
    const volume = (Math.PI * (size.washer ** 2 - size.washerBore ** 2) * size.thickness) / 4;
    return {
      ...bounds(size.washer, size.washer, size.thickness),
      volume: { min: volume - 0.001, max: volume + 0.001 },
      holes: [{ diameter: size.washerBore, center: { x: 0, y: 0 }, axis: 'z' }],
    };
  }
  if (design === 'hex-nut') {
    return {
      ...bounds((2 * size.nut) / Math.sqrt(3), size.nut, size.nutHeight),
      holes: [{ diameter, center: { x: 0, y: 0 }, axis: 'z' }],
    };
  }
  if (design === 'hex-head-bolt') {
    return bounds((2 * size.hex) / Math.sqrt(3), size.hex, length + size.boltHeight);
  }
  return bounds(size.cap, size.cap, length + diameter);
};

/** Hardware catalog with diameter-driven metric fixtures and independent dimension cases. @internal */
export const parts: readonly PartDefinition[] = genericParts.map((part) => {
  if (!['socket-head-cap-screw', 'hex-head-bolt', 'hex-nut', 'flat-washer'].includes(part.id)) {
    return part;
  }
  const hasLength = part.id === 'socket-head-cap-screw' || part.id === 'hex-head-bolt';
  const parameters: Record<string, number> = hasLength ? { diameter: 6, length: 24 } : { diameter: 6 };
  return {
    ...part,
    parameters,
    description: `${part.name}; one M3/M4/M5/M6/M8/M10 diameter selects all admitted head, socket or washer dimensions.`,
    domains: {
      diameter: { min: 3, max: 10, values: [3, 4, 5, 6, 8, 10] },
      ...(hasLength ? { length: { min: 8, max: 50 } } : {}),
    },
    expectations: metricExpect(part.id, 6, 24),
    cases: metricOracle.flatMap(({ diameter }) =>
      (hasLength ? [8, 24, 50] : [24]).map((length) => ({
        name: `M${diameter}${hasLength ? `-length-${length}` : ''}`,
        parameters: Object.fromEntries(
          hasLength
            ? [
                ['diameter', diameter],
                ['length', length],
              ]
            : [['diameter', diameter]],
        ),
        expectations: metricExpect(part.id, diameter, length),
      })),
    ),
    fidelity:
      'Supplier-table dimensions: Fastenal ISO 4762 REV-03 (head max, socket min); Fuller DIN 933 nominal hex head; Aspen hex nut table max; Woodstock DIN 125A washer nominal. Threads are symbolic nominal cylinders. Chamfer/relief detail is illustrative; no complete standards or material certification.',
  };
});
