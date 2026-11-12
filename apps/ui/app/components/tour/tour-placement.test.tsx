// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoachMark } from '@taucad/ui/components/coach-mark';
import {
  createTourAnchorRegistry,
  TourAnchorProvider,
  useTourAnchor,
  useTourAnchorRegistry,
} from '#components/tour/tour-anchors.js';
import type { TourAnchorId, TourAnchorRegistry } from '#components/tour/tour-anchors.js';
import { resolveTourPlacement } from '#components/tour/tour-placement.js';

const desktop = { hasTestRun: false, isNarrow: false } as const;
const view = { innerWidth: 1440, innerHeight: 900 };

/** A laid-out element: jsdom lays nothing out, so each element reports one box. */
const laidOut = (element: HTMLElement, rect = new DOMRect(100, 100, 200, 40)): HTMLElement => {
  element.getClientRects = () => [rect] as unknown as DOMRectList;
  element.getBoundingClientRect = () => rect;
  return element;
};

const mount = (registry: TourAnchorRegistry, id: TourAnchorId, owner: Document = document): HTMLElement => {
  const element = laidOut(owner.createElement('div'));
  owner.body.append(element);
  registry.register(id, element);
  return element;
};

type ObserverCallback = (records: Array<Pick<IntersectionObserverEntry, 'isIntersecting'>>) => void;
const observers: Array<{ element: Element; callback: ObserverCallback }> = [];

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      readonly #callback: ObserverCallback;
      public constructor(callback: ObserverCallback) {
        this.#callback = callback;
      }

      public observe(element: Element): void {
        observers.push({ element, callback: this.#callback });
      }

      public disconnect(): void {
        // Nothing to release in the stub.
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveTourPlacement', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('places a tip beside its target when the target is on screen', () => {
    const registry = createTourAnchorRegistry();
    const composer = mount(registry, 'composer');

    const placement = resolveTourPlacement({ step: 'ask', registry, facts: desktop, view });

    expect(placement).toMatchObject({ kind: 'target', anchor: composer, side: 'right', align: 'end' });
  });

  it('falls back to the reveal control, with "Show me", when the pane is closed', () => {
    const registry = createTourAnchorRegistry();
    const reveal = mount(registry, 'workbench-open-tab');

    const placement = resolveTourPlacement({ step: 'adjust', registry, facts: desktop, view });

    expect(placement).toMatchObject({ kind: 'reveal', anchor: reveal, revealId: 'workbench-open-tab', side: 'bottom' });
  });

  it('falls back to the chat lane when the row with the test run has scrolled away', () => {
    const registry = createTourAnchorRegistry();
    mount(registry, 'activity-test');
    const lane = mount(registry, 'chat-lane');
    observers[0]?.callback([{ isIntersecting: false }]);

    const placement = resolveTourPlacement({ step: 'verify', registry, facts: { ...desktop, hasTestRun: true }, view });

    expect(placement).toMatchObject({ kind: 'reveal', anchor: lane, revealId: 'chat-lane' });
  });

  it('points Verify at the composer while there is no test run', () => {
    const registry = createTourAnchorRegistry();
    const composer = mount(registry, 'composer');
    mount(registry, 'activity-test');

    expect(resolveTourPlacement({ step: 'verify', registry, facts: desktop, view })).toMatchObject({
      kind: 'target',
      anchor: composer,
    });
  });

  it('falls back to the bottom centre of the window when neither is on screen', () => {
    const registry = createTourAnchorRegistry();
    const hidden = mount(registry, 'export');
    hidden.hidden = true;

    const placement = resolveTourPlacement({ step: 'build', registry, facts: desktop, view });

    expect(placement.kind).toBe('fallback');
    expect(placement.side).toBe('top');
    expect(placement.anchor.getBoundingClientRect()).toMatchObject({ x: 720, y: 884 });
  });

  it('on the phone layout, anchors to the tab-bar entry of the target region and opens upward', () => {
    const registry = createTourAnchorRegistry();
    const tab = mount(registry, 'mobile-tab-parameters');

    const placement = resolveTourPlacement({
      step: 'adjust',
      registry,
      facts: { hasTestRun: false, isNarrow: true },
      view,
    });

    expect(placement).toMatchObject({ kind: 'reveal', anchor: tab, revealId: 'mobile-tab-parameters', side: 'top' });
  });

  it('on a narrow layout, places a tip above or below its target, never beside it', () => {
    const registry = createTourAnchorRegistry();
    mount(registry, 'composer');
    mount(registry, 'parameters');

    expect(
      resolveTourPlacement({ step: 'ask', registry, facts: { hasTestRun: false, isNarrow: true }, view }).side,
    ).toBe('top');
    expect(
      resolveTourPlacement({ step: 'adjust', registry, facts: { hasTestRun: false, isNarrow: true }, view }).side,
    ).toBe('bottom');
  });

  it('hangs Look around from inside the top-left corner of the viewer', () => {
    const registry = createTourAnchorRegistry();
    const viewer = mount(registry, 'viewer');
    viewer.getBoundingClientRect = () => new DOMRect(300, 50, 800, 600);

    const placement = resolveTourPlacement({ step: 'look', registry, facts: desktop, view });

    expect(placement).toMatchObject({ kind: 'target', side: 'bottom', align: 'start' });
    expect(placement.anchor.getBoundingClientRect()).toMatchObject({ x: 312, y: 58 });
  });

  it('uses the first transcript row with a test run, in document order', () => {
    const registry = createTourAnchorRegistry();
    const second = laidOut(document.createElement('div'));
    const first = laidOut(document.createElement('div'));
    document.body.append(first, second);
    registry.register('activity-test', second);
    registry.register('activity-test', first);

    expect(registry.element('activity-test')).toBe(first);
  });
});

function Anchored({ id }: { readonly id: TourAnchorId }): React.JSX.Element {
  return (
    <div ref={useTourAnchor(id)} data-testid={id}>
      {id}
    </div>
  );
}

function Tip(): React.JSX.Element | undefined {
  const registry = useTourAnchorRegistry();
  if (registry === undefined) {
    return undefined;
  }
  const placement = resolveTourPlacement({ step: 'ask', registry, facts: desktop, view });
  return (
    <CoachMark anchor={placement.anchor} label={`placed at ${placement.kind}`}>
      Tip
    </CoachMark>
  );
}

describe('anchors in the editor', () => {
  it('re-places a tip when its target mounts and unmounts', () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
      new DOMRect(0, 0, 10, 10),
    ] as unknown as DOMRectList);
    const { rerender } = render(
      <TourAnchorProvider>
        <Tip />
      </TourAnchorProvider>,
    );
    expect(screen.getByRole('dialog', { name: 'placed at fallback' })).toBeInTheDocument();

    rerender(
      <TourAnchorProvider>
        <Anchored id='composer' />
        <Tip />
      </TourAnchorProvider>,
    );
    expect(screen.getByRole('dialog', { name: 'placed at target' })).toBeInTheDocument();
  });

  it('does nothing outside the editor', () => {
    render(<Anchored id='composer' />);

    expect(screen.getByTestId('composer')).toBeInTheDocument();
  });

  it('opens a tip in the window of a control inside a popped-out Dockview group', () => {
    const registry = createTourAnchorRegistry();
    const popout = document.implementation.createHTMLDocument('popout');
    const parameters = mount(registry, 'parameters', popout);
    const placement = resolveTourPlacement({ step: 'adjust', registry, facts: desktop, view });

    render(
      <CoachMark anchor={placement.anchor} label='Tip 3 of 5: Change it without asking again'>
        Tip
      </CoachMark>,
    );

    expect(placement.anchor).toBe(parameters);
    expect(popout.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
