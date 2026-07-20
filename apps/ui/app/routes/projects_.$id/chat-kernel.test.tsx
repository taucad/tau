import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ActorRefFrom } from 'xstate';
import type { cadMachine } from '#machines/cad.machine.js';

const mockCadRef = {
  getSnapshot: vi.fn(() => ({
    context: {
      renderPhase: undefined,
      telemetryEntries: [],
      defaultParameters: {},
      jsonSchema: undefined,
    },
  })),
  subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  on: vi.fn(() => ({ unsubscribe: vi.fn() })),
} as unknown as ActorRefFrom<typeof cadMachine>;

const mockCadRef2 = {
  getSnapshot: vi.fn(() => ({
    context: {
      renderPhase: undefined,
      telemetryEntries: [],
      defaultParameters: {},
      jsonSchema: undefined,
    },
  })),
  subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  on: vi.fn(() => ({ unsubscribe: vi.fn() })),
} as unknown as ActorRefFrom<typeof cadMachine>;

let mockGeometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
const mockMainEntryPath = 'main.ts';

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    geometryUnits: mockGeometryUnits,
    mainEntryPath: mockMainEntryPath,
    logRef: {
      getSnapshot: vi.fn(() => ({
        context: { logBuffer: { toArray: () => [] }, logVersion: 0 },
      })),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      on: vi.fn(() => ({ unsubscribe: vi.fn() })),
    },
  }),
}));

vi.mock('dockview-react', () => ({
  PaneviewReact: ({
    onReady,
  }: {
    onReady: (event: { api: { addPanel: (options: Record<string, unknown>) => void } }) => void;
  }) => {
    const panels: Array<{ id: string; title: string; isExpanded: boolean }> = [];
    const api = {
      addPanel: (options: Record<string, unknown>) => {
        panels.push(options as unknown as { id: string; title: string; isExpanded: boolean });
      },
    };
    onReady({ api });
    return (
      <div data-testid='paneview'>
        {panels.map((p) => (
          <div key={p.id} data-testid={`pane-${p.id}`} data-expanded={p.isExpanded}>
            {p.title}
          </div>
        ))}
      </div>
    );
  },
}));

vi.mock('react-virtuoso', () => ({
  Virtuoso: () => <div data-testid='virtuoso' />,
}));

vi.mock('#components/ui/floating-panel.js', () => ({
  FloatingPanel: ({ children }: { children: React.ReactNode }) => <div data-testid='floating-panel'>{children}</div>,
  FloatingPanelContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelContentBody: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='panel-body'>{children}</div>
  ),
  FloatingPanelContentHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelContentHeaderActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelContentTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelClose: () => <button type='button'>Close</button>,
  FloatingPanelTrigger: ({ onClick }: { onClick: () => void }) => (
    <button type='button' data-testid='kernel-trigger' onClick={onClick}>
      Trigger
    </button>
  ),
}));

vi.mock('#routes/projects_.$id/chat-kernel-timing.js', () => ({
  GeometryUnitTiming: () => <div data-testid='cu-timing'>Timing</div>,
  GeometryUnitSummary: () => <span data-testid='cu-summary'>Summary</span>,
}));

vi.mock('#routes/projects_.$id/chat-kernel-logs.js', () => ({
  GeometryUnitLogs: ({ entryPath }: { entryPath: string }) => <div data-testid='cu-logs'>{entryPath}</div>,
}));

vi.mock('#routes/projects_.$id/use-chat-interface-state.js', () => ({
  usePaneviewPersistence: () => ({
    savedState: {},
    connectApi: vi.fn(),
  }),
  getInitialPanelOptions: (
    _saved: Record<string, unknown>,
    _panelId: string,
    defaults: { isExpanded: boolean; size?: number },
  ) => defaults,
}));

describe('ChatKernel', () => {
  beforeEach(() => {
    mockGeometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
  });

  it('should render single geometry unit inside PaneviewReact', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);

    const { ChatKernel } = await import('./chat-kernel.js');
    render(<ChatKernel isExpanded setIsExpanded={vi.fn()} />);

    expect(screen.getByTestId('paneview')).toBeInTheDocument();
    expect(screen.getByTestId('pane-main.ts')).toBeInTheDocument();
  });

  it('renders PaneviewReact for multiple geometry units', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockGeometryUnits.set('helper.ts', mockCadRef2);

    const { ChatKernel } = await import('./chat-kernel.js');
    render(<ChatKernel isExpanded setIsExpanded={vi.fn()} />);

    expect(screen.getByTestId('paneview')).toBeInTheDocument();
  });

  it('places mainFile first when using PaneviewReact', async () => {
    mockGeometryUnits.set('helper.ts', mockCadRef2);
    mockGeometryUnits.set('main.ts', mockCadRef);

    const { ChatKernel } = await import('./chat-kernel.js');
    render(<ChatKernel isExpanded setIsExpanded={vi.fn()} />);

    const panes = screen.getAllByTestId(/^pane-/);
    expect(panes[0]!.dataset['testid']).toBe('pane-main.ts');
  });

  it('expands mainFile pane by default', async () => {
    mockGeometryUnits.set('helper.ts', mockCadRef2);
    mockGeometryUnits.set('main.ts', mockCadRef);

    const { ChatKernel } = await import('./chat-kernel.js');
    render(<ChatKernel isExpanded setIsExpanded={vi.fn()} />);

    const mainPane = screen.getByTestId('pane-main.ts');
    expect(mainPane.dataset['expanded']).toBe('true');

    const helperPane = screen.getByTestId('pane-helper.ts');
    expect(helperPane.dataset['expanded']).toBe('false');
  });

  it('shows empty message when no geometry units', async () => {
    const { ChatKernel } = await import('./chat-kernel.js');
    render(<ChatKernel isExpanded setIsExpanded={vi.fn()} />);

    expect(screen.getByText('No geometry units.')).toBeInTheDocument();
  });
});

describe('ChatKernelTrigger', () => {
  it('renders trigger button', async () => {
    const { ChatKernelTrigger } = await import('./chat-kernel.js');
    const onToggle = vi.fn();
    render(<ChatKernelTrigger isOpen={false} onToggle={onToggle} />);

    expect(screen.getByTestId('kernel-trigger')).toBeInTheDocument();
  });
});
