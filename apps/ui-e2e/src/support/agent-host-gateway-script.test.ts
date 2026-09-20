// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getToolInputSchema } from '@taucad/chat/schemas';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import { browserHostScript, createGatewayScriptWalk, cubeCylinderCutoutScript } from './agent-host-gateway-script.ts';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import type { GatewayScriptRequest } from './agent-host-gateway-script.ts';

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
      expect(
        (turn.toolCalls?.length ?? 0) > 0 ||
          turn.text !== undefined ||
          (turn.textChunks?.length ?? 0) > 0 ||
          turn.reasoning !== undefined ||
          (turn.reasoningChunks?.length ?? 0) > 0,
      ).toBe(true);
    }
    expect(script.at(-1)?.toolCalls).toBeUndefined();
  });
});

/**
 * The walk itself (W3 / blueprint Q5 defect 2).
 *
 * The fixture used to pick its reply by *request ordinal*, which is only right
 * while requests and turns are 1:1. A resumed or retried call for turn 1 then
 * ate the reply scripted for turn 2, and turn 2 drew turn 1's gated entry with
 * no release left. These rows pin the identity the walk keys on instead.
 */
/* eslint-disable @typescript-eslint/naming-convention -- Anthropic's provider wire uses snake_case. */
describe('createGatewayScriptWalk', () => {
  const asked = (text: string): GatewayScriptRequest => ({
    messages: [{ role: 'user', content: [{ type: 'text', text }] }],
  });
  const continued = (text: string): GatewayScriptRequest => ({
    messages: [
      { role: 'user', content: [{ type: 'text', text }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'call-1', name: 'read_file', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'ok' }] },
    ],
  });
  const script = [
    { text: 'Reply one.', usage: { inputTokens: 1, outputTokens: 1 } },
    { text: 'Reply two.', usage: { inputTokens: 1, outputTokens: 1 } },
  ] as const;

  it('replays a turn its own entry when the same turn is asked again', () => {
    const walk = createGatewayScriptWalk(script);
    expect(walk.serve(walk.record(asked('First.'))).text).toBe('Reply one.');
    // The resumed call for turn 1: same user text, a fresh ask.
    expect(walk.serve(walk.record(asked('First.'))).text).toBe('Reply one.');
    expect(walk.serve(walk.record(asked('Second.'))).text).toBe('Reply two.');
  });

  it('walks the next entry for a tool-loop continuation of one turn', () => {
    const walk = createGatewayScriptWalk(script);
    expect(walk.serve(walk.record(asked('First.'))).text).toBe('Reply one.');
    expect(walk.serve(walk.record(continued('First.'))).text).toBe('Reply two.');
  });

  it('wraps the walk so a script shorter than the run still answers', () => {
    const walk = createGatewayScriptWalk(script);
    walk.serve(walk.record(asked('First.')));
    walk.serve(walk.record(continued('First.')));
    expect(walk.serve(walk.record(continued('First.'))).text).toBe('Reply one.');
  });

  it('counts fresh asks apart from tool-loop calls, per turn', () => {
    const walk = createGatewayScriptWalk(script);
    walk.serve(walk.record(asked('First.')));
    walk.record(asked('First.'));
    walk.serve(walk.record(continued('First.')));
    walk.serve(walk.record(asked('Second.')));
    expect(walk.counts()).toEqual([
      { turn: 'First.', asks: 2, calls: 3 },
      { turn: 'Second.', asks: 1, calls: 1 },
    ]);
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- The Anthropic wire fixtures end here. */
