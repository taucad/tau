import { describe, expect, it } from 'vitest';
import { replayFixtureSchema } from '#api/tau-replay/replay-fixture.schema.js';
import { cubeCylinderCutoutFixture } from '#api/tau-replay/fixtures/cube-cylinder-cutout.fixture.js';
import { planetaryGearCompositeFixture } from '#api/tau-replay/fixtures/planetary-gear-composite.fixture.js';

describe('replayFixtureSchema', () => {
  it('should accept the bundled cube-cutout fixture', () => {
    expect(() => replayFixtureSchema.parse(cubeCylinderCutoutFixture)).not.toThrow();
  });

  it('should accept the bundled composite planetary-gear fixture', () => {
    expect(() => replayFixtureSchema.parse(planetaryGearCompositeFixture)).not.toThrow();
    expect(planetaryGearCompositeFixture.turns[2]?.toolCalls).toEqual([
      { name: 'get_kernel_result', args: { targetFile: '/main.ts' } },
      { name: 'get_kernel_result', args: { targetFile: '/lib/planetaryGear.ts' } },
    ]);
    expect(planetaryGearCompositeFixture.turns[3]?.toolCalls).toEqual([{ name: 'test_model', args: {} }]);
    expect(planetaryGearCompositeFixture.turns[4]?.toolCalls).toEqual([
      { name: 'screenshot', args: { mode: 'multi_angle', targetFile: '/main.ts' } },
    ]);
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
