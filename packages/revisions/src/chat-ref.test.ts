/**
 * Chats on the graph, on both legs (I4).
 *
 * One table, two adapters: `isomorphic-git` over a memory provider, and native
 * git over a `mktemp` repository wherever `git` is on `PATH`. The rows are the
 * W17 contract — a chat ref whose tree is the chat directory and whose parent is
 * the previous ref value; a projection the fetch path writes through the
 * checkout's own filesystem; a CAS loser that replays its segment onto the
 * remote tree and loses no record; and *Sync chats* off meaning no ref exists at
 * all.
 */

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryProvider } from '@taucad/filesystem/backend';
import { classify } from '@taucad/filesystem/path-registry';
import { ImmutableRevisionTree, revisionId } from '@taucad/filesystem/revisions';
import type { FileSystemProvider } from '@taucad/filesystem';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  chatIdOfRef,
  chatRecordsPath,
  chatRefName,
  chatSegmentPath,
  projectChats,
  replayChatSegment,
  writeChatRef,
} from '#chat-ref.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { isHostLocalRef, refPatternIsHostLocal } from '#remotes.js';
import { startGitHttpBackend } from '#test/git-http-backend.js';
import type { RevisionId } from '@taucad/filesystem/revisions';
import type { RevisionPort } from '#revision-port.js';

const decoder = new TextDecoder();
const projectId = 'project-chat-refs';
const chatId = 'chat_one';
const actorId = 'actor-w17';
const now = Date.UTC(2026, 8, 13, 6, 0, 0);

const gitOnPath = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

type Harness = Readonly<{
  port: RevisionPort;
  /** The checkout whose `.tau/chats/**` is the canonical form. */
  checkout: FileSystemProvider;
  dispose: () => Promise<void>;
}>;

const isomorphicHarness = async (): Promise<Harness> => {
  const filesystem = await createMemoryProvider();
  const checkout = await createMemoryProvider();
  return {
    port: createIsomorphicGitRevisionPort({ filesystem }),
    checkout,
    dispose: async () => {
      await Promise.resolve();
    },
  };
};

const nativeHarness = async (): Promise<Harness> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-chat-refs-'));
  const repositoryPath = join(root, 'project');
  await mkdir(repositoryPath, { recursive: true });
  return {
    /* The checkout is a memory provider on both legs: the chat directory is
     * `records`, so the port never reads it and the leg under test is the object
     * and ref half, not the disk the files happen to sit on. */
    port: createNativeGitRevisionPort({ repositoryPath, checkouts: { projectId, directory: join(root, 'checkouts') } }),
    checkout: await createMemoryProvider(),
    dispose: async () => rm(root, { force: true, recursive: true }),
  };
};

const writeChatFiles = async (
  checkout: FileSystemProvider,
  files: Readonly<Record<string, string>>,
  id = chatId,
): Promise<void> => {
  await Promise.all(
    Object.entries(files).map(async ([path, content]) => checkout.writeFile(`${chatRecordsPath(id)}/${path}`, content)),
  );
};

const readChatFile = async (checkout: FileSystemProvider, path: string, id = chatId): Promise<string | undefined> => {
  try {
    return await checkout.readFile(`${chatRecordsPath(id)}/${path}`, 'utf8');
  } catch {
    return undefined;
  }
};

const readChatBytes = async (
  checkout: FileSystemProvider,
  path: string,
  id = chatId,
): Promise<Uint8Array<ArrayBuffer> | undefined> => {
  try {
    return await checkout.readFile(`${chatRecordsPath(id)}/${path}`);
  } catch {
    return undefined;
  }
};

/* Attachments as the closed tree spells them (D12): bytes named by their
 * lowercase SHA-256 hex and one of the five stored media types. The hashes here
 * are shaped, not computed — `chat-ref` validates the spelling, and the store
 * that mints the name is the UI's own. */
const imageHash = 'a1'.repeat(32);
const documentHash = 'b2'.repeat(32);
const imagePath = `attachments/${imageHash}.jpg`;
const documentPath = `attachments/${documentHash}.pdf`;
/* Binary on purpose: a JPEG's SOI/APP0 and a PDF header, so a leg that decoded
 * or re-encoded a blob on the way through would not round-trip. */
const imageBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const documentBytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x00]);

describe('chat ref naming', () => {
  it('reads a chat id from a local ref and from its remote-tracking spelling', () => {
    expect(chatIdOfRef(chatRefName(chatId))).toBe(chatId);
    expect(chatIdOfRef(`refs/remotes/tau/tau/chats/${chatId}`)).toBe(chatId);
    expect(chatIdOfRef('refs/heads/main')).toBeUndefined();
    expect(chatIdOfRef('refs/tau/evidence/abc')).toBeUndefined();
  });

  /* What the projection writes, and what the registry says about it: the watch
   * plane reports it (`watch: 'ui'`, so the chat list repaints) and the revision
   * cut never does (`versioned: false`, so a fetched chat mints nothing). A
   * write through the checkout's own filesystem is the host's, not a user edit
   * the tree has to reconcile. */
  it('projects only into paths the registry calls watched, unversioned records', () => {
    for (const path of [
      `${chatRecordsPath(chatId)}/chat.json`,
      `${chatRecordsPath(chatId)}/${chatSegmentPath('device-a')}`,
    ]) {
      const provenance = classify(path);
      expect(provenance.class).toBe('records');
      expect(provenance.versioned).toBe(false);
      expect(provenance.watch).toBe('ui');
      expect(provenance.agentAccess).toBe('read-only');
    }
  });

  /* The one pin W11b's report asks this lane for: `refs/tau/chats/*` is the
   * record set the design pushes, so a guard that called it host-local would
   * silently stop every chat at the wire. */
  it('never treats a chat ref as host-local', () => {
    expect(isHostLocalRef(chatRefName(chatId))).toBe(false);
    expect(refPatternIsHostLocal('refs/tau/chats/*')).toBe(false);
    expect(isHostLocalRef('refs/tau/workspaces/w1')).toBe(true);
  });
});

describe.each([
  ['isomorphic-git', isomorphicHarness, true],
  ['native-git', nativeHarness, gitOnPath],
] as const)('%s chat refs', (_engine, createHarness, enabled) => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await createHarness();
    await harness.port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
  });

  afterAll(async () => {
    await harness.dispose();
  });

  const write = async (deviceId: string, syncChats = true): ReturnType<typeof writeChatRef> =>
    writeChatRef({
      port: harness.port,
      filesystem: harness.checkout,
      deviceId,
      chatId,
      syncChats,
      actorId,
      now,
    });

  /* Before the first write there is no `refs/tau/chats` at all: an empty
   * namespace has to answer empty on both legs, not throw — isomorphic-git
   * walks a directory that does not exist, and native git reads packed-refs. */
  it.runIf(enabled)('answers an empty list for a namespace that holds no ref yet', async () => {
    expect(await harness.port.listRefs('refs/tau/chats/')).toEqual([]);
  });

  it.runIf(enabled)('records the chat directory as the ref tree, parented on the previous ref', async () => {
    await writeChatFiles(harness.checkout, {
      'chat.json': '{"id":"chat_one","name":"First"}',
      'events.jsonl': '{"leaderEpoch":"e1","sequence":0}\n',
    });

    const first = await write('device-a');
    expect(first.status).toBe('updated');
    expect(first.expectedLocalHead).toBeUndefined();
    expect(first.head).toBeDefined();

    const tree = await harness.port.readTree(first.head!);
    expect(tree?.entries().map((entry) => entry.path)).toEqual(['chat.json', chatSegmentPath('device-a')]);
    expect(decoder.decode(tree?.get(chatSegmentPath('device-a')))).toBe('{"leaderEpoch":"e1","sequence":0}\n');

    /* Orphan-parented: the first commit of the chain has no parents, so nothing
     * about a chat is reachable from a branch and a refused chat ref cannot
     * block one. */
    const record = await harness.port.readRevision(first.head!);
    expect(record?.parents).toEqual([]);

    await writeChatFiles(harness.checkout, { 'events.jsonl': '{"leaderEpoch":"e1","sequence":0}\n{"s":1}\n' });
    const second = await write('device-a');
    expect(second.status).toBe('updated');
    expect(second.expectedLocalHead).toBe(first.head);
    const secondRecord = await harness.port.readRevision(second.head!);
    expect(secondRecord?.parents).toEqual([first.head]);
    expect(await harness.port.readRef(chatRefName(chatId))).toBe(second.head);
  });

  it.runIf(enabled)('lists the chat ref in its own namespace and answers in full names', async () => {
    const listed = await harness.port.listRefs('refs/tau/chats/');
    expect(listed.map((reference) => reference.name)).toContain(chatRefName(chatId));
    /* And the branch vocabulary is unchanged: an unprefixed call still answers
     * short branch names, which is what every other caller reads. */
    const branches = await harness.port.listRefs();
    expect(branches.every((reference) => !reference.name.startsWith('refs/'))).toBe(true);
  });

  it.runIf(enabled)('writes nothing at all when Sync chats is off', async () => {
    const offChat = 'chat_files_only';
    await writeChatFiles(harness.checkout, { 'chat.json': '{"id":"chat_files_only"}' }, offChat);
    const refused = await writeChatRef({
      port: harness.port,
      filesystem: harness.checkout,
      deviceId: 'device-a',
      chatId: offChat,
      syncChats: false,
      actorId,
      now,
    });
    expect(refused.status).toBe('disabled');
    expect(await harness.port.readRef(chatRefName(offChat))).toBeUndefined();
  });

  it.runIf(enabled)('is a no-op when the directory already matches the ref', async () => {
    const repeated = await write('device-a');
    expect(repeated.status).toBe('upToDate');
  });

  it.runIf(enabled)("projects a fetched tree into the checkout without touching this device's own log", async () => {
    /* Device B's world: its own log at `events.jsonl`, and device A's ref. */
    const head = await harness.port.readRef(chatRefName(chatId));
    const target = await createMemoryProvider();
    await target.writeFile(`${chatRecordsPath(chatId)}/events.jsonl`, '{"leaderEpoch":"e2","sequence":0}\n');

    const projected = await projectChats({
      port: harness.port,
      filesystem: target,
      deviceId: 'device-b',
      refs: [{ name: `refs/remotes/tau/tau/chats/${chatId}`, head: head! }],
    });

    expect(projected).toEqual([chatId]);
    expect(await readChatFile(target, 'chat.json')).toBe('{"id":"chat_one","name":"First"}');
    expect(await readChatFile(target, chatSegmentPath('device-a'))).toBe(
      '{"leaderEpoch":"e1","sequence":0}\n{"s":1}\n',
    );
    /* Never rewritten: `events.jsonl` is the file this device's agent host is
     * appending to, and a tree's copy of it would truncate a live log. */
    expect(await readChatFile(target, 'events.jsonl')).toBe('{"leaderEpoch":"e2","sequence":0}\n');

    /* Idempotent: the same refs a second time change no bytes, so the watch
     * plane sees one change per real change (A38 "coalesce at the seam"). */
    expect(
      await projectChats({
        port: harness.port,
        filesystem: target,
        deviceId: 'device-b',
        refs: [{ name: `refs/remotes/tau/tau/chats/${chatId}`, head: head! }],
      }),
    ).toEqual([]);
  });

  it.runIf(enabled)('never truncates a compatible foreign segment and rejects divergent bytes', async () => {
    const id = `append_${_engine}`;
    const old = await harness.port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['events/device-a.jsonl', '{"leaderEpoch":"a","sequence":0}\n']]),
      provenance: { source: 'user', actorId, createdAt: now },
      summary: { generated: 'Old segment' },
    });
    const oldHead = revisionId(old.commitId);
    const longer = await harness.port.writeRevision({
      parents: [oldHead],
      tree: new ImmutableRevisionTree([
        ['events/device-a.jsonl', '{"leaderEpoch":"a","sequence":0}\n{"leaderEpoch":"a","sequence":1}\n'],
      ]),
      provenance: { source: 'user', actorId, createdAt: now + 1 },
      summary: { generated: 'Longer segment' },
    });
    const longerHead = revisionId(longer.commitId);
    const target = await createMemoryProvider();

    await projectChats({
      port: harness.port,
      filesystem: target,
      deviceId: 'device-c',
      refs: [{ name: chatRefName(id), head: longerHead }],
    });
    await projectChats({
      port: harness.port,
      filesystem: target,
      deviceId: 'device-c',
      refs: [{ name: chatRefName(id), head: oldHead }],
    });
    expect(await readChatFile(target, 'events/device-a.jsonl', id)).toBe(
      '{"leaderEpoch":"a","sequence":0}\n{"leaderEpoch":"a","sequence":1}\n',
    );

    const divergent = await harness.port.writeRevision({
      parents: [oldHead],
      tree: new ImmutableRevisionTree([
        ['events/device-a.jsonl', '{"leaderEpoch":"a","sequence":0}\n{"different":true}\n'],
      ]),
      provenance: { source: 'user', actorId, createdAt: now + 2 },
      summary: { generated: 'Divergent segment' },
    });
    await expect(
      projectChats({
        port: harness.port,
        filesystem: target,
        deviceId: 'device-c',
        refs: [{ name: chatRefName(id), head: revisionId(divergent.commitId) }],
      }),
    ).rejects.toMatchObject({ code: 'CHECKOUT_CONFLICT' });
    expect(await readChatFile(target, 'events/device-a.jsonl', id)).toBe(
      '{"leaderEpoch":"a","sequence":0}\n{"leaderEpoch":"a","sequence":1}\n',
    );
  });

  it.runIf(enabled)('applies remote-only metadata changes and preserves conflicting local edits', async () => {
    const id = `metadata_${_engine}`;
    const first = await harness.port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['chat.json', '{"name":"First"}']]),
      provenance: { source: 'user', actorId, createdAt: now },
      summary: { generated: 'First metadata' },
    });
    const firstHead = revisionId(first.commitId);
    const renamed = await harness.port.writeRevision({
      parents: [firstHead],
      tree: new ImmutableRevisionTree([['chat.json', '{"name":"Renamed remotely"}']]),
      provenance: { source: 'user', actorId, createdAt: now + 1 },
      summary: { generated: 'Renamed metadata' },
    });
    const target = await createMemoryProvider();
    for (const head of [firstHead, revisionId(renamed.commitId)]) {
      await projectChats({
        port: harness.port,
        filesystem: target,
        deviceId: 'device-c',
        refs: [{ name: chatRefName(id), head }],
      });
    }
    expect(await readChatFile(target, 'chat.json', id)).toBe('{"name":"Renamed remotely"}');

    await target.writeFile(`${chatRecordsPath(id)}/chat.json`, '{"name":"Local edit"}');
    await expect(
      projectChats({
        port: harness.port,
        filesystem: target,
        deviceId: 'device-c',
        refs: [{ name: chatRefName(id), head: firstHead }],
      }),
    ).rejects.toMatchObject({ code: 'CHECKOUT_CONFLICT' });
    expect(await readChatFile(target, 'chat.json', id)).toBe('{"name":"Local edit"}');
  });

  it.runIf(enabled)('never projects this device back over its own segment', async () => {
    const head = await harness.port.readRef(chatRefName(chatId));
    const target = await createMemoryProvider();
    await target.writeFile(`${chatRecordsPath(chatId)}/events.jsonl`, 'live and growing\n');

    await projectChats({
      port: harness.port,
      filesystem: target,
      deviceId: 'device-a',
      refs: [{ name: chatRefName(chatId), head: head! }],
    });

    expect(await readChatFile(target, 'events.jsonl')).toBe('live and growing\n');
    expect(await readChatFile(target, chatSegmentPath('device-a'))).toBeUndefined();
  });

  it.runIf(enabled)('rejects a malformed chat tree before changing any local record', async () => {
    const target = await createMemoryProvider();
    await target.writeFile(`${chatRecordsPath('malformed')}/chat.json`, '{"name":"local"}');
    await target.writeFile(`${chatRecordsPath('malformed')}/events.jsonl`, 'local live log\n');
    const malicious = await harness.port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([
        ['chat.json', '{"name":"remote"}'],
        ['events.jsonl', 'remote live log\n'],
        ['events/device-a.jsonl', 'remote segment\n'],
      ]),
      provenance: { source: 'user', actorId, createdAt: now },
      summary: { generated: 'Malformed chat' },
    });

    await expect(
      projectChats({
        port: harness.port,
        filesystem: target,
        deviceId: 'device-b',
        refs: [{ name: chatRefName('malformed'), head: revisionId(malicious.commitId) }],
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    expect(await readChatFile(target, 'chat.json', 'malformed')).toBe('{"name":"local"}');
    expect(await readChatFile(target, 'events.jsonl', 'malformed')).toBe('local live log\n');
    expect(await readChatFile(target, chatSegmentPath('device-a'), 'malformed')).toBeUndefined();
  });

  /* One entry family was widened, not the tree: an attachment is admitted only
   * when it is content-addressed under `attachments/`, and everything else is
   * still refused before a byte is written (Finding 11). */
  it.runIf(enabled)('admits content-addressed attachments and refuses every other sibling', async () => {
    const id = `attachments_${_engine}`;
    const carried = await harness.port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([
        ['chat.json', '{"name":"with attachments"}'],
        ['events/device-a.jsonl', 'A0\n'],
        [imagePath, imageBytes],
        [documentPath, documentBytes],
      ]),
      provenance: { source: 'user', actorId, createdAt: now },
      summary: { generated: 'Chat with attachments' },
    });
    const target = await createMemoryProvider();
    await projectChats({
      port: harness.port,
      filesystem: target,
      deviceId: 'device-b',
      refs: [{ name: chatRefName(id), head: revisionId(carried.commitId) }],
    });
    expect(await readChatBytes(target, imagePath, id)).toEqual(imageBytes);
    expect(await readChatBytes(target, documentPath, id)).toEqual(documentBytes);

    /* Sequential on purpose: each row is one `writeRevision`, which on the
     * native leg is one `git fast-import` against one repository, and six of
     * them at once contend on its object store. */
    for (const path of [
      /* 63 hex digits: a name no content-addressed write produces. */
      `attachments/${imageHash.slice(1)}.jpg`,
      /* Outside the five stored media types (D12). */
      `attachments/${imageHash}.exe`,
      /* Upper-case hex: the store writes lower-case, so two spellings of one
       * blob would be two entries for one object. */
      `attachments/${imageHash.toUpperCase()}.jpg`,
      /* No sub-directories: the family is one flat level. */
      `attachments/nested/${imageHash}.jpg`,
      'attachments/notes.txt',
      'notes.txt',
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one tree per refused name, against one repository.
      const written = await harness.port.writeRevision({
        parents: [],
        tree: new ImmutableRevisionTree([
          ['chat.json', '{"name":"remote"}'],
          [path, imageBytes],
        ]),
        provenance: { source: 'user', actorId, createdAt: now },
        summary: { generated: `Chat carrying ${path}` },
      });
      await expect(
        projectChats({
          port: harness.port,
          filesystem: await createMemoryProvider(),
          deviceId: 'device-b',
          refs: [{ name: chatRefName(`${id}_refused`), head: revisionId(written.commitId) }],
        }),
        `expected ${path} to be refused`,
        // oxlint-disable-next-line no-await-in-loop -- the refusal is asserted against the tree written one statement earlier.
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    }
  });

  it.runIf(enabled)(
    'keeps newer projected segments and local metadata when recording from a stale parent',
    async () => {
      const staleChat = `stale_${_engine}`;
      const old = await harness.port.writeRevision({
        parents: [],
        tree: new ImmutableRevisionTree([
          ['chat.json', '{"name":"old"}'],
          ['events/other.jsonl', 'old remote segment\n'],
        ]),
        provenance: { source: 'user', actorId, createdAt: now },
        summary: { generated: 'Old chat' },
      });
      const oldHead = revisionId(old.commitId);
      await harness.port.updateRef({ name: chatRefName(staleChat), expectedHead: undefined, head: oldHead });
      await writeChatFiles(
        harness.checkout,
        {
          'chat.json': '{"name":"local edit"}',
          'events.jsonl': 'mine\n',
          'events/other.jsonl': 'old remote segment\nnew remote event\n',
        },
        staleChat,
      );

      const written = await writeChatRef({
        port: harness.port,
        filesystem: harness.checkout,
        deviceId: 'mine',
        chatId: staleChat,
        syncChats: true,
        actorId,
        now,
      });
      expect(written.status).toBe('updated');
      expect(await readChatFile(harness.checkout, 'events/other.jsonl', staleChat)).toBe(
        'old remote segment\nnew remote event\n',
      );
      const union = await harness.port.readTree(written.head!);
      expect(decoder.decode(union?.get('events/other.jsonl'))).toBe('old remote segment\nnew remote event\n');
      expect(decoder.decode(union?.get('chat.json'))).toBe('{"name":"local edit"}');

      const projected = await createMemoryProvider();
      await projected.writeFile(`${chatRecordsPath(staleChat)}/chat.json`, '{"name":"pending local edit"}');
      await expect(
        projectChats({
          port: harness.port,
          filesystem: projected,
          deviceId: 'third',
          refs: [{ name: chatRefName(staleChat), head: written.head! }],
        }),
      ).rejects.toMatchObject({ code: 'CHECKOUT_CONFLICT' });
      expect(await readChatFile(projected, 'chat.json', staleChat)).toBe('{"name":"pending local edit"}');
    },
  );

  it.runIf(enabled)("replays a second device's segment onto a head it did not write, losing no record", async () => {
    const remoteHead = await harness.port.readRef(chatRefName(chatId));

    /* Device B's world: a projected copy of A's tree plus its own log. Its
     * replay parents on the head it fetched, and the union needs no merge
     * because the only path both devices claim is `chat.json`. */
    const target = await createMemoryProvider();
    await projectChats({
      port: harness.port,
      filesystem: target,
      deviceId: 'device-b',
      refs: [{ name: chatRefName(chatId), head: remoteHead! }],
    });
    await target.writeFile(`${chatRecordsPath(chatId)}/events.jsonl`, '{"leaderEpoch":"e2","sequence":0}\n');

    const replayed = await replayChatSegment({
      port: harness.port,
      filesystem: target,
      deviceId: 'device-b',
      chatId,
      syncChats: true,
      actorId,
      now,
      onto: revisionId(remoteHead!),
    });
    expect(replayed.status).toBe('updated');

    const union = await harness.port.readTree(replayed.head!);
    expect(union?.entries().map((entry) => entry.path)).toEqual([
      'chat.json',
      chatSegmentPath('device-a'),
      chatSegmentPath('device-b'),
    ]);
    expect(decoder.decode(union?.get(chatSegmentPath('device-a')))).toBe(
      '{"leaderEpoch":"e1","sequence":0}\n{"s":1}\n',
    );
    expect(decoder.decode(union?.get(chatSegmentPath('device-b')))).toBe('{"leaderEpoch":"e2","sequence":0}\n');
  });

  /* The CAS this effect makes is the *same-host* guard: one store, one local
   * ref, two writers. The cross-device race is a push rejection and is proved
   * over a real remote below. */
  it.runIf(enabled)('reports a conflict when the local ref moves underneath the write', async () => {
    const before = await harness.port.readRef(chatRefName(chatId));
    const target = await createMemoryProvider();
    await target.writeFile(`${chatRecordsPath(chatId)}/events.jsonl`, 'a slow writer\n');

    /* Another writer lands between this one's `readRef` and its `updateRef`,
     * which is exactly what the lease exists to catch. */
    let interleaved = false;
    const racing: RevisionPort = {
      ...harness.port,
      writeRevision: async (revisionInput) => {
        if (!interleaved) {
          interleaved = true;
          await writeChatFiles(harness.checkout, {
            'events.jsonl': '{"leaderEpoch":"e1","sequence":0}\n{"s":1}\nthe other writer won\n',
          });
          await write('device-a');
        }
        return harness.port.writeRevision(revisionInput);
      },
    };

    const raced = await replayChatSegment({
      port: racing,
      filesystem: target,
      deviceId: 'device-c',
      chatId,
      syncChats: true,
      actorId,
      now,
      onto: before,
    });
    expect(raced.status).toBe('conflicted');
    expect(raced.expectedLocalHead).toBe(before);
    expect(raced.head).toBe(await harness.port.readRef(chatRefName(chatId)));
  });
});

describe.runIf(gitOnPath)('two devices, two stores, one remote', () => {
  const sharedChatId = 'chat_two_devices';
  let root: string;
  let remote: Awaited<ReturnType<typeof startGitHttpBackend>>;
  let deviceA: Harness;
  let deviceB: Harness;

  const device = async (name: string): Promise<Harness> => {
    const repositoryPath = join(root, name);
    await mkdir(repositoryPath, { recursive: true });
    const port = createNativeGitRevisionPort({ repositoryPath });
    await port.init({ author: { name: 'Tau', email: 'tau@example.com' } });
    await port.setRemote({ name: 'origin', url: remote.url });
    return {
      port,
      checkout: await createMemoryProvider(),
      dispose: async () => {
        await Promise.resolve();
      },
    };
  };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-chat-two-devices-'));
    remote = await startGitHttpBackend({ root, name: 'chats' });
    deviceA = await device('device-a-store');
    deviceB = await device('device-b-store');
  }, 120_000);

  afterAll(async () => {
    await remote.close();
    await rm(root, { force: true, recursive: true });
  });

  const writeOn = async (harness: Harness, deviceId: string): ReturnType<typeof writeChatRef> =>
    writeChatRef({
      port: harness.port,
      filesystem: harness.checkout,
      deviceId,
      chatId: sharedChatId,
      syncChats: true,
      actorId,
      now,
    });

  const fetchChat = async (harness: Harness): Promise<RevisionId> => {
    const fetched = await harness.port.fetch({ remote: 'origin', refs: [chatRefName(sharedChatId)] });
    const found = fetched.refs.find((reference) => chatIdOfRef(reference.name) === sharedChatId);
    expect(found).toBeDefined();
    return found!.head;
  };

  it('publishes the second device after a fetch, and both ends hold both segments', async () => {
    await writeChatFiles(
      deviceA.checkout,
      { 'chat.json': '{"id":"chat_two_devices","name":"A"}', 'events.jsonl': 'A0\n' },
      sharedChatId,
    );
    const first = await writeOn(deviceA, 'device-a');
    expect(first.status).toBe('updated');
    const pushedA = await deviceA.port.push({ remote: 'origin', refs: [{ name: chatRefName(sharedChatId) }] });
    expect(pushedA.refs[0]?.status).toBe('updated');

    /* Device B has its own chain, written before it ever saw A's. */
    await writeChatFiles(
      deviceB.checkout,
      { 'chat.json': '{"id":"chat_two_devices","name":"B"}', 'events.jsonl': 'B0\n' },
      sharedChatId,
    );
    const localB = await writeOn(deviceB, 'device-b');
    expect(localB.status).toBe('updated');

    /* The race is at the wire, not in B's own store: two orphan chains, so the
     * remote refuses the push and B has to fetch and replay. */
    const refused = await deviceB.port.push({ remote: 'origin', refs: [{ name: chatRefName(sharedChatId) }] });
    expect(refused.refs[0]?.status).toBe('rejected');

    const remoteHead = await fetchChat(deviceB);
    const replayed = await replayChatSegment({
      port: deviceB.port,
      filesystem: deviceB.checkout,
      deviceId: 'device-b',
      chatId: sharedChatId,
      syncChats: true,
      actorId,
      now,
      onto: remoteHead,
    });
    /* The lease the ref update makes is B's *local* head, which is B's own
     * commit — not the remote head it is parenting on. */
    expect(replayed.status).toBe('updated');
    expect(replayed.expectedLocalHead).toBe(localB.head);
    const replayedRecord = await deviceB.port.readRevision(replayed.head!);
    expect(replayedRecord?.parents).toEqual([remoteHead]);
    expect(await deviceB.port.readRef(chatRefName(sharedChatId))).toBe(replayed.head);

    /* Recording never projects remote bytes: B's published union carries A's
     * segment from the fetched base, while only the fetch projection owner may
     * write that segment into B's checkout. */
    const union = await deviceB.port.readTree(replayed.head!);
    expect(union?.entries().map((entry) => entry.path)).toEqual([
      'chat.json',
      chatSegmentPath('device-a'),
      chatSegmentPath('device-b'),
    ]);
    expect(await readChatFile(deviceB.checkout, chatSegmentPath('device-a'), sharedChatId)).toBeUndefined();
    expect(await readChatFile(deviceB.checkout, 'events.jsonl', sharedChatId)).toBe('B0\n');

    /* P18: the push lease is the head B last fetched, never what the local
     * write expected. */
    const pushedB = await deviceB.port.push({
      remote: 'origin',
      refs: [{ name: chatRefName(sharedChatId), expected: remoteHead }],
    });
    expect(pushedB.refs[0]?.status).toBe('updated');

    await projectChats({
      port: deviceA.port,
      filesystem: deviceA.checkout,
      deviceId: 'device-a',
      refs: [{ name: chatRefName(sharedChatId), head: await fetchChat(deviceA) }],
    });
    expect(await readChatFile(deviceA.checkout, chatSegmentPath('device-b'), sharedChatId)).toBe('B0\n');
    expect(await readChatFile(deviceA.checkout, 'events.jsonl', sharedChatId)).toBe('A0\n');
  }, 180_000);

  /* An image and a PDF beside the log: one entry each in the ref's tree, exact
   * bytes, and never re-entered once the device already holds them. */
  it('carries an image and a PDF as one object each, and stops at the P20 gate', async () => {
    const base = await fetchChat(deviceA);
    await deviceA.checkout.writeFile(`${chatRecordsPath(sharedChatId)}/${imagePath}`, imageBytes);
    await deviceA.checkout.writeFile(`${chatRecordsPath(sharedChatId)}/${documentPath}`, documentBytes);

    const withAttachments = await replayChatSegment({
      port: deviceA.port,
      filesystem: deviceA.checkout,
      deviceId: 'device-a',
      chatId: sharedChatId,
      syncChats: true,
      actorId,
      now,
      onto: base,
    });
    expect(withAttachments.status).toBe('updated');
    const carried = await deviceA.port.readTree(withAttachments.head!);
    expect(carried?.entries().map((entry) => entry.path)).toEqual([
      imagePath,
      documentPath,
      'chat.json',
      chatSegmentPath('device-a'),
      chatSegmentPath('device-b'),
    ]);
    /* Read back through the port, which smudges: the *stored* blob at each of
     * these paths is a 127-byte LFS pointer, because `writeTreeObject` cleans
     * every tree it writes and `isLargeObjectPath` calls `.jpg` and `.pdf`
     * large-object families whatever they weigh. The real bytes are in this
     * store's `.git/lfs/objects/`, which no ref carries. See the blocker below. */
    expect(carried?.get(imagePath)).toEqual(imageBytes);
    expect(carried?.get(documentPath)).toEqual(documentBytes);

    /* Written once: the same bytes recorded again are the tree the ref already
     * holds, so content addressing costs one object per blob however many turns
     * reference it. */
    const again = await replayChatSegment({
      port: deviceA.port,
      filesystem: deviceA.checkout,
      deviceId: 'device-a',
      chatId: sharedChatId,
      syncChats: true,
      actorId,
      now,
      onto: withAttachments.head,
    });
    expect(again.status).toBe('upToDate');
    expect(again.head).toBe(withAttachments.head);

    /*
     * BLOCKER, and the refusal is *correct* — the defect is upstream of it.
     * `writeTreeObject` runs `cleanLargeObjects` on every tree this port
     * records, and `isLargeObjectPath` is extension-only, so a chat attachment
     * is pointerised on write however small it is: the tree carries a pointer
     * and the bytes stay in this host's private `.git/lfs/objects/`. `git lfs
     * ls-files` then names them because they really are pointers, and P20
     * rightly refuses to offer them to a remote that cannot serve the objects.
     * Both legs clean identically (`isomorphic-git-adapter` writeRevision), so
     * this is not a leg disagreement. Owner: whether record refs should be
     * cleaned at all, in `native-git-port.ts` / `lfs.ts`, outside this lane.
     * This row inverts when a chat attachment stops being pointerised.
     */
    await expect(
      deviceA.port.push({ remote: 'origin', refs: [{ name: chatRefName(sharedChatId), expected: base }] }),
    ).rejects.toMatchObject({ code: 'LFS_REMOTE_UNSUPPORTED' });
  }, 180_000);
});
