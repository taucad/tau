import { describe, expect, it } from 'vitest';
import { toolName } from '#constants/tool.constants.js';
import { getProviderFacingToolGrant, getProviderFacingToolInputSchemas } from '#schemas/provider-tool-schemas.js';
import type { ModelSupport } from '#types/model.types.js';
import type { ToolSelection } from '#types/tool.types.js';

describe('getProviderFacingToolGrant', () => {
  const everything = getProviderFacingToolInputSchemas({ toolChoice: 'auto', testingEnabled: true }).map(
    (entry) => entry.toolName,
  );
  const settings: ReadonlyArray<{
    under: string;
    toolChoice: ToolSelection;
    testingEnabled: boolean;
    mask: ToolSelection;
  }> = [
    { under: 'the defaults', toolChoice: 'auto', testingEnabled: true, mask: 'auto' },
    {
      under: 'testing off',
      toolChoice: 'auto',
      testingEnabled: false,
      mask: everything.filter((name) => name !== toolName.testModel),
    },
    { under: 'tools off', toolChoice: 'none', testingEnabled: true, mask: 'none' },
    { under: 'tools off with testing off', toolChoice: 'none', testingEnabled: false, mask: 'none' },
    /* A mask lists its tools in the catalog's order, whatever order the person picked them in. */
    {
      under: 'a selection',
      toolChoice: [toolName.readFile, toolName.testModel],
      testingEnabled: true,
      mask: [toolName.testModel, toolName.readFile],
    },
    {
      under: 'a selection with testing off',
      toolChoice: [toolName.readFile, toolName.testModel],
      testingEnabled: false,
      mask: [toolName.readFile],
    },
  ];

  it.each(settings)('should declare every tool and mask by tool choice under $under', ({ mask, ...options }) => {
    const grant = getProviderFacingToolGrant(options);
    expect(grant.allowedTools).toEqual(everything);
    expect(grant.toolChoice).toEqual(mask);
  });

  it('should declare only what the model supports, whatever the settings', () => {
    const textOnly: ModelSupport = { modalities: { input: ['text'], output: ['text'] }, tools: true };
    const grant = getProviderFacingToolGrant({ toolChoice: 'auto', testingEnabled: false, modelSupport: textOnly });
    expect(grant.allowedTools).not.toContain(toolName.screenshot);
    expect(grant.allowedTools).toContain(toolName.testModel);
    expect(grant.toolChoice).not.toContain(toolName.testModel);
  });
});
