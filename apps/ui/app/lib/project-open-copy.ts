import type { RevisionStatusProjection } from '@taucad/revisions';
import { cloudOpenAccountReason } from '#lib/tau-cloud-intent.js';

/*
 * The words a project open says, in one place (cloud open loading states; Progressive Loading Policy rules 18 and 19).
 * The viewer's pill and caption, the project status control, the route's busy markers and its announcement read them
 * here. `project-open-copy.policy.node.test.ts` fails on these words spelled anywhere else, and on retired words
 * anywhere at all.
 *
 * An open says one label from its first step to its last, the request the person made: it never names an internal
 * step, the device or the transport. The device is named only where the next step depends on it (offline).
 */

/** The steps of a project open, as the project's availability names them. They share one label. */
export type ProjectOpenStep = 'connecting' | 'downloading' | 'preparing';

/** What a running project open says. Labels have no ellipsis: a running indicator adds its own ({@link withEllipsis}). */
export const projectOpenCopy = {
  /** The one label, for every step of the open. */
  label: 'Opening project',
  /** The label once the open has made no progress for the slow mark. */
  slowLabel: 'Still opening project',
  /** What to do once the open has made no progress for the slow mark. */
  slowHelper: 'Check your connection, then try again.',
} as const;

/**
 * A running label as a surface that draws no indicator of its own says it.
 *
 * @param label - The label, without an ellipsis.
 * @returns The label with a trailing ellipsis.
 */
export const withEllipsis = (label: string): string => `${label}…`;

/** Where a project open is: a running step, a failure, or ready. */
export type ProjectOpenState = ProjectOpenStep | 'offline' | 'failed' | 'account' | 'ready';

/** A running step's words: the one label and no sentence. */
const running = [withEllipsis(projectOpenCopy.label), ''] as const;

const messages = {
  connecting: running,
  downloading: running,
  preparing: running,
  offline: ['You’re offline', 'This project isn’t on this device yet. Go online, then try again.'],
  failed: ['Couldn’t open this project', 'The download didn’t finish. Try again.'],
  account: ['Sign in to continue', cloudOpenAccountReason],
  ready: ['Project files ready', ''],
} satisfies Record<ProjectOpenState, readonly [string, string]>;

/**
 * What a project open says: the one label while it runs, and a failure's own words, by its class where it names one,
 * so a refused push or a conflicted pull never reads as a download that did not finish.
 *
 * @param state - The project's availability.
 * @param status - The revision status the failure's class is read from.
 * @returns The title and the description.
 */
export const projectFilesCopy = (
  state: ProjectOpenState,
  status: Pick<RevisionStatusProjection, 'remote' | 'sync'> | undefined,
): readonly [string, string] => {
  if (state !== 'failed') {
    return messages[state];
  }
  const reason = status?.remote.reason ?? status?.sync.reason;
  if (reason === 'forbidden' || reason === 'notFound') {
    return ['Project unavailable', 'Your access may have changed. Open History to review the backup.'];
  }
  if (reason === 'unauthorized') {
    return ['Sign in to continue', 'Sign in again to finish opening this project. Open History to sign in.'];
  }
  if (reason === 'rejected') {
    return ['Couldn’t back up this project', 'Changes from this device weren’t backed up. Open History to see why.'];
  }
  if (status?.sync.state === 'conflicted') {
    return [
      'Needs your decision',
      'This project changed here and somewhere else. Open History to choose what to keep.',
    ];
  }
  if (reason === 'quota') {
    return [
      'Storage needs attention',
      'The download could not finish because a storage limit was reached. Open History for details.',
    ];
  }
  return messages.failed;
};

/**
 * Joins a title and its helper into one sentence pair for a screen reader, without a second stop after a title that
 * already ends in "…" or ".". A running open has no helper: it is said by its label alone.
 *
 * @param copy - The title and helper from `projectFilesCopy`.
 * @returns The text a live region announces.
 */
export const announcementOf = ([title, helper]: readonly [string, string]): string => {
  if (helper === '') {
    return title;
  }
  return /[.…]$/u.test(title) ? `${title} ${helper}` : `${title}. ${helper}`;
};
