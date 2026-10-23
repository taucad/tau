import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { GeometryComponentNode } from '@taucad/types';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { createSourceModelInteractionUnitId } from '@taucad/viewer/machines/model-interaction.machine';
import type { ModelComponentHostActions } from '#component-menu/component-actions.js';
import { createGraphicsRefForUnit, createNode } from '#model/model.test-utils.jsx';
import { PartGallery } from '#model/part-gallery.jsx';
import type { PartGalleryPreviews } from '#model/part-gallery.jsx';

const entryPath = 'src/main.ts';
const unitId = createSourceModelInteractionUnitId(entryPath);
const part = (id: string, name: string): GeometryComponentNode => ({
  ...createNode(id, name),
  primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
});

const renderGallery = (
  actions: ModelComponentHostActions,
  usePreviews = vi.fn((): PartGalleryPreviews => ({ previews: new Map(), retry: vi.fn() })),
) => {
  const graphicsRef = createGraphicsRefForUnit(entryPath, [part('gear', 'Gear'), part('axle', 'Axle')]);
  const onClose = vi.fn();
  render(
    <KeyboardProvider>
      <TooltipProvider>
        <PartGallery
          request={{ graphicsRef, unitId, componentId: 'gear', source: 'explorer' }}
          actions={actions}
          usePreviews={usePreviews}
          onClose={onClose}
        />
      </TooltipProvider>
    </KeyboardProvider>,
  );
  return { graphicsRef, onClose, usePreviews };
};

describe('PartGallery', () => {
  beforeAll(() => {
    /* Jsdom lays nothing out; the strip keeps the shown part in view. */
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("should open on the requested part, ask the host's hook for it and its neighbours, and move with the arrows", async () => {
    const user = userEvent.setup();
    const { usePreviews, graphicsRef } = renderGallery({});

    expect(screen.getByRole('status', { name: 'Shown part' })).toHaveTextContent('Part 1 of 2');
    expect(usePreviews).toHaveBeenLastCalledWith(expect.objectContaining({ unitId, index: 0 }));
    await user.click(screen.getByRole('button', { name: 'Next part' }));

    expect(screen.getByRole('status', { name: 'Shown part' })).toHaveTextContent('Part 2 of 2');
    expect(graphicsRef.sent).toContainEqual({
      type: 'selectModelComponent',
      unitId,
      componentId: 'axle',
      source: 'explorer',
    });
  });

  it("should offer only the host's verbs, under the host's chat label", async () => {
    const user = userEvent.setup();
    const addToChat = vi.fn();
    renderGallery({ addToChat, addToChatLabel: 'Copy reference' });

    expect(screen.queryByRole('button', { name: 'Reveal in Explorer' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More actions for Gear' }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy reference' }));

    expect(addToChat).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: entryPath, componentId: 'gear' }),
      expect.objectContaining({ unitId, source: 'explorer' }),
    );
  });
});
