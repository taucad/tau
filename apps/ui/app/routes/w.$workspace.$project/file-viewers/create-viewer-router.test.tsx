import { describe, expect, it } from 'vitest';
import { createViewer } from '#routes/w.$workspace.$project/file-viewers/create-viewer.js';
import { createViewerRouter } from '#routes/w.$workspace.$project/file-viewers/create-viewer-router.js';
import type { FileViewerProbe } from '#routes/w.$workspace.$project/file-viewers/file-viewer.types.js';

const probe = (kind: 'text' | 'binary'): FileViewerProbe => ({
  paneId: 'pane-1',
  path: 'asset',
  name: 'asset',
  content:
    kind === 'text' ? { kind, bytes: new Uint8Array([65]) } : { kind, size: 1, head: new Uint8Array([0]), revision: 1 },
  options: { planModeEnabled: false, readOnly: false },
});

const textFallback = createViewer({
  id: 'text',
  fallbackFor: 'text',
  requestsFiles: true,
  match: (candidate) => (candidate.content.kind === 'text' ? true : undefined),
  render: () => null,
});
const binaryFallback = createViewer({
  id: 'binary',
  fallbackFor: 'binary',
  match: (candidate) => (candidate.content.kind === 'binary' ? true : undefined),
  render: () => null,
});

describe('createViewerRouter', () => {
  it('prefers the first matching specialized viewer over the kind fallback', () => {
    const image = createViewer({
      id: 'image',
      match: (candidate) => (candidate.content.kind === 'binary' ? { format: 'png' } : undefined),
      render: () => null,
    });
    const router = createViewerRouter([image, textFallback, binaryFallback]);

    expect(router.resolve(probe('binary')).id).toBe('image');
    expect(router.resolve(probe('text')).id).toBe('text');
  });

  it('rejects duplicate ids and missing fallbacks', () => {
    expect(() => createViewerRouter([textFallback, textFallback, binaryFallback])).toThrow(/duplicate/i);
    expect(() => createViewerRouter([textFallback])).toThrow(/binary fallback/i);
  });

  it('carries the selected viewer Files capability into the resolved viewer', () => {
    const router = createViewerRouter([textFallback, binaryFallback]);

    expect(router.resolve(probe('text')).requestsFiles).toBe(true);
    expect(router.resolve(probe('binary')).requestsFiles).toBe(false);
  });

  it('should validate finite viewer presentation metadata', () => {
    const withPresentation = (presentation: {
      readonly defaultViewId: string;
      readonly views: ReadonlyArray<{ readonly id: string; readonly label: string }>;
    }) =>
      createViewer({
        id: 'presented',
        presentation,
        match: (candidate) => (candidate.content.kind === 'text' ? true : undefined),
        render: () => null,
      });

    expect(() =>
      createViewerRouter([
        withPresentation({
          defaultViewId: 'preview',
          views: [
            { id: 'preview', label: 'Preview' },
            { id: 'preview', label: 'Source' },
          ],
        }),
        textFallback,
        binaryFallback,
      ]),
    ).toThrow(/duplicate view id/i);
    expect(() =>
      createViewerRouter([
        withPresentation({ defaultViewId: 'preview', views: [{ id: 'source', label: 'Source' }] }),
        textFallback,
        binaryFallback,
      ]),
    ).toThrow(/default view/i);
    expect(() =>
      createViewerRouter([
        withPresentation({ defaultViewId: 'preview', views: [{ id: 'preview', label: ' ' }] }),
        textFallback,
        binaryFallback,
      ]),
    ).toThrow(/empty view label/i);
  });
});
