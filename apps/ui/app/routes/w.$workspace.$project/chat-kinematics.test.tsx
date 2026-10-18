import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { VirtuosoMockContext } from 'react-virtuoso';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { Actor } from 'xstate';
import type * as KinematicsModule from '@taucad/kinematics';
import type * as NumberFieldModule from '@taucad/viewer/parameters/parameters-number-field';
import type { Mechanism } from '@taucad/kinematics';
import type { KernelIssue } from '@taucad/runtime';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { getKinematicsUnitState, kinematicsMachine } from '@taucad/viewer/machines/kinematics.machine';
import { KinematicsPanelBody } from '#routes/w.$workspace.$project/chat-kinematics.js';
import { WorkspaceLanesContext } from '#routes/w.$workspace.$project/project-workspace-context.js';

const solvePose = vi.hoisted(() => vi.fn());
vi.mock('#hooks/use-project-availability.js', () => ({ useProjectAvailability: () => 'ready' }));

vi.mock('@taucad/kinematics', async (importOriginal) => ({
  ...(await importOriginal<typeof KinematicsModule>()),
  solvePose,
}));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: (): boolean => false }));

// Counts each field's renders by name, so a test can show which rows a pose change re-renders.
const fieldRenders = vi.hoisted(() => new Map<string, number>());
vi.mock('@taucad/viewer/parameters/parameters-number-field', async (importOriginal) => {
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
const trigger = (name: string | RegExp) => screen.getByRole('button', { name });
/** A follower's one-line row, found by its degree of freedom id. */
const follower = (id: string) => screen.getByTestId(`kinematics-dof-${id}`);
/** A follower's relation badge, which opens the relation card on hover and on focus. */
const relation = (id: string) => within(follower(id)).getByLabelText(/^Follows /u);

const statusRegion = () => screen.getByRole('status', { name: 'Kinematics status' });
const alertRegion = () => screen.getByRole('alert', { name: 'Kinematics error' });

/*
 * The adapter only: what the app hands the shared pane (units and claims from the project, visibility from dockview and
 * the workspace lanes, reveals from the editor, build status and mechanism issues from each entry's CAD actor). The
 * pane itself is tested in @taucad/workbench-panes (src/kinematics/kinematics-pane.test.tsx).
 */
describe('KinematicsPanelBody', () => {
  beforeEach(() => {
    solvePose.mockReset();
    project.projectRef.send.mockClear();
  });

  it('should render the shared pane over the project unit a viewer shows', () => {
    renderPane();

    expect(screen.getByTestId('kinematics-pane')).toBeInTheDocument();
    expect(field('Sun')).toBeInTheDocument();
    expect(statusRegion()).toMatchTextContent('Ready');
  });

  it('should open the groups around a follower the part menu reveals', async () => {
    renderPane();

    requestReveal('component:carrier');

    expect(trigger('Followers of Sun')).toHaveAttribute('aria-expanded', 'true');
    await vi.waitFor(() => {
      expect(relation('carrier')).toHaveFocus();
    });
  });

  describe('build status', () => {
    it('should show a loading state rather than the no-mechanism copy during the first build', () => {
      renderPane({ withMechanism: false, isBuilding: true });

      expect(statusRegion()).toHaveAttribute('aria-busy', 'true');
      expect(statusRegion()).toMatchTextContent('Building the model');
      expect(screen.queryByText('This model declares no mechanism')).not.toBeInTheDocument();
    });

    it('should say why the kernel rejected the mechanism, ignoring other kernel issues', () => {
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

      expect(alertRegion()).toMatchTextContent('The mechanism could not be loaded');
      expect(alertRegion()).toMatchTextContent(message);
      expect(alertRegion()).not.toMatchTextContent('An unrelated warning.');
      expect(screen.queryByText('This model declares no mechanism')).not.toBeInTheDocument();
    });
  });

  describe('viewer drag arming', () => {
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
    expect(field('Sun')).toBeInTheDocument();
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
    await screen.findByRole('spinbutton', { name: 'Sun' });
    expect(screen.getAllByRole('spinbutton').length).toBeLessThan(30);
    expect(screen.queryByRole('spinbutton', { name: 'Vane 1709' })).toBeNull();
    requestReveal('component:vane-1709');
    await waitFor(() => {
      expect(screen.getByRole('spinbutton', { name: 'Vane 1709' })).toHaveFocus();
    });
    expect(field('Vane 1709').closest('[data-pane-list-key]')).toHaveClass('pt-(--pane-group-gap)');
  });

  it('should bound expanded followers and reveal an offscreen follower', async () => {
    renderPane({ virtualViewport: true, loaded: largeMechanism(true) });
    requestReveal('component:vane-1709');
    await waitFor(() => {
      expect(relation('vane-1709')).toHaveFocus();
    });
    expect(document.querySelectorAll('[data-slot=kinematics-follower]').length).toBeLessThan(30);
    expect(trigger('Followers of Arm')).toHaveAttribute('aria-expanded', 'true');
  });
});
