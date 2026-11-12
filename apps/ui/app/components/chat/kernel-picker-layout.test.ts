import { describe, expect, it } from 'vitest';
import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelId } from '@taucad/types/constants';
import { kernelPickerLayout, kernelPillFace } from '#components/chat/kernel-picker-layout.js';
import type { KernelPickerGroup } from '#components/chat/kernel-picker-layout.js';

const webKernels = new Set<KernelId>([
  'replicad',
  'openscad',
  'picovoxel',
  'tscircuit',
  'opencascadejs',
  'smlib',
  'zoo',
  'manifold',
  'jscad',
]);
const everyKernel = new Set<KernelId>(kernelConfigurations.map(({ id }) => id));
const ids = (groups: readonly KernelPickerGroup[]): string[] =>
  groups.flatMap(({ items }) => items.map(({ id }) => id));
const names = (groups: readonly KernelPickerGroup[]): string[] => groups.map(({ name }) => name);

describe('kernelPickerLayout', () => {
  it('should show five rows before More on the web, under the D8 headings', () => {
    const { top, more } = kernelPickerLayout({
      host: 'web',
      withAuto: true,
      available: webKernels,
      isSupplierOpen: false,
    });

    expect(names(top)).toEqual(['Automatic', 'BRep', 'Mesh', 'Implicit', 'Electronics']);
    expect(ids(top)).toEqual(['auto', 'replicad', 'openscad', 'picovoxel', 'tscircuit']);
    expect(ids(more)).toEqual(['opencascadejs', 'smlib', 'zoo', 'build123d', 'smlibpy', 'manifold', 'jscad', 'picogk']);
  });

  it('should keep every catalog kernel reachable exactly once at both levels', () => {
    for (const host of ['web', 'desktop'] as const) {
      const { top, more } = kernelPickerLayout({ host, withAuto: false, available: everyKernel, isSupplierOpen: true });

      expect([...ids(top), ...ids(more)].toSorted()).toEqual([...everyKernel].toSorted());
    }
  });

  it('should move the native kernels to the desktop top level', () => {
    const { top, more } = kernelPickerLayout({
      host: 'desktop',
      withAuto: true,
      available: everyKernel,
      isSupplierOpen: false,
    });

    expect(ids(top)).toEqual([
      'auto',
      'replicad',
      'build123d',
      'smlibpy',
      'openscad',
      'picovoxel',
      'picogk',
      'tscircuit',
    ]);
    expect(ids(more)).toEqual(['opencascadejs', 'smlib', 'zoo', 'manifold', 'jscad']);
  });

  it('should keep a kernel that cannot run here, with its reason', () => {
    const { more } = kernelPickerLayout({ host: 'web', withAuto: true, available: webKernels, isSupplierOpen: false });
    const rows = more.flatMap(({ items }) => items);

    expect(rows.find(({ id }) => id === 'build123d')?.unavailable?.badge).toBe('Desktop');
    expect(rows.find(({ id }) => id === 'zoo')?.unavailable?.badge).toBe('Unavailable');
    expect(rows.find(({ id }) => id === 'jscad')?.unavailable).toBeUndefined();
  });

  it('should offer Zoo once its cloud engine is open, and PicoGK on the web once its browser assets ship', () => {
    const available = new Set<KernelId>([...webKernels, 'picogk']);
    const rows = kernelPickerLayout({ host: 'web', withAuto: true, available, isSupplierOpen: true }).more.flatMap(
      ({ items }) => items,
    );

    expect(rows.find(({ id }) => id === 'zoo')?.unavailable).toBeUndefined();
    expect(rows.find(({ id }) => id === 'picogk')?.unavailable).toBeUndefined();
  });

  it('should leave Auto out where there is no prompt to route on', () => {
    const { top } = kernelPickerLayout({ host: 'web', withAuto: false, available: webKernels, isSupplierOpen: false });

    expect(ids(top)).not.toContain('auto');
  });
});

describe('kernelPillFace', () => {
  it('should read Auto until a kernel binds, then Auto and the owner', () => {
    expect(kernelPillFace({ preference: 'auto' })).toMatchObject({
      glyph: 'auto',
      text: 'Auto',
      label: 'Kernel: Auto',
    });
    expect(kernelPillFace({ preference: 'auto', owner: 'replicad' })).toMatchObject({
      glyph: 'replicad',
      text: 'Auto · Replicad',
      label: 'Kernel: Auto, running Replicad',
      isMismatch: false,
    });
  });

  it('should mark a manual pick that differs from the owner and name both kernels', () => {
    const face = kernelPillFace({ preference: 'openscad', owner: 'replicad' });

    expect(face).toMatchObject({ glyph: 'openscad', text: 'OpenSCAD', isMismatch: true });
    expect(face.label).toContain('OpenSCAD');
    expect(face.label).toContain('Replicad');
    expect(kernelPillFace({ preference: 'replicad', owner: 'replicad' }).isMismatch).toBe(false);
  });
});
