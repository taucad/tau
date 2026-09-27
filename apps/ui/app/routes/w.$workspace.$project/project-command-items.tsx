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
  RefreshCw,
  Rotate3d,
  Save,
  Share2,
  SlidersHorizontal,
  Terminal,
  Undo2,
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
import { useProjectRole, useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { isSyncReadOnly } from '#hooks/use-cloud-projects.js';
import { useSaveRevisionRequest } from '#routes/w.$workspace.$project/revision-save-shortcut.js';
import { selectStripVerbs, useRevisionFacts } from '#routes/w.$workspace.$project/revision-vocabulary.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { getFileTreeDownloadErrorMessage } from '#routes/w.$workspace.$project/file-tree-download-policy.js';
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

  /* The Sync region is the surface; the palette is the keyboard path to it
   * (DESIGN: a feature that only exists behind a pointer gesture is
   * unfinished). Where Tau Cloud is comes from `useRevisionCommands`, the one
   * page-side place that knows (S34). */
  const revisionStatus = useRevisionStatus();
  const projectRole = useProjectRole();
  /* F1: the palette offers exactly what the Sync region offers. `fetchOnly`
     alone left an enabled *Sync now* for a read collaborator, whose push the
     API refuses — one shared predicate rather than two conditions. */
  const syncReadOnly = isSyncReadOnly(revisionStatus?.remote, projectRole);
  const { syncNow, undo, undoOperation } = useRevisionCommands();
  /* D2, M1: *Undo restore* where the strip offers it and nowhere else — the restore row this
     device's restore machine minted, still the head — in the strip's own words. Never after a
     reload or another device's restore, which the machine would answer UNDO_UNAVAILABLE. */
  const { where, status } = useRevisionFacts();
  /* D15: *Undo* on the same condition as the strip, which *Undo restore* takes over when both apply. */
  const { secondary: undoVerbs } = selectStripVerbs({
    status,
    where,
    undoable: status?.restore.undoable === true,
    canUndo: status?.restore.canUndo === true,
    canWrite: projectRole !== 'read' && projectRole !== 'revoked',
  });
  const canUndoRestore = undoVerbs.includes('Undo restore');
  const canUndo = undoVerbs.includes('Undo');
  const saveRevision = useSaveRevisionRequest();
  const isRemoteConnected = revisionStatus?.remote.kind !== undefined && revisionStatus.remote.kind !== 'none';
  /* HQ7: backup verbs wait until the projection has located the line; before it, they could only fail. */
  const isLineKnown = revisionStatus !== undefined && revisionStatus.line.kind !== 'unknown';
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
      /* `''` is the file manager's own root, which follows the selected
       * checkout: an absolute `/projects/<id>` is a foreign key to this
       * workspace-relative facade, not an alias of its root. */
      async () => fileManager.getZippedDirectory('', { versionedOnly: true }),
      {
        loading: 'Creating ZIP archive...',
        success(blob) {
          downloadBlob(blob, `${projectName}.zip`);
          return 'ZIP downloaded successfully';
        },
        error(error: unknown) {
          return `Failed to create ZIP archive: ${getFileTreeDownloadErrorMessage(error)}`;
        },
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
              id: 'change-backup',
              label: 'Change backup',
              group: 'Revisions',
              icon: <Cloud />,
              action: handleOpenSync,
              visible: isLineKnown,
            },
            /* R29 names two verbs, not one wearing the other's id: *Change* and
               *Disconnect* are different intents and both open the pane, which
               is where the confirmation lives (C47). */
            {
              id: 'disconnect-remote',
              label: 'Disconnect backup',
              group: 'Revisions',
              icon: <CloudOff />,
              action: handleOpenSync,
              visible: isLineKnown,
            },
          ]
        : [
            {
              id: 'connect-tau-cloud',
              label: 'Connect Tau Cloud',
              group: 'Revisions',
              icon: <Cloud />,
              action: handleOpenSync,
            },
          ]),
      {
        id: 'sync-now',
        label: 'Sync now',
        group: 'Revisions',
        icon: <RefreshCw />,
        action: syncNow,
        visible: isRemoteConnected,
        disabled: revisionStatus?.remote.phase !== 'connected' || syncReadOnly,
      },
      {
        id: 'save-revision',
        label: 'Save revision',
        group: 'Revisions',
        icon: <Save />,
        action: saveRevision,
      },
      {
        id: 'undo-restore',
        label: 'Undo restore',
        group: 'Revisions',
        icon: <Undo2 />,
        action: undo,
        visible: canUndoRestore,
      },
      {
        id: 'undo-operation',
        label: 'Undo',
        group: 'Revisions',
        icon: <Undo2 />,
        action: undoOperation,
        visible: canUndo,
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
        id: 'open-kinematics',
        label: 'Open kinematics',
        group: 'Workbench',
        icon: <Rotate3d />,
        action: () => {
          openPanel('kinematics');
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
      isLineKnown,
      handleOpenSync,
      syncReadOnly,
      revisionStatus?.remote.phase,
      saveRevision,
      syncNow,
      undo,
      canUndoRestore,
      undoOperation,
      canUndo,
    ],
  );

  return undefined;
}
