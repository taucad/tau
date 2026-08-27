import { describe, expect, it, vi } from 'vitest';
import { fileViewerRouter } from '#routes/w.$workspace.$project/file-viewers/built-in-viewers.js';
import type { FileViewerProbe } from '#routes/w.$workspace.$project/file-viewers/file-viewer.types.js';

vi.mock('#routes/w.$workspace.$project/chat-editor-code-viewer.js', () => ({ ChatEditorCodeViewer: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-editor-markdown-viewer.js', () => ({
  ChatEditorMarkdownViewer: () => null,
}));
vi.mock('#routes/w.$workspace.$project/chat-editor-plan-viewer.js', () => ({ ChatEditorPlanViewer: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-editor-binary-warning.js', () => ({
  ChatEditorBinaryWarning: () => null,
}));

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const probe = (options: {
  readonly path: string;
  readonly planModeEnabled?: boolean;
  readonly content:
    | { readonly kind: 'text'; readonly bytes: Uint8Array<ArrayBuffer> }
    | {
        readonly kind: 'binary';
        readonly size: number;
        readonly head: Uint8Array<ArrayBuffer>;
        readonly revision: number;
      };
}): FileViewerProbe => ({
  paneId: 'pane-1',
  path: options.path,
  name: options.path.split('/').pop() ?? options.path,
  content: options.content,
  options: { planModeEnabled: options.planModeEnabled ?? false, readOnly: false },
});

describe('fileViewerRouter', () => {
  it('selects native images by bytes rather than extension', () => {
    expect(
      fileViewerRouter.resolve(
        probe({ path: 'spoofed.txt', content: { kind: 'binary', size: png.byteLength, head: png, revision: 1 } }),
      ).id,
    ).toBe('native-image');
  });

  it('routes SVG text to the native image viewer', () => {
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    expect(fileViewerRouter.resolve(probe({ path: 'drawing.svg', content: { kind: 'text', bytes } })).id).toBe(
      'native-image',
    );
  });

  it('does not trust an image extension without a matching signature', () => {
    expect(
      fileViewerRouter.resolve(
        probe({
          path: 'spoofed.png',
          content: { kind: 'binary', size: 3, head: new Uint8Array([0, 1, 2]), revision: 1 },
        }),
      ).id,
    ).toBe('binary-warning');
  });

  it('preserves the specialized text viewers and code fallback', () => {
    const text = { kind: 'text', bytes: new TextEncoder().encode('# content') } satisfies FileViewerProbe['content'];

    expect(fileViewerRouter.resolve(probe({ path: 'task.plan.md', planModeEnabled: true, content: text })).id).toBe(
      'plan',
    );
    expect(fileViewerRouter.resolve(probe({ path: 'readme.md', content: text })).id).toBe('markdown');
    expect(fileViewerRouter.resolve(probe({ path: 'main.ts', content: text })).id).toBe('code');
  });

  it('should declare Markdown preview and source with preview as the default', () => {
    const text = { kind: 'text', bytes: new TextEncoder().encode('# content') } satisfies FileViewerProbe['content'];

    expect(fileViewerRouter.resolve(probe({ path: 'readme.md', content: text })).presentation).toEqual({
      defaultViewId: 'preview',
      views: [
        { id: 'preview', label: 'Preview' },
        { id: 'source', label: 'Source' },
      ],
    });
  });
});
