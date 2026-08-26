import { describe, it, expect, vi } from 'vitest';
import type { ContextSuggestionItem, ScreenshotActionData } from '#components/chat/tiptap/suggestion-types.js';
import { createScreenshotContextHandler } from '#components/chat/screenshot-actions.utils.js';

const createScreenshotItem = (
  id: string,
  screenshotAction: ScreenshotActionData,
  label = 'Test',
): ContextSuggestionItem => ({
  id,
  label,
  chipType: 'screenshot',
  group: 'Take Screenshot',
  isAction: true,
  screenshotAction,
});

describe('createScreenshotContextHandler', () => {
  it('should delegate single-screenshot items to onScreenshotAction', () => {
    const handleAddImage = vi.fn();
    const onScreenshotAction = vi.fn();

    const handler = createScreenshotContextHandler({
      handleAddImage,
      onScreenshotAction,
    });

    const item = createScreenshotItem('screenshot-current-view', { type: 'single' }, 'Current view');
    handler(item);

    expect(onScreenshotAction).toHaveBeenCalledWith(item);
    expect(handleAddImage).not.toHaveBeenCalled();
  });

  it('should delegate orthographic screenshot items to onScreenshotAction', () => {
    const handleAddImage = vi.fn();
    const onScreenshotAction = vi.fn();

    const handler = createScreenshotContextHandler({
      handleAddImage,
      onScreenshotAction,
    });

    const item = createScreenshotItem('screenshot-orthographic', { type: 'orthographic' }, 'Orthographic views x 6');
    handler(item);

    expect(onScreenshotAction).toHaveBeenCalledWith(item);
    expect(handleAddImage).not.toHaveBeenCalled();
  });

  it('should delegate view-specific screenshot items to onScreenshotAction', () => {
    const handleAddImage = vi.fn();
    const onScreenshotAction = vi.fn();

    const handler = createScreenshotContextHandler({
      handleAddImage,
      onScreenshotAction,
    });

    const item = createScreenshotItem(
      'screenshot-view:models/part.ts',
      { type: 'view', entryPath: 'models/part.ts' },
      'part.ts',
    );
    handler(item);

    expect(onScreenshotAction).toHaveBeenCalledWith(item);
    expect(handleAddImage).not.toHaveBeenCalled();
  });

  it('should preserve structured screenshotAction data through the handler', () => {
    const onScreenshotAction = vi.fn();

    const handler = createScreenshotContextHandler({
      handleAddImage: vi.fn(),
      onScreenshotAction,
    });

    const viewItem = createScreenshotItem('screenshot-view:src/models/gear.ts', {
      type: 'view',
      entryPath: 'src/models/gear.ts',
    });
    handler(viewItem);

    const passedItem = onScreenshotAction.mock.calls[0]?.[0] as ContextSuggestionItem;
    expect(passedItem.screenshotAction).toEqual({
      type: 'view',
      entryPath: 'src/models/gear.ts',
    });
  });

  it('should not call handleAddImage with raw item IDs (they are not data URLs)', () => {
    const handleAddImage = vi.fn();
    const onScreenshotAction = vi.fn();

    const handler = createScreenshotContextHandler({
      handleAddImage,
      onScreenshotAction,
    });

    const items = [
      createScreenshotItem('screenshot-current-view', { type: 'single' }),
      createScreenshotItem('screenshot-orthographic', { type: 'orthographic' }),
      createScreenshotItem('screenshot-view:models/part.ts', { type: 'view', entryPath: 'models/part.ts' }),
    ];

    for (const item of items) {
      handler(item);
    }

    // HandleAddImage must never receive raw item IDs — only valid data URLs
    expect(handleAddImage).not.toHaveBeenCalled();
  });

  it('should not invoke any callback for non-screenshot chipType items', () => {
    const handleAddImage = vi.fn();
    const onScreenshotAction = vi.fn();

    const handler = createScreenshotContextHandler({
      handleAddImage,
      onScreenshotAction,
    });

    handler({
      id: 'file-main.ts',
      label: 'main.ts',
      chipType: 'file',
      group: 'Files & Folders',
    });

    handler({
      id: 'c1',
      label: 'Chat 1',
      chipType: 'chat',
      group: 'Past Chats',
    });

    expect(handleAddImage).not.toHaveBeenCalled();
    expect(onScreenshotAction).not.toHaveBeenCalled();
  });
});
