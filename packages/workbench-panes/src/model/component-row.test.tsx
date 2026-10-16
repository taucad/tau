import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenuContent, ContextMenuItem } from '@taucad/ui/components/context-menu';
import { ComponentRow, getComponentRowPaddingLeft } from '#model/component-row.jsx';
import type { ModelComponentActions, ModelSource, ModelThumbnails } from '#model/model-source.js';
import { createManifest, createNode, createStaticGraphicsRef, ModelHost } from '#model/model.test-utils.jsx';

const unitId = 'src/main.ts';
const firstComponentId = 'component:first';
const secondComponentId = 'component:second';
const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
const noThumbnails: ModelThumbnails = {
  previews: new Map(),
  retry: vi.fn(),
  failDecode: vi.fn(),
  markDecoded: vi.fn(),
};

afterEach(() => {
  for (const [name, original] of [
    ['createObjectURL', originalCreateObjectUrl],
    ['revokeObjectURL', originalRevokeObjectUrl],
  ] as const) {
    if (original) {
      Object.defineProperty(URL, name, original);
    } else {
      Reflect.deleteProperty(URL, name);
    }
  }
});

type RowProperties = Parameters<typeof ComponentRow>[0];

function renderComponentRow(properties: RowProperties, source: ModelSource = {}): ReturnType<typeof render> {
  return render(
    <ModelHost source={source}>
      <ComponentRow {...properties} />
    </ModelHost>,
  );
}

function rowProperties(overrides: Partial<RowProperties> & Pick<RowProperties, 'node'>): RowProperties {
  return {
    manifest: createManifest([overrides.node]),
    graphicsRef: createStaticGraphicsRef(),
    unitId,
    rootDepth: 0,
    hoveredComponentId: undefined,
    isSelected: false,
    isHidden: false,
    isIsolated: false,
    isFocused: false,
    opacity: 1,
    ...overrides,
  };
}

describe('Model component rows', () => {
  it('should use compact panel row density', () => {
    const node = createNode(firstComponentId, 'planetary_housing');
    renderComponentRow(rowProperties({ node }));

    const row = screen.getByRole('button', { name: 'planetary_housing' }).parentElement;
    expect(getComponentRowPaddingLeft({ depth: node.depth, rootDepth: 0 })).toBe(8);
    expect(row).toHaveClass('h-7', 'rounded-md', 'text-sm', 'leading-5');
    expect(row).toHaveStyle({ paddingLeft: '8px' });
  });

  it('leads a renderable part row with an 80 px preview that opens the gallery', async () => {
    const openPartGallery = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:housing') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const node = {
      ...createNode(firstComponentId, 'planetary_housing'),
      primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
    };
    const graphicsRef = createStaticGraphicsRef();
    renderComponentRow(
      rowProperties({ node, graphicsRef, preview: { status: 'pending', bytes: new Uint8Array([1]) } }),
      { useThumbnails: () => noThumbnails, openPartGallery },
    );

    const preview = screen.getByRole('button', { name: 'Preview planetary_housing' });
    const row = preview.parentElement;
    expect(row).toHaveClass('h-22');
    expect(preview).toHaveClass('size-20', 'rounded-xs');
    expect(preview).toHaveAttribute('tabindex', '-1');
    // A refreshing preview keeps its last image, dimmed.
    expect(preview.querySelector('img')).toHaveClass('opacity-50');
    // The frame is a sibling of the selection button, never nested in it.
    expect(screen.getByRole('button', { name: 'planetary_housing' }).querySelector('button')).toBeNull();

    await userEvent.setup().click(preview);
    expect(openPartGallery).toHaveBeenCalledWith({
      graphicsRef,
      unitId,
      componentId: firstComponentId,
      source: 'explorer',
      origin: preview,
    });
    expect(graphicsRef.sent).not.toContainEqual(expect.objectContaining({ type: 'toggleModelComponentSelection' }));
  });

  it('keeps a renderable part row compact when the host renders no thumbnails', () => {
    const node = {
      ...createNode(firstComponentId, 'planetary_housing'),
      primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
    };
    renderComponentRow(rowProperties({ node }));

    expect(screen.queryByRole('button', { name: 'Preview planetary_housing' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'planetary_housing' }).parentElement).toHaveClass('h-7');
  });

  it('should toggle selection from the label row', async () => {
    const node = createNode(firstComponentId, 'planetary_housing');
    const graphicsRef = createStaticGraphicsRef();
    renderComponentRow(rowProperties({ node, graphicsRef }));

    await userEvent.setup().click(screen.getByRole('button', { name: 'planetary_housing' }));

    expect(graphicsRef.sent).toContainEqual({
      type: 'toggleModelComponentSelection',
      unitId,
      componentId: firstComponentId,
      source: 'explorer',
    });
  });

  it('should reserve selected row styling for selected rows only', () => {
    const selectedNode = createNode(firstComponentId, 'planetary_housing');
    const focusedNode = createNode(secondComponentId, 'sun_gear_assembly');
    const isolatedNode = createNode('component:ring', 'ring_gear');
    const manifest = createManifest([selectedNode, focusedNode, isolatedNode]);
    render(
      <ModelHost>
        <ComponentRow {...rowProperties({ manifest, node: selectedNode, isSelected: true })} />
        <ComponentRow {...rowProperties({ manifest, node: focusedNode, isFocused: true })} />
        <ComponentRow {...rowProperties({ manifest, node: isolatedNode, isIsolated: true })} />
      </ModelHost>,
    );

    const selectedRow = screen.getByRole('button', { name: 'planetary_housing' }).parentElement;
    const focusedRow = screen.getByRole('button', { name: 'sun_gear_assembly' }).parentElement;
    const isolatedRow = screen.getByRole('button', { name: 'ring_gear' }).parentElement;

    expect(screen.getByRole('button', { name: 'planetary_housing' })).toHaveAttribute('aria-pressed', 'true');
    expect(selectedRow).toHaveClass('bg-primary/10', 'text-foreground');
    expect(focusedRow).not.toHaveClass('bg-primary/10');
    expect(focusedRow).toHaveClass('bg-sidebar-accent/70');
    expect(isolatedRow).not.toHaveClass('bg-primary/10');
    expect(screen.getByRole('button', { name: 'Remove isolation for ring_gear' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it("draws the host's component menu as the row button and the right-click menu", async () => {
    const user = userEvent.setup();
    const node = createNode(firstComponentId, 'planetary_housing');
    const dropdown = vi.fn();
    const componentActions: ModelComponentActions = {
      Dropdown(properties) {
        dropdown(properties);
        return (
          <button type='button' className={properties.actionButtonClassName}>
            Actions for {properties.node.name}
          </button>
        );
      },
      ContextContent: ({ node: menuNode }) => (
        <ContextMenuContent>
          <ContextMenuItem>Menu for {menuNode.name}</ContextMenuItem>
        </ContextMenuContent>
      ),
    };
    renderComponentRow(rowProperties({ node, hoveredComponentId: firstComponentId, opacity: 0.5 }), {
      componentActions,
    });

    expect(screen.getByRole('button', { name: 'Actions for planetary_housing' })).toBeInTheDocument();
    expect(dropdown).toHaveBeenCalledWith(
      expect.objectContaining({ node, unitId, source: 'explorer', opacity: 0.5, isIsolated: false }),
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'planetary_housing' }).parentElement!);
    expect(await screen.findByText('Menu for planetary_housing')).toBeInTheDocument();
    await user.keyboard('{Escape}');
  });

  it('has no menu button when the host supplies no component menu', () => {
    renderComponentRow(rowProperties({ node: createNode(firstComponentId, 'planetary_housing') }));
    expect(screen.queryByRole('button', { name: /Actions for/u })).not.toBeInTheDocument();
  });

  it('should show stateful tooltips for visible and non-isolated row action icons', async () => {
    const user = userEvent.setup();
    renderComponentRow(
      rowProperties({ node: createNode(firstComponentId, 'planetary_housing'), hoveredComponentId: firstComponentId }),
    );

    await user.hover(screen.getByRole('button', { name: 'Hide planetary_housing' }));
    expect(await screen.findByRole('tooltip', { name: 'Hide part' })).toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: 'Isolate planetary_housing' }));
    expect(await screen.findByRole('tooltip', { name: 'Isolate part' })).toBeInTheDocument();
  });

  it('should show stateful tooltips for hidden and isolated row action icons', async () => {
    const user = userEvent.setup();
    renderComponentRow(
      rowProperties({ node: createNode(firstComponentId, 'planetary_housing'), isHidden: true, isIsolated: true }),
    );

    await user.hover(screen.getByRole('button', { name: 'Show planetary_housing' }));
    expect(await screen.findByRole('tooltip', { name: 'Show part' })).toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: 'Remove isolation for planetary_housing' }));
    expect(await screen.findByRole('tooltip', { name: 'Remove isolation' })).toBeInTheDocument();
  });

  it('should render the material color as the component icon fill', () => {
    const iconColor = 'var(--primary)';
    const node = createNode(firstComponentId, 'sun_gear', { color: iconColor, colors: [iconColor] });
    renderComponentRow(rowProperties({ node }));

    const rowButton = screen.getByRole('button', { name: 'sun_gear' });
    const icon = screen.getByTestId('component-color-icon');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveStyle({ fill: iconColor });
    expect(screen.queryByTestId('component-color-swatch')).not.toBeInTheDocument();
    expect(rowButton.children[0]).toBe(icon);
    expect(rowButton.children[1]).toHaveTextContent('sun_gear');
  });

  it('should keep isolate controls out of the Tab order for isolated and hovered rows', () => {
    const firstNode = createNode(firstComponentId, 'planetary_housing');
    const secondNode = createNode(secondComponentId, 'sun_gear_assembly');
    const manifest = createManifest([firstNode, secondNode]);
    render(
      <ModelHost>
        <ComponentRow
          {...rowProperties({ manifest, node: firstNode, hoveredComponentId: secondComponentId, isIsolated: true })}
        />
        <ComponentRow {...rowProperties({ manifest, node: secondNode, hoveredComponentId: secondComponentId })} />
      </ModelHost>,
    );

    expect(screen.getByRole('button', { name: 'Remove isolation for planetary_housing' }).tabIndex).toBe(-1);
    expect(screen.getByRole('button', { name: 'Isolate sun_gear_assembly' }).tabIndex).toBe(-1);
  });

  it('should place the keyboard context menu beside its focused part', () => {
    renderComponentRow(rowProperties({ node: createNode(firstComponentId, 'planetary_housing') }));
    const button = screen.getByRole('button', { name: 'planetary_housing' });
    const row = button.closest('[data-model-component-row]');
    if (!row) {
      throw new Error('Part row missing');
    }
    const contextMenu = vi.fn();
    row.addEventListener('contextmenu', contextMenu);
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ left: 40, width: 120, bottom: 72 } as DOMRect);

    fireEvent.keyDown(button, { key: 'F10', shiftKey: true });
    expect(contextMenu).toHaveBeenCalledOnce();
    expect(contextMenu.mock.calls[0]?.[0]).toMatchObject({ clientX: 100, clientY: 72 });
  });

  it('should toggle isolation from the first-class target button', async () => {
    const graphicsRef = createStaticGraphicsRef();
    renderComponentRow(rowProperties({ node: createNode(firstComponentId, 'planetary_housing'), graphicsRef }));

    await userEvent.setup().click(screen.getByRole('button', { name: 'Isolate planetary_housing' }));

    expect(graphicsRef.sent).toContainEqual({
      type: 'isolateModelComponent',
      unitId,
      componentId: firstComponentId,
      source: 'explorer',
    });
  });

  it('should clear isolation from an already isolated row target button', async () => {
    const graphicsRef = createStaticGraphicsRef();
    renderComponentRow(
      rowProperties({ node: createNode(firstComponentId, 'planetary_housing'), graphicsRef, isIsolated: true }),
    );

    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove isolation for planetary_housing' }));

    expect(graphicsRef.sent).toContainEqual({
      type: 'clearModelComponentIsolation',
      unitId,
      source: 'explorer',
    });
  });
});
