/**
 * The one reader of commit and tag objects for provenance (blueprint D1, D10).
 *
 * Total: every function here answers for any input and never throws, so a
 * corrupt or hostile object becomes a reading (`tau/other`, `invalid`, no
 * account) rather than an error a caller could turn into a refusal (I1).
 *
 * The version 2 `Tau-Metadata` record is the only record parsed. Readers
 * tolerate additive fields anywhere (D10 (d)), so every shape a version 2
 * writer has produced stays readable (I10): ui@0.9.x wrote the linked forge's
 * no-reply address into the person as `email`, which this reader accepts and
 * never returns. Identity values are compared exactly. Any other record line —
 * version 1, a newer version, corrupt JSON, two lines — is `tau/other` and the
 * commit is classified from its headers.
 */

import { agentByIdentity, agentByTrailer, isAgentAddress } from '#provenance/agents.js';
import type { AddressClass, CommitReading, RecognisedAgentId, TagReading } from '#provenance/types.js';

const recordPrefix = 'Tau-Metadata: ';
const actorPrefix = 'Tau-Actor: ';
const tagPrefix = 'Tau-Tag: ';
const tauNoreplyDomain = 'users.noreply.tau.new';
const tauCommitterName = 'Tau';
const tauCommitterEmail = 'noreply@tau.new';
const pseudonymPrefix = 'anon:';
const versionIdPattern = /^[\da-f]{32}$/u;
const forgeAddress = /^(?:\d+\+)?[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?@users\.noreply\.github\.com$/u;
const trailerKey = /^[A-Za-z][A-Za-z\d-]*$/u;
/* Longer lines are never read as trailers, and only the message's last 64 KiB outside `Tau-*` lines is scanned for them (M2 review B1). */
const maxTrailerLineLength = 1024;
const maxTrailerScanLength = 64 * 1024;
const coAuthoredBy = 'co-authored-by';
const maxClaimableLength = 128;

const sources = new Set(['user', 'agent', 'merge', 'restore', 'import']);
const captures = new Set(['turn', 'save', 'idle', 'hidden', 'close', 'merge', 'restore', 'switch', 'create', 'import']);
const vias = new Set(['browser', 'desktop', 'cli', 'serve', 'cloud']);

/** One git identity as a header line carries it. */
type Identity = Readonly<{ name: string; email: string }>;

/** A commit or tag split into its headers and message. */
type SplitObject = Readonly<{
  headers: ReadonlyMap<string, readonly string[]>;
  message: string;
}>;

/** A version 2 actor, as far as provenance needs it. */
type RecordActor =
  | Readonly<{ kind: 'user'; id: string; name?: string; anonymous?: boolean }>
  | Readonly<{ kind: 'agent'; id: string; runId: string; onBehalfOf: string }>;

/** A parsed version 2 record, as far as provenance needs it. */
type Record2 = Readonly<{ source: string; runId?: string; actor: RecordActor }>;

/**
 * Whether a token has one of the two account-id shapes found in source
 * (Finding 15): `user_` and 21 alphanumerics (`generatePrefixedId`), or 32
 * alphanumerics (an earlier generator). A 32-character OS login fails safe:
 * it reads as an account and so is never claimable.
 *
 * @param token - One identifier.
 * @returns `true` when it could be an account id.
 * @public
 */
export const isAccountShaped = (token: string): boolean =>
  /^user_[A-Za-z\d]{21}$/u.test(token) || /^[A-Za-z\d]{32}$/u.test(token);

/* Tokens of a text: an `anon:` pseudonym as one token, otherwise maximal runs of
 * letters, digits and underscores, so `"id":"user_…"` yields `user_…`. */
const tokenPattern = /anon:[A-Za-z\d_]*|[A-Za-z\d_]+/gu;

const textNamesAccount = (text: string): boolean => {
  for (const [token] of text.matchAll(tokenPattern)) {
    const bare = token.startsWith(pseudonymPrefix) ? token.slice(pseudonymPrefix.length) : token;
    if (isAccountShaped(bare)) {
      return true;
    }
  }
  return false;
};

/* Every key and string a parsed JSON value holds, so an account id written with
 * `\u` escapes is seen as the parser sees it. */
const jsonNamesAccount = (value: unknown, depth = 0): boolean => {
  if (depth > 32) {
    return true;
  }
  if (typeof value === 'string') {
    return textNamesAccount(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => jsonNamesAccount(item, depth + 1));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).some(([key, item]) => textNamesAccount(key) || jsonNamesAccount(item, depth + 1));
  }
  return false;
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOptional = (value: unknown, type: 'string' | 'number' | 'boolean'): boolean =>
  value === undefined || typeof value === type;

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value !== '';

const isStringArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/*
 * An id a record may name a person by (M2-fix review M1): an account, a device pseudonym (`anon:` and a token), or the
 * OS login a pre-A1 desktop wrote (corpus row 3, kept readable by I10). An id holding `@`, `<`, `>`, a control
 * character or more than 128 characters makes the record unparsed, so the commit reads `tau/other` from its headers and
 * no record field carries an address out of the module. An `anon:` id must be the pseudonym form.
 */
const pseudonymPattern = /^anon:[A-Za-z\d_-]{1,64}$/u;
const isRecordIdentity = (value: unknown): value is string =>
  typeof value === 'string' &&
  value !== '' &&
  value.length <= maxClaimableLength &&
  !/[@<>\p{Cc}]/u.test(value) &&
  (!value.startsWith(pseudonymPrefix) || pseudonymPattern.test(value));

/* A record's display name, kept only when it holds no `@`, `<` or `>`: no address leaves through a name (I11). */
const neutralRecordName = (name: string | undefined): string | undefined =>
  name === undefined || /[@<>]/u.test(name) ? undefined : name;

const parseUser = (value: unknown): Extract<RecordActor, { kind: 'user' }> | undefined => {
  if (
    !isRecord(value) ||
    value['kind'] !== 'user' ||
    !isRecordIdentity(value['id']) ||
    !isOptional(value['name'], 'string') ||
    !isOptional(value['anonymous'], 'boolean')
  ) {
    return undefined;
  }
  const name = neutralRecordName(value['name'] as string | undefined);
  const anonymous = value['anonymous'] as boolean | undefined;
  return {
    kind: 'user',
    id: value['id'],
    ...(name === undefined ? {} : { name }),
    ...(anonymous === undefined ? {} : { anonymous }),
  };
};

const parseActor = (value: unknown): RecordActor | undefined => {
  if (isRecord(value) && value['kind'] === 'agent') {
    const onBehalfOf = parseUser(value['onBehalfOf']);
    return isNonEmptyString(value['id']) && isNonEmptyString(value['runId']) && onBehalfOf !== undefined
      ? {
          kind: 'agent',
          id: value['id'],
          runId: value['runId'],
          onBehalfOf: onBehalfOf.id,
        }
      : undefined;
  }
  return parseUser(value);
};

/* The version 2 record's provenance fields other than the actor. */
const isProvenance2 = (provenance: Readonly<Record<string, unknown>>): boolean => {
  const { source, capture, via, createdAt, runId, attempt, turnId, restoredFrom, turnCut, heldRunIds } = provenance;
  return (
    sources.has(source as string) &&
    captures.has(capture as string) &&
    vias.has(via as string) &&
    typeof createdAt === 'number' &&
    isOptional(runId, 'string') &&
    isOptional(attempt, 'number') &&
    isOptional(turnId, 'string') &&
    isOptional(restoredFrom, 'string') &&
    (turnCut === undefined || turnCut === 'base' || turnCut === 'result') &&
    (heldRunIds === undefined || isStringArray(heldRunIds))
  );
};

/* The version 2 record (blueprint B1): identity, capture and leg required. */
const parseRecord2 = (value: unknown): Record2 | undefined => {
  if (!isRecord(value) || value['version'] !== 2 || !isStringArray(value['parents'])) {
    return undefined;
  }
  const { provenance, summary } = value;
  if (
    !isRecord(provenance) ||
    !isRecord(summary) ||
    typeof summary['generated'] !== 'string' ||
    !isOptional(summary['edited'], 'string') ||
    !isProvenance2(provenance)
  ) {
    return undefined;
  }
  const actor = parseActor(provenance['actor']);
  if (actor === undefined) {
    return undefined;
  }
  const runId = provenance['runId'] as string | undefined;
  return {
    source: provenance['source'] as string,
    actor,
    ...(runId === undefined ? {} : { runId }),
  };
};

/* Headers up to the first blank line, with continuation lines (a signature's)
 * folded into the header before them; the rest is the message. */
const splitObject = (body: string): SplitObject => {
  const end = body.indexOf('\n\n');
  const head = end === -1 ? body : body.slice(0, end);
  const message = end === -1 ? '' : body.slice(end + 2);
  const headers = new Map<string, string[]>();
  let last: string[] | undefined;
  let lastIndex = -1;
  for (const line of head.split('\n')) {
    if (line.startsWith(' ') && last !== undefined) {
      last[lastIndex] = `${last[lastIndex] ?? ''}\n${line.slice(1)}`;
      continue;
    }
    const space = line.indexOf(' ');
    const name = space === -1 ? line : line.slice(0, space);
    const values = headers.get(name) ?? [];
    values.push(space === -1 ? '' : line.slice(space + 1));
    headers.set(name, values);
    last = values;
    lastIndex = values.length - 1;
  }
  return { headers, message };
};

/* `Name <address> <seconds> <offset>`; a line without an address has none. */
const parseIdentity = (value: string | undefined): Identity | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const open = value.lastIndexOf('<');
  const close = value.lastIndexOf('>');
  if (open === -1 || close < open) {
    return { name: value.trim(), email: '' };
  }
  return {
    name: value.slice(0, open).trim(),
    email: value.slice(open + 1, close).trim(),
  };
};

/* An address with its domain lowercased: domains compare without case. */
const normalAddress = (email: string): string => {
  const at = email.lastIndexOf('@');
  return at === -1 ? email : `${email.slice(0, at)}@${email.slice(at + 1).toLowerCase()}`;
};

/**
 * The local part of a Tau no-reply address: `<x>@users.noreply.tau.new`.
 *
 * @param email - An address.
 * @returns `x`, or `undefined` for any other address.
 */
const tauNoreplyLocalPart = (email: string): string | undefined => {
  const address = normalAddress(email);
  const suffix = `@${tauNoreplyDomain}`;
  if (!address.endsWith(suffix)) {
    return undefined;
  }
  const local = address.slice(0, -suffix.length);
  return local === '' || /[@<>\n\0]/u.test(local) ? undefined : local;
};

/**
 * The class of one address (contracts § 1). The address never leaves the module.
 *
 * @param email - An address, or `''` for none.
 * @returns Its class.
 */
export const classifyAddress = (email: string): AddressClass => {
  const address = normalAddress(email);
  if (address === '') {
    return 'none';
  }
  if (address === tauCommitterEmail || tauNoreplyLocalPart(address) !== undefined) {
    return 'tau';
  }
  if (forgeAddress.test(address)) {
    return 'forge';
  }
  return isAgentAddress(address) ? 'agent' : 'foreign';
};

/* The most exposing class among several: foreign over forge over tau over agent. */
const classRank: Readonly<Record<AddressClass, number>> = {
  none: 0,
  agent: 1,
  tau: 2,
  forge: 3,
  foreign: 4,
};
const widestClass = (classes: readonly AddressClass[]): AddressClass => {
  let widest: AddressClass = 'none';
  for (const next of classes) {
    widest = classRank[next] > classRank[widest] ? next : widest;
  }
  return widest;
};

/** One trailer that names a git identity, such as `Co-Authored-By: Name <address>`. */
type IdentityTrailer = Readonly<{ key: string; name: string; email: string }>;

/* Spaces and tabs at either end, the only padding git's trailer syntax allows. */
const trimBlanks = (text: string): string => {
  let start = 0;
  let end = text.length;
  while (start < end && (text[start] === ' ' || text[start] === '\t')) {
    start += 1;
  }
  while (end > start && (text[end - 1] === ' ' || text[end - 1] === '\t')) {
    end -= 1;
  }
  return text.slice(start, end);
};

/*
 * `Key: Name <address>`, parsed by position in linear time (M2 review B1: the
 * regex this replaces backtracked cubically on a long blank run). The address
 * is the last `<…>` on the line, nothing but blanks may follow it, and the
 * name holds no line terminator.
 */
const trailerOf = (line: string): IdentityTrailer | undefined => {
  if (line.length > maxTrailerLineLength || line.startsWith('Tau-')) {
    return undefined;
  }
  const colon = line.indexOf(':');
  const key = colon === -1 ? '' : line.slice(0, colon);
  if (!trailerKey.test(key)) {
    return undefined;
  }
  const value = line.slice(colon + 1);
  const close = value.lastIndexOf('>');
  const open = close === -1 ? -1 : value.lastIndexOf('<', close);
  if (open === -1 || trimBlanks(value.slice(close + 1)) !== '') {
    return undefined;
  }
  const email = value.slice(open + 1, close);
  const name = trimBlanks(value.slice(0, open));
  if (/[\r\u2028\u2029]/u.test(name)) {
    return undefined;
  }
  return { key: key.toLowerCase(), name, email: normalAddress(email) };
};

/*
 * The identity trailers of a message: its last lines up to 64 KiB, counted after the `Tau-*` lines are set aside, so a
 * long record never pushes a real `Co-Authored-By` out of reach (M2-fix review m1). One trailing `\r` per line is
 * dropped, so a CRLF message reads as git reads it (m2). Linear: one split, one pass from the end.
 */
const identityTrailers = (message: string): IdentityTrailer[] => {
  const lines = message.split('\n');
  const out: IdentityTrailer[] = [];
  let scanned = 0;
  for (let index = lines.length - 1; index >= 0 && scanned <= maxTrailerScanLength; index -= 1) {
    const raw = lines[index] ?? '';
    if (raw.startsWith('Tau-')) {
      continue;
    }
    scanned += raw.length + 1;
    const trailer = trailerOf(raw.endsWith('\r') ? raw.slice(0, -1) : raw);
    if (trailer !== undefined) {
      out.push(trailer);
    }
  }
  return out.reverse();
};

const validClaimable = (identity: string | undefined): string | undefined =>
  identity === undefined || identity === '' || identity.length > maxClaimableLength || /[@<>\n\0]/u.test(identity)
    ? undefined
    : identity;

/** A commit's identities and message, for the server half of the module. Never exported from the package. */
export type CommitParts = Readonly<{
  author?: Identity;
  committer?: Identity;
  message: string;
}>;

/**
 * Split a commit into the parts the server's coverage pass compares.
 *
 * @param commit - The raw commit object body.
 * @returns Its author, committer and message.
 */
export const commitParts = (commit: string): CommitParts => {
  const { headers, message } = splitObject(commit);
  const author = parseIdentity(headers.get('author')?.[0]);
  const committer = parseIdentity(headers.get('committer')?.[0]);
  return {
    ...(author === undefined ? {} : { author: { name: author.name, email: normalAddress(author.email) } }),
    ...(committer === undefined
      ? {}
      : {
          committer: {
            name: committer.name,
            email: normalAddress(committer.email),
          },
        }),
    message,
  };
};

const recognisedAgentOf = (
  parts: CommitParts,
  trailers: readonly IdentityTrailer[],
): Readonly<{ id: RecognisedAgentId; by: 'trailer' | 'author' | 'committer' }> | undefined => {
  const byAuthor = parts.author === undefined ? undefined : agentByIdentity(parts.author.name, parts.author.email);
  if (byAuthor !== undefined) {
    return { id: byAuthor, by: 'author' };
  }
  for (const trailer of trailers) {
    const byTrailer = trailer.key === coAuthoredBy ? agentByTrailer(trailer.name, trailer.email) : undefined;
    if (byTrailer !== undefined) {
      return { id: byTrailer, by: 'trailer' };
    }
  }
  const byCommitter =
    parts.committer === undefined ? undefined : agentByIdentity(parts.committer.name, parts.committer.email);
  return byCommitter === undefined ? undefined : { id: byCommitter, by: 'committer' };
};

/* The message's record and actor lines, without their prefixes. */
const recordLinesOf = (message: string): Readonly<{ records: string[]; actors: string[] }> => {
  const lines = message.split('\n');
  return {
    records: lines.filter((line) => line.startsWith(recordPrefix)).map((line) => line.slice(recordPrefix.length)),
    actors: lines.filter((line) => line.startsWith(actorPrefix)).map((line) => line.slice(actorPrefix.length)),
  };
};

/*
 * A git name as the module may return it: empty when it holds `@`, `<` or `>`
 * or the role's own address, so no address leaves the module through a name
 * (I11, M2 review M1). `author a@b.c <a@b.c>`, which git writes when
 * `user.name` is unset, and a malformed line with two `<…>` both read empty.
 */
const neutralName = (name: string, email: string): string =>
  /[@<>]/u.test(name) || (email !== '' && name.toLowerCase().includes(email.toLowerCase())) ? '' : name;

/* What the commit's author and committer lines say, addresses classified. */
const identityFields = (parts: CommitParts) => {
  const authorEmail = parts.author?.email ?? '';
  const committerEmail = parts.committer?.email ?? '';
  const authorLocal = tauNoreplyLocalPart(authorEmail);
  const committerLocal = tauNoreplyLocalPart(committerEmail);
  return {
    authorName: neutralName(parts.author?.name ?? '', authorEmail),
    authorLocal,
    committerLocal,
    authorAccountId: authorLocal !== undefined && isAccountShaped(authorLocal) ? authorLocal : undefined,
    committerAccountId: committerLocal !== undefined && isAccountShaped(committerLocal) ? committerLocal : undefined,
    authorClass: classifyAddress(authorEmail),
    committerClass: classifyAddress(committerEmail),
    tauWritten: parts.committer?.name === tauCommitterName && committerEmail === tauCommitterEmail,
  };
};

type IdentityFields = ReturnType<typeof identityFields>;

/* The pseudonym the commit is recorded or authored as, if any. */
const pseudonymOf = (actor: RecordActor | undefined, authorLocal: string | undefined): string | undefined => {
  /* Only the `anon:` form is a pseudonym: `anonymous: true` beside an account id names that account. */
  if (actor?.kind === 'user' && actor.id.startsWith(pseudonymPrefix)) {
    return actor.id;
  }
  if (actor?.kind === 'agent' && actor.onBehalfOf.startsWith(pseudonymPrefix)) {
    return actor.onBehalfOf;
  }
  return authorLocal?.startsWith(pseudonymPrefix) === true ? authorLocal : undefined;
};

/* D5: the device pseudonym, or on a Tau-written commit the no-reply local part or a mailbox author's name. */
const claimableOf = (
  identity: IdentityFields,
  pseudonym: string | undefined,
  namesAccount: boolean,
): string | undefined => {
  if (namesAccount) {
    return undefined;
  }
  if (pseudonym !== undefined) {
    return validClaimable(pseudonym);
  }
  if (identity.tauWritten && identity.authorClass === 'tau') {
    return validClaimable(identity.authorLocal);
  }
  return identity.tauWritten && identity.authorClass === 'foreign' ? validClaimable(identity.authorName) : undefined;
};

const recordFields = (record: Record2 | undefined): Partial<CommitReading> => {
  const actor = record?.actor;
  if (record === undefined || actor === undefined) {
    return {};
  }
  const isAgent = record.source === 'agent' || actor.kind === 'agent';
  const runId = record.runId ?? (actor.kind === 'agent' ? actor.runId : undefined);
  return {
    ...(actor.kind === 'user'
      ? {
          person: Object.freeze({
            id: actor.id,
            ...(actor.name === undefined ? {} : { name: actor.name }),
            ...(actor.anonymous === undefined ? {} : { anonymous: actor.anonymous }),
          }),
        }
      : { onBehalfOf: actor.onBehalfOf }),
    ...(isAgent ? { tauAgent: Object.freeze(runId === undefined ? {} : { runId }) } : {}),
  };
};

/**
 * Read one commit (contracts § 1). Total: any input gives a reading.
 *
 * @param commit - The raw commit object body, as `git cat-file commit` prints it.
 * @returns What it says about who made it, with no address in it.
 * @public
 */
export const readCommit = (commit: string): CommitReading => {
  const parts = commitParts(commit);
  const { records, actors } = recordLinesOf(parts.message);
  const parsed = records.map((line) => parseJson(line));
  const record = records.length === 1 ? parseRecord2(parsed[0]) : undefined;
  const identity = identityFields(parts);
  const namesAccount =
    records.some((line) => textNamesAccount(line)) ||
    parsed.some((value) => jsonNamesAccount(value)) ||
    actors.some((line) => textNamesAccount(line)) ||
    [identity.authorLocal, identity.committerLocal].some((local) => local !== undefined && textNamesAccount(local));
  const pseudonym = pseudonymOf(record?.actor, identity.authorLocal);
  const claimable = claimableOf(identity, pseudonym, namesAccount);
  const trailers = identityTrailers(parts.message);
  const agent = recognisedAgentOf(parts, trailers);
  const reading: CommitReading = {
    shape: records.length === 0 ? 'git' : record === undefined ? 'tau/other' : 'tau/2',
    tauWritten: identity.tauWritten,
    ...recordFields(record),
    authorName: identity.authorName,
    ...(identity.authorAccountId === undefined ? {} : { authorAccountId: identity.authorAccountId }),
    ...(identity.committerAccountId === undefined ? {} : { committerAccountId: identity.committerAccountId }),
    namesAccount,
    pseudonymous: pseudonym !== undefined,
    ...(claimable === undefined ? {} : { claimable }),
    addressClass: Object.freeze({
      author: identity.authorClass,
      committer: identity.committerClass,
      tagger: 'none',
      trailers: widestClass(trailers.map((trailer) => classifyAddress(trailer.email))),
    }),
    ...(agent === undefined ? {} : { agent: Object.freeze(agent) }),
  };
  return Object.freeze(reading);
};

/**
 * Read one annotated tag (contracts § 1). Only a version 2 `Tau-Tag` record
 * with a 32-hex id and a name is a version (Q2), judged exactly as the
 * `pre-receive` hook's version check judges it: the last `Tau-Tag` line of the
 * message, additive fields tolerated.
 *
 * @param tag - The raw tag object body, as `git cat-file tag` prints it.
 * @returns The version it records, or `invalid`.
 * @public
 */
export const readTag = (tag: string): TagReading => {
  const { headers, message } = splitObject(tag);
  const target = headers.get('object')?.[0] ?? '';
  const line = message.split('\n').findLast((candidate) => candidate.startsWith(tagPrefix));
  const record = line === undefined ? undefined : parseJson(line.slice(tagPrefix.length));
  if (
    !isRecord(record) ||
    record['version'] !== 2 ||
    typeof record['id'] !== 'string' ||
    !versionIdPattern.test(record['id']) ||
    !isNonEmptyString(record['name'])
  ) {
    return Object.freeze({ shape: 'invalid', target });
  }
  return Object.freeze({
    shape: 'tau/2',
    versionId: record['id'],
    name: record['name'],
    target,
  });
};
