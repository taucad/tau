import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  activeTab: 'viewer',
  ready: true,
}));
const send = vi.fn();
const snapshot = {
  get context() {
    return {
      panelState: {
        mobileActiveTab: state.activeTab,
        parametersPaneview: {},
        kernelPaneview: {},
        modelPaneview: {},
        consolePaneview: {},
      },
    };
  },
  matches: () => state.ready,
};

vi.mock('@xstate/react', () => ({
  useSelector: (_actor: unknown, selector: (value: typeof snapshot) => unknown) => selector(snapshot),
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef: { send } }),
}));

const { useChatInterfaceState } = await import('./use-chat-interface-state.js');
const { mobileDrawerOpenSnapPoint } = await import('#constants/editor.constants.js');

describe('useChatInterfaceState mobile drawer', () => {
  beforeEach(() => {
    state.activeTab = 'viewer';
    state.ready = true;
    send.mockClear();
    send.mockImplementation((event: { readonly panelState?: { readonly mobileActiveTab?: string } }) => {
      if (event.panelState?.mobileActiveTab) {
        state.activeTab = event.panelState.mobileActiveTab;
      }
    });
  });

  it('opens the drawer when an external action activates Export', () => {
    const { result, rerender } = renderHook(() => useChatInterfaceState());
    expect(result.current.drawerOpen).toBe(false);

    state.activeTab = 'converter';
    rerender();

    expect(result.current.activeTab).toBe('converter');
    expect(result.current.drawerOpen).toBe(true);
  });

  it('persists tab changes and closes the drawer for the Viewer', () => {
    state.activeTab = 'chat';
    const { result, rerender } = renderHook(() => useChatInterfaceState());
    expect(result.current.drawerOpen).toBe(true);

    act(() => {
      result.current.handleTabChange('viewer');
    });
    rerender();

    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'setPanelState',
      panelState: { mobileActiveTab: 'viewer' },
    });
    expect(result.current.drawerOpen).toBe(false);
  });

  it('returns to the Viewer when the drawer is dismissed', () => {
    state.activeTab = 'parameters';
    const { result, rerender } = renderHook(() => useChatInterfaceState());

    act(() => {
      result.current.handleDrawerChange(false);
    });
    rerender();

    expect(send).toHaveBeenCalledWith({
      type: 'setPanelState',
      panelState: { mobileActiveTab: 'viewer' },
    });
    expect(result.current.drawerOpen).toBe(false);
  });

  it('closes the drawer when the persisted Viewer surface arrives after mounting on another tab', () => {
    // The route can mount on the default surface before the saved one is hydrated.
    state.activeTab = 'chat';
    const { result, rerender } = renderHook(() => useChatInterfaceState());
    expect(result.current.drawerOpen).toBe(true);

    state.activeTab = 'viewer';
    rerender();

    expect(result.current.activeTab).toBe('viewer');
    expect(result.current.drawerOpen).toBe(false);
  });

  it('closes the drawer when an external action returns to the Viewer', () => {
    state.activeTab = 'parameters';
    const { result, rerender } = renderHook(() => useChatInterfaceState());

    state.activeTab = 'viewer';
    rerender();

    expect(result.current.drawerOpen).toBe(false);
  });

  it('reopens the drawer at half height, not the full height it was left at, after the Model tab collapses it', () => {
    state.activeTab = 'parameters';
    const { result, rerender } = renderHook(() => useChatInterfaceState());

    act(() => {
      result.current.handleSnapChange(result.current.snapPoints.at(-1)!);
    });
    act(() => {
      result.current.handleTabChange('viewer');
    });
    rerender();
    act(() => {
      result.current.handleTabChange('chat');
    });
    rerender();

    expect(result.current.drawerOpen).toBe(true);
    expect(result.current.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);
  });

  it('reopens the drawer at half height, not the full height it was left at, after an external action returns to the Viewer', () => {
    state.activeTab = 'parameters';
    const { result, rerender } = renderHook(() => useChatInterfaceState());

    act(() => {
      result.current.handleSnapChange(result.current.snapPoints.at(-1)!);
    });
    state.activeTab = 'viewer';
    rerender();
    state.activeTab = 'converter';
    rerender();

    expect(result.current.drawerOpen).toBe(true);
    expect(result.current.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);
  });

  it('reopens the drawer at half height, not the full height it was left at, after it is dismissed', () => {
    state.activeTab = 'parameters';
    const { result, rerender } = renderHook(() => useChatInterfaceState());

    act(() => {
      result.current.handleSnapChange(result.current.snapPoints.at(-1)!);
    });
    act(() => {
      result.current.handleDrawerChange(false);
    });
    rerender();

    expect(result.current.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);
  });

  it('retains drawer snap-point and editor readiness state', () => {
    state.activeTab = 'parameters';
    const { result, rerender } = renderHook(() => useChatInterfaceState());
    expect(result.current.isEditorReady).toBe(true);
    expect(result.current.snapPoints.length).toBeGreaterThan(1);

    act(() => {
      result.current.handleSnapChange(result.current.snapPoints[1]!);
    });
    expect(result.current.activeSnapPoint).toBe(result.current.snapPoints[1]);

    state.ready = false;
    rerender();
    expect(result.current.isEditorReady).toBe(false);
  });

  it('offers half and full detents, in that order: collapsed is the sheet closed on the model', () => {
    const { result } = renderHook(() => useChatInterfaceState());
    expect(result.current.snapPoints).toEqual([0.5, 1]);
    expect(mobileDrawerOpenSnapPoint).toBe(0.5);
  });

  it('opens a file at full height and keeps the chosen height when switching between surfaces', () => {
    state.activeTab = 'chat';
    const { result, rerender } = renderHook(() => useChatInterfaceState());
    expect(result.current.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);

    state.activeTab = 'editor';
    rerender();
    expect(result.current.activeSnapPoint).toBe(1);

    act(() => {
      result.current.handleSnapChange(mobileDrawerOpenSnapPoint);
    });
    state.activeTab = 'parameters';
    rerender();
    expect(result.current.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);

    act(() => {
      result.current.handleSnapChange(1);
    });
    state.activeTab = 'chat';
    rerender();
    expect(result.current.activeSnapPoint).toBe(1);
  });

  it('falls back to the model when the persisted surface is unknown to this build', () => {
    state.activeTab = 'retired-surface';
    const { result } = renderHook(() => useChatInterfaceState());
    expect(result.current.activeTab).toBe('viewer');
    expect(result.current.drawerOpen).toBe(false);
  });

  it.each(['jobs', 'browser'])('falls back to the model when the persisted %s surface is not shipped here', (tab) => {
    state.activeTab = tab;
    const { result } = renderHook(() => useChatInterfaceState());
    expect(result.current.activeTab).toBe('viewer');
    expect(result.current.drawerOpen).toBe(false);
  });

  it('drops the snap reset vaul sends after a close it made, so a quick reopen keeps its own height', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    state.activeTab = 'parameters';
    const { result, rerender } = renderHook(() => useChatInterfaceState());

    act(() => {
      result.current.handleDrawerChange(false);
    });
    rerender();
    act(() => {
      result.current.handleTabChange('editor');
    });
    rerender();
    expect(result.current.activeSnapPoint).toBe(1);
    now.mockReturnValue(1300);
    // Reopened within vaul's transition: its reset to the first detent (half) still arrives, and is ignored.
    act(() => {
      result.current.handleSnapChange(mobileDrawerOpenSnapPoint);
    });
    expect(result.current.activeSnapPoint).toBe(1);

    // The guard is one-shot: the person's own move to half, still inside that window, is honoured.
    now.mockReturnValue(1400);
    act(() => {
      result.current.handleSnapChange(mobileDrawerOpenSnapPoint);
    });
    expect(result.current.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);
    now.mockRestore();
  });

  it('spends the close guard on a reset that lands while closed, so a quick reopen honours the person’s move', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    state.activeTab = 'parameters';
    const { result, rerender } = renderHook(() => useChatInterfaceState());

    act(() => {
      result.current.handleDrawerChange(false);
    });
    rerender();
    now.mockReturnValue(1500);
    // Closed: vaul's late reset has nothing to move, and spends the guard.
    act(() => {
      result.current.handleSnapChange(mobileDrawerOpenSnapPoint);
    });
    act(() => {
      result.current.handleTabChange('editor');
    });
    rerender();
    expect(result.current.activeSnapPoint).toBe(1);
    now.mockReturnValue(1600);
    act(() => {
      result.current.handleSnapChange(mobileDrawerOpenSnapPoint);
    });
    expect(result.current.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);
    now.mockRestore();
  });

  it('lets the close guard lapse when vaul sends no reset', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    state.activeTab = 'parameters';
    const { result, rerender } = renderHook(() => useChatInterfaceState());

    act(() => {
      result.current.handleDrawerChange(false);
    });
    rerender();
    act(() => {
      result.current.handleTabChange('editor');
    });
    rerender();
    now.mockReturnValue(5000);
    act(() => {
      result.current.handleSnapChange(mobileDrawerOpenSnapPoint);
    });
    expect(result.current.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);
    now.mockRestore();
  });

  it('arms no guard for an app-driven close, which vaul sends no reset for', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    state.activeTab = 'parameters';
    const { result, rerender } = renderHook(() => useChatInterfaceState());

    // The Model destination closes the sheet through vaul's controlled `open`.
    act(() => {
      result.current.handleTabChange('viewer');
    });
    rerender();
    act(() => {
      result.current.handleTabChange('editor');
    });
    rerender();
    now.mockReturnValue(1200);
    // The person's first move to half right after the reopen is theirs, and is honoured.
    act(() => {
      result.current.handleSnapChange(mobileDrawerOpenSnapPoint);
    });
    expect(result.current.activeSnapPoint).toBe(mobileDrawerOpenSnapPoint);
    now.mockRestore();
  });
});
