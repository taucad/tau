import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { sweepTemporarySiblings } from '#apply-tree.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { lfsObjectPath, lfsPointerFor, readLfsPointer } from '#lfs.js';
import { createRevisionActors } from '#revision-effects.js';
import type { RevisionActors, RevisionFileSystem } from '#revision-effects.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/* What a kill stops: every call that changes a file. Reads go through untouched. */
const reads = new Set([
  'readFile',
  'readFileStream',
  'readdir',
  'readdirEntries',
  'readdirWithStats',
  'stat',
  'lstat',
  'exists',
  'getFileMode',
  'hashFiles',
  'observe',
  'dispose',
  'refresh',
]);

/*
 * A filesystem that dies on the `killAt`-th change after it is armed: that call
 * and every later one throw, as a closed tab would. Unarmed, nothing is counted.
 */
const killable = (filesystem: RevisionFileSystem) => {
  let armed: number | undefined;
  let changes = 0;
  const view = new Proxy(filesystem, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      const bound = (value as (...parameters: unknown[]) => unknown).bind(target);
      if (typeof property !== 'string' || reads.has(property)) {
        return bound;
      }
      return async (...parameters: unknown[]) => {
        if (armed !== undefined) {
          changes += 1;
          if (changes >= armed) {
            throw new Error(`killed at change ${String(changes)}`);
          }
        }
        return bound(...parameters);
      };
    },
  });
  return {
    view,
    arm: (killAt: number) => {
      armed = killAt;
      changes = 0;
    },
    changes: () => changes,
  };
};

/* One project on disk, its root reading and writing through `view`. */
const project = async (raw: NodeFsProvider, view: RevisionFileSystem): Promise<RevisionActors> => {
  const port = createIsomorphicGitRevisionPort({ filesystem: view });
  return createRevisionActors({ port, projectId: 'project-1', filesystem: async () => view });
};

/* A root past its start-up: the repository made, the generated files written and the first fill scan done. */
const quiet = async (actors: RevisionActors): Promise<void> => {
  await actors.readContent(undefined, 'main.scad');
  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
};

const authored = async (): Promise<NodeFsProvider> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-adoption-'));
  roots.push(root);
  const raw = new NodeFsProvider(root);
  await raw.writeFile('main.scad', 'import("models/part.step");\n');
  await raw.mkdir('models', { recursive: true });
  await raw.writeFile('models/part.step', part);
  return raw;
};

const part = encoder.encode('solid part\n'.repeat(64));
const { pointer, bytes: pointerBytes } = lfsPointerFor(part);

/* The adoption invariant (D9): the full file, or the pointer with the verified object in the store. */
const whole = async (raw: NodeFsProvider): Promise<'file' | 'pointer'> => {
  const content = await raw.readFile('models/part.step');
  if (readLfsPointer(content) === undefined) {
    expect(content).toStrictEqual(part);
    return 'file';
  }
  expect(content).toStrictEqual(pointerBytes);
  expect(await raw.readFile(`.git/${lfsObjectPath(pointer.oid)}`)).toStrictEqual(part);
  return 'pointer';
};

describe('adopting a large file (D9)', () => {
  it('stores the object, verifies it, and leaves only the pointer in the checkout', async () => {
    const raw = await authored();
    const actors = await project(raw, raw);
    expect(await actors.adoptLargeObjects(undefined)).toStrictEqual({ adopted: ['models/part.step'], left: [] });
    expect(await whole(raw)).toBe('pointer');
    expect(decoder.decode(await raw.readFile('main.scad'))).toBe('import("models/part.step");\n');
    /* Read through: the pointer reads as its object. */
    expect(await actors.readContent(undefined, 'models/part.step')).toStrictEqual({ outcome: 'bytes', data: part });
    /* Again: nothing is left to adopt. */
    expect(await actors.adoptLargeObjects(undefined)).toStrictEqual({ adopted: [], left: [] });
    await actors.settled();
  }, 30_000);

  it('adopts nothing the attributes do not track, and never a pointer', async () => {
    const raw = await authored();
    await raw.writeFile('notes.txt', 'x'.repeat(2 * 1024 * 1024));
    await raw.writeFile('models/other.step', pointerBytes);
    const actors = await project(raw, raw);
    expect(await actors.adoptLargeObjects(undefined)).toStrictEqual({ adopted: ['models/part.step'], left: [] });
    expect(decoder.decode(await raw.readFile('notes.txt'))).toHaveLength(2 * 1024 * 1024);
    expect(await raw.readFile('models/other.step')).toStrictEqual(pointerBytes);
    await actors.settled();
  }, 30_000);

  /* The W4 gate: a kill between every step leaves the full file, or the pointer with the verified object. */
  it('leaves the full file or the pointer with its object, whichever change it is killed at', async () => {
    const seen = new Set<'file' | 'pointer'>();
    let killAt = 1;
    for (; killAt <= 200; killAt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one project per kill point, in order.
      const { finished, outcome } = await adoptionKilledAt(killAt);
      seen.add(outcome);
      if (finished) {
        break;
      }
    }
    /* Every step was killed at least once, and both sides of the line were seen. */
    expect(killAt).toBeGreaterThan(3);
    expect(killAt).toBeLessThanOrEqual(200);
    expect(seen).toStrictEqual(new Set(['file', 'pointer']));
  }, 120_000);
});

/*
 * One adoption killed at its `killAt`-th change, recovered as an open recovers
 * a killed apply, checked against the invariant, and then finished by a
 * restarted root. `finished` is true when the kill came after the adoption ended.
 */
const adoptionKilledAt = async (
  killAt: number,
): Promise<Readonly<{ finished: boolean; outcome: 'file' | 'pointer' }>> => {
  const raw = await authored();
  const disk = killable(raw);
  const actors = await project(raw, disk.view);
  await quiet(actors);
  disk.arm(killAt);
  const finished = await actors.adoptLargeObjects(undefined).then(
    () => disk.changes() < killAt,
    () => false,
  );
  await actors.settled().catch(() => undefined);
  /* A backup whose original is gone goes back (I1). */
  await sweepTemporarySiblings(raw, (path) => path !== '.git' && !path.startsWith('.git/'));
  const outcome = await whole(raw);
  if (!finished) {
    const restarted = await project(raw, raw);
    await restarted.adoptLargeObjects(undefined);
    expect(await whole(raw)).toBe('pointer');
    await restarted.settled();
  }
  return { finished, outcome };
};
