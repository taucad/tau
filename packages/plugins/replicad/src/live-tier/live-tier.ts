/**
 * The Replicad kernel's live tier (audit T0): per document, an operation tier for lineage reuse inside a
 * build (R6) and a scene table for revisits without replay (R16).
 *
 * A document is its entry path in this worker, so the fresh lifecycle of an agent (open, render, close per
 * tool call) reaches the same tier as an editor's live document. The tier exists only while compute reuse
 * is on; with it off the kernel installs no operation cache and builds no key (I2).
 *
 * @internal
 */
import type * as ReplicadModule from 'replicad';
import { createOperationTier } from '#live-tier/operation-tier.js';
import type { ByteBudget, OperationTier, OperationTierOptions } from '#live-tier/operation-tier.js';

type ReplicadLibrary = typeof ReplicadModule;

/**
 * A finished build as the scene table keeps it. `shapes` are the table's own aliases; `release` deletes them.
 * @internal
 */
export type StoredScene<Scene> = {
  readonly code: string;
  readonly parameters: string;
  readonly scene: Scene;
};

/**
 * Scenes of recent builds, keyed by build key: the bundle output (insensitive to comments and formatting)
 * and the canonical parameters. A hit returns a scene without running any user code.
 * @internal
 */
export type SceneTable<Scene> = {
  readonly size: number;
  /** The scene of this build key, most recent first; undefined when the build has not been seen. */
  lookup(code: string, parameters: Readonly<Record<string, unknown>>): Scene | undefined;
  /** Keeps a build's scene, replacing one of the same build key and evicting the least recently used. */
  admit(code: string, parameters: Readonly<Record<string, unknown>>, scene: Scene): void;
  dispose(): void;
};

/** One document's live tier. @internal */
export type DocumentTier<Scene> = {
  readonly operations: OperationTier;
  readonly scenes: SceneTable<Scene>;
};

/** The kernel's live tier: one document tier per entry path, the least recently used evicted first. @internal */
export type LiveTier<Scene> = {
  readonly documents: number;
  /** The byte budget every document's operation tier shares. */
  readonly budget: Readonly<ByteBudget>;
  forEntry(entryPath: string): DocumentTier<Scene>;
  dispose(): void;
};

/** Bounds of the live tier. @internal */
export type LiveTierOptions<Scene> = Omit<OperationTierOptions, 'library' | 'byteBudget'> & {
  readonly library: ReplicadLibrary;
  /** Estimated resident bytes all documents' operation tiers keep at most (default {@link defaultTierBytes}). */
  readonly byteBudget?: number;
  /** Deletes the aliases a scene owns. */
  readonly releaseScene: (scene: Scene) => void;
  /** Documents kept at most. */
  readonly documentCap?: number;
  /** Scenes kept at most per document. */
  readonly sceneCap?: number;
};

/**
 * Estimated resident bytes the live tier keeps by default, across documents: a sixth of the standard device's 1.5 GiB
 * recycle threshold, so a drag reuses its recent operations without pushing the worker towards a recycle. Phones run
 * without the tier (`computeReuse: false`).
 * @internal
 */
export const defaultTierBytes = 256 * 2 ** 20;

/**
 * Canonical text of a parameter record: keys sorted at every depth, numbers by exact value with `-0` kept.
 * @param value - Parameters as the build received them.
 * @returns The canonical text.
 * @internal
 */
export const canonicalParameters = (value: unknown): string => {
  if (typeof value === 'number') {
    return Object.is(value, -0) ? '-0' : String(value);
  }
  if (value === undefined) {
    return 'u';
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalParameters(entry)).join(',')}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalParameters((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
};

const createSceneTable = <Scene>(cap: number, release: (scene: Scene) => void): SceneTable<Scene> => {
  // Most recently used last; a document keeps tens of scenes at most, so a scan is cheaper than hashing the bundle.
  const scenes: Array<StoredScene<Scene>> = [];
  const remove = (index: number): void => {
    const [removed] = scenes.splice(index, 1);
    if (removed) {
      release(removed.scene);
    }
  };
  return {
    lookup(code, parameters) {
      const key = canonicalParameters(parameters);
      const index = scenes.findLastIndex((stored) => stored.parameters === key && stored.code === code);
      if (index === -1) {
        return undefined;
      }
      const [stored] = scenes.splice(index, 1);
      scenes.push(stored!);
      return stored!.scene;
    },
    admit(code, parameters, scene) {
      const key = canonicalParameters(parameters);
      const index = scenes.findIndex((stored) => stored.parameters === key && stored.code === code);
      if (index !== -1) {
        remove(index);
      }
      scenes.push({ code, parameters: key, scene });
      while (scenes.length > cap) {
        remove(0);
      }
    },
    get size() {
      return scenes.length;
    },
    dispose() {
      while (scenes.length > 0) {
        remove(0);
      }
    },
  };
};

/**
 * Create the kernel's live tier.
 * @param options - The Replicad library, how to release a scene and the bounds.
 * @returns The live tier.
 * @internal
 */
export const createLiveTier = <Scene>(options: LiveTierOptions<Scene>): LiveTier<Scene> => {
  const { releaseScene, documentCap = 4, sceneCap = 8, byteBudget = defaultTierBytes, ...operationOptions } = options;
  const budget: ByteBudget = { limit: byteBudget, used: 0 };
  const documents = new Map<string, DocumentTier<Scene>>();
  const disposeDocument = (document: DocumentTier<Scene>): void => {
    document.scenes.dispose();
    document.operations.dispose();
  };
  return {
    forEntry(entryPath) {
      let document = documents.get(entryPath);
      if (document) {
        documents.delete(entryPath);
      } else {
        document = {
          operations: createOperationTier({ ...operationOptions, byteBudget: budget }),
          scenes: createSceneTable(sceneCap, releaseScene),
        };
      }
      documents.set(entryPath, document);
      for (const [path, oldest] of documents) {
        if (documents.size <= documentCap) {
          break;
        }
        documents.delete(path);
        disposeDocument(oldest);
      }
      // Pressure from earlier builds is relieved by the documents edited least recently, before this one builds.
      for (const other of documents.values()) {
        if (budget.used <= budget.limit) {
          break;
        }
        other.operations.relieve();
      }
      return document;
    },
    get documents() {
      return documents.size;
    },
    budget,
    dispose() {
      for (const document of documents.values()) {
        disposeDocument(document);
      }
      documents.clear();
    },
  };
};

/** Frames the seam and the tier add between a user call and the library implementation it reaches. */
const tierStackFrames = 16;

/**
 * Install a document's operation tier for one build's user code. The returned function removes it, so
 * rendering, export and snapshot calls never pass through the cache. Installing and removing are synchronous
 * and add no frame to the user code's stack.
 *
 * The cache and the raised `Error.stackTraceLimit` stay installed across the user code's awaits. That is sound
 * because a kernel worker runs one operation at a time: its cooperative-abort context is process-global for the
 * same reason, so nothing else calls Replicad until the build ends and this function's result is called.
 * @param library - The Replicad library the user code imports.
 * @param tier - The document's operation tier.
 * @returns Removes the tier and ends the build with its outcome.
 * @internal
 */
export const installOperationTier = (
  library: ReplicadLibrary,
  tier: OperationTier,
): ((outcome: 'delivered' | 'failed') => void) => {
  tier.beginBuild();
  const previous = library.setOperationCache(tier.cache);
  // The tier adds a few frames between user code and the library; an error keeps the frames its report needs.
  const { stackTraceLimit } = Error;
  Error.stackTraceLimit = stackTraceLimit + tierStackFrames;
  return (outcome) => {
    Error.stackTraceLimit = stackTraceLimit;
    library.setOperationCache(previous);
    tier.endBuild(outcome);
  };
};
