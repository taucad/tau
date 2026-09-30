import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { VirtuosoMockContext } from 'react-virtuoso';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor } from 'xstate';
import type { Actor } from 'xstate';
import type * as KinematicsModule from '@taucad/kinematics';
import type * as NumberFieldModule from '#components/geometry/parameters/parameters-number-field.js';
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

// Counts each field's renders by name, so a test can show which rows a pose change re-renders.
const fieldRenders = vi.hoisted(() => new Map<string, number>());
vi.mock('#components/geometry/parameters/parameters-number-field.js', async (importOriginal) => {
  const actual = await importOriginal<typeof NumberFieldModule>();
  return {
    ...actual,
    ParametersNumberField(props: React.ComponentProps<typeof actual.ParametersNumberField>) {
      const label = props['aria-label'] ?? '';
      fieldRenders.set(label, (fieldRenders.get(label) ?? 0) + 1);
      return <actual.ParametersNumberField {...props} />;
    },
  };
});

// A static stand-in for a subscribable actor: the pane only selects from these.
const staticRef = <T,>(snapshot: T) => ({ getSnapshot: () => snapshot, subscribe: () => ({ unsubscribe: vi.fn() }) });

const project = vi.hoisted(() => ({
  viewEntryPaths: new Map<string, string>(),
  geometryUnits: new Map<string, unknown>(),
  viewGraphics: new Map<string, unknown>(),
  editorRef: undefined as unknown,
  projectRef: { send: vi.fn() },
}));

type RevealListener = (event: { entryPath: string; unitId: string; componentId: string }) => void;
const revealListeners = new Set<RevealListener>();

/** The editor as the pane reads it: view settings, and the reveal the part menu emits. */
const editorRef = (viewSettings: Record<string, { entryPath: string }>) => ({
  ...staticRef({ context: { viewSettings } }),
  on: (_type: 'kinematicsRevealRequested', listener: RevealListener) => {
    revealListeners.add(listener);
    return {
      unsubscribe: () => {
        revealListeners.delete(listener);
      },
    };
  },
});

const requestReveal = (componentId: string): void => {
  act(() => {
    for (const listener of revealListeners) {
      listener({ entryPath: 'main.ts', unitId, componentId });
    }
  });
};
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    ...project,
    mainEntryPath: 'main.ts',
    viewRecords: new Map(
      Object.entries(
        (
          project.editorRef as
            | { getSnapshot?: () => { context: { viewSettings: Record<string, { entryPath: string }> } } }
            | undefined
        )?.getSnapshot?.().context.viewSettings ?? {},
      ),
    ),
  }),
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
  // Neither exists in jsdom: a reveal waits on running animations, then scrolls the pane's scroller.
  globalThis.HTMLElement.prototype.scrollTo = vi.fn();
  globalThis.HTMLElement.prototype.getAnimations = () => [];
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

const mockViewport = { viewportHeight: 180, itemHeight: 80 };

let kinematics: Actor<typeof kinematicsMachine>;
const unit = () => getKinematicsUnitState(kinematics.getSnapshot().context, unitId);

function renderPane({
  virtualViewport = false,
  withViewer = true,
  shared = false,
  withMechanism = true,
  loaded = mechanism,
  entryPath = 'main.ts',
  isBuilding = false,
  kernelIssues = [],
  panelApi,
  partNames = {},
}: {
  readonly virtualViewport?: boolean;
  readonly withViewer?: boolean;
  readonly withMechanism?: boolean;
  readonly shared?: boolean;
  readonly loaded?: Mechanism;
  readonly entryPath?: string;
  readonly isBuilding?: boolean;
  readonly kernelIssues?: readonly KernelIssue[];
  readonly panelApi?: ReturnType<typeof createPanelVisibility>['panelApi'];
  /** Display names of components, as the model's component manifest gives them. */
  readonly partNames?: Readonly<Record<string, string>>;
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
  // The pane reads only node names from the manifest.
  const manifest = { nodesById: Object.fromEntries(Object.entries(partNames).map(([id, name]) => [id, { id, name }])) };
  const modelInteractionRef = staticRef({ context: { unitsById: { [`file:${entryPath}`]: { manifest } } } });
  project.viewGraphics = new Map(
    withViewer ? [['view-1', staticRef({ context: { kinematicsRef: kinematics, modelInteractionRef } })]] : [],
  );
  project.viewEntryPaths = new Map(withViewer ? [['view-1', entryPath]] : []);
  project.editorRef = editorRef(shared ? {} : { 'view-1': { entryPath } });
  return render(
    <TooltipProvider>
      {virtualViewport ? (
        <VirtuosoMockContext.Provider value={mockViewport}>
          <KinematicsPanelBody panelApi={panelApi} />
        </VirtuosoMockContext.Provider>
      ) : (
        <KinematicsPanelBody panelApi={panelApi} />
      )}
    </TooltipProvider>,
  );
}

const workbenchShown = { chat: true, workbench: true };
const workbenchHidden = { chat: true, workbench: false };

const field = (name: string) => screen.getByRole('spinbutton', { name });
const trigger = (name: string) => screen.getByRole('button', { name });

/** The sun's followers start in a closed group; most follower checks open it first. */
async function openSunFollowers(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(trigger('Followers of sun'));
}
const statusRegion = () => screen.getByRole('status', { name: 'Kinematics status' });
const alertRegion = () => screen.getByRole('alert', { name: 'Kinematics error' });

describe('KinematicsPanelBody', () => {
  beforeEach(() => {
    solvePose.mockReset();
    project.projectRef.send.mockClear();
  });

  it('should render driver sliders in degrees and millimetres and describe read-only followers by joint, relation and range', async () => {
    const user = userEvent.setup();
    renderPane();
    await openSunFollowers(user);

    expect(field('sun')).toHaveValue('0');
    expect(field('arm')).not.toHaveAttribute('readonly');
    expect(field('slide')).toBeInTheDocument();
    expect(field('carrier')).toHaveAttribute('readonly');
    expect(field('carrier')).toHaveAccessibleDescription(
      'Revolute joint · follower · carrier. = 0.25 × sun. Unlimited range. Moves 1 part: component:carrier',
    );
    expect(field('arm')).toHaveAccessibleDescription(
      'Revolute joint · driver · arm. Range -45° to 90°. Moves 1 part: component:arm',
    );
    expect(field('slide')).toHaveAccessibleDescription(
      'Prismatic joint · driver · slide. Range 0 mm to 50 mm. Moves 1 part: component:slide',
    );
    expect(screen.getByText('Root base · 5 links · 4 joints · m, rad')).toBeInTheDocument();
    expect(screen.queryByText(/Drag parts in the viewer/)).not.toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent('Ready');
  });

  it('should hold a driver and a closed Followers group in an open group card and keep other drivers as rows', async () => {
    const user = userEvent.setup();
    renderPane();

    expect(trigger('Group: sun')).toHaveAttribute('aria-expanded', 'true');
    expect(trigger('Followers of sun')).toHaveAttribute('aria-expanded', 'false');
    expect(trigger('Followers of sun')).toHaveTextContent('(1)');
    expect(screen.queryByRole('button', { name: 'Group: arm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'carrier' })).not.toBeInTheDocument();
    // Inside its group the driver's control is labelled by what it sets.
    expect(screen.getByText('Angle')).toBeInTheDocument();
    const driverRows = within(screen.getByRole('list', { name: 'Joints and drivers' })).getAllByRole('listitem');
    expect(driverRows[0]).not.toHaveClass('pt-(--pane-group-gap)');
    for (const row of driverRows.slice(1)) {
      expect(row).toHaveClass('pt-(--pane-group-gap)');
    }

    await openSunFollowers(user);
    expect(field('carrier')).toBeInTheDocument();
    expect(screen.getByText('Ratio 0.25')).toBeInTheDocument();

    await user.click(trigger('Group: sun'));
    expect(screen.queryByRole('spinbutton', { name: 'sun' })).not.toBeInTheDocument();
    expect(trigger('Group: sun')).toHaveTextContent('0°');
  });

  it('should read joint names from the mechanism and keep the id in the details', () => {
    renderPane({
      loaded: { ...mechanism, joints: { ...mechanism.joints, arm: { ...mechanism.joints['arm']!, name: 'Shoulder' } } },
    });

    expect(field('Shoulder')).toHaveAccessibleDescription(expect.stringContaining('Revolute joint · driver · arm'));
    expect(screen.queryByRole('spinbutton', { name: 'arm' })).not.toBeInTheDocument();
  });

  it('should show twelve followers and the rest on request', async () => {
    const user = userEvent.setup();
    const vanes = Array.from({ length: 14 }, (_, index) => `vane-${index + 1}`);
    renderPane({
      loaded: {
        ...mechanism,
        links: {
          ...mechanism.links,
          ...Object.fromEntries(vanes.map((id) => [id, { components: [`component:${id}`] }])),
        },
        joints: {
          ...mechanism.joints,
          ...Object.fromEntries(
            vanes.map((id) => [
              id,
              { type: 'revolute', parent: 'base', child: id, origin: [0, 0, 0], axis: [1, 0, 0] },
            ]),
          ),
        },
        couplings: vanes.map((id) => ({ driver: 'arm', follower: id, ratio: 1 })),
      },
    });

    await user.click(trigger('Followers of arm'));
    expect(screen.getByRole('spinbutton', { name: 'vane-12' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'vane-13' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(screen.getByRole('spinbutton', { name: 'vane-14' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Show \d+ more$/u })).not.toBeInTheDocument();
  });

  it('should announce each joint value with its unit and only the limits the joint declares', async () => {
    const user = userEvent.setup();
    renderPane();
    await openSunFollowers(user);

    expect(field('arm')).toHaveAttribute('aria-valuenow', '0');
    expect(field('arm')).toHaveAttribute('aria-valuetext', '0 °');
    expect(Number(field('arm').getAttribute('aria-valuemin'))).toBeCloseTo(-45);
    expect(Number(field('arm').getAttribute('aria-valuemax'))).toBeCloseTo(90);
    expect(field('slide')).toHaveAttribute('aria-valuetext', '0 mm');
    expect(Number(field('slide').getAttribute('aria-valuemax'))).toBeCloseTo(50);
    // An unlimited joint scrubs a window around its value, which is no range to announce.
    expect(field('sun')).toHaveAttribute('aria-valuetext', '0 °');
    expect(field('sun')).not.toHaveAttribute('aria-valuemin');
    expect(field('sun')).not.toHaveAttribute('aria-valuemax');
    expect(field('carrier')).not.toHaveAttribute('aria-valuemax');
  });

  it('should show a small coupling ratio to four significant digits', async () => {
    const user = userEvent.setup();
    renderPane();
    await openSunFollowers(user);

    act(() => {
      kinematics.send({
        type: 'loadMechanism',
        unitId,
        mechanism: { ...mechanism, couplings: [{ driver: 'sun', follower: 'carrier', ratio: -1 / 30 }] },
      });
    });

    expect(field('carrier')).toHaveAccessibleDescription(expect.stringContaining('= -0.03333 × sun'));
    expect(screen.getByText('Ratio -0.03333')).toBeInTheDocument();
  });

  it('should describe a curve follower by its driver', async () => {
    const user = userEvent.setup();
    renderPane();
    await openSunFollowers(user);

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
    expect(screen.getByText('Curve')).toBeInTheDocument();
  });

  it('should convert a typed driver value into mechanism units and derive its followers', async () => {
    const user = userEvent.setup();
    renderPane();
    await openSunFollowers(user);

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
    await openSunFollowers(user);
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

    expect(field('arm')).toHaveAccessibleDescription(
      'At limit Revolute joint · driver · arm. Range -45° to 90°. Moves 1 part: component:arm',
    );
    expect(unit().coordinates['arm']).toBeCloseTo(90 * degrees);
  });

  it('should toggle playback, show the clip time while it runs and reset to the as-built pose from the file mark', async () => {
    const user = userEvent.setup();
    renderPane();
    expect(screen.queryByRole('button', { name: 'Reset pose to as built' })).not.toBeInTheDocument();
    act(() => {
      kinematics.send({ type: 'setCoordinate', unitId, id: 'arm', value: 10 * degrees });
    });
    const playback = within(screen.getByRole('group', { name: 'Playback' }));
    expect(screen.queryByRole('group', { name: 'Timeline' })).not.toBeInTheDocument();

    await user.click(playback.getByRole('button', { name: 'Play' }));
    expect(unit().playback).toMatchObject({ status: 'playing', animationId: 'four-sun-turns' });
    expect(statusRegion()).toHaveTextContent('Playing Four sun turns');

    act(() => {
      kinematics.send({ type: 'tick', unitId, elapsed: 1 });
    });
    expect(screen.getByRole('spinbutton', { name: 'Time' })).toHaveAttribute('aria-valuetext', '1.0 of 4.0 seconds');
    await user.click(playback.getByRole('button', { name: 'Pause' }));
    expect(unit().playback).toMatchObject({ status: 'paused', time: 1 });
    expect(statusRegion()).toHaveTextContent('Paused at 1.0 s');

    await user.click(screen.getByRole('button', { name: 'Reset pose to as built' }));
    expect(unit().coordinates).toEqual({ sun: 0, arm: 0, slide: 0 });
    expect(unit().playback.status).toBe('stopped');
    expect(screen.queryByRole('group', { name: 'Timeline' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset pose to as built' })).not.toBeInTheDocument();
  });

  it('should seek to a typed clip time', async () => {
    const user = userEvent.setup();
    renderPane();
    act(() => {
      kinematics.send({ type: 'play', unitId });
      kinematics.send({ type: 'pause', unitId });
    });

    await user.click(screen.getByRole('spinbutton', { name: 'Time' }));
    await user.clear(screen.getByRole('spinbutton', { name: 'Time' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Time' }), '2{Enter}');

    expect(unit().playback).toMatchObject({ status: 'paused', time: 2 });
    expect(field('sun')).toHaveValue('720');
  });

  it('should mark a moved driver, reset it alone, and hide driver marks while a clip plays', async () => {
    const user = userEvent.setup();
    renderPane();
    act(() => {
      kinematics.send({ type: 'setCoordinate', unitId, id: 'arm', value: 10 * degrees });
      kinematics.send({ type: 'setCoordinate', unitId, id: 'slide', value: 0.01 });
    });
    expect(screen.queryByRole('button', { name: 'Reset sun' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset arm' }));
    expect(unit().coordinates).toEqual({ sun: 0, arm: 0, slide: 0.01 });
    expect(screen.queryByRole('button', { name: 'Reset arm' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset pose to as built' })).toBeInTheDocument();

    act(() => {
      kinematics.send({ type: 'play', unitId });
    });
    expect(screen.queryByRole('button', { name: 'Reset slide' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset pose to as built' })).toBeInTheDocument();
  });

  it('should expand every group and collapse the driver groups from the file header', async () => {
    const user = userEvent.setup();
    renderPane();

    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(field('carrier')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(trigger('Group: sun')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument();
  });

  it('should offer no Expand all when no driver has followers', () => {
    renderPane({ loaded: { ...mechanism, couplings: [] } });

    expect(screen.queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument();
    expect(field('carrier')).toBeInTheDocument();
  });

  it('should point the viewer at the parts a hovered or focused row moves', async () => {
    const user = userEvent.setup();
    renderPane();
    const row = (name: string) => field(name).closest('[data-slot=kinematics-joint]')!;

    fireEvent.mouseEnter(row('sun'));
    expect(unit().hoveredComponentIds).toEqual(['component:sun', 'component:carrier']);
    fireEvent.mouseLeave(row('sun'));
    expect(unit().hoveredComponentIds).toEqual([]);

    await user.click(field('arm'));
    expect(unit().hoveredComponentIds).toEqual(['component:arm']);
  });

  it('should open the groups around a revealed follower and focus its field', async () => {
    renderPane();

    requestReveal('component:carrier');

    expect(trigger('Followers of sun')).toHaveAttribute('aria-expanded', 'true');
    await vi.waitFor(() => {
      expect(field('carrier')).toHaveFocus();
    });
  });

  it('should re-render only the rows whose values a pose change moves', () => {
    renderPane();
    act(() => {
      kinematics.send({ type: 'play', unitId });
    });
    const before = new Map(fieldRenders);

    act(() => {
      kinematics.send({ type: 'tick', unitId, elapsed: 0.5 });
    });

    expect(fieldRenders.get('sun')).toBeGreaterThan(before.get('sun') ?? 0);
    expect(fieldRenders.get('arm')).toBe(before.get('arm'));
    expect(fieldRenders.get('slide')).toBe(before.get('slide'));
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

    await user.type(screen.getByRole('searchbox', { name: 'Filter joints and parts' }), 'arm');

    expect(field('arm')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'sun' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'carrier' })).not.toBeInTheDocument();
  });

  it('should find a follower by the name of the part it moves and open its group', async () => {
    const user = userEvent.setup();
    renderPane({ partNames: { 'component:carrier': 'Carrier plate', 'component:arm': 'Arm link' } });

    await user.type(screen.getByRole('searchbox', { name: 'Filter joints and parts' }), 'plate');

    expect(field('carrier')).toBeInTheDocument();
    expect(field('carrier')).toHaveAccessibleDescription(expect.stringContaining('Moves 1 part: Carrier plate'));
    expect(screen.queryByRole('spinbutton', { name: 'arm' })).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Filter joints and parts' }));
    expect(screen.queryByRole('spinbutton', { name: 'carrier' })).not.toBeInTheDocument();
  });

  it('should keep its drivers when the entry path has a space', () => {
    renderPane({ entryPath: 'gear box.ts' });

    expect(screen.getByRole('region', { name: 'Drivers' })).toBeInTheDocument();
    expect(field('arm')).toBeInTheDocument();
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
    expect(screen.queryByText('No matching joints or parts')).not.toBeInTheDocument();
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
      expect(project.projectRef.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'claimGeometryUnit' }));

      setVisible(true);
      expect(unit().dragEnabled).toBe(true);
      const claim = project.projectRef.send.mock.calls.find(
        ([event]) => event.type === 'claimGeometryUnit',
      )?.[0] as unknown as {
        claimId: string;
        entryPath: string;
      };
      expect(claim.entryPath).toBe('main.ts');
      expect(typeof claim.claimId).toBe('string');

      setVisible(false);
      expect(unit().dragEnabled).toBe(false);
      expect(project.projectRef.send).toHaveBeenCalledWith({ type: 'releaseGeometryUnit', claimId: claim.claimId });
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

      project.viewGraphics = new Map([
        [
          'view-2',
          staticRef({
            context: { kinematicsRef: second, modelInteractionRef: staticRef({ context: { unitsById: {} } }) },
          }),
        ],
      ]);
      project.editorRef = editorRef({ 'view-2': { entryPath: 'main.ts' } });
      project.viewEntryPaths = new Map([['view-2', 'main.ts']]);
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

describe('shared preview viewer binding', () => {
  it('should expose joint controls without editor view records', () => {
    renderPane({ shared: true });
    expect(screen.queryByText('Open renderer to pose this model')).not.toBeInTheDocument();
    expect(field('sun')).toBeInTheDocument();
  });
});

describe('large generated kinematics collections', () => {
  const vanes = Array.from({ length: 1709 }, (_, index) => `vane-${index + 1}`);
  const largeMechanism = (followers: boolean): Mechanism => ({
    ...mechanism,
    links: { ...mechanism.links, ...Object.fromEntries(vanes.map((id) => [id, { components: [`component:${id}`] }])) },
    joints: {
      ...mechanism.joints,
      ...Object.fromEntries(
        vanes.map((id) => [
          id,
          {
            type: 'revolute',
            parent: 'base',
            child: id,
            origin: [0, 0, 0],
            axis: [1, 0, 0],
          },
        ]),
      ),
    },
    couplings: followers ? vanes.map((id) => ({ driver: 'arm', follower: id, ratio: 1 })) : [],
  });

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(180);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1713 * 80);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      right: 300,
      bottom: 180,
      width: 300,
      height: 180,
      x: 0,
      y: 0,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- DOMRect uses the standard toJSON method.
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(function (
      this: HTMLElement,
      options: number | ScrollToOptions,
      y?: number,
    ) {
      this.scrollTop = typeof options === 'number' ? (y ?? 0) : (options.top ?? 0);
      fireEvent.scroll(this);
    });
  });

  it('should bound driver controls and reveal an offscreen driver', async () => {
    renderPane({ virtualViewport: true, loaded: largeMechanism(false) });
    await screen.findByRole('spinbutton', { name: 'sun' });
    expect(screen.getAllByRole('spinbutton').length).toBeLessThan(30);
    expect(screen.queryByRole('spinbutton', { name: 'vane-1709' })).toBeNull();
    requestReveal('component:vane-1709');
    await waitFor(() => {
      expect(screen.getByRole('spinbutton', { name: 'vane-1709' })).toHaveFocus();
    });
    expect(field('vane-1709').closest('[data-pane-list-key]')).toHaveClass('pt-(--pane-group-gap)');
  });

  it('should bound expanded followers and reveal an offscreen follower', async () => {
    renderPane({ virtualViewport: true, loaded: largeMechanism(true) });
    requestReveal('component:vane-1709');
    await waitFor(() => {
      expect(screen.getByRole('spinbutton', { name: 'vane-1709' })).toHaveFocus();
    });
    expect(screen.getAllByRole('spinbutton').length).toBeLessThan(30);
    expect(trigger('Followers of arm')).toHaveAttribute('aria-expanded', 'true');
  });
});
