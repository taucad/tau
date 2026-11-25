import { appMetaConfig } from '@taucad/ui-core/constants/meta.constants';

/*
 * The owner's purge of the desktop's pending payment actions (adaptive app deployment mode D14, I5). Core, mounted
 * with the financial session provider in every build; the store it clears (`pending-payment-actions.ts`) belongs to
 * the Cloud chunk, so the key is repeated here and the two share no module (gate G1). Never throws.
 */
const storageKey = `${appMetaConfig.databasePrefix}pending-payment-actions`;

type StoredIdentity = Readonly<{ environment?: unknown; ownerId?: unknown }>;

/**
 * Forget every stored action but `keep`'s, as saved usage is purged.
 *
 * @param keep - The account namespace to keep; omit to forget every one.
 * @public
 */
export const purgePendingPaymentActions = (keep?: Readonly<{ environment: string; ownerId: string }>): void => {
  try {
    const raw = globalThis.localStorage.getItem(storageKey);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    const kept = Array.isArray(parsed)
      ? parsed.filter(
          (entry: unknown) =>
            keep !== undefined &&
            typeof entry === 'object' &&
            entry !== null &&
            (entry as StoredIdentity).environment === keep.environment &&
            (entry as StoredIdentity).ownerId === keep.ownerId,
        )
      : [];
    if (kept.length === 0) {
      globalThis.localStorage.removeItem(storageKey);
    } else {
      globalThis.localStorage.setItem(storageKey, JSON.stringify(kept));
    }
  } catch {
    /* Best effort: an unreadable store is read as empty by its owner too. */
  }
};
