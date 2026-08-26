import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(import.meta.dirname, '..');

describe('portable camera authority ratchet', () => {
  it('keeps superseded camera authorities deleted', () => {
    const deletedFiles = [
      'machines/camera-capability.machine.ts',
      'components/geometry/graphics/three/use-camera-reset.tsx',
      'components/geometry/graphics/three/utils/camera.utils.ts',
      'components/geometry/graphics/three/controls/viewport-gizmo-axes.tsx',
      'components/geometry/graphics/three/controls/viewport-gizmo-onshape.tsx',
    ];

    expect(deletedFiles.filter((path) => existsSync(resolve(appRoot, path)))).toEqual([]);
  });

  it('keeps camera snapshots out of graphics and controls-listener machines', () => {
    const sources = [
      readFileSync(resolve(appRoot, 'machines/graphics.machine.ts'), 'utf8'),
      readFileSync(resolve(appRoot, 'machines/controls-listener.machine.ts'), 'utf8'),
    ].join('\n');
    const deletedSymbols = [
      'cameraCapability',
      'cameraFovAngleComputed',
      'cameraPosition',
      'cameraState',
      'currentZoom',
      'isCameraReady',
      'registerCamera',
    ];

    expect(deletedSymbols.filter((symbol) => sources.includes(symbol))).toEqual([]);
  });
});
