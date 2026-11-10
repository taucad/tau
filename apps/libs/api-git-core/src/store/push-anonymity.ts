/* oxlint-disable new-cap -- NestJS's Logger is a class the module instantiates once */
import { Logger } from '@nestjs/common';
import { runGit } from '#store/lease.js';
import type { Manifest } from '#store/manifest.js';

const logger = new Logger('PushAnonymity');

/**
 * The author-ident pattern of an anonymous Tau revision. Anonymity is applied
 * when the revision is written: its author is the pseudonym `anon:<hash>` at
 * Tau's no-reply domain (`revisionAuthorSignature` in `@taucad/revisions`),
 * for a person's own save and for an agent's turn on their behalf alike.
 * git matches `--author` against `Name <email>`, so the `<` anchors it to the
 * address.
 */
export const anonymousAuthorPattern = '<anon:';

/**
 * Whether a push brings a commit recorded anonymously (Q3): any commit its
 * new tips reach that its old tips did not, authored as an `anon:` pseudonym.
 *
 * The push record then carries `anonymous`, and the push-record read shows the
 * pushing account to the project's owner only. The fact is derived from the
 * commits and never from the request, and it can only ever hide the pusher:
 * a pusher who marks commits anonymous hides nobody but themselves.
 *
 * Fails closed: a walk that errors answers `true`, so a doubt hides the
 * account from members rather than showing it.
 *
 * @param args - The lease directory, and the ref maps before and after the push.
 * @returns Whether any commit new in the push is anonymous.
 */
export const pushCarriesAnonymousCommit = async (args: {
  readonly directory: string;
  readonly before: Manifest['refs'];
  readonly after: Manifest['refs'];
}): Promise<boolean> => {
  const added = [
    ...new Set(
      Object.entries(args.after)
        .filter(([name, tip]) => args.before[name]?.oid !== tip.oid)
        .map(([, tip]) => tip.oid),
    ),
  ];
  if (added.length === 0) {
    return false;
  }
  const old = [...new Set(Object.values(args.before).map((tip) => tip.oid))];
  try {
    const found = await runGit(args.directory, [
      'rev-list',
      '--max-count=1',
      '--fixed-strings',
      `--author=${anonymousAuthorPattern}`,
      ...added,
      '--not',
      ...old,
    ]);
    return found.trim() !== '';
  } catch (error) {
    logger.warn(`could not tell whether a push is anonymous; recording it as anonymous: ${String(error)}`);
    return true;
  }
};
