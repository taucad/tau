import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ParameterSetService } from '#services/parameter-set-service.js';
import { usePreviewParameterLifetime } from '#hooks/use-preview-parameter-lifetime.js';
import { toast } from '#components/ui/sonner.js';

vi.mock('#components/ui/sonner.js', () => ({ toast: { error: vi.fn() } }));

describe('preview parameter lifetime', () => {
  it('keeps the service alive through Strict Mode and closes after leaving Preview', async () => {
    const service = mock<ParameterSetService>();
    service.close.mockResolvedValue();
    const view = renderHook(
      () => {
        usePreviewParameterLifetime(service, true);
      },
      { wrapper: StrictMode },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(service.close).not.toHaveBeenCalled();
    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(service.close).toHaveBeenCalledTimes(1);
  });

  it('leaves editor services to their live-session owner', async () => {
    const service = mock<ParameterSetService>();
    const view = renderHook(() => {
      usePreviewParameterLifetime(service, false);
    });
    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(service.close).not.toHaveBeenCalled();
  });

  it('reports a refused close instead of hiding a pending-write failure', async () => {
    const service = mock<ParameterSetService>();
    service.close.mockRejectedValue(new Error('Parameter writes have not settled.'));
    const view = renderHook(() => {
      usePreviewParameterLifetime(service, true);
    });
    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(toast.error).toHaveBeenCalledWith('Parameter writes have not settled.');
  });
});
