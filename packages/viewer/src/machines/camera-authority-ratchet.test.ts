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
      // The camera is the graphics actor's `camera` child, so no session registry holds it (charter D5, I11; G12).
      'services/graphics-camera-registry.ts',
      // The kinematics drag is the kinematics actor's gesture around a callback adapter.
      'graphics/three/react/kinematics-drag-controls.ts',
      // Framing is the graphics actor's `framing` child (G5b).
      'graphics/three/use-camera-framing.ts',
      // The controls adapter steps camera-controls and the canvas presents the viewport (G7b).
      'graphics/three/controls/tau-camera-controls.tsx',
      // The view cube is a gesture machine around a callback adapter, its lock a state tag (G8).
      'graphics/three/controls/viewport-gizmo-controls-adapter.ts',
      'graphics/three/controls/viewport-gizmo-interaction-lock.tsx',
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
