// @vitest-environment jsdom
import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActorRefFrom } from 'xstate';
import type { Artifact } from '@taucad/runtime';
import { ModelViewer } from '#model-viewer.jsx';
import type { graphicsMachine } from '#machines/graphics.machine.js';

type GraphicsRef = ActorRefFrom<typeof graphicsMachine>;

/** Every graphics actor the viewer handed its provider, in render order. */
const provided = vi.hoisted(() => ({ references: [] as unknown[] }));

vi.mock('#hooks/use-graphics.jsx', () => ({
  GraphicsProvider: ({
    graphicsRef,
    children,
  }: {
    readonly graphicsRef: unknown;
    readonly children: React.ReactNode;
  }) => {
    provided.references.push(graphicsRef);
    return <div>{children}</div>;
  },
  useModelInteractionRef: () => undefined,
}));

vi.mock('#cad/cad-viewer.jsx', () => ({
  CadViewer: () => <div data-testid='cad-viewer' />,
}));

const artifact: Artifact = { mimeType: 'model/gltf-binary', content: new Uint8Array([1, 2, 3]) };

describe('ModelViewer standalone composition root', () => {
  it('should start one graphics actor that survives a StrictMode remount and stops on unmount', async () => {
    provided.references.length = 0;
    const view = render(
      <StrictMode>
        <ModelViewer artifact={artifact} artifactHash='abc' initialVerticalFieldOfView={30} />
      </StrictMode>,
    );

    const references = new Set(provided.references as GraphicsRef[]);
    expect(references.size).toBe(1);
    const [graphicsRef] = references;
    expect(graphicsRef!.getSnapshot().status).toBe('active');
    expect(graphicsRef!.getSnapshot().context.artifactKey).toBe('abc');
    // The camera is graphics' child, seeded once from the viewer's field of view.
    const camera = graphicsRef!.getSnapshot().context.cameraRef;
    expect(camera.getSnapshot().status).toBe('active');
    expect(camera.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(30);

    view.rerender(
      <StrictMode>
        <ModelViewer artifact={artifact} artifactHash='def' initialVerticalFieldOfView={30} />
      </StrictMode>,
    );
    expect(new Set(provided.references).size).toBe(1);
    expect(graphicsRef!.getSnapshot().context.artifactKey).toBe('def');

    view.unmount();
    await Promise.resolve();
    expect(graphicsRef!.getSnapshot().status).toBe('stopped');
  });
});
