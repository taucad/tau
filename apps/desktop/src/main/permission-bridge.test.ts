/** Main validates each permission call's sender and project before forwarding it (D25, A19: a forged IPC sets nothing). */
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerPermissionBridge } from '#main/permission-bridge.js';
import { createProjectRootRegistry } from '#main/project-roots.js';
import { permissionChannels } from '#shared/permission-channels.js';
import type { PermissionRequestFrame } from '#shared/permission-channels.js';

let base = '';
let granted = '';

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'tau-permission-bridge-')));
  granted = join(base, 'home');
  await mkdir(join(granted, 'bracket'), { recursive: true });
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

type Listener = (event: { senderFrame: unknown }, payload?: unknown) => Promise<unknown>;

const tauWindow = { url: 'tau://app/' };
const foreignFrame = { url: 'https://example.com/' };

const setup = (answer: (frame: PermissionRequestFrame) => Record<string, unknown> | undefined = () => undefined) => {
  const handlers = new Map<string, Listener>();
  const roots = createProjectRootRegistry();
  roots.admit(granted);
  const sent: PermissionRequestFrame[] = [];
  // oxlint-disable-next-line prefer-const -- assigned once the bridge exists, read by the send seam.
  let accept: (frame: Record<string, unknown>) => boolean = () => false;
  const bridge = registerPermissionBridge({
    handle: (channel, listener) => {
      handlers.set(channel, listener as Listener);
    },
    trusted: (frame) => frame === tauWindow,
    roots,
    send: (frame) => {
      sent.push(frame);
      const reply = answer(frame);
      if (reply !== undefined) {
        queueMicrotask(() => accept({ requestId: frame.requestId, ...reply }));
      }
    },
    boundMilliseconds: 50,
  });
  accept = bridge.accept;
  const invoke = async (channel: string, senderFrame: unknown, payload?: unknown): Promise<unknown> =>
    handlers.get(channel)!({ senderFrame }, payload);
  return { sent, invoke, bridge };
};

const answered = (frame: PermissionRequestFrame) =>
  ({ type: 'permissions-answered', mode: 'mode' in frame ? frame.mode : 'ask' }) as const;

describe('permission bridge (W9)', () => {
  it('registers exactly the six channels', () => {
    const handled: string[] = [];
    registerPermissionBridge({
      handle: (channel) => handled.push(channel),
      trusted: () => true,
      roots: createProjectRootRegistry(),
      send: () => undefined,
    });
    expect(handled.toSorted()).toEqual(Object.values(permissionChannels).toSorted());
  });

  it('forwards a confirmed switch with main’s canonical root and answers the host’s mode', async () => {
    const { sent, invoke } = setup(answered);
    const link = join(base, 'link');
    await symlink(granted, link);
    await expect(
      invoke(permissionChannels.setChatMode, tauWindow, {
        projectRoot: join(link, 'bracket'),
        chatId: 'chat-1',
        mode: 'bypass',
        confirmed: true,
      }),
    ).resolves.toBe('bypass');
    expect(sent).toMatchObject([
      {
        type: 'permissions-request',
        operation: 'set-chat-mode',
        projectRoot: join(granted, 'bracket'),
        chatId: 'chat-1',
        mode: 'bypass',
      },
    ]);
  });

  it('refuses a forged call: a foreign frame, an ungranted root, a bad chat or mode, an unconfirmed Bypass', async () => {
    const { sent, invoke } = setup(answered);
    const project = join(granted, 'bracket');
    const refusals: Array<[string, unknown, unknown]> = [
      [
        permissionChannels.setChatMode,
        foreignFrame,
        { projectRoot: project, chatId: 'chat-1', mode: 'bypass', confirmed: true },
      ],
      [permissionChannels.setDefaultMode, foreignFrame, { mode: 'bypass', confirmed: true }],
      [permissionChannels.defaultMode, foreignFrame, undefined],
      [permissionChannels.chatMode, foreignFrame, { projectRoot: project, chatId: 'chat-1' }],
      [
        permissionChannels.setChatMode,
        tauWindow,
        { projectRoot: join(base, 'hostile'), chatId: 'chat-1', mode: 'bypass', confirmed: true },
      ],
      [
        permissionChannels.setChatMode,
        tauWindow,
        { projectRoot: 'bracket', chatId: 'chat-1', mode: 'bypass', confirmed: true },
      ],
      [
        permissionChannels.setChatMode,
        tauWindow,
        { projectRoot: project, chatId: '../../etc', mode: 'bypass', confirmed: true },
      ],
      [
        permissionChannels.setChatMode,
        tauWindow,
        { projectRoot: project, chatId: 'chat-1', mode: 'danger-full-access', confirmed: true },
      ],
      [permissionChannels.setChatMode, tauWindow, { projectRoot: project, chatId: 'chat-1', mode: 'bypass' }],
      [
        permissionChannels.setChatMode,
        tauWindow,
        { projectRoot: project, chatId: 'chat-1', mode: 'bypass', confirmed: 'yes' },
      ],
      [permissionChannels.setDefaultMode, tauWindow, { mode: 'bypass' }],
      [permissionChannels.seedChat, tauWindow, { projectRoot: join(base, 'hostile'), chatId: 'chat-1' }],
      [permissionChannels.setChatMode, tauWindow, undefined],
    ];
    for (const [channel, frame, payload] of refusals) {
      // oxlint-disable-next-line no-await-in-loop -- one call at a time.
      await expect(invoke(channel, frame, payload)).rejects.toThrow('Desktop shell refused the permission request.');
    }
    expect(sent).toEqual([]);
  });

  it('lowers to Ask without a confirmation, and removes a chat under any absolute root', async () => {
    const { sent, invoke } = setup(answered);
    await expect(
      invoke(permissionChannels.setChatMode, tauWindow, {
        projectRoot: join(granted, 'bracket'),
        chatId: 'chat-1',
        mode: 'ask',
      }),
    ).resolves.toBe('ask');
    await expect(
      invoke(permissionChannels.removeChat, tauWindow, { projectRoot: join(base, 'disconnected'), chatId: 'chat-1' }),
    ).resolves.toBe('ask');
    expect(sent.map((frame) => frame.operation)).toEqual(['set-chat-mode', 'remove-chat']);
  });

  it('rejects with the host’s refusal, or once the bound passes with no answer', async () => {
    const failing = setup(() => ({
      type: 'permissions-failed',
      message: 'Tau could not save the permission setting.',
    }));
    await expect(failing.invoke(permissionChannels.defaultMode, tauWindow)).rejects.toThrow(
      'Tau could not save the permission setting.',
    );
    const silent = setup();
    await expect(silent.invoke(permissionChannels.defaultMode, tauWindow)).rejects.toThrow(
      'The permission store did not answer.',
    );
  });

  it('consumes only its own answer frames', () => {
    const { bridge } = setup();
    expect(bridge.accept({ type: 'machines-streaming-answered', requestId: 'x' })).toBe(false);
    expect(bridge.accept({ type: 'permissions-answered', requestId: 'unknown', mode: 'ask' })).toBe(true);
  });
});
