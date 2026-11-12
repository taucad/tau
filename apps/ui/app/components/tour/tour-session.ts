import { Topic } from '@taucad/events';

/*
 * What the rest of the app knows about the product tour on this page, without loading it: whether a replay was asked
 * for and has not ended, and the tour's last announcement. The tour itself (`tour-runtime.tsx`) is a lazy chunk that
 * reads and writes this while it runs; the live region that reads the announcement stays on the page after the tour
 * leaves it, so "Tour finished" is still heard.
 */

/** What is on the page right now. */
export type TourSessionSnapshot = Readonly<{
  /** A replay was asked for (Help, the palette, or setup's "Take it again") and has not ended. */
  isReplay: boolean;
  /** The polite live region's text. */
  announcement: string;
}>;

const initial: TourSessionSnapshot = Object.freeze({ isReplay: false, announcement: '' });

let snapshot: TourSessionSnapshot = initial;
const changes = new Topic<TourSessionSnapshot>({ name: 'tour.session' });

const update = (patch: Partial<TourSessionSnapshot>): void => {
  const next = { ...snapshot, ...patch };
  if (next.isReplay === snapshot.isReplay && next.announcement === snapshot.announcement) {
    return;
  }
  snapshot = next;
  changes.emit(snapshot);
};

/** The page's tour session: read it with `useSyncExternalStore(tourSession.subscribe, tourSession.read)`. */
export const tourSession = {
  read: (): TourSessionSnapshot => snapshot,
  readInitial: (): TourSessionSnapshot => initial,
  subscribe: (listener: () => void): (() => void) =>
    changes.subscribe(() => {
      listener();
    }),
  /** Ask for a replay: the editor loads the tour, which starts it from tip 1. */
  requestReplay: (): void => {
    update({ isReplay: true });
  },
  /** Close the replay, or record that it ended. */
  endReplay: (): void => {
    update({ isReplay: false });
  },
  announce: (announcement: string): void => {
    update({ announcement });
  },
  /** For tests: forget everything. */
  reset: (): void => {
    snapshot = initial;
    changes.emit(snapshot);
  },
};
