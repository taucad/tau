/**
 * Desktop host-side import (W7.4, charter D12): a source a person chose on the
 * host is listed and copied by the node host through an opaque grant, over the
 * real wire to a real `NodeFsProvider`, and lands in staging with the facts
 * the host hashed from what landed.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFsChannel, NodeFsImportSources, NodeFsProviderClient } from '#backend/node/client.js';
import { NodeFsAuthorityHost, serveNodeFsProvider } from '#backend/node/host.js';
import type { ImportSourceGrant } from '#backend/node/import-source.js';
import { nodeFsProtocolVersion } from '#backend/node/protocol.js';
import { tauPathPolicy } from '#path-registry.js';
import { createInlineImportDecoder, createInlineImportMeasurer } from '#importer/decode.js';
import { importLimits } from '#importer/limits.js';
import { fileListImportSource, hostImportSource, planImport } from '#importer/sources.js';
import type { HostImportGrant } from '#importer/sources.js';
import { discardStagedImport, importStagingDirectory, stageImport } from '#importer/staging.js';
import type { ImportStagingPort } from '#importer/staging.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- the server closes before its fixture is removed.
    await cleanup();
  }
});

/* A tree with text, binary, a nested folder, a pruned `node_modules`, a link and a `.git`. */
const tree: Record<string, string | Uint8Array<ArrayBuffer>> = {
  'main.ts': 'export const a = 1;\nexport const b = 2;\n',
  'src/part.ts': 'export const p = 3;',
  'src/deep/notes.md': '# Notes\n',
  'assets/mesh.bin': new Uint8Array([0, 1, 2, 3, 0, 255]),
  'node_modules/dep/index.js': 'module.exports = 1;',
  '.git/HEAD': 'ref: refs/heads/main\n',
};

const write = (base: string, files: Record<string, string | Uint8Array<ArrayBuffer>>): void => {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(base, path, '..'), { recursive: true });
    writeFileSync(join(base, path), content);
  }
};

type Fixture = Readonly<{
  sandbox: string;
  root: string;
  folder: string;
  grants: Map<string, ImportSourceGrant>;
  sources: NodeFsImportSources;
  client: NodeFsProviderClient;
  port: ImportStagingPort;
  channel: NodeFsChannel;
}>;

const serve = (): Fixture => {
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'tau-host-import-')));
  const root = join(sandbox, 'home');
  const folder = join(sandbox, 'chosen', 'Bracket');
  const authorityRoot = join(sandbox, 'authority');
  mkdirSync(root, { recursive: true });
  mkdirSync(authorityRoot);
  write(folder, tree);
  symlinkSync(join(sandbox, 'outside.txt'), join(folder, 'link.txt'));
  writeFileSync(join(sandbox, 'outside.txt'), 'secret');
  const grants = new Map<string, ImportSourceGrant>();
  const { port1, port2 } = new MessageChannel();
  const server = serveNodeFsProvider(port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => candidate === root,
    authority: new NodeFsAuthorityHost({ authorityDirectory: () => authorityRoot, authorityIdentity: () => root }),
    importSource: (grant) => grants.get(grant),
  });
  const channel = new NodeFsChannel(port1);
  cleanups.push(async () => {
    channel.close();
    await server.close();
    port2.close();
    rmSync(sandbox, { recursive: true, force: true });
  });
  const client = new NodeFsProviderClient(channel, root);
  return {
    sandbox,
    root,
    folder,
    grants,
    channel,
    sources: new NodeFsImportSources(channel),
    client,
    port: {
      provider: client,
      apply: async (entries) => client.applyBatch(entries),
      copyHost: async (grant, entries) => client.copyFromImportGrant(grant, entries),
    },
  };
};

/* A grant as main mints one: the chosen entry's links resolved, pinned by its device and inode. */
const grantOf = (path: string, kind: ImportSourceGrant['kind']): ImportSourceGrant => {
  const resolved = realpathSync(path);
  const { dev, ino } = lstatSync(resolved, { bigint: true });
  return { path: resolved, kind, identity: { dev: String(dev), ino: String(ino) } };
};

const folderGrant = (fixture: Fixture, path = fixture.folder): HostImportGrant => {
  const grant = `grant-${String(fixture.grants.size + 1).padStart(4, '0')}`;
  fixture.grants.set(grant, grantOf(path, 'directory'));
  return { grant, name: 'Bracket', kind: 'directory' };
};

const sizeOf = (path: string): number => Buffer.byteLength(tree[path] as string);

const stage = async (fixture: Fixture, plan: Awaited<ReturnType<typeof planImport>>, operationId: string) =>
  stageImport({
    port: fixture.port,
    operationId,
    plan,
    decode: createInlineImportDecoder(),
    measure: createInlineImportMeasurer(),
  });

describe('a host-side import', () => {
  it('speaks protocol 12', () => {
    expect(nodeFsProtocolVersion).toBe(12);
  });

  it('lists, copies and records the facts of a chosen folder, end to end', async () => {
    const fixture = serve();
    const plan = await planImport(hostImportSource(fixture.sources, [folderGrant(fixture)]), { policy: tauPathPolicy });
    expect(plan.name).toBe('Bracket');
    expect(plan.pin.kind).toBe('directory');
    expect(plan.entries.map(({ path }) => path).toSorted()).toEqual([
      'assets/mesh.bin',
      'main.ts',
      'src/deep/notes.md',
      'src/part.ts',
    ]);
    expect(plan.skipped.symlinks).toBe(1);
    const read = vi.spyOn(fixture.client, 'readFile');
    const applied = vi.spyOn(fixture.client, 'applyBatch');
    const staged = await stage(fixture, plan, 'op_host');
    /* No byte crossed the port to be written, and none came back to be measured: the host hashed what landed. */
    expect(read.mock.calls.filter(([path]) => path.includes('/tree/'))).toEqual([]);
    for (const [entries] of applied.mock.calls) {
      expect(entries.every((entry) => entry.op !== 'write' || !entry.path.includes('/tree/'))).toBe(true);
    }
    const landed = join(fixture.root, importStagingDirectory('op_host'), 'tree');
    expect(readFileSync(join(landed, 'main.ts'), 'utf8')).toBe(tree['main.ts']);
    expect(new Uint8Array(readFileSync(join(landed, 'assets/mesh.bin')))).toEqual(tree['assets/mesh.bin']);
    const main = staged.entries.find(({ path }) => path === 'main.ts')!;
    expect(main.facts).toMatchObject({ contentKind: 'text', lineCount: 3 });
    expect(staged.entries.find(({ path }) => path === 'assets/mesh.bin')!.facts.contentKind).toBe('binary');
  });

  it('copies through the held descriptor where no path reopens it (macOS), with the same facts', async () => {
    const fixture = serve();
    const plan = await planImport(hostImportSource(fixture.sources, [folderGrant(fixture)]), { policy: tauPathPolicy });
    const onLinux = await stage(fixture, plan, 'op_linux');
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...platform, value: 'darwin' });
    const copyFile = vi.spyOn(fs, 'copyFile');
    try {
      const replanned = await planImport(hostImportSource(fixture.sources, [folderGrant(fixture)]), {
        policy: tauPathPolicy,
      });
      const elsewhere = await stage(fixture, replanned, 'op_darwin');
      expect(copyFile).not.toHaveBeenCalled();
      expect(elsewhere.entries).toEqual(onLinux.entries);
    } finally {
      Object.defineProperty(process, 'platform', platform);
    }
  });

  it('stages what a browser folder import of the same tree stages, fact for fact', async () => {
    const fixture = serve();
    const viaHost = await stage(
      fixture,
      await planImport(hostImportSource(fixture.sources, [folderGrant(fixture)]), { policy: tauPathPolicy }),
      'op_host',
    );
    /* An `<input webkitdirectory>` pick: every file as a `File`, under the folder's name. */
    const files = Object.entries(tree).map(([path, content]) => ({
      file: new File([content], path.split('/').pop()!),
      path: `Bracket/${path}`,
    }));
    const viaBrowser = await stage(
      fixture,
      await planImport(fileListImportSource(files), { policy: tauPathPolicy }),
      'op_browser',
    );
    const byPath = (entries: typeof viaHost.entries) => [...entries].toSorted((a, b) => a.path.localeCompare(b.path));
    /* The first revision is built from these blob ids, so equal entries are an equal first revision. */
    expect(byPath(viaHost.entries)).toEqual(byPath(viaBrowser.entries));
    expect(viaHost.bytes).toBe(viaBrowser.bytes);
  });

  it('previews a file larger than one reply a range at a time', async () => {
    const fixture = serve();
    const large = new Uint8Array(5 * 1024 * 1024 + 7).map((_, index) => index % 251);
    writeFileSync(join(fixture.folder, 'large.bin'), large);
    const { grant } = folderGrant(fixture);
    const read = await fixture.sources.read(grant, 'large.bin', large.byteLength);
    expect(read.byteLength).toBe(large.byteLength);
    expect(Buffer.from(read).equals(Buffer.from(large))).toBe(true);
    const head = await fixture.sources.read(grant, 'large.bin', 10);
    expect(head.byteLength).toBe(10);
  });

  it('imports files opened with Tau, each by its own grant', async () => {
    const fixture = serve();
    fixture.grants.set('grant-file-1', grantOf(join(fixture.folder, 'main.ts'), 'file'));
    fixture.grants.set('grant-file-2', grantOf(join(fixture.folder, 'assets/mesh.bin'), 'file'));
    const plan = await planImport(
      hostImportSource(fixture.sources, [
        { grant: 'grant-file-1', name: 'main.ts', kind: 'file' },
        { grant: 'grant-file-2', name: 'mesh.bin', kind: 'file' },
      ]),
      { policy: tauPathPolicy },
    );
    const staged = await stage(fixture, plan, 'op_files');
    expect(staged.entries.map(({ path }) => path).toSorted()).toEqual(['main.ts', 'mesh.bin']);
  });

  it('refuses a source outside what the person chose', async () => {
    const fixture = serve();
    const { grant } = folderGrant(fixture);
    await expect(fixture.sources.list(grant, '..')).rejects.toThrow(/import source path/u);
    await expect(fixture.sources.read(grant, 'link.txt', 64)).rejects.toMatchObject({ code: 'ELOOP' });
    await expect(fixture.sources.list('grant-never-minted', '')).rejects.toMatchObject({ code: 'EACCES' });
    const copied = await fixture.client.copyFromImportGrant(grant, [{ from: 'link.txt', path: 'escape.txt', size: 6 }]);
    expect(copied.map(({ outcome }) => outcome)).toEqual(['failed']);
    expect(copied[0]?.error).toMatchObject({ code: 'ELOOP' });
    /* A `..` never parses: the request is refused whole, and nothing is applied. */
    const climbed = await fixture.client.copyFromImportGrant(grant, [
      { from: 'src/../../outside.txt', path: 'escape-2.txt', size: 6 },
    ]);
    expect(climbed[0]?.outcome).not.toBe('applied');
    const refused = await fixture.client.copyFromImportGrant('grant-never-minted', [
      { from: 'main.ts', path: 'x.ts', size: 1 },
    ]);
    expect(refused[0]?.outcome).not.toBe('applied');
    expect(readdirSync(fixture.root)).toEqual([]);
    /* A link to a folder outside is a link: never walked into. */
    symlinkSync(fixture.sandbox, join(fixture.folder, 'escape'));
    const plan = await planImport(hostImportSource(fixture.sources, [{ grant, name: 'Bracket', kind: 'directory' }]), {
      policy: tauPathPolicy,
    });
    expect(plan.entries.some(({ path }) => path.startsWith('escape'))).toBe(false);
  });

  it('leaves the target untouched when a source changes after it was listed', async () => {
    const fixture = serve();
    const plan = await planImport(hostImportSource(fixture.sources, [folderGrant(fixture)]), { policy: tauPathPolicy });
    writeFileSync(join(fixture.folder, 'src/part.ts'), 'export const p = 3; // grew');
    await expect(stage(fixture, plan, 'op_changed')).rejects.toMatchObject({ reason: 'corrupt' });
    await discardStagedImport(fixture.port, 'op_changed');
    expect(existsSync(join(fixture.root, importStagingDirectory('op_changed')))).toBe(false);
  });

  it('leaves the file it was replacing as it was when a copy fails midway', async () => {
    const fixture = serve();
    const { grant } = folderGrant(fixture);
    writeFileSync(join(fixture.root, 'main.ts'), 'old');
    const copyFile = fs.copyFile.bind(fs);
    vi.spyOn(fs, 'copyFile').mockImplementation(async (from, to, mode) => {
      /* The source is the held descriptor's path; the sibling is named for its target. */
      if (String(to).includes('main.ts')) {
        await fs.writeFile(to, 'export const a');
        throw Object.assign(new Error('EIO: i/o error, copyfile'), { code: 'EIO' });
      }
      return copyFile(from, to, mode);
    });
    const receipts = await fixture.client.copyFromImportGrant(grant, [
      { from: 'main.ts', path: 'main.ts', size: Buffer.byteLength(tree['main.ts'] as string) },
      { from: 'src/part.ts', path: 'part.ts', size: Buffer.byteLength(tree['src/part.ts'] as string) },
    ]);
    expect(receipts.map(({ outcome }) => outcome)).toEqual(['failed', 'applied']);
    expect(readFileSync(join(fixture.root, 'main.ts'), 'utf8')).toBe('old');
    /* No temp sibling is left beside it. */
    expect(readdirSync(fixture.root).toSorted()).toEqual(['main.ts', 'part.ts']);
  });

  it('refuses a chosen folder or file swapped for a link after it was chosen', async () => {
    const fixture = serve();
    const { grant } = folderGrant(fixture);
    fixture.grants.set('grant-file-0001', grantOf(join(fixture.folder, 'main.ts'), 'file'));
    const elsewhere = join(fixture.sandbox, 'elsewhere');
    write(elsewhere, { 'main.ts': tree['main.ts']!, 'secret.txt': 'secret' });
    /* The file: replaced by a link to a file of the same name outside. */
    renameSync(join(fixture.folder, 'main.ts'), join(fixture.sandbox, 'main.ts.moved'));
    symlinkSync(join(elsewhere, 'main.ts'), join(fixture.folder, 'main.ts'));
    await expect(fixture.sources.list('grant-file-0001', '')).rejects.toMatchObject({ code: 'EACCES' });
    const fileCopy = await fixture.client.copyFromImportGrant('grant-file-0001', [
      { from: 'main.ts', path: 'main.ts', size: sizeOf('main.ts') },
    ]);
    expect(fileCopy[0]?.outcome).toBe('failed');
    /* The folder: moved away, and a link to another folder put in its place. */
    renameSync(fixture.folder, join(fixture.sandbox, 'Bracket.moved'));
    symlinkSync(elsewhere, fixture.folder);
    await expect(fixture.sources.list(grant, '')).rejects.toMatchObject({ code: 'EACCES' });
    await expect(fixture.sources.read(grant, 'secret.txt', 64)).rejects.toMatchObject({ code: 'EACCES' });
    const copied = await fixture.client.copyFromImportGrant(grant, [
      { from: 'secret.txt', path: 'secret.txt', size: 6 },
    ]);
    expect(copied[0]?.outcome).toBe('failed');
    expect(existsSync(join(fixture.root, 'secret.txt'))).toBe(false);
  });

  it('refuses bytes from a directory swapped for a link and back while the file was opened', async () => {
    const fixture = serve();
    const { grant } = folderGrant(fixture);
    const evil = join(fixture.sandbox, 'evil');
    /* Same name, same size: only its inode tells it apart. */
    write(evil, { 'part.ts': 'export const p = 666;'.slice(0, sizeOf('src/part.ts')).padEnd(sizeOf('src/part.ts')) });
    const sourceDirectory = join(fixture.folder, 'src');
    const open = fs.open.bind(fs);
    vi.spyOn(fs, 'open').mockImplementation(async (path, flags, mode) => {
      if (String(path) === join(sourceDirectory, 'part.ts')) {
        renameSync(sourceDirectory, `${sourceDirectory}.real`);
        symlinkSync(evil, sourceDirectory);
        try {
          return await open(path, flags, mode);
        } finally {
          unlinkSync(sourceDirectory);
          renameSync(`${sourceDirectory}.real`, sourceDirectory);
        }
      }
      return open(path, flags, mode);
    });
    const copied = await fixture.client.copyFromImportGrant(grant, [
      { from: 'src/part.ts', path: 'part.ts', size: sizeOf('src/part.ts') },
    ]);
    expect(copied[0]).toMatchObject({ outcome: 'failed', error: { code: 'ESTALE' } });
    expect(existsSync(join(fixture.root, 'part.ts'))).toBe(false);
  });

  it('refuses a file written to while it was copied', async () => {
    const fixture = serve();
    const { grant } = folderGrant(fixture);
    const copyFile = fs.copyFile.bind(fs);
    vi.spyOn(fs, 'copyFile').mockImplementation(async (from, to, mode) => {
      await copyFile(from, to, mode);
      /* Same size, new bytes: only its times say it changed. */
      await fs.writeFile(join(fixture.folder, 'main.ts'), (tree['main.ts'] as string).toUpperCase());
    });
    const copied = await fixture.client.copyFromImportGrant(grant, [
      { from: 'main.ts', path: 'main.ts', size: sizeOf('main.ts') },
    ]);
    expect(copied[0]).toMatchObject({ outcome: 'failed', error: { code: 'ESTALE' } });
    expect(existsSync(join(fixture.root, 'main.ts'))).toBe(false);
  });

  it('holds its own file limit, whatever size the client names', async () => {
    const fixture = serve();
    const { grant } = folderGrant(fixture);
    const copied = await fixture.client.copyFromImportGrant(grant, [
      { from: 'main.ts', path: 'main.ts', size: importLimits.maximumFileBytes + 1 },
    ]);
    expect(copied[0]).toMatchObject({ outcome: 'failed', error: { code: 'EFBIG' } });
  });

  it('lists a large directory a bounded page at a time, and counts special files against the entry limit', async () => {
    const fixture = serve();
    const many = join(fixture.folder, 'many');
    write(many, Object.fromEntries(Array.from({ length: 2100 }, (_, index) => [`f-${String(index)}.txt`, 'x'])));
    execFileSync('mkfifo', [join(fixture.folder, 'pipe')]);
    const list = vi.spyOn(fixture.sources, 'list');
    const plan = await planImport(hostImportSource(fixture.sources, [folderGrant(fixture)]), { policy: tauPathPolicy });
    expect(plan.entries.filter(({ path }) => path.startsWith('many/'))).toHaveLength(2100);
    const pages = await Promise.all(
      list.mock.results.map(async ({ value }) => value as ReturnType<typeof fixture.sources.list>),
    );
    expect(Math.max(...pages.map(({ rows }) => rows.length))).toBeLessThanOrEqual(1024);
    expect(list.mock.calls.filter(([, path]) => path === 'many')).toHaveLength(3);
    /* The pipe is left out of the import, but it counts as an entry the walk found. */
    expect(plan.entries.some(({ path }) => path === 'pipe')).toBe(false);
    const counted = plan.pin.entries;
    await expect(
      planImport(hostImportSource(fixture.sources, [folderGrant(fixture)]), {
        policy: tauPathPolicy,
        limits: { ...importLimits, maximumEntries: counted - 1 },
      }),
    ).rejects.toMatchObject({ reason: 'tooManyEntries' });
  });

  it('stops a batch where one copy fails, records none of it, and leaves nothing once discarded', async () => {
    const fixture = serve();
    const plan = await planImport(hostImportSource(fixture.sources, [folderGrant(fixture)]), { policy: tauPathPolicy });
    /* One of the batch's sources is gone by the time it is copied; the rest land. */
    rmSync(join(fixture.folder, 'src/deep/notes.md'));
    await expect(stage(fixture, plan, 'op_group')).rejects.toMatchObject({ code: 'ENOENT' });
    const staging = join(fixture.root, importStagingDirectory('op_group'));
    expect(existsSync(join(staging, 'tree/main.ts'))).toBe(true);
    /* The batch was announced, never recorded: a resume trusts none of it. */
    const ledger = readdirSync(join(staging, 'ledger'));
    expect(ledger.some((name) => name.endsWith('.pending.json'))).toBe(true);
    expect(ledger.some((name) => /^\d+\.json$/u.test(name))).toBe(false);
    await discardStagedImport(fixture.port, 'op_group');
    expect(existsSync(staging)).toBe(false);
  });

  it('holds a host source to the import limits while it walks', async () => {
    const fixture = serve();
    const source = () => hostImportSource(fixture.sources, [folderGrant(fixture)]);
    await expect(
      planImport(source(), { policy: tauPathPolicy, limits: { ...importLimits, maximumFileBytes: 16 } }),
    ).rejects.toMatchObject({ reason: 'fileTooLarge' });
    await expect(
      planImport(source(), { policy: tauPathPolicy, limits: { ...importLimits, maximumEntries: 2 } }),
    ).rejects.toMatchObject({ reason: 'tooManyEntries' });
    /* The pruned subtrees are never listed, so they never count against the entry limit. */
    const list = vi.spyOn(fixture.sources, 'list');
    await planImport(source(), { policy: tauPathPolicy, limits: { ...importLimits, maximumEntries: 5 } });
    expect(list.mock.calls.map(([, path]) => path)).not.toContain('node_modules');
    expect(list.mock.calls.map(([, path]) => path)).not.toContain('.git');
  });

  it('is refused on a storage root whose host holds no chosen source', async () => {
    const fixture = serve();
    const plan = await planImport(hostImportSource(fixture.sources, [folderGrant(fixture)]), { policy: tauPathPolicy });
    const { copyHost: _, ...port } = fixture.port;
    await expect(
      stageImport({ port, operationId: 'op_none', plan, decode: createInlineImportDecoder() }),
    ).rejects.toThrow(/cannot copy from a source on the host/u);
  });
});
