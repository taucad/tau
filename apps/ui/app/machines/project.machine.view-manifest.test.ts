/*
 * G11b characterisation: how the project decides that a unit's shared manifest is no longer presented, as it runs
 * today by reading every view's graphics snapshot (`reconcileViewManifest`). The presentation actor (G11b) tells the
 * project which unit each view presents instead (`presentedUnitChanged`); these rows are what it must keep.
 */
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor } from 'xstate';
import type { GeometryComponentManifest } from '@taucad/types';
import { createProjectFixture } from '@taucad/ui-core/lib/project.fixture';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import { getModelInteractionUnitState } from '@taucad/viewer/machines/model-interaction.machine';
import { projectMachine } from '#machines/project.machine.js';
import type { ProjectContext, ProjectLoadInput, ProjectRetrievedEvent } from '#machines/project.machine.js';
import type { KernelOptionsFactory, LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';

vi.mock('#constants/browser.constants.js', () => ({
  isBrowser: true,
}));

const createKernelOptionsFactory = (): LazyKernelOptionsFactory => async () => () =>
  mock<ReturnType<KernelOptionsFactory>>({
    config: { tauApiUrl: 'https://api.test', tauWebSocketUrl: 'wss://api.test' },
  });

const createProjectActor = () =>
  createActor(
    projectMachine.provide({
      actors: {
        loadProjectActor: fromSafeAsync<ProjectRetrievedEvent, ProjectLoadInput>(async () => ({
          type: 'projectRetrieved',
          project: createProjectFixture({
            id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
            name: 'Test Project',
            assets: { main: { entryPath: 'main.ts' } },
          }),
        })),
      },
      guards: { isNotBrowser: () => false, shouldAutoLoad: () => false },
    }),
    {
      input: {
        projectId: 'test-project',
        shouldLoadModelOnStart: false,
        fileManagerRef: mock<ProjectContext['fileManagerRef']>({ send: vi.fn() }),
        fileSystemRoot: '/previews/test-project',
        kernelOptionsFactory: createKernelOptionsFactory(),
      },
    },
  );

const capabilities = {
  canAdjustOpacity: false,
  canFocus: false,
  canHide: false,
  canIsolate: false,
  exports: [],
  hasDrawings: false,
  hasPreciseTopology: false,
};

const manifest: GeometryComponentManifest = {
  schemaVersion: 1,
  rootId: 'root',
  nodeOrder: ['root'],
  nodesById: {
    root: {
      id: 'root',
      selector: 'root',
      name: 'Model',
      kind: 'model',
      depth: 0,
      childIds: [],
      meshNodeIndices: [],
      primitiveIndices: [],
      materialIndices: [],
      path: ['Model'],
      capabilities,
    },
  },
  capabilities,
};

const gltf = (): { mimeType: 'model/gltf-binary'; content: Uint8Array<ArrayBuffer> } => ({
  mimeType: 'model/gltf-binary',
  content: new TextEncoder().encode('{}'),
});

type ProjectActor = ReturnType<typeof createProjectActor>;

/** Open a view and present `unitId` in it, as GltfMesh's commit does. */
function presentInView(project: ProjectActor, viewId: string, unitId: string): void {
  project.send({ type: 'createViewGraphics', viewId });
  const graphics = project.getSnapshot().context.viewGraphics.get(viewId)!;
  graphics.send({ type: 'updateArtifact', artifact: gltf(), hash: unitId });
  const { requestedRevision } = graphics.getSnapshot().context.gltfPresentation;
  graphics.send({ type: 'gltfPresentationCommitted', revision: requestedRevision, key: unitId, unitId, manifest });
}

const manifestOf = (project: ProjectActor, unitId: string): GeometryComponentManifest | undefined =>
  getModelInteractionUnitState(project.getSnapshot().context.modelInteractionRef.getSnapshot().context, unitId)
    .manifest;

describe('project view manifest reconciliation (G11b characterisation)', () => {
  it('clears the manifest of a unit when the last view presenting it closes', () => {
    const project = createProjectActor().start();
    try {
      presentInView(project, 'v1', 'unit:a');
      expect(manifestOf(project, 'unit:a')).toBe(manifest);

      project.send({ type: 'destroyViewGraphics', viewId: 'v1' });
      expect(manifestOf(project, 'unit:a')).toBeUndefined();
    } finally {
      project.stop();
    }
  });

  it('keeps the manifest of a unit while another view still presents it', () => {
    const project = createProjectActor().start();
    try {
      presentInView(project, 'v1', 'unit:a');
      presentInView(project, 'v2', 'unit:a');

      project.send({ type: 'destroyViewGraphics', viewId: 'v1' });
      expect(manifestOf(project, 'unit:a')).toBe(manifest);
    } finally {
      project.stop();
    }
  });

  it('clears the manifest on request once the view that presented it shows something else', () => {
    const project = createProjectActor().start();
    try {
      presentInView(project, 'v1', 'unit:a');
      const graphics = project.getSnapshot().context.viewGraphics.get('v1')!;

      // Still presented: the request keeps it.
      project.send({ type: 'reconcileViewManifest', unitId: 'unit:a' });
      expect(manifestOf(project, 'unit:a')).toBe(manifest);

      graphics.send({ type: 'clearArtifact' });
      project.send({ type: 'reconcileViewManifest', unitId: 'unit:a' });
      expect(manifestOf(project, 'unit:a')).toBeUndefined();
    } finally {
      project.stop();
    }
  });

  it('does not count a view whose newer artifact is still preparing as presenting a new unit', () => {
    const project = createProjectActor().start();
    try {
      presentInView(project, 'v1', 'unit:a');
      presentInView(project, 'v2', 'unit:b');
      const v1 = project.getSnapshot().context.viewGraphics.get('v1')!;
      // The first view asks for unit:b, but unit:a stays on screen until that commit lands.
      v1.send({ type: 'updateArtifact', artifact: gltf(), hash: 'unit:b' });

      project.send({ type: 'destroyViewGraphics', viewId: 'v2' });
      project.send({ type: 'reconcileViewManifest', unitId: 'unit:a' });
      expect(manifestOf(project, 'unit:a')).toBe(manifest);
      expect(manifestOf(project, 'unit:b')).toBeUndefined();
    } finally {
      project.stop();
    }
  });
});
