import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { DatabaseService } from '@taucad/api-database';
import { emailAddressState } from '@taucad/api-database/schema';
import { normalizeEmailAddress } from '#email-address.js';

/** Why Resend will not deliver to an address: it bounced, it reported Tau mail as spam, or it was added by hand. */
export type UndeliverableEmailState = 'bounced' | 'complained' | 'suppressed';

/**
 * Reads Tau's mirror of Resend's suppression list (email bounce blueprint R9 to R11).
 *
 * Resend enforces the list; this answers "will mail to this address arrive?" so that invites skip it
 * before the owner's daily cap, billing parks a notice that cannot reach its owner, and the settings
 * page can tell a signed-in user. Constructed directly by the billing worker, which has no Nest container.
 */
export class EmailDeliverabilityService {
  public constructor(private readonly databaseService: Pick<DatabaseService, 'database'>) {}

  /**
   * The given addresses Resend currently suppresses.
   *
   * @param addresses - Addresses in any case; each is compared in its normalised form.
   * @returns The normalised addresses that are undeliverable.
   */
  public async undeliverableAmong(addresses: readonly string[]): Promise<ReadonlySet<string>> {
    const normalized = [...new Set(addresses.map((address) => normalizeEmailAddress(address)))];
    if (normalized.length === 0) {
      return new Set();
    }
    const rows = await this.databaseService.database
      .select({ address: emailAddressState.address })
      .from(emailAddressState)
      .where(and(inArray(emailAddressState.address, normalized), isNull(emailAddressState.clearedAt)));
    return new Set(rows.map((row) => row.address));
  }

  /**
   * Why one address is undeliverable, if it is.
   *
   * @param address - The address in any case.
   * @returns The state, or `undefined` when mail to it is expected to arrive.
   */
  public async stateOf(address: string): Promise<UndeliverableEmailState | undefined> {
    const rows = await this.databaseService.database
      .select({ state: emailAddressState.state })
      .from(emailAddressState)
      .where(and(eq(emailAddressState.address, normalizeEmailAddress(address)), isNull(emailAddressState.clearedAt)))
      .limit(1);
    return rows[0]?.state;
  }
}
