import { StrictMode } from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HeadlessImageJob, HeadlessImageService } from '#services/headless-image.service.js';
import { HeadlessImageProvider, useHeadlessImageService } from '#providers/headless-image-provider.js';

vi.mock('#runtime/ui-runtime.config.js', () => ({ createUiRuntimeConfig: () => ({}) }));

const content =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><path d="M0 0H100V50H0Z" fill="none" stroke="#ef4444"/></svg>';

const createJob = (identity: string): Extract<HeadlessImageJob, { sourceFormat: 'svg' }> => ({
  kind: 'capture',
  identity,
  sourceFormat: 'svg',
  sourcePath: '/drawing.ts',
  content,
  format: 'png',
  exportOptions: { width: 320, height: 240 },
});

const pngDimensions = (bytes: Uint8Array<ArrayBuffer>): readonly [number, number] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
};

describe('HeadlessImageProvider', () => {
  it('should keep the real service usable after StrictMode replays provider effects', async () => {
    let service: HeadlessImageService | undefined;
    const Consumer = () => {
      service = useHeadlessImageService();
      return <span hidden />;
    };

    render(
      <StrictMode>
        <HeadlessImageProvider>
          <Consumer />
        </HeadlessImageProvider>
      </StrictMode>,
    );
    await waitFor(() => {
      expect(service).toBeDefined();
    });

    try {
      for (const identity of ['first', 'second']) {
        // oxlint-disable-next-line no-await-in-loop -- Two sequential exports prove the retained provider service remains reusable.
        const files = await service!.export(createJob(identity));
        expect(files).toHaveLength(1);
        expect(files?.[0]).toMatchObject({ mimeType: 'image/png' });
        expect(files?.[0]?.bytes.subarray(0, 8)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]));
        expect(pngDimensions(files![0]!.bytes)).toEqual([320, 240]);
      }
    } finally {
      service?.dispose();
    }
  });
});
