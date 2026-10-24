import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { GraphicsProvider } from '@taucad/viewer/hooks/use-graphics';
import type { ModelComponentActionMenuData } from '#component-menu/component-action-menu.jsx';
import { useViewerPartMenu } from '#component-menu/use-viewer-part-menu.jsx';
import { ViewerStage } from '#shell/viewer-stage.jsx';
import type { ViewerStageCanvasProps, ViewerStageProps } from '#shell/viewer-stage.jsx';
import {
  createViewerGraphics,
  firePointer,
  gearComponentId,
  hoverViewerComponent,
  showViewerModel,
  viewerUnitId,
} from '#shell/viewer-graphics.test-utils.js';
import type { ViewerGraphics } from '#shell/viewer-graphics.test-utils.js';

let graphics: ViewerGraphics | undefined;
afterEach(() => {
  graphics?.stop();
  graphics = undefined;
});

const canvas: { props?: ViewerStageCanvasProps } = {};

const renderCanvas = (props: ViewerStageCanvasProps): React.ReactNode => {
  canvas.props = props;
  return <div data-testid='canvas' />;
};

type StageOptions = Omit<ViewerStageProps, 'graphicsRef' | 'regionId' | 'renderCanvas' | 'partMenu'> & {
  readonly hasPartMenu?: boolean;
};

function Stage({ graphicsRef, hasPartMenu = true, ...props }: StageOptions & { readonly graphicsRef: ViewerGraphics }) {
  const partMenu = useViewerPartMenu({ graphicsRef });
  return (
    <ViewerStage
      graphicsRef={graphicsRef}
      regionId='viewer-canvas-test'
      renderCanvas={renderCanvas}
      partMenu={hasPartMenu ? partMenu : undefined}
      {...props}
    />
  );
}

const renderStage = (options: StageOptions = {}) => {
  graphics = createViewerGraphics();
  const graphicsRef = graphics;
  const view = render(
    <KeyboardProvider>
      <TooltipProvider>
        <GraphicsProvider graphicsRef={graphicsRef}>
          <Stage graphicsRef={graphicsRef} {...options} />
        </GraphicsProvider>
      </TooltipProvider>
    </KeyboardProvider>,
  );
  const region = screen.getByRole('application', { name: 'CAD canvas' });
  const layout = region.closest<HTMLElement>('[data-slot="viewer-stage"]')!;
  return { ...view, graphicsRef, region, layout };
};

const boxOf = (element: Element, box: { left: number; top: number; width: number; height: number }): void => {
  element.getBoundingClientRect = () =>
    DOMRect.fromRect({ x: box.left, y: box.top, width: box.width, height: box.height });
};

describe('ViewerStage', () => {
  describe('canvas region', () => {
    it('should hand the canvas its region as event source and view cube container', () => {
      const { region } = renderStage();

      expect(region).toHaveAttribute('id', 'viewer-canvas-test');
      expect(region).toHaveAttribute('tabindex', '0');
      expect(canvas.props?.gizmoContainer).toBe('#viewer-canvas-test');
      expect(canvas.props?.eventSource.current).toBe(region);
      expect(canvas.props?.onComponentSecondaryPointerCandidate).toBeTypeOf('function');
    });

    it('should take no focus and offer no part menu without one', () => {
      const { region } = renderStage({ hasPartMenu: false });

      expect(region).not.toHaveAttribute('tabindex');
      expect(canvas.props?.onComponentSecondaryPointerCandidate).toBeUndefined();
      expect(canvas.props?.eventSource.current).toBe(region);
    });

    it('should open the part menu on a right press that stays on a part', () => {
      const { region } = renderStage();
      showViewerModel(graphics!, 'model-1');

      firePointer(region, 'pointerdown', { button: 2, pointerId: 3, clientX: 50, clientY: 50 });
      act(() => {
        canvas.props?.onComponentSecondaryPointerCandidate?.({ unitId: viewerUnitId, componentId: gearComponentId });
      });
      firePointer(region, 'pointerup', { button: 2, pointerId: 3, clientX: 51, clientY: 50 });

      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  describe('hover label', () => {
    it('should name the hovered part beside the pointer and hide it when the pointer leaves', () => {
      const { region, layout } = renderStage();
      boxOf(layout, { left: 0, top: 0, width: 800, height: 600 });
      showViewerModel(graphics!, 'model-1');
      hoverViewerComponent(graphics!, gearComponentId);

      firePointer(region, 'pointermove', { clientX: 120, clientY: 80 });

      expect(screen.getByTestId('model-component-name-badge')).toHaveTextContent('Herringbone gear');
      expect(layout.style.getPropertyValue('--viewer-hover-label-x')).toBe('120px');
      expect(layout.style.getPropertyValue('--viewer-hover-label-translate-y')).toBe('10px');

      fireEvent.pointerLeave(region);

      expect(screen.queryByTestId('model-component-name-badge')).not.toBeInTheDocument();
    });

    it('should flip the label above the pointer near the bottom controls', () => {
      const { region, layout, container } = renderStage({ controls: <div>Controls</div> });
      boxOf(layout, { left: 0, top: 0, width: 800, height: 600 });
      boxOf(container.querySelector('[data-slot="viewer-controls"]')!, { left: 0, top: 540, width: 800, height: 60 });
      showViewerModel(graphics!, 'model-1');
      hoverViewerComponent(graphics!, gearComponentId);

      firePointer(region, 'pointermove', { clientX: 120, clientY: 500 });

      expect(layout.style.getPropertyValue('--viewer-hover-label-translate-y')).toBe('calc(-100% - 10px)');
    });

    it('should hide the label while the part menu is open', () => {
      const { region } = renderStage();
      showViewerModel(graphics!, 'model-1');
      hoverViewerComponent(graphics!, gearComponentId);
      firePointer(region, 'pointermove', { clientX: 50, clientY: 50 });
      expect(screen.getByTestId('model-component-name-badge')).toBeInTheDocument();

      firePointer(region, 'pointerdown', { button: 2, pointerId: 3, clientX: 50, clientY: 50 });
      act(() => {
        canvas.props?.onComponentSecondaryPointerCandidate?.({ unitId: viewerUnitId, componentId: gearComponentId });
      });
      firePointer(region, 'pointerup', { button: 2, pointerId: 3, clientX: 50, clientY: 50 });

      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.queryByTestId('model-component-name-badge')).not.toBeInTheDocument();
    });

    it('should follow the host on whether a model is drawn', () => {
      const { region } = renderStage({ isModelShown: false });
      showViewerModel(graphics!, 'model-1');
      hoverViewerComponent(graphics!, gearComponentId);

      firePointer(region, 'pointermove', { clientX: 50, clientY: 50 });

      expect(screen.queryByTestId('model-component-name-badge')).not.toBeInTheDocument();
    });

    it('should show no label while no model is drawn', () => {
      const { region } = renderStage();
      hoverViewerComponent(graphics!, gearComponentId);

      firePointer(region, 'pointermove', { clientX: 50, clientY: 50 });

      expect(screen.queryByTestId('model-component-name-badge')).not.toBeInTheDocument();
    });
  });

  describe('decoratePartMenu', () => {
    it('should hand the open menu the host decoration', () => {
      const decoratePartMenu = vi.fn((data: ModelComponentActionMenuData) => data);
      const { region } = renderStage({ decoratePartMenu });
      showViewerModel(graphics!, 'model-1');

      firePointer(region, 'pointerdown', { button: 2, pointerId: 3, clientX: 50, clientY: 50 });
      act(() => {
        canvas.props?.onComponentSecondaryPointerCandidate?.({ unitId: viewerUnitId, componentId: gearComponentId });
      });
      firePointer(region, 'pointerup', { button: 2, pointerId: 3, clientX: 50, clientY: 50 });

      expect(decoratePartMenu).toHaveBeenCalledWith(expect.objectContaining({ unitId: viewerUnitId }));
    });
  });

  describe('status', () => {
    it('should centre the loading pill while no model is drawn and raise it over a model', () => {
      const { container } = renderStage({ status: { kind: 'loading', label: 'Loading gear.glb', progress: 0.42 } });

      expect(screen.getByRole('status')).toHaveTextContent('Loading gear.glb…42%');
      const slot = container.querySelector('[data-slot="viewer-status"]');
      expect(slot).toHaveClass('top-1/2');

      showViewerModel(graphics!, 'model-1');

      expect(slot).toHaveClass('top-[clamp(5rem,16%,8rem)]');
      expect(slot).not.toHaveClass('top-1/2');
    });

    it('should draw a failure as the runtime error overlay inside the region', () => {
      const { region } = renderStage({ status: { kind: 'failed', message: 'Invalid GLB header' } });

      const alert = screen.getByRole('alert', { name: 'CAD runtime error' });
      expect(alert).toHaveTextContent('Invalid GLB header');
      expect(region).toContainElement(alert);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('should draw the host status content in the status slot', () => {
      renderStage({ statusExtra: <p>Upgrade to keep building</p> });

      expect(screen.getByText('Upgrade to keep building').closest('[data-slot="viewer-status"]')).not.toBeNull();
    });
  });

  describe('slots', () => {
    it('should draw host overlays in the region and the controls over its bottom', () => {
      const { region, container } = renderStage({
        controls: <button type='button'>Fit</button>,
        children: <p>Empty</p>,
      });

      expect(region).toContainElement(screen.getByText('Empty'));
      expect(container.querySelector('[data-slot="viewer-controls"]')).toContainElement(
        screen.getByRole('button', { name: 'Fit' }),
      );
    });
  });
});
