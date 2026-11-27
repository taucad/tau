import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { canonicalJson } from '#graph.js';

/**
 * Reviews (FM-R13): `<Module>/reviews/<yyyy-mm-dd>-<slug>.md`, one new file per acknowledgement that a
 * change to a reviewed source keeps the model. A review is a note and a `sha256` block of
 * `<sha256>  <path>` lines (`sha256sum`'s format), and a source passes while any review records its
 * current hash. Each change adds its own file, so two independent acknowledgements never touch the
 * same text and merge without a driver.
 */

/** The line the guiding message asks the author to replace; a review that keeps it is refused. */
export const reviewPlaceholder = '<what changed, and why the model still holds or how it changed with it>';

const reviewName = /^\d{4}(?:-\d{2}){2}(?:-[\da-z]+)+\.md$/;
const hashLine = /^([\da-f]{64}) [ *](\S.*)$/;
const fence = /^```\s*(\S*)\s*$/;

type Review = {
  readonly name: string;
  /** Lines outside fences that are neither blank nor a heading. */
  readonly prose: readonly string[];
  /** The lines of its `text` fences: notes moved from a spec by `formal review-notes`. */
  readonly moved: readonly string[];
  readonly hashes: ReadonlyArray<readonly [file: string, sha256: string]>;
  readonly problems: readonly string[];
};

const parseReview = (name: string, text: string): Review => {
  const prose: string[] = [];
  const moved: string[] = [];
  const hashes: Array<readonly [string, string]> = [];
  const problems: string[] = [];
  let open: string | undefined;
  for (const [index, line] of text.split('\n').entries()) {
    const marker = fence.exec(line);
    if (marker) {
      open = open === undefined ? (marker[1] ?? '') : undefined;
      continue;
    }
    if (open === 'sha256') {
      const pin = hashLine.exec(line);
      if (pin) {
        hashes.push([pin[2] ?? '', pin[1] ?? '']);
      } else if (line.trim() !== '') {
        problems.push(`line ${index + 1} is not \`<sha256>  <path>\``);
      }
    } else if (open === 'text') {
      moved.push(line);
    } else if (open === undefined && line.trim() !== '' && !line.startsWith('#')) {
      prose.push(line);
    }
  }
  if (!reviewName.test(name)) {
    problems.push('name it <yyyy-mm-dd>-<slug>.md');
  }
  if (prose.length === 0 || prose.some((line) => line.includes(reviewPlaceholder))) {
    problems.push('write a note saying what changed and why the model still holds');
  }
  if (hashes.length === 0) {
    problems.push('records no source; fill its sha256 block with FORMAL_UPDATE=1');
  }
  return { name, prose, moved, hashes, problems };
};

const readReviews = (directory: string): Review[] =>
  existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => name.endsWith('.md'))
        .sort()
        .map((name) => parseReview(name, readFileSync(path.join(directory, name), 'utf8')))
    : [];

const reviewsOf = (manifestFile: string): string => path.join(path.dirname(manifestFile), 'reviews');

const byPath = ([left]: readonly [string, string], [right]: readonly [string, string]): number =>
  left < right ? -1 : 1;

const recordedPins = (reviews: readonly Review[]): Set<string> =>
  new Set(reviews.flatMap((review) => review.hashes.map(([file, sha256]) => `${sha256} ${file}`)));

/** A path from the enclosing Git checkout's root, so the message names the file to add wherever the test ran. */
const fromCheckout = (file: string): string => {
  for (let directory = path.dirname(file); ; directory = path.dirname(directory)) {
    if (existsSync(path.join(directory, '.git'))) {
      return path.relative(directory, file);
    }
    if (path.dirname(directory) === directory) {
      return file;
    }
  }
};

const sha256Block = (pins: ReadonlyArray<readonly [string, string]>): string[] => [
  '```sha256',
  ...pins.map(([file, sha256]) => `${sha256}  ${file}`),
  '```',
];

/** A review whose `sha256` block is empty, with that block filled; an absent block is appended. */
const fillReview = (text: string, pins: ReadonlyArray<readonly [string, string]>): string => {
  const block = sha256Block(pins).join('\n');
  const empty = /^```sha256[\t ]*\n```[\t ]*$/m;
  return empty.test(text) ? text.replace(empty, block) : `${text.trimEnd()}\n\n${block}\n`;
};

/**
 * Every reviewed source no review acknowledges, as one message that names the file to add and its
 * exact `sha256` block, and every malformed review. Under `update`, the sole review whose block is
 * empty (an author's note awaiting its hashes) records the unacknowledged sources; nothing else is
 * written, so the note stays the author's.
 *
 * @public
 */
export const checkReviewedSources = (
  manifestFile: string,
  reviewed: Readonly<Record<string, string>>,
  { update, today }: { readonly update: boolean; readonly today: string },
): string[] => {
  const directory = reviewsOf(manifestFile);
  const module = path.basename(path.dirname(manifestFile));
  let reviews = readReviews(directory);
  const unacknowledged = (): Array<readonly [string, string]> => {
    const recorded = recordedPins(reviews);
    return Object.entries(reviewed)
      .filter(([file, sha256]) => !recorded.has(`${sha256} ${file}`))
      .sort(byPath);
  };
  const pending = reviews.filter((review) => review.hashes.length === 0);
  const [only] = pending;
  if (update && pending.length === 1 && only !== undefined && unacknowledged().length > 0) {
    const file = path.join(directory, only.name);
    writeFileSync(file, fillReview(readFileSync(file, 'utf8'), unacknowledged()));
    reviews = readReviews(directory);
  }
  const problems = reviews.flatMap((review) =>
    review.problems.map((problem) => `${module}/reviews/${review.name}: ${problem}`),
  );
  const stale = unacknowledged();
  if (stale.length > 0) {
    problems.push(
      [
        `${module}: no review acknowledges the current text of ${stale.map(([file]) => file).join(', ')}.`,
        `Read ${module}.tla against the change, then add a new file ${fromCheckout(path.join(directory, `${today}-<your-change>.md`))} (never edit an earlier review):`,
        '',
        reviewPlaceholder,
        '',
        ...sha256Block(stale),
        '',
        'Or write the note with an empty sha256 block and fill it with FORMAL_UPDATE=1 (formal update).',
      ].join('\n'),
    );
  }
  return problems.sort();
};

const pointerPrefix = String.raw`\* Reviews of code changes against this model:`;

const sha256OfText = (text: string): string => createHash('sha256').update(text).digest('hex');

/** The `\*` run directly above `EXTENDS`: where it starts and ends, and its notes less the pointer line. */
const notesAboveExtends = (
  specFile: string,
  lines: readonly string[],
): { readonly start: number; readonly end: number; readonly notes: string[] } => {
  const end = lines.findIndex((line) => /^EXTENDS\b/.test(line));
  if (end === -1) {
    throw new Error(`${specFile} has no EXTENDS line`);
  }
  let start = end;
  while (start > 0 && lines[start - 1]?.startsWith(String.raw`\*`)) {
    start -= 1;
  }
  const notes = lines
    .slice(start, end)
    .filter((line) => !line.startsWith(pointerPrefix))
    .map((line) => line.replace(/^\\\* ?/, ''));
  return { start, end, notes };
};

/** `notes` less every leading block an earlier review already moved, however many times it repeats. */
const unmovedNotes = (notes: readonly string[], reviews: readonly Review[]): readonly string[] => {
  const held = reviews.find(
    (review) => review.moved.length > 0 && review.moved.every((line, index) => notes[index] === line),
  );
  return held === undefined ? notes : unmovedNotes(notes.slice(held.moved.length), reviews);
};

type LegacyManifest = Record<string, unknown> & {
  readonly sources?: Readonly<Record<string, string>>;
  readonly specs?: Readonly<Record<string, string>>;
};

/** The manifest without `sources`, its hash of the spec following the edit when it was current before it. */
const withoutSources = (
  manifest: LegacyManifest,
  name: string,
  edit: { readonly before: string; readonly after: string },
): LegacyManifest => {
  const { sources: _sources, ...rest } = manifest;
  const current = rest.specs?.[name] === sha256OfText(edit.before);
  return current ? { ...rest, specs: { ...rest.specs, [name]: sha256OfText(edit.after) } } : rest;
};

const movedReview = (
  module: string,
  notes: readonly string[],
  pins: ReadonlyArray<readonly [string, string]>,
): string =>
  [
    `Moved from the notes above \`EXTENDS\` in \`${module}.tla\` by \`formal review-notes\`.`,
    '',
    ...(notes.length > 0 ? ['```text', ...notes, '```', ''] : []),
    ...sha256Block(pins),
    '',
  ].join('\n');

/**
 * `formal review-notes <Module>.tla`: moves the `\*` notes directly above `EXTENDS` into a new review,
 * `<Module>/reviews/<date>-<slug>.md`, with the `sources` pins of `<Module>/drift.json` that no review
 * records yet, and leaves one pointer line in the spec. Notes an earlier review already holds, a prefix
 * kept by a conflict resolved to the old text, are not moved again, so it converts a late old-format
 * pin and is a no-op once nothing is left. The manifest's hash of the spec follows the edit when it was
 * current before it.
 *
 * @public
 */
export const migrateReviewNotes = (
  specFile: string,
  { slug, date }: { readonly slug: string; readonly date: string },
): { readonly review?: string; readonly notes: number; readonly sources: number } => {
  const module = path.basename(specFile, '.tla');
  const manifestFile = path.join(path.dirname(specFile), module, 'drift.json');
  const directory = reviewsOf(manifestFile);
  const reviews = readReviews(directory);
  const text = readFileSync(specFile, 'utf8');
  const lines = text.split('\n');
  const { start, end, notes: run } = notesAboveExtends(specFile, lines);
  const notes = unmovedNotes(run, reviews);
  const manifest = existsSync(manifestFile)
    ? (JSON.parse(readFileSync(manifestFile, 'utf8')) as LegacyManifest)
    : undefined;
  const recorded = recordedPins(reviews);
  const pins = Object.entries(manifest?.sources ?? {})
    .filter(([file, sha256]) => !recorded.has(`${sha256} ${file}`))
    .sort(byPath);
  const moves = notes.length > 0 || pins.length > 0;
  // A spec with a run of notes, or with pins to move, keeps one pointer line where the run was.
  const rewritten =
    moves || start < end
      ? [
          ...lines.slice(0, start),
          `${pointerPrefix} ${module}/reviews/ (formal verification policy rule 12).`,
          ...lines.slice(end),
        ].join('\n')
      : text;
  if (!moves && rewritten === text && manifest?.sources === undefined) {
    return { notes: 0, sources: 0 };
  }
  const review = moves ? path.join(directory, `${date}-${slug}.md`) : undefined;
  if (review !== undefined) {
    if (existsSync(review)) {
      throw new Error(`${review} exists; pass another --slug`);
    }
    mkdirSync(directory, { recursive: true });
    writeFileSync(review, movedReview(module, notes, pins));
  }
  writeFileSync(specFile, rewritten);
  if (manifest !== undefined) {
    const next = withoutSources(manifest, path.basename(specFile), { before: text, after: rewritten });
    writeFileSync(manifestFile, `${JSON.stringify(JSON.parse(canonicalJson(next)), undefined, 2)}\n`);
  }
  return { ...(review === undefined ? {} : { review }), notes: notes.length, sources: pins.length };
};
