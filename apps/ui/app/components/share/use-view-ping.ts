import { useEffect, useRef } from 'react';
import { useSelector } from '@xstate/react';
import { useCadPreview } from '#hooks/use-cad-preview.js';

/** Milliseconds — minimum dwell time before recording a view ping. */
const viewPingDwell = 10_000;

type UseViewPingArgs = {
  readonly publicationId: string;
  readonly apiBaseUrl: string;
};

/**
 * Records a single PATCH /v1/publications/:id/views ping per page session after the viewer
 * dwells for at least 10 seconds AND has interacted with the model (parameter change or
 * orbit/pan controls). The hook is idempotent — subsequent rerenders never re-fire.
 */
export const useViewPing = ({ publicationId, apiBaseUrl }: UseViewPingArgs): void => {
  const sentRef = useRef(false);
  const interactedRef = useRef(false);
  const dwellMetRef = useRef(false);

  const cadPreview = useCadPreview();
  const { cadRef } = cadPreview;

  // Subscribe to parameter changes — any change after mount counts as an interaction.
  const parameters = useSelector(cadRef, (snapshot) => snapshot.context.parameters);
  const parametersInitRef = useRef<Record<string, unknown> | undefined>(parameters);

  useEffect(() => {
    if (parametersInitRef.current === undefined) {
      parametersInitRef.current = parameters;
      return;
    }

    if (parametersInitRef.current !== parameters) {
      interactedRef.current = true;
    }
  }, [parameters]);

  useEffect(() => {
    const handlePointerInteraction = () => {
      interactedRef.current = true;
    };

    globalThis.addEventListener('pointerdown', handlePointerInteraction, { passive: true });
    globalThis.addEventListener('wheel', handlePointerInteraction, { passive: true });
    globalThis.addEventListener('keydown', handlePointerInteraction, { passive: true });

    return () => {
      globalThis.removeEventListener('pointerdown', handlePointerInteraction);
      globalThis.removeEventListener('wheel', handlePointerInteraction);
      globalThis.removeEventListener('keydown', handlePointerInteraction);
    };
  }, []);

  useEffect(() => {
    const dwellTimer = globalThis.setTimeout(() => {
      dwellMetRef.current = true;
    }, viewPingDwell);

    const sendPing = async (): Promise<void> => {
      const url = `${apiBaseUrl.replace(/\/$/u, '')}/v1/publications/${publicationId}/views`;
      try {
        await fetch(url, { method: 'PATCH', credentials: 'include' });
      } catch {
        // Best-effort ping; never surface failures to the viewer.
      }
    };

    const tick = globalThis.setInterval(() => {
      if (sentRef.current) {
        globalThis.clearInterval(tick);
        return;
      }

      if (!dwellMetRef.current || !interactedRef.current) {
        return;
      }

      sentRef.current = true;
      globalThis.clearInterval(tick);
      // async-iife: bootstrap
      void sendPing();
    }, 500);

    return () => {
      globalThis.clearTimeout(dwellTimer);
      globalThis.clearInterval(tick);
    };
  }, [apiBaseUrl, publicationId]);
};
