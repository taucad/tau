import {
  GoneException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Logger } from '@nestjs/common';
import { ceilingRefusalMarker, incompleteRepositoryMarker } from '#api/git/git.constants.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';

/**
 * The HTTP answers the charter names for repository-store refusals, shared by
 * the API (advertisement, publication leases) and tau-storage (every RPC),
 * so a refusal reads the same whichever side raised it (DC1).
 */

/** What a 503 from the git routes tells the client to wait, in seconds. */
export const gitRetryAfterSeconds = 5;

/**
 * Turns a store refusal into the HTTP answer the charter names for it.
 *
 * Returns the refusal rather than raising it, so every caller reads as
 * `throw refusalFor(error, logger)` and the throw site stays where the control
 * flow is.
 *
 * @param error - Whatever the store, the lease or the commit raised.
 * @param logger - Where the two refusals whose detail stays server-side are logged.
 * @returns The exception to throw.
 */
export const refusalFor = (error: unknown, logger: Pick<Logger, 'log' | 'error'>): Error => {
  if (!(error instanceof RepositoryStoreError)) {
    return error instanceof Error ? error : new Error(String(error));
  }
  switch (error.code) {
    case 'lost':
    case 'deadline': {
      /* D4: a lost race is not a failed push, it is a push that has to happen
         again. The client re-pushes against the manifest that won. */
      return new ServiceUnavailableException({
        code: 'GIT_PUSH_RACE_LOST',
        message: 'Another push for this project committed first; retry.',
      });
    }
    case 'incarnation-changed': {
      return new NotFoundException({
        code: 'GIT_REPOSITORY_NOT_FOUND',
        message: 'Repository not found',
      });
    }
    case 'tombstoned': {
      return new GoneException({
        code: 'GIT_REPOSITORY_DELETED',
        message: 'This project has been deleted.',
      });
    }
    case 'ceiling-exceeded': {
      /* `pre-receive` bounds what *arrives*, so the backstop is reachable
         without a bug: a compacting commit repacks the retained pack together
         with the arrival, and a repack that deltifies worse than its inputs
         is larger than the sum the hook measured (review F12). Nothing is
         durable either way — the assertion runs before the first upload. */
      logger.log({ message: error.message }, 'The D20 ceiling was reached past the pre-receive hook');
      /* Opens with the hook's marker so a client files it as the ceiling,
         which no plan clears (RV-W8 F2), whichever gate refused it. */
      return new PayloadTooLargeException({
        code: 'GIT_REPOSITORY_CEILING_EXCEEDED',
        message: `${ceilingRefusalMarker} — ${error.message}`,
      });
    }
    case 'loose-objects':
    case 'connectivity': {
      return new UnprocessableEntityException({
        code: 'GIT_PUSH_NOT_COMMITTABLE',
        message: error.message,
      });
    }
    case 'missing-pack': {
      /* Terminal, not retryable (D22, L6-F8): the manifest names a pack the
         store does not hold, and only an operator restore repairs that. A
         `500` rather than a `503`, so it never widens the retryable class,
         and a sentence opening with the marker so a leg that sees only text
         (stock git's `text/plain` body) can classify it too. The store's own
         sentence names internal keys, so it goes to the log instead. */
      logger.error({ message: error.message }, 'A repository manifest names a pack the store does not hold');
      return new InternalServerErrorException({
        code: 'GIT_REPOSITORY_INCOMPLETE',
        message: `${incompleteRepositoryMarker} — it is missing data only an operator restore brings back; retrying will not help.`,
      });
    }
  }
};

/** The `code` an HTTP refusal carries in its body, when it carries one. */
export const refusalCode = (error: unknown): string | undefined => {
  if (!(error instanceof HttpException)) {
    return undefined;
  }
  const { code } = error.getResponse() as { code?: unknown };
  return typeof code === 'string' ? code : undefined;
};
