/*
 * The presentation half of graphics, for GltfMesh rows that mock graphics: a real presentation actor spawns the mesh's
 * host and hands it each request, as graphics does, while every other event reaches the row's mocked `send`.
 */
import { useEffect } from 'react';
import type { ComponentProps, ComponentType } from 'react';
import { createActor } from 'xstate';
import type { Actor } from 'xstate';
import { presentationMachine } from '#machines/presentation.machine.js';
import type { PresentationRequest } from '#machines/presentation.machine.js';
import type { GraphicsEvent } from '#machines/graphics.machine.js';
import type { GltfMesh as GltfMeshComponent } from '#graphics/three/react/gltf-mesh.jsx';

type GltfMeshProperties = ComponentProps<typeof GltfMeshComponent>;

/**
 * A row's GltfMesh props: the request graphics would send (its bytes, revision and key) beside the mesh's own.
 *
 * @public
 */
export type GltfMeshRequestProperties = GltfMeshProperties &
  Readonly<{ gltfFile: Uint8Array<ArrayBuffer>; presentationRevision?: number }>;

type GraphicsSend = (event: GraphicsEvent) => void;

/**
 * The presentation half of graphics for one test file.
 *
 * @public
 */
export type GltfMeshPresentationHarness = Readonly<{
  /** What `useGraphics` returns: host hand-overs reach the presentation, every other event the row's mock. */
  graphics: Readonly<{ send: GraphicsSend; getSnapshot: () => unknown }>;
  /** GltfMesh as a row renders it: a change of request is sent to the presentation, as graphics would. */
  GltfMesh: ComponentType<GltfMeshRequestProperties>;
  /** Sends a request straight to the presentation, as graphics does, with no React render first. */
  present: (request: PresentationRequest) => void;
  /** A fresh presentation for the next row; call after `cleanup()`. */
  reset: () => void;
}>;

/**
 * Builds the presentation half of graphics around a row's mocked graphics actor.
 *
 * @param options - The mocked graphics actor, the real GltfMesh and the unit id derivation the rows mock.
 * @returns The harness.
 * @public
 */
export function createGltfMeshPresentationHarness({
  graphicsActor,
  GltfMesh,
  deriveUnitId,
}: Readonly<{
  graphicsActor: Readonly<{ send: GraphicsSend; getSnapshot: () => unknown }>;
  GltfMesh: typeof GltfMeshComponent;
  deriveUnitId: (input: Readonly<{ sourceFile?: string; geometryHash?: string }>) => string;
}>): GltfMeshPresentationHarness {
  const state: { presentation: Actor<typeof presentationMachine> } = {
    presentation: createActor(presentationMachine),
  };
  state.presentation.start();

  const graphics = {
    send: (event: GraphicsEvent): void => {
      switch (event.type) {
        case 'presentationHostAttached': {
          state.presentation.send({ type: 'hostAttached', hostId: event.hostId, host: event.host });
          return;
        }
        case 'presentationHostDetached': {
          state.presentation.send({ type: 'hostDetached', hostId: event.hostId });
          return;
        }
        default: {
          graphicsActor.send(event);
        }
      }
    },
    getSnapshot: () => graphicsActor.getSnapshot(),
  };

  function RequestedGltfMesh({
    gltfFile,
    presentationRevision = 0,
    ...properties
  }: GltfMeshRequestProperties): React.JSX.Element {
    const { geometryHash, sourceFile } = properties;
    // Graphics sends a request when the artifact changes; a row's props stand in for that artifact.
    useEffect(() => {
      state.presentation.send({
        type: 'present',
        request: {
          revision: presentationRevision,
          key: geometryHash ?? '',
          unitId: deriveUnitId({ sourceFile, geometryHash }),
          sourceFile,
          bytes: gltfFile,
        },
      });
    }, [geometryHash, gltfFile, presentationRevision, sourceFile]);
    return <GltfMesh {...properties} />;
  }

  return {
    graphics,
    GltfMesh: RequestedGltfMesh,
    present: (request) => {
      state.presentation.send({ type: 'present', request });
    },
    reset: () => {
      state.presentation.stop();
      state.presentation = createActor(presentationMachine);
      state.presentation.start();
    },
  };
}
