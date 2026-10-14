import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { BrowserWindow, WebContentsView, dialog, ipcMain, session, shell, webContents } from 'electron';
import type { DownloadItem, IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { browserChannels, browserCommandSchema, browserSettingsSchema } from '@taucad/types/browser';
import type { BrowserDownload, BrowserSnapshot, BrowserTab } from '@taucad/types/browser';
import { browserAddress, browserPreferences, isBrowserUrl } from '#main/browser-policy.js';
import { isTrustedSender } from '#main/navigation-policy.js';

const profileSchema = z.object({
  settings: browserSettingsSchema,
  history: z
    .array(
      z.object({
        url: z.string().max(8192).refine(isBrowserUrl),
        title: z.string().max(512),
        visitedAt: z.number(),
      }),
    )
    .max(500),
});
type BrowserRequest = z.output<typeof browserCommandSchema>;
type TabRequest = Extract<BrowserRequest, { tabId: string }>;
type PageAction = Extract<BrowserRequest, { kind: 'action' }>;
type ViewportRequest = Extract<BrowserRequest, { kind: 'viewport' }>;
type Page = { view: WebContentsView; state: BrowserTab; viewportLease?: string; navigationId: number };
type WindowBrowser = { window: BrowserWindow; pages: Map<string, Page>; activeTabId?: string };

/** Main-process authority for guest pages. The session never receives app protocols or auth headers. */
export const installBrowserHost = ({
  origins,
  userDataPath,
}: {
  origins: readonly string[];
  userDataPath: string;
}): void => {
  const browserSession = session.fromPartition('persist:tau-browser-v1');
  const profilePath = join(userDataPath, 'browser-profile.json');
  let profile: z.output<typeof profileSchema> = { settings: browserSettingsSchema.parse({}), history: [] };
  try {
    profile = profileSchema.parse(JSON.parse(readFileSync(profilePath, 'utf8')));
  } catch {
    // A missing or damaged preference file never grants extra capability.
  }
  const windows = new Map<number, WindowBrowser>();
  const downloads = new Map<string, { item: DownloadItem; state: BrowserDownload; ownerId: number }>();
  let isClearing = false;

  const save = (): void => {
    mkdirSync(dirname(profilePath), { recursive: true });
    const temporaryPath = `${profilePath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(profile), { mode: 0o600 });
    renameSync(temporaryPath, profilePath);
  };
  const snapshot = (owner: WindowBrowser): BrowserSnapshot => ({
    tabs: [...owner.pages.values()].map(({ state }) => ({ ...state })),
    ...(owner.activeTabId ? { activeTabId: owner.activeTabId } : {}),
    settings: profile.settings,
    history: profile.history,
    downloads: [...downloads.values()]
      .filter((entry) => entry.ownerId === owner.window.id)
      .map(({ state }) => ({ ...state })),
  });
  const publish = (owner: WindowBrowser): void => {
    if (!owner.window.isDestroyed() && !owner.window.webContents.isDestroyed()) {
      owner.window.webContents.send(browserChannels.state, snapshot(owner));
    }
  };
  const publishAll = (): void => {
    for (const owner of windows.values()) {
      publish(owner);
    }
  };
  const closePage = (owner: WindowBrowser, id: string): void => {
    const page = owner.pages.get(id);
    if (!page) {
      return;
    }
    owner.pages.delete(id);
    if (!owner.window.isDestroyed()) {
      owner.window.contentView.removeChildView(page.view);
    }
    if (!page.view.webContents.isDestroyed()) {
      page.view.webContents.close({ waitForBeforeUnload: false });
    }
    if (owner.activeTabId === id) {
      owner.activeTabId = owner.pages.keys().next().value;
    }
  };
  const disposePages = (owner: WindowBrowser): void => {
    for (const id of owner.pages.keys()) {
      closePage(owner, id);
    }
  };

  // No permission request inherits Tau's microphone, filesystem, clipboard or auth grants.
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  browserSession.setDevicePermissionHandler(() => false);
  browserSession.setDisplayMediaRequestHandler((_request, callback) => {
    callback({});
  });
  // This also guards redirects and child-frame navigation; subresources keep normal web semantics.
  browserSession.webRequest.onBeforeRequest((details, callback) => {
    const isNavigation = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame';
    // The inspector shares this session and loads before devToolsWebContents is assigned.
    // Only Electron-created remote contents may load its internal frontend; guest contents cannot.
    const isInspector =
      details.url.startsWith('devtools://devtools/') &&
      details.webContentsId !== undefined &&
      webContents.fromId(details.webContentsId)?.getType() === 'remote';
    callback({
      cancel:
        isClearing || (isNavigation && details.url !== 'about:blank' && !isBrowserUrl(details.url) && !isInspector),
    });
  });

  const navigate = async (owner: WindowBrowser, page: Page, url: string): Promise<void> => {
    if (!isBrowserUrl(url)) {
      throw new Error('Only http and https web addresses are supported.');
    }
    const navigationId = ++page.navigationId;
    page.state.error = undefined;
    page.state.url = url;
    page.state.isLoading = true;
    publish(owner);
    try {
      await page.view.webContents.loadURL(url);
    } catch (error) {
      if (
        page.navigationId !== navigationId ||
        !owner.pages.has(page.state.id) ||
        page.view.webContents.isDestroyed()
      ) {
        return;
      }
      // Cancellation from a newer navigation is not a page failure.
      if (error instanceof Error && error.message.includes('ERR_ABORTED')) {
        return;
      }
      page.state.isLoading = false;
      page.state.error = 'This page could not be loaded. Check the address and your connection, then reload.';
      page.view.setVisible(false);
      publish(owner);
    }
  };
  const newPage = (owner: WindowBrowser, url?: string): Page => {
    if (owner.pages.size >= 20) {
      throw new Error('Close a browser tab before opening another.');
    }
    const view = new WebContentsView({ webPreferences: { ...browserPreferences, session: browserSession } });
    const state: BrowserTab = {
      id: randomUUID(),
      title: 'New tab',
      url: '',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      zoom: profile.settings.defaultZoom,
    };
    const page = { view, state, navigationId: 0 };
    view.setVisible(false);
    owner.window.contentView.addChildView(view);
    owner.pages.set(state.id, page);
    owner.activeTabId = state.id;
    const contents = view.webContents;
    contents.setZoomFactor(state.zoom);
    const update = (): void => {
      if (contents.isDestroyed() || !owner.pages.has(state.id)) {
        return;
      }
      const url = contents.getURL();
      if (isBrowserUrl(url)) {
        state.url = url;
      }
      state.canGoBack = contents.navigationHistory.canGoBack();
      state.canGoForward = contents.navigationHistory.canGoForward();
      state.isLoading = contents.isLoading();
      state.zoom = contents.getZoomFactor();
      publish(owner);
    };
    contents.on('focus', () => {
      if (owner.activeTabId !== state.id) {
        owner.activeTabId = state.id;
        publish(owner);
      }
    });
    contents.on('did-start-loading', update);
    contents.on('did-stop-loading', update);
    contents.on('did-navigate-in-page', update);
    contents.on('page-title-updated', (_event, title) => {
      state.title = title.slice(0, 512) || 'Untitled';
      update();
    });
    contents.on('did-navigate', (_event, url) => {
      state.error = undefined;
      state.matches = undefined;
      update();
      if (profile.settings.rememberHistory && isBrowserUrl(url) && !isClearing) {
        profile.history = [
          { url, title: contents.getTitle().slice(0, 512) || url, visitedAt: Date.now() },
          ...profile.history.filter((entry) => entry.url !== url),
        ].slice(0, 500);
        try {
          save();
        } catch {
          state.error = 'Browsing history could not be saved.';
        }
        publishAll();
      }
    });
    contents.on('did-fail-load', (...[_event, code, _description, _url, isMainFrame]) => {
      if (!isMainFrame || code === -3) {
        return;
      }
      state.error =
        code <= -200 && code >= -299
          ? 'The connection is not trusted. Check the website certificate or use another address.'
          : 'This page could not be loaded. Check the address and your connection, then reload.';
      state.isLoading = false;
      view.setVisible(false);
      publish(owner);
    });
    contents.on('render-process-gone', () => {
      state.error = 'This page stopped responding. Reload to continue.';
      state.isLoading = false;
      view.setVisible(false);
      publish(owner);
    });
    contents.on('found-in-page', (_event, result) => {
      state.matches = { active: result.activeMatchOrdinal, total: result.matches };
      publish(owner);
    });
    contents.on('will-navigate', (event, url) => {
      if (!isBrowserUrl(url)) {
        event.preventDefault();
      }
    });
    contents.on('will-redirect', (event, url) => {
      if (!isBrowserUrl(url)) {
        event.preventDefault();
      }
    });
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url, disposition }) => {
      if (isBrowserUrl(url) && ['foreground-tab', 'background-tab'].includes(disposition) && owner.pages.size < 20) {
        newPage(owner, url);
        publish(owner);
      }
      return { action: 'deny' };
    });
    // Native page focus still provides familiar shortcuts without a guest preload.
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !(input.control || input.meta)) {
        return;
      }
      if (input.key.toLowerCase() === 't' && owner.pages.size < 20) {
        event.preventDefault();
        newPage(owner);
        publish(owner);
        owner.window.webContents.focus();
        owner.window.webContents.send('tau:browser:shortcut', 'l');
      }
      if (input.key.toLowerCase() === 'w') {
        event.preventDefault();
        closePage(owner, state.id);
        publish(owner);
      }
      if (input.key.toLowerCase() === 'r') {
        event.preventDefault();
        contents.reload();
      }
      if (input.key.toLowerCase() === 'l' || input.key.toLowerCase() === 'f') {
        event.preventDefault();
        owner.window.webContents.focus();
        owner.window.webContents.send('tau:browser:shortcut', input.key.toLowerCase());
      }
    });
    if (url) {
      void navigate(owner, page, url);
    }
    return page;
  };

  browserSession.on('will-download', (event, item, contents) => {
    const owner = [...windows.values()].find((candidate) =>
      [...candidate.pages.values()].some((page) => page.view.webContents === contents),
    );
    if (downloads.size >= 100) {
      for (const [id, download] of downloads) {
        if (download.state.state !== 'progressing') {
          downloads.delete(id);
        }
      }
    }
    if (!owner || isClearing || downloads.size >= 100) {
      event.preventDefault();
      return;
    }
    const id = randomUUID();
    // Let Chromium show its save dialog. Never construct a path from a remote filename.
    item.setSaveDialogOptions({
      title: 'Save browser download',
      defaultPath: basename(item.getFilename()),
      properties: ['showOverwriteConfirmation'],
    });
    const state: BrowserDownload = {
      id,
      name: item.getFilename().slice(0, 512),
      received: 0,
      total: item.getTotalBytes(),
      state: 'progressing',
    };
    downloads.set(id, { item, state, ownerId: owner.window.id });
    item.on('updated', (_event, downloadState) => {
      state.received = item.getReceivedBytes();
      state.total = item.getTotalBytes();
      state.state = downloadState;
      publish(owner);
    });
    item.once('done', (_event, downloadState) => {
      state.state = downloadState;
      state.received = item.getReceivedBytes();
      publish(owner);
    });
    publish(owner);
  });

  const ownerFor = (event: IpcMainInvokeEvent): WindowBrowser => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (
      !window ||
      window.webContents !== event.sender ||
      event.senderFrame !== event.sender.mainFrame ||
      !isTrustedSender(event.senderFrame, origins)
    ) {
      throw new Error('Browser command refused.');
    }
    let owner = windows.get(window.id);
    if (!owner) {
      owner = { window, pages: new Map() };
      windows.set(window.id, owner);
      const current = owner;
      window.once('closed', () => {
        disposePages(current);
        for (const [id, download] of downloads) {
          if (download.ownerId === window.id) {
            if (download.state.state === 'progressing') {
              download.item.cancel();
            }
            downloads.delete(id);
          }
        }
        windows.delete(window.id);
      });
      window.webContents.on('did-start-navigation', (...[_event, _url, isInPlace, isMainFrame]) => {
        if (isMainFrame && !isInPlace) {
          disposePages(current);
        }
      });
      window.webContents.on('render-process-gone', () => {
        disposePages(current);
      });
    }
    return owner;
  };

  const clearData = async (scope: 'history' | 'all'): Promise<void> => {
    isClearing = true;
    try {
      if (scope === 'all') {
        for (const current of windows.values()) {
          disposePages(current);
        }
        for (const download of downloads.values()) {
          if (download.state.state === 'progressing') {
            download.item.cancel();
          }
        }
        downloads.clear();
        await browserSession.clearStorageData();
        await browserSession.clearCache();
        await browserSession.clearAuthCache();
        await browserSession.closeAllConnections();
      }
      profile.history = [];
      save();
    } finally {
      isClearing = false;
      publishAll();
    }
  };
  const applyViewport = (owner: WindowBrowser, page: Page, command: ViewportRequest): void => {
    if (!command.visible && page.viewportLease !== command.leaseId) {
      return;
    }
    const [width = 0, height = 0] = owner.window.getContentSize();
    const hostZoom = owner.window.webContents.getZoomFactor();
    const x = Math.round(command.x * hostZoom);
    const y = Math.round(command.y * hostZoom);
    const pageWidth = Math.floor(command.width * hostZoom);
    const pageHeight = Math.floor(command.height * hostZoom);
    const visible =
      command.visible &&
      !page.state.error &&
      page.state.url !== '' &&
      command.width > 0 &&
      command.height > 0 &&
      x + pageWidth <= width + 1 &&
      y + pageHeight <= height + 1;
    if (visible) {
      page.viewportLease = command.leaseId;
      page.view.setBounds({ x, y, width: pageWidth, height: pageHeight });
    }
    page.view.setVisible(visible);
  };
  const runPageAction = async (owner: WindowBrowser, page: Page, command: PageAction): Promise<void> => {
    const contents = page.view.webContents;
    switch (command.action) {
      case 'back': {
        if (contents.navigationHistory.canGoBack()) {
          contents.navigationHistory.goBack();
        }
        break;
      }
      case 'forward': {
        if (contents.navigationHistory.canGoForward()) {
          contents.navigationHistory.goForward();
        }
        break;
      }
      case 'reload': {
        page.state.error = undefined;
        contents.reload();
        break;
      }
      case 'stop': {
        // Electron can reject a stopped loadURL with ERR_FAILED without a did-fail-load event.
        // Invalidate that request before stopping so its rejection cannot become a page error.
        page.navigationId += 1;
        page.state.isLoading = false;
        contents.stop();
        break;
      }
      case 'external': {
        if (isBrowserUrl(page.state.url)) {
          await shell.openExternal(page.state.url);
        }
        break;
      }
      case 'devtools': {
        contents.openDevTools({ mode: 'detach' });
        break;
      }
      case 'print': {
        await new Promise<void>((resolve, reject) => {
          contents.print({ silent: false }, (success, reason) => {
            if (success || reason === 'cancelled') {
              resolve();
            } else {
              reject(new Error('Printing could not be completed.'));
            }
          });
        });
        break;
      }
      case 'screenshot': {
        const capture = await contents.capturePage();
        const result = await dialog.showSaveDialog(owner.window, {
          title: 'Save page screenshot',
          defaultPath: 'page.png',
          filters: [{ name: 'PNG image', extensions: ['png'] }],
        });
        if (!result.canceled && result.filePath) {
          writeFileSync(result.filePath, capture.toPNG());
        }
        break;
      }
    }
  };

  const runTabCommand = async (owner: WindowBrowser, command: TabRequest): Promise<BrowserSnapshot> => {
    const page = owner.pages.get(command.tabId);
    if (!page) {
      throw new Error('This browser tab is closed.');
    }
    const contents = page.view.webContents;
    switch (command.kind) {
      case 'capture-preview': {
        const { navigationId } = page;
        const url = contents.getURL();
        const capture = await contents.capturePage();
        if (
          isClearing ||
          owner.pages.get(command.tabId) !== page ||
          contents.isDestroyed() ||
          page.navigationId !== navigationId ||
          contents.getURL() !== url ||
          capture.isEmpty()
        ) {
          return snapshot(owner);
        }
        const { width, height } = capture.getSize();
        const scale = Math.min(1, 1600 / Math.max(width, height));
        const bounded = capture.resize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
        });
        return {
          ...snapshot(owner),
          preview: {
            tabId: command.tabId,
            url,
            dataUrl: `data:image/jpeg;base64,${bounded.toJPEG(85).toString('base64')}`,
          },
        };
      }
      case 'select-tab': {
        if (owner.activeTabId === command.tabId) {
          break;
        }
        owner.activeTabId = command.tabId;
        break;
      }
      case 'close-tab': {
        closePage(owner, command.tabId);
        break;
      }
      case 'navigate': {
        void navigate(owner, page, browserAddress(command.input, profile.settings.searchEngine));
        break;
      }
      case 'zoom': {
        contents.setZoomFactor(command.factor);
        for (const current of windows.values()) {
          for (const entry of current.pages.values()) {
            entry.state.zoom = entry.view.webContents.getZoomFactor();
          }
        }
        publishAll();
        break;
      }
      case 'find': {
        if (command.text) {
          contents.findInPage(command.text, { forward: command.forward, findNext: command.next });
        } else {
          contents.stopFindInPage('clearSelection');
          page.state.matches = undefined;
        }
        break;
      }
      case 'viewport': {
        applyViewport(owner, page, command);
        // Bounds updates do not generate renderer state updates.
        return snapshot(owner);
      }
      case 'action': {
        await runPageAction(owner, page, command);
        break;
      }
    }

    publish(owner);
    return snapshot(owner);
  };

  ipcMain.handle(browserChannels.command, async (event, input: unknown): Promise<BrowserSnapshot> => {
    const owner = ownerFor(event);
    const command = browserCommandSchema.parse(input);
    if (isClearing) {
      throw new Error('Browsing data is being cleared. Try again shortly.');
    }
    if (command.kind === 'snapshot') {
      return snapshot(owner);
    }
    switch (command.kind) {
      case 'new-tab': {
        newPage(owner, command.input ? browserAddress(command.input, profile.settings.searchEngine) : undefined);
        break;
      }
      case 'detach': {
        for (const page of owner.pages.values()) {
          if (page.viewportLease === command.leaseId) {
            page.view.setVisible(false);
            page.viewportLease = undefined;
          }
        }
        break;
      }
      case 'settings': {
        profile.settings = command.settings;
        save();
        publishAll();
        break;
      }
      case 'cancel-download': {
        const download = downloads.get(command.downloadId);
        if (download?.ownerId === owner.window.id && download.state.state === 'progressing') {
          download.item.cancel();
        }
        break;
      }
      case 'clear-data': {
        await clearData(command.scope);
        break;
      }
      default: {
        return runTabCommand(owner, command);
      }
    }
    publish(owner);
    return snapshot(owner);
  });
};
