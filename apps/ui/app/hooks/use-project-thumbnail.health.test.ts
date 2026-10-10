// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useProjectThumbnail } from '#hooks/use-project-thumbnail.js';

const source = vi.hoisted(() => ({
  readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
  watch: vi.fn(),
}));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ recordFiles: source, watchRecordFile: source.watch }),
}));

it('should expose failed thumbnail health while retaining the image and retry a fresh acknowledged source', async () => {
  const firstClosed = Promise.withResolvers<void>();
  const secondReady = Promise.withResolvers<void>();
  source.watch
    .mockReturnValueOnce({ ready: Promise.resolve(), closed: firstClosed.promise, dispose: vi.fn() })
    .mockReturnValueOnce({
      ready: secondReady.promise,
      closed: new Promise<void>(() => {
        /* Keep the acknowledged watch open until disposal. */
      }),
      dispose: vi.fn(),
    });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:thumbnail');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const view = renderHook(() => useProjectThumbnail('health-project'));
  await waitFor(() => {
    expect(source.readFile).toHaveBeenCalledTimes(1);
  });
  await act(async () => {
    firstClosed.reject(new Error('Thumbnail connection lost'));
  });
  await waitFor(() => {
    expect(view.result.current).toMatchObject({
      status: 'closed',
      url: 'blob:thumbnail',
      error: 'Observation connection closed.',
    });
  });
  act(() => {
    view.result.current.refresh();
  });
  expect(source.watch).toHaveBeenCalledTimes(2);
  expect(source.readFile).toHaveBeenCalledTimes(1);
  await act(async () => {
    secondReady.resolve();
  });
  await waitFor(() => {
    expect(view.result.current).toMatchObject({ status: 'ready', url: 'blob:thumbnail' });
  });
  expect(source.readFile).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
