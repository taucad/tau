import {
  describe,
  it,
  expectGeo,
  type GeoSpecComponentInterferenceAllowance,
} from 'geospec';
import { loadModel } from 'geospec/model';

describe('SYS / complete racing quadcopter', () => {
  // Only buildGimbal receives articulation parameters. Check static pairs once at
  // neutral, then every gimbal part against every installed part at the four
  // travel corners. tests/gimbal.geospec.ts covers the full 25-pose grid for the
  // gimbal itself; 25 whole-vehicle loads exhaust a GeoSpec worker's heap.
  // This finite set is a rigid packaging regression, not a continuous motion proof.
  const poses: Array<[number, number]> = [
    [0, 0],
    [-25, -12],
    [-25, 12],
    [25, -12],
    [25, 12],
  ];
  for (const [pitchDeg, yawDeg] of poses) {
    it(`all installed components / complete interference pitch ${pitchDeg} yaw ${yawDeg}`, async () => {
      // Interference is a mesh matcher. Exact BRep validity is covered below and
      // by the independently loaded gimbal at every pose, avoiding full STEP copies.
      const m = await loadModel({
        file: 'main.ts',
        parameters: { pitchDeg, yawDeg },
      });
      expectGeo(m).toBeWatertight();
      expectGeo(m).toHaveAssemblyOccurrences({
        uniqueNames: true,
        occurrences: [{ name: /.+/, count: 123 }],
      });
      expectGeo(m).toHaveNoComponentInterference({
        tolerance: 0.001,
        ...(pitchDeg !== 0 || yawDeg !== 0
          ? { pairs: [{ left: /^GIM_/, right: /.+/ }] }
          : {}),
        allowances: [1, 2, 3, 4].map(
          (i): GeoSpecComponentInterferenceAllowance => ({
            kind: 'intentionalInterference',
            left: new RegExp(`^AF-008 Shell screw ${i}(?:#\\d+)?$`),
            right: new RegExp(`^AF-009 Insert ${i}(?:#\\d+)?$`),
            maxVolume: 6.5,
            reason:
              'Nominal M2.5 shank and insert tap bore represent mating helical threads; 4 mm engagement.',
          }),
        ),
      });
    });
  }
  it('complete BRep assembly with disjoint service parts', async () => {
    const m = await loadModel({ file: 'main.ts', format: 'step' });
    expectGeo(m).toBeValidBrep();
    expectGeo(m).toHaveStepUnits({ unit: 'mm' });
    expectGeo(m).toHaveTopologyCounts({ solids: 123 });
  });
  it('flight configuration / closed surfaces and five-inch rotor envelope', async () => {
    const m = await loadModel({ file: 'main.ts' });
    expectGeo(m).toBeWatertight();
    expectGeo(m).toHaveVolume({
      value: { greaterThan: 100_000, lessThan: 500_000 },
    });
  });
  it('every installed motor, rotor, camera and avionics unit has an identity', async () => {
    const m = await loadModel({ file: 'main.ts' });
    expectGeo(m).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: [
        { name: /\/motor-base$/, count: 4 },
        { name: /\/propeller-(CW|CCW)$/, count: 4 },
        { name: 'avionics/battery-6S-envelope', count: 1 },
        { name: 'avionics/flight-controller-envelope', count: 1 },
        { name: 'GIM_fixed_mount_PA12', count: 1 },
        { name: /^AF-010 Battery strap [12]$/, count: 2 },
      ],
    });
  });
  it('installed packaging / primary mechanical and equipment clearances', async () => {
    const m = await loadModel({ file: 'main.ts', format: 'step' });
    expectGeo(m).toHaveNoComponentInterference({
      tolerance: 0.03,
      pairs: [
        { left: 'AF-001 Upper shell', right: 'avionics/battery-6S-envelope' },
        { left: 'AF-002 Lower shell', right: 'avionics/battery-6S-envelope' },
        { left: 'AF-001 Upper shell', right: 'avionics/esc-envelope' },
        { left: 'AF-002 Lower shell', right: 'avionics/esc-envelope' },
        {
          left: 'AF-001 Upper shell',
          right: 'avionics/flight-controller-envelope',
        },
        {
          left: 'AF-002 Lower shell',
          right: 'avionics/flight-controller-envelope',
        },
        { left: 'AF-001 Upper shell', right: /^GIM_/ },
        { left: 'AF-002 Lower shell', right: /^GIM_/ },
        {
          left: 'AF-007 Battery saddle',
          right: 'avionics/battery-6S-envelope',
        },
        {
          left: /^AF-010 Battery strap /,
          right: 'avionics/battery-6S-envelope',
        },
        { left: 'AF-007 Battery saddle', right: /^AF-010 Battery strap / },
        { left: /^AF-003 Arm /, right: /\/propeller-(CW|CCW)$/ },
        { left: 'AF-001 Upper shell', right: /\/propeller-(CW|CCW)$/ },
      ],
    });
  });
  it('camera at opposite declared travel limits clears the fuselage', async () => {
    for (const sign of [-1, 1]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Serial STEP loads bound peak memory.
      const m = await loadModel({
        file: 'main.ts',
        parameters: { pitchDeg: 25 * sign, yawDeg: 12 * sign },
        format: 'step',
      });
      expectGeo(m).toHaveNoComponentInterference({
        tolerance: 0.03,
        pairs: [
          { left: 'AF-001 Upper shell', right: /^GIM_/ },
          { left: 'AF-002 Lower shell', right: /^GIM_/ },
        ],
      });
    }
  });
});
