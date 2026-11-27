import { appMetaConfig } from '@taucad/ui-core/constants/meta.constants';

/**
 * The payment actions a desktop opened in the system browser (adaptive app deployment mode D14): their ids, not secret,
 * per financial identity, for 24 hours, so a restart does not lose an outcome. The owner's purge clears them; nothing
 * here moves money. Never throws: a blocked or corrupt store reads as empty. The purge lives apart, in Core
 * (`pending-payment-actions-purge.ts`).
 */

/** How long a stored action is followed. Milliseconds. @public */
export const pendingPaymentActionLifetimeMilliseconds = 24 * 60 * 60 * 1000;

/* `pending-payment-actions-purge.ts` repeats this key: the purge is Core and this store is the Cloud chunk's, so they
 * share no module (gate G1). Its test holds the two together. */
const storageKey = `${appMetaConfig.databasePrefix}pending-payment-actions`;

/** One stored action. @public */
export type PendingPaymentAction = Readonly<{
  actionId: string;
  environment: string;
  ownerId: string;
  openedAt: number;
}>;

const read = (): PendingPaymentAction[] => {
  try {
    const raw = globalThis.localStorage.getItem(storageKey);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is PendingPaymentAction =>
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as PendingPaymentAction).actionId === 'string' &&
            typeof (entry as PendingPaymentAction).environment === 'string' &&
            typeof (entry as PendingPaymentAction).ownerId === 'string' &&
            typeof (entry as PendingPaymentAction).openedAt === 'number',
        )
      : [];
  } catch {
    return [];
  }
};

const write = (entries: readonly PendingPaymentAction[]): void => {
  try {
    if (entries.length === 0) {
      globalThis.localStorage.removeItem(storageKey);
    } else {
      globalThis.localStorage.setItem(storageKey, JSON.stringify(entries));
    }
  } catch {
    /* Best effort: the outcome is also on the web, where Stripe returned. */
  }
};

/**
 * Remember an action this window opened in the browser.
 *
 * @param entry - The action and its identity.
 * @public
 */
export const rememberPendingPaymentAction = (entry: PendingPaymentAction): void => {
  write([...read().filter((each) => each.actionId !== entry.actionId), entry]);
};

/**
 * The actions an identity still follows, dropping the expired ones.
 *
 * @param identity - The environment and owner.
 * @param now - Epoch milliseconds.
 * @returns The action ids, oldest first.
 * @public
 */
export const pendingPaymentActions = (
  identity: Readonly<{ environment: string; ownerId: string }>,
  now: number,
): string[] => {
  const all = read();
  const live = all.filter((entry) => now - entry.openedAt < pendingPaymentActionLifetimeMilliseconds);
  if (live.length !== all.length) {
    write(live);
  }
  return live
    .filter((entry) => entry.environment === identity.environment && entry.ownerId === identity.ownerId)
    .map((entry) => entry.actionId);
};

/**
 * Forget one action, once its outcome was announced in an end state.
 *
 * @param actionId - The action.
 * @public
 */
export const forgetPendingPaymentAction = (actionId: string): void => {
  write(read().filter((entry) => entry.actionId !== actionId));
};
