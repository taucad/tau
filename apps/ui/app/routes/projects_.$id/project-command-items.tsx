import { Clipboard, Download, GalleryThumbnails, ImageDown } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { useSelector } from '@xstate/react';
import { createActor } from 'xstate';
import type { UIMatch } from 'react-router';
import { useProject, useMainGraphics } from '#hooks/use-project.js';
import { toast } from '#components/ui/sonner.js';
import { downloadBlob } from '@taucad/utils/file';
import { screenshotRequestMachine } from '#machines/screenshot-request.machine.js';
import { useCommandPaletteItems } from '#components/layout/command-palette.js';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useFileTreeMap } from '#hooks/use-file-tree.js';

export function ProjectCommandPaletteItems({ match }: { readonly match: UIMatch }): undefined {
  const { geometryUnits, mainEntryFile, updateThumbnail, projectRef, editorRef } = useProject();
  const mainGraphicsRef = useMainGraphics();
  const cadActor = geometryUnits.get(mainEntryFile);
  const fileManager = useFileManager();
  const fileTree = useFileTreeMap();
  const geometry = useSelector(cadActor, (state) => state?.context.geometry);
  const project = useSelector(projectRef, (state) => state.context.project);
  const projectName = useSelector(projectRef, (state) => state.context.project?.name) ?? 'file';

  const isScreenshotReady = useSelector(mainGraphicsRef, (state) => state?.context.isScreenshotReady ?? false);
  const fileCount = fileTree.size;

  // Track active screenshot actors for lifecycle cleanup
  const activeScreenshotActorsRef = useRef(new Set<{ stop: () => void }>());

  useEffect(() => {
    const actors = activeScreenshotActorsRef;
    return () => {
      for (const actor of actors.current) {
        actor.stop();
      }

      actors.current.clear();
    };
  }, []);

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

  // Helper: create a screenshot actor on-demand with the current mainGraphicsRef
  const sendScreenshotRequest = useCallback(
    (event: Parameters<ReturnType<typeof createActor<typeof screenshotRequestMachine>>['send']>[0]) => {
      if (!mainGraphicsRef) {
        return;
      }

      const actor = createActor(screenshotRequestMachine, {
        input: { graphicsRef: mainGraphicsRef },
      });
      const actors = activeScreenshotActorsRef.current;
      actors.add(actor);

      // Auto-stop actor once the screenshot request completes (returns to idle after requesting)
      let sawRequesting = false;
      const subscription = actor.subscribe((snapshot) => {
        if (snapshot.value === 'requesting') {
          sawRequesting = true;
        } else if (sawRequesting) {
          subscription.unsubscribe();
          actor.stop();
          actors.delete(actor);
        }
      });

      actor.start();
      actor.send(event);
    },
    [mainGraphicsRef],
  );

  const handleDownloadPng = useCallback(
    async (filename: string) => {
      toast.promise(
        new Promise<Blob>((resolve, reject) => {
          sendScreenshotRequest({
            type: 'requestScreenshot',
            options: {
              output: {
                format: 'image/png',
                quality: 0.92,
              },
            },
            async onSuccess(dataUrls) {
              try {
                const dataUrl = dataUrls[0];
                if (!dataUrl) {
                  throw new Error('No screenshot data received');
                }

                const response = await fetch(dataUrl);
                const blob = await response.blob();
                resolve(blob);
              } catch (error) {
                reject(error instanceof Error ? error : new Error('Failed to fetch screenshot'));
              }
            },
            onError(error) {
              reject(new Error(error));
            },
          });
        }),
        {
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
        },
      );
    },
    [sendScreenshotRequest],
  );

  const updateThumbnailScreenshot = useCallback(() => {
    sendScreenshotRequest({
      type: 'requestScreenshot',
      options: {
        output: {
          format: 'image/webp',
          quality: 0.92,
        },
        zoomLevel: 1.8,
        cameraAngles: [{ phi: 60, theta: -45 }],
      },
      onSuccess(dataUrls) {
        const dataUrl = dataUrls[0];
        if (dataUrl) {
          updateThumbnail(dataUrl);
        }
      },
      onError(error) {
        console.error('Thumbnail screenshot failed:', error);
      },
    });
  }, [updateThumbnail, sendScreenshotRequest]);

  const handleUpdateThumbnail = useCallback(() => {
    toast.promise(
      async () => {
        updateThumbnailScreenshot();
      },
      {
        loading: 'Updating thumbnail...',
        success: 'Thumbnail updated',
        error: 'Failed to update thumbnail',
      },
    );
  }, [updateThumbnailScreenshot]);

  const handleCopyPngToClipboard = useCallback(async () => {
    toast.promise(
      async () => {
        return new Promise<void>((resolve, reject) => {
          sendScreenshotRequest({
            type: 'requestScreenshot',
            options: {
              output: {
                format: 'image/png',
                quality: 0.92,
                isPreview: false,
              },
            },
            async onSuccess(dataUrls) {
              try {
                const dataUrl = dataUrls[0];
                if (!dataUrl) {
                  throw new Error('No screenshot data received');
                }

                // Convert dataURL to Blob
                const response = await fetch(dataUrl);
                const blob = await response.blob();

                // Copy to clipboard
                await navigator.clipboard.write([
                  new ClipboardItem({
                    [blob.type]: blob,
                  }),
                ]);
                resolve();
              } catch (error) {
                reject(error instanceof Error ? error : new Error('Failed to copy to clipboard'));
              }
            },
            onError(error) {
              reject(new Error(error));
            },
          });
        });
      },
      {
        loading: `Copying ${projectName}.png to clipboard...`,
        success: `Copied ${projectName}.png to clipboard`,
        error: `Failed to copy ${projectName}.png to clipboard`,
      },
    );
  }, [projectName, sendScreenshotRequest]);

  // Subscribe to the cadActor to update the thumbnail when geometry changes.
  useEffect(() => {
    if (!cadActor) {
      return;
    }

    const subscription = cadActor.on('geometryEvaluated', () => {
      // UpdateThumbnailScreenshot();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [updateThumbnailScreenshot, cadActor]);

  useCommandPaletteItems(
    match.id,
    (): CommandPaletteItem[] => [
      {
        id: 'export',
        label: 'Export',
        group: 'Export',
        icon: <Download />,
        action: handleOpenExporter,
        disabled: !geometry,
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
        disabled: !isScreenshotReady,
      },
      {
        id: 'copy-png',
        label: 'Copy PNG to clipboard',
        group: 'Preview',
        icon: <Clipboard />,
        action: handleCopyPngToClipboard,
        disabled: !isScreenshotReady,
        visible: import.meta.env.DEV,
      },
      {
        id: 'download-png',
        label: 'Download PNG',
        group: 'Preview',
        icon: <ImageDown />,
        action: async () => handleDownloadPng(`${projectName}.png`),
        disabled: !isScreenshotReady,
      },
    ],
    [
      handleUpdateThumbnail,
      isScreenshotReady,
      handleCopyPngToClipboard,
      handleDownloadPng,
      projectName,
      handleOpenExporter,
      geometry,
      handleDownloadZip,
      fileCount,
    ],
  );

  return undefined;
}
