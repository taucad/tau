import { useEffect, useRef } from 'react';
import type { ParameterSetService } from '#services/parameter-set-service.js';
import { toast } from '#components/ui/sonner.js';

/** Preview routes have no editor live-session owner to drain and release parameter clients. */
export function usePreviewParameterLifetime(service: ParameterSetService, enabled: boolean): void {
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    if (!enabled) {
      return;
    }
    return () => {
      const released = ++generation.current;
      // Strict Mode reconnects synchronously; a replacement service is closed by ProjectProvider.
      queueMicrotask(() => {
        if (generation.current !== released) {
          return;
        }
        async function closeService(): Promise<void> {
          try {
            await service.close();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Parameter service could not close.');
          }
        }
        void closeService();
      });
    };
  }, [service, enabled]);
}
