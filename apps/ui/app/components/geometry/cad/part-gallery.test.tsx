// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { Actor, ActorRefFrom, SnapshotFrom } from 'xstate';
import { mock } from 'vitest-mock-extended';
import { writeGlb } from '@taucad/geometry-core';
import { contentDigest } from '@taucad/cache-core';
import { tauCadTopologyExtension } from '@taucad/types/constants';
import { publishedPartRecordSchema } from '@taucad/runtime/types';
import type { AdmittedAssembly, PublishedAssembly } from '@taucad/runtime/types';
import { createMockRuntimeClient, createMockRuntimeDocument } from '@taucad/runtime-testing';
import { cadMachine, selectCadDisplay } from '#machines/cad.machine.js';
import type { CadAssemblyDisplay, CadContext } from '#machines/cad.machine.js';
import type { GraphicsContext, graphicsMachine } from '#machines/graphics.machine.js';
import type { useProject } from '#hooks/use-project.js';
import { canonicalPartPreviews } from '#services/part-thumbnail-visual.js';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import { createSourceModelInteractionUnitId, modelInteractionMachine } from '#machines/model-interaction.machine.js';
import { PartThumbnailService } from '#services/part-thumbnail.service.js';
import type { PartThumbnailState } from '#services/part-thumbnail.service.js';
import { HeadlessImageService } from '#services/headless-image.service.js';
import type { imageRuntime } from '#runtime/image-runtime.definition.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import * as headlessImageDebug from '#services/headless-image-debug.js';
import * as hashUtils from '@taucad/utils/hash';
import { PartGalleryProvider, useOpenPartGallery } from '#components/geometry/cad/part-gallery.js';
import type { PartGalleryRequest } from '#components/geometry/cad/part-gallery.js';

const service = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { snapshot: new Map<string, PartThumbnailState>() };
  return {
    state,
    listeners,
    requestForOwner: vi.fn<PartThumbnailService['requestForOwner']>(),
    releaseOwner: vi.fn<PartThumbnailService['releaseOwner']>(),
    failPreparationForOwner: vi.fn<PartThumbnailService['failPreparationForOwner']>(),
    announcePresentedSource: vi.fn<PartThumbnailService['announcePresentedSource']>(),
    publish(next: Map<string, PartThumbnailState>) {
      state.snapshot = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
});

vi.mock('#providers/part-thumbnail-provider.js', () => {
  const instance = {
    subscribe: (listener: () => void) => {
      service.listeners.add(listener);
      return () => service.listeners.delete(listener);
    },
    snapshot: () => service.state.snapshot,
    requestForOwner: service.requestForOwner,
    releaseOwner: service.releaseOwner,
    failPreparationForOwner: service.failPreparationForOwner,
    announcePresentedSource: service.announcePresentedSource,
  };
  return { useOptionalPartThumbnailService: () => instance };
});

const debug = vi.hoisted(() => ({ enabled: false }));
vi.mock('#environment.config.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the actual environment facade flag.
  ENV: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the actual environment facade flag.
    get TAU_DEBUG(): boolean {
      return debug.enabled;
    },
  },
}));

const project = vi.hoisted(() => {
  const state: { current: ReturnType<typeof useProject> } = { current: undefined };
  return state;
});
vi.mock('#hooks/use-project.js', () => ({ useProject: () => project.current }));

vi.mock('#services/part-thumbnail-visual.js', () => ({
  sourceGlbDigest: async () => 'sha256:source',
  canonicalPartPreviews: vi.fn<typeof canonicalPartPreviews>(async (_content, parts) => ({
    visualKey: 'visual',
    previews: parts.map((_, index) => ({ key: `visual-${index}` })),
    renderContent: undefined,
  })),
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useOptionalFileManager: () => undefined,
}));

vi.mock('@taucad/ui/components/carousel', async () => {
  const ReactModule = await import('react');
  const passthrough = (name: string) =>
    ReactModule.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & { opts?: unknown; setApi?: unknown }>(
      function Passthrough({ children, opts: _options, setApi: _setApi, ...properties }, reference) {
        return (
          <div ref={reference} data-mock={name} {...properties}>
            {children}
          </div>
        );
      },
    );
  return {
    Carousel: passthrough('carousel'),
    CarouselContent: passthrough('content'),
    CarouselItem: passthrough('item'),
    CarouselPrevious: () => undefined,
    CarouselNext: () => undefined,
  };
});

const capabilities: GeometryComponentManifest['capabilities'] = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [],
};
const entryPath = 'src/main.ts';
const unitId = createSourceModelInteractionUnitId(entryPath);

const node = (
  id: string,
  name: string,
  {
    kind = 'part',
    childIds = [],
    parentId = 'root',
    hasPrimitives = true,
  }: Partial<{
    kind: GeometryComponentNode['kind'];
    childIds: string[];
    parentId: string;
    hasPrimitives: boolean;
  }> = {},
): GeometryComponentNode => ({
  id,
  name,
  kind,
  selector: id,
  parentId,
  childIds,
  depth: 1,
  path: [name],
  meshNodeIndices: [0],
  primitiveIndices: [0],
  materialIndices: [0],
  capabilities,
  ...(hasPrimitives ? { primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }] } : {}),
});

// Preorder: Housing, Gears (group), Sun, Planet, Cover. The group and a primitive-less part are not shown.
const nodes = [
  node('housing', 'Housing'),
  node('gears', 'Gears', { kind: 'assembly', childIds: ['sun', 'planet'], hasPrimitives: false }),
  node('sun', 'Sun', { parentId: 'gears' }),
  node('planet', 'Planet', { parentId: 'gears' }),
  node('empty', 'Empty', { hasPrimitives: false }),
  node('cover', 'Cover'),
];
const manifest: GeometryComponentManifest = {
  schemaVersion: 1,
  sourceFile: entryPath,
  rootId: 'root',
  // Deliberately not preorder: the gallery follows the tree, as the Explorer does.
  nodeOrder: ['root', 'cover', 'housing', 'gears', 'sun', 'planet', 'empty'],
  nodesById: {
    root: {
      ...node('root', 'Model', { kind: 'model', hasPrimitives: false }),
      childIds: ['housing', 'gears', 'empty', 'cover'],
    },
    ...Object.fromEntries(nodes.map((part) => [part.id, part])),
  },
  capabilities,
};

const actors: Array<Actor<typeof modelInteractionMachine> | Actor<typeof cadMachine>> = [];

function projectedGlb(ids = ['cover', 'planet', 'sun', 'housing']): Uint8Array<ArrayBuffer> {
  return writeGlb({
    nodes: ids.map((id) => ({
      name: id,
      primitives: [{ mode: 4, positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), material: {} }],
    })),
    extensions: {
      [tauCadTopologyExtension]: {
        components: ids.map((id, index) => ({
          id,
          name: id,
          kind: 'part',
          primitiveRefs: [{ nodeIndex: index, meshIndex: index, primitiveIndex: 0 }],
        })),
      },
    },
  });
}

function createFixture() {
  const modelRef = createActor(modelInteractionMachine, { input: {} }).start();
  actors.push(modelRef);
  modelRef.send({ type: 'loadManifest', unitId, manifest });
  const runtime = createMockRuntimeDocument();
  const artifact = { mimeType: 'model/gltf-binary', content: projectedGlb() } satisfies GraphicsContext['artifact'];
  const rendering = { ...runtime.rendering, artifact, hash: 'presented' };
  const context: CadContext = Object.assign(mock<CadContext>(), {
    entryPath,
    rendering,
    committedRendering: rendering,
    committedAssemblyDisplay: undefined,
    publishedAssemblyRoot: undefined,
    publishedAssembly: undefined,
    admittedAssembly: undefined,
    publishedAssemblyEntryPath: undefined,
    lastRequestedRenderId: 1,
    lastSettledRenderId: 1,
    latestRenderingOutcome: 'success',
    parkWhenIdle: false,
    kernelIssues: new Map(),
  } satisfies Partial<CadContext>);
  const cadSnapshot = Object.assign(mock<SnapshotFrom<typeof cadMachine>>(), {
    context,
    status: 'active',
  } satisfies Partial<SnapshotFrom<typeof cadMachine>>);
  cadSnapshot.matches.mockImplementation((state) => state === 'idle');
  const cadRef = mock<ActorRefFrom<typeof cadMachine>>();
  cadRef.getSnapshot.mockReturnValue(cadSnapshot);
  const graphics: GraphicsContext = Object.assign(mock<GraphicsContext>(), {
    modelInteractionRef: modelRef,
    modelInteractionUnitId: unitId,
    artifact,
    artifactKey: 'presented',
    artifactSourceFile: entryPath,
    gltfPresentation: {
      requestedRevision: 1,
      presentedRevision: 1,
      phase: 'presented',
      presentedKey: 'presented',
    },
  } satisfies Partial<GraphicsContext>);
  const graphicsSnapshot = Object.assign(mock<SnapshotFrom<typeof graphicsMachine>>(), { context: graphics });
  const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();
  graphicsRef.getSnapshot.mockReturnValue(graphicsSnapshot);
  graphicsRef.subscribe.mockReturnValue({ unsubscribe: vi.fn() });
  cadRef.subscribe.mockReturnValue({ unsubscribe: vi.fn() });
  project.current = Object.assign(mock<NonNullable<ReturnType<typeof useProject>>>(), {
    projectId: 'gallery-project',
    geometryUnits: new Map([[entryPath, cadRef]]),
  });
  return { graphicsRef, graphics, cadRef, cadSnapshot, context, runtime };
}

function admitAssembly(fixture: ReturnType<typeof createFixture>, content = projectedGlb()) {
  const root = {
    path: '.tau/artifacts/reusable-parts/gallery/scene.json',
    digest: contentDigest({ value: `sha256:${'a'.repeat(64)}`, name: 'Gallery committed root' }),
    byteLength: 123,
  };
  const part = publishedPartRecordSchema.parse({
    schemaVersion: 1,
    variants: {
      default: {
        source: { entry: 'part.ts', files: { 'part.ts': root.digest } },
        glb: { ...root, path: '.tau/artifacts/reusable-parts/gallery/part.glb' },
      },
    },
  });
  const publication: PublishedAssembly = {
    schemaVersion: 1,
    parts: { housing: part, sun: part, planet: part, cover: part },
    occurrences: ['housing', 'sun', 'planet', 'cover'].map((id) => ({
      id,
      part: id,
      variant: 'default',
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    })),
  };
  const admitted = Object.assign(mock<AdmittedAssembly>(), {
    publication,
    readAsset: vi.fn<AdmittedAssembly['readAsset']>(),
  } satisfies Partial<AdmittedAssembly>);
  const parsed = publishedPartRecordSchema.parse({
    schemaVersion: 1,
    variants: { default: { source: { entry: 'part.ts', files: { 'part.ts': root.digest } }, glb: root } },
  });
  const variant = parsed.variants['default'];
  if (!variant) {
    throw new Error('Missing parsed gallery fixture variant');
  }
  const exportPublished = vi.fn<CadAssemblyDisplay['document']['exportPublished']>().mockResolvedValue({
    success: true,
    exportId: 'gallery-published-export',
    files: [{ bytes: content, mimeType: 'model/gltf-binary', name: 'scene.glb' }],
    issues: [],
  });
  const document = Object.assign(mock<CadAssemblyDisplay['document']>(), {
    projection: 'assembly',
    root: variant.glb,
    admitted,
    exportPublished,
  } satisfies Partial<CadAssemblyDisplay['document']>);
  Object.assign(fixture.context, {
    rendering: undefined,
    committedRendering: undefined,
    committedAssemblyDisplay: { root, admitted, document },
    publishedAssemblyRoot: root,
    publishedAssembly: publication,
    publishedAssemblyEntryPath: entryPath,
    admittedAssembly: admitted,
  } satisfies Partial<CadContext>);
  Object.assign(fixture.graphics, {
    artifact: undefined,
    artifactKey: root.digest,
    gltfPresentation: { ...fixture.graphics.gltfPresentation, presentedKey: root.digest },
  } satisfies Partial<GraphicsContext>);
  return { root, document, exportPublished };
}

const ready = (...ids: string[]): Map<string, PartThumbnailState> =>
  new Map(ids.map((id) => [id, { status: 'ready', bytes: new Uint8Array([1]) }]));

function Opener({ request }: { readonly request: Omit<PartGalleryRequest, 'origin'> }): React.JSX.Element {
  const open = useOpenPartGallery();
  return (
    <button
      type='button'
      onClick={(event) => {
        open?.({ ...request, origin: event.currentTarget });
      }}
    >
      Open gallery
    </button>
  );
}

function renderGallery(componentId = 'housing', fixture = createFixture()) {
  const { graphicsRef } = fixture;
  render(
    <KeyboardProvider>
      <PartGalleryProvider>
        <Opener request={{ graphicsRef, unitId, componentId, source: 'explorer' }} />
      </PartGalleryProvider>
    </KeyboardProvider>,
  );
  return graphicsRef;
}

const shownPart = (): string => screen.getByRole('status', { name: 'Shown part' }).textContent;
const selections = (graphicsRef: ReturnType<typeof createFixture>['graphicsRef']): string[] =>
  graphicsRef.send.mock.calls.flatMap(([event]) => (event.type === 'selectModelComponent' ? [event.componentId] : []));

beforeEach(() => {
  debug.enabled = false;
  service.publish(ready('housing', 'sun', 'planet', 'cover'));
  service.requestForOwner.mockClear();
  service.releaseOwner.mockClear();
  service.announcePresentedSource.mockClear();
  service.failPreparationForOwner.mockClear();
  vi.mocked(canonicalPartPreviews)
    .mockReset()
    .mockImplementation(async (_content, parts) => ({
      visualKey: 'visual',
      previews: parts.map((_, index) => ({ key: `visual-${index}` })),
      renderContent: undefined,
    }));
  project.current = undefined;
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:part') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
  vi.restoreAllMocks();
});

describe('PartGallery', () => {
  it('keeps the real software Retry image through coherent preparation and six-part navigation', async () => {
    const ids = ['housing', 'sun', 'planet', 'cover', 'extra', 'tail'];
    const sixNodes = ids.map((id) => node(id, id[0]!.toUpperCase() + id.slice(1)));
    const sixManifest: GeometryComponentManifest = {
      ...manifest,
      nodeOrder: ['root', ...ids],
      nodesById: {
        root: { ...manifest.nodesById['root']!, childIds: ids },
        ...Object.fromEntries(sixNodes.map((part) => [part.id, part])),
      },
    };
    const fixture = createFixture();
    fixture.graphics.modelInteractionRef.send({ type: 'loadManifest', unitId, manifest: sixManifest });
    const assembly = admitAssembly(fixture, projectedGlb(ids));
    vi.mocked(canonicalPartPreviews).mockImplementation(async (_content, parts) => ({
      visualKey: 'visual',
      previews: parts.map((primitives) => ({
        key: (primitives[0]?.nodeIndex ?? 0) < 2 ? 'shared-face' : `visual-${primitives[0]?.nodeIndex}`,
      })),
      renderContent: undefined,
    }));
    const imageClient = createMockRuntimeClient<typeof imageRuntime>();
    vi.mocked(imageClient.transcode).mockResolvedValue({
      success: true,
      data: [{ name: 'render-part-0.webp', mimeType: 'image/webp', bytes: new Uint8Array([7]) }],
      issues: [],
    });
    const imageService = new HeadlessImageService({
      createImageClient: async () => imageClient,
      isGpuAvailable: () => true,
      isAutomaticGpuAvailable: () => false,
    });
    const real = new PartThumbnailService(imageService);
    const stop = real.subscribe(() => {
      service.publish(new Map(real.snapshot()));
    });
    service.publish(new Map());
    service.requestForOwner.mockImplementation((...args) => {
      real.requestForOwner(...args);
    });
    service.releaseOwner.mockImplementation((...args) => {
      real.releaseOwner(...args);
    });
    service.announcePresentedSource.mockImplementation((...args) => {
      real.announcePresentedSource(...args);
    });
    service.failPreparationForOwner.mockImplementation((...args) => {
      real.failPreparationForOwner(...args);
    });
    real.announcePresentedSource(assembly.root.digest);
    real.requestForOwner('selected', {
      source: {
        sourcePath: entryPath,
        geometryHash: 'sha256:source',
        visualKey: 'visual',
        content: new Uint8Array([1]),
      },
      parts: [{ id: 'sibling', primitives: [{ nodeIndex: 6, meshIndex: 6, primitiveIndex: 0 }] }],
      options: { manualPartId: 'sibling' },
    });
    const ui = () => (
      <KeyboardProvider>
        <PartGalleryProvider>
          <Opener request={{ graphicsRef: fixture.graphicsRef, unitId, componentId: 'housing', source: 'explorer' }} />
        </PartGalleryProvider>
      </KeyboardProvider>
    );
    const view = render(ui());
    const user = userEvent.setup();
    try {
      await waitFor(() => {
        expect(real.get('sibling')?.status).toBe('ready');
      });
      const siblingBytes = real.get('sibling')?.bytes;
      await user.click(screen.getByRole('button', { name: 'Open gallery' }));
      await waitFor(() => {
        expect(real.get('housing')?.status).toBe('failed');
      });
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => {
        expect(real.get('housing')?.status).toBe('ready');
      });
      const accepted = real.get('housing')?.bytes;
      expect(accepted).toBe(real.get('sun')?.bytes);
      expect(screen.getByRole('img', { name: 'Rendered Housing' })).toBeVisible();
      const acceptedProjections = assembly.exportPublished.mock.calls.length;
      const acceptedRequests = service.requestForOwner.mock.calls.length;
      for (const phase of ['preparing', 'awaiting-analysis'] as const) {
        fixture.graphics.gltfPresentation = {
          ...fixture.graphics.gltfPresentation,
          phase,
          requestedKey: assembly.root.digest,
        };
        view.rerender(ui());
        expect(real.get('housing')?.bytes).toBe(accepted);
        expect(real.get('sun')?.bytes).toBe(accepted);
        expect(service.requestForOwner).toHaveBeenCalledTimes(acceptedRequests);
        expect(assembly.exportPublished).toHaveBeenCalledTimes(acceptedProjections);
      }
      fixture.graphics.gltfPresentation = { ...fixture.graphics.gltfPresentation, phase: 'presented' };
      view.rerender(ui());
      for (let index = 0; index < 3; index += 1) {
        // oxlint-disable-next-line no-await-in-loop -- Each click changes the current carousel item for the next click.
        await user.click(screen.getByRole('button', { name: 'Next part' }));
      }
      await waitFor(() => {
        expect(shownPart()).toBe('Cover, 4 / 6');
      });
      const window = service.requestForOwner.mock.calls.at(-1)?.[1].parts.map(({ id }) => id);
      expect(window).not.toContain('housing');
      expect(window).not.toContain('sun');
      expect(real.get('housing')?.bytes).toBe(accepted);
      expect(real.get('sun')?.bytes).toBe(accepted);
      for (let index = 0; index < 3; index += 1) {
        // oxlint-disable-next-line no-await-in-loop -- Each click changes the current carousel item for the next click.
        await user.click(screen.getByRole('button', { name: 'Previous part' }));
      }
      await waitFor(() => {
        expect(screen.getByRole('img', { name: 'Rendered Housing' })).toBeVisible();
      });
      expect(shownPart()).toBe('Housing, 1 / 6');
      expect(selections(fixture.graphicsRef).at(-1)).toBe('housing');
      expect(real.get('housing')?.bytes).toBe(accepted);
      expect(real.get('sun')?.bytes).toBe(accepted);
      expect(imageClient.transcode).toHaveBeenCalledTimes(2);
      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull();
      });
      expect(real.get('housing')).toBeUndefined();
      expect(real.get('sun')).toBeUndefined();
      expect(real.get('sibling')?.bytes).toBe(siblingBytes);
      real.releaseOwner('selected');
      expect(real.snapshot().size).toBe(0);
    } finally {
      view.unmount();
      stop();
      real.dispose();
      imageService.dispose();
      service.requestForOwner.mockReset();
      service.releaseOwner.mockReset();
      service.announcePresentedSource.mockReset();
      service.failPreparationForOwner.mockReset();
    }
  });

  it('should open on the requested part, select it and show its Properties', async () => {
    const graphicsRef = renderGallery();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open gallery' }));

    expect(await screen.findByRole('img', { name: 'Rendered Housing' })).toBeVisible();
    expect(shownPart()).toBe('Housing, 1 / 4');
    expect(selections(graphicsRef)).toEqual(['housing']);
    expect(screen.getByRole('region', { name: 'Physical facts' })).toBeVisible();
    // The overlay header names the part, so the Properties identity row stays hidden.
    expect(screen.queryByRole('button', { name: 'Preview Housing' })).toBeNull();
  });

  it('should browse previewable parts in Explorer order with arrow keys and wraps at both ends', async () => {
    const graphicsRef = renderGallery();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open gallery' }));
    await screen.findByRole('img', { name: 'Rendered Housing' });

    const shown: string[] = [];
    for (const _ of [1, 2, 3, 4]) {
      // oxlint-disable-next-line no-await-in-loop -- Each key press must land before the next is read.
      await user.keyboard('{ArrowRight}');
      shown.push(shownPart());
    }
    expect(shown).toEqual(['Sun, 2 / 4', 'Planet, 3 / 4', 'Cover, 4 / 4', 'Housing, 1 / 4']);
    await user.keyboard('{ArrowLeft}');
    expect(shownPart()).toBe('Cover, 4 / 4');
    await user.click(screen.getByRole('button', { name: 'Next part' }));
    expect(shownPart()).toBe('Housing, 1 / 4');
    expect(selections(graphicsRef)).toEqual(['housing', 'sun', 'planet', 'cover', 'housing', 'cover', 'housing']);
  });

  it('should request the shown part and its neighbours as its own preview owner', async () => {
    renderGallery('sun');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open gallery' }));
    await waitFor(() => {
      expect(service.requestForOwner).toHaveBeenCalled();
    });
    const call = service.requestForOwner.mock.calls.at(-1);
    expect(call?.[0]).toBe('gallery');
    expect(call?.[1].source).toMatchObject({
      sourcePath: entryPath,
      geometryHash: 'sha256:source',
      visualKey: 'visual',
    });
    expect(call?.[1].parts.map((part) => part.id)).toEqual(['sun', 'planet', 'housing', 'cover']);
    expect(call?.[1].parts.map((part) => part.visualKey)).toEqual(['visual-0', 'visual-1', 'visual-2', 'visual-3']);
    expect(service.announcePresentedSource).toHaveBeenCalledWith('presented');
  });

  it('should keep Properties collapsed across parts', async () => {
    renderGallery();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open gallery' }));
    await user.click(await screen.findByRole('button', { name: 'Collapse Properties' }));
    expect(screen.queryByRole('region', { name: 'Physical facts' })).toBeNull();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Expand Properties' })).toHaveTextContent('Sun');
    expect(screen.queryByRole('region', { name: 'Physical facts' })).toBeNull();
  });

  it('should say a part is rendering, and offers Retry when its first render fails', async () => {
    service.publish(new Map([['housing', { status: 'pending' }]]));
    renderGallery();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open gallery' }));
    expect(await screen.findByText('Rendering preview')).toBeVisible();
    expect(screen.queryByRole('img', { name: 'Rendered Housing' })).toBeNull();

    act(() => {
      service.publish(new Map([['housing', { status: 'failed' }]]));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Preview unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(service.requestForOwner.mock.calls.at(-1)?.[1].options).toEqual({ manualPartId: 'housing' });
    });
  });

  it('should prepare an admitted source-free assembly from its real projected component addresses', async () => {
    const fixture = createFixture();
    const assembly = admitAssembly(fixture);
    debug.enabled = true;
    const records = vi.spyOn(headlessImageDebug, 'recordHeadlessImageTiming');
    expect(assembly.document.root).not.toBe(assembly.root);
    expect(assembly.document.root).toEqual(assembly.root);
    renderGallery('sun', fixture);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open gallery' }));
    await waitFor(() => {
      expect(service.requestForOwner).toHaveBeenCalledOnce();
    });
    expect(assembly.exportPublished).toHaveBeenCalledWith({
      format: 'glb',
      publishedAssembly: { root: assembly.root },
    });
    const request = service.requestForOwner.mock.calls.at(-1)?.[1];
    expect(request?.parts).toEqual([
      { id: 'sun', primitives: [{ nodeIndex: 2, meshIndex: 2, primitiveIndex: 0 }], visualKey: 'visual-0' },
      { id: 'planet', primitives: [{ nodeIndex: 1, meshIndex: 1, primitiveIndex: 0 }], visualKey: 'visual-1' },
      { id: 'housing', primitives: [{ nodeIndex: 3, meshIndex: 3, primitiveIndex: 0 }], visualKey: 'visual-2' },
      { id: 'cover', primitives: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }], visualKey: 'visual-3' },
    ]);
    expect(request?.source).toMatchObject({
      sourcePath: entryPath,
      geometryHash: 'sha256:source',
      visualKey: 'visual',
    });
    expect(service.announcePresentedSource).toHaveBeenCalledWith(assembly.root.digest);
    expect(fixture.runtime.document.evaluation).not.toHaveBeenCalled();
    expect(fixture.runtime.view.rendering).not.toHaveBeenCalled();
    expect(fixture.runtime.document.export).not.toHaveBeenCalled();
    expect(assembly.document.close).not.toHaveBeenCalled();
    const observed = records.mock.calls.map((call) => call[2]);
    expect(observed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'entry',
          projectId: 'gallery-project',
          current: true,
          admittedRootMatches: true,
          admittedReaderMatches: true,
        }),
        expect.objectContaining({ stage: 'canonical-selection', canonicalMatchCount: 4, requestedCount: 4 }),
        expect.objectContaining({
          stage: 'visual-preparation-completed',
          preparedCount: 4,
          visualKeyHash: hashUtils.hashString('visual'),
        }),
        expect.objectContaining({
          stage: 'request',
          requestedIds: ['sun', 'planet', 'housing', 'cover'],
          current: true,
        }),
      ]),
    );
    expect(JSON.stringify(observed)).not.toContain('content');
  });

  it('should settle one current four-neighbour request across a real telemetry-only CAD transition', async () => {
    const fixture = createFixture();
    const assembly = admitAssembly(fixture);
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof assembly.exportPublished>>>();
    assembly.exportPublished.mockReturnValue(pending.promise);
    const cadRef = createActor(cadMachine, {
      input: {
        shouldInitializeKernelOnStart: false,
        kernelOptionsFactory: fixture.context.kernelOptionsFactory,
        fileSystemRoot: '/projects/gallery',
      },
      snapshot: cadMachine.resolveState({
        value: 'idle',
        context: {
          ...fixture.context,
          telemetryEntries: [],
          eventCleanups: [],
          documentCleanups: [],
          kernelClient: undefined,
          connectingClient: undefined,
          document: undefined,
          defaultView: undefined,
        },
      }),
    }).start();
    actors.push(cadRef);
    project.current = Object.assign(mock<NonNullable<ReturnType<typeof useProject>>>(), {
      projectId: 'gallery-project',
      geometryUnits: new Map([[entryPath, cadRef]]),
    });
    const before = cadRef.getSnapshot();
    expect(before.status).toBe('active');
    expect(before.matches('idle')).toBe(true);
    expect(selectCadDisplay(before)).toBe(fixture.context.committedAssemblyDisplay);
    renderGallery('sun', fixture);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open gallery' }));
    await waitFor(() => {
      expect(assembly.exportPublished).toHaveBeenCalledOnce();
    });
    expect(service.requestForOwner).not.toHaveBeenCalled();

    act(() => {
      cadRef.send({
        type: 'kernelTelemetry',
        batch: {
          origin: { label: 'runtime', instance: 'gallery-worker' },
          epoch: 1,
          entries: [{ name: 'kernel.export', startTime: 10, duration: 1, workerTimeOrigin: 100 }],
        },
      });
    });
    const after = cadRef.getSnapshot();
    expect(after).not.toBe(before);
    expect(after.status).toBe(before.status);
    expect(after.value).toEqual(before.value);
    expect(after.context.telemetryEntries).toEqual([
      {
        name: 'kernel.export',
        startTime: 10,
        duration: 1,
        workerTimeOrigin: 100,
        origin: { label: 'runtime', instance: 'gallery-worker' },
        epoch: 1,
      },
    ]);
    expect(after.context).toEqual({ ...before.context, telemetryEntries: after.context.telemetryEntries });
    expect(selectCadDisplay(after)).toBe(selectCadDisplay(before));

    await act(async () => {
      pending.resolve({
        success: true,
        exportId: 'telemetry-held-gallery-export',
        files: [{ bytes: projectedGlb(), mimeType: 'model/gltf-binary', name: 'scene.glb' }],
        issues: [],
      });
      await pending.promise;
    });
    await waitFor(() => {
      expect(service.requestForOwner).toHaveBeenCalledOnce();
    });
    expect(assembly.exportPublished).toHaveBeenCalledOnce();
    const request = service.requestForOwner.mock.calls[0];
    expect(request?.[0]).toBe('gallery');
    expect(request?.[1].source).toMatchObject({
      sourcePath: entryPath,
      geometryHash: 'sha256:source',
      visualKey: 'visual',
    });
    expect(request?.[1].parts).toEqual([
      { id: 'sun', primitives: [{ nodeIndex: 2, meshIndex: 2, primitiveIndex: 0 }], visualKey: 'visual-0' },
      { id: 'planet', primitives: [{ nodeIndex: 1, meshIndex: 1, primitiveIndex: 0 }], visualKey: 'visual-1' },
      { id: 'housing', primitives: [{ nodeIndex: 3, meshIndex: 3, primitiveIndex: 0 }], visualKey: 'visual-2' },
      { id: 'cover', primitives: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }], visualKey: 'visual-3' },
    ]);
    expect(service.failPreparationForOwner).not.toHaveBeenCalled();
    expect(assembly.document.close).not.toHaveBeenCalled();
    expect(fixture.runtime.document.evaluation).not.toHaveBeenCalled();
    expect(fixture.runtime.view.rendering).not.toHaveBeenCalled();
  });

  it('should acquire no gallery diagnostic key fingerprints or records when page debugging is off', async () => {
    const hashes = vi.spyOn(hashUtils, 'hashString');
    const fixture = createFixture();
    const assembly = admitAssembly(fixture);
    const records = vi.spyOn(headlessImageDebug, 'recordHeadlessImageTiming');
    renderGallery('housing', fixture);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open gallery' }));
    await waitFor(() => {
      expect(service.requestForOwner).toHaveBeenCalledOnce();
    });
    expect(records).not.toHaveBeenCalled();
    expect(hashes).not.toHaveBeenCalled();
    expect(assembly.exportPublished).toHaveBeenCalledOnce();
  });

  it('should acquire no gallery diagnostic predicates after the held page environment is unavailable', async () => {
    debug.enabled = true;
    const records = vi.spyOn(headlessImageDebug, 'recordHeadlessImageTiming');
    const fixture = createFixture();
    const assembly = admitAssembly(fixture);
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof assembly.exportPublished>>>();
    const requested = Promise.withResolvers<void>();
    assembly.exportPublished.mockReturnValueOnce(pending.promise);
    service.requestForOwner.mockImplementationOnce(() => {
      requested.resolve();
    });
    renderGallery('housing', fixture);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open gallery' }));
    await waitFor(() => {
      expect(assembly.exportPublished).toHaveBeenCalledOnce();
    });
    records.mockClear();
    const hashes = vi.spyOn(hashUtils, 'hashString');
    await act(async () => {
      vi.stubGlobal('window', undefined);
      try {
        pending.resolve({
          success: true,
          exportId: 'off-page-gallery-export',
          files: [{ bytes: projectedGlb(), mimeType: 'model/gltf-binary', name: 'scene.glb' }],
          issues: [],
        });
        await requested.promise;
      } finally {
        vi.unstubAllGlobals();
      }
    });
    expect(records).not.toHaveBeenCalled();
    expect(hashes).not.toHaveBeenCalled();
    expect(service.requestForOwner).toHaveBeenCalledOnce();
  });

  it('should observe the actual stale entry denial without starting published projection', async () => {
    debug.enabled = true;
    const records = vi.spyOn(headlessImageDebug, 'recordHeadlessImageTiming');
    const fixture = createFixture();
    const assembly = admitAssembly(fixture);
    fixture.context.lastRequestedRenderId = 2;
    renderGallery('housing', fixture);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open gallery' }));
    expect(records).toHaveBeenCalledWith(
      'thumbnail.gallery.prepare',
      expect.any(Number),
      expect.objectContaining({
        stage: 'entry-denied',
        projectId: 'gallery-project',
        requestedRenderId: 2,
        settledRenderId: 1,
        current: false,
      }),
    );
    expect(service.requestForOwner).not.toHaveBeenCalled();
    expect(assembly.exportPublished).not.toHaveBeenCalled();
  });

  it.each(['replacement', 'cleanup'])(
    'should observe held projection %s against its captured request owner',
    async (condition) => {
      debug.enabled = true;
      const records = vi.spyOn(headlessImageDebug, 'recordHeadlessImageTiming');
      const fixture = createFixture();
      const assembly = admitAssembly(fixture);
      const pending = Promise.withResolvers<Awaited<ReturnType<typeof assembly.exportPublished>>>();
      assembly.exportPublished.mockReturnValueOnce(pending.promise);
      renderGallery('housing', fixture);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Open gallery' }));
      await waitFor(() => {
        expect(assembly.exportPublished).toHaveBeenCalledOnce();
      });
      if (condition === 'cleanup') {
        await user.keyboard('{Escape}');
      } else {
        fixture.graphics.gltfPresentation = { ...fixture.graphics.gltfPresentation, presentedKey: 'replacement' };
        project.current = Object.assign(mock<NonNullable<ReturnType<typeof useProject>>>(), {
          projectId: 'newer-project',
          geometryUnits: new Map(),
        });
      }
      await act(async () => {
        pending.resolve({
          success: true,
          exportId: 'held-gallery-export',
          files: [{ bytes: projectedGlb(), mimeType: 'model/gltf-binary', name: 'scene.glb' }],
          issues: [],
        });
        await pending.promise;
      });
      await waitFor(() => {
        expect(records).toHaveBeenCalledWith(
          'thumbnail.gallery.prepare',
          expect.any(Number),
          expect.objectContaining({
            stage: 'projection-denied',
            projectId: 'gallery-project',
            active: condition !== 'cleanup',
            current: condition === 'cleanup',
          }),
        );
      });
      expect(service.requestForOwner).not.toHaveBeenCalled();
      expect(service.failPreparationForOwner).not.toHaveBeenCalled();
      if (condition === 'cleanup') {
        expect(records).toHaveBeenCalledWith(
          'thumbnail.gallery.prepare',
          expect.any(Number),
          expect.objectContaining({ stage: 'cleanup', active: false }),
        );
      }
    },
  );

  it.each(['projection', 'canonical-selection', 'visual-preparation'])(
    'should observe %s failure without raw errors or a partial gallery request',
    async (stage) => {
      debug.enabled = true;
      const records = vi.spyOn(headlessImageDebug, 'recordHeadlessImageTiming');
      const fixture = createFixture();
      const assembly = admitAssembly(
        fixture,
        stage === 'canonical-selection' ? projectedGlb(['sun', 'planet', 'cover']) : projectedGlb(),
      );
      const privateFailure = new Error('Private diagnostic message must not enter a copied record');
      if (stage === 'projection') {
        assembly.exportPublished.mockRejectedValueOnce(privateFailure);
      } else if (stage === 'visual-preparation') {
        vi.mocked(canonicalPartPreviews).mockRejectedValueOnce(privateFailure);
      }
      renderGallery('housing', fixture);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Open gallery' }));
      await waitFor(() => {
        expect(service.failPreparationForOwner).toHaveBeenCalledOnce();
      });
      expect(service.requestForOwner).not.toHaveBeenCalled();
      expect(records).toHaveBeenCalledWith(
        'thumbnail.gallery.prepare',
        expect.any(Number),
        expect.objectContaining({
          stage: 'preparation-failed',
          preparationStage: stage,
          errorCategory: 'error',
          current: true,
        }),
      );
      expect(JSON.stringify(records.mock.calls)).not.toContain(privateFailure.message);
    },
  );

  it.each(['unsettled', 'failed', 'parked', 'unpresented', 'wrong-entry', 'replaced-root', 'source-missing'])(
    'should deny source-free preview admission for a %s owner',
    async (condition) => {
      service.publish(new Map());
      const fixture = createFixture();
      const assembly = admitAssembly(fixture);
      switch (condition) {
        case 'unsettled': {
          fixture.context.lastRequestedRenderId = 2;
          break;
        }
        case 'failed': {
          fixture.context.latestRenderingOutcome = 'failure';
          break;
        }
        case 'parked': {
          fixture.context.parkWhenIdle = true;
          break;
        }
        case 'unpresented': {
          fixture.graphics.gltfPresentation = { ...fixture.graphics.gltfPresentation, phase: 'preparing' };
          break;
        }
        case 'source-missing': {
          fixture.context.committedAssemblyDisplay = undefined;
          fixture.context.rendering = fixture.runtime.rendering;
          break;
        }
        case 'wrong-entry': {
          fixture.context.entryPath = 'other.assembly.json';
          break;
        }
        case 'replaced-root': {
          fixture.context.publishedAssemblyRoot = { ...assembly.root };
          break;
        }
        default: {
          throw new Error('Unknown gallery owner control');
        }
      }
      renderGallery('housing', fixture);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Open gallery' }));
      expect(await screen.findByRole('dialog')).toBeVisible();
      expect(screen.getByRole('alert')).toHaveTextContent('Preview unavailable');
      expect(screen.queryByText('Rendering preview')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      expect(screen.queryByRole('img', { name: 'Rendered Housing' })).toBeNull();
      expect(assembly.exportPublished).not.toHaveBeenCalled();
      expect(service.requestForOwner).not.toHaveBeenCalled();
      expect(service.releaseOwner).toHaveBeenCalledWith('gallery');
    },
  );

  it.each(['cad', 'presentation'])(
    'should show genuine current %s preparation without claiming preview admission',
    async (owner) => {
      service.publish(new Map());
      const fixture = createFixture();
      const assembly = admitAssembly(fixture);
      if (owner === 'cad') {
        fixture.context.lastRequestedRenderId = 2;
        fixture.cadSnapshot.matches.mockImplementation((state) => state === 'rendering');
      } else {
        fixture.graphics.gltfPresentation = {
          ...fixture.graphics.gltfPresentation,
          phase: 'preparing',
          requestedKey: assembly.root.digest,
        };
      }
      renderGallery('housing', fixture);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Open gallery' }));
      expect(await screen.findByText('Rendering preview')).toBeVisible();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      expect(assembly.exportPublished).not.toHaveBeenCalled();
      expect(service.requestForOwner).not.toHaveBeenCalled();
    },
  );

  it('should reject a projected pin that has lost the selected canonical part', async () => {
    const fixture = createFixture();
    const assembly = admitAssembly(fixture, projectedGlb(['cover', 'planet', 'sun']));
    renderGallery('housing', fixture);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open gallery' }));
    await waitFor(() => {
      expect(service.failPreparationForOwner).toHaveBeenCalled();
    });
    expect(assembly.exportPublished).toHaveBeenCalledOnce();
    expect(service.requestForOwner).not.toHaveBeenCalled();
    expect(service.failPreparationForOwner.mock.calls.at(-1)?.[2]).toEqual(
      new Error('Pinned part preview lost its canonical component selection'),
    );
  });

  it.each(['superseded', 'closed'])(
    'should discard a held source-free preparation after it is %s',
    async (condition) => {
      const fixture = createFixture();
      const assembly = admitAssembly(fixture);
      let complete: ((result: Awaited<ReturnType<typeof assembly.exportPublished>>) => void) | undefined;
      assembly.exportPublished.mockReturnValueOnce(
        new Promise((resolve) => {
          complete = resolve;
        }),
      );
      renderGallery('housing', fixture);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Open gallery' }));
      await waitFor(() => {
        expect(assembly.exportPublished).toHaveBeenCalledOnce();
      });
      if (condition === 'closed') {
        await user.keyboard('{Escape}');
        expect(service.releaseOwner).toHaveBeenCalledWith('gallery');
      } else {
        fixture.context.lastRequestedRenderId = 2;
      }
      await act(async () => {
        complete?.({
          success: true,
          exportId: 'gallery-held-published-export',
          files: [{ bytes: projectedGlb(), mimeType: 'model/gltf-binary', name: 'scene.glb' }],
          issues: [],
        });
      });
      expect(service.requestForOwner).not.toHaveBeenCalled();
      expect(service.failPreparationForOwner).not.toHaveBeenCalled();
      expect(assembly.document.close).not.toHaveBeenCalled();
    },
  );

  it('should discard prepared visuals when the actual presented source changes during preparation', async () => {
    const fixture = createFixture();
    let complete: ((value: Awaited<ReturnType<typeof canonicalPartPreviews>>) => void) | undefined;
    vi.mocked(canonicalPartPreviews).mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    renderGallery('housing', fixture);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open gallery' }));
    await waitFor(() => {
      expect(canonicalPartPreviews).toHaveBeenCalledOnce();
    });
    fixture.graphics.gltfPresentation = { ...fixture.graphics.gltfPresentation, presentedKey: 'replacement' };
    await act(async () => {
      complete?.({ visualKey: 'obsolete', previews: [{ key: 'obsolete-part' }] });
    });
    expect(service.requestForOwner).not.toHaveBeenCalled();
    expect(service.failPreparationForOwner).not.toHaveBeenCalled();
  });

  it('should report current preparation failure and admit a manual retry only for the same presented source', async () => {
    const failure = new Error('Canonical preview preparation failed');
    vi.mocked(canonicalPartPreviews).mockRejectedValueOnce(failure);
    service.publish(new Map([['housing', { status: 'failed' }]]));
    renderGallery();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open gallery' }));
    await waitFor(() => {
      expect(service.failPreparationForOwner).toHaveBeenCalledWith('gallery', expect.any(Array), failure);
    });
    expect(service.requestForOwner).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(service.requestForOwner.mock.calls.at(-1)?.[1].options).toEqual({ manualPartId: 'housing' });
    });
    expect(service.requestForOwner.mock.calls.at(-1)?.[1].source.geometryHash).toBe('sha256:source');
  });

  it('should retain conservative per-part fallback when canonical rigid identities are unavailable', async () => {
    vi.mocked(canonicalPartPreviews).mockResolvedValueOnce({
      visualKey: 'source-visual',
      previews: [undefined, undefined, undefined, undefined],
    });
    renderGallery();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open gallery' }));
    await waitFor(() => {
      expect(service.requestForOwner).toHaveBeenCalledOnce();
    });
    const request = service.requestForOwner.mock.calls.at(-1)?.[1];
    expect(request?.source.visualKey).toBe('source-visual');
    expect(request?.parts.map((part) => part.visualKey)).toEqual([undefined, undefined, undefined, undefined]);
    expect(request?.parts.map((part) => part.primitives)).toEqual(
      Array.from({ length: 4 }, () => [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }]),
    );
  });

  it('should close on Escape and returns focus to the opener', async () => {
    renderGallery();
    const user = userEvent.setup();
    const opener = screen.getByRole('button', { name: 'Open gallery' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Image preview carousel' });
    expect(within(dialog).getByRole('img', { name: 'Rendered Housing' })).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
    expect(service.releaseOwner).toHaveBeenCalledWith('gallery');
  });
});
