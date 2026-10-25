import { developmentPublicKeysJson, developmentSigningKeyJson } from '#api/git/forwarding/contract/development-keys.js';
import { parsePublicKeys, parseSigningKey } from '#api/git/forwarding/contract/keys.js';
import type { GitExecutor } from '#api/git/forwarding/git-executor.js';
import { createInProcessExecutor, inProcessReceiptChannel } from '#api/git/forwarding/in-process-executor.js';
import type { ReceiptChannel, StorageGitService } from '#api/git/worker/storage-git.service.js';

/**
 * The suites' executor (DC1): tau-api's `GitRepositoryService` wired to an
 * in-process tau-storage `StorageGitService`, the same executor an API without
 * `TAU_STORAGE_URL` runs (`forwarding/in-process-executor.ts`), here under the
 * development keys so a suite can sign and verify receipts itself. The HTTP
 * framing and the forwarder are proved by `storage-hop.integration.test.ts`.
 */

const grantKey = parseSigningKey(developmentSigningKeyJson('grant'), 'grant');
const grantKeys = parsePublicKeys(developmentPublicKeysJson('grant'), 'grant');
const receiptKey = parseSigningKey(developmentSigningKeyJson('receipt'), 'receipt');

/**
 * The development receipt channel: signs with the development receipt key and
 * hands a posted receipt to `post`, which a suite points at the API service.
 *
 * @param post - Where a posted receipt goes; dropped when absent.
 * @returns The channel.
 */
export const loopbackReceiptChannel = (post?: (receipt: string) => Promise<unknown>): ReceiptChannel =>
  inProcessReceiptChannel(receiptKey, async (receipt) => post?.(receipt));

/**
 * @param worker - The in-process tau-storage service.
 * @returns An executor over it.
 */
export const loopbackExecutor = (worker: StorageGitService): GitExecutor =>
  createInProcessExecutor({ worker, grantKey, grantKeys });
