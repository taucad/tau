import { describe, expect, it } from 'vitest';
import { toolName } from '#constants/tool.constants.js';
import { uiMessagesSchema } from '#schemas/message.schema.js';
import { useSkillInputSchema, useSkillOutputSchema } from '#schemas/tools/use-skill.tool.schema.js';
import { toolInputSchemas } from '#schemas/tool-input.registry.js';

describe('use_skill schemas', () => {
  it('should register use_skill as a chat tool input', () => {
    expect(toolName.useSkill).toBe('use_skill');
    expect(toolInputSchemas['tool-use_skill']).toBe(useSkillInputSchema);
  });

  it('should validate input and raw markdown output', () => {
    const input = useSkillInputSchema.parse({ skillName: 'woodworking', reason: 'Need joinery guidance' });
    const output = useSkillOutputSchema.parse({
      skillName: 'woodworking',
      resourceUri: 'file:.agents/skills/woodworking/SKILL.md',
      skillPath: '.agents/skills/woodworking/SKILL.md',
      baseDirectory: '.agents/skills/woodworking',
      source: 'user',
      fingerprint: 'abc123',
      frontmatter: { name: 'woodworking' },
      content: '# Woodworking\n\nNo read_file gutters here.',
      supportingFiles: ['.agents/skills/woodworking/references/table.md'],
    });

    expect(input.skillName).toBe('woodworking');
    expect(output.content).not.toContain('\t# Woodworking');
  });

  it('should reject speculative structured arguments', () => {
    const result = useSkillInputSchema.safeParse({
      skillName: 'woodworking',
      reason: 'Need joinery guidance',
      arguments: { joint: 'dovetail' },
    });

    expect(result.success).toBe(false);
    expect(Object.keys(useSkillInputSchema.shape)).toEqual(['skillName', 'reason']);
  });

  it('should validate a virtual system skill output without a filesystem path', () => {
    const output = useSkillOutputSchema.parse({
      skillName: 'create-skill',
      resourceUri: 'system:skills/create-skill/SKILL.md',
      source: 'system',
      fingerprint: 'systemhash',
      frontmatter: { name: 'create-skill' },
      content: '# Create Skill',
      supportingFiles: [],
    });

    expect(output.skillPath).toBeUndefined();
    expect(output.resourceUri).toBe('system:skills/create-skill/SKILL.md');
  });
});

describe('use_skill message parts', () => {
  it('should validate a tool-use_skill message part', () => {
    const messages = uiMessagesSchema.parse([
      {
        id: 'msg_1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-use_skill',
            toolCallId: 'tc_use_skill',
            state: 'output-available',
            input: { skillName: 'woodworking', reason: 'Need joinery guidance' },
            output: {
              skillName: 'woodworking',
              resourceUri: 'file:.agents/skills/woodworking/SKILL.md',
              skillPath: '.agents/skills/woodworking/SKILL.md',
              baseDirectory: '.agents/skills/woodworking',
              source: 'user',
              fingerprint: 'abc123',
              frontmatter: { name: 'woodworking' },
              content: '# Woodworking\n\nNo read_file gutters here.',
              supportingFiles: [],
            },
          },
        ],
      },
    ]);

    expect(messages[0]?.parts[0]?.type).toBe('tool-use_skill');
  });

  it('should reject legacy skill usage data message parts', () => {
    const legacyPartType = ['data', 'skill', 'use'].join('-');
    const legacyDataType = ['skill', 'use'].join('-');

    expect(() =>
      uiMessagesSchema.parse([
        {
          id: 'msg_1',
          role: 'assistant',
          parts: [
            {
              type: legacyPartType,
              id: 'dat_123',
              data: {
                type: legacyDataType,
                id: 'dat_123',
                skillName: 'woodworking',
                skillPath: '.agents/skills/woodworking/SKILL.md',
                source: 'user',
              },
            },
          ],
        },
      ]),
    ).toThrow();
  });
});
