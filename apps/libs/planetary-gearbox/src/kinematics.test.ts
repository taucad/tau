import { describe, expect, it } from 'vitest';
import { agentLane, assemblyStep, explodeLift, printedPart } from '#assembly.js';
import { geospecRun } from '#evidence.js';
import { partPose } from '#kinematics.js';

describe('partPose', () => {
  it('should maintain gear meshing, carrier hardware and bushing coupling through four sun turns', () => {
    for (const angle of [0, Math.PI / 7, Math.PI, 2 * Math.PI, 8 * Math.PI]) {
      const sun = partPose('Sun Gear And Input Shaft', angle).rotation;
      const carrier = partPose('Carrier Front And Output Hub', angle).rotation;
      const ring = partPose('Internal Ring Gear', angle).rotation;
      expect(ring).toBe(0);
      expect(Math.abs(24 * (sun - carrier) + 72 * (ring - carrier)), 'Willis fixed-ring equation').toBeLessThan(1e-9);
      for (let index = 1; index <= 3; index++) {
        const planet = partPose(`Planet Gear ${index}`, angle);
        expect(Math.abs(24 * (planet.rotation - carrier) + 24 * (sun - carrier)), 'Sun/planet meshing').toBeLessThan(
          1e-9,
        );
        expect(Math.hypot(planet.x, planet.y), 'Pitch centre stays on the carrier').toBeCloseTo(48, 9);
        expect(partPose(`Flanged Bushing ${index}`, angle)).toEqual(planet);
        expect(partPose(`Front Socket Screw ${index}`, angle).rotation).toBe(carrier);
      }
    }
  });
});

describe('assembly order', () => {
  it('should assemble from the rear carrier to the screws, exploding without overlap', () => {
    expect(assemblyStep('Carrier Rear')).toBe(0);
    expect(assemblyStep('Planet Pin 1')).toBeLessThan(assemblyStep('Planet Gear 1'));
    expect(assemblyStep('Planet Gear 1')).toBeLessThan(assemblyStep('Carrier Front And Output Hub'));
    expect(assemblyStep('Carrier Front And Output Hub')).toBeLessThan(assemblyStep('Front Socket Screw 1'));
    expect(assemblyStep('Unknown part')).toBe(assemblyStep('Rear Socket Screw 1'));
    expect(explodeLift('Carrier Rear')).toBe(0);
    expect(explodeLift('Planet Pin 1')).toBeGreaterThan(explodeLift('Rear Thrust Spacer 1'));
    expect(explodeLift('Sun Gear And Input Shaft')).toBeGreaterThan(explodeLift('Planet Gear 1'));
    expect(explodeLift('Internal Ring Gear')).toBeGreaterThan(explodeLift('Sun Gear And Input Shaft'));
    expect(explodeLift('Front Socket Screw 1')).toBeGreaterThan(explodeLift('Carrier Front And Output Hub'));
    expect(explodeLift('Rear Socket Screw 1')).toBeLessThan(explodeLift('Rear Screw Washer 1'));
    expect(explodeLift('Rear Screw Washer 1')).toBeLessThan(0);
  });

  it('should give each part one illustrative agent lane and print the ring gear', () => {
    expect(agentLane('Internal Ring Gear')).toBe(-1);
    expect(agentLane('Sun Gear And Input Shaft')).toBe(0);
    expect(agentLane('Flanged Bushing 2')).toBe(0);
    expect(agentLane('Front Socket Screw 1')).toBe(1);
    expect(printedPart.name).toBe('Internal Ring Gear');
  });
});

describe('geospecRun', () => {
  it('should keep the recorded summary consistent with its tests', () => {
    const count = (status: string) => geospecRun.tests.filter((test) => test.status === status).length;
    expect(geospecRun.summary).toMatchObject({
      passed: count('passed'),
      failed: count('failed'),
      inconclusive: count('inconclusive'),
    });
    expect(geospecRun.summary.selected).toBe(geospecRun.tests.length);
    expect(geospecRun.example).toBe('libs/tau-examples/src/kernels/replicad/planetary-gear-system');
  });
});
