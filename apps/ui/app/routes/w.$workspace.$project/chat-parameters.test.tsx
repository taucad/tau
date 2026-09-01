import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      units: { length: 'mm' },
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
      units: { length: 'm' },
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
const mockPaneSetExpanded = vi.fn();
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
      context: { displayUnits: { length: { symbol: 'mm', metersPerUnit: 0.001, system: 'si' } } },
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
      headerSize: number;
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
      setExpanded: mockPaneSetExpanded,
      setSize: noop,
      updateParameters: noop,
    };
    return (
      <div data-testid='paneview'>
        {panels.map((p) => {
          const Component = components[p.component];
          const HeaderComponent = p.headerComponent && headerComponents?.[p.headerComponent];
          return (
            <div
              key={p.id}
              data-testid={`param-pane-${p.id}`}
              data-expanded={p.isExpanded}
              data-header-size={p.headerSize}
            >
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
    className,
    enableSearch,
    filterTerm,
    onParametersChange,
    units,
  }: {
    parameters: Record<string, unknown>;
    className?: string;
    enableSearch?: boolean;
    filterTerm?: string;
    onParametersChange: (params: Record<string, unknown>) => void;
    units: { length: { sourceSymbol: string; displaySymbol: string } };
  }) => (
    <div
      data-testid='parameters-component'
      data-params={JSON.stringify(parameters)}
      data-class-name={className}
      data-enable-search={String(enableSearch)}
      data-filter-term={filterTerm}
      data-source-symbol={units.length.sourceSymbol}
      data-display-symbol={units.length.displaySymbol}
    >
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
}));

vi.mock('#components/ui/key-shortcut.js', () => ({
  KeyShortcut: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@taucad/utils/schema', () => ({
  hasJsonSchemaObjectProperties: (schema: unknown) =>
    Boolean(schema && typeof schema === 'object' && 'properties' in schema),
}));

vi.mock('@taucad/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));

vi.mock('#components/ui/combobox-responsive.js', () => ({
  ComboBoxResponsive: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));

vi.mock('#routes/w.$workspace.$project/use-chat-interface-state.js', () => ({
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

vi.mock('@taucad/ui/components/context-menu', () => ({
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

vi.mock('@taucad/ui/components/dropdown-menu', () => ({
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
    mockPaneSetExpanded.mockClear();
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

  it('passes each CAD source unit separately from the shared display unit', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockGeometryUnits.set('helper.ts', mockCadRef2);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const parameters = screen.getAllByTestId('parameters-component');
    expect(parameters[0]).toHaveAttribute('data-source-symbol', 'mm');
    expect(parameters[0]).toHaveAttribute('data-display-symbol', 'mm');
    expect(parameters[1]).toHaveAttribute('data-source-symbol', 'm');
    expect(parameters[1]).toHaveAttribute('data-display-symbol', 'mm');
  });

  it('filters every geometry unit from one persistent input', async () => {
    const user = userEvent.setup();
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockGeometryUnits.set('helper.ts', mockCadRef2);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const filter = screen.getByRole('textbox', { name: 'Filter parameters' });
    expect(filter).toHaveAttribute('placeholder', 'Filter parameters...');
    expect(screen.getAllByRole('textbox', { name: 'Filter parameters' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /show search|hide search/iu })).toBeNull();

    await user.type(filter, 'radius');

    for (const parameters of screen.getAllByTestId('parameters-component')) {
      expect(parameters).toHaveAttribute('data-filter-term', 'radius');
      expect(parameters).toHaveAttribute('data-enable-search', 'false');
      expect(parameters.dataset['className']).toContain('rounded-b-xl');
    }

    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    for (const parameters of screen.getAllByTestId('parameters-component')) {
      expect(parameters).toHaveAttribute('data-filter-term', '');
    }
  });

  it('keeps the filter and sidebar surface visible without geometry units', async () => {
    const { ChatParameters } = await import('./chat-parameters.js');
    const { container } = render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Filter parameters' })).toBeVisible();
    expect(screen.getByText('No geometry units.')).toBeVisible();

    const body = container.querySelector('[data-slot="parameters-panel-body"]');
    const filterGroup = container.querySelector('[data-slot="parameters-filter"]');
    expect(body?.className).toContain('bg-sidebar');
    expect(filterGroup?.className).not.toContain('border-b');
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

  it('allocates the shared rounded header height for every geometry unit', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockGeometryUnits.set('helper.ts', mockCadRef2);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    for (const pane of screen.getAllByTestId(/^param-pane-/)) {
      expect(pane).toHaveAttribute('data-header-size', '40');
    }
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

  it('keeps saved-group state persistent and gates only secondary actions', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    const controls = screen.getByTestId('paneview-header-controls');
    const actions = screen.getByTestId('paneview-header-actions');
    expect(controls.className).not.toContain('opacity-0');
    expect(screen.getByLabelText('Parameter groups')).toBeVisible();
    expect(actions.className).toContain('opacity-0');
    expect(actions.className).toContain('group-hover/paneview-header:opacity-100');
    expect(actions.className).toContain('group-focus-within/paneview-header:opacity-100');
    expect(actions.className).toContain('[&:has([data-state=open])]:opacity-100');
    expect(actions.className).toContain('[@media(hover:none)]:opacity-100');
  });

  it('does not toggle the pane from reset, saved-group, or overflow controls', async () => {
    mockGeometryUnits.set('main.ts', mockCadRef);
    mockParameterEntries = new Map<string, FileParameterEntry>([
      ['main.ts', { activeGroup: 'default', groups: { default: { values: { width: 15 } } } }],
    ]);

    const { ChatParameters } = await import('./chat-parameters.js');
    render(<ChatParameters isExpanded setIsExpanded={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset parameters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Parameter groups' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compilation unit actions' }));

    expect(mockPaneSetExpanded).not.toHaveBeenCalled();
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
