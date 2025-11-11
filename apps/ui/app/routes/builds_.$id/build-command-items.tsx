import { Clipboard, Download, GalleryThumbnails, ImageDown } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { useSelector, useActorRef } from '@xstate/react';
import type { UIMatch } from 'react-router';
import type { ExportFormat } from '@taucad/types';
import { fileExtensionFromExportFormat } from '@taucad/types/constants';
import { useBuild } from '#hooks/use-build.js';
import { toast } from '#components/ui/sonner.js';
import { downloadBlob } from '#utils/file.utils.js';
import { screenshotRequestMachine } from '#machines/screenshot-request.machine.js';
import { exportGeometryMachine } from '#machines/export-geometry.machine.js';
import { zipMachine } from '#machines/zip.machine.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { Format3D } from '#components/icons/format-3d.js';
import { useCommandPaletteItems } from '#components/layout/commands.js';
import type { CommandPaletteItem } from '#components/layout/commands.js';

export function BuildCommandPaletteItems({ match }: { readonly match: UIMatch }): undefined {
  const { cadRef: cadActor, graphicsRef: graphicsActor, updateThumbnail, buildRef } = useBuild();
  const geometries = useSelector(cadActor, (state) => state.context.geometries);
  const build = useSelector(buildRef, (state) => state.context.build);
  const buildName = useSelector(buildRef, (state) => state.context.build?.name) ?? 'file';
  const isScreenshotReady = useSelector(graphicsActor, (state) => state.context.isScreenshotReady);

  // Create screenshot request machine instance
  const screenshotActorRef = useActorRef(screenshotRequestMachine, {
    input: { graphicsRef: graphicsActor },
  });

  // Create export geometry machine instance
  const exportActorRef = useActorRef(exportGeometryMachine, {
    input: { cadRef: cadActor },
  });

  // Create zip machine instance
  const zipActorRef = useActorRef(zipMachine, {
    input: { zipFilename: `${buildName}.zip` },
  });

  const handleExport = useCallback(
    async (filename: string, format: ExportFormat) => {
      const fileExtension = fileExtensionFromExportFormat[format];
      const filenameWithExtension = `${filename}.${fileExtension}`;
      toast.promise(
        new Promise<Blob>((resolve, reject) => {
          exportActorRef.send({
            type: 'requestExport',
            format,
            onSuccess(blob) {
              downloadBlob(blob, filenameWithExtension);
              resolve(blob);
            },
            onError(error) {
              reject(new Error(error));
            },
          });
        }),
        {
          loading: `Downloading ${filenameWithExtension}...`,
          success: `Downloaded ${filenameWithExtension}`,
          error(error) {
            let message = `Failed to download ${filenameWithExtension}`;
            if (error instanceof Error) {
              message = `${message}: ${error.message}`;
            }

            return message;
          },
        },
      );
    },
    [exportActorRef],
  );

  const handleDownloadZip = useCallback(async () => {
    if (!build) {
      return;
    }

    toast.promise(
      async () => {
        // Get mechanical asset files
        const mechanicalAsset = build.assets.mechanical;
        if (mechanicalAsset) {
          const files: Array<{ filename: string; content: Uint8Array }> = [];

          // Add all files from the mechanical asset
          for (const [filename, file] of Object.entries(mechanicalAsset.files)) {
            files.push({
              filename,
              content: file.content,
            });
          }

          // Add files to zip machine
          zipActorRef.send({ type: 'addFiles', files });
        }

        // Generate the zip
        zipActorRef.send({ type: 'generate' });

        // Wait for the zip to be ready
        return new Promise<Blob>((resolve, reject) => {
          const subscription = zipActorRef.subscribe((state) => {
            if (state.matches('ready') && state.context.zipBlob) {
              subscription.unsubscribe();
              resolve(state.context.zipBlob);
            } else if (state.matches('error')) {
              subscription.unsubscribe();
              reject(state.context.error ?? new Error('Failed to generate ZIP'));
            }
          });
        });
      },
      {
        loading: 'Creating ZIP archive...',
        success(blob) {
          downloadBlob(blob, `${buildName}.zip`);
          return 'ZIP downloaded successfully';
        },
        error: 'Failed to create ZIP archive',
      },
    );
  }, [build, buildName, zipActorRef]);

  const handleDownloadPng = useCallback(
    async (filename: string) => {
      toast.promise(
        new Promise<Blob>((resolve, reject) => {
          screenshotActorRef.send({
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
    [screenshotActorRef],
  );

  const updateThumbnailScreenshot = useCallback(() => {
    screenshotActorRef.send({
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
          console.log('Thumbnail updated successfully');
        }
      },
      onError(error) {
        console.error('Thumbnail screenshot failed:', error);
      },
    });
  }, [updateThumbnail, screenshotActorRef]);

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
          screenshotActorRef.send({
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
        loading: `Copying ${buildName}.png to clipboard...`,
        success: `Copied ${buildName}.png to clipboard`,
        error: `Failed to copy ${buildName}.png to clipboard`,
      },
    );
  }, [buildName, screenshotActorRef]);

  const handleCopyDataUrlToClipboard = useCallback(async () => {
    toast.promise(
      async () => {
        return new Promise<void>((resolve, reject) => {
          screenshotActorRef.send({
            type: 'requestScreenshot',
            options: {
              output: {
                format: 'image/webp',
                quality: 0.2,
                isPreview: true,
              },
            },
            async onSuccess(dataUrls) {
              try {
                const dataUrl = dataUrls[0];
                if (!dataUrl) {
                  throw new Error('No screenshot data received');
                }

                // Copy to clipboard
                if (globalThis.isSecureContext) {
                  await navigator.clipboard.writeText(dataUrl);
                  resolve();
                } else {
                  console.warn('Clipboard operations are only allowed in secure contexts.');
                  reject(new Error('Clipboard operations are only allowed in secure contexts.'));
                }
              } catch (error) {
                reject(error instanceof Error ? error : new Error('Failed to copy data URL'));
              }
            },
            onError(error) {
              reject(new Error(error));
            },
          });
        });
      },
      {
        loading: `Copying data URL to clipboard...`,
        success: `Copied data URL to clipboard`,
        error: `Failed to copy data URL to clipboard`,
      },
    );
  }, [screenshotActorRef]);

  const handleDownloadMultipleAngles = useCallback(async () => {
    toast.promise(
      async () => {
        return new Promise<void>((resolve, reject) => {
          screenshotActorRef.send({
            type: 'requestScreenshot',
            options: {
              output: {
                format: 'image/png',
                quality: 0.92,
              },
              cameraAngles: [
                { phi: 90, theta: 0 }, // Front view
                { phi: 90, theta: 90 }, // Right view
                { phi: 0, theta: 0 }, // Top view
              ],
            },
            async onSuccess(dataUrls) {
              try {
                // Download each screenshot with a descriptive filename
                const angleNames = ['front', 'right', 'top'];
                for (const [index, dataUrl] of dataUrls.entries()) {
                  // eslint-disable-next-line no-await-in-loop -- we need to wait for the fetch to complete
                  const response = await fetch(dataUrl);
                  // eslint-disable-next-line no-await-in-loop -- we need to wait for the blob to be created
                  const blob = await response.blob();
                  const filename = `${buildName}-${angleNames[index] ?? `angle-${index}`}.png`;
                  downloadBlob(blob, filename);
                }

                resolve();
              } catch (error) {
                reject(error instanceof Error ? error : new Error('Failed to download screenshots'));
              }
            },
            onError(error) {
              reject(new Error(error));
            },
          });
        });
      },
      {
        loading: 'Downloading multiple angle screenshots...',
        success: 'Downloaded multiple angle screenshots',
        error: 'Failed to download multiple angle screenshots',
      },
    );
  }, [buildName, screenshotActorRef]);

  // Subscribe to the cadActor to update the thumbnail when the geometries change
  useEffect(() => {
    const subscription = cadActor.on('geometryEvaluated', (event) => {
      if (event.geometries.length > 0) {
        updateThumbnailScreenshot();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [updateThumbnailScreenshot, cadActor]);

  useCommandPaletteItems(
    match.id,
    (): CommandPaletteItem[] => [
      {
        id: 'download-stl',
        label: 'Download STL',
        group: 'Export',
        icon: <Format3D extension="stl" />,
        action: async () => handleExport(buildName, 'stl'),
        disabled: geometries.length === 0,
      },
      {
        id: 'download-step',
        label: 'Download STEP',
        group: 'Export',
        icon: <Format3D extension="step" />,
        action: async () => handleExport(buildName, 'step'),
        disabled: geometries.length === 0,
      },
      {
        id: 'download-gltf',
        label: 'Download GLTF',
        group: 'Export',
        icon: <SvgIcon id="gltf" />,
        action: async () => handleExport(buildName, 'gltf'),
        disabled: geometries.length === 0,
      },
      {
        id: 'download-glb',
        label: 'Download GLB',
        group: 'Export',
        icon: <SvgIcon id="gltf" />,
        action: async () => handleExport(buildName, 'glb'),
        disabled: geometries.length === 0,
      },
      {
        id: 'download-3mf',
        label: 'Download 3MF',
        group: 'Export',
        icon: <Format3D extension="3mf" />,
        action: async () => handleExport(buildName, '3mf'),
        disabled: geometries.length === 0,
      },
      {
        id: 'download-zip',
        label: 'Download ZIP',
        group: 'Code',
        icon: <Download />,
        action: handleDownloadZip,
        disabled: !build?.assets.mechanical?.files,
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
        id: 'copy-data-url',
        label: 'Copy data URL to clipboard',
        group: 'Preview',
        icon: <Clipboard />,
        action: handleCopyDataUrlToClipboard,
        disabled: !isScreenshotReady,
        visible: import.meta.env.DEV,
      },
      {
        id: 'download-png',
        label: 'Download PNG',
        group: 'Preview',
        icon: <ImageDown />,
        action: async () => handleDownloadPng(`${buildName}.png`),
        disabled: !isScreenshotReady,
      },
      {
        id: 'download-multiple-angles',
        label: 'Download multiple angles',
        group: 'Preview',
        icon: <ImageDown />,
        action: handleDownloadMultipleAngles,
        disabled: !isScreenshotReady,
      },
    ],
    [
      handleUpdateThumbnail,
      isScreenshotReady,
      handleCopyPngToClipboard,
      handleCopyDataUrlToClipboard,
      handleDownloadPng,
      buildName,
      handleExport,
      geometries,
      build,
      handleDownloadZip,
      handleDownloadMultipleAngles,
    ],
  );

  return undefined;
}
