import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ActorRefFrom } from 'xstate';
import type { FileParameterEntry } from '@taucad/types';
import type { cadMachine } from '#machines/cad.machine.js';

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown } | undefined, selector: (state: unknown) => unknown) => {
    if (!actor) {
      return selector(undefined);
    }
    return selector(actor.getSnapshot());
  },
}));

const mockCadRef = {
  getSnapshot: vi.fn(() => ({
    context: {
      defaultParameters: { width: 10, height: 20 },
      jsonSchema: {
        type: 'object',
        properties: {
          width: { type: 'number' },
          height: { type: 'number' },
        },
      },
    },
  })),
} as unknown as ActorRefFrom<typeof cadMachine>;

const mockCadRef2 = {
  getSnapshot: vi.fn(() => ({
    context: {
      defaultParameters: { radius: 5 },
      jsonSchema: {
        type: 'object',
        properties: {
          radius: { type: 'number' },
        },
      },
    },
  })),
} as unknown as ActorRefFrom<typeof cadMachine>;

let mockGeometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
const mockMainEntryPath = 'main.ts';
const mockSetParameters = vi.fn();
const mockSetGeometryUnitParameters = vi.fn();
const mockSwitchParameterGroup = vi.fn();
const mockProjectSend = vi.fn();
const mockEditorSend = vi.fn();
let mockParameterEntries = new Map<string, FileParameterEntry>();

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectRef: {
      getSnapshot: vi.fn(() => ({ context: { project: null } })),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      on: vi.fn(() => ({ unsubscribe: vi.fn() })),
      send: mockProjectSend,
    },
    editorRef: {
      getSnapshot: vi.fn(() => ({ context: {} })),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      on: vi.fn(() => ({ unsubscribe: vi.fn() })),
      send: mockEditorSend,
    },
    geometryUnits: mockGeometryUnits,
    mainEntryPath: mockMainEntryPath,
    setParameters: mockSetParameters,
    setGeometryUnitParameters: mockSetGeometryUnitParameters,
    switchParameterGroup: mockSwitchParameterGroup,
    createParameterGroup: vi.fn(),
    deleteParameterGroup: vi.fn(),
    renameParameterGroup: vi.fn(),
    parameterEntries: mockParameterEntries,
  }),
  useMainGraphics: () => ({
    getSnapshot: vi.fn(() => ({
      context: { units: { length: { symbol: 'mm', factor: 1 } } },
    })),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    on: vi.fn(() => ({ unsubscribe: vi.fn() })),
  }),
}));

vi.mock('dockview-react', () => ({
  PaneviewReact: ({
    onReady,
    components,
    headerComponents,
  }: {
    onReady: (event: { api: { addPanel: (options: Record<string, unknown>) => void } }) => void;
    components: Record<string, React.ComponentType<{ params: Record<string, unknown> }>>;
    headerComponents?: Record<string, React.ComponentType<{ api: unknown; params: Record<string, unknown> }>>;
  }) => {
    type MockPanel = {
      id: string;
      title: string;
      component: string;
      headerComponent?: string;
      isExpanded: boolean;
      params: Record<string, unknown> & { entryPath: string };
      api: { updateParameters: (newParams: Record<string, unknown>) => void };
    };
    const panels: MockPanel[] = [];
    const api = {
      panels,
      addPanel: (options: Record<string, unknown>) => {
        const panel = options as unknown as Omit<MockPanel, 'api'>;
        panels.push({
          ...panel,
          api: {
            updateParameters: (newParams: Record<string, unknown>) => {
              Object.assign(panel.params, newParams);
            },
          },
        });
      },
    };
    onReady({ api });
    const noop = () => undefined;
    const mockPanelApi = {
      isExpanded: true,
      onDidExpansionChange: () => ({ dispose: noop }),
      setExpanded: noop,
      setSize: noop,
      updateParameters: noop,
    };
    return (
      <div data-testid='paneview'>
        {panels.map((p) => {
          const Component = components[p.component];
          const HeaderComponent = p.headerComponent && headerComponents?.[p.headerComponent];
          return (
            <div key={p.id} data-testid={`param-pane-${p.id}`} data-expanded={p.isExpanded}>
              {HeaderComponent ? <HeaderComponent api={mockPanelApi} params={p.params} /> : p.params.entryPath}
              {Component ? <Component params={p.params} /> : null}
            </div>
          );
        })}
      </div>
    );
  },
}));

vi.mock('#components/geometry/parameters/parameters.js', () => ({
  Parameters: ({
    parameters,
    onParametersChange,
  }: {
    parameters: Record<string, unknown>;
    onParametersChange: (params: Record<string, unknown>) => void;
  }) => (
    <div data-testid='parameters-component' data-params={JSON.stringify(parameters)}>
      <button
        type='button'
        data-testid='change-params'
        onClick={() => {
          onParametersChange({ width: 42 });
        }}
      >
        Change
      </button>
    </div>
  ),
}));

vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: () => ({ formattedKeyCombination: 'Ctrl+X' }),
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
  FloatingPanelMenuButton: ({
    children,
    onClick,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    'aria-label'?: string;
  }) => (
    <button type='button' aria-label={rest['aria-label']} onClick={onClick}>
      {children}
    </button>
  ),
  FloatingPanelButtonGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FloatingPanelTrigger: ({ onClick }: { onClick: () => void }) => (
    <button type='button' data-testid='params-trigger' onClick={onClick}>
      Trigger
    </button>
  ),
}));

vi.mock('#components/ui/key-shortcut.js', () => ({
  KeyShortcut: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@taucad/utils/schema', () => ({
  hasJsonSchemaObjectProperties: (schema: unknown) =>
    Boolean(schema && typeof schema === 'object' && 'properties' in schema),
}));

vi.mock('#components/ui/tooltip.js', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));

vi.mock('#components/ui/combobox-responsive.js', () => ({
  ComboBoxResponsive: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
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

vi.mock('#components/files/export-selector.js', () => ({
  ExportSelector: () => <div data-testid='export-selector'>ExportSelector</div>,
}));

vi.mock('#components/ui/context-menu.js', () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <div data-testid='context-menu'>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='context-menu-content'>{children}</div>
  ),
  ContextMenuItem: ({
    children,
    onSelect,
    disabled: isDisabled,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    // oxlint-disable-next-line react-js/boolean-prop-naming -- mocking shadcn ContextMenuItem prop API
    disabled?: boolean;
  }) => (
    <button
      type='button'
      data-testid='context-menu-item'
      data-disabled={isDisabled ? 'true' : undefined}
      disabled={isDisabled}
      onClick={() => {
        if (!isDisabled) {
          onSelect?.();
        }
      }}
    >
      {children}
    </button>
  ),
  ContextMenuSeparator: () => <hr />,
  ContextMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuSubContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='context-menu-sub-content'>{children}</div>
  ),
  ContextMenuSubTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type='button' data-testid='context-menu-sub-trigger'>
      {children}
    </button>
  ),
}));

vi.mock('#components/ui/dropdown-menu.js', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='dropdown-menu-content'>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled: isDisabled,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    // oxlint-disable-next-line react-js/boolean-prop-naming -- mocking shadcn DropdownMenuItem prop API
    disabled?: boolean;
  }) => (
    <button
      type='button'
      data-testid='dropdown-menu-item'
      data-disabled={isDisabled ? 'true' : undefined}
      disabled={isDisabled}
      onClick={() => {
        if (!isDisabled) {
          onSelect?.();
        }
      }}
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='dropdown-menu-sub-content'>{children}</div>
  ),
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type='button' data-testid='dropdown-menu-sub-trigger'>
      {children}
    </button>
  ),
}));

describe('ChatParameters', () => {
  beforeEach(() => {
    mockGeometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
    mockSetParameters.mockClear();
    mockSetGeometryUnitParameters.mockClear();
    mockSwitchParameterGroup.mockClear();
    mockParameterEntries = new Map<string, FileParameterEntry>([
      [
        'main.ts',
        {
          activeGroup: 'default',
          groups: { default: { values: { width: 15 } } },
        },
      ],
    ]);
  });

  it('should render single geometry unit inside PaneviewReact', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    expect(screen.getByTestId('paneview')).toBeInTheDocument();
    expect(screen.getByTestId('param-pane-main.ts')).toBeInTheDocument();
  });

  it('renders PaneviewReact for multiple geometry units', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockGeometryUnits.set('helper.ts', mockCadRef2);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    expect(screen.getByTestId('paneview')).toBeInTheDocument();
  });

  it('places mainFile pane first', async () => {
    mockGeometryUnits.set('helper.ts', mockCadRef2);
    mockGeometryUnits.set('main.ts', mockCadRef);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const panes = screen.getAllByTestId(/^param-pane-/);
    expect(panes[0]!.dataset['testid']).toBe('param-pane-main.ts');
  });

  it('expands mainFile pane by default', async () => {
    mockGeometryUnits.set('helper.ts', mockCadRef2);
    mockGeometryUnits.set('main.ts', mockCadRef);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const mainPane = screen.getByTestId('param-pane-main.ts');
    expect(mainPane.dataset['expanded']).toBe('true');

    const helperPane = screen.getByTestId('param-pane-helper.ts');
    expect(helperPane.dataset['expanded']).toBe('false');
  });

  it('reads parameter values from parameterEntries active group', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const paramsComponent = screen.getByTestId('parameters-component');
    const params: unknown = JSON.parse(paramsComponent.dataset['params']!);
    expect(params).toEqual({ width: 15 });
  });

  it('calls setGeometryUnitParameters when parameters change', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    fireEvent.click(screen.getByTestId('change-params'));
    expect(mockSetGeometryUnitParameters).toHaveBeenCalledWith('main.ts', { width: 42 });
  });

  it('shows empty message when no geometry units', async () => {
    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    expect(screen.getByText('No geometry units.')).toBeInTheDocument();
  });

  it('returns empty params when entry is missing', async () => {
    mockParameterEntries = new Map();
    mockGeometryUnits.set('main.ts', mockCadRef);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const paramsComponent = screen.getByTestId('parameters-component');
    const params: unknown = JSON.parse(paramsComponent.dataset['params']!);
    expect(params).toEqual({});
  });
});

describe('ParameterGroupSelector', () => {
  beforeEach(() => {
    mockGeometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
    mockSwitchParameterGroup.mockClear();
    mockParameterEntries = new Map<string, FileParameterEntry>([
      [
        'main.ts',
        {
          activeGroup: 'default',
          groups: {
            default: { values: {} },
            preset1: { values: { width: 50 } },
          },
        },
      ],
    ]);
  });

  it('renders group selector with multiple groups in multi-geometry-unit paneview header', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockGeometryUnits.set('helper.ts', mockCadRef2);
    mockParameterEntries = new Map<string, FileParameterEntry>([
      [
        'main.ts',
        {
          activeGroup: 'default',
          groups: {
            default: { values: {} },
            preset1: { values: { width: 50 } },
          },
        },
      ],
      [
        'helper.ts',
        {
          activeGroup: 'default',
          groups: { default: { values: {} } },
        },
      ],
    ]);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    expect(screen.getByTestId('paneview')).toBeInTheDocument();
  });

  it('renders the group selector for every geometry unit, even those without a parameter entry', async () => {
    // Two geometry units, but only main.ts has an entry — helper.ts has none, mirroring the
    // real-world case where lib/* geometry units have not had parameters set yet.
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockGeometryUnits.set('helper.ts', mockCadRef2);
    mockParameterEntries = new Map<string, FileParameterEntry>([
      [
        'main.ts',
        {
          activeGroup: 'default',
          groups: { default: { values: {} } },
        },
      ],
    ]);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    // The active group ('default') text appears once per pane via the
    // selector's trigger — including for the geometry unit with no entry, which
    // previously rendered nothing. Two panes -> two 'default' triggers.
    const groupTriggers = screen.getAllByLabelText('Parameter groups');
    expect(groupTriggers).toHaveLength(2);
  });

  it('hover-gates the entire controls group on the parent', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    // Animation lives on the PaneviewHeaderControls parent so all action
    // items (selector, collapse toggle, more-actions button) fade together.
    const controls = screen.getByTestId('paneview-header-controls');
    expect(controls.className).toContain('opacity-0');
    expect(controls.className).toContain('transition-opacity');
    expect(controls.className).toContain('duration-150');
    expect(controls.className).toContain('[.dv-pane:hover_&]:opacity-100');
    expect(controls.className).toContain('[&:has([data-state=open])]:opacity-100');
  });
});

describe('ParameterGroupManager — active group name', () => {
  beforeEach(() => {
    mockGeometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
    mockSwitchParameterGroup.mockClear();
  });

  it('displays the active group name dynamically in the header', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockParameterEntries = new Map<string, FileParameterEntry>([
      [
        'main.ts',
        {
          activeGroup: 'my-custom-group',
          groups: {
            default: { values: {} },
            'my-custom-group': { values: { width: 99 } },
          },
        },
      ],
    ]);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    expect(screen.getByText('my-custom-group')).toBeInTheDocument();
  });

  it('updates the displayed group name when activeGroup changes', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockParameterEntries = new Map<string, FileParameterEntry>([
      [
        'main.ts',
        {
          activeGroup: 'default',
          groups: {
            default: { values: {} },
            alternate: { values: { width: 50 } },
          },
        },
      ],
    ]);

    const { ChatParameters } = await import('./chat-parameters.js');
    const { rerender } = render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    expect(screen.getByText('default')).toBeInTheDocument();
    expect(screen.queryByText('alternate')).not.toBeInTheDocument();

    mockParameterEntries = new Map<string, FileParameterEntry>([
      [
        'main.ts',
        {
          activeGroup: 'alternate',
          groups: {
            default: { values: {} },
            alternate: { values: { width: 50 } },
          },
        },
      ],
    ]);

    rerender(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    expect(screen.getByText('alternate')).toBeInTheDocument();
  });
});

describe('ParametersPanelHeader context menu', () => {
  beforeEach(() => {
    mockGeometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();
    mockProjectSend.mockClear();
    mockEditorSend.mockClear();
    mockParameterEntries = new Map<string, FileParameterEntry>([
      ['main.ts', { activeGroup: 'default', groups: { default: { values: {} } } }],
    ]);
  });

  it('renders Quick Export and Close renderer items in dropdown menu', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockGeometryUnits.set('helper.ts', mockCadRef2);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const dropdownContents = screen.getAllByTestId('dropdown-menu-content');
    expect(dropdownContents.length).toBeGreaterThan(0);

    const closeItems = screen.getAllByText('Close renderer');
    expect(closeItems.length).toBeGreaterThan(0);

    const quickExportLabels = screen.getAllByText('Quick export');
    expect(quickExportLabels.length).toBeGreaterThan(0);
  });

  it('renders the same items in the right-click context menu', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockGeometryUnits.set('helper.ts', mockCadRef2);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    expect(screen.getAllByTestId('context-menu-content').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('context-menu-sub-content').length).toBeGreaterThan(0);
  });

  it('dispatches destroyGeometryUnit when "Close" is selected', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockGeometryUnits.set('helper.ts', mockCadRef2);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    // Use the dropdown-menu close button for the helper pane (second occurrence)
    const dropdownItems = screen.getAllByTestId('dropdown-menu-item');
    const helperCloseItem = dropdownItems.find(
      (node) => String(node.textContent).includes('Close renderer') && node.dataset['disabled'] !== 'true',
    );
    expect(helperCloseItem).toBeDefined();
    fireEvent.click(helperCloseItem!);

    expect(mockProjectSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'destroyGeometryUnit' }));
  });

  it('disables Close renderer when only one geometry unit remains', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const closeItems = screen
      .getAllByTestId('dropdown-menu-item')
      .filter((node) => String(node.textContent).includes('Close renderer'));
    expect(closeItems.length).toBeGreaterThan(0);
    for (const item of closeItems) {
      expect(item.dataset['disabled']).toBe('true');
    }
  });

  it('does not dispatch destroyGeometryUnit when Close is disabled', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const closeItem = screen
      .getAllByTestId('dropdown-menu-item')
      .find((node) => String(node.textContent).includes('Close renderer'));
    expect(closeItem).toBeDefined();
    fireEvent.click(closeItem!);

    expect(mockProjectSend).not.toHaveBeenCalled();
  });

  it('renders an "Open in viewer" item in both menus', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockGeometryUnits.set('helper.ts', mockCadRef2);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const dropdownOpenItems = screen
      .getAllByTestId('dropdown-menu-item')
      .filter((node) => String(node.textContent).includes('Open in viewer'));
    expect(dropdownOpenItems.length).toBeGreaterThan(0);

    const contextOpenItems = screen
      .getAllByTestId('context-menu-item')
      .filter((node) => String(node.textContent).includes('Open in viewer'));
    expect(contextOpenItems.length).toBeGreaterThan(0);
  });

  it('dispatches openInViewer when "Open in viewer" is selected from the dropdown', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockGeometryUnits.set('helper.ts', mockCadRef2);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const helperOpenItem = screen.getAllByTestId('dropdown-menu-item').find(
      (node) =>
        String(node.textContent).includes('Open in viewer') &&
        // The dropdown is per-pane, so target the helper pane's instance.
        // We assume the second occurrence corresponds to helper.ts (paneview
        // mock preserves panel order).
        true,
    );
    expect(helperOpenItem).toBeDefined();
    fireEvent.click(helperOpenItem!);

    expect(mockProjectSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'openInViewer' }));
  });

  it('dispatches openInViewer when "Open in viewer" is selected from the context menu', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockGeometryUnits.set('helper.ts', mockCadRef2);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const contextOpenItem = screen
      .getAllByTestId('context-menu-item')
      .find((node) => String(node.textContent).includes('Open in viewer'));
    expect(contextOpenItem).toBeDefined();
    fireEvent.click(contextOpenItem!);

    expect(mockProjectSend).toHaveBeenCalledWith(expect.objectContaining({ type: 'openInViewer' }));
  });

  it('renders an "Open in editor" item in both menus', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockGeometryUnits.set('helper.ts', mockCadRef2);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const dropdownEditorItems = screen
      .getAllByTestId('dropdown-menu-item')
      .filter((node) => String(node.textContent).includes('Open in editor'));
    expect(dropdownEditorItems.length).toBeGreaterThan(0);

    const contextEditorItems = screen
      .getAllByTestId('context-menu-item')
      .filter((node) => String(node.textContent).includes('Open in editor'));
    expect(contextEditorItems.length).toBeGreaterThan(0);
  });

  it('dispatches openFile on editorRef when "Open in editor" is selected from the dropdown', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const editorItem = screen
      .getAllByTestId('dropdown-menu-item')
      .find((node) => String(node.textContent).includes('Open in editor'));
    expect(editorItem).toBeDefined();
    fireEvent.click(editorItem!);

    expect(mockEditorSend).toHaveBeenCalledWith({ type: 'openFile', path: 'main.ts', source: 'user' });
  });

  it('dispatches openFile on editorRef when "Open in editor" is selected from the context menu', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const editorItem = screen
      .getAllByTestId('context-menu-item')
      .find((node) => String(node.textContent).includes('Open in editor'));
    expect(editorItem).toBeDefined();
    fireEvent.click(editorItem!);

    expect(mockEditorSend).toHaveBeenCalledWith({ type: 'openFile', path: 'main.ts', source: 'user' });
  });
});

describe('ChatParametersTrigger', () => {
  it('renders trigger button', async () => {
    const { ChatParametersTrigger } = await import('./chat-parameters.js');
    const onToggle = vi.fn();
    render(<ChatParametersTrigger isOpen={false} onToggle={onToggle} />);

    expect(screen.getByTestId('params-trigger')).toBeInTheDocument();
  });
});
