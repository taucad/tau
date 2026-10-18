// @vitest-environment jsdom
import * as React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import type { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import {
  createSourceModelInteractionUnitId,
  modelInteractionMachine,
} from '@taucad/viewer/machines/model-interaction.machine';
import type { PartThumbnailState } from '@taucad/viewer/cad/part-thumbnail-state';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
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

const project = vi.hoisted(() => ({
  editorSend: vi.fn(),
  openPanel: vi.fn(),
  addContextReferences: vi.fn(),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef: { send: project.editorSend } }),
}));

vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel: project.openPanel }),
}));

vi.mock('#components/chat/chat-context-insertion.js', () => ({
  geometryReferenceToToken: () => '@part',
  useChatContextInsertion: () => ({ addContextReferences: project.addContextReferences }),
}));

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
      <TooltipProvider>
        <PartGalleryProvider>
          <Opener request={{ graphicsRef, unitId, componentId, source: 'explorer' }} />
        </PartGalleryProvider>
      </TooltipProvider>
    </KeyboardProvider>,
  );
  return graphicsRef;
}

const shownPart = (): string => screen.getByRole('status', { name: 'Shown part' }).textContent;
const sent = (graphicsRef: ReturnType<typeof createGraphicsRef>, type: string): string[] =>
  graphicsRef.send.mock.calls
    .map(([event]) => event as { type: string; componentId?: string })
    .filter((event) => event.type === type)
    .map((event) => event.componentId!);
const selections = (graphicsRef: ReturnType<typeof createGraphicsRef>): string[] =>
  sent(graphicsRef, 'selectModelComponent');

beforeEach(() => {
  service.publish(ready('housing', 'sun', 'planet', 'cover'));
  service.requestForOwner.mockClear();
  service.releaseOwner.mockClear();
  project.editorSend.mockClear();
  project.openPanel.mockClear();
  // The jsdom environment does not lay out, so it has no scrollIntoView for the strip to call.
  Element.prototype.scrollIntoView = vi.fn();
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
    expect(shownPart()).toBe('Housing, Part 1 of 4');
    expect(selections(graphicsRef)).toEqual(['housing']);
    expect(screen.getByRole('region', { name: 'Physical facts' })).toBeVisible();
    // The sheet's header names the part, so the Properties identity row stays hidden.
    expect(screen.queryByRole('button', { name: 'Preview Housing' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Download Housing' })).toHaveAttribute('download', 'Housing.webp');
  });

  it("names the part's place in the model and reveals a group from its crumb", async () => {
    renderGallery('sun');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open gallery' }));
    const crumbs = await screen.findByRole('navigation', { name: 'Place in the model' });
    // The model root is the Explorer's file row, not a crumb.
    expect(within(crumbs).getByRole('button', { name: 'Gears' })).toBeVisible();
    expect(within(crumbs).queryByText('Model')).toBeNull();

    await user.click(within(crumbs).getByRole('button', { name: 'Gears' }));
    expect(project.openPanel).toHaveBeenCalledWith('model');
    await waitFor(() => {
      expect(project.editorSend).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'revealModelComponentInExplorer', componentId: 'gears' }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('shows every previewable part in the strip and switches to the one chosen', async () => {
    const graphicsRef = renderGallery();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open gallery' }));
    const strip = await screen.findByRole('list', { name: 'Parts in this model' });
    const tiles = within(strip).getAllByRole('button');
    expect(tiles.map((tile) => tile.getAttribute('aria-label'))).toEqual(['Housing', 'Sun', 'Planet', 'Cover']);
    expect(within(strip).getByRole('button', { name: 'Housing' })).toHaveAttribute('aria-current', 'true');

    await user.click(within(strip).getByRole('button', { name: 'Planet' }));
    expect(shownPart()).toBe('Planet, Part 3 of 4');
    expect(within(strip).getByRole('button', { name: 'Planet' })).toHaveAttribute('aria-current', 'true');
    expect(selections(graphicsRef)).toEqual(['housing', 'planet']);
  });

  it('focuses the part in the viewer and makes way for it', async () => {
    const graphicsRef = renderGallery();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open gallery' }));
    await user.click(await screen.findByRole('button', { name: 'Focus on part' }));
    expect(sent(graphicsRef, 'focusModelComponent')).toEqual(['housing']);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('keeps Isolate and Add to chat under More', async () => {
    const graphicsRef = renderGallery();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open gallery' }));
    await user.click(await screen.findByRole('button', { name: 'More actions for Housing' }));
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Isolate', 'Add to chat']);

    await user.click(within(menu).getByRole('menuitem', { name: 'Isolate' }));
    expect(sent(graphicsRef, 'isolateModelComponent')).toEqual(['housing']);
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
    expect(shown).toEqual(['Sun, Part 2 of 4', 'Planet, Part 3 of 4', 'Cover, Part 4 of 4', 'Housing, Part 1 of 4']);
    await user.keyboard('{ArrowLeft}');
    expect(shownPart()).toBe('Cover, Part 4 of 4');
    await user.click(screen.getByRole('button', { name: 'Next part' }));
    expect(shownPart()).toBe('Housing, Part 1 of 4');
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
    expect(screen.getByRole('alert')).toMatchTextContent('Preview unavailable');
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
    const dialog = await screen.findByRole('dialog', { name: 'Housing' });
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
