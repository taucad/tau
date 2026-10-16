import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSourceModelInteractionUnitId } from '@taucad/viewer/machines/model-interaction.machine';
import type { WorkbenchUnit } from '#host/workbench-host.jsx';
import { ModelPane } from '#model/model-pane.jsx';
import type { ModelComponentTarget, ModelSource } from '#model/model-source.js';
import { createGraphicsRefForUnit, createNode, ModelHost } from '#model/model.test-utils.jsx';

const mocks = vi.hoisted(() => ({
  paneApis: new Map<string, { setExpanded: ReturnType<typeof vi.fn> }>(),
}));

vi.mock('@xstate/react', () => ({
  useSelector: <Snapshot, Value>(actor: { getSnapshot: () => Snapshot }, selector: (snapshot: Snapshot) => Value) =>
    selector(actor.getSnapshot()),
}));

vi.mock('dockview-react', () => ({
  PaneviewReact: ({
    onReady,
    components,
    headerComponents,
  }: {
    onReady: (event: { api: Record<string, unknown> }) => void;
    components: Record<string, React.ComponentType<{ params: Record<string, unknown> }>>;
    headerComponents: Record<
      string,
      React.ComponentType<{ api: Record<string, unknown>; params: Record<string, unknown> }>
    >;
  }) => {
    type MockPanel = {
      id: string;
      component: string;
      headerComponent: string;
      isExpanded: boolean;
      minimumBodySize: number;
      size: number;
      params: Record<string, unknown>;
      api: Record<string, unknown>;
    };
    const panels: MockPanel[] = [];
    const api = {
      panels,
      addPanel: (options: Omit<MockPanel, 'api'>) => {
        const setExpanded = vi.fn();
        const panelApi = {
          isExpanded: options.isExpanded,
          onDidExpansionChange: () => ({ dispose: vi.fn() }),
          setExpanded,
          setSize: vi.fn(),
          updateParameters: (next: Record<string, unknown>) => {
            Object.assign(options.params, next);
          },
        };
        mocks.paneApis.set(options.id, { setExpanded });
        panels.push({ ...options, api: panelApi });
      },
      getPanel: (id: string) => panels.find((panel) => panel.id === id),
    };
    onReady({ api });

    return (
      <div data-testid='model-paneview'>
        {panels.map((panel) => {
          const Header = headerComponents[panel.headerComponent]!;
          const Body = components[panel.component]!;
          return (
            <section
              key={panel.id}
              data-testid={`model-pane-${panel.id}`}
              data-expanded={String(panel.isExpanded)}
              data-minimum-body-size={panel.minimumBodySize}
              data-size={panel.size}
            >
              <Header api={panel.api} params={panel.params} />
              <Body params={panel.params} />
            </section>
          );
        })}
      </div>
    );
  },
}));

const firstComponentId = 'component:first';
const secondComponentId = 'component:second';

function renderPane({
  units,
  source,
  onRequestOpen,
}: {
  readonly units: readonly WorkbenchUnit[];
  readonly source?: ModelSource;
  readonly onRequestOpen?: () => void;
}): ReturnType<typeof render> {
  return render(
    <ModelHost units={units} source={source}>
      <ModelPane onRequestOpen={onRequestOpen} />
    </ModelHost>,
  );
}

beforeEach(() => {
  mocks.paneApis.clear();
});

describe('ModelPane', () => {
  it('should render the empty state when the host lists no units', () => {
    renderPane({ units: [] });

    expect(screen.getByRole('searchbox', { name: 'Filter parts' })).toHaveAttribute('placeholder', 'Filter parts…');
    expect(screen.getByText('No model components available').closest('[data-slot="panel-empty-state"]')).toBeTruthy();
  });

  it('should render default-open Paneview units and filter every unit from one permanent input', async () => {
    const user = userEvent.setup();
    renderPane({
      units: [
        {
          entryPath: 'src/main.ts',
          graphicsRef: createGraphicsRefForUnit('src/main.ts', [createNode(firstComponentId, 'main_part')]),
        },
        {
          entryPath: 'src/helper.ts',
          graphicsRef: createGraphicsRefForUnit('src/helper.ts', [createNode(secondComponentId, 'helper_part')]),
        },
      ],
    });

    const unitHeaders = screen.getAllByRole('button', { name: /src\/.+\.ts/u });
    expect(unitHeaders[0]).toHaveAccessibleName('src/main.ts');
    expect(unitHeaders[1]).toHaveAccessibleName('src/helper.ts');
    expect(screen.getByTestId('model-pane-src/main.ts')).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByTestId('model-pane-src/helper.ts')).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByTestId('model-pane-src/main.ts')).toHaveAttribute('data-size', '200');
    expect(screen.getByTestId('model-pane-src/main.ts')).toHaveAttribute('data-minimum-body-size', '144');
    expect(screen.getByTestId('model-pane-properties')).toHaveAttribute('data-size', '392');
    expect(screen.getByText('No part selected')).toBeVisible();
    expect(screen.getByText('main_part')).toBeInTheDocument();
    expect(screen.getByText('helper_part')).toBeInTheDocument();

    const filterInput = screen.getByRole('searchbox', { name: 'Filter parts' });
    await user.type(filterInput, 'helper');

    expect(screen.queryByText('main_part')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'helper_part' }).tabIndex).toBe(0);
    expect(screen.getByText('helper')).toHaveAttribute('data-slot', 'highlight');
    expect(screen.getByText('No matching parts').closest('[data-slot="panel-empty-state"]')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(filterInput).toHaveValue('');
    expect(screen.getByText('main_part')).toBeInTheDocument();
  });

  it("opens each section at the host's saved layout and connects the host to it", () => {
    const connectApi = vi.fn();
    renderPane({
      units: [
        {
          entryPath: 'src/main.ts',
          graphicsRef: createGraphicsRefForUnit('src/main.ts', [createNode(firstComponentId, 'main_part')]),
        },
      ],
      source: {
        usePanelLayout: () => ({
          savedState: { 'src/main.ts': { isExpanded: false, size: 120 }, properties: { isExpanded: true, size: 300 } },
          connectApi,
        }),
      },
    });

    expect(screen.getByTestId('model-pane-src/main.ts')).toHaveAttribute('data-expanded', 'false');
    expect(screen.getByTestId('model-pane-src/main.ts')).toHaveAttribute('data-size', '120');
    expect(screen.getByTestId('model-pane-properties')).toHaveAttribute('data-size', '300');
    expect(connectApi).toHaveBeenCalledOnce();
  });

  it('should keep one visible part Tab stop when filtering out the selected row', async () => {
    const user = userEvent.setup();
    renderPane({
      units: [
        {
          entryPath: 'src/main.ts',
          graphicsRef: createGraphicsRefForUnit(
            'src/main.ts',
            [createNode(firstComponentId, 'planetary_housing'), createNode(secondComponentId, 'sun_gear_assembly')],
            { selectedComponentIds: [firstComponentId] },
          ),
        },
      ],
    });

    expect(screen.getByRole('button', { name: 'planetary_housing' }).tabIndex).toBe(0);
    await user.type(screen.getByRole('searchbox', { name: 'Filter parts' }), 'sun');
    const visible = screen.getByRole('button', { name: 'sun_gear_assembly' });
    expect(visible.tabIndex).toBe(0);
    act(() => {
      visible.focus();
    });
    expect(visible).toHaveFocus();
  });

  it('should move the single part Tab stop with arrows, Home, and End', async () => {
    const user = userEvent.setup();
    renderPane({
      units: [
        {
          entryPath: 'src/main.ts',
          graphicsRef: createGraphicsRefForUnit('src/main.ts', [
            createNode(firstComponentId, 'planetary_housing'),
            createNode(secondComponentId, 'sun_gear_assembly'),
          ]),
        },
      ],
    });
    const firstButton = screen.getByRole('button', { name: 'planetary_housing' });
    const secondButton = screen.getByRole('button', { name: 'sun_gear_assembly' });
    act(() => {
      firstButton.focus();
    });
    expect(firstButton.tabIndex).toBe(0);
    await user.keyboard('{ArrowDown}');
    expect(secondButton).toHaveFocus();
    expect(secondButton.tabIndex).toBe(0);
    expect(firstButton.tabIndex).toBe(-1);
    await user.keyboard('{Home}');
    expect(firstButton).toHaveFocus();
    await user.keyboard('{End}');
    expect(secondButton).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(firstButton).toHaveFocus();
  });

  it('should find a part by its indexed source material name', async () => {
    const user = userEvent.setup();
    renderPane({
      units: [
        {
          entryPath: 'src/main.ts',
          graphicsRef: createGraphicsRefForUnit('src/main.ts', [
            createNode(firstComponentId, 'housing', {
              // oxlint-disable-next-line tau-lint/no-hardcoded-color -- GLB material color is source fixture data.
              materials: [{ materialIndex: 3, name: 'Brushed steel', color: '#aabbcc' }],
            }),
            createNode(secondComponentId, 'sun_gear'),
          ]),
        },
      ],
    });

    await user.type(screen.getByRole('searchbox', { name: 'Filter parts' }), 'brushed');
    expect(screen.getByRole('button', { name: 'housing' })).toBeInTheDocument();
    expect(screen.getByText('· Brushed steel')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'sun_gear' })).not.toBeInTheDocument();
  });

  it('should clear Properties when its selected model unit closes', async () => {
    const view = renderPane({
      units: [
        {
          entryPath: 'src/main.ts',
          graphicsRef: createGraphicsRefForUnit('src/main.ts', [createNode(firstComponentId, 'housing')], {
            selectedComponentIds: [firstComponentId],
          }),
        },
      ],
    });
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Physical facts' })).toBeVisible();
    });

    view.rerender(
      <ModelHost
        units={[
          {
            entryPath: 'src/other.ts',
            graphicsRef: createGraphicsRefForUnit('src/other.ts', [createNode(secondComponentId, 'gear')]),
          },
        ]}
      >
        <ModelPane />
      </ModelHost>,
    );
    expect(screen.getByText('No part selected')).toBeVisible();
  });

  it('should surface units without an active renderer as unavailable', () => {
    renderPane({
      units: [
        {
          entryPath: 'src/main.ts',
          graphicsRef: createGraphicsRefForUnit('src/main.ts', [createNode(firstComponentId, 'main_part')]),
        },
        { entryPath: 'src/unopened.ts', graphicsRef: undefined },
      ],
    });

    expect(screen.getByText('src/main.ts')).toBeInTheDocument();
    expect(screen.getByText('src/unopened.ts')).toBeInTheDocument();
    expect(
      screen.getByText('Open renderer to inspect components').closest('[data-slot="panel-empty-state"]'),
    ).toBeTruthy();
  });

  it('should expose a unit header control to show hidden components', async () => {
    const user = userEvent.setup();
    const graphicsRef = createGraphicsRefForUnit('src/main.ts', [createNode(firstComponentId, 'main_part')], {
      hiddenComponentIds: [firstComponentId],
    });
    renderPane({ units: [{ entryPath: 'src/main.ts', graphicsRef }] });

    const showHiddenButton = screen.getByRole('button', { name: 'Show hidden components in src/main.ts' });
    expect(showHiddenButton).not.toHaveClass('opacity-0');
    expect(showHiddenButton.className).not.toContain('group-hover');

    await user.click(showHiddenButton);

    expect(graphicsRef.sent).toContainEqual({
      type: 'showHiddenModelComponents',
      unitId: 'file:src/main.ts',
      source: 'explorer',
    });
  });

  it("reveals a component the host's reveal channel names", async () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    const onRequestOpen = vi.fn();
    let listener: ((target: ModelComponentTarget) => void) | undefined;
    const unsubscribe = vi.fn();
    const helperUnitId = createSourceModelInteractionUnitId('src/helper.ts');
    try {
      const view = renderPane({
        units: [
          {
            entryPath: 'src/main.ts',
            graphicsRef: createGraphicsRefForUnit('src/main.ts', [createNode(firstComponentId, 'main_part')]),
          },
          {
            entryPath: 'src/helper.ts',
            graphicsRef: createGraphicsRefForUnit('src/helper.ts', [createNode(secondComponentId, 'helper_part')], {
              selectedComponentIds: [secondComponentId],
            }),
          },
        ],
        source: {
          reveal: {
            subscribe(next) {
              listener = next;
              return unsubscribe;
            },
            request: vi.fn(),
          },
        },
        onRequestOpen,
      });
      await user.type(screen.getByRole('searchbox', { name: 'Filter parts' }), 'main');

      act(() => {
        listener?.({ entryPath: 'src/helper.ts', unitId: helperUnitId, componentId: secondComponentId });
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'helper_part' })).toHaveFocus();
      });
      expect(onRequestOpen).toHaveBeenCalled();
      expect(screen.getByRole('searchbox', { name: 'Filter parts' })).toHaveValue('');
      expect(mocks.paneApis.get('src/helper.ts')?.setExpanded).toHaveBeenCalledWith(true);
      view.unmount();
      expect(unsubscribe).toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('selects and reveals a part from the unknown-weight list itself when the host has no reveal channel', async () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    const graphicsRef = createGraphicsRefForUnit('src/main.ts', [
      createNode(firstComponentId, 'main_part'),
      createNode(secondComponentId, 'other_part'),
    ]);
    try {
      renderPane({ units: [{ entryPath: 'src/main.ts', graphicsRef }] });
      await user.type(screen.getByRole('searchbox', { name: 'Filter parts' }), 'main');
      await user.click(screen.getByRole('button', { name: 'Missing' }));
      const missing = screen.getByRole('list', { name: 'Parts with unknown weight' });
      await user.click(within(missing).getByRole('button', { name: 'other_part' }));

      expect(graphicsRef.sent).toContainEqual({
        type: 'selectModelComponent',
        unitId: 'file:src/main.ts',
        componentId: secondComponentId,
        source: 'explorer',
      });
      expect(screen.getByRole('searchbox', { name: 'Filter parts' })).toHaveValue('');
      expect(mocks.paneApis.get('src/main.ts')?.setExpanded).toHaveBeenCalledWith(true);
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('follows the presented unit and reports the selection when the host asks', () => {
    const onSelect = vi.fn();
    const presentedUnitId = 'geometry:sha256:abc';
    const graphicsRef = createGraphicsRefForUnit('model.glb', [createNode(firstComponentId, 'glb_part')], {
      presentedUnitId,
      selectedComponentIds: [firstComponentId],
      manifestSourceFile: 'src/main.ts',
    });
    renderPane({ units: [{ entryPath: 'model.glb', graphicsRef }], source: { unitIdentity: 'presented', onSelect } });

    expect(screen.getByRole('button', { name: 'glb_part' })).toHaveAttribute('aria-pressed', 'true');
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ scheme: 'tau-cad', filePath: 'src/main.ts', componentId: firstComponentId }),
    );
  });

  it('derives the unit from the entry path by default', () => {
    const graphicsRef = createGraphicsRefForUnit('model.glb', [createNode(firstComponentId, 'glb_part')], {
      presentedUnitId: 'geometry:sha256:abc',
    });
    renderPane({ units: [{ entryPath: 'model.glb', graphicsRef }] });

    expect(screen.queryByRole('button', { name: 'glb_part' })).not.toBeInTheDocument();
  });
});
