import { describe, expect, it } from 'vitest';

import {
  buildCaptureExportOptions,
  canonicalCaptureViews,
  describeCaptureSection,
  resolveCaptureSectionKeep,
} from '#capture/capture-views.js';

/* The literals the three call sites carried before this module existed
 * (`apps/ui/app/workers/agent-host.impl.ts`, `packages/host/src/agent-tools.ts`,
 * `apps/ui/app/services/retained-workspace-rpc-handler.ts`). A capture is only
 * host-neutral if the recipe is byte-identical, so the previous literals are
 * pinned here rather than described. */
const previousCommon = {
  width: 1600,
  height: 1600,
  lineWidth: 3,
  background: '#242424',
  world: { up: '+z', forward: '-y', unit: 'meter' },
  axes: true,
  scaleBar: true,
};

const previousMultiAngle = {
  ...previousCommon,
  mode: 'batch',
  views: [
    { id: 'front', label: 'Front — View From −Y', direction: [0, -1, 0], up: [0, 0, 1] },
    { id: 'back', label: 'Back — View From +Y', direction: [0, 1, 0], up: [0, 0, 1] },
    { id: 'right', label: 'Right — View From +X', direction: [1, 0, 0], up: [0, 0, 1] },
    { id: 'left', label: 'Left — View From −X', direction: [-1, 0, 0], up: [0, 0, 1] },
    { id: 'top', label: 'Top — View From +Z', direction: [0, 0, 1], up: [0, 1, 0] },
    { id: 'bottom', label: 'Bottom — View From −Z', direction: [0, 0, -1], up: [0, 1, 0] },
  ].map((view) => ({
    id: view.id,
    label: view.label,
    camera: {
      framing: 'bounds',
      direction: view.direction,
      up: view.up,
      margin: 0.1,
      projection: { kind: 'orthographic' },
    },
  })),
  quality: 1,
};

const previousSingle = {
  ...previousCommon,
  mode: 'single',
  camera: {
    framing: 'bounds',
    direction: [0.6123724357, -0.6123724357, 0.5],
    up: [0, 0, 1],
    margin: 0.1,
    projection: { kind: 'perspective', verticalFieldOfView: 45 },
  },
  quality: 1,
};

describe('buildCaptureExportOptions', () => {
  it('reproduces the previous multi-angle literal exactly', () => {
    expect(buildCaptureExportOptions({ mode: 'multi_angle', size: 1600 })).toStrictEqual(previousMultiAngle);
  });

  it('reproduces the previous single-view literal exactly', () => {
    expect(buildCaptureExportOptions({ mode: 'single', size: 1600 })).toStrictEqual(previousSingle);
  });

  it('drops line rendering only when edges are explicitly disabled', () => {
    expect(buildCaptureExportOptions({ mode: 'single', size: 1600, includeEdges: false })).toMatchObject({
      lines: false,
    });
    expect(buildCaptureExportOptions({ mode: 'single', size: 1600, includeEdges: true })).not.toHaveProperty('lines');
    expect(buildCaptureExportOptions({ mode: 'single', size: 1600 })).not.toHaveProperty('lines');
  });

  it('exposes the six canonical views in their canonical order', () => {
    expect(canonicalCaptureViews.map((view) => view.id)).toStrictEqual([
      'front',
      'back',
      'right',
      'left',
      'top',
      'bottom',
    ]);
  });
});

describe('capture sections', () => {
  it.each([
    // The single camera looks from +X, -Y, +Z, so each default keeps the half whose cut face looks at it.
    {
      section: { plane: 'xy', offsetMm: 6 },
      keep: 'negative',
      plane: { point: [0, 0, 0.006], normal: [0, 0, -1] },
      kept: 'kept z ≤ 6 mm',
    },
    {
      section: { plane: 'xz', offsetMm: -12.5 },
      keep: 'positive',
      plane: { point: [0, -0.0125, 0], normal: [0, 1, 0] },
      kept: 'kept y ≥ -12.5 mm',
    },
    {
      section: { plane: 'yz', offsetMm: 40 },
      keep: 'negative',
      plane: { point: [0.04, 0, 0], normal: [-1, 0, 0] },
      kept: 'kept x ≤ 40 mm',
    },
    {
      section: { plane: 'xy', offsetMm: 194, keep: 'positive' },
      keep: 'positive',
      plane: { point: [0, 0, 0.194], normal: [0, 0, 1] },
      kept: 'kept z ≥ 194 mm',
    },
  ] as const)(
    'maps $section.plane at $section.offsetMm mm to one retained half-space',
    ({ section, keep, plane, kept }) => {
      expect(resolveCaptureSectionKeep(section)).toBe(keep);
      expect(describeCaptureSection(section)).toContain(kept);
      for (const mode of ['single', 'multi_angle'] as const) {
        expect(buildCaptureExportOptions({ mode, size: 1600, section })).toMatchObject({
          sections: { planes: [plane] },
        });
      }
    },
  );

  it('adds no section to an uncut capture', () => {
    expect(buildCaptureExportOptions({ mode: 'single', size: 1600 })).not.toHaveProperty('sections');
  });
});
