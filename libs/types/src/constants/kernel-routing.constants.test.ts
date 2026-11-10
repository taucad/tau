import { describe, expect, it } from 'vitest';
import {
  isKernelId,
  isKernelPreference,
  kernelConfigurations,
  kernelPreferences,
} from '#constants/kernel.constants.js';
import type { KernelId } from '#constants/kernel.constants.js';
import {
  exactGeometryKernelIds,
  kernelRoutingCopy,
  kernelRoutingRules,
  kernelRoutingZones,
  kernelsReachedByNameOnly,
  implicitKernelIds,
} from '#constants/kernel-routing.constants.js';
import type { KernelRouting } from '#constants/kernel-routing.constants.js';

const zonedKernels = new Set<string>(kernelRoutingZones.flatMap(({ acceptable }) => acceptable));
const byNameOnly = new Set<string>(kernelsReachedByNameOnly);

describe('kernel routing facets', () => {
  it('should give every kernel one-line use and avoid copy that names no default', () => {
    for (const { id } of kernelConfigurations) {
      const routing: KernelRouting = kernelRoutingCopy[id];
      const lines: string[] = [routing.useWhen, routing.avoidWhen];
      if (routing.prerequisites !== undefined) {
        lines.push(routing.prerequisites);
      }
      for (const line of lines) {
        expect(line.trim(), id).not.toBe('');
        expect(line, id).not.toContain('\n');
        expect(line, `${id} names a default`).not.toMatch(/\bdefault\b/iu);
      }
    }
  });

  it('should mark exactly the analytic-STEP kernels as exact geometry (D5 rule 4)', () => {
    expect([...exactGeometryKernelIds].sort()).toEqual(
      ['build123d', 'opencascadejs', 'replicad', 'smlib', 'smlibpy', 'zoo'].sort(),
    );
  });

  it('should group PicoGK and PicoVoxel as the voxel family (D5 rule 7)', () => {
    expect([...implicitKernelIds].sort()).toEqual(['picogk', 'picovoxel']);
  });
});

describe('kernel routing rules and zones', () => {
  it('should name only catalog kernels', () => {
    const named = [
      ...kernelRoutingRules.flatMap(({ outcomes }) => outcomes.flatMap(({ kernels }) => kernels)),
      ...kernelRoutingZones.flatMap(({ acceptable, preferred }) => [
        ...acceptable,
        ...preferred.flatMap(({ kernels }) => kernels),
      ]),
      ...kernelsReachedByNameOnly,
    ];
    expect(named.filter((id: string) => !isKernelId(id))).toEqual([]);
  });

  it('should place every kernel in a zone or mark it reached by name only, never both', () => {
    const unplaced = kernelConfigurations.filter(({ id }) => !zonedKernels.has(id) && !byNameOnly.has(id));
    expect(unplaced.map(({ id }) => id)).toEqual([]);
    expect(kernelsReachedByNameOnly.filter((id) => zonedKernels.has(id))).toEqual([]);
  });

  it('should prefer only acceptable kernels', () => {
    for (const { id, acceptable, preferred } of kernelRoutingZones) {
      const set = new Set<KernelId>(acceptable);
      expect(
        preferred.flatMap(({ kernels }) => kernels).filter((kernel) => !set.has(kernel)),
        id,
      ).toEqual([]);
    }
  });

  it('should leave tier 3 empty and tie every narrow zone to a rule', () => {
    for (const zone of kernelRoutingZones) {
      expect(zone.acceptable.length === 0, zone.id).toBe(zone.tier === 'none');
      if (zone.tier === 'narrow') {
        expect(zone.rules.length, zone.id).toBeGreaterThan(0);
      }
    }
  });

  it('should apply the seven narrow rules in the D5 order', () => {
    expect(kernelRoutingRules.map(({ id }) => id)).toEqual([
      'ownership',
      'entitlement',
      'explicit-request',
      'required-output',
      'required-input',
      'process',
      'representation',
    ]);
  });

  it('should keep computational engineering voxel-only (E15)', () => {
    const u8 = kernelRoutingZones.find(({ id }) => id === 'U8');
    expect([...(u8?.acceptable ?? [])].sort()).toEqual([...implicitKernelIds].sort());
  });
});

describe('kernel preference', () => {
  it('should admit auto and every kernel, and nothing else', () => {
    expect(kernelPreferences).toEqual(['auto', ...kernelConfigurations.map(({ id }) => id)]);
    expect(isKernelPreference('auto')).toBe(true);
    expect(isKernelPreference('replicad')).toBe(true);
    expect(isKernelPreference('Auto')).toBe(false);
    expect(isKernelId('auto')).toBe(false);
  });
});
