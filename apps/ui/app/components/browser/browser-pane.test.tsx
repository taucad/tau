// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
const preview = { tabId: 'one', url: 'https://example.com/', dataUrl: 'data:image/jpeg;base64,dGVzdA==' };
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
  command
    .mockReset()
    .mockImplementation(async (request) => (request.kind === 'capture-preview' ? { ...snapshot, preview } : snapshot));
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
  it('should focus the address field when a selected blank page is opened', async () => {
    command.mockResolvedValue({ ...snapshot, tabs: snapshot.tabs.map((tab) => ({ ...tab, url: '' })) });
    render(
      <KeyboardProvider>
        <TooltipProvider>
          <BrowserPane />
        </TooltipProvider>
      </KeyboardProvider>,
    );
    expect(await screen.findByRole('textbox', { name: 'Search or enter a URL' })).toHaveFocus();
  });

  it('should paint a page preview before lowering an overlapping native guest and restore it on dismissal', async () => {
    const { unmount } = render(
      <KeyboardProvider>
        <TooltipProvider>
          <BrowserPane />
        </TooltipProvider>
      </KeyboardProvider>,
    );
    await screen.findByRole('textbox', { name: 'Search or enter a URL' });
    expect(screen.queryByRole('navigation', { name: 'Browser tabs' })).not.toBeInTheDocument();
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
    expect(command).toHaveBeenLastCalledWith({ kind: 'capture-preview', tabId: 'one' });
    expect(command).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'viewport', visible: false }));
    fireEvent.load(screen.getByRole('presentation', { hidden: true }));
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
  it('should refresh the overlay image when the native page zoom changes', async () => {
    const listeners = new Set<(value: BrowserSnapshot) => void>();
    vi.stubGlobal('tauBrowser', {
      command,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    } satisfies BrowserBridge);
    render(
      <KeyboardProvider>
        <TooltipProvider>
          <BrowserPane />
        </TooltipProvider>
      </KeyboardProvider>,
    );
    await screen.findByRole('textbox', { name: 'Search or enter a URL' });
    await tick();
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.append(menu);
    await tick();
    fireEvent.load(screen.getByRole('presentation', { hidden: true }));
    await tick();
    const zoomedPreview = { ...preview, dataUrl: 'data:image/jpeg;base64,em9vbQ==' };
    const zoomedSnapshot = { ...snapshot, tabs: snapshot.tabs.map((tab) => ({ ...tab, zoom: 1.25 })) };
    command.mockImplementation(async (request) =>
      request.kind === 'capture-preview' ? { ...zoomedSnapshot, preview: zoomedPreview } : zoomedSnapshot,
    );
    await act(async () => {
      for (const listener of listeners) {
        listener(zoomedSnapshot);
      }
    });
    await tick();
    expect(command.mock.calls.filter(([request]) => request.kind === 'capture-preview')).toHaveLength(2);
    expect(screen.getByRole('presentation', { hidden: true })).toHaveAttribute('src', zoomedPreview.dataUrl);
    fireEvent.load(screen.getByRole('presentation', { hidden: true }));
    await tick();
    menu.remove();
    await tick();
    expect(command).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'viewport', visible: true }));
  });
  it('should keep the native page live for unrelated tooltips and discard a late overlapping capture', async () => {
    const pending = Promise.withResolvers<BrowserSnapshot>();
    command.mockImplementation(async (request) => (request.kind === 'capture-preview' ? pending.promise : snapshot));
    render(
      <KeyboardProvider>
        <TooltipProvider>
          <BrowserPane />
        </TooltipProvider>
      </KeyboardProvider>,
    );
    await screen.findByRole('textbox', { name: 'Search or enter a URL' });
    await tick();
    const tooltip = document.createElement('div');
    tooltip.setAttribute('role', 'tooltip');
    document.body.append(tooltip);
    const bounds = vi.fn(() => new DOMRect(700, 0, 80, 30));
    Object.defineProperty(tooltip, 'getBoundingClientRect', { value: bounds });
    await tick();
    expect(command).not.toHaveBeenCalledWith({ kind: 'capture-preview', tabId: 'one' });
    bounds.mockReturnValue(new DOMRect(20, 90, 100, 40));
    await tick();
    expect(command).toHaveBeenLastCalledWith({ kind: 'capture-preview', tabId: 'one' });
    tooltip.remove();
    await tick();
    await act(async () => {
      pending.resolve({ ...snapshot, preview });
    });
    await tick();
    expect(screen.queryByRole('presentation', { hidden: true })).not.toBeInTheDocument();
    expect(command).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'viewport', visible: false }));
  });
  it('should explain the desktop requirement when the native bridge is absent', () => {
    vi.stubGlobal('tauBrowser', undefined);
    render(<BrowserPane />);
    expect(screen.getByRole('heading', { name: 'Browse in Tau desktop' })).toBeVisible();
    expect(command).not.toHaveBeenCalled();
  });
});
