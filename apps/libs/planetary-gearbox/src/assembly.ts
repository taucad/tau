/**
 * The order an engineer builds the gearbox in. Every part travels only along the gearbox axis,
 * onto the parts already seated, so nothing passes through anything else: spacers onto the rear
 * carrier, pins through them, washers and the bushed planets down the pins, the sun down between
 * the planets, front spacers, the ring over the planets, the front carrier onto the pins and its
 * screws; then the rear screws come up from underneath. `z` is each step's assembled extent along
 * the axis in millimetres, measured from the frozen geometry in assets/planetary.json.
 */
const assemblyOrder: ReadonlyArray<{ match: RegExp; z: readonly [number, number]; below?: boolean }> = [
  { match: /^Carrier Rear$/u, z: [-8, -3] },
  { match: /^Rear Thrust Spacer/u, z: [-3, -1.7] },
  { match: /^Planet Pin/u, z: [-7.9, 21.9] },
  { match: /^Thrust Washer/u, z: [-1.5, 0] },
  { match: /^(?:Flanged Bushing|Planet Gear)/u, z: [0, 15.5] },
  { match: /^Sun/u, z: [-28, 16] },
  { match: /^Front Thrust Spacer/u, z: [15.7, 17] },
  { match: /^Internal Ring/u, z: [-1, 15] },
  { match: /^Carrier Front/u, z: [17, 40] },
  { match: /^Front Screw Washer/u, z: [22, 23] },
  { match: /^Front Socket Screw/u, z: [11, 28] },
  { match: /^Rear Screw Washer/u, z: [-9, -8], below: true },
  { match: /^Rear Socket Screw/u, z: [-14, 3], below: true },
];

/**
 * Number of steps in the assembly order.
 * @public
 */
export const assemblySteps = assemblyOrder.length;

/** Exploded steps wait one clear gap beyond the previous one, so exploded parts never overlap. */
const explodeGap = 6;
const lifts = (() => {
  let top = -3;
  let bottom = -8;
  return assemblyOrder.map(({ z: [low, high], below }, step) => {
    if (step === 0) {
      return 0;
    }
    if (below) {
      const lift = bottom - explodeGap - high;
      bottom = low + lift;
      return lift;
    }
    const lift = top + explodeGap - low;
    top = high + lift;
    return lift;
  });
})();

/**
 * Zero-based assembly step of an authored part.
 * @param name - Authored part name.
 * @returns Step index into the assembly order; unknown parts go last.
 * @public
 */
export const assemblyStep = (name: string): number => {
  const step = assemblyOrder.findIndex(({ match }) => match.test(name));
  return step === -1 ? assemblySteps - 1 : step;
};

/**
 * Axial explode offset in millimetres: front parts above, rear screws below.
 * @param name - Authored part name.
 * @returns Offset along the gearbox axis when fully exploded.
 * @public
 */
export const explodeLift = (name: string): number => lifts[assemblyStep(name)] ?? 0;

/**
 * Which illustrative agent task produced a part: ring, gear train, or carrier and hardware.
 * @param name - Authored part name.
 * @returns -1 for the ring, 0 for the gear train, 1 for the carrier and hardware.
 * @public
 */
export const agentLane = (name: string): -1 | 0 | 1 =>
  name.startsWith('Internal Ring') ? -1 : /^(?:Sun|Planet Gear|Flanged Bushing)/u.test(name) ? 0 : 1;

/**
 * The part that the print chapters prepare: the ring gear, printed from its base at z = -1 mm.
 * @public
 */
export const printedPart = { name: 'Internal Ring Gear', base: -1, height: 16 } as const;
