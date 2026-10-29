/**
 * A linked checkout's id, derived from its branch (one checkout per branch, revisions policy rule 3).
 *
 * Both git ports name a linked checkout this way, so two devices that open the same branch give it the same id. The
 * id is therefore device state a branch determines: a chat record synced from another device can name a checkout
 * this device has never opened, and the branch it derives from is the portable fact (cross-device handoff XD4).
 */

import { digestHex } from '#object-hash.js';
import type { ObjectFormat } from '#object-hash.js';

const textEncoder = new TextEncoder();

/**
 * The id a linked checkout of `branch` has in a repository of this object format.
 *
 * @param format - The repository's recorded object format.
 * @param branch - The branch, spelled short.
 * @returns Sixteen lowercase hexadecimal characters.
 */
export const checkoutIdOfBranch = (format: ObjectFormat, branch: string): string =>
  digestHex(format, textEncoder.encode(`tau-checkout\0${branch}`)).slice(0, 16);
