import { createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto';
import type { ShutdownService } from '#lifecycle/shutdown.service.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { mintGrant, storagePath, verifyGrant } from '#api/git/forwarding/contract/grant.js';
import type { StorageGrant, StorageOperation } from '#api/git/forwarding/contract/grant.js';
import type { SigningKey, VerificationKeys } from '#api/git/forwarding/contract/keys.js';
import { ReplayGuard } from '#api/git/forwarding/contract/replay-guard.js';
import { signReceipt } from '#api/git/forwarding/contract/receipt.js';
import type { StorageReceiptFacts } from '#api/git/forwarding/contract/receipt.js';
import type { GitExecutor, GrantFacts } from '#api/git/forwarding/git-executor.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { StorageGitService } from '#api/git/worker/storage-git.service.js';
import type { ReceiptChannel } from '#api/git/worker/storage-git.service.js';
import { objectStoragePreviewWriter } from '#api/projects/project-preview-store.js';
import type { PreviewWriter } from '#api/projects/project-preview-store.js';

/**
 * DC1's in-process fallback: the tau-storage worker run inside the API, which
 * is how an API without `TAU_STORAGE_URL` serves git (a local lease and a
 * `git` child, the pre-DC1 behaviour). It keeps production's git working until
 * a production tau-storage exists; flipping production deletes this module
 * (and its exception in `storage-boundary.test.ts`) and git from the API image.
 *
 * Every call still crosses the grant and receipt contract, under a key pair
 * made for this process at boot, so the worker sees exactly what tau-storage
 * would and no key anyone else holds can sign for it.
 */

/**
 * The object store's preview writer, which the in-process worker writes catalog previews with.
 *
 * @param objects - The API's object-storage driver.
 * @returns The writer.
 */
export const inProcessPreviewWriter = (objects: ObjectStorageService): PreviewWriter =>
  objectStoragePreviewWriter(objects);

/** A signing key and the verification keys that accept it. */
type KeyPair = { readonly signing: SigningKey; readonly verifying: VerificationKeys };

/**
 * A key pair for this process only, never written anywhere.
 *
 * @param name - What the pair signs, as its kid's prefix.
 * @returns The pair.
 */
const processKeyPair = (name: 'grant' | 'receipt'): KeyPair => {
  const kid = `${name}-in-process-${randomBytes(8).toString('hex')}`;
  const { privateKey } = generateKeyPairSync('ed25519');
  return { signing: { kid, key: privateKey }, verifying: new Map([[kid, createPublicKey(privateKey)]]) };
};

/**
 * A receipt channel that signs with `key` and hands a posted receipt to `post`.
 *
 * @param key - The receipt signing key.
 * @param post - Where a posted (post-reply) receipt goes.
 * @returns The channel.
 */
export const inProcessReceiptChannel = (
  key: SigningKey,
  post: (receipt: string) => Promise<unknown>,
): ReceiptChannel => ({
  sign: (facts: StorageReceiptFacts) => signReceipt(facts, { key }),
  async post(facts: StorageReceiptFacts) {
    await post(signReceipt(facts, { key }));
  },
});

/**
 * An executor over a worker in this process: each call mints a grant and
 * verifies it as the worker's HTTP server does, without the HTTP hop.
 *
 * @param args - The worker, and the grant key with the keys that verify it.
 * @returns The executor.
 */
export const createInProcessExecutor = (args: {
  readonly worker: StorageGitService;
  readonly grantKey: SigningKey;
  readonly grantKeys: VerificationKeys;
}): GitExecutor => {
  const { worker } = args;
  const replay = new ReplayGuard();
  const grantFor = (facts: GrantFacts, operation: StorageOperation): StorageGrant => {
    const path = storagePath(facts.project, operation);
    const { token } = mintGrant({ ...facts, method: 'POST', path }, { key: args.grantKey });
    const verified = verifyGrant(token, { keys: args.grantKeys, method: 'POST', path, replay });
    if (!verified.ok) {
      throw new Error(`The in-process grant was refused: ${verified.reason}`);
    }
    worker.assertServable(verified.grant);
    return verified.grant;
  };
  return {
    uploadPack: async (facts, request) => worker.uploadPack({ grant: grantFor(facts, 'git-upload-pack'), ...request }),
    receivePack: async (facts, request) =>
      worker.receivePack({ grant: grantFor(facts, 'git-receive-pack'), ...request }),
    removeRef: async (facts) => worker.removeRef(grantFor(facts, 'remove-ref')),
    derive: async (facts) => worker.derive(grantFor(facts, 'derive')),
    gitRead: async (facts, request) => worker.gitRead(grantFor(facts, 'git-read'), request),
    endRead: async (facts, session) => {
      worker.endReadSession(grantFor(facts, 'git-read'), session);
    },
    tombstone: async (facts) => worker.tombstone(grantFor(facts, 'tombstone')),
    dialect: async () => worker.dialect(),
    putPreview: async (facts, bytes) => worker.putPreview(grantFor(facts, 'preview'), bytes),
  };
};

/**
 * Starts the worker in this process under fresh process keys.
 *
 * @param args - The store, the API's stop signal and metrics, the preview writer, and where post-reply receipts go.
 * @returns The executor and the keys its receipts verify with.
 */
export const startInProcessStorage = (args: {
  readonly store: RepositoryStore;
  readonly shutdown: ShutdownService;
  readonly metrics: MetricsService;
  readonly previews: PreviewWriter;
  readonly applyReceipt: (receipt: string) => Promise<unknown>;
}): { readonly executor: GitExecutor; readonly receiptKeys: VerificationKeys } => {
  const grant = processKeyPair('grant');
  const receipt = processKeyPair('receipt');
  const worker = new StorageGitService({
    store: args.store,
    shutdown: args.shutdown,
    metrics: args.metrics,
    previews: args.previews,
    receipts: inProcessReceiptChannel(receipt.signing, args.applyReceipt),
  });
  /* No slow-body floor in process (review S3): the API never had one before
     DC1, and a client's body here is bounded by the same request timeouts as
     every other API route. tau-storage arms it because its slots are shared. */
  worker.slowBodyMinimumBytes = 0;
  return {
    executor: createInProcessExecutor({ worker, grantKey: grant.signing, grantKeys: grant.verifying }),
    receiptKeys: receipt.verifying,
  };
};
