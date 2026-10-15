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
import { MonacoModelServiceProvider } from '#hooks/use-monaco-model-service.js';
import { WebglContextTrackerProvider } from '@taucad/viewer/hooks/use-webgl-context-tracker';
import { PublicationTopbar } from '#components/share/publication-topbar.js';
import { ephemeralKernelOptions, ephemeralPreviewStage } from '#constants/ephemeral-kernel-options.js';
import type { ParsedPublication } from '#components/share/parsed-publication.js';
import { isDesktopTarget } from '#lib/build-target.js';

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
      {/* oxlint-disable-next-line tau-lint/no-raw-page-heading -- Full-screen gate, laid out like PublicationLockScreen rather than a product page. */}
      <h1 id='shared-run-title' className='text-xl font-semibold tracking-tight'>
        {title}
      </h1>
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
  projectId,
  publication,
  hydratedFiles,
  archive,
  shareUrl,
  sourceLabel,
  managementActions,
}: {
  readonly projectId: string;
  readonly publication: ParsedPublication;
  readonly hydratedFiles: SharedProjectFiles;
  readonly archive?: Uint8Array<ArrayBuffer>;
  readonly shareUrl?: string;
  readonly sourceLabel?: string;
  readonly managementActions?: React.ReactNode;
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

  if (!hasRunConsent) {
    return <SharedRunConsent title={publication.title} onRun={grantRunConsent} />;
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
            <MonacoModelServiceProvider>
              <SharedProjectLayout
                publication={publication}
                files={files}
                archive={archive}
                shareUrl={shareUrl}
                sourceLabel={sourceLabel}
                managementActions={managementActions}
              />
            </MonacoModelServiceProvider>
          </ProjectProvider>
        </WebglContextTrackerProvider>
      </SharedProjectHydrator>
    </FileManagerProvider>
  );
};
