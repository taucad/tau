// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserBridge, BrowserSnapshot } from '@taucad/types/browser';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { BrowserPane } from '#components/browser/browser-pane.js';

vi.mock('#hooks/use-settings-dialog.js', () => ({ useSettingsDialog: () => ({ open: vi.fn() }) }));
const snapshot: BrowserSnapshot = {
  tabs: [
    {
      id: 'one',
      title: 'Reference',
      url: 'https://example.com/',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      zoom: 1,
    },
  ],
  activeTabId: 'one',
  settings: { searchEngine: 'duckduckgo', rememberHistory: true, defaultZoom: 1 },
  history: [],
  downloads: [],
};
const command = vi.fn<BrowserBridge['command']>();
const unsubscribe = vi.fn();
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
const tick = async (): Promise<void> => {
  await act(async () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) {
      callback(0);
    }
  });
};
beforeEach(() => {
  command.mockReset().mockResolvedValue(snapshot);
  unsubscribe.mockClear();
  frames.clear();
  vi.stubGlobal('tauBrowser', { command, subscribe: () => unsubscribe } satisfies BrowserBridge);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++frameId;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 80, 600, 400));
  // JSDOM does not implement native layout visibility or the Fullscreen API.
  Object.defineProperty(Element.prototype, 'checkVisibility', { configurable: true, value: () => true });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, 'checkVisibility');
  Reflect.deleteProperty(document, 'fullscreenElement');
});

describe('native browser viewport lifetime', () => {
  it('should hide the guest for overlays and fullscreen, resume it, and release only its own lease', async () => {
    const { unmount } = render(
      <KeyboardProvider>
        <TooltipProvider>
          <BrowserPane />
        </TooltipProvider>
      </KeyboardProvider>,
    );
    await screen.findByRole('navigation', { name: 'Browser tabs' });
    await tick();
    expect(command).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'viewport', visible: true }));
    const request = command.mock.calls.at(-1)![0];
    if (request.kind !== 'viewport') {
      throw new Error('Expected a viewport request');
    }
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.append(menu);
    await tick();
    expect(command).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }));
    menu.remove();
    await tick();
    expect(command).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true }));
    const fullscreen = vi.spyOn(document, 'fullscreenElement', 'get').mockReturnValue(document.body);
    await tick();
    expect(command).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }));
    fullscreen.mockRestore();
    await tick();
    expect(command).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true }));
    unmount();
    expect(command).toHaveBeenLastCalledWith({ kind: 'detach', leaseId: request.leaseId });
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });
  it('should explain the desktop requirement when the native bridge is absent', () => {
    vi.stubGlobal('tauBrowser', undefined);
    render(<BrowserPane />);
    expect(screen.getByRole('heading', { name: 'Browse in Tau desktop' })).toBeVisible();
    expect(command).not.toHaveBeenCalled();
  });
});
