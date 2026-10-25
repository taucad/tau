import { createHash } from 'node:crypto';

/**
 * Rendezvous (highest-random-weight) ranking of tau-storage members for one
 * project (DC2; north star "rendezvous(project, live tau-storage members)").
 *
 * Every member gets a score from a hash of itself and the project; the order
 * is the scores, highest first. Two properties follow, and are what affinity
 * needs:
 *
 * - **Stable.** Every API Machine ranks the same members the same way, with no
 *   coordination, so one project's requests meet one worker's pack cache.
 * - **Minimal movement.** Removing a member moves only the projects it ranked
 *   first, each to its own second; adding one takes only the projects it now
 *   ranks first. That is why the ranking is over the *deployed* members: a
 *   Machine Fly stops when idle stays in the list, so stopping it moves no
 *   project (review FR18), and a request it cannot answer spills once instead.
 */

/**
 * A member's score for one key: the first 8 bytes of SHA-256 over both.
 *
 * @param member - The member id.
 * @param key - What is placed (a project id).
 * @returns An unsigned 64-bit score.
 */
const score = (member: string, key: string): bigint =>
  createHash('sha256').update(member).update('\0').update(key).digest().readBigUInt64BE(0);

/**
 * Ranks members for a key.
 *
 * @param key - The project id.
 * @param members - The member ids, in any order; duplicates count once.
 * @returns The members, preferred first.
 */
export const rendezvousRank = (key: string, members: readonly string[]): string[] =>
  [...new Set(members)]
    .map((member) => ({ member, weight: score(member, key) }))
    .sort((left, right) =>
      left.weight === right.weight ? (left.member < right.member ? -1 : 1) : left.weight > right.weight ? -1 : 1,
    )
    .map(({ member }) => member);
