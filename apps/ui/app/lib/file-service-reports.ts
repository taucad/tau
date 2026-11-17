/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag and context keys are snake_case (blueprint "Sentry events"). */
/**
 * The file service's start reports (desktop resilient startup blueprint D5, Specification "Sentry events").
 *
 * Every report goes through `reportUiError` with the tag `tau_event`, which an alert can filter on. A report never
 * carries a path, a folder name or an error message (Rules for the whole release, 3): only codes, counts, states and
 * the salted root hash below. Codes are passed through {@link reportableCode}, so one that looks like text is dropped.
 */
import { recordActivityBreadcrumb } from '@taucad/ui-core/lib/activity-breadcrumbs';
import type { RootState, RootStatus, SkippedConfigurationEntry } from '@taucad/filesystem';
import { reportUiError } from '#lib/error-reporting.js';

/** Where a start failed (Specification "Renderer file manager"). @public */
export type FileServiceErrorPhase =
  | 'resolveHome'
  | 'connectWorker'
  | 'configureRoots'
  | 'initializeServices'
  | 'watchProxyClosed'
  | 'startDeadline';

/** Whether retrying the same start can help (D3). @public */
export type FileServiceErrorClass = 'transient' | 'deterministic';

/** The `localStorage` key holding this profile's report salt. @public */
export const reportSaltStorageKey = 'tau:report-salt';

const codePattern = /^[\w.-]{1,64}$/u;

/**
 * A code fit to report: an errno, a Tau code or an error name. Anything else, such as text with a path, is `UNKNOWN`.
 *
 * @param code - The candidate.
 * @returns The code, or `UNKNOWN`.
 * @public
 */
export const reportableCode = (code: string | undefined): string =>
  code !== undefined && codePattern.test(code) ? code : 'UNKNOWN';

/** A fixed-message error a report is captured as: its message is the event name and nothing else. */
const reportError = (event: string, name: string): Error => Object.assign(new Error(event), { name });

const toHex = (bytes: Uint8Array<ArrayBuffer>): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * The first 12 hexadecimal characters of SHA-256 over the salt and a storage-root key, so one folder's reports group
 * together on this profile and cannot be matched across profiles.
 *
 * @param storageRootKey - The root's key (`node:<path>`, `webaccess:<workspaceId>`, …).
 * @param salt - This profile's salt.
 * @returns The hash.
 * @public
 */
export async function rootHash(storageRootKey: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}\u0000${storageRootKey}`));
  return toHex(new Uint8Array(digest)).slice(0, 12);
}

/** This profile's salt: 16 random bytes kept in `localStorage`, made on first use; a page without storage gets one per load. */
let pageSalt: string | undefined;
const reportSalt = (): string => {
  try {
    const stored = globalThis.localStorage.getItem(reportSaltStorageKey);
    if (stored !== null && /^[\da-f]{32}$/u.test(stored)) {
      return stored;
    }
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    globalThis.localStorage.setItem(reportSaltStorageKey, salt);
    return salt;
  } catch {
    pageSalt ??= toHex(crypto.getRandomValues(new Uint8Array(16)));
    return pageSalt;
  }
};

/**
 * Count roots by state, for a start report.
 *
 * @param roots - The published statuses.
 * @returns The count of each state present.
 * @public
 */
export const rootsByState = (roots: readonly RootStatus[]): Partial<Record<RootState, number>> => {
  const counts: Partial<Record<RootState, number>> = {};
  for (const { state } of roots) {
    counts[state] = (counts[state] ?? 0) + 1;
  }
  return counts;
};

/** What a start failure is reported with. @public */
export type StartFailureReport = Readonly<{
  phase: FileServiceErrorPhase;
  code: string;
  errorClass: FileServiceErrorClass;
  homeBackend: string | undefined;
  roots: readonly RootStatus[];
}>;

/**
 * Report `file_service.start_failed`; its caller reports once for each machine.
 *
 * @param report - The failure.
 * @public
 */
export function reportFileServiceStartFailed({
  phase,
  code,
  errorClass,
  homeBackend,
  roots,
}: StartFailureReport): void {
  const reported = reportableCode(code);
  void reportUiError(reportError('file_service.start_failed', 'FileServiceStartFailed'), {
    tags: {
      tau_event: 'file_service.start_failed',
      phase,
      code: reported,
      class: errorClass,
      home_backend: reportableCode(homeBackend),
    },
    contexts: { file_service: { roots_by_state: rootsByState(roots) } },
    fingerprint: ['file_service.start_failed', phase, reported],
    level: 'error',
  });
}

/**
 * Report `file_service.entry_skipped` for one configuration entry the authority skipped.
 *
 * @param entry - The skipped entry; only its kind and reason are reported.
 * @public
 */
export function reportFileServiceEntrySkipped({ kind, reason }: SkippedConfigurationEntry): void {
  void reportUiError(reportError('file_service.entry_skipped', 'FileServiceEntrySkipped'), {
    tags: { tau_event: 'file_service.entry_skipped', kind, reason },
    fingerprint: ['file_service.entry_skipped', kind, reason],
    level: 'warning',
  });
}

/**
 * Report `file_service.started_degraded`: the start went on with Home alone because an input could not be read.
 *
 * @param degraded - Which input, and its failure's name.
 * @public
 */
export function reportFileServiceStartedDegraded(degraded: Readonly<{ input: string; errorName: string }>): void {
  const name = reportableCode(degraded.errorName);
  void reportUiError(reportError('file_service.started_degraded', 'FileServiceStartedDegraded'), {
    tags: { tau_event: 'file_service.started_degraded', input: degraded.input, error_name: name },
    fingerprint: ['file_service.started_degraded', degraded.input, name],
    level: 'error',
  });
}

/**
 * Record `file_service.root_unavailable`: a breadcrumb for the trail, and an `info` event that counts the root by its
 * state and code under its salted hash, so later events on the page carry the trail and the root can be counted.
 *
 * @param status - A root that is not available.
 * @public
 */
export async function reportFileServiceRootUnavailable(status: RootStatus): Promise<void> {
  recordActivityBreadcrumb('file_service.root_unavailable');
  const hash = await rootHash(status.storageRootKey, reportSalt());
  const code = reportableCode(status.code);
  void reportUiError(reportError('file_service.root_unavailable', 'FileServiceRootUnavailable'), {
    tags: { tau_event: 'file_service.root_unavailable', state: status.state, code, root_hash: hash },
    fingerprint: ['file_service.root_unavailable', status.state, code],
    level: 'info',
  });
}

/**
 * Report `project_library.worker_failed`: the project library's worker could not start.
 *
 * @param error - The failure; only its name is reported.
 * @public
 */
export function reportProjectLibraryWorkerFailed(error: unknown): void {
  const name = reportableCode(error instanceof Error ? error.name : undefined);
  void reportUiError(reportError('project_library.worker_failed', 'ProjectLibraryWorkerFailed'), {
    tags: { tau_event: 'project_library.worker_failed', error_name: name },
    fingerprint: ['project_library.worker_failed', name],
    level: 'error',
  });
}
