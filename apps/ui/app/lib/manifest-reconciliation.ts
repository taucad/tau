/**
 * Which `tau.json` each open project's loaded manifest was last found to be (STO-25).
 *
 * The manifest observation reads `tau.json` and finds the project it holds equal to those bytes, or reloads it. Each
 * equal finding is recorded here as the SHA-256 of the bytes read, and dropped as soon as the project is no longer
 * those bytes' (a reload, an issue, the observation's end). A finding is also recorded from a project load's own bytes
 * when the observation starts on the very project that load parsed from them (identity, not equality, and only with no
 * manifest issue; `createManifestObservationLogic`), so the first view need not wait for the observation's first read
 * (STO-25 SP6). The revision host publishes the SHA-256 of the
 * `tau.json` a tree write landed with its entry closure (`entryManifest`); a model surface renders from the first view
 * only while the two are the same digest, so it never renders the main entry of a manifest the tree does not hold
 * (I7).
 */
import { useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';
import { sha256Bytes } from '@taucad/utils/hash';

const reconciled = new Map<string, string>();
/* Per project, the latest finding: a digest that settles after a newer finding speaks for nothing. */
const findings = new Map<string, number>();
const changes = new Topic<void>({ name: 'manifest.reconciled' });

const notify = (): void => {
  changes.emit(undefined);
};

const subscribe = (listener: () => void): (() => void) => changes.subscribe(listener);

/* One finding's digest, recorded only while no newer finding has been made since. */
const record = async (projectId: string, finding: number, bytes: Uint8Array<ArrayBuffer>): Promise<void> => {
  try {
    const digest = await sha256Bytes(bytes);
    if (findings.get(projectId) === finding && reconciled.get(projectId) !== digest) {
      reconciled.set(projectId, digest);
      notify();
    }
  } catch (error) {
    console.warn('[manifest] the loaded manifest cannot be named', error);
  }
};

/**
 * Record what the manifest observation found of a project's loaded manifest.
 *
 * @param projectId - The project.
 * @param bytes - The `tau.json` bytes its loaded manifest was found equal to; `undefined` when it is no longer known
 *   to be any bytes' (it is reloading, or the bytes read are not its manifest).
 */
export function noteManifestReconciled(projectId: string, bytes: Uint8Array<ArrayBuffer> | undefined): void {
  const finding = (findings.get(projectId) ?? 0) + 1;
  findings.set(projectId, finding);
  if (bytes === undefined) {
    if (reconciled.delete(projectId)) {
      notify();
    }
    return;
  }
  /*
   * The workspace equals these bytes now. What was recorded stands until their digest is known: it was dropped when
   * the workspace last stopped being some bytes' (a reload), so it names bytes the same manifest was found equal to,
   * and a re-check of the same bytes never closes a surface for the time a digest takes.
   */
  // async-iife: bootstrap -- the digest is recorded once known; until then the manifest is unknown (I7).
  void record(projectId, finding, bytes);
}

/**
 * The SHA-256 of the `tau.json` bytes a project's loaded manifest was last found equal to.
 *
 * @param projectId - The project.
 * @returns The digest, or `undefined` while none is known.
 */
export function reconciledManifest(projectId: string): string | undefined {
  return reconciled.get(projectId);
}

/**
 * {@link reconciledManifest} for a component, kept current.
 *
 * @param projectId - The project.
 * @returns The digest, or `undefined` while none is known.
 */
export function useReconciledManifest(projectId: string): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => reconciled.get(projectId),
    () => undefined,
  );
}
