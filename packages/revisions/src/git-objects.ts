/* eslint-disable import-x/no-extraneous-dependencies -- the package import map resolves `#*.js` to this package's own source files. */
/**
 * Git commit encoder and decoder shared by every adapter.
 *
 * Jujutsu's exact commit header order (`jj:conflict-labels`, then `jj:trees`,
 * then `change-id`, all after `committer`) is the one qualified against the
 * pinned Jujutsu binary by the dual-target revision-algebra spike. A revision
 * id is the id this module computes; nothing derives an identity any other way.
 *
 * The blob, tree and pack codec that used to live here is gone: `isomorphic-git`
 * writes those objects in the page and `git` writes them on a disk host, and
 * both produce the same bytes. Only the commit survives, because neither engine
 * can carry Tau's extra headers — `isomorphic-git`'s `CommitObject` has fields
 * for `tree`, `parent`, `author`, `committer`, `message` and `gpgsig` and
 * nothing else, and `git commit-tree` takes no arbitrary header either. Both
 * hosts therefore write the commit produced here as a raw object.
 */

/* oxlint-disable no-bitwise -- Jujutsu's change-id rendering packs and unpacks nibbles. */

import { assertObjectFormat, bytesToHex, concatBytes, digest, objectIdByteLength } from '#object-hash.js';
import type { ObjectFormat } from '#object-hash.js';

/** Git object kinds Tau writes. @public */
export type GitObjectType = 'blob' | 'tree' | 'commit';

/** Stable failure categories emitted by the Git commit codec. @public */
export type GitObjectErrorCode =
  | 'INVALID_OBJECT_FORMAT'
  | 'INVALID_OBJECT_TYPE'
  | 'INVALID_OBJECT_ID'
  | 'INVALID_COMMIT';

/** Typed Git commit codec failure. @public */
export class GitObjectError extends Error {
  public readonly code: GitObjectErrorCode;

  /**
   * Create a stable codec failure.
   *
   * @param code - Machine-readable failure category.
   * @param message - Safe diagnostic without object payloads.
   * @param options - Optional cause.
   */
  public constructor(code: GitObjectErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GitObjectError';
    this.code = code;
  }
}

/** One encoded Git object and the identity its bytes hash to. @public */
export type EncodedGitObject = Readonly<{
  type: GitObjectType;
  objectFormat: ObjectFormat;
  /** Lowercase hexadecimal object id. */
  id: string;
  /** Object payload without the `<type> <length>\0` frame. */
  body: Uint8Array<ArrayBuffer>;
  /** Loose-object bytes, exactly what Git hashes. */
  framed: Uint8Array<ArrayBuffer>;
}>;

/** Git author or committer identity and time. @public */
export type GitSignature = Readonly<{
  name: string;
  email: string;
  /** Seconds since the Unix epoch. */
  seconds: number;
  /** Timezone offset east of UTC, in minutes. */
  offsetMinutes: number;
}>;

/** Everything a Tau commit object carries. @public */
export type CommitInput = Readonly<{
  objectFormat: ObjectFormat;
  tree: string;
  parents: readonly string[];
  author: GitSignature;
  committer: GitSignature;
  message: string;
  /** Jujutsu change id, 16 raw bytes. Every revision carries one from creation. */
  changeId: Uint8Array<ArrayBuffer>;
  /** Conflicted tree ids in Jujutsu's add/remove order; odd count, at least three. */
  conflictedTrees?: readonly string[];
  /** Conflict term labels in the same order as `conflictedTrees`. */
  conflictLabels?: readonly string[];
}>;

/** A commit object read back from its bytes. @public */
export type DecodedCommit = Readonly<{
  tree: string;
  parents: readonly string[];
  author: GitSignature;
  committer: GitSignature;
  message: string;
  /** Rendered Jujutsu change id, or `undefined` when the commit predates Tau. */
  changeId: string | undefined;
  conflictedTrees: readonly string[] | undefined;
  conflictLabels: readonly string[] | undefined;
}>;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const changeIdAlphabet = 'zyxwvutsrqponmlk';

const assertFormat = (format: ObjectFormat): ObjectFormat => {
  try {
    return assertObjectFormat(format);
  } catch (error) {
    throw new GitObjectError('INVALID_OBJECT_FORMAT', 'Unsupported Git object format.', { cause: error });
  }
};

const objectTypes = new Set<string>(['blob', 'tree', 'commit']);

const assertType = (type: GitObjectType): GitObjectType => {
  if (!objectTypes.has(type)) {
    throw new GitObjectError('INVALID_OBJECT_TYPE', 'Unsupported Git object type.');
  }
  return type;
};

const assertObjectId = (format: ObjectFormat, value: string): string => {
  if (value.length !== objectIdByteLength(format) * 2 || !/^[\da-f]+$/u.test(value)) {
    throw new GitObjectError('INVALID_OBJECT_ID', `Invalid ${format} Git object id.`);
  }
  return value;
};

/**
 * Frame an object body the way Git hashes it.
 *
 * @param type - Object kind.
 * @param body - Object payload.
 * @returns `<type> <length>\0<body>`.
 * @public
 */
export const frameObject = (type: GitObjectType, body: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
  concatBytes(textEncoder.encode(`${assertType(type)} ${body.length}\0`), body);

/**
 * Encode one Git object and compute its identity.
 *
 * @param objectFormat - Recorded repository object format.
 * @param type - Object kind.
 * @param body - Object payload.
 * @returns The object with its framed bytes and hexadecimal id.
 * @public
 */
export const encodeObject = (
  objectFormat: ObjectFormat,
  type: GitObjectType,
  body: Uint8Array<ArrayBuffer>,
): EncodedGitObject => {
  assertFormat(objectFormat);
  const owned = new Uint8Array(new ArrayBuffer(body.length));
  owned.set(body);
  const framed = frameObject(type, owned);
  return Object.freeze({
    type: assertType(type),
    objectFormat,
    id: bytesToHex(digest(objectFormat, framed)),
    body: owned,
    framed,
  });
};

const encodeSignature = (signature: GitSignature): Uint8Array<ArrayBuffer> => {
  if (!Number.isSafeInteger(signature.seconds) || !Number.isInteger(signature.offsetMinutes)) {
    throw new GitObjectError('INVALID_COMMIT', 'Invalid Git signature time.');
  }
  if (Math.abs(signature.offsetMinutes) > 23 * 60 + 59) {
    throw new GitObjectError('INVALID_COMMIT', 'Invalid Git timezone offset.');
  }
  if ([signature.name, signature.email].some((part) => /[\n<>]/u.test(part))) {
    throw new GitObjectError('INVALID_COMMIT', 'Invalid Git signature identity.');
  }
  const absolute = Math.abs(signature.offsetMinutes);
  const zone = `${signature.offsetMinutes < 0 ? '-' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}${String(absolute % 60).padStart(2, '0')}`;
  // Jujutsu writes this sentinel rather than an empty identity component.
  const name = signature.name === '' ? 'JJ_EMPTY_STRING' : signature.name;
  const email = signature.email === '' ? 'JJ_EMPTY_STRING' : signature.email;
  return textEncoder.encode(`${name} <${email}> ${signature.seconds} ${zone}`);
};

const parseSignature = (value: string): GitSignature => {
  const match =
    /^(?<name>.*) <(?<email>[^<>]*)> (?<seconds>-?\d+) (?<sign>[+-])(?<hours>\d{2})(?<minutes>\d{2})$/u.exec(value);
  if (match?.groups === undefined) {
    throw new GitObjectError('INVALID_COMMIT', 'Invalid Git signature line.');
  }
  const { name, email, seconds, sign, hours, minutes } = match.groups;
  const offsetMinutes = (Number(hours) * 60 + Number(minutes)) * (sign === '-' ? -1 : 1);
  return {
    name: name === 'JJ_EMPTY_STRING' ? '' : name!,
    email: email === 'JJ_EMPTY_STRING' ? '' : email!,
    seconds: Number(seconds),
    offsetMinutes,
  };
};

/**
 * Render 16 raw change-id bytes the way Jujutsu writes and displays them.
 *
 * @param changeId - The 16 raw bytes.
 * @returns The 32-character reverse-hex rendering.
 * @public
 */
export const renderChangeId = (changeId: Uint8Array<ArrayBuffer>): string => {
  if (changeId.length !== 16) {
    throw new GitObjectError('INVALID_COMMIT', 'A Jujutsu change id is 16 bytes.');
  }
  let rendered = '';
  for (const byte of changeId) {
    rendered += changeIdAlphabet[byte >>> 4]! + changeIdAlphabet[byte & 0x0f]!;
  }
  return rendered;
};

/**
 * Parse a rendered Jujutsu change id back into its 16 raw bytes.
 *
 * @param rendered - The 32-character reverse-hex rendering.
 * @returns The 16 raw bytes.
 * @public
 */
export const parseChangeId = (rendered: string): Uint8Array<ArrayBuffer> => {
  if (rendered.length !== 32 || ![...rendered].every((character) => changeIdAlphabet.includes(character))) {
    throw new GitObjectError('INVALID_COMMIT', 'Invalid rendered Jujutsu change id.');
  }
  const bytes = new Uint8Array(new ArrayBuffer(16));
  for (let index = 0; index < 16; index += 1) {
    bytes[index] =
      (changeIdAlphabet.indexOf(rendered[index * 2]!) << 4) | changeIdAlphabet.indexOf(rendered[index * 2 + 1]!);
  }
  return bytes;
};

/**
 * Encode one commit header, continuing embedded newlines with a leading space.
 *
 * @param name - Header name.
 * @param value - Header value bytes.
 * @returns The encoded header line or lines.
 */
const encodeHeader = (name: string, value: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  if (value.includes(0)) {
    throw new GitObjectError('INVALID_COMMIT', 'A Git header cannot contain NUL.');
  }
  const parts: Array<Uint8Array<ArrayBuffer>> = [textEncoder.encode(`${name} `)];
  for (const [index, byte] of value.entries()) {
    parts.push(Uint8Array.of(byte));
    if (byte === 0x0a && index + 1 < value.length) {
      parts.push(Uint8Array.of(0x20));
    }
  }
  if (value.at(-1) !== 0x0a) {
    parts.push(Uint8Array.of(0x0a));
  }
  return concatBytes(...parts);
};

/**
 * Encode one commit object in Jujutsu's exact header order.
 *
 * @param input - Tree, parents, signatures, message and Tau's mandatory headers.
 * @returns The commit object; its id is the revision id.
 * @public
 */
export const encodeCommit = (input: CommitInput): EncodedGitObject => {
  assertFormat(input.objectFormat);
  const parts: Array<Uint8Array<ArrayBuffer>> = [
    encodeHeader('tree', textEncoder.encode(assertObjectId(input.objectFormat, input.tree))),
    ...input.parents.map((parent) =>
      encodeHeader('parent', textEncoder.encode(assertObjectId(input.objectFormat, parent))),
    ),
    encodeHeader('author', encodeSignature(input.author)),
    encodeHeader('committer', encodeSignature(input.committer)),
  ];
  if (input.conflictLabels !== undefined) {
    if (
      input.conflictLabels.length < 3 ||
      input.conflictLabels.length % 2 === 0 ||
      input.conflictLabels.some((label) => label.includes('\n'))
    ) {
      throw new GitObjectError('INVALID_COMMIT', 'Invalid jj:conflict-labels values.');
    }
    parts.push(encodeHeader('jj:conflict-labels', textEncoder.encode(`${input.conflictLabels.join('\n')}\n`)));
  }
  if (input.conflictedTrees !== undefined) {
    if (input.conflictedTrees.length < 3 || input.conflictedTrees.length % 2 === 0) {
      throw new GitObjectError('INVALID_COMMIT', 'Invalid jj:trees values.');
    }
    for (const tree of input.conflictedTrees) {
      assertObjectId(input.objectFormat, tree);
    }
    parts.push(encodeHeader('jj:trees', textEncoder.encode(input.conflictedTrees.join(' '))));
  }
  parts.push(encodeHeader('change-id', textEncoder.encode(renderChangeId(input.changeId))));
  parts.push(Uint8Array.of(0x0a), textEncoder.encode(input.message));
  return encodeObject(input.objectFormat, 'commit', concatBytes(...parts));
};

/**
 * Decode one commit object body.
 *
 * @param body - Commit payload without the loose-object frame.
 * @returns Every header this package writes, plus the message.
 * @public
 */
export const decodeCommit = (body: Uint8Array<ArrayBuffer>): DecodedCommit => {
  const text = textDecoder.decode(body);
  const separator = text.indexOf('\n\n');
  if (separator === -1) {
    throw new GitObjectError('INVALID_COMMIT', 'Commit object has no message separator.');
  }
  const headers = new Map<string, string[]>();
  let name = '';
  for (const line of text.slice(0, separator).split('\n')) {
    if (line.startsWith(' ')) {
      const existing = headers.get(name);
      if (existing === undefined || existing.length === 0) {
        throw new GitObjectError('INVALID_COMMIT', 'Commit continuation line has no header.');
      }
      existing[existing.length - 1] += `\n${line.slice(1)}`;
      continue;
    }
    const space = line.indexOf(' ');
    if (space === -1) {
      throw new GitObjectError('INVALID_COMMIT', 'Commit header line is malformed.');
    }
    name = line.slice(0, space);
    const values = headers.get(name) ?? [];
    values.push(line.slice(space + 1));
    headers.set(name, values);
  }
  const tree = headers.get('tree')?.[0];
  const author = headers.get('author')?.[0];
  const committer = headers.get('committer')?.[0];
  if (tree === undefined || author === undefined || committer === undefined) {
    throw new GitObjectError('INVALID_COMMIT', 'Commit object is missing a required header.');
  }
  const labels = headers.get('jj:conflict-labels')?.[0];
  const trees = headers.get('jj:trees')?.[0];
  return Object.freeze({
    tree,
    parents: Object.freeze(headers.get('parent') ?? []),
    author: parseSignature(author),
    committer: parseSignature(committer),
    message: text.slice(separator + 2),
    changeId: headers.get('change-id')?.[0],
    conflictLabels: labels === undefined ? undefined : Object.freeze(labels.split('\n').filter((line) => line !== '')),
    conflictedTrees: trees === undefined ? undefined : Object.freeze(trees.split(' ')),
  });
};
