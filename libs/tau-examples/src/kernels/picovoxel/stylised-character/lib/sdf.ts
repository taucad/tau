import type { SdfExpression, Vec3 } from 'picovoxel';

/*
 * Signed-distance building blocks for stylised characters, as serializable `SdfExpression`s: the shapes fill in
 * parallel and one `createVoxels({ shape: 'implicit' })` call turns the blended field into one watertight body.
 * Distances are millimetres; a negative value is inside.
 */

const square = (value: SdfExpression): SdfExpression => ['*', value, value];

/** The coordinates relative to a point: what every primitive below measures from. */
const offset = ([cx, cy, cz]: Vec3): readonly [
  SdfExpression,
  SdfExpression,
  SdfExpression,
] => [
  ['-', 'x', cx],
  ['-', 'y', cy],
  ['-', 'z', cz],
];

/**
 * A sphere.
 *
 * @param center - Its centre.
 * @param radius - Its radius.
 * @returns The field.
 */
export const sphere = (center: Vec3, radius: number): SdfExpression => {
  const [x, y, z] = offset(center);
  return ['-', ['sqrt', ['+', square(x), square(y), square(z)]], radius];
};

/**
 * An axis-aligned ellipsoid: a head, a belly, a cheek. The bound is Quílez's: exact on the axes and close elsewhere,
 * which is what a blend needs.
 *
 * @param center - Its centre.
 * @param radii - Its semi-axes along x, y and z.
 * @returns The field.
 */
export const ellipsoid = (center: Vec3, [rx, ry, rz]: Vec3): SdfExpression => {
  const [x, y, z] = offset(center);
  const k0: SdfExpression = [
    'sqrt',
    ['+', square(['/', x, rx]), square(['/', y, ry]), square(['/', z, rz])],
  ];
  const k1: SdfExpression = [
    'sqrt',
    [
      '+',
      square(['/', x, rx * rx]),
      square(['/', y, ry * ry]),
      square(['/', z, rz * rz]),
    ],
  ];
  // The centre itself has k1 = 0; any positive floor keeps the field finite there.
  return ['/', ['*', k0, ['-', k0, 1]], ['max', k1, 1e-9]];
};

/**
 * A capsule between two points: a limb, an ear, a tail.
 *
 * @param start - One end's centre.
 * @param end - The other end's centre.
 * @param radius - Its radius.
 * @returns The field.
 */
export const capsule = (
  start: Vec3,
  end: Vec3,
  radius: number,
): SdfExpression => {
  const [px, py, pz] = offset(start);
  const [bx, by, bz] = [
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2],
  ];
  const lengthSquared = bx * bx + by * by + bz * bz;
  const along: SdfExpression = [
    'max',
    0,
    [
      'min',
      1,
      ['/', ['+', ['*', px, bx], ['*', py, by], ['*', pz, bz]], lengthSquared],
    ],
  ];
  return [
    '-',
    [
      'sqrt',
      [
        '+',
        square(['-', px, ['*', along, bx]]),
        square(['-', py, ['*', along, by]]),
        square(['-', pz, ['*', along, bz]]),
      ],
    ],
    radius,
  ];
};

/**
 * The smooth minimum (`smin`): a union whose seams are filleted over about `blend` millimetres, so parts melt into
 * one body instead of meeting at a crease. It is the exponential form, `-k log(sum(exp(-d / k)))`, which names each
 * part once: a fold of the polynomial form repeats every operand at each step and grows the expression
 * exponentially. Two equal distances meet `blend / 4` inside, as the polynomial form with the same width does.
 *
 * @param blend - The width of the blend; 0 is a plain union.
 * @param fields - The parts to join.
 * @returns The field.
 */
export const smoothUnion = (
  blend: number,
  ...fields: readonly SdfExpression[]
): SdfExpression => {
  const [first, ...rest] = fields;
  if (first === undefined) {
    throw new TypeError('smoothUnion needs at least one field.');
  }
  if (rest.length === 0) {
    return first;
  }
  if (blend <= 0) {
    return ['min', first, ...rest];
  }
  const k = blend / (4 * Math.LN2);
  const term = (field: SdfExpression): SdfExpression => [
    'exp',
    ['/', ['-', 0, field], k],
  ];
  return ['*', -k, ['log', ['+', term(first), ...rest.map(term)]]];
};

/**
 * Carve `cut` out of `body` with a sharp edge: eye sockets, a mouth.
 *
 * @param body - The field to keep.
 * @param cut - The field to remove.
 * @returns The field.
 */
export const subtract = (
  body: SdfExpression,
  cut: SdfExpression,
): SdfExpression => ['max', body, ['-', 0, cut]];

/**
 * Mirror a part across the plane x = 0, so a character's two sides are one expression.
 *
 * @param make - Builds the part for a side, `1` right and `-1` left.
 * @returns The two sides joined.
 */
export const mirrored = (
  make: (side: 1 | -1) => SdfExpression,
): SdfExpression => ['min', make(1), make(-1)];
