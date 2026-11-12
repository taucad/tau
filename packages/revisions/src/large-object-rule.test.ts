/**
 * The one pointer rule, read from the tree on both legs (D16, I5), and the
 * open that keeps a project an older build created on it.
 *
 * A browser project from before W22 DEF-W22-1 recorded Tau's ignore block and
 * no attributes file, its part files pointers by family alone. Its open on
 * this build writes nothing (I4); the next cut supplies `.gitattributes` with
 * Tau's block (A4, never merging into a file that exists), so it keeps every
 * unchanged part the pointer HEAD holds: the only change is the attributes
 * file itself, and no part's whole bytes become a Git blob a push would carry.
 */
import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryProvider } from '@taucad/filesystem/backend';

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { revisionTreeId } from '#git-tree-id.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { cleanLargeObjects, lfsPointerFor, readLfsPointer, withOwedAttributes } from '#lfs.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import type { RevisionPort } from '#revision-port.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';
import {
  generatedGitattributesContent,
  generatedGitattributesPath,
  generatedIgnoreContent,
  generatedIgnorePath,
} from '#workspace-config.js';

const author = { name: 'Tau', email: 'tau@example.com' };
const provenance = { source: 'user', actorId: 'ada', createdAt: Date.UTC(2026, 10, 7) } as const;
const encoder = new TextEncoder();
const part = encoder.encode('solid part\n'.repeat(256));
const { bytes: pointerBytes } = lfsPointerFor(part);
const ignore = generatedIgnoreContent(undefined);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/* HEAD as the older build recorded it: Tau's ignore block, no attributes file, the part a pointer. */
const olderHead = new ImmutableRevisionTree([
  [generatedIgnorePath, ignore],
  ['main.scad', 'import("models/part.step");\n'],
  ['models/part.step', pointerBytes],
]);

/* The checkout after the open: what HEAD holds, the part filled, and no attributes file (I4). */
const capturedOnOpen = new ImmutableRevisionTree([
  [generatedIgnorePath, ignore],
  ['main.scad', 'import("models/part.step");\n'],
  ['models/part.step', part],
]);

/* What the next cut records from it: the attributes file the tree owes (A4). */
const capturedAfterOpen = (attributes: string): ImmutableRevisionTree =>
  new ImmutableRevisionTree([
    [generatedGitattributesPath, attributes],
    ...capturedOnOpen.entries().map(({ path, content }) => [path, content] as const),
  ]);

/* HEAD plus the one file the migration adds: the only change the next cut may record. */
const expectedTree = new ImmutableRevisionTree([
  [generatedGitattributesPath, generatedGitattributesContent(undefined)],
  [generatedIgnorePath, ignore],
  ['main.scad', 'import("models/part.step");\n'],
  ['models/part.step', pointerBytes],
]);

/** Record the older build's HEAD verbatim, open the store as this build does, and cut the filled checkout. */
const migrate = async (
  open: () => RevisionPort,
  hasAttributes: () => Promise<boolean>,
): Promise<Readonly<{ head: string; next: string; treeId: string; port: RevisionPort }>> => {
  const older = open();
  await older.init({ author, createSetupFiles: false });
  const head = await older.writeRevision({
    parents: [],
    tree: olderHead,
    largeObjects: false,
    provenance,
    summary: { generated: 'Older build' },
  });
  await older.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(head.commitId) });
  const port = open();
  await port.init({ author });
  /* The open wrote nothing in the tracked tree; the cut supplies the file the tree owes. */
  expect(await hasAttributes()).toBe(false);
  const captured = withOwedAttributes(capturedOnOpen);
  if (captured === undefined) {
    throw new Error('A tree with Tau’s ignore block and no attributes file owes one.');
  }
  const next = await port.writeRevision({
    parents: [revisionId(head.commitId)],
    tree: captured,
    provenance,
    summary: { generated: 'First cut on this build' },
  });
  return {
    head: head.commitId,
    next: next.commitId,
    treeId: revisionTreeId(cleanLargeObjects(captured).tree, 'sha1'),
    port,
  };
};

describe('an older Tau project, opened on this build (DEF-W22-1, D16)', () => {
  it('keeps its parts pointers in the browser, the attributes file its only change', async () => {
    const filesystem = new MemoryProvider();
    await filesystem.writeFile(generatedIgnorePath, ignore);
    await filesystem.writeFile('main.scad', 'import("models/part.step");\n');
    await filesystem.mkdir('models', { recursive: true });
    await filesystem.writeFile('models/part.step', part);

    const { next, treeId, port } = await migrate(
      () => createIsomorphicGitRevisionPort({ filesystem }),
      async () => filesystem.exists(generatedGitattributesPath),
    );

    expect(await filesystem.readFile(generatedIgnorePath, 'utf8')).toBe(ignore);
    expect(treeId).toBe(revisionTreeId(expectedTree, 'sha1'));
    const record = await port.readRevision(revisionId(next));
    expect(record?.treeId).toBe(treeId);
  });

  it.runIf(gitToolchainOnPath)(
    'keeps its parts pointers on disk, the same tree, and stores no whole blob of them',
    async () => {
      const project = await mkdtemp(join(tmpdir(), 'tau-older-project-'));
      roots.push(project);
      await writeFile(join(project, generatedIgnorePath), ignore);
      await writeFile(join(project, 'main.scad'), 'import("models/part.step");\n');
      await mkdir(join(project, 'models'));
      await writeFile(join(project, 'models', 'part.step'), part);
      const git = (args: readonly string[]): string =>
        execFileSync('git', args, { cwd: project, encoding: 'utf8' }).trim();

      const { head, next, treeId } = await migrate(
        () => createNativeGitRevisionPort({ repositoryPath: project }),
        async () =>
          access(join(project, generatedGitattributesPath)).then(
            () => true,
            () => false,
          ),
      );

      expect(git(['rev-parse', `${next}^{tree}`])).toBe(treeId);
      expect(treeId).toBe(revisionTreeId(expectedTree, 'sha1'));
      expect(git(['diff', '--name-only', head, next])).toBe(generatedGitattributesPath);
      expect(git(['rev-parse', `${next}:models/part.step`])).toBe(git(['rev-parse', `${head}:models/part.step`]));
      const stored = encoder.encode(`${git(['cat-file', 'blob', `${next}:models/part.step`])}\n`);
      expect(readLfsPointer(stored)).toStrictEqual(lfsPointerFor(part).pointer);
      /* The part's whole bytes as a Git blob: what a push would carry if the cut had dropped the pointer. */
      const whole = git(['hash-object', '--no-filters', join('models', 'part.step')]);
      expect(() => git(['cat-file', '-e', whole])).toThrow();
    },
    120_000,
  );
});

describe('one rule on both legs (I5)', () => {
  it('records one tree for the same files whether or not the tree carries Tau’s block', async () => {
    const trees = [
      capturedAfterOpen(generatedGitattributesContent(undefined)),
      new ImmutableRevisionTree([
        [generatedGitattributesPath, '*.stl filter=lfs diff=lfs merge=lfs -text\n'],
        ['scan.stl', part],
        ['models/part.step', part],
      ]),
    ];
    const legs = [
      () => createIsomorphicGitRevisionPort({ filesystem: new MemoryProvider() }),
      ...(gitToolchainOnPath
        ? [
            async () => {
              const root = await mkdtemp(join(tmpdir(), 'tau-one-rule-'));
              roots.push(root);
              return createNativeGitRevisionPort({ repositoryPath: root });
            },
          ]
        : []),
    ];
    for (const tree of trees) {
      // oxlint-disable-next-line no-await-in-loop -- one tree at a time across the legs.
      const recorded = await Promise.all(
        legs.map(async (leg) => {
          const port = await leg();
          await port.init({ author, createSetupFiles: false });
          const receipt = await port.writeRevision({ parents: [], tree, provenance, summary: { generated: 'One' } });
          const record = await port.readRevision(revisionId(receipt.commitId));
          return record?.treeId;
        }),
      );
      expect(new Set(recorded).size).toBe(1);
      expect(recorded[0]).toBe(revisionTreeId(cleanLargeObjects(tree).tree, 'sha1'));
    }
  }, 120_000);
});

describe('an entry unchanged from its parent keeps its representation on both legs (rule 13, I5)', () => {
  const art = encoder.encode('layered art\n'.repeat(300));
  const fresh = encoder.encode('new art\n'.repeat(300));
  const scan = encoder.encode('scanned mesh\n'.repeat(300));
  const cases = [
    {
      name: 'a blob stays a blob after the attributes start naming it',
      parent: new ImmutableRevisionTree([
        ['main.scad', 'cube(1);\n'],
        ['art.psd', art],
      ]),
      next: new ImmutableRevisionTree([
        [generatedGitattributesPath, '*.psd filter=lfs diff=lfs merge=lfs -text\n'],
        ['main.scad', 'cube(1);\n'],
        ['art.psd', art],
        ['new.psd', fresh],
      ]),
      expected: new ImmutableRevisionTree([
        [generatedGitattributesPath, '*.psd filter=lfs diff=lfs merge=lfs -text\n'],
        ['main.scad', 'cube(1);\n'],
        ['art.psd', art],
        ['new.psd', lfsPointerFor(fresh).bytes],
      ]),
    },
    {
      name: 'a pointer stays a pointer after the attributes stop naming it',
      parent: new ImmutableRevisionTree([
        [generatedGitattributesPath, '*.stl filter=lfs diff=lfs merge=lfs -text\n'],
        ['scan.stl', lfsPointerFor(scan).bytes],
      ]),
      next: new ImmutableRevisionTree([
        ['scan.stl', scan],
        ['other.stl', fresh],
      ]),
      expected: new ImmutableRevisionTree([
        ['scan.stl', lfsPointerFor(scan).bytes],
        ['other.stl', fresh],
      ]),
    },
  ];
  const legs = [
    () => createIsomorphicGitRevisionPort({ filesystem: new MemoryProvider() }),
    ...(gitToolchainOnPath
      ? [
          async () => {
            const root = await mkdtemp(join(tmpdir(), 'tau-rule-13-'));
            roots.push(root);
            return createNativeGitRevisionPort({ repositoryPath: root });
          },
        ]
      : []),
  ];

  for (const { name, parent, next, expected } of cases) {
    it(
      name,
      async () => {
        const recorded = await Promise.all(
          legs.map(async (leg) => {
            const port = await leg();
            await port.init({ author, createSetupFiles: false });
            const first = await port.writeRevision({
              parents: [],
              tree: parent,
              largeObjects: false,
              provenance,
              summary: { generated: 'Parent' },
            });
            const receipt = await port.writeRevision({
              parents: [revisionId(first.commitId)],
              tree: next,
              provenance,
              summary: { generated: 'Next' },
            });
            const record = await port.readRevision(revisionId(receipt.commitId));
            return record?.treeId;
          }),
        );
        expect(new Set(recorded).size).toBe(1);
        expect(recorded[0]).toBe(revisionTreeId(expected, 'sha1'));
      },
      120_000,
    );
  }
});

describe('a merge keeps content either parent holds, in that parent’s representation, on both legs (rule 13, I5)', () => {
  it('records a plain blob from the second parent as the blob it was, under a newer `*.bin filter=lfs`', async () => {
    const theirs = encoder.encode('their binary\n'.repeat(300));
    const ours = encoder.encode('our binary\n'.repeat(300));
    const fresh = encoder.encode('fresh binary\n'.repeat(300));
    const attributes = '*.bin filter=lfs diff=lfs merge=lfs -text\n';
    const legs = [
      () => createIsomorphicGitRevisionPort({ filesystem: new MemoryProvider() }),
      ...(gitToolchainOnPath
        ? [
            async () => {
              const root = await mkdtemp(join(tmpdir(), 'tau-rule-13-merge-'));
              roots.push(root);
              return createNativeGitRevisionPort({ repositoryPath: root });
            },
          ]
        : []),
    ];

    const recorded = await Promise.all(
      legs.map(async (leg) => {
        const port = await leg();
        await port.init({ author, createSetupFiles: false });
        const write = async (tree: ImmutableRevisionTree, parents: readonly string[], largeObjects = true) => {
          const receipt = await port.writeRevision({
            parents: parents.map((parent) => revisionId(parent)),
            tree,
            largeObjects,
            provenance,
            summary: { generated: 'Merge leg' },
          });
          return receipt.commitId;
        };
        const base = await write(new ImmutableRevisionTree([['main.scad', 'cube(1);\n']]), []);
        const first = await write(
          new ImmutableRevisionTree([
            [generatedGitattributesPath, attributes],
            ['main.scad', 'cube(1);\n'],
            ['ours.bin', ours],
          ]),
          [base],
        );
        /* Recorded verbatim: the second line's file is a blob, as an older client or another tool left it. */
        const second = await write(
          new ImmutableRevisionTree([
            ['main.scad', 'cube(1);\n'],
            ['theirs.bin', theirs],
          ]),
          [base],
          false,
        );
        const merged = await write(
          new ImmutableRevisionTree([
            [generatedGitattributesPath, attributes],
            ['main.scad', 'cube(1);\n'],
            ['ours.bin', ours],
            ['theirs.bin', theirs],
            ['fresh.bin', fresh],
          ]),
          [first, second],
        );
        const record = await port.readRevision(revisionId(merged));
        return record?.treeId;
      }),
    );

    expect(new Set(recorded).size).toBe(1);
    expect(recorded[0]).toBe(
      revisionTreeId(
        new ImmutableRevisionTree([
          [generatedGitattributesPath, attributes],
          ['main.scad', 'cube(1);\n'],
          ['ours.bin', lfsPointerFor(ours).bytes],
          ['theirs.bin', theirs],
          ['fresh.bin', lfsPointerFor(fresh).bytes],
        ]),
        'sha1',
      ),
    );
  }, 120_000);
});
