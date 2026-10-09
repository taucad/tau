// Canvas review feedback: Figma-style comments pinned in a canvas, stored as immutable event files.
//
// Each comment, reply, resolve and reopen is one JSON file under `<canvas>/review/`, named by time and
// content hash and created with a create-only write. Files are never edited; a thread's status is
// folded from its events. `finishReview` commits new events to the canvas's Git repository (Tau Brain)
// by path, and `check` refuses a change to an event that is already committed.
//
// Design: docs/research/artifacts/canvas-review-feedback/api (runner-layer option).
//
// Usage (agents; people use the layer the canvas runner injects):
//   pnpm canvas:review list <canvas> [--open] [--json]
//   pnpm canvas:review reply <canvas> <thread> --body <text>
//   pnpm canvas:review resolve <canvas> <thread> --note <text> [--change <commit-or-path>]...
//   pnpm canvas:review reopen <canvas> <thread> --body <text>
//   pnpm canvas:review finish <canvas>
//   pnpm canvas:review check
// <canvas> is a directory relative to docs/research/artifacts, e.g. `programmable-workbench-charter/canvas`.
// Environment: TAU_REVIEW_AUTHOR names the agent in events it writes (default `agent`).
// Exit codes: 0 success, 1 refused (the code is printed), 2 usage.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export type ReviewAuthor = Readonly<{ kind: 'person' | 'agent'; name: string }>;

export type ReviewTarget =
  | Readonly<{ kind: 'review-id'; reviewId: string }>
  | Readonly<{ kind: 'role'; role: string; name: string }>
  | Readonly<{ kind: 'path'; path: string }>;

export type ReviewAnchor = Readonly<{
  target: ReviewTarget;
  offset: Readonly<{ x: number; y: number }>;
  excerpt: string;
}>;

export type ReviewContext = Readonly<{
  canvas: string;
  url: string;
  /** The nearest `data-review-scenario`, else `?scenario=`; absent when the canvas declares none. */
  scenario?: string;
  theme: string;
  viewport: Readonly<{ width: number; height: number }>;
  textScale: number;
  source: string;
}>;

type EventBase = Readonly<{ id: string; at: string; author: ReviewAuthor }>;
export type ReviewComment = EventBase &
  Readonly<{ type: 'comment'; body: string; anchor: ReviewAnchor; context: ReviewContext }>;
export type ReviewReply = EventBase & Readonly<{ type: 'reply'; thread: string; body: string }>;
export type ReviewResolve = EventBase &
  Readonly<{ type: 'resolve'; thread: string; note: string; changes: readonly string[] }>;
export type ReviewReopen = EventBase & Readonly<{ type: 'reopen'; thread: string; body: string }>;
export type ReviewEvent = ReviewComment | ReviewReply | ReviewResolve | ReviewReopen;

type Without<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type NewReviewEvent = Without<ReviewEvent, 'id' | 'at'>;
type UnnamedReviewEvent = Without<ReviewEvent, 'id'>;

export type ReviewThreadStatus = 'open' | 'resolved';
export type ReviewThread = Readonly<{
  id: string;
  status: ReviewThreadStatus;
  comment: ReviewComment;
  history: ReadonlyArray<ReviewReply | ReviewResolve | ReviewReopen>;
}>;

export type ReviewErrorCode = 'INVALID_EVENT' | 'THREAD_NOT_FOUND' | 'THREAD_RESOLVED' | 'READ_ONLY' | 'WRITE_FAILED';

type Refused = Readonly<{ status: 'refused'; code: ReviewErrorCode; message: string }>;
export type AppendReviewEventOutcome = Readonly<{ status: 'written'; event: ReviewEvent; path: string }> | Refused;
export type FinishReviewOutcome =
  | Readonly<{ status: 'committed'; commit: string; events: number }>
  | Readonly<{ status: 'unchanged' }>
  | Refused;

/** Where canvases live; tests pass their own. */
export const artifactsRoot = resolve(import.meta.dirname, '../../docs/research/artifacts');

type CanvasInput = Readonly<{ canvas: string; root?: string }>;

class ReviewError extends Error {
  public readonly code: ReviewErrorCode;
  public constructor(code: ReviewErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const refuse = (code: ReviewErrorCode, message: string): never => {
  throw new ReviewError(code, message);
};

const refusal = (error: unknown): Refused =>
  error instanceof ReviewError
    ? { status: 'refused', code: error.code, message: error.message }
    : { status: 'refused', code: 'WRITE_FAILED', message: error instanceof Error ? error.message : String(error) };

const canvasDirectory = ({ canvas, root = artifactsRoot }: CanvasInput): string => {
  // The default root lives in the optional Tau Brain checkout, so it can be absent.
  if (!existsSync(root)) {
    refuse('INVALID_EVENT', `\`${canvas}\` is not a canvas directory: ${root} does not exist.`);
  }
  const base = realpathSync(root);
  const directory = resolve(base, canvas);
  const inside = relative(base, directory);
  if (!canvas || inside.startsWith('..') || isAbsolute(inside) || !existsSync(directory)) {
    refuse('INVALID_EVENT', `\`${canvas}\` is not a canvas directory under ${base}.`);
  }
  return directory;
};

// --- validation -----------------------------------------------------------------------------------

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonEmpty = (value: unknown): value is string => isString(value) && value.trim().length > 0;
const fraction = (value: unknown): value is number => isNumber(value) && value >= 0 && value <= 1;

const invalid = (message: string): never => refuse('INVALID_EVENT', message);

const author = (value: unknown): ReviewAuthor =>
  isObject(value) && (value['kind'] === 'person' || value['kind'] === 'agent') && nonEmpty(value['name'])
    ? { kind: value['kind'], name: value['name'] }
    : invalid('`author` needs a `kind` of person or agent and a `name`.');

const target = (value: unknown): ReviewTarget => {
  if (isObject(value)) {
    if (value['kind'] === 'review-id' && nonEmpty(value['reviewId'])) {
      return { kind: 'review-id', reviewId: value['reviewId'] };
    }
    if (value['kind'] === 'role' && nonEmpty(value['role']) && nonEmpty(value['name'])) {
      return { kind: 'role', role: value['role'], name: value['name'] };
    }
    if (value['kind'] === 'path' && nonEmpty(value['path'])) {
      return { kind: 'path', path: value['path'] };
    }
  }
  return invalid('`anchor.target` must be a review-id, role or path target.');
};

const anchor = (value: unknown): ReviewAnchor => {
  if (!isObject(value) || !isObject(value['offset']) || !isString(value['excerpt'])) {
    return invalid('A comment needs an `anchor` with a target, an offset and an excerpt.');
  }
  const { x, y } = value['offset'];
  if (!fraction(x) || !fraction(y)) {
    return invalid('`anchor.offset` x and y are fractions of the element box, from 0 to 1.');
  }
  return { target: target(value['target']), offset: { x, y }, excerpt: value['excerpt'].slice(0, 120) };
};

const context = (value: unknown): ReviewContext => {
  const viewport = isObject(value) ? value['viewport'] : undefined;
  if (
    !isObject(value) ||
    !nonEmpty(value['canvas']) ||
    !isString(value['url']) ||
    !(value['scenario'] === undefined || value['scenario'] === null || isString(value['scenario'])) ||
    !isString(value['theme']) ||
    !isObject(viewport) ||
    !isNumber(viewport['width']) ||
    !isNumber(viewport['height']) ||
    !isNumber(value['textScale']) ||
    !isString(value['source'])
  ) {
    return invalid('A comment needs its `context`: canvas, url, scenario, theme, viewport, textScale and source.');
  }
  return {
    canvas: value['canvas'],
    url: value['url'],
    ...(nonEmpty(value['scenario']) ? { scenario: value['scenario'] } : {}),
    theme: value['theme'],
    viewport: { width: viewport['width'], height: viewport['height'] },
    textScale: value['textScale'],
    source: value['source'],
  };
};

const thread = (value: Json): string =>
  nonEmpty(value['thread']) ? value['thread'] : invalid('`thread` names the comment this event answers.');

/** Checks a new event and drops any field the design does not name, so stored files stay canonical. */
export const parseNewReviewEvent = (value: unknown): NewReviewEvent => {
  if (!isObject(value)) {
    return invalid('An event is a JSON object.');
  }
  const by = author(value['author']);
  switch (value['type']) {
    case 'comment': {
      return nonEmpty(value['body'])
        ? {
            type: 'comment',
            author: by,
            body: value['body'],
            anchor: anchor(value['anchor']),
            context: context(value['context']),
          }
        : invalid('A comment needs a body.');
    }
    case 'reply': {
      return nonEmpty(value['body'])
        ? { type: 'reply', author: by, thread: thread(value), body: value['body'] }
        : invalid('A reply needs a body.');
    }
    case 'resolve': {
      const changes = value['changes'] ?? [];
      return isString(value['note']) && Array.isArray(changes) && changes.every((change) => nonEmpty(change))
        ? { type: 'resolve', author: by, thread: thread(value), note: value['note'], changes }
        : invalid('A resolve needs a `note` and `changes` as a list of commits or paths.');
    }
    case 'reopen': {
      return isString(value['body'])
        ? { type: 'reopen', author: by, thread: thread(value), body: value['body'] }
        : invalid('A reopen needs a `body`.');
    }
    default: {
      return invalid('`type` is one of comment, reply, resolve or reopen.');
    }
  }
};

// --- storage and fold -----------------------------------------------------------------------------

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonical(item)).join(',')}]`;
  }
  if (isObject(value)) {
    const keys = Object.keys(value).toSorted();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

/** The first 16 hex characters of the SHA-256 of the canonical event without `id`. */
export const reviewEventId = (event: UnnamedReviewEvent): string =>
  createHash('sha256').update(canonical(event)).digest('hex').slice(0, 16);

const byTime = (left: ReviewEvent, right: ReviewEvent): number =>
  left.at === right.at ? left.id.localeCompare(right.id) : left.at.localeCompare(right.at);

/** Every stored event, oldest first. A file that does not parse is skipped, not fatal. */
export const readReviewEvents = (input: CanvasInput): readonly ReviewEvent[] => {
  const directory = join(canvasDirectory(input), 'review');
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      try {
        const stored: unknown = JSON.parse(readFileSync(join(directory, file), 'utf8'));
        const id = isObject(stored) ? stored['id'] : undefined;
        const at = isObject(stored) ? stored['at'] : undefined;
        if (!nonEmpty(id) || !nonEmpty(at)) {
          return [];
        }
        const event: ReviewEvent = { ...parseNewReviewEvent(stored), id, at };
        return [event];
      } catch {
        return [];
      }
    })
    .toSorted(byTime);
};

type MutableThread = {
  id: string;
  status: ReviewThreadStatus;
  comment: ReviewComment;
  history: Array<ReviewReply | ReviewResolve | ReviewReopen>;
};

/** Folds events into threads: a resolve closes a thread, a reopen opens it again. */
export const foldReviewThreads = (events: readonly ReviewEvent[]): readonly ReviewThread[] => {
  const threads = new Map<string, MutableThread>();
  for (const event of events.toSorted(byTime)) {
    if (event.type === 'comment') {
      threads.set(event.id, { id: event.id, status: 'open', comment: event, history: [] });
      continue;
    }
    const current = threads.get(event.thread);
    if (current) {
      current.history.push(event);
      if (event.type !== 'reply') {
        current.status = event.type === 'resolve' ? 'resolved' : 'open';
      }
    }
  }
  return [...threads.values()];
};

export const readReviewThreads = async (
  input: CanvasInput & Readonly<{ status?: ReviewThreadStatus }>,
): Promise<readonly ReviewThread[]> =>
  foldReviewThreads(readReviewEvents(input)).filter((item) => !input.status || item.status === input.status);

/** Creates the event file with a create-only write. Never overwrites; never commits. */
export const appendReviewEvent = async (
  input: CanvasInput & Readonly<{ event: unknown; now?: Date }>,
): Promise<AppendReviewEventOutcome> => {
  try {
    const directory = canvasDirectory(input);
    const event = parseNewReviewEvent(input.event);
    if (event.type !== 'comment') {
      const existing = foldReviewThreads(readReviewEvents(input)).find((item) => item.id === event.thread);
      if (!existing) {
        refuse('THREAD_NOT_FOUND', `No thread ${event.thread} in ${input.canvas}.`);
      } else if (event.type === 'resolve' && existing.status === 'resolved') {
        const last = existing.history.findLast((item) => item.type === 'resolve');
        refuse(
          'THREAD_RESOLVED',
          `Thread ${event.thread} was resolved at ${last?.at ?? 'an earlier time'} by ${last?.author.name ?? 'someone'}. Reply, or reopen it first.`,
        );
      }
    }
    const at = (input.now ?? new Date()).toISOString();
    const stored: UnnamedReviewEvent = { ...event, at };
    const written: ReviewEvent = { id: reviewEventId(stored), ...stored };
    mkdirSync(join(directory, 'review'), { recursive: true });
    const path = join(directory, 'review', `${at.replaceAll(':', '-')}-${written.id}.json`);
    writeFileSync(path, `${JSON.stringify(written, undefined, 2)}\n`, { flag: 'wx' });
    return { status: 'written', event: written, path: relative(realpathSync(input.root ?? artifactsRoot), path) };
  } catch (error) {
    return refusal(error);
  }
};

// --- Git ------------------------------------------------------------------------------------------

// Unbounded: `status` over Tau Brain lists megabytes of untracked research artifacts, past the 1 MiB default.
const gitRaw = (cwd: string, ...arguments_: string[]): string =>
  execFileSync('git', arguments_, { cwd, encoding: 'utf8', maxBuffer: Infinity, stdio: ['ignore', 'pipe', 'pipe'] });
const git = (cwd: string, ...arguments_: string[]): string => gitRaw(cwd, ...arguments_).trim();

const reviewFile = /(?:^|\/)review\/[^/]+\.json$/;

/** Porcelain entries under `directory`, as [status, path relative to the repository root]. */
const changes = (repository: string, directory: string): ReadonlyArray<readonly [string, string]> =>
  // Untrimmed: the first entry's status can start with a space.
  gitRaw(repository, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', directory)
    .split('\0')
    .filter(Boolean)
    .map((entry) => [entry.slice(0, 2), entry.slice(3)] as const)
    .filter(([, path]) => reviewFile.test(path));

const changedMessage = (paths: readonly string[]): string =>
  `Committed review events are immutable, but ${paths.join(', ')} changed. Restore with \`git restore -- <path>\` and add a new event instead.`;

const repositoryOf = (directory: string): string | undefined => {
  try {
    return git(directory, 'rev-parse', '--show-toplevel');
  } catch {
    return undefined;
  }
};

/** The reviewer's "Finish review": one commit, by path, of every new event under `<canvas>/review/`. */
export const finishReview = async (input: CanvasInput): Promise<FinishReviewOutcome> => {
  try {
    const directory = join(canvasDirectory(input), 'review');
    if (!existsSync(directory)) {
      return { status: 'unchanged' };
    }
    const repository =
      repositoryOf(directory) ??
      refuse('READ_ONLY', `${input.canvas} is not inside a Git repository, so its review cannot be committed.`);
    const entries = changes(repository, directory);
    const edited = entries.filter(([status]) => status !== '??').map(([, path]) => path);
    if (edited.length > 0) {
      refuse('INVALID_EVENT', changedMessage(edited));
    }
    const added = entries.map(([, path]) => path);
    if (added.length === 0) {
      return { status: 'unchanged' };
    }
    git(repository, 'add', '--', ...added);
    // By path: whatever else is staged in the shared checkout stays out of this commit.
    git(
      repository,
      'commit',
      '--quiet',
      '-m',
      `docs(research): Record review feedback on ${input.canvas}`,
      '-m',
      `${added.length} review ${added.length === 1 ? 'event' : 'events'} from the canvas review layer.`,
      '--',
      ...added,
    );
    return { status: 'committed', commit: git(repository, 'rev-parse', 'HEAD'), events: added.length };
  } catch (error) {
    return refusal(error);
  }
};

/** Committed review events that were edited or deleted, relative to the repository holding `root`. */
export const changedReviewEvents = (root = artifactsRoot): readonly string[] => {
  if (!existsSync(root)) {
    return [];
  }
  const directory = realpathSync(root);
  const repository = repositoryOf(directory);
  return repository
    ? changes(repository, directory)
        .filter(([status]) => status !== '??')
        .map(([, path]) => path)
    : [];
};

// --- CLI ------------------------------------------------------------------------------------------

const flag = (arguments_: readonly string[], name: string): string | undefined => {
  const index = arguments_.indexOf(name);
  return index === -1 ? undefined : arguments_[index + 1];
};
const flags = (arguments_: readonly string[], name: string): string[] =>
  arguments_.flatMap((value, index) => (arguments_[index - 1] === name ? [value] : []));

const describeTarget = (value: ReviewTarget): string => {
  if (value.kind === 'review-id') {
    return `[data-review-id=${value.reviewId}]`;
  }
  return value.kind === 'role' ? `${value.role} "${value.name}"` : value.path;
};

const describeEvent = (event: ReviewReply | ReviewResolve | ReviewReopen): string => {
  if (event.type === 'resolve') {
    const changed = event.changes.length > 0 ? ` (${event.changes.join(', ')})` : '';
    return `   ✓ resolved by ${event.author.name} ${event.at}: ${event.note}${changed}`;
  }
  return `   ${event.type === 'reply' ? '↳' : '↺ reopened:'} ${event.author.name} ${event.at}: ${event.body}`;
};

const formatThread = (item: ReviewThread, index: number): string => {
  const { comment } = item;
  const { context: where } = comment;
  return [
    `#${index + 1} ${item.id} [${item.status}] ${comment.author.name} ${comment.at}`,
    `   where: ${describeTarget(comment.anchor.target)} — "${comment.anchor.excerpt}"`,
    `   scenario: ${where.scenario ?? '(none)'} · ${where.theme} · ${where.viewport.width}×${where.viewport.height} · text ×${where.textScale} · ${where.url}`,
    ...comment.body.split('\n').map((line) => `   > ${line}`),
    ...item.history.map((event) => describeEvent(event)),
  ].join('\n');
};

const report = (outcome: AppendReviewEventOutcome | FinishReviewOutcome): number => {
  if (outcome.status === 'refused') {
    console.error(`${outcome.code}: ${outcome.message}`);
    return 1;
  }
  if (outcome.status === 'written') {
    console.log(`${outcome.event.type} ${outcome.event.id} → ${outcome.path}`);
  } else {
    console.log(
      outcome.status === 'committed'
        ? `committed ${outcome.events} events as ${outcome.commit}`
        : 'nothing new to commit',
    );
  }
  return 0;
};

const list = async (canvas: string, arguments_: readonly string[]): Promise<number> => {
  try {
    const threads = await readReviewThreads({ canvas });
    const shown = arguments_.includes('--open') ? threads.filter((item) => item.status === 'open') : threads;
    if (arguments_.includes('--json')) {
      console.log(JSON.stringify(shown, undefined, 2));
    } else {
      console.log(shown.map((item) => formatThread(item, threads.indexOf(item))).join('\n\n') || 'no threads');
    }
    return 0;
  } catch (error) {
    return report(refusal(error));
  }
};

export const main = async (arguments_: readonly string[]): Promise<number> => {
  const [command, canvas = '', threadId = ''] = arguments_;
  const agent: ReviewAuthor = { kind: 'agent', name: process.env['TAU_REVIEW_AUTHOR'] ?? 'agent' };
  switch (command) {
    case 'list': {
      return list(canvas, arguments_);
    }
    case 'reply':
    case 'reopen': {
      const body = flag(arguments_, '--body');
      return report(
        await appendReviewEvent({ canvas, event: { type: command, author: agent, thread: threadId, body } }),
      );
    }
    case 'resolve': {
      const note = flag(arguments_, '--note');
      const changed = flags(arguments_, '--change');
      return report(
        await appendReviewEvent({
          canvas,
          event: { type: 'resolve', author: agent, thread: threadId, note, changes: changed },
        }),
      );
    }
    case 'finish': {
      return report(await finishReview({ canvas }));
    }
    case 'check': {
      const changed = changedReviewEvents();
      if (changed.length > 0) {
        console.error(changedMessage(changed));
        return 1;
      }
      return 0;
    }
    default: {
      console.error('usage: canvas-review.ts list|reply|resolve|reopen|finish <canvas> [thread] [flags] | check');
      return 2;
    }
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
