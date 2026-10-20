import { act, render, renderHook, screen } from '@testing-library/react';
import { createActor, createAsyncLogic } from 'xstate';
import { afterEach, describe, expect, it } from 'vitest';
import type { Mechanism } from '@taucad/kinematics';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import { GraphicsProvider } from '@taucad/viewer/hooks/use-graphics';
import { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import {
  HoveredModelComponentBadge,
  ModelComponentNameBadge,
  placeModelComponentNameBadge,
  useHoveredModelComponentName,
} from '#component-menu/component-name-badge.jsx';

const boxOf = (element: Element, box: { left: number; top: number; width: number; height: number }): void => {
  element.getBoundingClientRect = () =>
    DOMRect.fromRect({ x: box.left, y: box.top, width: box.width, height: box.height });
};

describe('placeModelComponentNameBadge', () => {
  it('should place the label below and right of the pointer, relative to the layout', () => {
    const layout = document.createElement('div');
    boxOf(layout, { left: 10, top: 20, width: 600, height: 400 });

    placeModelComponentNameBadge(layout, { clientX: 74, clientY: 92 });

    expect(layout.style.getPropertyValue('--viewer-hover-label-x')).toBe('64px');
    expect(layout.style.getPropertyValue('--viewer-hover-label-y')).toBe('72px');
    expect(layout.style.getPropertyValue('--viewer-hover-label-translate-x')).toBe('8px');
    expect(layout.style.getPropertyValue('--viewer-hover-label-translate-y')).toBe('10px');
  });

  it('should flip the label left near the right edge and above near the controls', () => {
    const layout = document.createElement('div');
    const controls = document.createElement('div');
    boxOf(layout, { left: 0, top: 0, width: 600, height: 400 });
    boxOf(controls, { left: 0, top: 340, width: 600, height: 60 });

    placeModelComponentNameBadge(layout, { clientX: 500, clientY: 300 }, controls);

    expect(layout.style.getPropertyValue('--viewer-hover-label-translate-x')).toBe('calc(-100% - 8px)');
    expect(layout.style.getPropertyValue('--viewer-hover-label-translate-y')).toBe('calc(-100% - 10px)');
  });

  it('should keep the label inside the layout when the pointer leaves it mid-move', () => {
    const layout = document.createElement('div');
    boxOf(layout, { left: 0, top: 0, width: 300, height: 200 });

    placeModelComponentNameBadge(layout, { clientX: -40, clientY: 260 });

    expect(layout.style.getPropertyValue('--viewer-hover-label-x')).toBe('0px');
    expect(layout.style.getPropertyValue('--viewer-hover-label-y')).toBe('200px');
  });
});

describe('ModelComponentNameBadge', () => {
  it('should name the part and its detail without taking the pointer or the accessibility tree', () => {
    render(<ModelComponentNameBadge componentName='Herringbone gear' detail='Revolute · hub · drag to move' />);

    const badge = screen.getByTestId('model-component-name-badge');
    expect(badge).toHaveTextContent('Herringbone gear');
    expect(badge).toHaveTextContent('Revolute · hub · drag to move');
    expect(badge).toHaveAttribute('aria-hidden', 'true');
    expect(badge).toHaveClass('pointer-events-none');
  });
});

const unitId = 'file:gear.py';
const capabilities: GeometryComponentManifest['capabilities'] = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [],
};
const partNode = (id: string, name: string): GeometryComponentNode => ({
  id,
  name,
  kind: 'part',
  selector: id,
  parentId: 'root',
  childIds: [],
  depth: 1,
  path: ['Model', name],
  meshNodeIndices: [],
  primitiveIndices: [],
  materialIndices: [],
  capabilities,
});
const manifest: GeometryComponentManifest = {
  schemaVersion: 1,
  rootId: 'root',
  nodeOrder: ['root', 'component:gear', 'component:base'],
  capabilities,
  nodesById: {
    root: { ...partNode('root', 'Model'), kind: 'model', parentId: undefined, depth: 0, path: ['Model'] },
    'component:gear': partNode('component:gear', 'Herringbone gear'),
    'component:base': partNode('component:base', 'Base'),
  },
};
const mechanism: Mechanism = {
  schemaVersion: 1,
  units: { length: 'mm', angle: 'deg' },
  root: 'base',
  links: { base: { components: ['component:base'] }, gear: { components: ['component:gear'] } },
  joints: { hub: { type: 'revolute', parent: 'base', child: 'gear', origin: [0, 0, 0], axis: [0, 0, 1] } },
};

/** A real graphics actor with the gear's manifest loaded; WebGPU probing answers no, as in jsdom. */
const createGraphics = () => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  ).start();
  const { modelInteractionRef } = actor.getSnapshot().context;
  modelInteractionRef.send({ type: 'loadManifest', unitId, manifest });
  return actor;
};

type GraphicsActor = ReturnType<typeof createGraphics>;
let graphics: GraphicsActor | undefined;
afterEach(() => {
  graphics?.stop();
  graphics = undefined;
});

const hover = (actor: GraphicsActor, componentId: string | undefined): void => {
  act(() => {
    actor.getSnapshot().context.modelInteractionRef.send({ type: 'setHoveredComponent', unitId, componentId });
  });
};

describe('useHoveredModelComponentName', () => {
  it('should name the hovered part as the manifest names it, and nothing once the pointer leaves it', () => {
    graphics = createGraphics();
    const actor = graphics;
    const { result } = renderHook(() => useHoveredModelComponentName(unitId), {
      wrapper: ({ children }) => <GraphicsProvider graphicsRef={actor}>{children}</GraphicsProvider>,
    });
    expect(result.current).toBeUndefined();

    hover(actor, 'component:gear');
    expect(result.current).toEqual({ name: 'Herringbone gear' });

    hover(actor, undefined);
    expect(result.current).toBeUndefined();
  });

  it('should add what the part does while its mechanism can be dragged', () => {
    graphics = createGraphics();
    const actor = graphics;
    const { kinematicsRef } = actor.getSnapshot().context;
    kinematicsRef.send({ type: 'loadMechanism', unitId, mechanism });
    kinematicsRef.send({ type: 'setDragEnabled', unitId, enabled: true });
    const { result } = renderHook(() => useHoveredModelComponentName(unitId), {
      wrapper: ({ children }) => <GraphicsProvider graphicsRef={actor}>{children}</GraphicsProvider>,
    });

    hover(actor, 'component:gear');
    expect(result.current).toEqual({ name: 'Herringbone gear', detail: 'Revolute · hub · drag to move' });
    hover(actor, 'component:base');
    expect(result.current).toEqual({ name: 'Base', detail: 'Grounded · does not move' });
  });
});

describe('HoveredModelComponentBadge', () => {
  it('should draw the hovered part until suppressed', () => {
    graphics = createGraphics();
    const actor = graphics;
    const view = (isSuppressed: boolean) => (
      <GraphicsProvider graphicsRef={actor}>
        <HoveredModelComponentBadge unitId={unitId} isSuppressed={isSuppressed} />
      </GraphicsProvider>
    );
    const { rerender } = render(view(false));
    hover(actor, 'component:gear');
    expect(screen.getByTestId('model-component-name-badge')).toHaveTextContent('Herringbone gear');

    rerender(view(true));
    expect(screen.queryByTestId('model-component-name-badge')).toBeNull();
  });
});
