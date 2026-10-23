/**
 * What the page adds to the shared viewer bar (workbench parity PAR-8), as the Tau app adds its own: Capture, which
 * saves the canvas as a PNG under the project's `exports/` (`app_save_capture`), and the render timeout in Viewer
 * settings, kept where the Tau app keeps it (`app_viewer_settings` over `.tau/workbench/entries.json`), which
 * `tau mcp` applies to the entry's next render. An older `tau` serves neither tool: the bar then leaves both out.
 *
 * Kernel (view) settings and the view and instance menus stay out: `tau mcp` renders an entry's default view, so a
 * choice there could not reach the render yet.
 */
import { useCallback, useEffect, useState } from 'react';
import type { TauViewerModel } from '@taucad/mcp/viewer-protocol';
import type { ViewerControlsProps } from '@taucad/viewer/cad/viewer-controls';
import { CaptureViewControl } from '@taucad/workbench-panes/shell/capture-view-control';
import { ToolCallError } from '#app/host-bridge.js';
import type { HostBridge } from '#app/host-bridge.js';
import { captureLiveView } from '#app/live-link.js';

/** The page-only tools the bar calls. */
export const viewerChromeToolName = {
  settings: 'app_viewer_settings',
  saveCapture: 'app_save_capture',
} as const;

type Settings = Readonly<{ modelId: string; renderTimeout: number | undefined; defaultRenderTimeout: number }>;

const settingsOf = (modelId: string, value: unknown): Settings | undefined => {
  if (typeof value !== 'object' || value === null || !('defaultRenderTimeout' in value)) {
    return undefined;
  }
  const { defaultRenderTimeout } = value;
  const renderTimeout = 'renderTimeout' in value ? value.renderTimeout : undefined;
  return typeof defaultRenderTimeout === 'number'
    ? { modelId, defaultRenderTimeout, renderTimeout: typeof renderTimeout === 'number' ? renderTimeout : undefined }
    : undefined;
};

const isUnknownTool = (error: unknown): boolean => error instanceof ToolCallError && error.code === 'UNKNOWN_TOOL';

type PageViewerControlsInput = Readonly<{
  bridge: HostBridge;
  /** The shown model; nothing is offered before one is shown. */
  model: TauViewerModel | undefined;
  /** The element whose canvas Capture reads: the canvas region alone, as `view_state` captures it. */
  captureRegion: () => ParentNode | undefined;
  /** Tells the person what a capture or a setting did. */
  onNotice: (text: string) => void;
}>;

/**
 * The page's Capture and render timeout for the shared viewer bar.
 *
 * @param input - The bridge, the shown model, where the canvas is and where notices go.
 * @returns The `capture` and `operationTimeout` props of `ViewerControls`.
 */
export function usePageViewerControls({
  bridge,
  model,
  captureRegion,
  onNotice,
}: PageViewerControlsInput): Pick<ViewerControlsProps, 'capture' | 'operationTimeout'> {
  const modelId = model?.id;
  const [settings, setSettings] = useState<Settings | undefined>(undefined);
  const [canSave, setCanSave] = useState(true);

  useEffect(() => {
    if (modelId === undefined) {
      return;
    }
    let isCurrent = true;
    const read = async (): Promise<void> => {
      try {
        const next = settingsOf(modelId, await bridge.callTool(viewerChromeToolName.settings, { modelId }));
        if (isCurrent) {
          setSettings(next);
        }
      } catch {
        /* An older tau, or a model no longer shown: Viewer settings offers no render timeout. */
        if (isCurrent) {
          setSettings(undefined);
        }
      }
    };
    // async-iife: bootstrap — the shown model's settings arrive once; a newer model supersedes them.
    void read();
    return () => {
      isCurrent = false;
    };
  }, [bridge, modelId]);

  const changeTimeout = useCallback(
    (renderTimeout: number) => {
      if (modelId === undefined) {
        return;
      }
      const write = async (): Promise<void> => {
        try {
          const next = settingsOf(
            modelId,
            await bridge.callTool(viewerChromeToolName.settings, { modelId, renderTimeout }),
          );
          setSettings((current) => (current?.modelId === modelId ? next : current));
          onNotice('Render timeout saved; it applies to the next render');
        } catch (error) {
          onNotice(error instanceof Error ? `Render timeout not saved: ${error.message}` : 'Render timeout not saved');
        }
      };
      // async-iife: bootstrap — a menu choice starts it; the notice reports its outcome.
      void write();
    },
    [bridge, modelId, onNotice],
  );

  const capture = useCallback(async (): Promise<boolean> => {
    const region = captureRegion();
    if (modelId === undefined || region === undefined) {
      return false;
    }
    const image = captureLiveView(region);
    if ('error' in image) {
      onNotice(image.error);
      return false;
    }
    try {
      const saved = await bridge.callTool(viewerChromeToolName.saveCapture, { modelId, data: image.data });
      const path = typeof saved === 'object' && saved !== null && 'path' in saved ? saved.path : undefined;
      onNotice(typeof path === 'string' ? `Saved ${path}` : 'Capture saved to exports');
      return true;
    } catch (error) {
      if (isUnknownTool(error)) {
        setCanSave(false);
        onNotice('This tau cannot save captures; update the Tau CLI');
        return false;
      }
      onNotice(error instanceof Error ? `Capture not saved: ${error.message}` : 'Capture not saved');
      return false;
    }
  }, [bridge, captureRegion, modelId, onNotice]);

  const current = settings?.modelId === modelId ? settings : undefined;
  return {
    capture:
      modelId === undefined || !canSave ? undefined : (
        <CaptureViewControl onCapture={capture} label='Capture view to exports' doneLabel='Saved to exports' />
      ),
    operationTimeout:
      current === undefined
        ? undefined
        : {
            value: current.renderTimeout ?? current.defaultRenderTimeout,
            defaultValue: current.defaultRenderTimeout,
            onChange: changeTimeout,
          },
  };
}
