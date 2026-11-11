import { Heading } from '@taucad/ui/components/heading';
import { PreviewWorkbenchLayout } from '#components/share/preview-workbench-layout.js';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useSelector } from '@xstate/react';
import { Code, Play } from 'lucide-react';
import { getActiveGroupValues } from '@taucad/types';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '@taucad/ui/components/loader';
import { FileManagerProvider, useFileManager } from '#hooks/use-file-manager.js';
import { ProjectProvider, useParameterSetActor } from '#hooks/use-project.js';
import { EditorDocumentSessionProvider } from '#hooks/use-editor-document-session.js';
import { WebglContextTrackerProvider } from '@taucad/viewer/hooks/use-webgl-context-tracker';
import { PublicationTopbar } from '#components/share/publication-topbar.js';
import { ephemeralKernelOptions, ephemeralPreviewStage } from '#constants/ephemeral-kernel-options.js';
import type { ParsedPublication } from '#components/share/parsed-publication.js';
import { useViewPing } from '#components/share/use-view-ping.js';
import { ENV } from '#environment.config.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { recordInteraction } from '#lib/kill-work-context.js';
import { recordKillWork, recordMemoryBreadcrumb } from '#lib/memory-kill-signal.js';
import { killMemory, killMemoryClearAfter, modelKeyOf } from '#lib/kill-memory.js';
import type { PausedState } from '#lib/kill-memory.js';
import { readBuildId } from '#lib/build-identity.js';
import { PausedModelGate } from '#components/share/paused-model-gate.js';
import { onViewerEvent } from '@taucad/viewer/lib/renderer-telemetry';
import { kernelConfigurations } from '@taucad/types/constants';
import { parseShareSlug } from '@taucad/share/locator';

type SharedProjectFiles = Record<string, { content: Uint8Array<ArrayBuffer> }>;

const runConsentStorageKey = (consentKey: string): string => `tau:shared-run-consent:${consentKey}`;
const builtinSlugPrefix = 'builtin~';

const hasSessionRunConsent = (consentKey: string): boolean => {
  try {
    return globalThis.sessionStorage.getItem(runConsentStorageKey(consentKey)) === 'granted';
  } catch {
    return false;
  }
};

const rememberSessionRunConsent = (consentKey: string): void => {
  try {
    globalThis.sessionStorage.setItem(runConsentStorageKey(consentKey), 'granted');
  } catch {
    // Storage can be unavailable (private mode, quota); the gesture still counts for this page.
  }
};

/**
 * Shared models are code that runs on this origin's runtime worker, so a viewer opts in before any kernel starts.
 * Interim control until model code runs on a separate sandbox origin.
 */
/**
 * What the tab-kill marker may say about a share: the provider, and a builtin's public catalog name. A Gist or a
 * Tau publication reference identifies someone's share and is never recorded (crash capture blueprint, Finding 7).
 *
 * @param slug - The route's share slug, or `undefined` for a publication opened by id.
 * @returns The closed fields, and a builtin's kernel.
 */
export const shareWorkOf = (
  slug: string | undefined,
): Readonly<{ shareProvider: string; builtin?: string; kernel?: string }> => {
  if (slug === undefined) {
    return { shareProvider: 'tau' };
  }
  try {
    const locator = parseShareSlug(slug);
    return locator.providerId === 'builtin' && locator.reference !== undefined
      ? // A builtin locator is `<kernel>.<example>`, so it names its kernel before any kernel starts.
        { shareProvider: 'builtin', builtin: locator.reference, kernel: locator.reference.split('.', 1)[0] }
      : { shareProvider: locator.providerId };
  } catch {
    return { shareProvider: 'tau' };
  }
};

/** This build's id as the tab-kill marker records it, so a new build gets one automatic try. */
const currentBuild = (): string | undefined => {
  const id = readBuildId();
  return id === 0 ? undefined : String(id);
};

/** The display name of a runtime kernel id, or the id itself. */
const kernelNameOf = (kernel: string | undefined): string | undefined =>
  kernel === undefined
    ? undefined
    : (kernelConfigurations.find(
        (configuration) => configuration.id === kernel || configuration.backendProvider === kernel,
      )?.name ?? kernel);

/**
 * The paused-model gate's thumbnail: the model's stored `thumbnail.webp`, as an object URL for as long as it shows.
 *
 * @param files - The share's files.
 * @param isShown - Whether the gate shows.
 * @returns The URL, or `undefined` when there is no thumbnail.
 */
const useStoredThumbnail = (files: SharedProjectFiles, isShown: boolean): string | undefined => {
  const thumbnail = files['thumbnail.webp'];
  const url = useMemo(
    () =>
      isShown && thumbnail !== undefined
        ? URL.createObjectURL(new Blob([thumbnail.content], { type: 'image/webp' }))
        : undefined,
    [isShown, thumbnail],
  );
  useEffect(
    () => () => {
      if (url !== undefined) {
        URL.revokeObjectURL(url);
      }
    },
    [url],
  );
  return url;
};

const SharedRunConsent = ({
  title,
  onRun,
}: {
  readonly title: string;
  readonly onRun: () => void;
}): React.JSX.Element => (
  <main className='flex h-dvh items-center justify-center bg-background px-4 py-8' aria-labelledby='shared-run-title'>
    <div className='w-full max-w-md animate-in text-center duration-300 fade-in'>
      <div className='mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted/50 dark:bg-muted/30'>
        <Code className='size-6 text-muted-foreground' aria-hidden />
      </div>
      <Heading level={1} variant='title' id='shared-run-title'>
        {title}
      </Heading>
      <p className='mt-2 text-sm text-muted-foreground'>
        {isDesktopTarget()
          ? 'This model is code written by its author. Running it executes that code in Tau on your computer, with access to your signed-in session. Run it only if you trust where it came from.'
          : 'This model is code written by its author. Running it executes that code in this browser, with access to this site and your signed-in session. Run it only if you trust where it came from.'}
      </p>
      <div className='mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center'>
        <Button type='button' className='flex-1 sm:flex-none' onClick={onRun}>
          <Play className='size-3.5' aria-hidden />
          Run this model
        </Button>
        <Button type='button' variant='outline' className='flex-1 sm:flex-none' asChild>
          <Link to='/'>Go home</Link>
        </Button>
      </div>
    </div>
  </main>
);

export const SharedProjectHydrator = ({
  children,
  files,
  rootDirectory,
  storageRootKey,
}: {
  readonly children: React.ReactNode;
  readonly files: SharedProjectFiles;
  readonly rootDirectory: string;
  readonly storageRootKey: string;
}): React.ReactNode => {
  const { whenServicesReady, workspace, writeFiles } = useFileManager();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    const mounted = { current: false };
    const hydrate = async (): Promise<void> => {
      try {
        await workspace.mount(rootDirectory, {
          backend: 'memory',
          storageRootKey,
          class: 'authored',
        });
        mounted.current = true;
        await writeFiles(files);
        const { treeService } = await whenServicesReady();
        await treeService.listDirectory('');
        if (!cancelled) {
          setState('ready');
        }
      } catch {
        if (!cancelled) {
          setState('error');
        }
      }
    };
    // async-iife: bootstrap
    void hydrate();
    return () => {
      cancelled = true;
      if (mounted.current) {
        workspace.unmount(rootDirectory);
      }
    };
  }, [files, rootDirectory, storageRootKey, whenServicesReady, workspace, writeFiles]);

  if (state === 'error') {
    return (
      <main className='flex h-dvh items-center justify-center bg-background p-6'>
        <p className='text-sm text-feature'>The shared files could not be mounted in memory.</p>
      </main>
    );
  }
  if (state !== 'ready') {
    return (
      <main className='flex h-dvh items-center justify-center bg-background' aria-label='Opening shared files'>
        <Loader className='size-8' />
      </main>
    );
  }
  return children;
};

const SharedProjectTopbar = ({
  publication,
  files,
  archive,
  shareUrl,
  sourceLabel,
  managementActions,
}: {
  readonly publication: ParsedPublication;
  readonly files: Map<string, { filename: string; content: Uint8Array<ArrayBuffer> }>;
  readonly archive?: Uint8Array<ArrayBuffer>;
  readonly shareUrl?: string;
  readonly sourceLabel?: string;
  readonly managementActions?: React.ReactNode;
}): React.JSX.Element => {
  const parameterActor = useParameterSetActor(publication.entryPath);
  const entry = useSelector(parameterActor, (state) => state?.context.current?.entry);
  const parameters = entry ? getActiveGroupValues(entry) : {};

  return (
    <PublicationTopbar
      publication={publication}
      files={files}
      archive={archive}
      shareUrl={shareUrl}
      sourceLabel={sourceLabel}
      managementActions={managementActions}
      parameters={parameters}
    />
  );
};

const SharedProjectViewPing = ({ publication }: { readonly publication: ParsedPublication }): undefined => {
  const parameterActor = useParameterSetActor(publication.entryPath);
  const entry = useSelector(parameterActor, (state) => state?.context.current?.entry);
  const parameters = useMemo(() => (entry ? getActiveGroupValues(entry) : undefined), [entry]);
  useViewPing({ publicationId: publication.id, apiBaseUrl: ENV.TAU_API_URL, parameters });
  return undefined;
};

const SharedProjectLayout = ({
  publication,
  files,
  archive,
  shareUrl,
  sourceLabel,
  managementActions,
}: {
  readonly publication: ParsedPublication;
  readonly files: Map<string, { filename: string; content: Uint8Array<ArrayBuffer> }>;
  readonly archive?: Uint8Array<ArrayBuffer>;
  readonly shareUrl?: string;
  readonly sourceLabel?: string;
  readonly managementActions?: React.ReactNode;
}): React.JSX.Element => {
  return (
    <main className='h-dvh'>
      <PreviewWorkbenchLayout
        renderTopbar={(workbenchTrigger) => (
          <SharedProjectTopbar
            publication={publication}
            files={files}
            archive={archive}
            shareUrl={shareUrl}
            sourceLabel={sourceLabel}
            managementActions={
              <>
                {workbenchTrigger}
                {managementActions}
              </>
            }
          />
        )}
      />
    </main>
  );
};

export const SharedProjectWorkbench = ({
  shouldTrackView = false,
  projectId,
  publication,
  hydratedFiles,
  archive,
  shareUrl,
  sourceLabel,
  managementActions,
  kernel,
}: {
  readonly shouldTrackView?: boolean;
  readonly projectId: string;
  readonly publication: ParsedPublication;
  readonly hydratedFiles: SharedProjectFiles;
  readonly archive?: Uint8Array<ArrayBuffer>;
  readonly shareUrl?: string;
  readonly sourceLabel?: string;
  readonly managementActions?: React.ReactNode;
  /** The model's runtime kernel id, from the share manifest, recorded before any kernel starts. */
  readonly kernel?: string;
}): React.JSX.Element => {
  const instanceId = useId().replaceAll(':', '');
  const previewInstance = `shared-${instanceId}`;
  const rootDirectory = `/previews/${previewInstance}`;
  const storageRootKey = `memory:preview:${previewInstance}`;
  const files = useMemo(
    () =>
      new Map(Object.entries(hydratedFiles).map(([path, file]) => [path, { filename: path, content: file.content }])),
    [hydratedFiles],
  );
  // A memory-mounted project is not on disk, so it renders like a preview: on the ephemeral kernel, bytes staged.
  const projectInput = useMemo(() => ({ stage: ephemeralPreviewStage(hydratedFiles) }), [hydratedFiles]);
  const { slug } = useParams();
  const consentKey = slug ?? publication.id;
  // The owner's own publication and examples bundled with Tau are not third-party code.
  const isTrustedSource = publication.viewerRole === 'owner' || consentKey.startsWith(builtinSlugPrefix);
  const [hasRunConsent, setHasRunConsent] = useState(() => isTrustedSource || hasSessionRunConsent(consentKey));
  const grantRunConsent = useCallback(() => {
    rememberSessionRunConsent(consentKey);
    setHasRunConsent(true);
  }, [consentKey]);
  // Crash capture: a model that stopped the page the last time it opened here is paused, not re-run.
  const modelKey = useMemo(() => modelKeyOf(consentKey), [consentKey]);
  const [paused, setPaused] = useState<PausedState | undefined>(() => killMemory.pausedState(modelKey, currentBuild()));
  const tryOnce = useCallback(() => {
    setPaused(undefined);
  }, []);
  const work = useMemo(() => shareWorkOf(slug), [slug]);
  const isRunning = hasRunConsent && paused === undefined;
  const thumbnailUrl = useStoredThumbnail(hydratedFiles, paused !== undefined);

  // Opening a shared model is the first step of the crash record: before the kernel, the viewer or any render.
  useEffect(() => {
    if (!isRunning) {
      return;
    }
    recordKillWork({ ...work, ...(kernel === undefined ? {} : { kernel }), model: modelKey });
    recordMemoryBreadcrumb('open');
    recordInteraction('open');
  }, [isRunning, kernel, modelKey, work]);

  // A model that reached its first frame and kept the page alive 10 s more is no longer paused here.
  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = onViewerEvent((event) => {
      if (event.event === 'first-frame' && timer === undefined) {
        timer = setTimeout(() => {
          killMemory.clear(modelKey);
        }, killMemoryClearAfter);
      }
    });
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [isRunning, modelKey]);

  if (!hasRunConsent) {
    return <SharedRunConsent title={publication.title} onRun={grantRunConsent} />;
  }

  if (paused !== undefined) {
    const kernelName = kernelNameOf(kernel ?? work.kernel);
    const entryFile = publication.entryPath.split('/').at(-1);
    const facts = [entryFile, kernelName].filter((part) => part !== undefined && part !== '').join(' · ');
    return (
      <PausedModelGate
        state={paused}
        name={publication.title}
        thumbnailUrl={thumbnailUrl}
        facts={facts === '' ? undefined : facts}
        onRun={tryOnce}
      />
    );
  }

  return (
    <FileManagerProvider initialBackend='memory' rootDirectory={rootDirectory}>
      <SharedProjectHydrator files={hydratedFiles} rootDirectory={rootDirectory} storageRootKey={storageRootKey}>
        <WebglContextTrackerProvider>
          <ProjectProvider
            projectId={projectId}
            profile='shared'
            kernelOptionsFactory={ephemeralKernelOptions}
            input={projectInput}
          >
            {shouldTrackView ? <SharedProjectViewPing publication={publication} /> : null}
            <EditorDocumentSessionProvider>
              <SharedProjectLayout
                publication={publication}
                files={files}
                archive={archive}
                shareUrl={shareUrl}
                sourceLabel={sourceLabel}
                managementActions={managementActions}
              />
            </EditorDocumentSessionProvider>
          </ProjectProvider>
        </WebglContextTrackerProvider>
      </SharedProjectHydrator>
    </FileManagerProvider>
  );
};
