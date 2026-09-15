import {
  Activity,
  Clipboard,
  Cloud,
  CloudOff,
  Download,
  FileBox,
  Files,
  GalleryThumbnails,
  History,
  ImageDown,
  Info,
  RotateCcw,
  Save,
  Share2,
  SlidersHorizontal,
  Terminal,
} from 'lucide-react';
import { useCallback } from 'react';
import { useSelector } from '@xstate/react';
import type { UIMatch } from 'react-router';
import { useProject, useMainGraphics } from '#hooks/use-project.js';
import { toast } from '#components/ui/sonner.js';
import { downloadBlob } from '@taucad/utils/file';
import { useCommandPaletteItems } from '#components/layout/command-palette.js';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useFileTreeMap } from '#hooks/use-file-tree.js';
import { useThumbnailGenerator } from '#hooks/use-thumbnail-generator.js';
import { useRevisions } from '#hooks/use-revisions.js';
import { useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { useSaveRevisionRequest } from '#routes/w.$workspace.$project/revision-save-shortcut.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { useFeature } from '#flags/use-feature.js';
import { useHeadlessImageService } from '#providers/headless-image-provider.js';
import { captureCadImages } from '#services/headless-capture.js';
import { useGraphicsCameraRigQuery } from '#hooks/use-graphics.js';
import { getGraphicsCameraState } from '#services/graphics-camera-registry.js';

export function ProjectCommandPaletteItems({ match }: { readonly match: UIMatch }): React.JSX.Element | undefined {
  const project = useProject({ enableNoContext: true });
  return project === undefined ? undefined : <ProjectCommandPaletteItemsReady match={match} />;
}

function ProjectCommandPaletteItemsReady({ match }: { readonly match: UIMatch }): undefined {
  const { projectRef, geometryUnits, mainEntryPath } = useProject();
  const { openPanel } = useProjectWorkspace();
  const isTauDebugEnabled = useFeature('tauDebug');
  const mainGraphicsRef = useMainGraphics();
  const { regenerate: regenerateThumbnail } = useThumbnailGenerator();
  const fileManager = useFileManager();
  const imageService = useHeadlessImageService();
  const fileTree = useFileTreeMap();
  const project = useSelector(projectRef, (state) => state.context.project);
  const projectName = useSelector(projectRef, (state) => state.context.project?.name) ?? 'file';

  const mainCadRef = geometryUnits.get(mainEntryPath);
  const geometryFormat = useSelector(mainCadRef, (state) => state?.context.geometry?.format);
  const hasCameraRig = useGraphicsCameraRigQuery();
  const cameraReady = hasCameraRig(mainGraphicsRef);
  const canCapturePng = Boolean(
    geometryFormat && geometryFormat !== 'webrtc' && (geometryFormat !== 'gltf' || cameraReady),
  );
  const fileCount = fileTree.size;

  // Chat-restore time-travel (R13) — keyboard-first discovery of the pane + redo.
  const { returnToLatest } = useRestoreToPoint();
  const { canReturnToLatest } = useRevisions();

  /* The Sync region is the surface; the palette is the keyboard path to it
   * (DESIGN: a feature that only exists behind a pointer gesture is
   * unfinished). Where Tau Cloud is comes from `useRevisionCommands`, the one
   * page-side place that knows (S34). */
  const revisionStatus = useRevisionStatus();
  const { syncNow } = useRevisionCommands();
  const saveRevision = useSaveRevisionRequest();
  const isRemoteConnected = revisionStatus?.remote.kind !== undefined && revisionStatus.remote.kind !== 'none';
  const handleOpenSync = useCallback(() => {
    openPanel('revisions');
  }, [openPanel]);

  const handleOpenExporter = useCallback(() => {
    openPanel('export');
  }, [openPanel]);

  const handleDownloadZip = useCallback(async () => {
    if (!project) {
      return;
    }

    toast.promise(
      async () => {
        // Get mechanical asset files
        const zipBlob = await fileManager.getZippedDirectory(`/projects/${project.id}`);
        return zipBlob;
      },
      {
        loading: 'Creating ZIP archive...',
        success(blob) {
          downloadBlob(blob, `${projectName}.zip`);
          return 'ZIP downloaded successfully';
        },
        error: 'Failed to create ZIP archive',
      },
    );
  }, [project, projectName, fileManager]);

  const capturePng = useCallback(async (): Promise<Blob> => {
    if (!mainCadRef) {
      throw new Error('No settled CAD unit is available');
    }
    const files = await captureCadImages({
      cadRef: mainCadRef,
      graphicsRef: mainGraphicsRef,
      cameraState: getGraphicsCameraState(mainGraphicsRef),
      imageService,
      recipe: { purpose: 'utility', mode: 'current' },
    });
    const file = files[0]!;
    return new Blob([file.bytes], { type: file.mimeType });
  }, [imageService, mainCadRef, mainGraphicsRef]);

  const handleDownloadPng = useCallback(
    async (filename: string) => {
      toast.promise(capturePng(), {
        loading: `Downloading ${filename}...`,
        success(blob) {
          downloadBlob(blob, filename);
          return `Downloaded ${filename}`;
        },
        error(error) {
          let message = `Failed to download ${filename}`;
          if (error instanceof Error) {
            message = `${message}: ${error.message}`;
          }

          return message;
        },
      });
    },
    [capturePng],
  );

  const handleUpdateThumbnail = useCallback(() => {
    // Force a regeneration through the thumbnail machine (off the main thread
    // via the runtime image transcoder); the render writes `thumbnail.webp` and
    // repoints the project record when it settles. The toast reflects the
    // machine's terminal result instead of assuming success.
    toast.promise(
      async () => {
        const result = await regenerateThumbnail();
        if (result.status === 'skipped') {
          throw new Error(`Thumbnail skipped: ${result.reason}`);
        }
        if (result.status === 'failed') {
          throw result.error;
        }
      },
      {
        loading: 'Regenerating thumbnail…',
        success: 'Thumbnail updated',
        error: (error: unknown) => (error instanceof Error ? error.message : 'Thumbnail regeneration failed'),
      },
    );
  }, [regenerateThumbnail]);

  const handleCopyPngToClipboard = useCallback(async () => {
    toast.promise(
      async () => {
        const blob = await capturePng();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      },
      {
        loading: `Copying ${projectName}.png to clipboard...`,
        success: `Copied ${projectName}.png to clipboard`,
        error: `Failed to copy ${projectName}.png to clipboard`,
      },
    );
  }, [capturePng, projectName]);

  useCommandPaletteItems(
    match.id,
    (): CommandPaletteItem[] => [
      ...(isRemoteConnected
        ? [
            {
              id: 'disconnect-remote',
              label: 'Change backup',
              group: 'Sync',
              icon: <CloudOff />,
              action: handleOpenSync,
            },
          ]
        : [
            {
              id: 'connect-tau-cloud',
              label: 'Connect Tau Cloud',
              group: 'Sync',
              icon: <Cloud />,
              action: handleOpenSync,
            },
          ]),
      {
        id: 'sync-now',
        label: 'Sync now',
        group: 'Sync',
        icon: <Cloud />,
        action: syncNow,
        visible: isRemoteConnected,
        disabled: revisionStatus?.remote.phase !== 'connected' || revisionStatus.remote.fetchOnly === true,
      },
      {
        id: 'save-revision',
        label: 'Save revision',
        group: 'Revisions',
        icon: <Save />,
        action: saveRevision,
      },
      {
        id: 'share-project',
        label: 'Share project',
        group: 'Project',
        icon: <Share2 />,
        action: () => {
          openPanel('share');
        },
      },
      {
        id: 'open-parameters',
        label: 'Open parameters',
        group: 'Workbench',
        icon: <SlidersHorizontal />,
        action: () => {
          openPanel('parameters');
        },
      },
      {
        id: 'open-files',
        label: 'Open files',
        group: 'Workbench',
        icon: <Files />,
        action: () => {
          openPanel('files');
        },
      },
      {
        id: 'open-model',
        label: 'Open model structure',
        group: 'Workbench',
        icon: <FileBox />,
        action: () => {
          openPanel('model');
        },
      },
      {
        id: 'open-details',
        label: 'Open project details',
        group: 'Workbench',
        icon: <Info />,
        action: () => {
          openPanel('details');
        },
      },
      {
        id: 'open-kernel',
        label: 'Open telemetry',
        group: 'Workbench',
        icon: <Activity />,
        action: () => {
          openPanel('kernel');
        },
        visible: isTauDebugEnabled,
      },
      {
        id: 'open-console',
        label: 'Open console',
        group: 'Workbench',
        icon: <Terminal />,
        action: () => {
          openPanel('console');
        },
        visible: isTauDebugEnabled,
      },
      {
        id: 'revision-history',
        label: 'Open revision history',
        group: 'Revisions',
        icon: <History />,
        action: () => {
          openPanel('revisions');
        },
      },
      {
        id: 'restore-latest-revision',
        label: 'Restore to latest revision',
        group: 'Revisions',
        icon: <RotateCcw />,
        action: returnToLatest,
        disabled: !canReturnToLatest,
      },
      {
        id: 'export',
        label: 'Export',
        group: 'Export',
        icon: <Download />,
        action: handleOpenExporter,
      },
      {
        id: 'download-zip',
        label: 'Download ZIP',
        group: 'Code',
        icon: <Download />,
        action: handleDownloadZip,
        disabled: fileCount === 0,
      },
      {
        id: 'update-thumbnail',
        label: 'Update thumbnail',
        group: 'Preview',
        icon: <GalleryThumbnails />,
        action: handleUpdateThumbnail,
        disabled: !mainCadRef,
      },
      {
        id: 'copy-png',
        label: 'Copy PNG to clipboard',
        group: 'Preview',
        icon: <Clipboard />,
        action: handleCopyPngToClipboard,
        disabled: !canCapturePng,
        visible: import.meta.env.DEV,
      },
      {
        id: 'download-png',
        label: 'Download PNG',
        group: 'Preview',
        icon: <ImageDown />,
        action: async () => handleDownloadPng(`${projectName}.png`),
        disabled: !canCapturePng,
      },
    ],
    [
      handleUpdateThumbnail,
      openPanel,
      isTauDebugEnabled,
      mainCadRef,
      canCapturePng,
      handleCopyPngToClipboard,
      handleDownloadPng,
      projectName,
      handleOpenExporter,
      handleDownloadZip,
      fileCount,
      isRemoteConnected,
      handleOpenSync,
      revisionStatus?.remote.fetchOnly,
      revisionStatus?.remote.phase,
      saveRevision,
      syncNow,
    ],
  );

  return undefined;
}
