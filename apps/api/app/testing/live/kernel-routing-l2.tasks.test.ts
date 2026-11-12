import { describe, expect, it } from 'vitest';
import { kernelRoutingZones } from '@taucad/types/constants';
import type { KernelId } from '@taucad/types/constants';
import { kernelRoutingRoutingCases } from '#testing/live/kernel-routing.cases.js';
import { l2Kernels, l2Tasks, renderL2Oracle } from '#testing/live/kernel-routing-l2.tasks.js';

describe('l2Tasks', () => {
  it('should hold eight tasks, two of them computational engineering (Appendix E)', () => {
    expect(l2Tasks).toHaveLength(8);
    expect(l2Tasks.filter(({ family }) => family === 'U8')).toHaveLength(2);
    expect(new Set(l2Tasks.map(({ id }) => id)).size).toBe(8);
  });

  it('should exclude Zoo (Appendix F)', () => {
    expect(l2Kernels).not.toContain('zoo');
    for (const task of l2Tasks) {
      expect(task.acceptable).not.toContain('zoo');
      expect(task.reference.kernel).not.toBe('zoo');
    }
  });

  it("should take each task's acceptable set from its routing zone, and write its reference in one of them", () => {
    for (const task of l2Tasks) {
      const zoneAcceptable: readonly KernelId[] =
        kernelRoutingZones.find(({ id }) => id === task.family)?.acceptable ?? [];
      expect(task.acceptable.length).toBeGreaterThan(0);
      expect(task.acceptable.every((id) => zoneAcceptable.includes(id))).toBe(true);
      expect(task.acceptable).toContain(task.reference.kernel);
      expect(task.wrong.kernel).toBe(task.reference.kernel);
    }
  });

  it('should share no prompt with the development corpus', () => {
    const prompts = new Set(kernelRoutingRoutingCases.map(({ prompt }) => prompt));
    expect(l2Tasks.filter(({ prompt }) => prompts.has(prompt))).toEqual([]);
  });

  it('should keep the labels out of the prompt', () => {
    for (const task of l2Tasks) {
      expect(task.prompt).not.toMatch(/geospec|oracle|acceptable|kernel/iu);
    }
  });
});

describe('renderL2Oracle', () => {
  it('should load the entry and give each claim its own test', () => {
    const task = l2Tasks.find(({ id }) => id === 'l2-u1-spacer')!;
    const source = renderL2Oracle({ id: task.id, oracle: task.oracle, entryPath: 'part.scad' });
    expect(source).toContain(`loadModel({ file: "part.scad" })`);
    expect(source).toContain('toHaveBoundingBox({"size":{"x":20,"y":20,"z":10},"tolerance":0.3})');
    expect(source).toContain('toHaveVolume({"value":2587,"relativeTolerance":0.04})');
    expect(source.match(/\bit\(/gu)).toHaveLength(4);
  });

  it('should leave out the claims a task does not make', () => {
    const task = l2Tasks.find(({ id }) => id === 'l2-u8-gyroid-core')!;
    const source = renderL2Oracle({ id: task.id, oracle: task.oracle, entryPath: 'main.ts' });
    expect(source).not.toContain('toHaveConnectedComponents');
    expect(source).not.toContain('toBeWatertight');
    expect(source.match(/\bit\(/gu)).toHaveLength(2);
  });
});
