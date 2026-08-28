import {
  Activity,
  Clipboard,
  Download,
  FileBox,
  Files,
  GalleryThumbnails,
  History,
  ImageDown,
  Info,
  RotateCcw,
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
import { useVisibleRevisions } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { useProjectShare } from '#routes/w.$workspace.$project/project-share-action.js';
import { useFeature } from '#flags/use-feature.js';
import { useHeadlessImageService } from '#providers/headless-image-provider.js';
import { captureCadImages } from '#services/headless-capture.js';
import { useCameraRegistryVersion } from '#hooks/use-graphics.js';
import { getGraphicsCameraState, hasGraphicsCameraRig } from '#services/graphics-camera-registry.js';

export function ProjectCommandPaletteItems({ match }: { readonly match: UIMatch }): undefined {
  const { projectRef, geometryUnits, mainEntryPath } = useProject();
  const { openPanel } = useProjectWorkspace();
  const { openShare } = useProjectShare();
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
  useCameraRegistryVersion();
  const cameraReady = hasGraphicsCameraRig(mainGraphicsRef);
  const canCapturePng = Boolean(
    geometryFormat && geometryFormat !== 'webrtc' && (geometryFormat !== 'gltf' || cameraReady),
  );
  const fileCount = fileTree.size;

  // Chat-restore time-travel (R13) — keyboard-first discovery of the pane + redo.
  const { returnToLatest } = useRestoreToPoint();
  const { canReturnToLatest } = useVisibleRevisions();

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
      fileSystem: fileManager.runtimeFileSystem,
      recipe: { purpose: 'utility', mode: 'current' },
    });
    const file = files[0]!;
    return new Blob([file.bytes], { type: file.mimeType });
  }, [fileManager.runtimeFileSystem, imageService, mainCadRef, mainGraphicsRef]);

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
    // repoints the project record when it settles.
    regenerateThumbnail();
    toast.success('Regenerating thumbnail…');
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
      {
        id: 'share-project',
        label: 'Share project',
        group: 'Project',
        icon: <Share2 />,
        action: openShare,
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
      openShare,
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
    ],
  );

  return undefined;
}
