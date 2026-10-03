// @vitest-environment jsdom
import { useEffect } from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ExportFile } from '@taucad/types';
import { PartThumbnailService } from '#services/part-thumbnail.service.js';
import { PartThumbnailProvider, useOptionalPartThumbnailService } from '#providers/part-thumbnail-provider.js';

const mocks = vi.hoisted(() => ({
  projectId: 'project-a' as string | undefined,
  imageService: { export: vi.fn() },
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => (mocks.projectId ? { projectId: mocks.projectId } : undefined),
}));
vi.mock('#providers/headless-image-provider.js', () => ({
  useOptionalHeadlessImageService: () => mocks.imageService,
}));

afterEach(() => {
  mocks.projectId = 'project-a';
  mocks.imageService.export.mockReset();
  vi.restoreAllMocks();
});

it('disposes the old project preview registry before a new project uses the same image service', async () => {
  const pendingExport = Promise.withResolvers<ExportFile[]>();
  mocks.imageService.export.mockImplementation(async () => pendingExport.promise);
  const dispose = vi.spyOn(PartThumbnailService.prototype, 'dispose');
  const observed: PartThumbnailService[] = [];
  const rendered: Array<{ projectId: string | undefined; service: PartThumbnailService | undefined }> = [];
  function Probe(): React.JSX.Element {
    const service = useOptionalPartThumbnailService('unit');
    rendered.push({ projectId: mocks.projectId, service });
    useEffect(() => {
      if (service) {
        observed.push(service);
      }
    }, [service]);
    return <div />;
  }
  const tree = () => (
    <PartThumbnailProvider>
      <Probe />
    </PartThumbnailProvider>
  );
  const view = render(tree());
  await waitFor(() => {
    expect(observed).toHaveLength(1);
  });
  const first = observed[0]!;
  first.request({ sourcePath: 'part.glb', geometryHash: 'project-a-source', content: new Uint8Array([1]) }, [
    { id: 'part', primitives: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }] },
  ]);
  await waitFor(() => {
    expect(mocks.imageService.export).toHaveBeenCalledTimes(1);
  });

  mocks.projectId = 'project-b';
  view.rerender(tree());
  expect(rendered.filter((value) => value.projectId === 'project-b').every((value) => value.service !== first)).toBe(
    true,
  );
  await waitFor(() => {
    expect(observed.some((service) => service !== first)).toBe(true);
  });
  expect(dispose).toHaveBeenCalledTimes(1);
  const second = observed.find((service) => service !== first)!;
  pendingExport.resolve([{ name: 'render-part-0.webp', mimeType: 'image/webp', bytes: new Uint8Array([1]) }]);
  await pendingExport.promise;
  expect(first.snapshot().size).toBe(0);
  expect(second.snapshot().size).toBe(0);

  view.unmount();
  expect(dispose).toHaveBeenCalledTimes(2);
});
