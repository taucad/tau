import type { RevisionStatusProjection } from '@taucad/revisions';
import { cloudOpenAccountReason } from '#lib/tau-cloud-intent.js';

/*
 * The words a project open says, in one place (cloud open loading states). The viewer's pill and caption, the project
 * placeholder, the project status control and the route's busy markers all read them here, so the steps say the same
 * thing wherever they show. `project-open-copy.policy.node.test.ts` fails on these words spelled anywhere else.
 */

/** The steps of a project open on this device, as the project's availability names them. */
export type ProjectOpenStep = 'connecting' | 'downloading' | 'preparing';

/** What one open step says. */
export type ProjectOpenStepCopy = Readonly<{
  /** The step's words, without an ellipsis: a running indicator adds its own (`WaitIndicator`, {@link withEllipsis}). */
  label: string;
  /** The sentence under or beside the label. */
  helper: string;
  /** The label once the step has run past its slow mark, without an ellipsis. */
  slowLabel?: string;
  /** What to do once the step has run past its slow mark. */
  slowHelper?: string;
}>;

/** Each open step's words. The viewer's caption leaves out the opening step's helper: its pill already says it. */
export const projectOpenCopy = {
  connecting: {
    label: 'Opening project',
    helper: 'Opening this project on this device.',
  },
  downloading: {
    label: 'Downloading files',
    helper: 'Bringing this project to this device.',
    slowLabel: 'Still downloading files',
    slowHelper: 'Check your connection, then try again.',
  },
  preparing: {
    label: 'Preparing files',
    helper: 'Getting your files ready to open.',
  },
} as const satisfies Record<ProjectOpenStep, ProjectOpenStepCopy>;

/**
 * A running label as a surface that draws no indicator of its own says it.
 *
 * @param label - The label, without an ellipsis.
 * @returns The label with a trailing ellipsis.
 */
export const withEllipsis = (label: string): string => `${label}…`;

/** Where a project open is on this device: a running step, a failure, or ready. */
export type ProjectOpenState = ProjectOpenStep | 'offline' | 'failed' | 'account' | 'ready';

const stepMessage = (step: ProjectOpenStep): readonly [string, string] => [
  withEllipsis(projectOpenCopy[step].label),
  projectOpenCopy[step].helper,
];

const messages = {
  connecting: stepMessage('connecting'),
  downloading: stepMessage('downloading'),
  preparing: stepMessage('preparing'),
  offline: ['You’re offline', 'This project isn’t on this device yet. Go online, then try again.'],
  failed: ['Couldn’t open this project', 'The download didn’t finish. Try again.'],
  account: ['Sign in to continue', cloudOpenAccountReason],
  ready: ['Project files ready', ''],
} satisfies Record<ProjectOpenState, readonly [string, string]>;

/**
 * What the project placeholder says: the failure's own class where it names one, so a refused push or a conflicted
 * pull never reads as a download that did not finish.
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
