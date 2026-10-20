import { describe, expect, it } from 'vitest';

import { tauViewerAcceptedViewFields as accepts } from '@taucad/mcp/viewer-protocol';
import type { TauViewerShowResult, TauViewerViewState } from '@taucad/mcp/viewer-protocol';

import { createMcpViewerSessions } from '#mcp-viewer-sessions.js';

const shown = (id: string): TauViewerShowResult => ({
  model: {
    id,
    title: id,
    path: `.tau/artifacts/${id}.glb`,
    sourceFile: `${id}.ts`,
    mimeType: 'model/gltf-binary',
    byteLength: 3,
    sha256: id.padEnd(64, '0'),
  },
});

const viewOf = (id: string, interactedAt: number, composition: 'inline' | 'tab' = 'tab'): TauViewerViewState => ({
  model: { id, title: id, path: `.tau/artifacts/${id}.glb`, sourceFile: `${id}.ts` },
  selected: [],
  hidden: [],
  isolated: [],
  sectionActive: false,
  measurementCount: 0,
  composition,
  interactedAt,
});

describe('createMcpViewerSessions', () => {
  it('should hand a following page each shown model, waking its held sync', async () => {
    const sessions = createMcpViewerSessions({ hold: 5000 });
    const held = sessions.sync({ pageId: 'tab-page-1', version: 0, follow: true, wait: true });
    sessions.shown(shown('bracket'));
    await expect(held).resolves.toEqual({ accepts, version: 1, show: shown('bracket') });
    await expect(sessions.sync({ pageId: 'tab-page-1', version: 1, follow: true, wait: false })).resolves.toEqual({
      accepts,
      version: 1,
    });
    sessions.close();
  });

  it('should leave a card on the model it was made for', async () => {
    const sessions = createMcpViewerSessions({ hold: 20 });
    sessions.shown(shown('bracket'));
    await expect(sessions.sync({ pageId: 'card-page-1', version: 0, follow: false, wait: true })).resolves.toEqual({
      accepts,
      version: 1,
    });
    sessions.close();
  });

  it('should hand each conversation only its own shows and read only its own pages', async () => {
    const sessions = createMcpViewerSessions({ hold: 5000 });
    await sessions.sync(
      { pageId: 'tab-page-a', version: 0, follow: true, wait: false, view: viewOf('a', 90) },
      { scope: 'thread-a' },
    );
    await sessions.sync(
      { pageId: 'tab-page-b', version: 0, follow: true, wait: false, view: viewOf('b', 10) },
      { scope: 'thread-b' },
    );
    const heldA = sessions.sync({ pageId: 'tab-page-a', version: 0, follow: true, wait: true }, { scope: 'thread-a' });
    const heldB = sessions.sync({ pageId: 'tab-page-b', version: 0, follow: true, wait: true }, { scope: 'thread-b' });
    const heldLoopback = sessions.sync({ pageId: 'loopback-page', version: 0, follow: true, wait: true });

    sessions.shown(shown('bracket'), 'thread-a');
    await expect(heldA).resolves.toEqual({ accepts, version: 1, show: shown('bracket') });
    await expect(heldLoopback).resolves.toEqual({ accepts, version: 1, show: shown('bracket') });
    sessions.shown(shown('gear'), 'thread-b');
    await expect(heldB).resolves.toEqual({ accepts, version: 2, show: shown('gear') });
    await expect(
      sessions.sync({ pageId: 'tab-page-a', version: 1, follow: true, wait: false }, { scope: 'thread-a' }),
    ).resolves.toEqual({ accepts, version: 2 });

    /* Page A was used last, but conversation B reads its own page; a conversation with none open reads nothing. */
    await expect(sessions.viewState({}, { scope: 'thread-b' })).resolves.toEqual({ view: viewOf('b', 10) });
    await expect(sessions.viewState({}, { scope: 'thread-c' })).resolves.toMatchObject({ errorCode: 'NO_VIEWER' });
    await expect(sessions.viewState({})).resolves.toEqual({ view: viewOf('a', 90) });
    sessions.close();
  });

  it('should report the page the person used last, and say so when none is open', async () => {
    let clock = 1000;
    const sessions = createMcpViewerSessions({ live: 100, now: () => clock });
    await expect(sessions.viewState({})).resolves.toMatchObject({ errorCode: 'NO_VIEWER' });
    await sessions.sync({
      pageId: 'card-page-1',
      version: 0,
      follow: false,
      wait: false,
      view: viewOf('a', 50, 'inline'),
    });
    await sessions.sync({ pageId: 'tab-page-1', version: 0, follow: true, wait: false, view: viewOf('b', 90) });
    await expect(sessions.viewState({})).resolves.toEqual({ view: viewOf('b', 90) });
    clock += 101;
    await expect(sessions.viewState({})).resolves.toMatchObject({ errorCode: 'NO_VIEWER' });
    sessions.close();
  });

  it('should ask that page for a capture through its sync and return the image it sends', async () => {
    const sessions = createMcpViewerSessions({ hold: 5000 });
    await sessions.sync({ pageId: 'tab-page-1', version: 0, follow: true, wait: false, view: viewOf('b', 1) });
    const held = sessions.sync({ pageId: 'tab-page-1', version: 0, follow: true, wait: true });
    const state = sessions.viewState({ capture: true });
    const { capture } = await held;
    expect(capture?.requestId).toEqual(expect.any(String));
    const requestId = capture?.requestId ?? '';
    expect(sessions.captureReply({ requestId, pageId: 'card-page-9' })).toEqual({ accepted: false });
    expect(
      sessions.captureReply({ requestId, pageId: 'tab-page-1', image: { mimeType: 'image/png', data: 'cG5n' } }),
    ).toEqual({ accepted: true });
    await expect(state).resolves.toEqual({ view: viewOf('b', 1), image: { mimeType: 'image/png', data: 'cG5n' } });
    expect(sessions.captureReply({ requestId, pageId: 'tab-page-1' })).toEqual({ accepted: false });
    sessions.close();
  });

  it('should hold the next sync while the page works on a capture it was handed', async () => {
    const sessions = createMcpViewerSessions({ hold: 5000 });
    await sessions.sync({ pageId: 'tab-page-1', version: 0, follow: true, wait: false, view: viewOf('b', 1) });
    const state = sessions.viewState({ capture: true });
    const { capture } = await sessions.sync({ pageId: 'tab-page-1', version: 0, follow: true, wait: true });
    const requestId = capture?.requestId ?? '';
    /* The page polls again while it captures: the poll waits, and still names the capture in case a reply was lost. */
    let settled = false;
    const next = (async () => {
      const result = await sessions.sync({ pageId: 'tab-page-1', version: 0, follow: true, wait: true });
      settled = true;
      return result;
    })();
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(settled).toBe(false);
    sessions.captureReply({ requestId, pageId: 'tab-page-1', error: 'The canvas could not be read.' });
    await expect(state).resolves.toEqual({ view: viewOf('b', 1), captureError: 'The canvas could not be read.' });
    await expect(sessions.sync({ pageId: 'tab-page-1', version: 0, follow: true, wait: false })).resolves.toEqual({
      accepts,
      version: 0,
    });
    await expect(next).resolves.toEqual({ accepts, version: 0 });
    sessions.close();
  });

  it('should give up on a capture the page never answers', async () => {
    const sessions = createMcpViewerSessions({ captureTimeout: 10 });
    await sessions.sync({ pageId: 'tab-page-1', version: 0, follow: true, wait: false, view: viewOf('b', 1) });
    const state = await sessions.viewState({ capture: true });
    expect(state).toMatchObject({ view: viewOf('b', 1) });
    expect('captureError' in state ? state.captureError : undefined).toContain('did not answer');
    sessions.close();
  });

  it('should answer a held sync when the page polls again or the call is cancelled', async () => {
    const sessions = createMcpViewerSessions({ hold: 5000 });
    const first = sessions.sync({ pageId: 'tab-page-1', version: 0, follow: true, wait: true });
    await sessions.sync({ pageId: 'tab-page-1', version: 0, follow: true, wait: false });
    await expect(first).resolves.toEqual({ accepts, version: 0 });
    const controller = new AbortController();
    const second = sessions.sync(
      { pageId: 'tab-page-1', version: 0, follow: true, wait: true },
      {
        signal: controller.signal,
      },
    );
    controller.abort();
    await expect(second).resolves.toEqual({ accepts, version: 0 });
    sessions.close();
  });
});
