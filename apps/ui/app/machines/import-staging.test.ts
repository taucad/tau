// @vitest-environment node
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { createInlineImportDecoder, importStagingDirectory } from '@taucad/filesystem/importer';
import type { ImportStagingPort } from '@taucad/filesystem/importer';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { BatchEntry } from '@taucad/filesystem';
import {
  ImportChannelError,
  importConnectMessageType,
  openImportSession,
  serveImportChannel,
} from '#machines/import-staging.js';
import type { ImportSession } from '#machines/import-staging.js';

const sessions: ImportSession[] = [];

afterEach(() => {
  for (const session of sessions.splice(0)) {
    session.close();
  }
});

const zipOf = async (files: Record<string, string>): Promise<File> => {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new File([bytes as Uint8Array<ArrayBuffer>], 'gear.zip');
};

const removeTree = async (provider: MemoryProvider, path: string): Promise<void> => {
  const stat = await provider.stat(path);
  if (stat.type === 'dir') {
    for (const name of await provider.readdir(path)) {
      // oxlint-disable-next-line no-await-in-loop -- a test tree is removed depth first.
      await removeTree(provider, `${path}/${name}`);
    }
    await provider.rmdir(path);
    return;
  }
  await provider.unlink(path);
};

/* The worker's half served behind a fake worker, the page's half opened on it: one real message channel. */
const connect = (provider: MemoryProvider): ImportSession => {
  const port: ImportStagingPort = {
    provider,
    apply: async (entries: readonly BatchEntry[]): Promise<Array<{ outcome: 'applied' }>> => {
      for (const entry of entries) {
        if (entry.op === 'write') {
          // oxlint-disable-next-line no-await-in-loop -- a test port writes in order.
          await provider.writeFile(entry.path, entry.data as Uint8Array<ArrayBuffer>);
        } else if (entry.op === 'delete') {
          // oxlint-disable-next-line no-await-in-loop -- a test port removes in order.
          await removeTree(provider, entry.path);
        }
      }
      return entries.map(() => ({ outcome: 'applied' }));
    },
  };
  const session = openImportSession({
    postMessage: (message: { type: string; port: MessagePort }) => {
      expect(message.type).toBe(importConnectMessageType);
      serveImportChannel(message.port, {
        importStaging: async () => port,
        decode: createInlineImportDecoder(),
        policy: tauPathPolicy,
      });
    },
  } as unknown as Pick<Worker, 'postMessage'>);
  sessions.push(session);
  return session;
};

describe('the import channel', () => {
  it('plans a zip into paths and sizes, stages it, previews from it, and discards it', async () => {
    const provider = new MemoryProvider();
    const session = connect(provider);
    const file = await zipOf({ 'gear/main.scad': 'cube(1);', 'gear/.git/HEAD': 'ref' });

    const listing = await session.plan({ kind: 'zip', file });

    expect(listing).toStrictEqual({
      name: 'gear',
      files: [{ path: 'main.scad', size: 8 }],
      bytes: 8,
      skipped: { excluded: 1, reserved: 0, symlinks: 0 },
    });

    const progress: number[] = [];
    const staged = await session.stage('req_channel', { backend: 'indexeddb' }, ({ files }) => {
      progress.push(files);
    });

    expect(staged).toStrictEqual({ files: 1, bytes: 8 });
    expect(progress.at(-1)).toBe(1);
    const tree = `${importStagingDirectory('req_channel')}/tree`;
    expect(new TextDecoder().decode(await provider.readFile(`${tree}/main.scad`))).toBe('cube(1);');

    const preview = await session.preview(['main.scad'], 1024);
    expect(new TextDecoder().decode(preview['main.scad']!.content)).toBe('cube(1);');
    expect(await session.preview(['main.scad'], 4)).toStrictEqual({});

    await session.discard('req_channel', { backend: 'indexeddb' });
    expect(await provider.exists(importStagingDirectory('req_channel'))).toBe(false);
  });

  it('carries the policy reason of a refusal to the page', async () => {
    const session = connect(new MemoryProvider());
    const zip = new JSZip();
    zip.file('../../evil.sh', 'boom');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const file = new File([bytes as Uint8Array<ArrayBuffer>], 'x.zip');

    const refused = await session.plan({ kind: 'zip', file }).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(ImportChannelError);
    expect((refused as ImportChannelError).reason).toBe('unsafePath');
  });

  it('refuses to stage before anything is planned', async () => {
    const session = connect(new MemoryProvider());

    await expect(session.stage('req_none', { backend: 'indexeddb' })).rejects.toThrow('Nothing is planned');
  });
});
