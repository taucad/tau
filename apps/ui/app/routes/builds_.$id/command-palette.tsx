import { Clipboard, Download, GalleryThumbnails, ImageDown, Plus, Terminal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useSelector, useActorRef } from '@xstate/react';
import { Link } from 'react-router';
import { BoxDown } from '~/components/icons/box-down.js';
import { Button } from '~/components/ui/button.js';
import { useBuildSelector } from '~/hooks/use-build.js';
import { toast } from '~/components/ui/sonner.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { graphicsActor } from '~/routes/builds_.$id/graphics-actor.js';
import { downloadBlob } from '~/utils/file.js';
import { screenshotRequestMachine } from '~/machines/screenshot-request.js';
import { exportGeometryMachine } from '~/machines/export-geometry.js';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '~/components/ui/command.js';
import { useKeydown } from '~/hooks/use-keydown.js';
import { KeyShortcut } from '~/components/ui/key-shortcut.js';
import type { KeyCombination } from '~/utils/keys.js';

type CommandPaletteItem = {
  id: string;
  label: string;
  group: string;
  icon: JSX.Element;
  action?: () => void;
  disabled?: boolean;
  shortcut?: string;
  link?: string;
};

type CommandPaletteProperties = {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
};

export function CommandPalette({ isOpen, onOpenChange }: CommandPaletteProperties): JSX.Element {
  const shapes = useSelector(cadActor, (state) => state.context.shapes);
  const buildName = useBuildSelector((state) => state.build?.name) ?? 'file';
  const updateThumbnail = useBuildSelector((state) => state.updateThumbnail);
  const code = useSelector(cadActor, (state) => state.context.code);
  const isScreenshotReady = useSelector(graphicsActor, (state) => state.context.isScreenshotReady);

  // Create screenshot request machine instance
  const screenshotActorRef = useActorRef(screenshotRequestMachine, {
    input: { graphicsRef: graphicsActor },
  });

  // Create export geometry machine instance
  const exportActorRef = useActorRef(exportGeometryMachine, {
    input: { cadRef: cadActor },
  });

  const getPngBlob = useCallback(async () => {
    return new Promise<Blob>((resolve, reject) => {
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
    });
  }, [screenshotActorRef]);

  const handleExport = useCallback(
    async (filename: string, format: 'stl' | 'stl-binary' | 'step' | 'step-assembly') => {
      const fileExtension =
        format === 'stl' ? 'stl' : format === 'stl-binary' ? 'stl' : format === 'step' ? 'step' : 'step-assembly';
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
      onOpenChange(false);
    },
    [exportActorRef, onOpenChange],
  );

  const handleDownloadCode = useCallback(async () => {
    toast.promise(
      async () => {
        downloadBlob(new Blob([code]), `${buildName}.ts`);
      },
      {
        loading: `Downloading ${buildName}.ts...`,
        success: `Downloaded ${buildName}.ts`,
        error: `Failed to download ${buildName}.ts`,
      },
    );
    onOpenChange(false);
  }, [code, buildName, onOpenChange]);

  const handleCopyCodeToClipboard = useCallback(async () => {
    toast.promise(
      async () => {
        await navigator.clipboard.writeText(code);
      },
      {
        loading: `Copying ${buildName}.ts to clipboard...`,
        success: `Copied ${buildName}.ts to clipboard`,
        error: `Failed to copy ${buildName}.ts to clipboard`,
      },
    );
    onOpenChange(false);
  }, [code, buildName, onOpenChange]);

  const handleDownloadPng = useCallback(
    async (filename: string) => {
      toast.promise(getPngBlob(), {
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
      onOpenChange(false);
    },
    [getPngBlob, onOpenChange],
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
    onOpenChange(false);
  }, [updateThumbnailScreenshot, onOpenChange]);

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
    onOpenChange(false);
  }, [buildName, screenshotActorRef, onOpenChange]);

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
    onOpenChange(false);
  }, [screenshotActorRef, onOpenChange]);

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
                  const filename = `${buildName}-${angleNames[index] || `angle-${index}`}.png`;
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
    onOpenChange(false);
  }, [buildName, screenshotActorRef, onOpenChange]);

  // Subscribe to the cadActor to update the thumbnail when the shapes change
  useEffect(() => {
    const subscription = cadActor.on('geometryEvaluated', (event) => {
      if (event.shapes.length > 0) {
        updateThumbnailScreenshot();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [updateThumbnailScreenshot]);

  const commandItems = useMemo(
    (): CommandPaletteItem[] => [
      {
        id: 'download-stl',
        label: 'Download STL',
        group: 'Export',
        icon: <BoxDown className="mr-2 size-4" />,
        action: async () => handleExport(buildName, 'stl'),
        disabled: shapes.length === 0,
      },
      {
        id: 'download-step',
        label: 'Download STEP',
        group: 'Export',
        icon: <BoxDown className="mr-2 size-4" />,
        action: async () => handleExport(buildName, 'step'),
        disabled: shapes.length === 0,
      },
      {
        id: 'update-thumbnail',
        label: 'Update thumbnail',
        group: 'Build',
        icon: <GalleryThumbnails className="mr-2 size-4" />,
        action: handleUpdateThumbnail,
        disabled: !isScreenshotReady,
      },
      {
        id: 'copy-png',
        label: 'Copy PNG to clipboard',
        group: 'Build',
        icon: <Clipboard className="mr-2 size-4" />,
        action: handleCopyPngToClipboard,
        disabled: !isScreenshotReady,
      },
      {
        id: 'copy-data-url',
        label: 'Copy data URL to clipboard',
        group: 'Build',
        icon: <Clipboard className="mr-2 size-4" />,
        action: handleCopyDataUrlToClipboard,
        disabled: !isScreenshotReady,
      },
      {
        id: 'download-png',
        label: 'Download PNG',
        group: 'Build',
        icon: <ImageDown className="mr-2 size-4" />,
        action: async () => handleDownloadPng(`${buildName}.png`),
        disabled: !isScreenshotReady,
        shortcut: '⌘I',
      },
      {
        id: 'download-multiple-angles',
        label: 'Download multiple angles',
        group: 'Build',
        icon: <ImageDown className="mr-2 size-4" />,
        action: handleDownloadMultipleAngles,
        disabled: !isScreenshotReady,
      },
      {
        id: 'copy-code',
        label: 'Copy code to clipboard',
        group: 'Code',
        icon: <Clipboard className="mr-2 size-4" />,
        action: handleCopyCodeToClipboard,
        disabled: !code,
        shortcut: '⌘C',
      },
      {
        id: 'download-code',
        label: 'Download code',
        group: 'Code',
        icon: <Download className="mr-2 size-4" />,
        action: handleDownloadCode,
        disabled: !code,
        shortcut: '⌘D',
      },
      {
        id: 'new-build',
        label: 'New build',
        group: 'Platform',
        icon: <Plus className="mr-2 size-4" />,
        link: '/',
        shortcut: '⌥N',
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
      shapes,
      code,
      handleCopyCodeToClipboard,
      handleDownloadCode,
      handleDownloadMultipleAngles,
    ],
  );

  const groupedItems = useMemo(() => {
    const groups: Record<string, CommandPaletteItem[]> = {};

    for (const item of commandItems) {
      groups[item.group] ??= [];

      groups[item.group].push(item);
    }

    return groups;
  }, [commandItems]);

  const runCommand = useCallback((command: CommandPaletteItem) => {
    if (!command.disabled && command.action) {
      command.action();
    }
  }, []);

  return (
    <CommandDialog open={isOpen} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search for actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {Object.entries(groupedItems).map(([groupName, items]) => (
          <CommandGroup key={groupName} heading={groupName}>
            {items.map((item) => {
              const commandItemContent = (
                <CommandItem
                  key={item.id}
                  value={item.label}
                  disabled={item.disabled}
                  onSelect={() => {
                    if (item.link) {
                      onOpenChange(false);
                    } else {
                      runCommand(item);
                    }
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.shortcut ? <KeyShortcut className="ml-auto">{item.shortcut}</KeyShortcut> : null}
                </CommandItem>
              );

              if (item.link) {
                return (
                  <Link key={item.id} to={item.link}>
                    {commandItemContent}
                  </Link>
                );
              }

              return commandItemContent;
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

const commandKeyCombination = {
  key: 'k',
  metaKey: true,
} as const satisfies KeyCombination;

export function CommandPaletteTrigger(): JSX.Element {
  const [open, setOpen] = useState(false);

  const { formattedKeyCombination } = useKeydown(commandKeyCombination, () => {
    setOpen((previous) => !previous);
  });

  return (
    <>
      <Button
        variant="outline"
        className="relative h-8 w-full max-w-sm justify-start rounded-[0.5rem] bg-muted/50 text-sm font-normal text-muted-foreground shadow-none max-md:hidden sm:pr-12 md:w-40 lg:w-64"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Terminal className="mr-2 size-4" />
        <span className="hidden lg:inline-flex">Search commands...</span>
        <span className="inline-flex lg:hidden">Search...</span>
        <KeyShortcut className="absolute top-1/2 right-2 -translate-y-1/2">{formattedKeyCombination}</KeyShortcut>
      </Button>
      <CommandPalette isOpen={open} onOpenChange={setOpen} />
    </>
  );
}
