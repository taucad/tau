import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useSelector } from '@xstate/react';
import { LayoutPriority } from 'allotment';
import { Allotment } from '#components/panes/allotment.js';
import { Code, PanelBottom, Play } from 'lucide-react';
import { getActiveGroupValues } from '@taucad/types';
import { Button } from '@taucad/ui/components/button';
import { Loader } from '#components/ui/loader.js';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from '@taucad/ui/components/drawer';
import { ChatContextInsertionProvider } from '#components/chat/chat-context-insertion.js';
import { FileManagerProvider, useFileManager } from '#hooks/use-file-manager.js';
import { ProjectProvider, useParameterSetActor } from '#hooks/use-project.js';
import { MonacoModelServiceProvider } from '#hooks/use-monaco-model-service.js';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { WebglContextTrackerProvider } from '#hooks/use-webgl-context-tracker.js';
import { ProjectWorkspaceProvider } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { ViewerDockview } from '#routes/w.$workspace.$project/chat-viewer-dockview.js';
import { WorkbenchDockview } from '#routes/w.$workspace.$project/chat-workbench-dockview.js';
import { PublicationTopbar } from '#components/share/publication-topbar.js';
import { ephemeralKernelOptions, ephemeralPreviewStage } from '#constants/ephemeral-kernel-options.js';
import type { ParsedPublication } from '#components/share/parsed-publication.js';

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
export const SharedRunConsent = ({
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
        This model is code written by its author. Running it executes that code in this browser, with access to this
        site and your signed-in session. Run it only if you trust where it came from.
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
        <p className='text-sm text-destructive'>The shared files could not be mounted in memory.</p>
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
  const isMobile = useIsMobile();
  const topbar = (
    <SharedProjectTopbar
      publication={publication}
      files={files}
      archive={archive}
      shareUrl={shareUrl}
      sourceLabel={sourceLabel}
      managementActions={
        isMobile ? (
          <>
            {/* A glyph, like its neighbours at phone widths. A label would overflow the bar below 24rem, and from
                40rem, where the neighbours show theirs, when every action is present. */}
            <DrawerTrigger asChild>
              <Button type='button' size='sm' variant='ghost' aria-label='Workbench' className='size-8 px-0'>
                <PanelBottom className='size-3.5' aria-hidden />
              </Button>
            </DrawerTrigger>
            {managementActions}
          </>
        ) : (
          managementActions
        )
      }
    />
  );

  return (
    <div className='flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-sidebar'>
      <ChatContextInsertionProvider>
        {isMobile ? (
          <>
            {/* The viewer's bottom edge belongs to its controls, so the workbench opens from the top bar. The drawer
                wraps only the bar and its content, so `useIsInsideDrawer` stays false in the viewer. */}
            <Drawer modal>
              {topbar}
              <DrawerContent className='h-[min(78dvh,48rem)] bg-sidebar'>
                <DrawerTitle className='sr-only'>Project workbench</DrawerTitle>
                <DrawerDescription className='sr-only'>
                  Inspect parameters, files, exports, and details.
                </DrawerDescription>
                <div className='min-h-0 flex-1'>
                  <WorkbenchDockview profile='shared' />
                </div>
              </DrawerContent>
            </Drawer>
            <main className='relative min-h-0 flex-1 bg-background'>
              <ViewerDockview profile='shared' />
            </main>
          </>
        ) : (
          <>
            {topbar}
            <main className='min-h-0 flex-1 p-2'>
              <Allotment
                paneLabels={['Viewer', 'Workbench']}
                separator={false}
                proportionalLayout={false}
                className='size-full overflow-hidden rounded-lg border border-border bg-background'
              >
                <Allotment.Pane minSize={360} priority={LayoutPriority.High}>
                  <ViewerDockview profile='shared' />
                </Allotment.Pane>
                <Allotment.Pane minSize={300} preferredSize={380} priority={LayoutPriority.Low}>
                  <div className='size-full border-l border-border'>
                    <WorkbenchDockview profile='shared' />
                  </div>
                </Allotment.Pane>
              </Allotment>
            </main>
          </>
        )}
      </ChatContextInsertionProvider>
    </div>
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
              <ProjectWorkspaceProvider>
                <SharedProjectLayout
                  publication={publication}
                  files={files}
                  archive={archive}
                  shareUrl={shareUrl}
                  sourceLabel={sourceLabel}
                  managementActions={managementActions}
                />
              </ProjectWorkspaceProvider>
            </MonacoModelServiceProvider>
          </ProjectProvider>
        </WebglContextTrackerProvider>
      </SharedProjectHydrator>
    </FileManagerProvider>
  );
};
