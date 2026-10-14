import { useCallback, useEffect, useState } from 'react';
import type { BrowserBridge, BrowserCommand, BrowserSnapshot } from '@taucad/types/browser';

/** Desktop-only capability lookup; browser builds have no fallback guest iframe. */
export const getBrowserBridge = (): BrowserBridge | undefined =>
  (globalThis as { tauBrowser?: BrowserBridge }).tauBrowser;

/** Subscribe before reading so a state change cannot be lost during mount. */
export const useBrowserSession = (
  bridge: BrowserBridge | undefined,
): {
  snapshot: BrowserSnapshot | undefined;
  error: string | undefined;
  command: (command: BrowserCommand) => Promise<void>;
} => {
  const [snapshot, setSnapshot] = useState<BrowserSnapshot>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!bridge) {
      return;
    }
    let active = true;
    let hasEvent = false;
    const unsubscribe = bridge.subscribe((value) => {
      hasEvent = true;
      setSnapshot(value);
    });
    const readInitial = async (): Promise<void> => {
      try {
        const value = await bridge.command({ kind: 'snapshot' });
        if (active && !hasEvent) {
          setSnapshot(value);
        }
      } catch {
        if (active) {
          setError('The browser could not be reached. Reopen this pane to retry.');
        }
      }
    };
    void readInitial();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);
  const command = useCallback(
    async (request: BrowserCommand): Promise<void> => {
      if (!bridge) {
        return;
      }
      setError(undefined);
      try {
        await bridge.command(request);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message.replace(/^Error invoking remote method '[^']+': Error: /u, '')
            : 'The browser action could not be completed. Try again.',
        );
      }
    },
    [bridge],
  );
  return { snapshot, error, command };
};
