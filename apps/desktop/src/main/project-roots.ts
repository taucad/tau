/**
 * The shell's list of directories a renderer may name as a filesystem root,
 * and the E6 fork resolver built over it.
 *
 * L4's contract is explicit about the division: the runtime guarantees the
 * fork context is a bounded flat string record and nothing more — *path trust
 * is the shell's*. So a root becomes admissible exactly two ways: it is the
 * app's own Home directory, or the user picked it in the native directory
 * dialog. A compromised renderer can then only name a directory a human
 * already chose, which is the same boundary `showDirectoryPicker` gives the
 * browser build.
 *
 * The set outlives the session, because the workspace record that names a
 * picked folder does: the renderer stores it in IndexedDB and offers it again
 * on the next launch, so a grant main forgot would answer `EACCES` for a
 * folder the user believes is still connected. This file is the desktop
 * equivalent of a persisted File System Access permission grant.
 */

/* eslint-disable @typescript-eslint/naming-convention -- environment names and Electron privilege keys are not camelCase */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

import type { ElectronRuntimeForkResolver } from '@taucad/runtime/electron/main';

/** Directories the shell will accept as a filesystem root. */
export type ProjectRootRegistry = {
  /** Record a directory the user chose (or the app owns). */
  admit(directory: string): void;
  /** Every admitted directory, resolved. */
  roots(): readonly string[];
  /** Whether `directory` is an admitted root or lives inside one. */
  isTrusted(directory: string): boolean;
};

/** Options for {@link createProjectRootRegistry}. */
export type ProjectRootRegistryOptions = {
  /**
   * File the grants are persisted to, e.g. `userData/granted-roots.json`.
   * Omitted, the registry lives only for this session.
   */
  readonly storePath?: string;
};

/**
 * Open the granted-root registry, restoring any previously granted folders.
 *
 * @param options - Optional persistence location.
 * @returns The registry.
 */
export const createProjectRootRegistry = (options: ProjectRootRegistryOptions = {}): ProjectRootRegistry => {
  const { storePath } = options;
  const admitted = new Set<string>();

  if (storePath !== undefined) {
    try {
      const stored: unknown = JSON.parse(readFileSync(storePath, 'utf8'));
      for (const entry of Array.isArray(stored) ? stored : []) {
        if (typeof entry === 'string' && isAbsolute(entry)) {
          admitted.add(resolve(entry));
        }
      }
    } catch {
      /* No grants yet, or a corrupt file: start empty rather than fail to boot.
       * The user re-picks the folder, which is the same recovery the browser
       * offers when a handle's permission lapses. */
    }
  }

  const persist = (): void => {
    if (storePath === undefined) {
      return;
    }
    try {
      mkdirSync(dirname(storePath), { recursive: true });
      const temporary = `${storePath}.tmp`;
      writeFileSync(temporary, `${JSON.stringify([...admitted], undefined, 2)}\n`, 'utf8');
      renameSync(temporary, storePath);
    } catch {
      /* A grant that cannot be recorded still holds for this session. */
    }
  };

  return {
    admit(directory) {
      const root = resolve(directory);
      if (admitted.has(root)) {
        return;
      }
      admitted.add(root);
      persist();
    },
    roots: () => [...admitted],
    isTrusted(directory) {
      if (!isAbsolute(directory)) {
        return false;
      }
      const candidate = resolve(directory);
      /* Descendants are admitted because projects live *inside* a granted root
       * (`userData/home/<project>`, `<picked>/<project>`); the `sep` suffix
       * keeps `…/home-evil` from matching `…/home`. */
      return [...admitted].some((root) => candidate === root || candidate.startsWith(root + sep));
    },
  };
};

/* Own, enumerable `__proto__` is what a structured-cloned IPC payload can
 * carry, and assigning it onto the sanitized record is the pollution path. */
const unsafeContextKeys: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);
/* One entry (`workspaceRoot`) is all any concern sends today, and a host path
 * is far under 4 KiB — tighter than the runtime's fork-context bounds because
 * this context reaches a launcher rather than a process environment. */
const maxServicesContextEntries = 8;
const maxServicesContextChars = 4096;

/**
 * Validate one renderer-supplied services context into a flat string record.
 *
 * The sibling of `sanitizeForkContext` in `@taucad/runtime/electron/main`, and
 * for the same reason: the renderer names the context, so main owns the shape
 * before anything downstream reads a key out of it. Trust in the *values* is a
 * separate step — {@link ProjectRootRegistry.isTrusted} decides whether a
 * `workspaceRoot` may be served at all.
 *
 * @param payload - Raw `context` field of the port request.
 * @returns The sanitized context, empty when the renderer sent none.
 * @throws When the payload is not a bounded flat record of strings.
 */
export const sanitizeServicesContext = (payload: unknown): Record<string, string> => {
  if (payload === undefined || payload === null) {
    return {};
  }
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Desktop shell: services context must be a string record');
  }
  const entries = Object.entries(payload);
  if (entries.length > maxServicesContextEntries) {
    throw new Error(`Desktop shell: services context exceeds ${String(maxServicesContextEntries)} entries`);
  }
  const context: Record<string, string> = {};
  let characters = 0;
  for (const [key, value] of entries) {
    if (unsafeContextKeys.has(key)) {
      throw new Error(`Desktop shell: services context key "${key}" is not allowed`);
    }
    if (typeof value !== 'string') {
      throw new TypeError(`Desktop shell: services context value for "${key}" is not a string`);
    }
    characters += key.length + value.length;
    if (characters > maxServicesContextChars) {
      throw new Error(`Desktop shell: services context exceeds ${String(maxServicesContextChars)} characters`);
    }
    context[key] = value;
  }
  return context;
};

/** Environment names {@link createKernelForkResolver} may set. */
export const kernelForkEnvAllowlist = ['TAU_PROJECT_ROOT', 'TAU_RUNTIME_DEBUG', 'TAU_NATIVE_CODE_TRUST_FILE'] as const;

/** Options for {@link createKernelForkResolver}. */
export type KernelForkResolverOptions = {
  /** Roots the shell will accept from a renderer. */
  readonly registry: ProjectRootRegistry;
  /** Root used when the renderer names none. */
  readonly defaultRoot: string;
  /** Main-owned marker path for this project's native-code trust state. */
  readonly nativeTrustMarkerPath?: (projectRoot: string) => string;
};

/**
 * Resolve one kernel-utility fork from the renderer's context.
 *
 * Throwing refuses the request outright — the broker forks nothing and reports
 * through `onError`. That is the correct answer to an untrusted root: silently
 * substituting the default would hand the renderer a working kernel over the
 * wrong directory.
 *
 * @param options - Trusted-root registry and the fallback root.
 * @returns A resolver for `registerElectronRuntimeMain`.
 */
export const createKernelForkResolver = (options: KernelForkResolverOptions): ElectronRuntimeForkResolver => {
  return (context) => {
    const requested = context['projectRoot'];
    if (requested !== undefined && !options.registry.isTrusted(requested)) {
      throw new Error(`Desktop shell refused an untrusted project root: ${requested}`);
    }
    const projectRoot = requested === undefined ? resolve(options.defaultRoot) : resolve(requested);
    return {
      env: {
        TAU_PROJECT_ROOT: projectRoot,
        ...(options.nativeTrustMarkerPath
          ? { TAU_NATIVE_CODE_TRUST_FILE: options.nativeTrustMarkerPath(projectRoot) }
          : {}),
        /* One kernel bundle, two definitions: the debug recipe keeps kernel
         * source mapping, so it is selected by environment rather than by a
         * second `utilityEntry` that would duplicate the whole chunk.
         *
         * Unreached today, deliberately kept: the only caller — `apps/ui`'s
         * `desktopKernelOptions` — hardcodes `definition: 'default'`, so the
         * missing link is one literal in a file outside this lane's budget, not
         * anything here. This arm and `debugRuntime` are the shell's half of
         * the E6 contract and cost one branch; removing them would mean
         * rebuilding both when the renderer gains the toggle. */
        ...(context['definition'] === 'debug' ? { TAU_RUNTIME_DEBUG: '1' } : {}),
      },
    };
  };
};
