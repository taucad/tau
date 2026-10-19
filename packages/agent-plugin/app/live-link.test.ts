import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TauViewerShowResult, TauViewerSyncResult, TauViewerViewState } from '@taucad/mcp/viewer-protocol';
import type { GeometryComponentReference } from '@taucad/types';
import { startLiveLink, viewStateOf, whenDrawn } from '#app/live-link.js';
import type { LiveLink, LiveLinkPage } from '#app/live-link.js';

const shown: TauViewerShowResult = {
  model: {
    id: 'm2',
    title: 'Gear',
    path: '.tau/artifacts/gear.glb',
    sourceFile: 'gear.ts',
    mimeType: 'model/gltf-binary',
    byteLength: 3,
    sha256: 'b'.repeat(64),
  },
};

type Call = Readonly<{ name: string; args: Readonly<Record<string, unknown>> }>;

/**
 * A server that answers each `app_sync` from a script, then holds later ones open until stopped.
 *
 * @param answers - The structured results of the first syncs, in order.
 * @returns The tool call and the calls it received.
 */
const scriptedServer = (answers: TauViewerSyncResult[]) => {
  const calls: Call[] = [];
  const callTool = vi.fn(async (name: string, args: Readonly<Record<string, unknown>>): Promise<unknown> => {
    calls.push({ name, args });
    if (name !== 'app_sync') {
      return { accepted: true };
    }
    const next = answers.shift();
    /* Later syncs stay held, as a server with nothing new holds them. */
    return (
      next ??
      new Promise<never>(() => {
        // Never settles.
      })
    );
  });
  return { calls, callTool };
};

const pageOf = (overrides: Partial<LiveLinkPage>): LiveLinkPage => ({
  view: () => undefined,
  follows: () => true,
  linked: () => false,
  toolCallId: () => undefined,
  show: vi.fn<LiveLinkPage['show']>(),
  capture: async () => ({ error: 'unused' }),
  ...overrides,
});

const links: LiveLink[] = [];
afterEach(() => {
  for (const link of links.splice(0)) {
    link.stop();
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const sunGear: GeometryComponentReference = {
  scheme: 'tau-cad',
  filePath: 'gear.ts',
  componentId: 'component:sun',
  selector: 'node/1',
  label: 'Sun gear',
  kind: 'part',
};

const viewOf = (references: readonly GeometryComponentReference[]): TauViewerViewState =>
  viewStateOf({
    model: shown.model,
    unit: { selectedComponentIds: [], hiddenComponentIds: [], isolatedComponentIds: [] },
    camera: undefined,
    sectionActive: false,
    measurementCount: 0,
    composition: 'tab',
    interactedAt: 0,
    references,
  });

describe('viewStateOf', () => {
  it('should report the parts added to chat as view_state names components', () => {
    const carrier: GeometryComponentReference = {
      ...sunGear,
      componentId: 'component:carrier',
      selector: '',
      label: 'Carrier',
    };

    expect(viewOf([sunGear, carrier]).references).toEqual([
      { componentId: 'component:sun', label: 'Sun gear', kind: 'part', selector: 'node/1' },
      { componentId: 'component:carrier', label: 'Carrier', kind: 'part' },
    ]);
    expect(viewOf([]).references).toEqual([]);
  });
});

describe('startLiveLink', () => {
  it('should send the added parts only once the server lists them under accepts', async () => {
    /* An older server answers without accepts; a newer one lists the field. */
    const { calls, callTool } = scriptedServer([{ version: 1 }, { version: 1, accepts: ['references'] }]);
    const view = viewOf([sunGear]);
    links.push(startLiveLink(callTool, pageOf({ view: () => view })));

    await vi.waitFor(() => {
      expect(calls.filter((call) => call.name === 'app_sync')).toHaveLength(3);
    });
    const views = calls.map((call) => call.args['view'] as TauViewerViewState);
    expect(views[0]).not.toHaveProperty('references');
    expect(views[1]).not.toHaveProperty('references');
    expect(views[2]).toEqual(view);
  });

  it('should keep a card on its model and name the tool call that opened it', async () => {
    const { calls, callTool } = scriptedServer([{ version: 1, show: shown }]);
    const show = vi.fn<LiveLinkPage['show']>();
    links.push(startLiveLink(callTool, pageOf({ follows: () => false, toolCallId: () => 'call-7', show })));

    await vi.waitFor(() => {
      expect(calls.filter((call) => call.name === 'app_sync')).toHaveLength(2);
    });
    expect(calls[0]?.args).toMatchObject({ follow: false, toolCallId: 'call-7', wait: true });
    expect(calls[1]?.args).toMatchObject({ version: 1 });
    expect(show).not.toHaveBeenCalled();
  });

  it('should hand a page the person opened each model shown', async () => {
    const { calls, callTool } = scriptedServer([{ version: 1, show: shown }]);
    const show = vi.fn<LiveLinkPage['show']>();
    links.push(startLiveLink(callTool, pageOf({ show })));

    await vi.waitFor(() => {
      expect(show).toHaveBeenCalledWith(shown);
    });
    expect(calls[0]?.args).not.toHaveProperty('toolCallId');
  });

  it('should keep a linked page on its model through earlier shows and follow the shows after it opened', async () => {
    /* The server had shown two models before the page opened; a third follows. */
    const { calls, callTool } = scriptedServer([{ version: 2 }, { version: 3, show: shown }]);
    const show = vi.fn<LiveLinkPage['show']>();
    links.push(startLiveLink(callTool, pageOf({ linked: () => true, show })));

    await vi.waitFor(() => {
      expect(show).toHaveBeenCalledWith(shown);
    });
    expect(calls[0]?.args).toMatchObject({ version: 0, follow: false, wait: false });
    expect(calls[1]?.args).toMatchObject({ version: 2, follow: true, wait: true });
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('should answer a capture that throws with its error, without backing off the poll', async () => {
    vi.useFakeTimers();
    const { calls, callTool } = scriptedServer([{ version: 0, capture: { requestId: 'capture-1' } }]);
    links.push(
      startLiveLink(
        callTool,
        pageOf({
          capture: async () => {
            throw new Error('WebGL context lost');
          },
        }),
      ),
    );

    /* No timer runs, so a back-off sleep would hold the next sync back. */
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.map((call) => call.name)).toEqual(['app_sync', 'app_capture_reply', 'app_sync']);
    expect(calls[1]?.args).toEqual({
      requestId: 'capture-1',
      pageId: calls[0]?.args['pageId'],
      error: 'The viewer could not capture its view: WebGL context lost',
    });
  });

  it('should capture a frame the browser paints no frames for, polling meanwhile', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const image = { mimeType: 'image/png', data: 'cG5n' } as const;
    const { calls, callTool } = scriptedServer([{ version: 0, capture: { requestId: 'capture-1' } }]);
    links.push(
      startLiveLink(
        callTool,
        pageOf({
          capture: async () => ((await whenDrawn(() => true)) ? image : { error: 'Not drawn.' }),
        }),
      ),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(calls.map((call) => call.name)).toEqual(['app_sync', 'app_sync']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.map((call) => call.name)).toEqual(['app_sync', 'app_sync', 'app_capture_reply']);
    expect(calls[2]?.args).toMatchObject({ requestId: 'capture-1', image });
  });

  it('should stop polling from a card nobody uses, and resume when the person uses it', async () => {
    vi.useFakeTimers();
    /* A server with nothing new holds each sync for 20 s. */
    const calls: Call[] = [];
    const callTool = vi.fn(async (name: string, args: Readonly<Record<string, unknown>>): Promise<unknown> => {
      calls.push({ name, args });
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ version: 0 });
        }, 20_000);
      });
    });
    const held = (): number => calls.filter((call) => call.args['wait'] === true).length;
    const link = startLiveLink(callTool, pageOf({ follows: () => false }), { activeFor: 60_000 });
    links.push(link);

    await vi.advanceTimersByTimeAsync(80_000);
    const whileActive = held();
    expect(whileActive).toBe(3);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(held()).toBe(whileActive);

    link.nudge();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.at(-2)?.args).toMatchObject({ wait: false });
    expect(held()).toBe(whileActive + 1);
  });

  it('should keep polling from a page that follows show_model', async () => {
    vi.useFakeTimers();
    const calls: Call[] = [];
    const callTool = vi.fn(async (name: string, args: Readonly<Record<string, unknown>>): Promise<unknown> => {
      calls.push({ name, args });
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ version: 0 });
        }, 20_000);
      });
    });
    links.push(startLiveLink(callTool, pageOf({ follows: () => true }), { activeFor: 60_000 }));

    await vi.advanceTimersByTimeAsync(200_000);
    expect(calls.length).toBeGreaterThanOrEqual(10);
  });
});
