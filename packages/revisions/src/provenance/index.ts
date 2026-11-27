/**
 * `@taucad/revisions/provenance`: the one reader, verifier and join of who an
 * entry is by (cloud backup admission blueprint D1, contracts § 1).
 *
 * An import-free leaf: it depends on nothing outside this directory, so the
 * storage worker, tau-api and every client read history the same way. No
 * address leaves it (I11); the functions that compare one live in
 * `@taucad/revisions/provenance/server`.
 *
 * Bump {@link provenanceRules} with any change to what `readCommit`,
 * `readTag` or `attributionOf` answers for some corpus entry; G1 fails on an
 * unbumped change.
 */

export { recognisedAgents } from '#provenance/agents.js';
export type { RecognisedAgent } from '#provenance/agents.js';
export { attributionOf } from '#provenance/attribution.js';
export { historyNewArguments } from '#provenance/history.js';
export { isAccountShaped, readCommit, readTag } from '#provenance/read.js';
export { provenanceRules } from '#provenance/rules.js';
export type {
  AddressClass,
  Attribution,
  CommitReading,
  CoverageInputs,
  Join,
  PushView,
  RecognisedAgentId,
  Refs,
  ServerBits,
  TagReading,
  Viewer,
} from '#provenance/types.js';
