import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { ModelComponentActionMenuData } from '#component-menu/component-action-menu.jsx';
import { useViewerPartMenu } from '#component-menu/use-viewer-part-menu.jsx';
import type {
  UseViewerPartMenuOptions,
  ViewerPartMenu,
  ViewerPartMenuDecorator,
} from '#component-menu/use-viewer-part-menu.jsx';
import {
  createViewerGraphics,
  firePointer,
  gearComponentId,
  selectViewerComponent,
  showViewerModel,
  viewerUnitId,
} from '#shell/viewer-graphics.test-utils.js';
import type { ViewerGraphics } from '#shell/viewer-graphics.test-utils.js';

let graphics: ViewerGraphics | undefined;
afterEach(() => {
  graphics?.stop();
  graphics = undefined;
});

const latest: { menu?: ViewerPartMenu } = {};

type HarnessOptions = Omit<UseViewerPartMenuOptions, 'graphicsRef'> & {
  readonly decoratePartMenu?: ViewerPartMenuDecorator;
};

function Harness({
  decoratePartMenu,
  ...options
}: HarnessOptions & { readonly graphicsRef: ViewerGraphics }): React.JSX.Element {
  const partMenu = useViewerPartMenu(options);
  latest.menu = partMenu;
  return (
    <div data-viewer-frame>
      <section
        {...partMenu.regionProps}
        tabIndex={0}
        aria-label='CAD canvas'
        data-open={partMenu.isOpen ? 'true' : 'false'}
      />
      {partMenu.renderMenu(decoratePartMenu)}
    </div>
  );
}

const renderHarness = (options: HarnessOptions = {}) => {
  graphics = createViewerGraphics();
  const graphicsRef = graphics;
  render(
    <KeyboardProvider>
      <TooltipProvider>
        <Harness graphicsRef={graphicsRef} {...options} />
      </TooltipProvider>
    </KeyboardProvider>,
  );
  return { graphicsRef, region: screen.getByRole('region', { name: 'CAD canvas' }) };
};

const gearTarget = { unitId: viewerUnitId, componentId: gearComponentId };

/** A right press on the gear that moves `distance` px before release. */
const rightPress = (region: HTMLElement, distance: number): void => {
  firePointer(region, 'pointerdown', { button: 2, pointerId: 7, clientX: 100, clientY: 100 });
  act(() => {
    latest.menu?.onComponentSecondaryPointerCandidate(gearTarget);
  });
  firePointer(region, 'pointermove', { pointerId: 7, clientX: 100 + distance, clientY: 100 });
  firePointer(region, 'pointerup', { button: 2, pointerId: 7, clientX: 100 + distance, clientY: 100 });
};

describe('useViewerPartMenu', () => {
  describe('secondary gesture', () => {
    it('should open the part menu when a right press on a part stays within 4 px', () => {
      const { region } = renderHarness();
      showViewerModel(graphics!, 'model-1');

      rightPress(region, 3);

      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(region).toHaveAttribute('data-open', 'true');
    });

    it('should pan instead of opening the menu when the press travels past 4 px', () => {
      const { region, graphicsRef } = renderHarness();

      rightPress(region, 12);

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      // The pan marks the gesture as moved, so the release does not also click the part.
      expect(graphicsRef.getSnapshot().context.suppressNextModelPointerClick).toBe(true);
    });

    it('should suppress the browser context menu over the region', () => {
      const { region } = renderHarness();

      const wasNotPrevented = fireEvent.contextMenu(region);

      expect(wasNotPrevented).toBe(false);
    });

    it('should close the menu once the graphics actor shows another model', () => {
      const { region } = renderHarness();
      showViewerModel(graphics!, 'model-1');
      rightPress(region, 0);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      showViewerModel(graphics!, 'model-2');

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(latest.menu?.isOpen).toBe(false);
    });
  });

  describe('keyboard route', () => {
    it('should open the selected part menu on Shift+F10 on its first item and hand focus back on Escape', async () => {
      const user = userEvent.setup();
      const { region } = renderHarness();
      selectViewerComponent(graphics!, gearComponentId);
      region.focus();

      await user.keyboard('{Shift>}{F10}{/Shift}');

      const menu = screen.getByRole('menu');
      expect(menu.querySelector('[role="menuitem"]')).toHaveFocus();

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(region).toHaveFocus();
    });

    it('should open nothing from the keys while no part is selected', async () => {
      const user = userEvent.setup();
      const { region } = renderHarness();
      region.focus();

      await user.keyboard('{Shift>}{F10}{/Shift}');

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('selected part', () => {
    it('should derive the selected part menu from the model interaction machine', () => {
      renderHarness();
      expect(latest.menu?.selectedMenu).toBeUndefined();

      selectViewerComponent(graphics!, gearComponentId);

      expect(latest.menu?.selectedMenu?.node.name).toBe('Herringbone gear');
      expect(latest.menu?.selectedMenu?.source).toBe('viewer');
    });
  });

  describe('decoratePartMenu', () => {
    it('should pass the canvas menu data through the host decoration', () => {
      const decoratePartMenu = vi.fn(
        (data: ModelComponentActionMenuData): ModelComponentActionMenuData => ({ ...data, onRetryPreview: vi.fn() }),
      );
      const { region } = renderHarness({ decoratePartMenu });

      rightPress(region, 0);

      expect(decoratePartMenu).toHaveBeenCalledWith(expect.objectContaining({ unitId: viewerUnitId }));
      // The host reads the undecorated data, for example to prepare the part's thumbnail.
      expect(latest.menu?.openMenuData?.node.id).toBe(gearComponentId);
      expect(latest.menu?.openMenuData).not.toHaveProperty('onRetryPreview');
    });
  });

  describe('stability', () => {
    it('should keep its region props and callbacks across rerenders', () => {
      renderHarness();
      const first = latest.menu;

      selectViewerComponent(graphics!, gearComponentId);

      expect(latest.menu?.regionProps).toBe(first?.regionProps);
      expect(latest.menu?.close).toBe(first?.close);
      expect(latest.menu?.onComponentSecondaryPointerCandidate).toBe(first?.onComponentSecondaryPointerCandidate);
    });
  });
});
