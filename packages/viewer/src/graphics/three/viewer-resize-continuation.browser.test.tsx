import '#test/browser.css';
import { cleanup, render } from '@testing-library/react';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { GraphicsProvider } from '#hooks/use-graphics.jsx';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { ThreeCanvasInstance } from '#graphics/three/three-canvas-instance.jsx';

const actors: Array<{ stop: () => void }> = [];

afterEach(() => {
  cleanup();
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
});

describe('viewer resize demand-frame continuation', () => {
  it('should finish a visible animation invalidated from the prepaint resize frame', async () => {
    await page.viewport(1280, 800);
    const actor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      { input: {} },
    ).start();
    actors.push(actor);
    let renderedWidth = 0;
    let renderedAngle = 0;
    let animationSteps = 0;
    let targetWidth = 0;

    function AnimatedMesh(): React.JSX.Element {
      const meshRef = useRef<Mesh>(null);
      useFrame((state) => {
        if (state.size.width !== targetWidth || animationSteps >= 8 || !meshRef.current) {
          return;
        }
        animationSteps += 1;
        meshRef.current.rotation.y = animationSteps / 10;
        if (animationSteps < 8) {
          // Controls damping and gizmo motion also request their next frame here.
          state.invalidate();
        }
      }, -1);
      useFrame((state) => {
        renderedWidth = state.size.width;
        renderedAngle = meshRef.current?.rotation.y ?? 0;
      }, 4);
      return (
        <mesh ref={meshRef}>
          <boxGeometry />
          <meshStandardMaterial />
        </mesh>
      );
    }

    const view = render(
      <div data-testid='animated-viewer' style={{ width: 900, height: 550 }}>
        <GraphicsProvider graphicsRef={actor}>
          <ThreeCanvasInstance graphicsBackend='webgl' onRetry={() => undefined}>
            <AnimatedMesh />
          </ThreeCanvasInstance>
        </GraphicsProvider>
      </div>,
    );
    await vi.waitFor(
      () => {
        expect(renderedWidth).toBe(900);
      },
      { timeout: 45_000 },
    );
    targetWidth = 640;
    view.getByTestId('animated-viewer').style.width = `${targetWidth}px`;

    await vi.waitFor(() => {
      expect(renderedAngle).toBe(0.8);
    });
    expect(renderedWidth).toBe(targetWidth);
    expect(animationSteps).toBe(8);
  });
});
