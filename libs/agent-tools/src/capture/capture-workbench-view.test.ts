import { describe, expect, it } from 'vitest';
import type { CaptureWorkbenchView } from '@taucad/chat/rpc';

import { buildCaptureExportOptions } from '#capture/capture-views.js';
import { workbenchViewCamera, workbenchViewSections } from '#capture/capture-workbench-view.js';

const display = {
  surfaces: true,
  lines: true,
  gizmo: true,
  grid: true,
  axes: true,
  matcap: false,
  postProcessing: false,
};
const viewOf = (overrides: Partial<CaptureWorkbenchView> = {}): CaptureWorkbenchView => ({
  id: 'front-cut',
  camera: { kind: 'preset', preset: 'isometric' },
  fieldOfView: 60,
  upDirection: 'z',
  display,
  section: { active: false, cuts: [] },
  ...overrides,
});

describe('workbenchViewCamera', () => {
  it('should frame a preset from its canonical side, orthographic at field of view 0', () => {
    expect(workbenchViewCamera(viewOf({ camera: { kind: 'preset', preset: 'front' }, fieldOfView: 0 }))).toStrictEqual({
      status: 'camera',
      camera: {
        framing: 'bounds',
        direction: [0, -1, 0],
        up: [0, 0, 1],
        margin: 0.1,
        projection: { kind: 'orthographic' },
      },
      label: 'front preset',
    });
  });

  it("should take a look's up, or the view's up axis, or +Y when the look is parallel to it", () => {
    const up = (camera: CaptureWorkbenchView['camera'], upDirection: CaptureWorkbenchView['upDirection'] = 'z') => {
      const resolved = workbenchViewCamera(viewOf({ camera, upDirection }));
      return resolved.status === 'camera' && resolved.camera.framing === 'bounds' ? resolved.camera.up : undefined;
    };
    expect(up({ kind: 'look', direction: [1, 1, 0], up: [1, 0, 0] })).toStrictEqual([1, 0, 0]);
    expect(up({ kind: 'look', direction: [1, 1, 0] }, 'x')).toStrictEqual([1, 0, 0]);
    expect(up({ kind: 'look', direction: [0, 0, 3] })).toStrictEqual([0, 1, 0]);
  });

  it('should place a saved pose where its span fills the frame, at its zoom', () => {
    const resolved = workbenchViewCamera(
      viewOf({
        camera: {
          kind: 'pose',
          frameId: 'tau:root',
          target: [0, 0, 0.01],
          direction: [0, -2, 0],
          up: [0, 0, 1],
          verticalSpan: 0.1,
          perspectiveZoom: 2,
        },
        fieldOfView: 90,
      }),
    );
    expect(resolved).toMatchObject({
      status: 'camera',
      camera: {
        framing: 'fixed',
        target: [0, 0, 0.01],
        up: [0, 0, 1],
        projection: { kind: 'perspective', verticalFieldOfView: 90, zoom: 2 },
      },
    });
    const position =
      resolved.status === 'camera' && resolved.camera.framing === 'fixed' ? resolved.camera.position : [];
    expect(position[0]).toBeCloseTo(0);
    expect(position[1]).toBeCloseTo(-0.1);
    expect(position[2]).toBeCloseTo(0.01);
  });

  it('should refuse a pose stored in another frame', () => {
    expect(
      workbenchViewCamera(
        viewOf({
          camera: {
            kind: 'pose',
            frameId: 'assembly',
            target: [0, 0, 0],
            direction: [0, -1, 0],
            up: [0, 0, 1],
            verticalSpan: 1,
            perspectiveZoom: 1,
          },
        }),
      ),
    ).toMatchObject({ status: 'refused', message: expect.stringContaining('frame assembly') as string });
  });
});

describe('workbenchViewSections', () => {
  it("should keep the side a plane cut does not remove, as the viewer's section tool does", () => {
    expect(
      workbenchViewSections(
        viewOf({
          section: {
            active: true,
            cuts: [
              { kind: 'plane', plane: 'xz', offset: 0.006, isFlipped: false },
              { kind: 'plane', plane: 'xy', offset: -0.01, isFlipped: true },
            ],
          },
        }),
      ),
    ).toStrictEqual({
      status: 'sections',
      planes: [
        { point: [0, 0.006, 0], normal: [0, -1, 0] },
        { point: [0, 0, -0.01], normal: [0, 0, 1] },
      ],
      description: 'Section: kept y ≤ 0.006 m and z ≥ -0.01 m; the cut faces are capped.',
    });
  });

  it('should draw no cut when the section is off, and refuse a revolution cut', () => {
    const cuts: CaptureWorkbenchView['section']['cuts'] = [
      { kind: 'revolution', axis: 'z', origin: [0, 0, 0], start: 0, sweep: 90 },
    ];
    expect(workbenchViewSections(viewOf({ section: { active: false, cuts } }))).toMatchObject({
      planes: [],
    });
    expect(workbenchViewSections(viewOf({ section: { active: true, cuts } }))).toMatchObject({
      status: 'refused',
    });
  });
});

describe('buildCaptureExportOptions with a workbench view', () => {
  it("should capture one image from the view's camera with its cuts and display, and let includeEdges override lines", () => {
    const camera = {
      framing: 'bounds',
      direction: [0, -1, 0],
      up: [0, 0, 1],
      margin: 0.1,
      projection: { kind: 'orthographic' },
    } as const;
    const planes = [{ point: [0, 0.006, 0], normal: [0, -1, 0] }] as const;
    const workbench = { camera, planes, display: { surfaces: true, lines: false, gizmo: false } };

    expect(buildCaptureExportOptions({ mode: 'single', size: 1600, workbench })).toStrictEqual({
      width: 1600,
      height: 1600,
      lineWidth: 3,
      background: '#242424',
      lines: false,
      world: { up: '+z', forward: '-y', unit: 'meter' },
      axes: false,
      scaleBar: true,
      sections: { planes: [...planes] },
      mode: 'single',
      camera,
      quality: 1,
    });
    expect(buildCaptureExportOptions({ mode: 'single', size: 1600, includeEdges: true, workbench })).not.toHaveProperty(
      'lines',
    );
  });
});
