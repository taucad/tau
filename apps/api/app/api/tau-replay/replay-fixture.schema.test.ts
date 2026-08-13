import { describe, expect, it } from 'vitest';
import { replayFixtureSchema } from '#api/tau-replay/replay-fixture.schema.js';
import { cubeCylinderCutoutFixture } from '#api/tau-replay/fixtures/cube-cylinder-cutout.fixture.js';

describe('replayFixtureSchema', () => {
  it('should accept the bundled cube-cutout fixture', () => {
    expect(() => replayFixtureSchema.parse(cubeCylinderCutoutFixture)).not.toThrow();
  });

  it('should reject a tool call whose name is not a real tool (drift guard)', () => {
    const result = replayFixtureSchema.safeParse({
      id: 'x',
      sourceModel: 'y',
      turns: [{ toolCalls: [{ name: 'not_a_tool', args: {} }], usage: { inputTokens: 1, outputTokens: 1 } }],
    });

    expect(result.success).toBe(false);
  });

  it('should reject tool-call args that violate the tool input schema (create_file without content)', () => {
    // If create_file's input schema changes, this is the assertion that fails.
    const result = replayFixtureSchema.safeParse({
      id: 'x',
      sourceModel: 'y',
      turns: [
        {
          toolCalls: [{ name: 'create_file', args: { targetFile: 'main.scad' } }],
          usage: { inputTokens: 1, outputTokens: 1 },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('should reject a turn that neither calls a tool nor produces text', () => {
    const result = replayFixtureSchema.safeParse({
      id: 'x',
      sourceModel: 'y',
      turns: [{ usage: { inputTokens: 1, outputTokens: 1 } }],
    });

    expect(result.success).toBe(false);
  });

  it('should sum per-turn usage to the recorded transcript totals', () => {
    const totals = { input: 0, output: 0 };
    for (const turn of cubeCylinderCutoutFixture.turns) {
      totals.input += turn.usage.inputTokens;
      totals.output += turn.usage.outputTokens;
    }

    expect(totals).toStrictEqual({ input: 25_559, output: 1160 });
  });
});
