import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ActorRefFrom } from 'xstate';
import type { cadMachine } from '#machines/cad.machine.js';

const mockCadRef = {
  getSnapshot: vi.fn(() => ({ context: { renderPhase: undefined, telemetryEntries: [] } })),
  subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  on: vi.fn(() => ({ unsubscribe: vi.fn() })),
} as unknown as ActorRefFrom<typeof cadMachine>;

const mockCadRef2 = {
  getSnapshot: vi.fn(() => ({ context: { renderPhase: undefined, telemetryEntries: [] } })),
  subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  on: vi.fn(() => ({ unsubscribe: vi.fn() })),
} as unknown as ActorRefFrom<typeof cadMachine>;

let mockGeometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
let paneviewMountCount = 0;
const mockMainEntryPath = 'main.ts';

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ geometryUnits: mockGeometryUnits, mainEntryPath: mockMainEntryPath }),
}));

vi.mock('dockview-react', async () => {
  const React = await import('react');
  return {
    PaneviewReact: ({
      onReady,
      className,
      components,
    }: {
      onReady: (event: { api: Record<string, unknown> }) => void;
      className?: string;
      components: Record<string, React.ComponentType<{ params: Record<string, unknown> }>>;
    }) => {
      const panels = React.useRef<Array<Record<string, unknown>>>([]);
      const [, renderPanels] = React.useReducer((value) => value + 1, 0);
      const api = React.useRef({
        get panels() {
          return panels.current;
        },
        addPanel(options: Record<string, unknown>) {
          const panel = {
            ...options,
            api: {
              isExpanded: options['isExpanded'],
              updateParameters(next: Record<string, unknown>) {
                Object.assign(options['params'] as Record<string, unknown>, next);
                renderPanels();
              },
            },
          };
          panels.current.push(panel);
          renderPanels();
          return panel;
        },
        getPanel(id: string) {
          return panels.current.find((panel) => panel['id'] === id);
        },
      });

      React.useEffect(() => {
        paneviewMountCount += 1;
        onReady({ api: api.current });
        // Paneview onReady belongs to the mounted instance, not every params render.
        // oxlint-disable-next-line react-hooks/exhaustive-deps -- Paneview fires onReady once for a mounted instance.
      }, []);

      return (
        <div data-testid='paneview' className={className}>
          {panels.current.map((panel) => {
            const Body = components[panel['component'] as string]!;
            return (
              <div
                key={panel['id'] as string}
                data-testid={`pane-${panel['id'] as string}`}
                data-expanded={String(panel['isExpanded'])}
                data-header-size={String(panel['headerSize'])}
              >
                <span>{panel['title'] as string}</span>
                <Body params={panel['params'] as Record<string, unknown>} />
              </div>
            );
          })}
        </div>
      );
    },
  };
});

vi.mock('#components/ui/floating-panel.js', () => ({
  FloatingPanel: ({ children }: { children: React.ReactNode }) => <div data-testid='floating-panel'>{children}</div>,
  FloatingPanelContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelContentBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelContentHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelContentHeaderActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelContentTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelClose: () => <button type='button'>Close</button>,
}));

vi.mock('#routes/w.$workspace.$project/chat-kernel-timing.js', () => ({
  GeometryUnitTiming: ({ query, cadRef }: { query: string; cadRef: unknown }) => (
    <div data-testid='cu-timing' data-query={query} data-cad={cadRef === mockCadRef2 ? 'second' : 'first'}>
      Timing
    </div>
  ),
  GeometryUnitSummary: () => <span>Summary</span>,
}));

vi.mock('#routes/w.$workspace.$project/use-chat-interface-state.js', () => ({
  usePaneviewPersistence: () => ({ savedState: {}, connectApi: vi.fn() }),
  getInitialPanelOptions: (
    _saved: Record<string, unknown>,
    _panelId: string,
    defaults: { isExpanded: boolean; size?: number },
  ) => defaults,
}));

describe('ChatKernel', () => {
  beforeEach(() => {
    mockGeometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
    paneviewMountCount = 0;
  });

  it('keeps one permanent telemetry filter above the empty state', async () => {
    const { ChatKernel } = await import('./chat-kernel.js');
    render(<ChatKernel isExpanded setIsExpanded={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Filter telemetry' })).toHaveAttribute(
      'placeholder',
      'Filter telemetry...',
    );
    expect(screen.getAllByRole('textbox', { name: 'Filter telemetry' })).toHaveLength(1);
    expect(screen.getByText('No geometry units.')).toBeInTheDocument();
  });

  it('sorts units, preserves main-open defaults, and uses the shared attached header height', async () => {
    mockGeometryUnits.set('helper.ts', mockCadRef2);
    mockGeometryUnits.set('main.ts', mockCadRef);
    const { ChatKernel } = await import('./chat-kernel.js');
    render(<ChatKernel isExpanded setIsExpanded={vi.fn()} />);

    const panes = screen.getAllByTestId(/^pane-/);
    expect(panes.map((pane) => pane.dataset['testid'])).toEqual(['pane-main.ts', 'pane-helper.ts']);
    expect(panes[0]).toHaveAttribute('data-expanded', 'true');
    expect(panes[1]).toHaveAttribute('data-expanded', 'false');
    for (const pane of panes) {
      expect(pane).toHaveAttribute('data-header-size', '40');
    }
    expect(screen.getAllByTestId('cu-timing')).toHaveLength(2);
    expect(document.querySelectorAll('[data-slot="telemetry-unit-surface"]')).toHaveLength(2);
  });

  it('distributes one query to every live panel without remounting Paneview', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockGeometryUnits.set('helper.ts', mockCadRef2);
    const { ChatKernel } = await import('./chat-kernel.js');
    render(<ChatKernel isExpanded setIsExpanded={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter telemetry' }), { target: { value: 'bundling' } });
    expect(screen.getAllByTestId('cu-timing').map((timing) => timing.dataset['query'])).toEqual([
      'bundling',
      'bundling',
    ]);
    expect(paneviewMountCount).toBe(1);
  });

  it('updates the actor for an existing path without remounting Paneview', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    const { ChatKernel } = await import('./chat-kernel.js');
    const view = render(<ChatKernel isExpanded setIsExpanded={vi.fn()} />);
    expect(screen.getByTestId('cu-timing')).toHaveAttribute('data-cad', 'first');

    mockGeometryUnits = new Map([['main.ts', mockCadRef2]]);
    view.rerender(<ChatKernel isExpanded setIsExpanded={vi.fn()} />);
    expect(screen.getByTestId('cu-timing')).toHaveAttribute('data-cad', 'second');
    expect(paneviewMountCount).toBe(1);
  });
});
