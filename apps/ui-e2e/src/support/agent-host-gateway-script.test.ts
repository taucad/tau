// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getToolInputSchema } from '@taucad/chat/schemas';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import { browserHostScript, cubeCylinderCutoutScript } from './agent-host-gateway-script.ts';

/**
 * The guarantee `apps/api/app/api/tau-replay/replay-fixture.schema.test.ts` held
 * before the replay model was deleted, restored over the scripts that replaced
 * it: every scripted tool call is validated against the SAME per-tool input
 * schema the real tool uses, so a tool schema drifting away from a script fails
 * here in a second instead of as an unexplained E2E timeout.
 */
describe.each([
  ['browserHostScript', browserHostScript],
  ['cubeCylinderCutoutScript', cubeCylinderCutoutScript],
] as const)('%s', (_name, script) => {
  it('scripts tool calls the tool input registry accepts', () => {
    for (const call of script.flatMap((turn) => turn.toolCalls ?? [])) {
      const schema = getToolInputSchema(`tool-${call.name}`);
      expect(schema, `unknown tool "${call.name}"`).toBeDefined();
      const parsed = schema!.safeParse(call.args);
      expect(parsed.success ? undefined : `${call.name}: ${parsed.error.message}`).toBeUndefined();
    }
  });

  it('gives every turn something to emit and ends on a turn that stops the loop', () => {
    for (const turn of script) {
      expect((turn.toolCalls?.length ?? 0) > 0 || turn.text !== undefined).toBe(true);
    }
    expect(script.at(-1)?.toolCalls).toBeUndefined();
  });
});
