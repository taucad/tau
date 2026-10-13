import { randomUuid } from '@taucad/utils/id';
import type { BrowserCommand } from '@taucad/types/browser';
import { useCallback, useEffect, useState } from 'react';
import { getBrowserBridge, useBrowserSession } from '#components/browser/browser-bridge.js';
import { BrowserSurface } from '#components/browser/browser-surface.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';

/** Owns the native viewport lease; inactive panes and DOM overlays never leave a guest above Tau. */
export function BrowserPane(): React.JSX.Element {
  const bridge = getBrowserBridge();
  const { snapshot, error, command } = useBrowserSession(bridge);
  const { open } = useSettingsDialog();
  const [viewport, setViewport] = useState<HTMLDivElement>();
  const attachViewport = useCallback<React.RefCallback<HTMLDivElement>>((element) => {
    setViewport(element ?? undefined);
  }, []);
  const [leaseId] = useState(() => randomUuid());
  const activeTabId = snapshot?.activeTabId;
  const activeUrl = snapshot?.tabs.find((tab) => tab.id === activeTabId)?.url;
  const activeError = snapshot?.tabs.find((tab) => tab.id === activeTabId)?.error;
  useEffect(() => {
    if (!bridge || !activeTabId || !viewport) {
      return;
    }
    let frame = 0;
    let previous = `${activeError ?? ''}${activeUrl ?? ''}`;
    let isDragging = false;
    let isDisposed = false;
    const startDrag = (): void => {
      isDragging = true;
    };
    const stopDrag = (): void => {
      isDragging = false;
    };
    const send = async (request: BrowserCommand): Promise<void> => {
      try {
        await bridge.command(request);
      } catch {
        // Tab or window teardown can win the race with a viewport update.
      }
    };
    const measure = (): void => {
      if (isDisposed) {
        return;
      }
      const rect = viewport.getBoundingClientRect();
      const overlay = document.querySelector(
        '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]',
      );
      const visible =
        document.visibilityState === 'visible' &&
        !document.fullscreenElement &&
        !isDragging &&
        !overlay &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.x >= 0 &&
        rect.y >= 0 &&
        viewport.checkVisibility({ visibilityProperty: true, opacityProperty: true });
      const request = {
        kind: 'viewport',
        leaseId,
        tabId: activeTabId,
        visible,
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
      command={command}
      error={error}
      viewportRef={attachViewport}
      onSettings={() => {
        open('browser');
      }}
    />
  );
}
