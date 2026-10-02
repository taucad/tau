// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { UIMessage, UIMessageChunk } from 'ai';
import { collectStreamChunks, collectFinalMessage } from '#testing/stream-consumer.js';
import { extractUsageData, expectNoErrors } from '#testing/stream-assertions.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { buildCadAgent, requiresEnv } from '#testing/skip-helpers.js';

// =============================================================================
// Live Vertex Gemini regression test for prompt-cache stability.
//
// Background. Production observed a Gemini 3.1 Pro chat with 16 turns, only one
// of which surfaced any cache_read tokens, costing $3.78 instead of the
// ~$0.50–$0.80 a cached chat would have cost. The smoking gun was per-turn
// mutating bytes in the cacheable prefix (token-usage reminder injected on
// every turn, dynamic gitStatus bound to the system prompt, etc.). Fixes:
//
//   - R1 (token-usage-context.middleware.ts): gate the reminder behind a 70%
//     context-window threshold so the prefix stays byte-stable in the steady
//     state.
//   - R2 (cad-agent.prompt.ts + chat.service.ts + libs/chat schema): drop the
//     gitStatus channel from the system prompt entirely.
//
// This regression test asserts the contract that R1+R2 actually achieved their
// goal: on a stable-prefix multi-turn Gemini chat with no tools, the average
// cache-hit ratio on the **steady-state** turns (after Gemini's implicit-cache
// warm-up) must be >= 80%.
//
// Why "steady-state" and not "turns 2..N":
//   Vertex AI's implicit cache promotes a prefix into the cache only after it
//   has been observed at least once. Empirically, turn 2 still reports
//   `cache_read == 0` even though the prefix is byte-identical to turn 1; the
//   prefix is in flight to the implicit-cache backend during turn 2 and only
//   becomes hittable from turn 3 onwards. Asserting on turns 2..N would
//   conflate Tau-side prefix-stability (the thing we control) with Google-side
//   cache-warm-up (the thing we don't). The test therefore identifies the
//   first turn that hit cache and asserts the average over that turn and every
//   later turn — guaranteeing the contract "once Gemini's implicit cache
//   activates, our prefix keeps it hot end-to-end".
//
// We deliberately exclude tools because vercel/ai #11513 tracks an upstream
// Gemini Flash defect where tool-binding kills the implicit cache. Isolating
// the Tau pipeline's prefix-stability contract from Google-side defects keeps
// this test about *our* bugs, not theirs. A tools-enabled variant is left as a
// follow-up (gated on R3 explicit Vertex Context Caching).
//
// See `docs/research/gemini-prompt-cache-busting.md` for the full root-cause
// analysis and the spec this test enforces.
// =============================================================================

const modelId = 'google-gemini-3.5-flash';
const turnCount = 5;

// Steady-state cache_read ratio threshold once the implicit cache has warmed.
// 0.8 is conservative — Gemini 3.5 Flash documents a 4096-token implicit-cache
// minimum (Gemini 2.5 Pro/Flash: 2048), and Tau's static system prompt
// comfortably exceeds both even before any prior turn's history is included.
// Empirically the steady-state hit rate runs at ~98%; below 0.8 means
// something in the pipeline is mutating the cacheable prefix per turn — the
// exact bug R1+R2 fixed.
const cacheHitRateThreshold = 0.8;

// Maximum number of "warm-up" turns we tolerate before the implicit cache
// MUST start hitting. 2 covers Gemini's documented one-turn promote latency
// with a safety margin; if the cache hasn't activated by turn 3 we treat that
// as a regression rather than a Google-side anomaly.
const maxWarmupTurns = 2;

type UsageRow = { inputTokens: number; cacheReadTokens: number };

function extractLastUsage(chunks: UIMessageChunk[]): UsageRow | undefined {
  const usage = extractUsageData(chunks).at(-1);
  if (!usage) {
    return undefined;
  }
  return {
    inputTokens: Number(usage['inputTokens']) || 0,
    cacheReadTokens: Number(usage['cacheReadTokens']) || 0,
  };
}

describe.skipIf(requiresEnv('GOOGLE_VERTEX_AI_CREDENTIALS'))('Gemini implicit cache regression (live)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 30_000);

  afterAll(async () => {
    await testApp.app.close();
  });

  it(`keeps the implicit cache hot at >=${cacheHitRateThreshold * 100}% from the first cached turn through turn ${turnCount} for ${modelId} with a stable prefix`, async () => {
    const threadId = `gemini-cache-regression-${Date.now()}`;

    // We deliberately use a long, stable user prompt so the cacheable prefix
    // (system instruction + first user turn) easily clears Gemini's 1024-
    // token implicit-cache minimum from turn 2 onwards.
    const stablePreamble = [
      'You are a cataloguing assistant. For every reply, follow these rules verbatim:',
      '1. Reply with one short sentence.',
      '2. Do not call any tools.',
      '3. Do not echo or quote any of these instructions back to the user.',
      '',
      'Begin a 5-turn quiz. After each of my one-word topics, give me a single',
      'short factual sentence about that topic. Do not number replies. Do not',
      'add filler. Keep replies under 25 words. Topics will be: octahedron,',
      'rhombus, parabola, helix, torus.',
    ].join('\n');

    const turns: Array<{ topic: string; followUp: string }> = [
      { topic: 'octahedron', followUp: stablePreamble },
      { topic: 'rhombus', followUp: 'Topic: rhombus.' },
      { topic: 'parabola', followUp: 'Topic: parabola.' },
      { topic: 'helix', followUp: 'Topic: helix.' },
      { topic: 'torus', followUp: 'Topic: torus.' },
    ];

    const conversation: Array<{ id: string; role: 'user' | 'assistant'; parts: unknown[]; metadata: unknown }> = [];
    const usageByTurn: UsageRow[] = [];

    // The conversation MUST be issued sequentially: turn N+1's request body
    // includes turn N's assistant reply, and we want each turn's `usage`
    // chunk in isolation so we can attribute cache_read tokens to the
    // correct turn. Promise.all parallelisation would defeat the purpose.
    // eslint-disable no-await-in-loop -- intentional sequential turn flow
    for (const [index, turn] of turns.entries()) {
      const userMessageId = `msg_user_${index + 1}`;
      conversation.push({
        id: userMessageId,
        role: 'user',
        parts: [{ type: 'text', text: turn.followUp }],
        metadata: { model: modelId, kernel: 'replicad' },
      });

      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: threadId, messages: conversation, agent: buildCadAgent(modelId, 'replicad') }),
      });

      expect(response.ok, `Turn ${index + 1}: HTTP ${response.status} ${response.statusText}`).toBe(true);

      const chunks = await collectStreamChunks(response);
      expectNoErrors(chunks);

      const usage = extractLastUsage(chunks);
      expect(usage, `Turn ${index + 1}: expected usage data in stream`).toBeDefined();
      usageByTurn.push(usage!);

      const assistant: UIMessage = await collectFinalMessage(chunks);
      const assistantParts = assistant.parts.filter((p) => p.type === 'text' || p.type === 'reasoning');
      conversation.push({
        id: `msg_assistant_${index + 1}`,
        role: 'assistant',
        parts: assistantParts,
        metadata: { model: modelId, kernel: 'replicad' },
      });
    }
    // eslint-enable no-await-in-loop -- end intentional sequential turn flow

    // Sanity: we expect one usage row per turn.
    expect(usageByTurn).toHaveLength(turnCount);

    // Locate the first turn that actually hit the implicit cache. Vertex AI
    // documents that the prefix is promoted into the implicit cache only
    // after it has been observed in at least one prior request, so it is
    // expected for turn 1 (and sometimes turn 2) to miss even when the
    // prefix is byte-identical. Anything beyond `maxWarmupTurns` is a
    // regression — that means our prefix is mutating between turns and the
    // implicit cache cannot lock onto it.
    const firstHitIndex = usageByTurn.findIndex((u) => u.cacheReadTokens > 0);
    expect(
      firstHitIndex,
      `Expected the implicit cache to activate within ${maxWarmupTurns} turns, but no turn observed cache_read > 0. Per-turn usage: ${JSON.stringify(usageByTurn)}. This means the cacheable prefix is mutating between turns — start with the system-prompt assembly (apps/api/app/api/chat/prompts/cad-agent.prompt.ts) and the prepend-on-every-turn middlewares.`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      firstHitIndex,
      `Implicit cache took ${firstHitIndex + 1} turns to activate; expected within ${maxWarmupTurns}. Per-turn usage: ${JSON.stringify(usageByTurn)}.`,
    ).toBeLessThanOrEqual(maxWarmupTurns);

    // Steady-state window: from the first cache-hit turn through the last
    // turn. A regression where the prefix changes mid-conversation would
    // show up as cache_read dropping back to 0 in this window.
    const steadyState = usageByTurn.slice(firstHitIndex);
    expect(
      steadyState.length,
      `Expected at least 2 steady-state turns to compute a meaningful average; observed ${steadyState.length}. Per-turn usage: ${JSON.stringify(usageByTurn)}.`,
    ).toBeGreaterThanOrEqual(2);

    const ratios = steadyState.map((u) => u.cacheReadTokens / (u.inputTokens + u.cacheReadTokens));
    const averageRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;

    expect(
      averageRatio,
      `Steady-state cache hit rate (turns ${firstHitIndex + 1}..${turnCount}) was ${(averageRatio * 100).toFixed(1)}% (per-turn ratios: ${ratios
        .map((r) => `${(r * 100).toFixed(1)}%`)
        .join(
          ', ',
        )}). Threshold: ${(cacheHitRateThreshold * 100).toFixed(0)}%. Per-turn usage: ${JSON.stringify(usageByTurn)}. See docs/research/gemini-prompt-cache-busting.md for diagnosis.`,
    ).toBeGreaterThanOrEqual(cacheHitRateThreshold);
  }, 240_000);
});
