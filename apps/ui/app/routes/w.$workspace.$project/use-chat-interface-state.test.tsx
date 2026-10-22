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

  it('reopens the drawer at its first snap point after the Model tab collapses it', () => {
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
    expect(result.current.activeSnapPoint).toBe(result.current.snapPoints[0]);
  });

  it('reopens the drawer at its first snap point after an external action returns to the Viewer', () => {
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
    expect(result.current.activeSnapPoint).toBe(result.current.snapPoints[0]);
  });

  it('reopens the drawer at its first snap point after it is dismissed', () => {
    state.activeTab = 'parameters';
    const { result, rerender } = renderHook(() => useChatInterfaceState());

    act(() => {
      result.current.handleSnapChange(result.current.snapPoints.at(-1)!);
    });
    act(() => {
      result.current.handleDrawerChange(false);
    });
    rerender();

    expect(result.current.activeSnapPoint).toBe(result.current.snapPoints[0]);
  });

  it('retains drawer snap-point and editor readiness state', () => {
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
});
