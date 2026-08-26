import { describe, expect, expectTypeOf, it } from 'vitest';
import type { MyToolPart } from '#types/message.types.js';
import type { MyDynamicToolPart } from '#utils/tool-part.utils.js';
import { getToolPartName } from '#utils/tool-part.utils.js';

describe('getToolPartName', () => {
  it('preserves static tool keys and dynamic tool names', () => {
    const staticPart = {
      type: 'tool-read_file',
      toolCallId: 'static-call',
      state: 'input-available',
      input: { targetFile: 'main.ts' },
    } satisfies MyToolPart;
    const dynamicPart = {
      type: 'dynamic-tool',
      toolName: 'custom_tool',
      toolCallId: 'dynamic-call',
      state: 'input-available',
      input: {},
    } satisfies MyDynamicToolPart;

    const staticName = getToolPartName(staticPart);
    const dynamicName = getToolPartName(dynamicPart);

    expectTypeOf(staticName).toEqualTypeOf<'read_file'>();
    expectTypeOf(dynamicName).toEqualTypeOf<string>();
    expect(staticName).toBe('read_file');
    expect(dynamicName).toBe('custom_tool');
  });
});
