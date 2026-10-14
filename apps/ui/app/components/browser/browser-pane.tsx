import { randomUuid } from '@taucad/utils/id';
import type { BrowserCommand, BrowserSnapshot } from '@taucad/types/browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getBrowserBridge, useBrowserSession } from '#components/browser/browser-bridge.js';
import { BrowserSurface } from '#components/browser/browser-surface.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';

/** Owns the native viewport lease; inactive panes and DOM overlays never leave a guest above Tau. */
export function BrowserPane({ tabId }: { readonly tabId?: string } = {}): React.JSX.Element {
  const bridge = getBrowserBridge();
  const { snapshot, error, command } = useBrowserSession(bridge);
  const { open } = useSettingsDialog();
  const [preview, setPreview] = useState<BrowserSnapshot['preview']>();
  const loadedPreview = useRef<string | undefined>(undefined);
  const [viewport, setViewport] = useState<HTMLDivElement>();
  const attachViewport = useCallback<React.RefCallback<HTMLDivElement>>((element) => {
    setViewport(element ?? undefined);
  }, []);
  const [leaseId] = useState(() => randomUuid());
  const activeTabId = tabId ?? snapshot?.activeTabId;
  const activeUrl = snapshot?.tabs.find((tab) => tab.id === activeTabId)?.url;
  const activeZoom = snapshot?.tabs.find((tab) => tab.id === activeTabId)?.zoom;
  const captureZoom = useRef(activeZoom);
  useEffect(() => {
    captureZoom.current = activeZoom;
  }, [activeZoom]);
  const activeError = snapshot?.tabs.find((tab) => tab.id === activeTabId)?.error;
  useEffect(() => {
    if (!bridge || !activeTabId || !viewport) {
      return;
    }
    let frame = 0;
    let previous = `${activeError ?? ''}${activeUrl ?? ''}`;
    let isDragging = false;
    let isDisposed = false;
    let captureGeneration = 0;
    let isCapturing = false;
    let previewUrl: string | undefined;
    let wasOccluded = false;
    let retryAfter = 0;
    let capturedZoom: number | undefined;
    const capture = async (): Promise<void> => {
      const generation = ++captureGeneration;
      isCapturing = true;
      const zoom = captureZoom.current;
      let captured = false;
      try {
        const result = await bridge.command({ kind: 'capture-preview', tabId: activeTabId });
        if (!isDisposed && generation === captureGeneration && result.preview && result.preview.url === activeUrl) {
          previewUrl = result.preview.dataUrl;
          capturedZoom = zoom;
          captured = true;
          setPreview(result.preview);
        }
      } catch {
        // Capture can race navigation or teardown; retain the live page until a frame is ready.
      } finally {
        if (generation === captureGeneration) {
          isCapturing = false;
          retryAfter = captured ? 0 : performance.now() + 1000;
        }
      }
    };
    const startDrag = (): void => {
      isDragging = true;
    };
    const stopDrag = (): void => {
      isDragging = false;
    };
    const send = async (request: BrowserCommand): Promise<void> => {
      try {
        await bridge.command(request);
        if (!isDisposed && request.kind === 'viewport' && request.visible && !wasOccluded) {
          setPreview(undefined);
        }
      } catch {
        // Tab or window teardown can win the race with a viewport update.
      }
    };
    const measure = (): void => {
      if (isDisposed) {
        return;
      }
      const rect = viewport.getBoundingClientRect();
      const overlays = document.querySelectorAll<HTMLElement>(
        '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"], [data-radix-popper-content-wrapper]',
      );
      const occluded = [...overlays].some((overlay) => {
        if (!overlay.checkVisibility({ visibilityProperty: true, opacityProperty: true })) {
          return false;
        }
        if (overlay.matches('[aria-modal="true"], [data-state="open"][role="dialog"]')) {
          return true;
        }
        const bounds = overlay.getBoundingClientRect();
        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          bounds.left < rect.right &&
          bounds.right > rect.left &&
          bounds.top < rect.bottom &&
          bounds.bottom > rect.top
        );
      });
      const visible =
        document.visibilityState === 'visible' &&
        !document.fullscreenElement &&
        !isDragging &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.x >= 0 &&
        rect.y >= 0 &&
        viewport.checkVisibility({ visibilityProperty: true, opacityProperty: true });
      if (visible && occluded) {
        if (!isCapturing && (!previewUrl || capturedZoom !== captureZoom.current) && performance.now() >= retryAfter) {
          void capture();
        }
      } else if (wasOccluded) {
        captureGeneration += 1;
        isCapturing = false;
        previewUrl = undefined;
        retryAfter = 0;
        loadedPreview.current = undefined;
      }
      wasOccluded = visible && occluded;
      const request = {
        kind: 'viewport',
        leaseId,
        tabId: activeTabId,
        // The decoded DOM image must be painted before the native layer is lowered.
        visible: visible && !(occluded && previewUrl && loadedPreview.current === previewUrl),
        x: Math.max(0, rect.x),
        y: Math.max(0, rect.y),
        width: rect.width,
        height: rect.height,
      } as const;
      const key = JSON.stringify(request);
      if (key !== previous) {
        previous = key;
        void send(request);
      }
      frame = requestAnimationFrame(measure);
    };
    document.addEventListener('dragstart', startDrag);
    document.addEventListener('dragend', stopDrag);
    document.addEventListener('drop', stopDrag);
    frame = requestAnimationFrame(measure);
    return () => {
      isDisposed = true;
      captureGeneration += 1;
      cancelAnimationFrame(frame);
      document.removeEventListener('dragstart', startDrag);
      document.removeEventListener('dragend', stopDrag);
      document.removeEventListener('drop', stopDrag);
      void send({ kind: 'detach', leaseId });
    };
  }, [activeTabId, activeError, activeUrl, bridge, viewport, leaseId]);
  if (!bridge) {
    return (
      <div className='p-6 text-sm'>
        <h2 className='font-medium'>Browse in Tau desktop</h2>
        <p className='mt-2 text-muted-foreground'>The desktop app lets you browse the web alongside your project.</p>
      </div>
    );
  }
  if (!snapshot) {
    return (
      <p className='p-4 text-sm' role={error ? 'alert' : 'status'}>
        {error ?? 'Opening browser…'}
      </p>
    );
  }
  return (
    <BrowserSurface
      snapshot={snapshot}
      tabId={activeTabId}
      command={command}
      error={error}
      viewportRef={attachViewport}
      onSettings={() => {
        open('browser');
      }}
    >
      {preview && preview.tabId === activeTabId && preview.url === activeUrl ? (
        <img
          src={preview.dataUrl}
          alt=''
          aria-hidden
          className='pointer-events-none absolute inset-0 size-full'
          onLoad={(event) => {
            loadedPreview.current = event.currentTarget.src;
          }}
        />
      ) : null}
    </BrowserSurface>
  );
}
