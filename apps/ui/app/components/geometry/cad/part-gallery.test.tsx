// @vitest-environment jsdom
import * as React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { createSourceModelInteractionUnitId, modelInteractionMachine } from '#machines/model-interaction.machine.js';
import type { PartThumbnailState } from '#services/part-thumbnail.service.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import { PartGalleryProvider, useOpenPartGallery } from '#components/geometry/cad/part-gallery.js';
import type { PartGalleryRequest } from '#components/geometry/cad/part-gallery.js';

const service = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { snapshot: new Map<string, PartThumbnailState>() };
  return {
    state,
    listeners,
    requestForOwner: vi.fn(),
    releaseOwner: vi.fn(),
    failPreparationForOwner: vi.fn(),
    publish(next: Map<string, PartThumbnailState>) {
      state.snapshot = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
});

vi.mock('#providers/part-thumbnail-provider.js', () => ({
  useOptionalPartThumbnailService: () => ({
    subscribe: (listener: () => void) => {
      service.listeners.add(listener);
      return () => service.listeners.delete(listener);
    },
    snapshot: () => service.state.snapshot,
    requestForOwner: service.requestForOwner,
    releaseOwner: service.releaseOwner,
    failPreparationForOwner: service.failPreparationForOwner,
  }),
}));

vi.mock('#services/part-thumbnail-visual.js', () => ({
  sourceGlbDigest: async () => 'sha256:source',
  canonicalPartPreviews: async (_content: unknown, parts: readonly unknown[]) => ({
    visualKey: 'visual',
    previews: parts.map((_, index) => ({ key: `visual-${index}` })),
    renderContent: undefined,
  }),
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

function createGraphicsRef(): ActorRefFrom<typeof graphicsMachine> & { send: ReturnType<typeof vi.fn> } {
  const modelRef = createActor(modelInteractionMachine, { input: {} });
  modelRef.start();
  modelRef.send({ type: 'loadManifest', unitId, manifest });
  const snapshot = {
    context: {
      modelInteractionRef: modelRef,
      artifact: { mimeType: 'model/gltf-binary', content: new Uint8Array([1, 2, 3]) },
      artifactKey: 'presented',
      artifactSourceFile: entryPath,
      gltfPresentation: { presentedKey: 'presented' },
    },
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => ({ unsubscribe: vi.fn() }),
    send: vi.fn(),
  } as unknown as ActorRefFrom<typeof graphicsMachine> & { send: ReturnType<typeof vi.fn> };
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

function renderGallery(componentId = 'housing'): ReturnType<typeof createGraphicsRef> {
  const graphicsRef = createGraphicsRef();
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
const selections = (graphicsRef: ReturnType<typeof createGraphicsRef>): string[] =>
  graphicsRef.send.mock.calls
    .map(([event]) => event as { type: string; componentId?: string })
    .filter((event) => event.type === 'selectModelComponent')
    .map((event) => event.componentId!);

beforeEach(() => {
  service.publish(ready('housing', 'sun', 'planet', 'cover'));
  service.requestForOwner.mockClear();
  service.releaseOwner.mockClear();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:part') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PartGallery', () => {
  it('opens on the requested part, selects it and shows its Properties', async () => {
    const graphicsRef = renderGallery();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open gallery' }));

    expect(await screen.findByRole('img', { name: 'Rendered Housing' })).toBeVisible();
    expect(shownPart()).toBe('Housing, 1 / 4');
    expect(selections(graphicsRef)).toEqual(['housing']);
    expect(screen.getByRole('region', { name: 'Physical facts' })).toBeVisible();
    // The overlay header names the part, so the Properties identity row stays hidden.
    expect(screen.queryByRole('button', { name: 'Preview Housing' })).toBeNull();
  });

  it('browses previewable parts in Explorer order with arrow keys and wraps at both ends', async () => {
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

  it('requests the shown part and its neighbours as its own preview owner', async () => {
    renderGallery('sun');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open gallery' }));
    await waitFor(() => {
      expect(service.requestForOwner).toHaveBeenCalled();
    });
    const [owner, source, parts] = service.requestForOwner.mock.calls.at(-1)! as [
      string,
      unknown,
      Array<{ id: string }>,
    ];
    expect(owner).toBe('gallery');
    expect(source).toMatchObject({ sourcePath: entryPath, geometryHash: 'sha256:source' });
    expect(parts.map((part) => part.id)).toEqual(['sun', 'planet', 'housing', 'cover']);
  });

  it('keeps Properties collapsed across parts', async () => {
    renderGallery();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open gallery' }));
    await user.click(await screen.findByRole('button', { name: 'Collapse Properties' }));
    expect(screen.queryByRole('region', { name: 'Physical facts' })).toBeNull();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Expand Properties' })).toHaveTextContent('Sun');
    expect(screen.queryByRole('region', { name: 'Physical facts' })).toBeNull();
  });

  it('says a part is rendering, and offers Retry when its first render fails', async () => {
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
      expect(service.requestForOwner.mock.calls.at(-1)?.[3]).toEqual({ manualPartId: 'housing' });
    });
  });

  it('closes on Escape and returns focus to the opener', async () => {
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
