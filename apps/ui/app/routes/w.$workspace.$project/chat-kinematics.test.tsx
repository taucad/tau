import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor } from 'xstate';
import type { Actor } from 'xstate';
import type * as KinematicsModule from '@taucad/kinematics';
import type { Mechanism } from '@taucad/kinematics';
import type { KernelIssue } from '@taucad/runtime';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { getKinematicsUnitState, kinematicsMachine } from '#machines/kinematics.machine.js';
import { KinematicsPanelBody } from '#routes/w.$workspace.$project/chat-kinematics.js';
import { WorkspaceLanesContext } from '#routes/w.$workspace.$project/project-workspace-context.js';

const solvePose = vi.hoisted(() => vi.fn());
vi.mock('@taucad/kinematics', async (importOriginal) => ({
  ...(await importOriginal<typeof KinematicsModule>()),
  solvePose,
}));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: (): boolean => false }));

// A static stand-in for a subscribable actor: the pane only selects from these.
const staticRef = <T,>(snapshot: T) => ({ getSnapshot: () => snapshot, subscribe: () => ({ unsubscribe: vi.fn() }) });

const project = vi.hoisted(() => ({
  geometryUnits: new Map<string, unknown>(),
  viewGraphics: new Map<string, unknown>(),
  editorRef: undefined as unknown,
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ ...project, mainEntryPath: 'main.ts' }),
}));

vi.mock('dockview-react', () => ({
  PaneviewReact: ({
    onReady,
    components,
    headerComponents,
  }: {
    onReady: (event: { api: unknown }) => void;
    components: Record<string, React.ComponentType<{ params: Record<string, unknown> }>>;
    headerComponents: Record<string, React.ComponentType<{ api: unknown; params: Record<string, unknown> }>>;
  }) => {
    const panels: Array<{ id: string; component: string; headerComponent: string; params: Record<string, unknown> }> =
      [];
    onReady({ api: { addPanel: (panel: (typeof panels)[number]) => panels.push(panel), getPanel: () => undefined } });
    const panelApi = { isExpanded: true, onDidExpansionChange: () => ({ dispose: vi.fn() }), setExpanded: vi.fn() };
    return panels.map((panel) => {
      const Header = headerComponents[panel.headerComponent]!;
      const Body = components[panel.component]!;
      return (
        <div key={panel.id}>
          <Header api={panelApi} params={panel.params} />
          <Body params={panel.params} />
        </div>
      );
    });
  },
}));

beforeAll(() => {
  globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const unitId = 'file:main.ts';
const degrees = Math.PI / 180;

// Wire units: metres and radians. The pane shows degrees and millimetres.
const mechanism: Mechanism = {
  schemaVersion: 1,
  units: { length: 'm', angle: 'rad' },
  root: 'base',
  links: {
    base: { components: ['component:base'] },
    sun: { components: ['component:sun'] },
    carrier: { components: ['component:carrier'] },
    arm: { components: ['component:arm'] },
    slide: { components: ['component:slide'] },
  },
  joints: {
    sun: { type: 'revolute', parent: 'base', child: 'sun', origin: [0, 0, 0], axis: [0, 0, 1] },
    carrier: { type: 'revolute', parent: 'base', child: 'carrier', origin: [0, 0, 0], axis: [0, 0, 1] },
    arm: {
      type: 'revolute',
      parent: 'base',
      child: 'arm',
      origin: [0, 0, 0],
      axis: [0, 0, 1],
      limits: { lower: -45 * degrees, upper: 90 * degrees },
    },
    slide: {
      type: 'prismatic',
      parent: 'base',
      child: 'slide',
      origin: [0, 0, 0],
      axis: [1, 0, 0],
      limits: { lower: 0, upper: 0.05 },
    },
  },
  couplings: [{ driver: 'sun', follower: 'carrier', ratio: 0.25 }],
  animations: [
    {
      id: 'four-sun-turns',
      name: 'Four sun turns',
      duration: 4,
      keyframes: [
        { time: 0, coordinates: { sun: 0 } },
        { time: 4, coordinates: { sun: 8 * Math.PI } },
      ],
    },
  ],
};

type VisibilityListener = (event: { readonly isVisible: boolean }) => void;

/** A dockview panel API reduced to the visibility the pane reads. */
function createPanelVisibility(isVisible: boolean) {
  const listeners = new Set<VisibilityListener>();
  const panelApi = {
    isVisible,
    onDidVisibilityChange: (listener: VisibilityListener) => {
      listeners.add(listener);
      return {
        dispose: () => {
          listeners.delete(listener);
        },
      };
    },
  };
  const setVisible = (next: boolean): void => {
    act(() => {
      panelApi.isVisible = next;
      for (const listener of listeners) {
        listener({ isVisible: next });
      }
    });
  };
  return { panelApi, setVisible };
}

let kinematics: Actor<typeof kinematicsMachine>;
const unit = () => getKinematicsUnitState(kinematics.getSnapshot().context, unitId);

function renderPane({
  withViewer = true,
  withMechanism = true,
  loaded = mechanism,
  entryPath = 'main.ts',
  isBuilding = false,
  kernelIssues = [],
  panelApi,
}: {
  readonly withViewer?: boolean;
  readonly withMechanism?: boolean;
  readonly loaded?: Mechanism;
  readonly entryPath?: string;
  readonly isBuilding?: boolean;
  readonly kernelIssues?: readonly KernelIssue[];
  readonly panelApi?: ReturnType<typeof createPanelVisibility>['panelApi'];
} = {}) {
  kinematics = createActor(kinematicsMachine, { input: {} }).start();
  if (withMechanism) {
    kinematics.send({ type: 'loadMechanism', unitId: `file:${entryPath}`, mechanism: loaded });
  }
  project.geometryUnits = new Map([
    [
      entryPath,
      staticRef({
        hasTag: (tag: string) => isBuilding && tag === 'cad-loading',
        context: { kernelIssues: new Map([[entryPath, kernelIssues]]) },
      }),
    ],
  ]);
  project.viewGraphics = new Map(withViewer ? [['view-1', staticRef({ context: { kinematicsRef: kinematics } })]] : []);
  project.editorRef = staticRef({ context: { viewSettings: { 'view-1': { entryPath } } } });
  return render(
    <TooltipProvider>
      <KinematicsPanelBody panelApi={panelApi} />
    </TooltipProvider>,
  );
}

const workbenchShown = { chat: true, workbench: true };
const workbenchHidden = { chat: true, workbench: false };

const field = (name: string) => screen.getByRole('textbox', { name });
const statusRegion = () => screen.getByRole('status', { name: 'Kinematics status' });
const alertRegion = () => screen.getByRole('alert', { name: 'Kinematics error' });

describe('KinematicsPanelBody', () => {
  beforeEach(() => {
    solvePose.mockReset();
  });

  it('should render driver sliders in degrees and millimetres and describe read-only followers by joint, relation and range', () => {
    renderPane();

    expect(field('sun')).toHaveValue('0');
    expect(field('arm')).not.toHaveAttribute('readonly');
    expect(field('slide')).toBeInTheDocument();
    expect(field('carrier')).toHaveAttribute('readonly');
    expect(field('carrier')).toHaveAccessibleDescription('Revolute joint · follower. = 0.25 × sun. Unlimited range');
    expect(field('arm')).toHaveAccessibleDescription('Revolute joint · driver. Range -45° to 90°');
    expect(field('slide')).toHaveAccessibleDescription('Prismatic joint · driver. Range 0 mm to 50 mm');
    expect(screen.getByText('Root base · 5 links · 4 joints')).toBeInTheDocument();
    expect(screen.getByText('Drag parts in the viewer to move them while this pane is open.')).toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent('Ready');
  });

  it('should show a small coupling ratio to four significant digits', () => {
    renderPane();

    act(() => {
      kinematics.send({
        type: 'loadMechanism',
        unitId,
        mechanism: { ...mechanism, couplings: [{ driver: 'sun', follower: 'carrier', ratio: -1 / 30 }] },
      });
    });

    expect(field('carrier')).toHaveAccessibleDescription(expect.stringContaining('= -0.03333 × sun'));
  });

  it('should describe a curve follower by its driver', () => {
    renderPane();

    act(() => {
      kinematics.send({
        type: 'loadMechanism',
        unitId,
        mechanism: {
          ...mechanism,
          couplings: [{ driver: 'sun', follower: 'carrier', curve: { driverPeriod: 360, values: [0, 30, 0, -30] } }],
        },
      });
    });

    expect(field('carrier')).toHaveAccessibleDescription(expect.stringContaining('= curve of sun'));
  });

  it('should convert a typed driver value into mechanism units and derive its followers', async () => {
    const user = userEvent.setup();
    renderPane();

    await user.click(field('sun'));
    await user.clear(field('sun'));
    await user.type(field('sun'), '90{Enter}');
    await user.click(field('slide'));
    await user.clear(field('slide'));
    await user.type(field('slide'), '12.5{Enter}');

    expect(unit().coordinates['sun']).toBeCloseTo(90 * degrees);
    expect(unit().coordinates['slide']).toBeCloseTo(0.0125);
    expect(field('carrier')).toHaveValue('22.5');
  });

  it('should step with arrow keys and jump to the limits with unmodified Home and End only', async () => {
    const user = userEvent.setup();
    renderPane();

    await user.click(field('arm'));
    await user.keyboard('{ArrowUp}');
    expect(unit().coordinates['arm']).toBeCloseTo(degrees);

    // Shift+End extends the text selection; it must not move the joint.
    await user.keyboard('{Shift>}{End}{/Shift}');
    expect(unit().coordinates['arm']).toBeCloseTo(degrees);

    await user.keyboard('{Home}');
    expect(unit().coordinates['arm']).toBeCloseTo(-45 * degrees);

    await user.keyboard('{End}');
    expect(unit().coordinates['arm']).toBeCloseTo(90 * degrees);
  });

  it('should step an unlimited driver on from beyond a full turn without snapping it back', async () => {
    const user = userEvent.setup();
    renderPane();
    // The four-sun-turns clip paused at sun 900° (carrier 225°).
    act(() => {
      kinematics.send({ type: 'play', unitId });
      kinematics.send({ type: 'tick', unitId, elapsed: 2.5 });
      kinematics.send({ type: 'pause', unitId });
    });
    expect(field('sun')).toHaveValue('900');

    await user.click(field('sun'));
    await user.keyboard('{ArrowUp}');

    expect(unit().coordinates['sun']).toBeCloseTo(901 * degrees);
    expect(field('carrier')).toHaveValue('225.25');

    // A joint without limits has no range ends, so End leaves it where it is.
    await user.keyboard('{End}');
    expect(unit().coordinates['sun']).toBeCloseTo(901 * degrees);
  });

  it('should show an at-limit notice beside a clamped driver', async () => {
    const user = userEvent.setup();
    renderPane();

    await user.click(field('arm'));
    await user.clear(field('arm'));
    await user.type(field('arm'), '120{Enter}');

    expect(field('arm')).toHaveAccessibleDescription('At limit Revolute joint · driver. Range -45° to 90°');
    expect(unit().coordinates['arm']).toBeCloseTo(90 * degrees);
  });

  it('should toggle playback in the playback group and reset to the as-built pose', async () => {
    const user = userEvent.setup();
    renderPane();
    act(() => {
      kinematics.send({ type: 'setCoordinate', unitId, id: 'arm', value: 10 * degrees });
    });
    const playback = within(screen.getByRole('group', { name: 'Playback' }));

    await user.click(playback.getByRole('button', { name: 'Play' }));
    expect(unit().playback).toMatchObject({ status: 'playing', animationId: 'four-sun-turns' });
    expect(statusRegion()).toHaveTextContent('Playing Four sun turns');

    act(() => {
      kinematics.send({ type: 'tick', unitId, elapsed: 1 });
    });
    await user.click(playback.getByRole('button', { name: 'Pause' }));
    expect(unit().playback).toMatchObject({ status: 'paused', time: 1 });
    expect(statusRegion()).toHaveTextContent('Paused at 1.0 s');

    await user.click(playback.getByRole('button', { name: 'Reset pose' }));
    expect(unit().coordinates).toEqual({ sun: 0, arm: 0, slide: 0 });
    expect(unit().playback.status).toBe('stopped');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('should play the chosen animation from the picker, including the driver sweep, at the chosen speed', async () => {
    const user = userEvent.setup();
    renderPane();

    await user.click(screen.getByRole('button', { name: 'Playback speed: 1×' }));
    await user.click(screen.getByRole('option', { name: '2×' }));
    await user.click(screen.getByRole('button', { name: 'Animation: Four sun turns' }));
    await user.click(screen.getByRole('option', { name: 'Sweep drivers' }));

    expect(unit().playback).toMatchObject({ status: 'playing', animationId: undefined, speed: 2 });

    await user.click(screen.getByRole('button', { name: 'Animation: Sweep drivers' }));
    await user.click(screen.getByRole('option', { name: 'Four sun turns' }));

    expect(unit().playback).toMatchObject({ status: 'playing', animationId: 'four-sun-turns' });
  });

  it('should only select a clip from the picker under reduced motion, leaving Play to start it', async () => {
    const user = userEvent.setup();
    const { matchMedia } = globalThis;
    globalThis.matchMedia = (query: string) =>
      mock<MediaQueryList>({ matches: query === '(prefers-reduced-motion: reduce)', media: query });
    try {
      renderPane();

      await user.click(screen.getByRole('button', { name: 'Animation: Four sun turns' }));
      await user.click(screen.getByRole('option', { name: 'Sweep drivers' }));

      expect(unit().playback).toMatchObject({ status: 'stopped', animationId: undefined });
      expect(screen.getByRole('button', { name: 'Animation: Sweep drivers' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Play' }));
      expect(unit().playback).toMatchObject({ status: 'playing', animationId: undefined });
    } finally {
      globalThis.matchMedia = matchMedia;
    }
  });

  it('should report a blocked drag in its own status region, mounted before the notice', () => {
    renderPane();
    const notice = screen.getByRole('status', { name: 'Drag notice' });
    expect(notice).toBeEmptyDOMElement();
    solvePose.mockReturnValue({
      status: 'blocked',
      reason: 'limit',
      pose: { linkTransforms: {}, coordinates: { sun: 0, arm: 90 * degrees, slide: 0, carrier: 0 } },
      iterations: 8,
      residual: 0.1,
    });

    act(() => {
      kinematics.send({ type: 'dragStart', unitId, componentId: 'component:arm', point: [0.01, 0, 0] });
      kinematics.send({ type: 'dragMove', unitId, target: [0, 0.2, 0] });
    });

    expect(screen.getByRole('status', { name: 'Drag notice' })).toBe(notice);
    expect(notice).toHaveTextContent(
      'Drag blocked: a joint reached its limit. The part follows as far as the mechanism allows.',
    );
  });

  it('should not report the projection of an unreachable drag target', () => {
    renderPane();
    solvePose.mockReturnValue({
      status: 'blocked',
      reason: 'unreachable',
      pose: { linkTransforms: {}, coordinates: { sun: 0, arm: 30 * degrees, slide: 0, carrier: 0 } },
      iterations: 12,
      residual: 0.05,
    });

    act(() => {
      kinematics.send({ type: 'dragStart', unitId, componentId: 'component:arm', point: [0.01, 0, 0] });
      kinematics.send({ type: 'dragMove', unitId, target: [0, 0.2, 0] });
    });

    expect(unit().drag).toMatchObject({ status: 'blocked', reason: 'unreachable' });
    expect(screen.getByRole('status', { name: 'Drag notice' })).toBeEmptyDOMElement();
  });

  it('should write a refused pose into the mounted alert region and keep the status', () => {
    renderPane();
    const status = statusRegion();
    const alert = alertRegion();
    expect(alert).toBeEmptyDOMElement();

    act(() => {
      kinematics.send({ type: 'setCoordinate', unitId, id: 'carrier', value: 1 });
    });

    expect(alertRegion()).toBe(alert);
    expect(alert).toHaveTextContent(/^Pose not applied: .*The last valid pose is kept\.$/);
    expect(statusRegion()).toBe(status);
    expect(status).toHaveTextContent('Ready');
  });

  it('should filter joints by name', async () => {
    const user = userEvent.setup();
    renderPane();

    await user.type(screen.getByRole('searchbox', { name: 'Filter joints' }), 'arm');

    expect(field('arm')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'sun' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'carrier' })).not.toBeInTheDocument();
  });

  it('should name the Drivers and Followers regions when the entry path has a space', () => {
    renderPane({ entryPath: 'gear box.ts' });

    expect(screen.getByRole('region', { name: 'Drivers' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Followers' })).toBeInTheDocument();
  });

  it('should give a mechanism without degrees of freedom its own copy and nothing to play', () => {
    renderPane({
      loaded: {
        schemaVersion: 1,
        units: { length: 'm', angle: 'rad' },
        root: 'base',
        links: { base: { components: ['component:base'] }, bracket: { components: ['component:bracket'] } },
        joints: { weld: { type: 'fixed', parent: 'base', child: 'bracket', origin: [0, 0, 0] } },
      },
    });

    expect(screen.getByText('No movable joints. Every joint in this mechanism is fixed.')).toBeInTheDocument();
    expect(screen.queryByText('No matching joints')).not.toBeInTheDocument();
    expect(screen.queryByText(/Drag parts in the viewer/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  describe('empty states', () => {
    it('should explain a model without a mechanism', () => {
      renderPane({ withMechanism: false });

      expect(screen.getByText('This model declares no mechanism')).toBeInTheDocument();
      expect(screen.getByText('export function mechanism')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
    });

    it('should show a loading state rather than the no-mechanism copy during the first build', () => {
      renderPane({ withMechanism: false, isBuilding: true });

      expect(statusRegion()).toHaveAttribute('aria-busy', 'true');
      expect(statusRegion()).toHaveTextContent('Building the model');
      expect(screen.queryByText('This model declares no mechanism')).not.toBeInTheDocument();
    });

    it('should say why the kernel rejected the mechanism', () => {
      const message =
        'Mechanism /links/arm/components/0: No returned shape is named "Armm". Name a shape main() returns.';
      renderPane({
        withMechanism: false,
        kernelIssues: [
          { code: 'INVALID_ANNOTATION', severity: 'warning', message: 'An unrelated warning.' },
          {
            code: 'INVALID_REFERENCE',
            severity: 'warning',
            type: 'kernel',
            message,
            details: {
              producer: { kernelId: 'replicad' },
              mechanism: { code: 'UNKNOWN_COMPONENT', path: '/links/arm/components/0' },
            },
          },
        ],
      });

      expect(alertRegion()).toHaveTextContent('The mechanism could not be loaded');
      expect(alertRegion()).toHaveTextContent(message);
      expect(alertRegion()).not.toHaveTextContent('An unrelated warning.');
      expect(screen.queryByText('This model declares no mechanism')).not.toBeInTheDocument();
    });

    it('should ask for a renderer when no viewer shows the model', () => {
      renderPane({ withViewer: false });

      expect(screen.getByText('Open renderer to pose this model')).toBeInTheDocument();
    });
  });

  describe('viewer drag arming', () => {
    it('should arm viewer drags while it shows the unit and disarm them on unmount', () => {
      const view = renderPane();
      expect(unit().dragEnabled).toBe(true);

      view.unmount();

      expect(unit().dragEnabled).toBe(false);
    });

    it('should disarm viewer drags while dockview hides its panel', () => {
      const { panelApi, setVisible } = createPanelVisibility(false);
      renderPane({ panelApi });
      expect(unit().dragEnabled).toBe(false);

      setVisible(true);
      expect(unit().dragEnabled).toBe(true);

      setVisible(false);
      expect(unit().dragEnabled).toBe(false);
    });

    it('should disarm viewer drags while the workbench lane is hidden', () => {
      const view = renderPane();
      const renderInLanes = (workbench: boolean) => {
        view.rerender(
          <WorkspaceLanesContext.Provider value={workbench ? workbenchShown : workbenchHidden}>
            <TooltipProvider>
              <KinematicsPanelBody />
            </TooltipProvider>
          </WorkspaceLanesContext.Provider>,
        );
      };

      renderInLanes(true);
      expect(unit().dragEnabled).toBe(true);

      renderInLanes(false);
      expect(unit().dragEnabled).toBe(false);

      renderInLanes(true);
      expect(unit().dragEnabled).toBe(true);
    });

    it('should move the arming to the viewer that shows the unit now', () => {
      const view = renderPane();
      const first = kinematics;
      const second = createActor(kinematicsMachine, { input: {} }).start();

      project.viewGraphics = new Map([['view-2', staticRef({ context: { kinematicsRef: second } })]]);
      project.editorRef = staticRef({ context: { viewSettings: { 'view-2': { entryPath: 'main.ts' } } } });
      view.rerender(
        <TooltipProvider>
          <KinematicsPanelBody />
        </TooltipProvider>,
      );

      expect(getKinematicsUnitState(first.getSnapshot().context, unitId).dragEnabled).toBe(false);
      expect(getKinematicsUnitState(second.getSnapshot().context, unitId).dragEnabled).toBe(true);
    });
  });
});
