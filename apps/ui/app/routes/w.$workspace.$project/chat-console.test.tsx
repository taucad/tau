import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createActor } from 'xstate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorRefFrom } from 'xstate';
import type { cadMachine } from '#machines/cad.machine.js';
import { logMachine } from '#machines/logs.machine.js';

let geometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
let logRef = createActor(logMachine);
let paneviewMountCount = 0;
let paneviewPersistenceKey = '';
const scrollToIndex = vi.fn();
let atBottomStateChange: ((atBottom: boolean) => void) | undefined;
let followOutput: ((atBottom: boolean) => 'smooth' | false) | undefined;

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ geometryUnits, logRef, mainEntryPath: 'main.ts' }),
}));

vi.mock('#hooks/use-cookie.js', async () => {
  const React = await import('react');
  return {
    useCookie: <T,>(_name: string, initialValue: T) => React.useState(initialValue),
  };
});

vi.mock('#components/panes/paneview-header.js', () => ({
  PaneviewHeader: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid={`console-header-${title}`}>
      <span>{title}</span>
      {children}
    </div>
  ),
  PaneviewHeaderControls: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  paneviewAttachedSurfaceStyleOverrides: 'attached-paneview',
  paneviewHeaderSize: 40,
}));

vi.mock('@taucad/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }): React.JSX.Element => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: React.ReactNode }): React.JSX.Element => <>{children}</>,
}));

vi.mock('#routes/w.$workspace.$project/use-chat-interface-state.js', () => ({
  usePaneviewPersistence: (key: string) => {
    paneviewPersistenceKey = key;
    return { savedState: {}, connectApi: vi.fn() };
  },
  getInitialPanelOptions: (
    _savedState: Record<string, unknown>,
    _panelId: string,
    defaults: { isExpanded: boolean; size?: number },
  ) => defaults,
}));

vi.mock('react-virtuoso', async () => {
  const React = await import('react');
  return {
    Virtuoso: React.forwardRef(
      (
        properties: {
          data: unknown[];
          itemContent: (index: number, value: unknown) => React.ReactNode;
          role?: string;
          'aria-label'?: string;
          initialTopMostItemIndex?: unknown;
          className?: string;
          atBottomStateChange?: (atBottom: boolean) => void;
          followOutput?: (atBottom: boolean) => 'smooth' | false;
        },
        ref,
      ) => {
        React.useImperativeHandle(ref, () => ({ scrollToIndex }));
        atBottomStateChange = properties.atBottomStateChange;
        followOutput = properties.followOutput;
        return (
          <div role={properties.role} aria-label={properties['aria-label']} className={properties.className}>
            {properties.data.map((value, index) => (
              <div key={(value as { id: string }).id}>{properties.itemContent(index, value)}</div>
            ))}
          </div>
        );
      },
    ),
  };
});

vi.mock('dockview-react', async () => {
  const React = await import('react');
  return {
    PaneviewReact: ({
      onReady,
      className,
      components,
      headerComponents,
    }: {
      onReady: (event: { api: Record<string, unknown> }) => void;
      className?: string;
      components: Record<string, React.ComponentType<{ params: Record<string, unknown> }>>;
      headerComponents: Record<
        string,
        React.ComponentType<{ api: Record<string, unknown>; params: Record<string, unknown> }>
      >;
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
        // Paneview calls onReady once for the mounted layout.
        // oxlint-disable-next-line react-hooks/exhaustive-deps -- preserve the real Paneview lifecycle
      }, []);

      return (
        <div data-testid='console-paneview' className={className}>
          {panels.current.map((panel) => {
            const params = panel['params'] as Record<string, unknown>;
            const Header = headerComponents[panel['headerComponent'] as string]!;
            const Body = components[panel['component'] as string]!;
            return (
              <section
                key={panel['id'] as string}
                data-testid={`console-pane-${panel['id'] as string}`}
                data-expanded={String(panel['isExpanded'])}
                data-header-size={String(panel['headerSize'])}
              >
                <Header api={panel['api'] as Record<string, unknown>} params={params} />
                <Body params={params} />
              </section>
            );
          })}
        </div>
      );
    },
  };
});

const cadRef = {} as ActorRefFrom<typeof cadMachine>;

describe('ChatConsole', () => {
  beforeEach(() => {
    logRef = createActor(logMachine);
    logRef.start();
    geometryUnits = new Map();
    paneviewMountCount = 0;
    paneviewPersistenceKey = '';
    scrollToIndex.mockClear();
    atBottomStateChange = undefined;
    followOutput = undefined;
  });

  it('keeps the global toolbar visible when there are no geometry units', async () => {
    const { ChatConsole } = await import('./chat-console.js');
    render(<ChatConsole />);

    expect(screen.getByRole('textbox', { name: 'Filter logs' })).toHaveAttribute('placeholder', 'Filter logs...');
    expect(screen.getByRole('button', { name: 'Filter by log level' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Console settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear logs' })).toBeDisabled();
    expect(screen.getByText('No geometry units.')).toBeInTheDocument();
  });

  it('partitions chronological logs by unit and filters every live panel without remounting', async () => {
    geometryUnits = new Map([
      ['helper.ts', cadRef],
      ['main.ts', cadRef],
    ]);
    logRef.send({ type: 'addLog', message: 'main first', options: { level: 'info', origin: { file: 'main.ts' } } });
    logRef.send({ type: 'addLog', message: 'main second', options: { level: 'info', origin: { file: 'main.ts' } } });
    logRef.send({
      type: 'addLog',
      message: 'helper warning',
      options: { level: 'warn', origin: { file: 'helper.ts' } },
    });

    const { ChatConsole } = await import('./chat-console.js');
    render(<ChatConsole />);

    const panes = screen.getAllByTestId(/^console-pane-(main|helper)\.ts$/);
    expect(panes.map((pane) => pane.dataset['testid'])).toEqual(['console-pane-main.ts', 'console-pane-helper.ts']);
    expect(panes[0]).toHaveAttribute('data-expanded', 'true');
    expect(panes[1]).toHaveAttribute('data-expanded', 'false');
    expect(panes[0]).toHaveAttribute('data-header-size', '40');
    expect(paneviewPersistenceKey).toBe('consolePaneview');

    const mainLog = screen.getByRole('log', { name: 'Console logs for main.ts' });
    expect(
      within(mainLog)
        .getAllByText(/main (first|second)/)
        .map((row) => row.textContent),
    ).toEqual(['main first', 'main second']);
    expect(screen.getByRole('log', { name: 'Console logs for helper.ts' })).toHaveTextContent('helper warning');

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter logs' }), {
      target: { value: 'helper' },
    });
    expect(screen.getByText('No matching logs.')).toBeInTheDocument();
    expect(screen.getByRole('log', { name: 'Console logs for helper.ts' })).toHaveTextContent('helper warning');
    expect(screen.getByTestId('console-header-main.ts')).toHaveTextContent('(0)');
    expect(screen.getByTestId('console-header-helper.ts')).toHaveTextContent('(1)');
    expect(paneviewMountCount).toBe(1);
  });

  it('clears the shared project buffer only from the explicit global action', async () => {
    geometryUnits = new Map([['main.ts', cadRef]]);
    logRef.send({ type: 'addLog', message: 'rendered', options: { level: 'info', origin: { file: 'main.ts' } } });
    const { ChatConsole } = await import('./chat-console.js');
    render(<ChatConsole />);

    const clearButton = screen.getByRole('button', { name: 'Clear logs' });
    expect(clearButton).toBeEnabled();
    act(() => {
      fireEvent.click(clearButton);
    });
    expect(screen.getByText('No logs yet.')).toBeInTheDocument();
    expect(clearButton).toBeDisabled();
  });

  it('follows new output only at the bottom and offers recovery after scrolling away', async () => {
    geometryUnits = new Map([['main.ts', cadRef]]);
    logRef.send({ type: 'addLog', message: 'rendered', options: { level: 'info', origin: { file: 'main.ts' } } });
    const { ChatConsole } = await import('./chat-console.js');
    render(<ChatConsole />);

    expect(followOutput?.(true)).toBe('smooth');
    expect(followOutput?.(false)).toBe(false);
    act(() => {
      atBottomStateChange?.(false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Scroll to latest logs' }));
    expect(scrollToIndex).toHaveBeenCalledWith({ index: 'LAST', align: 'end', behavior: 'smooth' });
  });
});
