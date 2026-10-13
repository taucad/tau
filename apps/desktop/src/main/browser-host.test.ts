import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { BrowserWindow, IpcMainInvokeEvent, Session, WebContents, WebContentsView } from 'electron';
import { BrowserWindow as Window, WebContentsView as View, ipcMain, session } from 'electron';
import type { BrowserCommand, BrowserSnapshot } from '@taucad/types/browser';
import { installBrowserHost } from '#main/browser-host.js';

vi.mock('electron', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Electron export name.
  BrowserWindow: { fromWebContents: vi.fn() },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Electron export name.
  WebContentsView: vi.fn(),
  session: { fromPartition: vi.fn() },
  ipcMain: { handle: vi.fn() },
  dialog: { showSaveDialog: vi.fn() },
  shell: { openExternal: vi.fn() },
}));

let directory: string;
const guest = mockDeep<WebContents>();
const view = mock<WebContentsView>({ webContents: guest });
const window = mockDeep<BrowserWindow>();
const browserSession = mockDeep<Session>();
const event = mock<IpcMainInvokeEvent>();
let invoke: (command: BrowserCommand | unknown) => Promise<BrowserSnapshot>;

beforeEach(() => {
  vi.clearAllMocks();
  directory = mkdtempSync(join(tmpdir(), 'tau-browser-test-'));
  const appFrame = mock<Electron.WebFrameMain>({ url: 'app://tau/', parent: null });
  Object.assign(window, { id: 1 });
  Object.assign(window.webContents, { mainFrame: appFrame });
  Object.assign(event, { sender: window.webContents, senderFrame: appFrame });
  window.isDestroyed.mockReturnValue(false);
  window.webContents.isDestroyed.mockReturnValue(false);
  window.getContentSize.mockReturnValue([1000, 800]);
  guest.isDestroyed.mockReturnValue(false);
  window.webContents.getZoomFactor.mockReturnValue(1);
  guest.getZoomFactor.mockReturnValue(1);
  guest.getURL.mockReturnValue('https://example.com/');
  guest.getTitle.mockReturnValue('Example');
  guest.loadURL.mockResolvedValue();
  vi.mocked(Window.fromWebContents).mockReturnValue(window);
  vi.mocked(View).mockImplementation(function () {
    return view;
  });
  vi.mocked(session.fromPartition).mockReturnValue(browserSession);
  installBrowserHost({ origins: ['app://tau'], userDataPath: directory });
  const handler = vi.mocked(ipcMain.handle).mock.calls[0]![1];
  invoke = async (command) => handler(event, command) as Promise<BrowserSnapshot>;
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('browser host authority', () => {
  it('should create an isolated guest with no preload or default app session', async () => {
    const result = await invoke({ kind: 'new-tab', input: 'example.com' });
    expect(session.fromPartition).toHaveBeenCalledWith('persist:tau-browser-v1');
    expect(vi.mocked(View).mock.calls[0]![0]?.webPreferences).toMatchObject({
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      session: browserSession,
    });
    expect(vi.mocked(View).mock.calls[0]![0]?.webPreferences).not.toHaveProperty('preload');
    expect(guest.loadURL).toHaveBeenCalledWith('https://example.com/');
    expect(result.tabs[0]).toMatchObject({ url: 'https://example.com/', isLoading: true });
  });
  it('should refuse guest, foreign-origin and child-frame callers before creating views', async () => {
    Object.assign(event, { sender: guest });
    await expect(invoke({ kind: 'new-tab' })).rejects.toThrow('Browser command refused');
    Object.assign(event, {
      sender: window.webContents,
      senderFrame: mock<Electron.WebFrameMain>({ url: 'app://tau/', parent: window.webContents.mainFrame }),
    });
    await expect(invoke({ kind: 'new-tab' })).rejects.toThrow('Browser command refused');
    Object.assign(window.webContents.mainFrame, { url: 'https://example.com/' });
    Object.assign(event, { senderFrame: window.webContents.mainFrame });
    await expect(invoke({ kind: 'new-tab' })).rejects.toThrow('Browser command refused');
    expect(View).not.toHaveBeenCalled();
  });
  it('should refuse unrecognized commands and references to another tab', async () => {
    await expect(invoke({ kind: 'script', source: 'process' })).rejects.toThrow();
    await expect(invoke({ kind: 'navigate', tabId: 'foreign', input: 'example.com' })).rejects.toThrow(
      'This browser tab is closed',
    );
    expect(View).not.toHaveBeenCalled();
  });
  it('should deny both permission paths and device access', () => {
    const check = browserSession.setPermissionCheckHandler.mock.calls[0]![0]!;
    const request = browserSession.setPermissionRequestHandler.mock.calls[0]![0]!;
    const callback = vi.fn();
    expect(check(guest, 'media', 'https://example.com', { isMainFrame: true })).toBe(false);
    request(guest, 'media', callback, {
      isMainFrame: true,
      requestingUrl: 'https://example.com',
      mediaTypes: ['audio'],
    });
    expect(callback).toHaveBeenCalledWith(false);
    const device = browserSession.setDevicePermissionHandler.mock.calls[0]![0]!;
    expect(device(mock<Electron.DevicePermissionHandlerHandlerDetails>())).toBe(false);
  });
  it('should reject native bounds outside the host and hide detached pages', async () => {
    const result = await invoke({ kind: 'new-tab', input: 'example.com' });
    const tabId = result.activeTabId!;
    await invoke({ kind: 'viewport', leaseId: 'test', tabId, visible: true, x: 0, y: 80, width: 1000, height: 720 });
    expect(view.setVisible).toHaveBeenLastCalledWith(true);
    await invoke({ kind: 'viewport', leaseId: 'test', tabId, visible: true, x: 999, y: 80, width: 1000, height: 720 });
    expect(view.setVisible).toHaveBeenLastCalledWith(false);
    await invoke({ kind: 'detach', leaseId: 'test' });
    expect(view.setVisible).toHaveBeenLastCalledWith(false);
  });
  it('should preserve the active view when a stale pane releases its viewport', async () => {
    const result = await invoke({ kind: 'new-tab', input: 'example.com' });
    const tabId = result.activeTabId!;
    await invoke({ kind: 'viewport', leaseId: 'active', tabId, visible: true, x: 0, y: 80, width: 1000, height: 720 });
    await invoke({ kind: 'detach', leaseId: 'inactive' });
    await invoke({ kind: 'viewport', leaseId: 'inactive', tabId, visible: false, x: 0, y: 0, width: 0, height: 0 });
    await invoke({ kind: 'select-tab', tabId });
    expect(view.setVisible).toHaveBeenLastCalledWith(true);
    await invoke({ kind: 'detach', leaseId: 'active' });
    expect(view.setVisible).toHaveBeenLastCalledWith(false);
  });
  it('should place the native view in device-independent coordinates when Tau is zoomed', async () => {
    const result = await invoke({ kind: 'new-tab', input: 'example.com' });
    window.webContents.getZoomFactor.mockReturnValue(2);
    await invoke({
      kind: 'viewport',
      leaseId: 'test',
      tabId: result.activeTabId!,
      visible: true,
      x: 10,
      y: 40,
      width: 400,
      height: 300,
    });
    expect(view.setBounds).toHaveBeenLastCalledWith({ x: 20, y: 80, width: 800, height: 600 });
  });
  it('should close native contents when a tab closes and reject its later commands', async () => {
    const result = await invoke({ kind: 'new-tab' });
    const tabId = result.activeTabId!;
    const closed = await invoke({ kind: 'close-tab', tabId });
    expect(closed.tabs).toEqual([]);
    expect(window.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(guest.close).toHaveBeenCalledWith({ waitForBeforeUnload: false });
    await expect(invoke({ kind: 'zoom', tabId, factor: 1 })).rejects.toThrow('This browser tab is closed');
  });
  it('should clear only browser storage after closing its pages', async () => {
    await invoke({ kind: 'new-tab', input: 'example.com' });
    const cleared = await invoke({ kind: 'clear-data', scope: 'all' });
    expect(cleared.tabs).toEqual([]);
    expect(cleared.history).toEqual([]);
    expect(browserSession.clearStorageData).toHaveBeenCalledOnce();
    expect(browserSession.clearCache).toHaveBeenCalledOnce();
    expect(browserSession.clearAuthCache).toHaveBeenCalledOnce();
    expect(guest.close.mock.invocationCallOrder[0]).toBeLessThan(
      browserSession.clearStorageData.mock.invocationCallOrder[0]!,
    );
  });
  it('should propagate clear-data failures instead of claiming success', async () => {
    browserSession.clearStorageData.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(invoke({ kind: 'clear-data', scope: 'all' })).rejects.toThrow('storage unavailable');
    const remaining = await invoke({ kind: 'snapshot' });
    expect(remaining.settings.searchEngine).toBe('duckduckgo');
  });
});
