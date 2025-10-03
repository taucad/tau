import {
  Clipboard,
  Cog,
  Download,
  GalleryThumbnails,
  ImageDown,
  List,
  LogIn,
  LogOut,
  Plus,
  Terminal,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector, useActorRef } from '@xstate/react';
import { Link, useNavigate } from 'react-router';
import { useAuthenticate } from '@daveyplate/better-auth-ui';
import { Button } from '#components/ui/button.js';
import { useBuildSelector } from '#hooks/use-build.js';
import { toast } from '#components/ui/sonner.js';
import { cadActor } from '#routes/builds_.$id/cad-actor.js';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';
import { downloadBlob } from '#utils/file.js';
import { screenshotRequestMachine } from '#machines/screenshot-request.machine.js';
import { exportGeometryMachine } from '#machines/export-geometry.machine.js';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '#components/ui/command.js';
import { useKeydown } from '#hooks/use-keydown.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import type { KeyCombination } from '#utils/keys.js';
import type { ExportFormat } from '#types/kernel.types.js';
import { extensionFromFormat } from '#constants/kernel.constants.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { Format3D } from '#components/icons/format-3d.js';

type CommandPaletteItem = {
  id: string;
  label: string;
  group: string;
  icon: React.JSX.Element;
  action?: () => void;
  disabled?: boolean;
  shortcut?: string;
  link?: string;
  visible?: boolean;
};

type CommandPaletteProperties = {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
};

export function CommandPalette({ isOpen, onOpenChange }: CommandPaletteProperties): React.JSX.Element {
  const navigate = useNavigate();
  const geometries = useSelector(cadActor, (state) => state.context.geometries);
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

  const { data: authData } = useAuthenticate({ enabled: false });

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
    async (filename: string, format: ExportFormat) => {
      const fileExtension = extensionFromFormat[format];
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
    onOpenChange(false);
  }, [buildName, screenshotActorRef, onOpenChange]);

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
  }, [updateThumbnailScreenshot]);

  const commandItems = useMemo(
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
      {
        id: 'download-code',
        label: 'Download code',
        group: 'Code',
        icon: <Download />,
        action: handleDownloadCode,
        disabled: !code,
      },
      {
        id: 'new-build-from-prompt',
        label: 'New build (from prompt)',
        group: 'Builds',
        icon: <Plus />,
        link: '/',
        shortcut: '⌃N',
      },
      {
        id: 'new-build-from-template',
        label: 'New build (from code)',
        group: 'Builds',
        icon: <Plus />,
        link: '/builds/new',
      },
      {
        id: 'all-builds',
        label: 'All builds',
        group: 'Builds',
        icon: <List />,
        link: '/builds/library',
        shortcut: '⌃B',
      },
      {
        id: 'open-settings',
        label: 'Open settings',
        group: 'Settings',
        icon: <Cog />,
        link: '/settings',
        visible: Boolean(authData),
      },
      {
        id: 'sign-in',
        label: 'Sign in',
        group: 'Settings',
        icon: <LogIn />,
        link: '/auth/sign-in',
        visible: !authData,
      },
      {
        id: 'sign-out',
        label: 'Sign out',
        group: 'Settings',
        icon: <LogOut />,
        link: '/auth/sign-out',
        visible: Boolean(authData),
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
      code,
      handleDownloadCode,
      handleDownloadMultipleAngles,
      authData,
    ],
  );

  const groupedItems = useMemo(() => {
    const groups: Record<string, CommandPaletteItem[]> = {};

    for (const item of commandItems) {
      if (item.visible === false) {
        continue;
      }

      groups[item.group] ??= [];

      groups[item.group]!.push(item);
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
      <CommandList className="pb-1">
        <CommandEmpty>No results found.</CommandEmpty>
        {Object.entries(groupedItems).map(([groupName, items]) => (
          <CommandGroup key={groupName} heading={groupName}>
            {items.map((item) => {
              const commandItemContent = (
                <CommandItem
                  key={item.id}
                  value={item.label}
                  disabled={item.disabled}
                  className="h-9"
                  onSelect={() => {
                    if (item.link) {
                      onOpenChange(false);
                      void navigate(item.link);
                    } else {
                      runCommand(item);
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  {item.shortcut ? <KeyShortcut className="ml-auto">{item.shortcut}</KeyShortcut> : null}
                </CommandItem>
              );

              if (item.link) {
                return (
                  <Link key={item.id} tabIndex={-1} to={item.link}>
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

export function CommandPaletteTrigger(): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const { formattedKeyCombination } = useKeydown(commandKeyCombination, () => {
    setOpen((previous) => !previous);
  });

  return (
    <>
      <Button
        variant="outline"
        className="relative h-8 w-full max-w-sm justify-start rounded-lg bg-sidebar dark:bg-sidebar text-sm font-normal text-muted-foreground shadow-none max-md:hidden sm:pr-12 md:w-40"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Terminal />
        <span className="inline-flex">Search...</span>
        <KeyShortcut className="absolute top-1/2 right-2 -translate-y-1/2">{formattedKeyCombination}</KeyShortcut>
      </Button>
      <CommandPalette isOpen={open} onOpenChange={setOpen} />
    </>
  );
}
