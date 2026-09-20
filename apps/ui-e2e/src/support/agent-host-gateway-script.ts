/**
 * Scripted assistant turns for the Anthropic-wire gateway fixture
 * (`uiInstallAgentHostGatewayFixture`), and the walk that picks one per model
 * request.
 *
 * Both halves of a vertical read this module — the node command writes the
 * wire from it, the browser spec asserts its literals — so a fixture edit can
 * never desync from the assertion that depends on it.
 *
 * The walk is keyed on the *turn* a request asks for, not on the request
 * ordinal: a script entry is a step of one turn's agent loop, and a turn that
 * is asked again (a resume, a *Try again*, a rewind) replays its own steps
 * from where that turn started. Under the ordinal walk a resumed turn-1 call
 * consumed the reply scripted for turn 2, and turn 2 then drew turn 1's gated
 * entry with no release pending (blueprint Q5 defect 2).
 */

/** One scripted `tool_use` block. */
export type GatewayScriptToolCall = {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
};

/**
 * One assistant turn: an optional `thinking` block, an optional `text` block,
 * then the tool calls. A turn with no tool calls stops the agent loop
 * (`end_turn`); any other turn stops on `tool_use`.
 */
export type GatewayScriptTurn = {
  /** Emitted as a `thinking` block ahead of the text. */
  readonly reasoning?: string;
  /** Reasoning deltas emitted in order; each can be held by `gateChunks`. */
  readonly reasoningChunks?: readonly string[];
  /** Separate adjacent reasoning blocks, used to verify one shared UI disclosure. */
  readonly reasoningBlocks?: readonly string[];
  /** Emitted as a `text` block. */
  readonly text?: string;
  /** Prose deltas emitted in order; each can be held by `gateChunks`. */
  readonly textChunks?: readonly string[];
  /** Pause after every scripted reasoning/text delta until the test releases it. */
  readonly gateChunks?: boolean;
  /**
   * Park the response after the text and before the tool calls until
   * `releaseAgentHostGatewayFixture()`, so a spec can act on a run that is
   * provably mid-flight instead of racing it.
   */
  readonly gated?: boolean;
  readonly toolCalls?: readonly GatewayScriptToolCall[];
  /** Per-turn usage, reported the way a provider reports it. */
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
};

/** One captured Anthropic request body, as far as the walk reads it. */
export type GatewayScriptRequest = {
  readonly messages?: ReadonlyArray<{ readonly role?: string; readonly content?: unknown }>;
};

/** Which turn one captured request belongs to. */
export type GatewayRequestStep = {
  /** The user text this turn was asked with; `''` when the turn carried no text block. */
  readonly turn: string;
  /** True when the request carries tool results, i.e. it continues a turn already in flight. */
  readonly isContinuation: boolean;
};

/** How often one turn reached the provider. */
export type GatewayTurnCount = {
  readonly turn: string;
  /** Fresh asks of this turn. More than one means the turn was re-asked — a second charge. */
  readonly asks: number;
  /** Every request of this turn, its agent-loop continuations included. */
  readonly calls: number;
};

const blocksOf = (content: unknown): ReadonlyArray<Readonly<Record<string, unknown>>> =>
  Array.isArray(content) ? (content as ReadonlyArray<Readonly<Record<string, unknown>>>) : [];

const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : blocksOf(content)
        .filter((block) => block['type'] === 'text')
        .map((block) => (typeof block['text'] === 'string' ? block['text'] : ''))
        .join('');

/* A tool result rides a `user` message on this wire, so "the last user message"
 * alone cannot tell a turn apart from its own agent loop. */
const carriesToolResults = (content: unknown): boolean =>
  blocksOf(content).some((block) => block['type'] === 'tool_result');

/**
 * Which turn a captured request asks for.
 *
 * @param request - The captured Anthropic request body.
 * @returns The turn's user text and whether the request continues its loop.
 */
export const gatewayRequestStep = (request: GatewayScriptRequest): GatewayRequestStep => {
  const messages = request.messages ?? [];
  const asked = messages.findLast((message) => message.role === 'user' && !carriesToolResults(message.content));
  return { turn: textOf(asked?.content), isContinuation: carriesToolResults(messages.at(-1)?.content) };
};

/** A script walk: one cursor over `script`, plus where each turn's steps began. */
export type GatewayScriptWalk = {
  /** Count one captured request against its turn. Call it for refused requests too. */
  readonly record: (request: GatewayScriptRequest) => GatewayRequestStep;
  /** The turn to write for one recorded step, advancing that turn's cursor. */
  readonly serve: (step: GatewayRequestStep) => GatewayScriptTurn;
  /** Per-turn provider-call counts, in the order the turns were first asked. */
  readonly counts: () => readonly GatewayTurnCount[];
};

/**
 * Walk one script by turn identity.
 *
 * A fresh ask of an unseen turn takes the next unused entry and remembers where
 * it started; a fresh ask of a turn already seen rewinds to that start; a
 * continuation takes the next entry. The cursor wraps, so a script shorter than
 * the run still answers.
 *
 * @param script - The scripted assistant turns.
 * @returns The walk.
 */
export const createGatewayScriptWalk = (script: readonly GatewayScriptTurn[]): GatewayScriptWalk => {
  const starts = new Map<string, number>();
  const counts = new Map<string, GatewayTurnCount>();
  let cursor = 0;
  return {
    record: (request) => {
      const step = gatewayRequestStep(request);
      const count = counts.get(step.turn) ?? { turn: step.turn, asks: 0, calls: 0 };
      counts.set(step.turn, {
        turn: step.turn,
        asks: count.asks + (step.isContinuation ? 0 : 1),
        calls: count.calls + 1,
      });
      return step;
    },
    serve: ({ turn, isContinuation }) => {
      if (!isContinuation) {
        const start = starts.get(turn);
        if (start === undefined) {
          starts.set(turn, cursor);
        } else {
          cursor = start;
        }
      }
      const scripted = script[cursor % script.length];
      cursor += 1;
      if (!scripted) {
        throw new Error('The agent-host gateway fixture was installed with an empty script.');
      }
      return scripted;
    },
    counts: () => [...counts.values()],
  };
};

/** Streamed before the deterministic gate of the default script's tool turn. */
export const browserHostPartialText = 'Browser host started the workspace change.';
/** Streamed by the default script's final turn. */
export const browserHostFinalText = 'Browser host completed the workspace change.';

/**
 * The default script: one gated tool turn that writes a proof file, then a
 * closing text turn. `browser-agent-host.spec.ts` retries through it, which is
 * why the walk wraps rather than running out.
 */
export const browserHostScript: readonly GatewayScriptTurn[] = [
  {
    text: browserHostPartialText,
    gated: true,
    toolCalls: [
      {
        name: 'create_file',
        args: { targetFile: 'browser-host-proof.txt', content: 'created by the browser agent host\n' },
      },
    ],
    usage: { inputTokens: 20, outputTokens: 8 },
  },
  {
    text: browserHostFinalText,
    usage: { inputTokens: 28, outputTokens: 9 },
  },
];

/** The geospec unit test the assistant writes first. */
export const cubeCylinderMainGeospec = `import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Cube with cylinder cutout', () => {
  it('should be watertight and have correct dimensions', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveBoundingBox({
      size: { x: 20, y: 20, z: 20 },
      center: { x: 0, y: 0, z: 0 },
      tolerance: 0.1,
    });
  });
});
`;

/** The OpenSCAD source the assistant writes second. */
export const cubeCylinderMainScad = `// Cube with cylinder cutout
$fa = 2;
$fs = 0.4;

cube_size = 20;
cylinder_radius = 5;

difference() {
    cube(cube_size, center = true);
    cylinder(h = cube_size + 2, r = cylinder_radius, center = true);
}
`;

/** The closing sentence, its own markdown paragraph and the vertical's success signal. */
export const cubeCylinderSuccessSentence = 'Both the geometry validation and the unit tests passed successfully.';

const cubeCylinderFinalText = [
  'I have designed a parametric cube with a centered cylinder cutout.',
  '',
  '### Design Details',
  String.raw`- **Cube Size**: $20 \times 20 \times 20\text{ mm}$ (centered)`,
  String.raw`- **Cutout**: Cylinder with radius $5\text{ mm}$, passing fully through the Z-axis`,
  String.raw`- **Tessellation**: Adaptive ($fa = 2^\circ$, $fs = 0.4\text{ mm}$) for smooth circular faces`,
  '',
  cubeCylinderSuccessSentence,
].join('\n');

/**
 * The turn this script parks on when it is gated: both files are already on
 * disk and the run is provably mid-flight, which is what the cancellation
 * vertical needs before it presses stop.
 */
export const cubeCylinderKernelTurn = 2;

/**
 * Replay of the "a cube with a cylinder cutout" chat, recorded from
 * google-gemini-3.5-flash. Reasoning and final text come from the project's
 * `.tau/transcripts` JSONL; tool arguments and `create_file` contents come from
 * the exported markdown transcript and the project files. Per-turn usage sums
 * to the recorded totals (25559 in / 1160 out).
 *
 * Moved here from `apps/api/app/api/tau-replay/fixtures/cube-cylinder-cutout.fixture.ts`
 * when the API-side agent loop and its `tau-replay` chat model were deleted:
 * the turns now reach the browser agent host over the Anthropic wire, and the
 * tools they call run for real, minus the capture turn noted inline.
 */
export const cubeCylinderCutoutScript: readonly GatewayScriptTurn[] = [
  {
    // Discovery: inspect the project through its rooted filesystem.
    toolCalls: [
      { name: 'list_directory', args: { path: '' } },
      { name: 'read_file', args: { targetFile: 'main.scad' } },
      { name: 'glob_search', args: { pattern: '**/*.geospec.ts', path: '' } },
    ],
    usage: { inputTokens: 2000, outputTokens: 60 },
  },
  {
    reasoning:
      "**Designing geometric primitives**\n\nI'm focusing on defining the core geometric elements first. My immediate plan is to construct the basic cube shape. Once that's established, I'll proceed to design the cylinder, which is necessary for the subsequent cutout operation.",
    toolCalls: [
      { name: 'create_file', args: { targetFile: 'main.geospec.ts', content: cubeCylinderMainGeospec } },
      { name: 'create_file', args: { targetFile: 'main.scad', content: cubeCylinderMainScad } },
    ],
    usage: { inputTokens: 3500, outputTokens: 400 },
  },
  {
    toolCalls: [{ name: 'get_kernel_result', args: { targetFile: 'main.scad' } }],
    usage: { inputTokens: 3000, outputTokens: 20 },
  },
  {
    toolCalls: [{ name: 'test_model', args: {} }],
    usage: { inputTokens: 3200, outputTokens: 20 },
  },
  {
    /*
     * The capture turn, replayed whole: `multi_angle` then `single`, the two
     * calls the recording made. It is the only turn in this script with two
     * render-driven tools in one response, which is what FIX-SCREENSHOT's
     * single-render-slot livelock needed to reproduce, and its six views are
     * what FIX-CAPTURE-CONTENT's image-block mapping needed — stringified they
     * were ~165 000 tokens of base64 against a 200 000-token window and
     * compaction failed the run; as image blocks the pair costs ~8 500. See
     * `agent-host-transports-and-offline.md` §§ "Addendum: FIX-SCREENSHOT" and
     * "Addendum: FIX-CAPTURE-CONTENT".
     */
    toolCalls: [
      { name: 'screenshot', args: { mode: 'multi_angle', targetFile: 'main.scad' } },
      { name: 'screenshot', args: { mode: 'single', targetFile: 'main.scad' } },
    ],
    usage: { inputTokens: 3400, outputTokens: 40 },
  },
  {
    text: cubeCylinderFinalText,
    usage: { inputTokens: 10_459, outputTokens: 620 },
  },
];

/** The same script parked at {@link cubeCylinderKernelTurn}. */
export const gatedCubeCylinderCutoutScript: readonly GatewayScriptTurn[] = cubeCylinderCutoutScript.map((turn, index) =>
  index === cubeCylinderKernelTurn ? { ...turn, gated: true } : turn,
);
