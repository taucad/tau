import { Clipboard, Download, GalleryThumbnails, History, ImageDown, RotateCcw } from 'lucide-react';
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
import { useRevisionPane } from '#routes/w.$workspace.$project/revision-pane-context.js';
import { useHeadlessImageService } from '#providers/headless-image-provider.js';
import { captureCadImages } from '#services/headless-capture.js';
import { useCameraRegistryVersion } from '#hooks/use-graphics.js';
import { getGraphicsCameraState, hasGraphicsCameraRig } from '#services/graphics-camera-registry.js';

export function ProjectCommandPaletteItems({ match }: { readonly match: UIMatch }): undefined {
  const { projectRef, editorRef, geometryUnits, mainEntryPath } = useProject();
  const mainGraphicsRef = useMainGraphics();
  const { regenerate: regenerateThumbnail } = useThumbnailGenerator();
  const fileManager = useFileManager();
  const imageService = useHeadlessImageService();
  const fileTree = useFileTreeMap();
  const hasExportableGeometry = useSelector(projectRef, (state) => state.context.exportableGeometryUnitPaths.size > 0);
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
  const { setOpen: setRevisionPaneOpen } = useRevisionPane();
  const { returnToLatest } = useRestoreToPoint();
  const { canReturnToLatest } = useVisibleRevisions();

  const handleOpenExporter = useCallback(() => {
    editorRef.send({
      type: 'setPanelState',
      panelState: {
        openPanels: { converter: true },
        mobileActiveTab: 'converter',
      },
    });
  }, [editorRef]);

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
        id: 'revision-history',
        label: 'Open revision history',
        group: 'Revisions',
        icon: <History />,
        action: () => {
          setRevisionPaneOpen(true);
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
        disabled: !hasExportableGeometry,
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
      mainCadRef,
      canCapturePng,
      handleCopyPngToClipboard,
      handleDownloadPng,
      projectName,
      handleOpenExporter,
      hasExportableGeometry,
      handleDownloadZip,
      fileCount,
    ],
  );

  return undefined;
}
