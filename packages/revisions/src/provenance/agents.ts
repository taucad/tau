/**
 * The recognised-agent registry (blueprint D6).
 *
 * Exact matchers over the identities real agent commits carry, each captured
 * into the golden corpus (`corpus/corpus.json`, rows 13a to 13c). Nothing a
 * project, a setting or a commit says can extend it: an agent this build does
 * not know reads as its verified person, or as external.
 *
 * An id with no matcher yet (`codex`, `grok`) stays in the closed union and
 * matches nothing until a commit it made is captured into the corpus.
 */

import type { RecognisedAgentId } from '#provenance/types.js';

/** One git identity as the registry compares it: the name test and the exact address. */
type IdentityMatcher = Readonly<{ name: RegExp; email: string }>;

/** One registry entry. @public */
export type RecognisedAgent = Readonly<{
  id: RecognisedAgentId;
  /** What the page shows before "· for _pusher_". */
  label: string;
  /** `Co-Authored-By` trailers the agent writes into a commit a person makes. */
  trailers: readonly IdentityMatcher[];
  /** The identity the agent commits under when it is the author or the committer. */
  identities: readonly IdentityMatcher[];
}>;

/*
 * Claude Code: captured from commits in Tau's own history. It commits as
 * `Claude <noreply@anthropic.com>` (author and committer), or adds
 * `Co-Authored-By: Claude <noreply@anthropic.com>`, sometimes with the model's
 * name after `Claude`, to a commit a person makes.
 */
const claudeCode: RecognisedAgent = Object.freeze({
  id: 'claude-code',
  label: 'Claude Code',
  trailers: Object.freeze([{ name: /^Claude(?: [^<>\n]+)?$/u, email: 'noreply@anthropic.com' }]),
  identities: Object.freeze([{ name: /^Claude$/u, email: 'noreply@anthropic.com' }]),
});

/** Every recognised agent, in matching order. @public */
export const recognisedAgents: readonly RecognisedAgent[] = Object.freeze([
  claudeCode,
  Object.freeze({
    id: 'codex',
    label: 'Codex',
    trailers: Object.freeze([]),
    identities: Object.freeze([]),
  }),
  Object.freeze({
    id: 'grok',
    label: 'Grok',
    trailers: Object.freeze([]),
    identities: Object.freeze([]),
  }),
]);

const fits = (matchers: readonly IdentityMatcher[], name: string, email: string): boolean =>
  matchers.some((matcher) => matcher.email === email && matcher.name.test(name));

/**
 * The agent whose committing identity is exactly this one.
 *
 * @param name - A git identity's name.
 * @param email - Its address.
 * @returns The agent's id, or `undefined`.
 */
export const agentByIdentity = (name: string, email: string): RecognisedAgentId | undefined =>
  recognisedAgents.find((agent) => fits(agent.identities, name, email))?.id;

/**
 * The agent whose `Co-Authored-By` trailer is exactly this one.
 *
 * @param name - The trailer's name.
 * @param email - The trailer's address.
 * @returns The agent's id, or `undefined`.
 */
export const agentByTrailer = (name: string, email: string): RecognisedAgentId | undefined =>
  recognisedAgents.find((agent) => fits(agent.trailers, name, email))?.id;

/**
 * Whether an address is one a registry entry lists exactly.
 *
 * @param email - An address.
 * @returns `true` for an agent's address.
 */
export const isAgentAddress = (email: string): boolean =>
  recognisedAgents.some(
    (agent) => agent.trailers.some((m) => m.email === email) || agent.identities.some((m) => m.email === email),
  );
