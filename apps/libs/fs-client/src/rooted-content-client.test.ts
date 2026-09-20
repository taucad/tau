import { describe, expect, it, vi } from 'vitest';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { createRootedContentClient } from '#rooted-content-client.js';
import type { RootedConnection, RootedFiles } from '#rooted-content-client.js';

const encoder = new TextEncoder();

/** One recording connection per root, so a row can assert both the root and the namespace. */
const recordingOpener = (): {
  readonly open: (root: string, consumer: string) => Promise<RootedConnection>;
  readonly opened: Map<string, RootedFiles>;
  readonly disposed: string[];
  readonly opens: string[];
  /** One entry per open, `<consumer> <root>` — the key the owner is supposed to hold. */
  readonly openKeys: string[];
} => {
  const opened = new Map<string, RootedFiles>();
  const disposed: string[] = [];
  const opens: string[] = [];
  const openKeys: string[] = [];
  return {
    opened,
    disposed,
    opens,
    openKeys,
    open: async (root, consumer) => {
      opens.push(root);
      openKeys.push(`${consumer} ${root}`);
      const files = {
        readFile: vi.fn().mockResolvedValue(encoder.encode('bytes')),
        writeFile: vi.fn().mockResolvedValue(undefined),
        writeFileChecked: vi.fn().mockResolvedValue({ outcome: 'written' }),
        writeFiles: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockResolvedValue([]),
        stat: vi.fn().mockResolvedValue({ type: 'file', size: 5, mtimeMs: 1 }),
        exists: vi.fn().mockResolvedValue(true),
        unlink: vi.fn().mockResolvedValue(undefined),
        rmdir: vi.fn().mockResolvedValue(undefined),
        move: vi.fn().mockResolvedValue({ type: 'file', size: 5, mtimeMs: 1 }),
      } as unknown as RootedFiles;
      opened.set(root, files);
      return {
        files,
        dispose: () => {
          disposed.push(root);
        },
      };
    },
  };
};

/** The recording double for one root, typed so a row can read its calls. */
const callsOn = (files: RootedFiles | undefined, member: keyof RootedFiles): unknown[][] => {
  const mocked = files?.[member] as unknown as ReturnType<typeof vi.fn> | undefined;
  return mocked?.mock.calls ?? [];
};

describe('rooted content client', () => {
  it('should ask Home for a path the product grammar does not claim', async () => {
    const opener = recordingOpener();
    const client = createRootedContentClient({ open: opener.open }).files('working-copy');

    await client.readFile('/.tau/composers/new-project.json');

    expect(opener.opens).toEqual(['/']);
    expect(callsOn(opener.opened.get('/'), 'readFile')).toEqual([['.tau/composers/new-project.json']]);
  });

  it("should ask a project's own root for a path inside it", async () => {
    const opener = recordingOpener();
    const client = createRootedContentClient({ open: opener.open }).files('working-copy');

    await client.writeFile('/projects/proj_a/.tau/chats/c1/attachments/x.png', encoder.encode('png'));

    expect(opener.opens).toEqual(['/projects/proj_a']);
    expect(callsOn(opener.opened.get('/projects/proj_a'), 'writeFile')[0]?.[0]).toBe('.tau/chats/c1/attachments/x.png');
  });

  it('should ask a preview instance for its own files', async () => {
    const opener = recordingOpener();
    const client = createRootedContentClient({ open: opener.open }).files('working-copy');

    await client.writeFiles({ '/previews/inst_1/src/main.ts': { content: encoder.encode('export {};') } });

    expect(opener.opens).toEqual(['/previews/inst_1']);
    expect(Object.keys(callsOn(opener.opened.get('/previews/inst_1'), 'writeFiles')[0]?.[0] ?? {})).toEqual([
      'src/main.ts',
    ]);
  });

  it('should answer the root itself as the empty path', async () => {
    const opener = recordingOpener();
    const client = createRootedContentClient({ open: opener.open }).files('working-copy');

    await client.readdir('/projects/proj_a');

    expect(callsOn(opener.opened.get('/projects/proj_a'), 'readdir')).toEqual([['']]);
  });

  it('should open one connection per root and reuse it', async () => {
    const opener = recordingOpener();
    const client = createRootedContentClient({ open: opener.open }).files('working-copy');

    await Promise.all([
      client.exists('/projects/proj_a/tau.json'),
      client.exists('/projects/proj_a/.tau/library.json'),
      client.exists('/.tau/composers/new-project.json'),
    ]);

    expect(opener.opens).toEqual(['/projects/proj_a', '/']);
  });

  it('should refuse an operation that spans two roots', async () => {
    const opener = recordingOpener();
    const client = createRootedContentClient({ open: opener.open }).files('working-copy');

    await expect(client.move('/projects/proj_a/tau.json', '/projects/proj_b/tau.json')).rejects.toThrow(
      /serves one root/u,
    );
    expect(opener.opens).toEqual([]);
  });

  it('should release every connection it opened', async () => {
    const opener = recordingOpener();
    const owner = createRootedContentClient({ open: opener.open });
    const client = owner.files('working-copy');

    await client.stat('/projects/proj_a/tau.json');
    await client.stat('/.tau/composers/new-project.json');
    owner.dispose();

    expect(opener.disposed.sort()).toEqual(['/', '/projects/proj_a']);
  });

  /**
   * The consumer is half the capability, so it is half the key (W6, CI2).
   *
   * Keyed by root alone, whichever consumer opened first would answer for both —
   * handing an `'agent'` caller the unmasked working copy a trusted store had
   * already opened, or refusing a trusted store the records it owns.
   */
  it('should keep one root’s consumers on their own connections', async () => {
    const opener = recordingOpener();
    const owner = createRootedContentClient({ open: opener.open });

    await owner.files('working-copy').stat('/projects/proj_a/tau.json');
    await owner.files('agent').stat('/projects/proj_a/tau.json');
    await owner.files('working-copy').stat('/projects/proj_a/src/main.ts');

    expect(opener.openKeys).toEqual(['working-copy /projects/proj_a', 'agent /projects/proj_a']);
  });

  it('should answer one consumer with the same client every time', () => {
    const opener = recordingOpener();
    const owner = createRootedContentClient({ open: opener.open });

    expect(owner.files('working-copy')).toBe(owner.files('working-copy'));
    expect(owner.files('working-copy')).not.toBe(owner.files('agent'));
  });

  it('should release every consumer’s connections together', async () => {
    const opener = recordingOpener();
    const owner = createRootedContentClient({ open: opener.open });

    await owner.files('working-copy').stat('/projects/proj_a/tau.json');
    await owner.files('user').stat('/projects/proj_a/tau.json');
    owner.dispose();

    expect(opener.disposed).toEqual(['/projects/proj_a', '/projects/proj_a']);
  });

  /*
   * The context wires `dispose` to an effect cleanup and the client entry
   * renders in `StrictMode`, whose dev double-mount replays that cleanup against
   * the same memo value — so a release that latched forever poisoned every
   * trusted store for the session (gate G-D, H2).
   */
  it('should stay usable after a release', async () => {
    const opener = recordingOpener();
    const owner = createRootedContentClient({ open: opener.open });
    const client = owner.files('working-copy');

    await client.stat('/projects/proj_a/tau.json');
    owner.dispose();
    await client.stat('/projects/proj_a/tau.json');

    expect(opener.opens).toEqual(['/projects/proj_a', '/projects/proj_a']);
    /* The reopened connection is live: only the released one was closed. */
    expect(opener.disposed).toEqual(['/projects/proj_a']);
    expect(callsOn(opener.opened.get('/projects/proj_a'), 'stat')).toEqual([['tau.json']]);
  });

  it('should close a connection that finishes opening after a release', async () => {
    const opener = recordingOpener();
    let admit = (): void => undefined;
    const admitted = new Promise<void>((resolve) => {
      admit = resolve;
    });
    const owner = createRootedContentClient({
      open: async (root, consumer) => {
        await admitted;
        return opener.open(root, consumer);
      },
    });
    const client = owner.files('working-copy');

    const pending = client.stat('/projects/proj_a/tau.json');
    owner.dispose();
    admit();
    await pending;

    expect(opener.disposed).toEqual(['/projects/proj_a']);
  });

  it('should reopen a root whose first connection failed', async () => {
    const opens: string[] = [];
    const client = createRootedContentClient({
      open: async (root, consumer: 'working-copy') => {
        opens.push(root);
        if (opens.length === 1) {
          throw new Error('worker gone');
        }
        return (await recordingOpener().open(root, consumer)) satisfies RootedConnection;
      },
    }).files('working-copy');

    await expect(client.exists('/projects/proj_a/tau.json')).rejects.toThrow('worker gone');
    await expect(client.exists('/projects/proj_a/tau.json')).resolves.toBe(true);
    expect(opens).toEqual(['/projects/proj_a', '/projects/proj_a']);
  });
});

/**
 * The bypass this client replaces, over the real composition.
 *
 * Home's own `.tau/**` is the reserved layout's default — `class: 'records'`,
 * `agentAccess: 'hidden'` (path registry P13) — so *every* composed view
 * refuses `/.tau/composers/**` before provider I/O, a `user` one included. The
 * composer record family is therefore reachable only through the working copy,
 * which is what a `'working-copy'` rooted connection hands back.
 */
describe('a Home composer record', () => {
  const recordPath = '/.tau/composers/new-project.json';

  /** Home, as the file-manager worker mounts it: one provider at `/`. */
  const home = (): MemoryProvider => new MemoryProvider();

  it('should be refused by the composed view every consumer reads', async () => {
    const view = composeView({ filesystem: home() }, { consumer: 'user', policy: tauPathPolicy });

    /* Which is why the consumer is `'working-copy'` and not `'user'`: this row
     * fails the moment a lane routes a record through a masked view. */
    await expect(view.writeFile(recordPath.slice(1), encoder.encode('{}'))).rejects.toMatchObject({ code: 'EPERM' });
    await expect(view.readFile(recordPath.slice(1))).rejects.toMatchObject({ code: 'EPERM' });
  });

  it('should round-trip through the working copy the rooted content client opens', async () => {
    const provider = home();
    const client = createRootedContentClient({
      /* The worker's own `handlerForRoot`: a `'working-copy'` connection is the checkout itself (V6). */
      open: async (_root, _consumer: 'working-copy') => ({
        files: provider as unknown as RootedFiles,
        dispose: () => undefined,
      }),
    }).files('working-copy');

    await client.writeFile(recordPath, encoder.encode('{"version":1}'));

    expect(new TextDecoder().decode(await client.readFile(recordPath))).toBe('{"version":1}');
  });
});
