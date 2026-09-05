import { describe, expect, it } from 'vitest';

import { buildCaptureExportOptions, canonicalCaptureViews } from '#capture/capture-views.js';

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
    direction: [0.612_372_435_7, -0.612_372_435_7, 0.5],
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
