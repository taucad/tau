/**
 * The writes this page owes now (A7c; D26 as amended): every record store with an edit not yet saved, every view whose
 * section is still inside graphics' quiet gate, and every project or editor store waiting for its debounce or writing.
 * `environment` holds its `beforeunload` producer stage only while one is owed, so a settled page stays eligible for the
 * back/forward cache.
 *
 * It is a host object of the page, like the view stores' active writes: each owner takes a debt with
 * {@link oweRecordWrite} and pays it when nothing is owed, and the composition hands {@link owedRecordWrites} to
 * `environment` as its port.
 *
 * @module
 */
import { Topic } from '@taucad/events';

const debts = new Set<symbol>();
const changes = new Topic<void>({ name: 'owed-record-writes' });

/**
 * Take one debt, held until the returned release is called; a second call of the release does nothing.
 *
 * @returns The release.
 * @public
 */
export const oweRecordWrite = (): (() => void) => {
  const debt = Symbol('owed record write');
  debts.add(debt);
  if (debts.size === 1) {
    changes.emit(undefined);
  }
  return () => {
    if (debts.delete(debt) && debts.size === 0) {
      changes.emit(undefined);
    }
  };
};

/**
 * Whether the page owes a record write, and when that changes: the port `environment` follows.
 *
 * @public
 */
export const owedRecordWrites = {
  owes: (): boolean => debts.size > 0,
  subscribe: (listener: () => void): (() => void) => changes.subscribe(listener),
} as const;

/**
 * Follow whether one owner owes a write: a debt is held while `owes` reports one, and paid when it no longer does.
 *
 * @returns The follower: call it with each reading, and with `false` when the owner stops.
 * @public
 */
export const followOwedWrite = (): ((owes: boolean) => void) => {
  let release: (() => void) | undefined;
  return (owes) => {
    if (owes && release === undefined) {
      release = oweRecordWrite();
    } else if (!owes && release !== undefined) {
      release();
      release = undefined;
    }
  };
};
