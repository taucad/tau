/** The services host re-checks every forwarded permission frame before the store sees it (D25, A19). */
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PermissionAnswerFrame } from '#shared/permission-channels.js';
import { createPermissionHost } from '#tau/permission-host.js';
import { createPermissionStore } from '#tau/permission-store.js';

let base = '';

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'tau-permission-host-')));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const setup = () => {
  const store = createPermissionStore({ directory: join(base, 'permissions') });
  const answers: PermissionAnswerFrame[] = [];
  const project = join(base, 'home', 'bracket');
  const host = createPermissionHost({
    store,
    isTrustedRoot: (root) => root === project,
    answer: (frame) => answers.push(frame),
    log: vi.fn(),
  });
  return { store, answers, host, project };
};

describe('permission host (W9)', () => {
  it('applies a valid operation and answers with the mode in force', async () => {
    const { store, answers, host, project } = setup();
    await host.handle({
      type: 'permissions-request',
      requestId: 'r1',
      operation: 'set-chat-mode',
      projectRoot: project,
      chatId: 'chat-1',
      mode: 'bypass',
    });
    await host.handle({
      type: 'permissions-request',
      requestId: 'r2',
      operation: 'chat-mode',
      projectRoot: project,
      chatId: 'chat-1',
    });
    expect(answers).toEqual([
      { type: 'permissions-answered', requestId: 'r1', mode: 'bypass' },
      { type: 'permissions-answered', requestId: 'r2', mode: 'bypass' },
    ]);
    expect(await store.modeOf(project, 'chat-1')).toBe('bypass');
  });

  it('refuses a frame that skipped main: an ungranted root, a path as chat id, an unknown mode or operation', async () => {
    const { store, answers, host, project } = setup();
    const frames = [
      { operation: 'set-chat-mode', projectRoot: join(base, 'elsewhere'), chatId: 'chat-1', mode: 'bypass' },
      { operation: 'set-chat-mode', projectRoot: project, chatId: '../chat-1', mode: 'bypass' },
      { operation: 'set-chat-mode', projectRoot: project, chatId: 'chat-1', mode: 'full-access' },
      { operation: 'set-default-mode', mode: 'yolo' },
      { operation: 'grant', projectRoot: project, chatId: 'chat-1' },
    ];
    for (const [index, frame] of frames.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- one frame at a time.
      await host.handle({ type: 'permissions-request', requestId: `r${String(index)}`, ...frame });
    }
    expect(answers.every((answer) => answer.type === 'permissions-failed')).toBe(true);
    expect(answers).toHaveLength(frames.length);
    expect(await store.modeOf(project, 'chat-1')).toBe('ask');
    expect(await store.defaultMode()).toBe('ask');
  });

  it('lets a chat whose folder is no longer granted drop its entry', async () => {
    const { store, answers, host } = setup();
    await store.setChatMode(join(base, 'gone'), 'chat-1', 'bypass');
    await host.handle({
      type: 'permissions-request',
      requestId: 'r1',
      operation: 'remove-chat',
      projectRoot: join(base, 'gone'),
      chatId: 'chat-1',
    });
    expect(answers).toEqual([{ type: 'permissions-answered', requestId: 'r1', mode: 'ask' }]);
    expect(await store.modeOf(join(base, 'gone'), 'chat-1')).toBe('ask');
  });

  it('ignores a frame with no request id, since nobody waits for it', async () => {
    const { answers, host, project } = setup();
    await host.handle({ type: 'permissions-request', operation: 'chat-mode', projectRoot: project, chatId: 'chat-1' });
    expect(answers).toEqual([]);
  });
});
