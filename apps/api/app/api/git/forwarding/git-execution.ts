import type { ShutdownService } from '#lifecycle/shutdown.service.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { developmentSigningKeyJson } from '#api/git/forwarding/contract/development-keys.js';
import { parseSigningKey } from '#api/git/forwarding/contract/keys.js';
import type { VerificationKeys } from '#api/git/forwarding/contract/keys.js';
import type { GitExecutor } from '#api/git/forwarding/git-executor.js';
import { startInProcessStorage } from '#api/git/forwarding/in-process-executor.js';
import { StorageForwarder } from '#api/git/forwarding/storage-forwarder.js';
import { StorageRouter } from '#api/git/forwarding/storage-router.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import type { PreviewWriter } from '#api/projects/project-preview-store.js';

/**
 * Where this API runs git (DC1), decided once at boot from `TAU_STORAGE_URL`:
 *
 * - `forwarded`: set. Every git RPC goes to tau-storage behind a signed grant.
 *   There is no fallback: an unreachable tau-storage answers `503
 *   GIT_SERVICE_RESTARTING`, never an in-process run.
 * - `in_process`: unset. The tau-storage worker runs inside the API under
 *   process-only keys (`in-process-executor.ts`): a local lease and a `git`
 *   child, as before DC1. This is production until a production tau-storage
 *   exists; it keeps `main` releasable.
 *
 * The boot log line `git_execution=<mode>` is how DV1 and an operator tell
 * which one a Machine runs.
 */

type GitExecutionMode = 'forwarded' | 'in_process';

/** DC2: how a forwarded request picks its tau-storage member. */
type GitAffinity = 'off' | 'rendezvous';

export type GitExecution = {
  readonly mode: GitExecutionMode;
  /** The affinity in effect: `off` in process, where there is no member to choose. Labels `tau.sync.operation.duration`. */
  readonly affinity: GitAffinity;
  readonly executor: GitExecutor;
  /** In process only: the keys its receipts verify with, which replace the configured receipt keys. */
  readonly receiptKeys: VerificationKeys | undefined;
};

/** Injection token for the boot-time decision. */
export const gitExecutionKey = Symbol('GitExecution');

const refuseDevelopmentKid = (environment: string, kids: readonly string[], name: string): void => {
  if (environment === 'production' && kids.some((kid) => kid.endsWith('-development'))) {
    throw new Error(`${name} must not use the development key in production`);
  }
};

/**
 * Decides and builds this API's git execution, and logs the mode once.
 *
 * @param args - The environment, tau-storage's URL list and grant key, and what an in-process worker needs.
 * @returns The mode, its executor and, in process, its receipt keys.
 * @throws Error In production when the grant key is the development key.
 */
export const createGitExecution = (args: {
  readonly nodeEnvironment: string;
  readonly storageUrl: string | undefined;
  readonly grantSigningKey: string | undefined;
  /** DC2 affinity; absent or `off` forwards as DC1 did. */
  readonly affinity?: GitAffinity;
  readonly metrics: MetricsService;
  readonly store: RepositoryStore;
  readonly shutdown: ShutdownService;
  /** Built only in process, so the forwarded path never touches the preview store. */
  readonly previews: () => PreviewWriter;
  /** Where an in-process worker's post-reply receipts go: the API's own `applyReceipt`. */
  readonly applyReceipt: (receipt: string) => Promise<unknown>;
  readonly logger: { log(fields: Record<string, unknown>, message: string): void };
}): GitExecution => {
  const urls = (args.storageUrl ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  if (urls.length === 0) {
    const storage = startInProcessStorage({
      store: args.store,
      shutdown: args.shutdown,
      metrics: args.metrics,
      previews: args.previews(),
      applyReceipt: args.applyReceipt,
    });
    args.logger.log(
      { gitExecution: 'in_process' },
      'git_execution=in_process: TAU_STORAGE_URL is unset, so git runs in this process',
    );
    return { mode: 'in_process', affinity: 'off', executor: storage.executor, receiptKeys: storage.receiptKeys };
  }
  const key = parseSigningKey(
    args.grantSigningKey ?? developmentSigningKeyJson('grant'),
    'TAU_STORAGE_GRANT_SIGNING_KEY',
  );
  refuseDevelopmentKid(args.nodeEnvironment, [key.kid], 'TAU_STORAGE_GRANT_SIGNING_KEY');
  const affinity = args.affinity ?? 'off';
  args.logger.log(
    { gitExecution: 'forwarded', storageTargets: urls.length, affinity },
    'git_execution=forwarded: every git RPC goes to tau-storage',
  );
  const router =
    affinity === 'rendezvous'
      ? new StorageRouter({
          urls,
          recordMembers: (count) => {
            args.metrics.gitMembers.record(count);
          },
        })
      : undefined;
  return {
    mode: 'forwarded',
    affinity,
    executor: new StorageForwarder({ urls, key, metrics: args.metrics, ...(router === undefined ? {} : { router }) }),
    receiptKeys: undefined,
  };
};
