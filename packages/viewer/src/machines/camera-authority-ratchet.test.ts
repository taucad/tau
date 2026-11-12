import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(import.meta.dirname, '..');

describe('portable camera authority ratchet', () => {
  it('keeps superseded camera authorities deleted', () => {
    const deletedFiles = [
      'machines/camera-capability.machine.ts',
      'graphics/three/use-camera-reset.tsx',
      'graphics/three/utils/camera.utils.ts',
      'graphics/three/controls/viewport-gizmo-axes.tsx',
      'graphics/three/controls/viewport-gizmo-onshape.tsx',
      // The controls adapter is the one `camera-controls` listener (charter I9).
      'graphics/three/actor-bridge.tsx',
      'graphics/three/controls-listener-bridge.tsx',
      'graphics/three/up-direction-handler.tsx',
      'machines/controls-listener.machine.ts',
    ];

    expect(deletedFiles.filter((path) => existsSync(resolve(sourceRoot, path)))).toEqual([]);
  });

  it('keeps camera snapshots out of the graphics machine', () => {
    const sources = readFileSync(resolve(sourceRoot, 'machines/graphics.machine.ts'), 'utf8');
    const deletedSymbols = [
      'cameraCapability',
      'cameraInteracting',
      'cameraInteractionHadMovement',
      'controlsInteraction',
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
