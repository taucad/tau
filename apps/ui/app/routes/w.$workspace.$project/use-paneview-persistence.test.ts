import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PaneviewApi, IPaneviewPanel } from 'dockview-react';
import type { PaneviewPanelState } from '#types/editor.types.js';
import {
  getInitialPanelOptions,
  usePaneviewPersistence,
} from '#routes/w.$workspace.$project/use-chat-interface-state.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSend = vi.fn();
let mockPaneviewState: Record<string, PaneviewPanelState> = {};

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    editorRef: {
      send: mockSend,
      getSnapshot: vi.fn(() => ({
        context: {
          panelState: {
            kernelPaneview: mockPaneviewState,
            parametersPaneview: {},
          },
        },
        matches: vi.fn(() => true),
      })),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      on: vi.fn(() => ({ unsubscribe: vi.fn() })),
    },
  }),
}));

vi.mock('@xstate/react', () => ({
  useSelector: (_ref: unknown, selector: (state: { context: { panelState: Record<string, unknown> } }) => unknown) =>
    selector({
      context: {
        panelState: {
          kernelPaneview: mockPaneviewState,
          parametersPaneview: {},
        },
      },
    }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockPanel(id: string, isExpanded: boolean, height: number): IPaneviewPanel {
  return {
    id,
    height,
    api: { isExpanded },
  } as unknown as IPaneviewPanel;
}

function createMockPaneviewApi(): PaneviewApi & {
  panels: IPaneviewPanel[];
  triggerLayoutChange: () => void;
} {
  let layoutHandler: (() => void) | undefined;
  let panels: IPaneviewPanel[] = [];

  return {
    get panels() {
      return panels;
    },
    set panels(value: IPaneviewPanel[]) {
      panels = value;
    },
    onDidLayoutChange: vi.fn((callback: () => void) => {
      layoutHandler = callback;
      return { dispose: vi.fn() };
    }),
    addPanel: vi.fn(),
    triggerLayoutChange() {
      layoutHandler?.();
    },
  } as unknown as PaneviewApi & {
    panels: IPaneviewPanel[];
    triggerLayoutChange: () => void;
  };
}

// ---------------------------------------------------------------------------
// Tests: getInitialPanelOptions
// ---------------------------------------------------------------------------

describe('getInitialPanelOptions', () => {
  /* eslint-disable @typescript-eslint/naming-convention -- file path keys in test fixtures */
  it('returns defaults when no saved state exists', () => {
    const result = getInitialPanelOptions({}, 'main.ts', {
      isExpanded: true,
      size: 200,
    });
    expect(result).toEqual({ isExpanded: true, size: 200 });
  });

  it('returns saved state when entry exists', () => {
    const saved: Record<string, PaneviewPanelState> = {
      'main.ts': { isExpanded: false, size: 350 },
    };
    const result = getInitialPanelOptions(saved, 'main.ts', {
      isExpanded: true,
      size: 200,
    });
    expect(result).toEqual({ isExpanded: false, size: 350 });
  });

  it('returns defaults for unknown panel ID', () => {
    const saved: Record<string, PaneviewPanelState> = {
      'main.ts': { isExpanded: true, size: 200 },
    };
    const result = getInitialPanelOptions(saved, 'other.ts', {
      isExpanded: false,
      size: undefined,
    });
    expect(result).toEqual({ isExpanded: false, size: undefined });
  });

  it('handles defaults without size', () => {
    const result = getInitialPanelOptions({}, 'main.ts', {
      isExpanded: true,
    });
    expect(result).toEqual({ isExpanded: true });
  });
  /* eslint-enable @typescript-eslint/naming-convention -- file path keys in test fixtures */
});

// ---------------------------------------------------------------------------
// Tests: usePaneviewPersistence
// ---------------------------------------------------------------------------

describe('usePaneviewPersistence', () => {
  beforeEach(() => {
    mockPaneviewState = {};
    mockSend.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* eslint-disable @typescript-eslint/naming-convention -- file path keys in test fixtures */
  it('returns saved state from editor machine', () => {
    mockPaneviewState = { 'main.ts': { isExpanded: true, size: 200 } };

    const { result } = renderHook(() => usePaneviewPersistence('kernelPaneview'));
    expect(result.current.savedState).toEqual({
      'main.ts': { isExpanded: true, size: 200 },
    });
  });

  it('returns empty object when no saved state exists', () => {
    mockPaneviewState = {};

    const { result } = renderHook(() => usePaneviewPersistence('kernelPaneview'));
    expect(result.current.savedState).toEqual({});
  });

  it('dispatches setPanelState on layout change after connectApi', () => {
    const mockApi = createMockPaneviewApi();
    mockApi.panels = [createMockPanel('main.ts', true, 250), createMockPanel('other.ts', false, 80)];

    const { result } = renderHook(() => usePaneviewPersistence('kernelPaneview'));

    act(() => {
      result.current.connectApi(mockApi);
    });

    expect(mockApi.onDidLayoutChange).toHaveBeenCalledOnce();

    act(() => {
      mockApi.triggerLayoutChange();
    });

    expect(mockSend).toHaveBeenCalledWith({
      type: 'setPanelState',
      panelState: {
        kernelPaneview: {
          'main.ts': { isExpanded: true, size: 250 },
          'other.ts': { isExpanded: false, size: 80 },
        },
      },
    });
  });

  it('snapshots all panels on layout change', () => {
    const mockApi = createMockPaneviewApi();
    mockApi.panels = [
      createMockPanel('a.ts', true, 300),
      createMockPanel('b.ts', true, 150),
      createMockPanel('c.ts', false, 30),
    ];

    const { result } = renderHook(() => usePaneviewPersistence('kernelPaneview'));

    act(() => {
      result.current.connectApi(mockApi);
    });

    act(() => {
      mockApi.triggerLayoutChange();
    });

    const call = mockSend.mock.calls[0]![0] as { panelState: Record<string, Record<string, PaneviewPanelState>> };
    expect(call.panelState['kernelPaneview']).toEqual({
      'a.ts': { isExpanded: true, size: 300 },
      'b.ts': { isExpanded: true, size: 150 },
      'c.ts': { isExpanded: false, size: 30 },
    });
  });

  it('uses the correct paneview key in setPanelState', () => {
    const mockApi = createMockPaneviewApi();
    mockApi.panels = [createMockPanel('main.ts', true, 200)];

    const { result } = renderHook(() => usePaneviewPersistence('parametersPaneview'));

    act(() => {
      result.current.connectApi(mockApi);
    });

    act(() => {
      mockApi.triggerLayoutChange();
    });

    const call = mockSend.mock.calls[0]![0] as { panelState: Record<string, unknown> };
    expect(call.panelState).toHaveProperty('parametersPaneview');
    expect(call.panelState).not.toHaveProperty('kernelPaneview');
  });
  /* eslint-enable @typescript-eslint/naming-convention -- file path keys in test fixtures */
});
