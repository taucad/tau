// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { setCodeLoadFailureSink } from '@taucad/ui-core/lib/code-loading';

/*
 * PL7 staging verification 2026-11-21, row 5 (`part-gallery`): the chunk holding the part previews failed to load once,
 * and with it the viewer that imports the previews' hook, and the whole route. Part previews are optional: their code
 * failing degrades them to none, as a page with no image service already shows.
 */
const service = vi.hoisted(() => ({ loads: 0 }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project-a' }) }));
vi.mock('#providers/headless-image-provider.js', () => ({
  useOptionalHeadlessImageService: () => ({ export: vi.fn() }),
}));
vi.mock('#services/part-thumbnail.service.js', () => {
  service.loads += 1;
  throw new TypeError(
    'Failed to fetch dynamically imported module: https://tau.new/assets/part-thumbnail.service-1.js',
  );
});

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
});

it('renders its children with no part previews when their code fails to load, and never reloads the page for it', async () => {
  const sink = vi.fn();
  restore = setCodeLoadFailureSink(sink);
  const { PartThumbnailProvider, useOptionalPartThumbnailService } =
    await import('#providers/part-thumbnail-provider.js');
  function Probe(): React.JSX.Element {
    const thumbnails = useOptionalPartThumbnailService('unit');
    return <div data-testid='viewer'>{thumbnails === undefined ? 'no previews' : 'previews'}</div>;
  }

  render(
    <PartThumbnailProvider>
      <Probe />
    </PartThumbnailProvider>,
  );

  await waitFor(() => {
    expect(sink).toHaveBeenCalledExactlyOnceWith(expect.any(Error), 'optional');
  });
  expect(screen.getByTestId('viewer')).toHaveTextContent('no previews');
  expect(service.loads).toBe(1);
});
