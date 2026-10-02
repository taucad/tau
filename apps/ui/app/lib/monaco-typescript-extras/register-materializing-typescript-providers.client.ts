import type * as Monaco from 'monaco-editor';
import { DefinitionAdapter, ReferenceAdapter } from 'monaco-editor/esm/vs/language/typescript/languageFeatures.js';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { MonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.types.js';
import { MaterializingLibFiles } from '#lib/monaco-typescript-extras/materializing-lib-files.client.js';
import { MaterializingRenameAdapter } from '#lib/monaco-typescript-extras/materializing-rename-adapter.client.js';
import {
  TauImplementationAdapter,
  TauTypeDefinitionAdapter,
} from '#lib/monaco-typescript-extras/tau-ts-definition-adapters.client.js';
import { registerTsRenameParticipant } from '#lib/monaco-typescript-extras/ts-rename-participant.js';
import type { TsRenameWorkerAccessor } from '#lib/monaco-typescript-extras/ts-rename-participant.js';
import type { TauTypeScriptLanguageServiceWorker } from '#lib/monaco-typescript-extras/ts-worker-extras.types.js';

const tsLanguageIds = ['typescript', 'typescriptreact'] as const;
const jsLanguageIds = ['javascript', 'javascriptreact'] as const;

type WorkerAccessor = Awaited<ReturnType<typeof Monaco.typescript.getTypeScriptWorker>>;

/**
 * Backoff for Monaco's lazy per-family `tsMode` / `jsMode` wiring (milliseconds).
 *
 * Both families dynamic-import their mode setup; `getTypeScriptWorker` /
 * `getJavaScriptWorker` can reject with `"<Language> not registered!"` until that
 * chain completes. Bounded retry matches the prior JS-only path so TS and JS stay
 * symmetric (see research: split JS/TS contribution).
 */
const workerActivationBackoff = [0, 16, 64, 256] as const;

function mergeModeConfiguration(
  defaults: Monaco.typescript.LanguageServiceDefaults,
): Monaco.typescript.ModeConfiguration {
  const previous = defaults.modeConfiguration;
  defaults.setModeConfiguration({
    ...previous,
    definitions: false,
    references: false,
    rename: false,
  });
  return previous;
}

/** Resolves after the given milliseconds; thin wrapper around `setTimeout` for `await` use. */
async function sleep(duration: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, duration);
  });
}

/**
 * Resolves the worker accessor after Monaco has finished wiring the requested
 * language family. Exported for unit tests (backoff schedule regression guard).
 */
export async function awaitTypescriptFamilyWorker(
  monaco: typeof Monaco,
  family: 'typescript' | 'javascript',
): Promise<WorkerAccessor> {
  const tryOnce = async (attempt: number): Promise<WorkerAccessor> => {
    try {
      if (family === 'typescript') {
        return await monaco.typescript.getTypeScriptWorker();
      }
      return await monaco.typescript.getJavaScriptWorker();
    } catch (error) {
      if (attempt === workerActivationBackoff.length - 1) {
        throw error;
      }
      const nextAttemptDelay = workerActivationBackoff[attempt + 1] ?? 0;
      await sleep(nextAttemptDelay);
      return tryOnce(attempt + 1);
    }
  };

  return tryOnce(0);
}

function registerAdaptersForLanguageIds(
  options: Readonly<{
    monaco: typeof Monaco;
    workspaceFs: MonacoWorkspaceFs;
    languageIds: readonly string[];
    lib: MaterializingLibFiles;
    worker: WorkerAccessor;
    registered: Monaco.IDisposable[];
    isCancelled: () => boolean;
  }>,
): void {
  const { monaco, workspaceFs, languageIds, lib, worker, registered, isCancelled } = options;

  for (const languageId of languageIds) {
    if (isCancelled()) {
      return;
    }
    registered.push(monaco.languages.registerDefinitionProvider(languageId, new DefinitionAdapter(lib, worker)));
    registered.push(monaco.languages.registerReferenceProvider(languageId, new ReferenceAdapter(lib, worker)));
    registered.push(
      monaco.languages.registerRenameProvider(languageId, new MaterializingRenameAdapter(lib, worker, workspaceFs)),
    );
    registered.push(
      monaco.languages.registerImplementationProvider(languageId, new TauImplementationAdapter(lib, worker)),
    );
    registered.push(
      monaco.languages.registerTypeDefinitionProvider(languageId, new TauTypeDefinitionAdapter(lib, worker)),
    );
  }
}

type FamilySetupOptions = Readonly<{
  monaco: typeof Monaco;
  workspaceFs: MonacoWorkspaceFs;
  family: 'typescript' | 'javascript';
  defaults: Monaco.typescript.LanguageServiceDefaults;
  triggerLanguageIds: readonly string[];
  logLabel: string;
}>;

function createFamilyMaterializingProviders(options: FamilySetupOptions): Monaco.IDisposable {
  const { monaco, workspaceFs, family, defaults, triggerLanguageIds, logLabel } = options;

  const modeState: { modePrevious?: Monaco.typescript.ModeConfiguration } = {};
  const registered: Monaco.IDisposable[] = [];
  const state = { cancelled: false };

  const isCancelled = (): boolean => state.cancelled;
  const isClaimed = (): boolean => modeState.modePrevious !== undefined;

  const setup = async (logErrors: boolean): Promise<void> => {
    if (isCancelled() || isClaimed()) {
      return;
    }
    try {
      const worker = await awaitTypescriptFamilyWorker(monaco, family);
      if (isCancelled() || isClaimed()) {
        return;
      }
      modeState.modePrevious = mergeModeConfiguration(defaults);
      const lib = new MaterializingLibFiles(worker, workspaceFs);
      const languageIds = family === 'typescript' ? tsLanguageIds : jsLanguageIds;
      registerAdaptersForLanguageIds({
        monaco,
        workspaceFs,
        languageIds,
        lib,
        worker,
        registered,
        isCancelled,
      });
    } catch (error) {
      if (logErrors) {
        // oxlint-disable-next-line no-console -- surfacing activation failure matches registry pattern
        console.error(`Failed to register materializing TypeScript providers (${logLabel})`, error);
      }
    }
  };

  const subscriptions: Monaco.IDisposable[] = [];
  for (const id of triggerLanguageIds) {
    subscriptions.push(
      monaco.languages.onLanguage(id, () => {
        void setup(true);
      }),
    );
  }

  queueMicrotask(() => {
    void setup(false);
  });

  return {
    dispose(): void {
      state.cancelled = true;
      for (const subscription of subscriptions) {
        subscription.dispose();
      }
      subscriptions.length = 0;
      if (modeState.modePrevious !== undefined) {
        defaults.setModeConfiguration(modeState.modePrevious);
        modeState.modePrevious = undefined;
      }
      for (const disposable of registered) {
        disposable.dispose();
      }
      registered.length = 0;
    },
  };
}

/**
 * Materializing providers for `.ts` / `.tsx` — gates on both family language ids so
 * `typescriptreact` models trigger registration without waiting on `typescript`.
 */
export function registerMaterializingTsProviders(
  options: Readonly<{
    monaco: typeof Monaco;
    workspaceFs: MonacoWorkspaceFs;
  }>,
): Monaco.IDisposable {
  return createFamilyMaterializingProviders({
    monaco: options.monaco,
    workspaceFs: options.workspaceFs,
    family: 'typescript',
    defaults: options.monaco.typescript.typescriptDefaults,
    triggerLanguageIds: tsLanguageIds,
    logLabel: 'TS family',
  });
}

/**
 * Materializing providers for `.js` / `.jsx`.
 */
export function registerMaterializingJsProviders(
  options: Readonly<{
    monaco: typeof Monaco;
    workspaceFs: MonacoWorkspaceFs;
  }>,
): Monaco.IDisposable {
  return createFamilyMaterializingProviders({
    monaco: options.monaco,
    workspaceFs: options.workspaceFs,
    family: 'javascript',
    defaults: options.monaco.typescript.javascriptDefaults,
    triggerLanguageIds: jsLanguageIds,
    logLabel: 'JS family',
  });
}

/**
 * Register the R17 TS-rename participant on the active Monaco
 * `FileContentService`. Wired separately from the materializing
 * provider registration so the participant is family-global (lives
 * once per Monaco session, not per language id) and matches the
 * upstream tsserver lifecycle.
 *
 * @param options - Monaco + content service + workspace FS handles.
 * @returns A disposer the host invokes on Monaco teardown.
 */
export function registerTsFileRenameParticipant(
  options: Readonly<{
    monaco: typeof Monaco;
    workspaceFs: MonacoWorkspaceFs;
    contentService: FileContentService;
  }>,
): Monaco.IDisposable {
  const accessor: TsRenameWorkerAccessor = async (...resources) => {
    const worker = await awaitTypescriptFamilyWorker(options.monaco, 'typescript');
    return (await worker(...resources)) as unknown as TauTypeScriptLanguageServiceWorker;
  };
  return registerTsRenameParticipant({
    monaco: options.monaco,
    contentService: options.contentService,
    workspaceFs: options.workspaceFs,
    getWorker: accessor,
  });
}
