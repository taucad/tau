import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DriftInputs } from '#drift.js';
import { driftManifestProblems, hashFiles, serializeManifest, sha256Of } from '#drift.js';
import { migrateReviewNotes, reviewPlaceholder } from '#reviews.js';

/* The guiding message names today's (UTC) file. */
const today = new Date().toISOString().slice(0, 10);
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const temporary = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'formal-reviews-'));
  roots.push(root);
  return root;
};

const write = (root: string, file: string, text: string): void => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
};

/* A git that ignores the machine's configuration and hooks, so the merge is git's own. */
const git = (root: string, ...args: string[]): { status: number; stdout: string } => {
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null', // eslint-disable-line @typescript-eslint/naming-convention -- environment variable
      GIT_CONFIG_NOSYSTEM: '1', // eslint-disable-line @typescript-eslint/naming-convention -- environment variable
      GIT_AUTHOR_NAME: 'formal', // eslint-disable-line @typescript-eslint/naming-convention -- environment variable
      GIT_AUTHOR_EMAIL: 'formal@example.invalid', // eslint-disable-line @typescript-eslint/naming-convention -- environment variable
      GIT_COMMITTER_NAME: 'formal', // eslint-disable-line @typescript-eslint/naming-convention -- environment variable
      GIT_COMMITTER_EMAIL: 'formal@example.invalid', // eslint-disable-line @typescript-eslint/naming-convention -- environment variable
    },
  });
  return { status: result.status ?? -1, stdout: result.stdout };
};

const commitAll = (root: string, message: string): void => {
  expect(git(root, 'add', '-A').status).toBe(0);
  expect(git(root, 'commit', '-q', '-m', message).status).toBe(0);
};

const sources = ['src/queue.ts', 'src/session.ts'] as const;
const manifestFile = (root: string): string => path.join(root, 'specs/Queue/drift.json');
const reviewsOf = (root: string): string => path.join(root, 'specs/Queue/reviews');

/** What an owner test passes: the model parts, and the sources a review must acknowledge. */
const inputs = (root: string): DriftInputs => ({
  alphabet: ['submit'],
  tables: {},
  specs: hashFiles(path.join(root, 'specs'), ['Queue.tla']),
  reviewed: hashFiles(root, sources),
});

const review = (
  root: string,
  { name, note, files }: { readonly name: string; readonly note: string; readonly files: readonly string[] },
): void => {
  const lines = files.map((file) => `${sha256Of(path.join(root, file))}  ${file}`);
  write(root, `specs/Queue/reviews/${name}`, `${note}\n\n\`\`\`sha256\n${lines.join('\n')}\n\`\`\`\n`);
};

const problems = (root: string, update = false): string[] =>
  driftManifestProblems(manifestFile(root), inputs(root), update);

/** A repository on `main` whose sources are reviewed and whose manifest is current. */
const reviewedRepository = (): string => {
  const root = temporary();
  expect(git(root, 'init', '-q', '-b', 'main').status).toBe(0);
  write(root, 'specs/Queue.tla', '---- MODULE Queue ----\nEXTENDS Naturals\n====\n');
  write(root, 'src/queue.ts', 'export const queue = 1;\n');
  write(root, 'src/session.ts', 'export const session = 1;\n');
  review(root, { name: '2026-11-01-baseline.md', note: 'The queue and session as first modelled.', files: sources });
  expect(problems(root, true)).toEqual([]);
  commitAll(root, 'baseline');
  return root;
};

const branch = (root: string, name: string, change: () => void): void => {
  expect(git(root, 'checkout', '-q', '-b', name, 'main').status).toBe(0);
  change();
  commitAll(root, name);
};

/** The guiding message names the file from the repository root. */
const expectedMessage = (root: string, stale: readonly string[]): string =>
  [
    `Queue: no review acknowledges the current text of ${stale.join(', ')}.`,
    `Read Queue.tla against the change, then add a new file specs/Queue/reviews/${today}-<your-change>.md (never edit an earlier review):`,
    '',
    reviewPlaceholder,
    '',
    '```sha256',
    ...stale.map((file) => `${sha256Of(path.join(root, file))}  ${file}`),
    '```',
    '',
    'Or write the note with an empty sha256 block and fill it with FORMAL_UPDATE=1 (formal update).',
  ].join('\n');

describe('reviewed sources', () => {
  it('should merge two acknowledgements of different sources without conflict and pass both', () => {
    const root = reviewedRepository();
    branch(root, 'queue-change', () => {
      write(root, 'src/queue.ts', 'export const queue = 2;\n');
      review(root, {
        name: '2026-11-27-queue-change.md',
        note: 'The queue constant moved; no action changes.',
        files: ['src/queue.ts'],
      });
      expect(problems(root)).toEqual([]);
    });
    branch(root, 'session-change', () => {
      write(root, 'src/session.ts', 'export const session = 2;\n');
      review(root, {
        name: '2026-11-27-session-change.md',
        note: 'The session constant moved; no action changes.',
        files: ['src/session.ts'],
      });
      expect(problems(root)).toEqual([]);
    });

    // Merge-ort, the merge GitHub's server runs, with no merge driver configured.
    expect(git(root, 'merge-tree', '--write-tree', 'queue-change', 'session-change').status).toBe(0);
    expect(git(root, 'checkout', '-q', 'queue-change').status).toBe(0);
    expect(git(root, 'merge', '-q', '--no-edit', 'session-change').status).toBe(0);
    expect(problems(root)).toEqual([]);
  });

  it('should fail with the file to add when a merge of two changes to one source has no review', () => {
    const root = reviewedRepository();
    write(root, 'src/queue.ts', 'export const queue = 1;\n\n\n\nexport const tail = 1;\n');
    review(root, { name: '2026-11-02-tail.md', note: 'A tail constant; no action changes.', files: ['src/queue.ts'] });
    commitAll(root, 'tail');
    branch(root, 'head-change', () => {
      write(root, 'src/queue.ts', 'export const queue = 2;\n\n\n\nexport const tail = 1;\n');
      review(root, {
        name: '2026-11-27-head-change.md',
        note: 'The head moved; no action changes.',
        files: ['src/queue.ts'],
      });
    });
    branch(root, 'tail-change', () => {
      write(root, 'src/queue.ts', 'export const queue = 1;\n\n\n\nexport const tail = 2;\n');
      review(root, {
        name: '2026-11-27-tail-change.md',
        note: 'The tail moved; no action changes.',
        files: ['src/queue.ts'],
      });
    });

    expect(git(root, 'checkout', '-q', 'head-change').status).toBe(0);
    expect(git(root, 'merge', '-q', '--no-edit', 'tail-change').status).toBe(0);
    expect(problems(root)).toEqual([expectedMessage(root, ['src/queue.ts'])]);
  });

  it('should fail with the file to add when the only review of a source records an older text', () => {
    const root = reviewedRepository();
    write(root, 'src/session.ts', 'export const session = 3;\n');

    expect(problems(root)).toEqual([expectedMessage(root, ['src/session.ts'])]);
    expect(problems(root, true)).toEqual([expectedMessage(root, ['src/session.ts'])]);
  });

  it('should fail with the file to add when there is no review at all', () => {
    const root = reviewedRepository();
    rmSync(reviewsOf(root), { recursive: true });

    expect(problems(root)).toEqual([expectedMessage(root, [...sources])]);
  });

  it('should refuse a review without a note, with the placeholder, with a bad name or a bad hash line', () => {
    const root = reviewedRepository();
    write(root, 'specs/Queue/reviews/2026-11-27-blank.md', '# Blank\n\n```sha256\n```\n');
    write(root, 'specs/Queue/reviews/2026-11-27-template.md', `${reviewPlaceholder}\n\n\`\`\`sha256\n\`\`\`\n`);
    write(root, 'specs/Queue/reviews/Notes.md', 'A note.\n\n```sha256\nnot-a-hash  src/queue.ts\n```\n');

    expect(problems(root)).toEqual([
      'Queue/reviews/2026-11-27-blank.md: records no source; fill its sha256 block with FORMAL_UPDATE=1',
      'Queue/reviews/2026-11-27-blank.md: write a note saying what changed and why the model still holds',
      'Queue/reviews/2026-11-27-template.md: records no source; fill its sha256 block with FORMAL_UPDATE=1',
      'Queue/reviews/2026-11-27-template.md: write a note saying what changed and why the model still holds',
      'Queue/reviews/Notes.md: line 4 is not `<sha256>  <path>`',
      'Queue/reviews/Notes.md: name it <yyyy-mm-dd>-<slug>.md',
      'Queue/reviews/Notes.md: records no source; fill its sha256 block with FORMAL_UPDATE=1',
    ]);
  });

  it('should fill the one pending review under update and leave the manifest without reviewed sources', () => {
    const root = reviewedRepository();
    write(root, 'src/queue.ts', 'export const queue = 4;\n');
    write(root, 'specs/Queue/reviews/2026-11-27-four.md', 'Four; no action changes.\n\n```sha256\n```\n');

    expect(problems(root, true)).toEqual([]);
    expect(readFileSync(path.join(reviewsOf(root), '2026-11-27-four.md'), 'utf8')).toBe(
      `Four; no action changes.\n\n\`\`\`sha256\n${sha256Of(path.join(root, 'src/queue.ts'))}  src/queue.ts\n\`\`\`\n`,
    );
    expect(problems(root)).toEqual([]);
    expect(JSON.parse(readFileSync(manifestFile(root), 'utf8'))).not.toHaveProperty('reviewed');
  });
});

describe('the old single-manifest pin', () => {
  it('should conflict when two changes to different sources each re-pin and append a note', () => {
    const root = temporary();
    expect(git(root, 'init', '-q', '-b', 'main').status).toBe(0);
    const pin = (queue: string, session: string, notes: readonly string[]): void => {
      write(
        root,
        'specs/Queue.tla',
        `---- MODULE Queue ----\n${notes.map((note) => `\\* ${note}\n`).join('')}EXTENDS Naturals\n====\n`,
      );
      write(
        root,
        'specs/Queue/drift.json',
        serializeManifest({
          alphabet: [],
          tables: {},
          sources: { 'src/queue.ts': queue, 'src/session.ts': session },
          specs: { 'Queue.tla': sha256Of(path.join(root, 'specs/Queue.tla')) },
        }),
      );
    };
    pin('a1', 'b1', ['First.']);
    commitAll(root, 'baseline');
    branch(root, 'queue-change', () => {
      pin('a2', 'b1', ['First.', 'Queue moved.']);
    });
    branch(root, 'session-change', () => {
      pin('a1', 'b2', ['First.', 'Session moved.']);
    });

    expect(git(root, 'merge-tree', '--write-tree', 'queue-change', 'session-change').status).toBe(1);
  });
});

describe('migrateReviewNotes', () => {
  const tla = [
    '---- MODULE Queue ----',
    '(* The queue. *)',
    String.raw`\* Presentation only; queue paths unchanged.`,
    String.raw`\* A wait moved; queue paths unchanged.`,
    'EXTENDS Naturals',
    '====',
    '',
  ].join('\n');

  const oldFormat = (): string => {
    const root = temporary();
    write(root, 'src/queue.ts', 'export const queue = 1;\n');
    write(root, 'src/session.ts', 'export const session = 1;\n');
    write(root, 'specs/Queue.tla', tla);
    write(
      root,
      'specs/Queue/drift.json',
      serializeManifest({
        alphabet: ['submit'],
        tables: {},
        sources: hashFiles(root, sources),
        specs: hashFiles(path.join(root, 'specs'), ['Queue.tla']),
      }),
    );
    return root;
  };

  it('should move the notes and the source pins into one review, and run again as a no-op', () => {
    const root = oldFormat();
    const pins = hashFiles(root, sources);

    expect(migrateReviewNotes(path.join(root, 'specs/Queue.tla'), { slug: 'notes', date: '2026-11-27' })).toEqual({
      review: path.join(reviewsOf(root), '2026-11-27-notes.md'),
      notes: 2,
      sources: 2,
    });
    expect(readFileSync(path.join(root, 'specs/Queue.tla'), 'utf8')).toBe(
      [
        '---- MODULE Queue ----',
        '(* The queue. *)',
        String.raw`\* Reviews of code changes against this model: Queue/reviews/ (formal verification policy rule 12).`,
        'EXTENDS Naturals',
        '====',
        '',
      ].join('\n'),
    );
    expect(readFileSync(path.join(reviewsOf(root), '2026-11-27-notes.md'), 'utf8')).toBe(
      [
        'Moved from the notes above `EXTENDS` in `Queue.tla` by `formal review-notes`.',
        '',
        '```text',
        'Presentation only; queue paths unchanged.',
        'A wait moved; queue paths unchanged.',
        '```',
        '',
        '```sha256',
        `${pins['src/queue.ts']}  src/queue.ts`,
        `${pins['src/session.ts']}  src/session.ts`,
        '```',
        '',
      ].join('\n'),
    );
    expect(problems(root)).toEqual([]);
    expect(migrateReviewNotes(path.join(root, 'specs/Queue.tla'), { slug: 'again', date: '2026-11-28' })).toEqual({
      notes: 0,
      sources: 0,
    });
    expect(readdirSync(reviewsOf(root))).toEqual(['2026-11-27-notes.md']);
  });

  it('should move only a late old-format note, whether the conflict kept the pointer or the old notes', () => {
    for (const resolution of ['pointer', 'old notes'] as const) {
      const root = oldFormat();
      const file = path.join(root, 'specs/Queue.tla');
      migrateReviewNotes(file, { slug: 'notes', date: '2026-11-27' });
      const migrated = readFileSync(file, 'utf8');
      const above = resolution === 'pointer' ? migrated.split('\nEXTENDS')[0] : tla.split('\nEXTENDS')[0];
      writeFileSync(
        file,
        `${above}\n\\* A late note; queue paths unchanged.\nEXTENDS${migrated.split('\nEXTENDS')[1]}`,
      );
      write(root, 'src/queue.ts', 'export const queue = 5;\n');

      expect(migrateReviewNotes(file, { slug: 'late', date: '2026-11-28' })).toEqual({
        review: path.join(reviewsOf(root), '2026-11-28-late.md'),
        notes: 1,
        sources: 0,
      });
      expect(readFileSync(file, 'utf8')).toBe(migrated);
      expect(readFileSync(path.join(reviewsOf(root), '2026-11-28-late.md'), 'utf8')).toContain(
        '```text\nA late note; queue paths unchanged.\n```\n\n```sha256\n```\n',
      );
      expect(problems(root, true)).toEqual([]);
      expect(readFileSync(path.join(reviewsOf(root), '2026-11-28-late.md'), 'utf8')).toContain(
        `${sha256Of(path.join(root, 'src/queue.ts'))}  src/queue.ts`,
      );
      expect(existsSync(path.join(reviewsOf(root), '2026-11-27-notes.md'))).toBe(true);
    }
  });
});
