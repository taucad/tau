import { resolveTxt } from 'node:dns/promises';

/**
 * Which tau-storage Machines are deployed (DC2): what tau-api ranks a project
 * over. Fly answers a TXT query on its internal DNS with every Machine's id and
 * region; the name is configuration (`TAU_STORAGE_MEMBERS_DNS`), because
 * tau-storage sits on its own 6PN and only it can resolve its own `.internal`
 * names. tau-api asks for the list on `GET /v1/storage/members`.
 */

/** A Fly Machine id: lower-case hex. */
const machineIdPattern = /^[\da-f]{8,32}$/u;

/**
 * The machine ids in a TXT answer. Fly writes `<id> <region>` pairs separated
 * by commas, in one or more strings; anything else is ignored.
 *
 * @param records - `resolveTxt`'s answer.
 * @returns The ids, sorted and unique.
 */
export const parseMemberRecords = (records: ReadonlyArray<readonly string[]>): string[] =>
  [
    ...new Set(
      records
        .map((chunks) => chunks.join(''))
        .join(',')
        .split(',')
        .map((entry) => entry.trim().split(/\s+/u)[0] ?? '')
        .filter((id) => machineIdPattern.test(id)),
    ),
  ].toSorted();

/**
 * A members reader over one TXT name, answering from a short cache so a burst
 * of API pollers costs one lookup.
 *
 * @param name - The TXT name.
 * @param ttlMilliseconds - How long one answer is reused.
 * @param resolve - The resolver; tests pass their own.
 * @returns The reader. A failed lookup answers the last good list, or none.
 */
export const dnsMembers = (
  name: string,
  ttlMilliseconds = 10_000,
  resolve: (name: string) => Promise<string[][]> = resolveTxt,
): (() => Promise<readonly string[]>) => {
  let held: readonly string[] = [];
  let readAt = Number.NEGATIVE_INFINITY;
  return async () => {
    if (performance.now() - readAt < ttlMilliseconds) {
      return held;
    }
    try {
      held = parseMemberRecords(await resolve(name));
      readAt = performance.now();
    } catch {
      /* Keep the last good list; tau-api keeps its own too. */
    }
    return held;
  };
};
