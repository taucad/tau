import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ParameterManifest, ParameterSetOutcome } from '@taucad/parameters';
import { fileParameterEntrySchema } from '@taucad/types';
import type { FileParameterEntry } from '@taucad/types';
import type { ParameterEdit } from '@taucad/viewer/parameters/rjsf-context';
import { WorkbenchPanesHostProvider } from '#host/workbench-host.jsx';
import type { GraphicsRef, WorkbenchPanesHost, WorkbenchUnit } from '#host/workbench-host.jsx';
import { ParametersPane } from '#parameters/parameters-pane.jsx';
import type { ParametersEntryState, ParametersSource } from '#parameters/parameters-source.js';

const captured = vi.hoisted(() => ({ edit: undefined as unknown }));
const mockPaneSetExpanded = vi.fn();
let mockScrubFinal = Promise.resolve(true);

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

vi.mock('@taucad/viewer/parameters/parameters', () => ({
  Parameters: ({
    parameters,
    className,
    enableSearch,
    filterTerm,
    onParametersChange,
    units,
    parameterEdit,
  }: {
    parameters: Record<string, unknown>;
    className?: string;
    enableSearch?: boolean;
    filterTerm?: string;
    onParametersChange: (params: Record<string, unknown>) => void;
    units: { length: { displaySymbol: string } };
    parameterEdit?: {
      kind: 'authoritative';
      commit: {
        scrub?: (field: { pointer: string; value: string }) => void;
        endScrub?: (final?: Promise<boolean>) => Promise<void>;
      };
    };
  }) => {
    captured.edit = parameterEdit;
    return (
      <div
        data-testid='parameters-component'
        data-params={JSON.stringify(parameters)}
        data-class-name={className}
        data-enable-search={String(enableSearch)}
        data-filter-term={filterTerm}
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
        <button
          type='button'
          data-testid='scrub-param'
          onClick={() => parameterEdit?.commit.scrub?.({ pointer: '/width', value: '21 in' })}
        >
          Scrub
        </button>
        <button
          type='button'
          data-testid='release-scrub'
          onClick={() => {
            void parameterEdit?.commit.endScrub?.(mockScrubFinal);
          }}
        >
          Release scrub
        </button>
        <button
          type='button'
          data-testid='cancel-scrub'
          onClick={() => {
            void parameterEdit?.commit.endScrub?.();
          }}
        >
          Cancel scrub
        </button>
      </div>
    );
  },
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

vi.mock('@taucad/ui/components/combobox-responsive', () => ({
  ComboBoxResponsive: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
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

const manifest = {
  revision: 'manifest',
  identity: { resolution: {} },
  defaults: { width: 10, height: 20 },
  legacyProjection: {
    status: 'usable',
    schema: { type: 'object', properties: { width: { type: 'number' }, height: { type: 'number' } } },
  },
} as unknown as ParameterManifest;

const entryOf = (activeGroup: string, groups: Record<string, Record<string, unknown>>): FileParameterEntry =>
  fileParameterEntrySchema.parse({
    activeGroup,
    groups: Object.fromEntries(Object.entries(groups).map(([name, values]) => [name, { values }])),
  });

const committed: ParameterSetOutcome = {
  status: 'committed',
  requestId: 'request',
  revision: { manifestRevision: 'manifest' },
  write: 'applied',
};

/** A graphics actor whose display length unit is `symbol`. */
const graphicsWith = (symbol: string): GraphicsRef =>
  ({
    getSnapshot: () => ({ context: { displayUnits: { length: { symbol } } } }),
    subscribe: () => ({ unsubscribe: () => undefined }),
  }) as unknown as GraphicsRef;

let entries: Map<string, ParametersEntryState>;

const renderPane = (
  overrides: Partial<ParametersSource> = {},
  units: readonly WorkbenchUnit[] = [{ entryPath: 'main.ts', graphicsRef: undefined }],
) => {
  const source: ParametersSource = {
    useEntry: (entryPath) => entries.get(entryPath) ?? { manifest: undefined, entry: undefined, failure: undefined },
    commitValue: vi.fn(async () => committed),
    replaceValues: vi.fn(),
    ...overrides,
  };
  const host: WorkbenchPanesHost = { useUnits: () => units, parameters: source };
  const view = render(
    <WorkbenchPanesHostProvider value={host}>
      <ParametersPane />
    </WorkbenchPanesHostProvider>,
  );
  return { ...view, source };
};

const twoUnits: readonly WorkbenchUnit[] = [
  { entryPath: 'main.ts', graphicsRef: undefined },
  { entryPath: 'helper.ts', graphicsRef: undefined },
];

const groupOperations = () => ({ select: vi.fn(), create: vi.fn(), rename: vi.fn(), delete: vi.fn() });

beforeEach(() => {
  mockPaneSetExpanded.mockClear();
  mockScrubFinal = Promise.resolve(true);
  captured.edit = undefined;
  entries = new Map([
    ['main.ts', { manifest, entry: entryOf('default', { default: { width: 15 } }), failure: undefined }],
    ['helper.ts', { manifest, entry: entryOf('default', { default: {} }), failure: undefined }],
  ]);
});

describe('ParametersPane', () => {
  it('renders nothing without a parameters source', () => {
    const { container } = render(
      <WorkbenchPanesHostProvider value={{ useUnits: () => [] }}>
        <ParametersPane />
      </WorkbenchPanesHostProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('filters every entry from one persistent input', async () => {
    const user = userEvent.setup();
    renderPane({}, twoUnits);

    const filter = screen.getByRole('searchbox', { name: 'Filter parameters' });
    expect(filter).toHaveAttribute('placeholder', 'Filter parameters…');
    expect(screen.getAllByRole('searchbox', { name: 'Filter parameters' })).toHaveLength(1);

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

  it('keeps the filter and sidebar surface visible without entries', () => {
    const { container } = renderPane({}, []);

    expect(screen.getByRole('searchbox', { name: 'Filter parameters' })).toBeVisible();
    expect(screen.getByText('No geometry units.')).toBeVisible();
    expect(container.querySelector('[data-slot="parameters-panel-body"]')?.className).toContain('bg-sidebar');
    expect(container.querySelector('[data-slot="parameters-filter"]')?.className).not.toContain('border-b');
  });

  it('lists only the entries the source has parameters for, in host order', () => {
    renderPane({ useEntryPaths: () => ['helper.ts'] }, twoUnits);

    const panes = screen.getAllByTestId(/^param-pane-/u);
    expect(panes.map((pane) => pane.dataset['testid'])).toEqual(['param-pane-helper.ts']);
  });

  it('expands the main entry, sized, and collapses the others by default', () => {
    renderPane({}, twoUnits);

    expect(screen.getByTestId('param-pane-main.ts').dataset['expanded']).toBe('true');
    expect(screen.getByTestId('param-pane-helper.ts').dataset['expanded']).toBe('false');
    for (const pane of screen.getAllByTestId(/^param-pane-/u)) {
      expect(pane).toHaveAttribute('data-header-size', '40');
    }
  });

  it('restores saved expansion and hands the layout to the host', () => {
    const connectApi = vi.fn();
    renderPane(
      { usePaneviewPersistence: () => ({ savedState: { 'helper.ts': { isExpanded: true } }, connectApi }) },
      twoUnits,
    );

    expect(screen.getByTestId('param-pane-helper.ts').dataset['expanded']).toBe('true');
    expect(connectApi).toHaveBeenCalled();
  });

  it('shows the active group values with the main view display unit', () => {
    renderPane({}, [
      { entryPath: 'main.ts', graphicsRef: graphicsWith('in') },
      { entryPath: 'helper.ts', graphicsRef: graphicsWith('m') },
    ]);

    const [main, helper] = screen.getAllByTestId('parameters-component');
    expect(JSON.parse(main!.dataset['params']!)).toEqual({ width: 15 });
    expect(main).toHaveAttribute('data-display-symbol', 'in');
    expect(helper).toHaveAttribute('data-display-symbol', 'in');
  });

  it('waits for the manifest before showing the form', () => {
    entries.set('main.ts', { manifest: undefined, entry: undefined, failure: undefined });
    renderPane();

    expect(screen.getByText('Loading parameter metadata…')).toBeInTheDocument();
  });

  it('offers Retry for a failure the source can retry', () => {
    const retry = vi.fn();
    entries.set('main.ts', {
      manifest,
      entry: undefined,
      failure: { code: 'WRITE_UNCERTAIN', message: 'The last write could not be confirmed.' },
    });
    renderPane({ retry });

    expect(screen.getByText('Parameters could not be loaded.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledWith('main.ts', manifest);
  });

  it('resets an unreadable record when the source can, and reports a failed reset', async () => {
    const reportError = vi.fn();
    const resetRecord = vi.fn(async () => {
      throw new Error('Reset refused.');
    });
    entries.set('main.ts', { manifest, entry: undefined, failure: { code: 'INVALID_RECORD', message: 'Bad bytes.' } });
    renderPane({ resetRecord, reportError, retry: vi.fn() });

    expect(screen.getByText('Saved parameter values for this model cannot be read.')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset to model defaults' }));
    });
    expect(resetRecord).toHaveBeenCalledWith('main.ts');
    expect(reportError).toHaveBeenCalledWith('Reset refused.');
  });

  it('offers Retry for an unreadable record when the source cannot reset it', () => {
    entries.set('main.ts', { manifest, entry: undefined, failure: { code: 'INVALID_RECORD', message: 'Bad bytes.' } });
    renderPane({ retry: vi.fn() });

    expect(screen.queryByRole('button', { name: 'Reset to model defaults' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('replaces the group values on a form change', () => {
    const { source } = renderPane();

    fireEvent.click(screen.getByTestId('change-params'));
    expect(source.replaceValues).toHaveBeenCalledWith('main.ts', manifest, { width: 42 });
  });

  it('shows a failed operation above the sections when the source has no reporter', async () => {
    renderPane({
      replaceValues: async () => {
        throw new Error('The record changed.');
      },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('change-params'));
    });
    expect(screen.getByRole('alert')).toMatchTextContent('The record changed.');
  });

  it('commits a field of the active group and refuses setValue that does not commit', async () => {
    const commitValue = vi.fn(
      async (): Promise<ParameterSetOutcome> => ({
        status: 'rejected',
        requestId: 'request',
        code: 'STALE',
        message: 'Stale.',
      }),
    );
    renderPane({ commitValue });
    const edit = captured.edit as Extract<ParameterEdit, { kind: 'authoritative' }>;

    await edit.commit.commit({ pointer: '/width', value: 3 });
    expect(commitValue).toHaveBeenCalledWith('main.ts', manifest, { group: 'default', pointer: '/width', value: 3 });
    await expect(
      edit.commit.setValue({ pointer: '/width', value: 3, base: { pointer: '/width', value: 15 } }),
    ).rejects.toThrow('Stale.');
    expect(edit.commit.target).toEqual({ authority: 'workbench-panes', root: '', entry: 'main.ts' });
  });

  it('keeps row drafts in the pane when the source keeps none', () => {
    renderPane();
    const edit = captured.edit as Extract<ParameterEdit, { kind: 'authoritative' }>;
    const listener = vi.fn();
    edit.commit.subscribeDrafts(listener);

    edit.commit.setDraft('/width', { text: '1.', valid: false });
    expect(edit.commit.draft('/width')).toEqual({ text: '1.', valid: false });
    expect(listener).not.toHaveBeenCalled();
    edit.commit.setDraft('/width', undefined);
    expect(edit.commit.draft('/width')).toBeUndefined();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('routes drafts and the drag lane to the source when it has them', () => {
    const scrub = vi.fn();
    const drafts = { draft: vi.fn(), setDraft: vi.fn(), subscribe: vi.fn(() => () => undefined) };
    renderPane({ drafts, useScrub: () => ({ scrub }) });

    fireEvent.click(screen.getByTestId('scrub-param'));
    expect(scrub).toHaveBeenCalledWith({ pointer: '/width', value: '21 in' });
    const edit = captured.edit as Extract<ParameterEdit, { kind: 'authoritative' }>;
    edit.commit.setDraft('/width', { text: '2', valid: true });
    expect(drafts.setDraft).toHaveBeenCalledWith(
      { entryPath: 'main.ts', group: 'default', pointer: '/width' },
      { text: '2', valid: true },
    );
  });
});

describe('ParametersPane section header', () => {
  it('shows a group selector for every entry, even one without a record, when the source has groups', () => {
    entries.set('helper.ts', { manifest, entry: undefined, failure: undefined });
    renderPane({ groups: groupOperations() }, twoUnits);

    expect(screen.getAllByLabelText('Parameter groups')).toHaveLength(2);
  });

  it('hides the group selector when the source has no group operations', () => {
    renderPane();

    expect(screen.queryByLabelText('Parameter groups')).toBeNull();
  });

  it('reveals the group selector with the other actions and owns its tone (nested-action surfaces R3)', () => {
    renderPane({ groups: groupOperations() });

    const controls = screen.getByTestId('paneview-header-controls');
    const actions = screen.getByTestId('paneview-header-actions');
    const selector = screen.getByLabelText('Parameter groups');
    expect(controls.className).not.toContain('opacity-0');
    expect(actions).toContainElement(selector);
    expect(selector).toHaveClass('hover:bg-nested-action-hover', 'data-[state=open]:bg-nested-action-hover');
    expect(actions.className).toContain('opacity-0');
    expect(actions.className).toContain('group-hover/paneview-header:opacity-100');
    expect(actions.className).toContain('group-focus-within/paneview-header:opacity-100');
    expect(actions.className).toContain('[&:has([data-state=open])]:opacity-100');
    expect(actions.className).toContain('[@media(hover:none)]:opacity-100');
  });

  it('displays the active group name', () => {
    entries.set('main.ts', {
      manifest,
      entry: entryOf('my-custom-group', { default: {}, 'my-custom-group': { width: 99 } }),
      failure: undefined,
    });
    renderPane({ groups: groupOperations() });

    expect(screen.getByText('my-custom-group')).toBeInTheDocument();
  });

  it('resets the entry to the model defaults from the modified mark', () => {
    const { source } = renderPane();

    fireEvent.click(screen.getByRole('button', { name: 'Reset parameters' }));
    expect(source.replaceValues).toHaveBeenCalledWith('main.ts', manifest, {});
  });

  it('does not toggle the section from reset, saved-group, collapse or overflow controls', () => {
    renderPane({ groups: groupOperations(), openInViewer: vi.fn() });

    fireEvent.click(screen.getByRole('button', { name: 'Reset parameters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Parameter groups' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compilation unit actions' }));

    expect(mockPaneSetExpanded).not.toHaveBeenCalled();
  });

  it('has no entry menu when the source offers no entry actions', () => {
    renderPane();

    expect(screen.queryByRole('button', { name: 'Compilation unit actions' })).toBeNull();
    expect(screen.queryByTestId('context-menu')).toBeNull();
  });

  it('offers the source entry actions in both menus', () => {
    const openInViewer = vi.fn();
    const openInEditor = vi.fn();
    const closeEntry = vi.fn();
    renderPane(
      {
        openInViewer,
        openInEditor,
        closeEntry,
        QuickExport: ({ entryPath }) => <div data-testid='quick-export'>{entryPath}</div>,
      },
      twoUnits,
    );

    const dropdown = (label: string) =>
      screen.getAllByTestId('dropdown-menu-item').filter((node) => String(node.textContent).includes(label));
    const context = (label: string) =>
      screen.getAllByTestId('context-menu-item').filter((node) => String(node.textContent).includes(label));
    fireEvent.click(dropdown('Open in viewer')[1]!);
    expect(openInViewer).toHaveBeenCalledWith('helper.ts');
    fireEvent.click(context('Open in editor')[0]!);
    expect(openInEditor).toHaveBeenCalledWith('main.ts');
    fireEvent.click(dropdown('Close renderer')[1]!);
    expect(closeEntry).toHaveBeenCalledWith('helper.ts');
    expect(screen.getAllByTestId('quick-export').map((node) => node.textContent)).toEqual([
      'main.ts',
      'main.ts',
      'helper.ts',
      'helper.ts',
    ]);
  });

  it('disables Close renderer for the last entry', () => {
    const closeEntry = vi.fn();
    renderPane({ closeEntry });

    const closeItem = screen
      .getAllByTestId('dropdown-menu-item')
      .find((node) => String(node.textContent).includes('Close renderer'));
    expect(closeItem).toHaveAttribute('data-disabled', 'true');
    fireEvent.click(closeItem!);
    expect(closeEntry).not.toHaveBeenCalled();
  });
});
