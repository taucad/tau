/**
 * What every Tau writer leg records, as scenarios a writer's own functions turn
 * into raw objects (blueprint D10 (b), G2).
 *
 * Both adapters (`isomorphic-git-adapter.ts` on the browser leg and
 * `native-git-port.ts` on every disk leg) build a revision from the same
 * `revision-headers.ts` and `git-objects.ts` calls; a leg differs in its
 * `via` and in the identities its actor resolver hands the writer. So a leg's
 * output is pinned by running those calls, from the release being pinned, over
 * the identities that leg's resolver produced at the time.
 *
 * `scripts/pin-writer-corpus.ts` runs this against each released tree since
 * version 2 (`corpus/writers/<release>.json`) and against the current tree
 * (`corpus/writers/current.json`); `writers.test.ts` re-runs it against the
 * current tree and fails when the bytes moved (G2).
 */

/** The account the scenarios record as signed in and pushing. */
export const writerPusher = 'user_ReleasedWriter0000001';
/** Stand-ins for the tree and parent the writer was given; a hook test swaps in its own repository's ids. */
export const writerTree = 'a'.repeat(40);
export const writerParent = 'b'.repeat(40);

/** One object a writer leg writes, and where its push sends it. */
export type PinnedObject = Readonly<{
  scenario: string;
  /** The leg: the `via` the record names. */
  leg: 'browser' | 'desktop' | 'cli' | 'serve' | 'cloud';
  type: 'commit' | 'tag';
  ref: string;
  /** The raw object body, with {@link writerTree} and {@link writerParent} as written. */
  body: string;
}>;

/** One `corpus/writers/<release>.json` file. */
export type PinnedWriter = Readonly<{
  /** The release tag pinned, or `current` for the working tree. */
  release: string;
  /** The commit that tag names; empty for `current`. */
  commit: string;
  pusher: string;
  tree: string;
  parent: string;
  objects: readonly PinnedObject[];
}>;

/** The writer calls a scenario makes, typed loosely so any release's functions fit. */
export type WriterFunctions = Readonly<{
  revisionAuthorSignature: (provenance: unknown, commitAuthor?: unknown) => unknown;
  revisionCommitterSignature: (provenance: unknown) => unknown;
  revisionCommitMessage: (trailer: unknown) => string;
  deriveChangeId: (objectFormat: 'sha1', input: unknown) => Uint8Array<ArrayBuffer>;
  taggerSignature: (actor: unknown, createdAt: number) => unknown;
  revisionTagMessage: (input: unknown) => string;
  encodeCommit: (input: unknown) => Readonly<{ body: Uint8Array<ArrayBuffer> }>;
  encodeTag: (input: unknown) => Readonly<{ body: Uint8Array<ArrayBuffer> }>;
}>;

const createdAt = 1_790_000_000_000;
const person = { kind: 'user', id: writerPusher, name: 'Released Writer' };
const forgeIdentity = {
  name: 'released-writer',
  email: '1234567+released-writer@users.noreply.github.com',
};
/* A signed-out device's pseudonym (`hostDevicePseudonym`, `revisionUserActor`). */
const devicePseudonym = {
  kind: 'user',
  id: 'anon:5e1ea5ed',
  name: 'Anonymous',
  anonymous: true,
};
/* A signed-in person with anonymity on: the account's per-workspace salt. */
const accountPseudonym = {
  kind: 'user',
  id: 'anon:0ac5a17e',
  name: 'Anonymous',
  anonymous: true,
};
/* The project owner a cloud agent host acts for (`TAU_HOST_OWNER_ID`). */
const cloudOwner = { kind: 'user', id: writerPusher, name: 'Released Writer' };
const agentFor = (onBehalfOf: Record<string, unknown>) => ({
  kind: 'agent',
  id: 'claude',
  runId: 'run_released',
  onBehalfOf,
});

const commitBody = (
  writer: WriterFunctions,
  provenance: Record<string, unknown>,
  input: Readonly<{
    summary: string;
    commitAuthor: Record<string, string> | undefined;
  }>,
): string => {
  const { summary, commitAuthor } = input;
  const trailer = {
    parents: [writerParent],
    provenance,
    summary: { generated: summary },
  };
  const encoded = writer.encodeCommit({
    objectFormat: 'sha1',
    tree: writerTree,
    parents: [writerParent],
    author:
      commitAuthor === undefined
        ? writer.revisionAuthorSignature(provenance)
        : writer.revisionAuthorSignature(provenance, commitAuthor),
    committer: writer.revisionCommitterSignature(provenance),
    message: writer.revisionCommitMessage(trailer),
    changeId: writer.deriveChangeId('sha1', {
      treeId: writerTree,
      parents: [writerParent],
      trailer,
    }),
  });
  return new TextDecoder().decode(encoded.body);
};

const tagBody = (writer: WriterFunctions, actor: Record<string, unknown>, leg: string): string => {
  const encoded = writer.encodeTag({
    objectFormat: 'sha1',
    object: writerParent,
    tag: 'v2',
    tagger: writer.taggerSignature(actor, createdAt),
    message: writer.revisionTagMessage({
      id: '0123456789abcdef0123456789abcdef',
      name: `Ready for print (${leg})`,
      note: undefined,
      actor,
    }),
  });
  return new TextDecoder().decode(encoded.body);
};

type CommitScenario = Readonly<{
  scenario: string;
  leg: PinnedObject['leg'];
  provenance: Record<string, unknown>;
  commitAuthor?: Record<string, string>;
}>;

const user = (actor: Record<string, unknown>, capture: string) => ({
  source: 'user',
  actor,
  capture,
});

/* Every leg's commits, with the identities its resolver hands the writer. */
const commitScenarios: readonly CommitScenario[] = [
  {
    scenario: 'Start version of a new project',
    leg: 'browser',
    provenance: user(person, 'create'),
  },
  {
    scenario: 'Saved in the browser',
    leg: 'browser',
    provenance: user(person, 'save'),
  },
  {
    scenario: 'Saved when the tab was hidden',
    leg: 'browser',
    provenance: user(person, 'hidden'),
  },
  {
    scenario: 'Agent turn base',
    leg: 'browser',
    provenance: {
      source: 'agent',
      actor: person,
      capture: 'turn',
      runId: 'run_released',
      attempt: 1,
      turnCut: 'base',
      turnId: 'turn_released',
    },
  },
  {
    scenario: 'Agent turn result on the signed-in person’s behalf',
    leg: 'browser',
    provenance: {
      source: 'agent',
      actor: agentFor(person),
      capture: 'turn',
      runId: 'run_released',
      attempt: 1,
      turnCut: 'result',
      turnId: 'turn_released',
    },
  },
  {
    scenario: 'Restored an earlier version',
    leg: 'browser',
    provenance: {
      source: 'restore',
      actor: person,
      capture: 'restore',
      restoredFrom: writerParent,
    },
  },
  {
    scenario: 'Saved signed out (device pseudonym)',
    leg: 'browser',
    provenance: user(devicePseudonym, 'save'),
  },
  {
    scenario: 'Saved with anonymity on (account pseudonym)',
    leg: 'browser',
    provenance: user(accountPseudonym, 'save'),
  },
  {
    scenario: 'Saved in a project linked to GitHub',
    leg: 'browser',
    provenance: user(person, 'save'),
    commitAuthor: forgeIdentity,
  },
  {
    /* The ui@0.9.x page spread the forge identity into the actor, address included. */
    scenario: 'Saved in a project linked to GitHub, forge identity in the actor (ui@0.9.x resolver)',
    leg: 'browser',
    provenance: user({ kind: 'user', id: writerPusher, ...forgeIdentity }, 'save'),
  },
  {
    scenario: 'Saved on the desktop',
    leg: 'desktop',
    provenance: user(person, 'save'),
  },
  {
    scenario: 'Saved on idle on the desktop',
    leg: 'desktop',
    provenance: user(person, 'idle'),
  },
  {
    scenario: 'Saved on close on the desktop',
    leg: 'desktop',
    provenance: user(person, 'close'),
  },
  {
    scenario: 'Merged a branch on the desktop',
    leg: 'desktop',
    provenance: { source: 'merge', actor: person, capture: 'merge' },
  },
  {
    scenario: 'Agent turn result on the desktop',
    leg: 'desktop',
    provenance: {
      source: 'agent',
      actor: agentFor(person),
      capture: 'turn',
      runId: 'run_released',
      attempt: 1,
      turnCut: 'result',
      turnId: 'turn_released',
    },
  },
  {
    scenario: 'Saved signed out on the desktop (device pseudonym)',
    leg: 'desktop',
    provenance: user(devicePseudonym, 'save'),
  },
  {
    scenario: 'Saved on the desktop in a project linked to GitHub',
    leg: 'desktop',
    provenance: user(person, 'save'),
    commitAuthor: forgeIdentity,
  },
  {
    scenario: 'Saved with tau revisions save',
    leg: 'cli',
    provenance: user(person, 'save'),
  },
  {
    scenario: 'Saved by tau serve signed out (device pseudonym)',
    leg: 'serve',
    provenance: user(devicePseudonym, 'save'),
  },
  {
    scenario: 'Agent turn result through tau serve',
    leg: 'serve',
    provenance: {
      source: 'agent',
      actor: agentFor(person),
      capture: 'turn',
      runId: 'run_released',
      attempt: 1,
      turnCut: 'result',
      turnId: 'turn_released',
    },
  },
  {
    scenario: 'Saved by a cloud agent host for the owner',
    leg: 'cloud',
    provenance: user(cloudOwner, 'save'),
  },
  {
    scenario: 'Agent turn result on a cloud agent host',
    leg: 'cloud',
    provenance: {
      source: 'agent',
      actor: agentFor(cloudOwner),
      capture: 'turn',
      runId: 'run_released',
      attempt: 1,
      turnCut: 'result',
      turnId: 'turn_released',
    },
  },
];

/**
 * Every object a writer's functions produce for every leg's scenarios.
 *
 * @param writer - One release's writer functions.
 * @returns The pinned objects, commits then version tags.
 */
export const writeScenarios = (writer: WriterFunctions): PinnedObject[] => [
  ...commitScenarios.map(
    ({ scenario, leg, provenance, commitAuthor }): PinnedObject => ({
      scenario,
      leg,
      type: 'commit',
      ref: 'refs/heads/main',
      body: commitBody(writer, { ...provenance, via: leg, createdAt }, { summary: scenario, commitAuthor }),
    }),
  ),
  {
    scenario: 'Named a version in the browser',
    leg: 'browser',
    type: 'tag',
    ref: 'refs/tags/v2',
    body: tagBody(writer, person, 'browser'),
  },
  {
    scenario: 'Named a version on the desktop by an agent',
    leg: 'desktop',
    type: 'tag',
    ref: 'refs/tags/v2',
    body: tagBody(writer, agentFor(person), 'desktop'),
  },
];
