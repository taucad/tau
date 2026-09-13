// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { Chat } from '@ai-sdk/react';

/**
 * Contract test for the resumable-chat-streams continuation path.
 *
 * `chat-session-store.ts` resumes interrupted streams by calling AI SDK's
 * private `Chat.makeRequest({ trigger: 'submit-message' })` -- the same
 * code path that `sendMessage`/`regenerate`/`resumeStream` use internally,
 * minus the message-mutation step. AI SDK ships `makeRequest` as `private`
 * so a direct property reference is rejected at TS compile time, but the
 * method exists on every runtime instance.
 *
 * If AI SDK ever renames or removes `makeRequest`, this assertion fails
 * loudly and points the maintainer at:
 *   - apps/ui/app/services/chat-session-store.ts (case 'continue')
 *   - apps/ui/app/hooks/chat-persistence.machine.ts (`{ kind: 'continue' }`)
 *   - docs/research/resumable-chat-streams.md (R1 implementation notes)
 *
 * See `node_modules/.pnpm/ai@<version>/.../ai/src/ui/chat.ts` for the
 * canonical declaration. Pinned to `ai@6.0.x` for now.
 */
describe('AI SDK private API contract', () => {
  it('Chat.prototype carries a `makeRequest` method', () => {
    const proto = Chat.prototype as unknown as Record<string, unknown>;
    expect(typeof proto['makeRequest']).toBe('function');
  });

  it('Chat instance carries a callable `makeRequest`', () => {
    const instance = new Chat({ id: 'chat_contract_test' });
    const callable = (instance as unknown as { makeRequest: unknown }).makeRequest;
    expect(typeof callable).toBe('function');
  });

  it('`makeRequest({ trigger: "submit-message" })` returns a Promise without throwing synchronously', async () => {
    const instance = new Chat({ id: 'chat_contract_test' });
    const callable = (instance as unknown as { makeRequest: (args: { trigger: 'submit-message' }) => Promise<void> })
      .makeRequest;
    // Synchronous assertion only -- the call dispatches against a stub
    // transport so the returned promise is allowed to reject (no transport
    // configured); we only need the method to exist + accept the arg shape.
    let result: Promise<void> | undefined;
    expect(() => {
      result = callable.call(instance, { trigger: 'submit-message' });
    }).not.toThrow();
    expect(result).toBeInstanceOf(Promise);
    // Drain the promise so the test runner doesn't see an unhandled rejection.
    try {
      await result;
    } catch {
      // Network/transport rejection is expected in the contract harness.
    }
  });
});

/**
 * Source-shape probe for the "preempt clobber" bug documented in
 * `docs/research/chat-followup-message-swallow.md`.
 *
 * AI SDK v6's `Chat.makeRequest` ends with a `finally` block that (a) reads
 * `this.activeResponse.state.message` WITHOUT optional chaining and (b)
 * unconditionally executes `this.activeResponse = void 0` AFTER calling
 * `onFinish`. Together those two facts let an `onFinish` callback that
 * synchronously triggers a nested `makeRequest` get silently broken: the
 * outer finally nulls out the nested run's freshly-assigned
 * `this.activeResponse`, and the nested run's own finally then throws a
 * swallowed `TypeError: Cannot read properties of undefined`.
 *
 * The defensive `queueMicrotask` wrapper in
 * `chat-session-store.ts`'s `dispatchRequest` listener exists solely to
 * dodge this. The wrapper can be removed once upstream AI SDK either:
 *
 *   - adds optional chaining (`this.activeResponse?.state.message`), or
 *   - moves the `this.activeResponse = void 0` reset to BEFORE `onFinish`.
 *
 * The assertions below grep the compiled SDK source so a non-trivial SDK
 * upgrade that fixes either condition flips this test red and signals the
 * maintainer that the workaround can be retired. The grep is intentionally
 * loose (matches the relevant access patterns rather than full whitespace)
 * so minor bundler reformatting doesn't trip a false positive.
 *
 * `require.resolve` is used (instead of `import.meta.resolve` or a hard-coded
 * path) so the test resolves whatever `ai` version pnpm has actually wired
 * into this workspace. The vitest config for `app/services/*.contract.test.ts`
 * runs in the `node` environment so `require` is available.
 */
describe('AI SDK preempt-clobber source contract', () => {
  // `createRequire(import.meta.url)` is the ESM-friendly way to ask Node
  // where pnpm wired up the `ai` package; using `require.resolve` directly
  // is forbidden by the unicorn/prefer-module rule.
  const aiEntryPath = createRequire(import.meta.url).resolve('ai');
  const aiSource = readFileSync(aiEntryPath, 'utf8');

  it('Chat.makeRequest still reads `this.activeResponse.state.message` without optional chaining inside the `onFinish` invocation', () => {
    // Matches the exact failure-mode access pattern from ai@6.0.x makeRequest
    // finally block:
    //   message: this.activeResponse.state.message,
    // The `message:` object-key prefix distinguishes the bug site from
    // guarded uses of `this.activeResponse.state.message.parts` elsewhere
    // in the file (those sit behind an `if (this.activeResponse)` check).
    // If AI SDK adds optional chaining (`this.activeResponse?.state.message`)
    // or restructures away from this access, this assertion fails and signals
    // that the `queueMicrotask` workaround in chat-session-store.ts can be
    // removed.
    expect(
      aiSource.includes('message: this.activeResponse.state.message'),
      'AI SDK upgraded past the preempt-clobber bug; remove the queueMicrotask wrapper in chat-session-store.ts and the matching coverage in chat-session-store.test.ts ("preempt-clobber defense" describe block).',
    ).toBe(true);
  });

  it('Chat.makeRequest still resets `this.activeResponse = void 0` (the trailing clobber)', () => {
    expect(
      aiSource.includes('this.activeResponse = void 0'),
      'AI SDK changed how `this.activeResponse` is reset; re-audit the preempt-clobber assumptions documented in docs/research/chat-followup-message-swallow.md before removing or relaxing the queueMicrotask workaround.',
    ).toBe(true);
  });

  it('the clobber assignment still appears AFTER the `onFinish` invocation in the same finally block (preempt re-entrancy is still exploitable)', () => {
    // The bug exists only because the clobber runs after onFinish returns.
    // If AI SDK moves the reset BEFORE the onFinish call, a nested
    // makeRequest's assignment survives, the nested finally's access
    // succeeds, and the workaround becomes unnecessary.
    //
    // Anchor on the specific bug-site access pattern. The makeRequest
    // finally block passes `message: this.activeResponse.state.message,` to
    // `onFinish` -- the `message:` prefix distinguishes it from the
    // `this.activeResponse.state.message.parts = ...` mutations elsewhere in
    // the file (which take the activeResponse guard).
    const accessIndex = aiSource.indexOf('message: this.activeResponse.state.message');
    expect(
      accessIndex,
      'AI SDK changed the shape of the `onFinish` invocation; the dangerous unguarded access may have been removed or the call was restructured.',
    ).toBeGreaterThan(-1);

    // The finally block that exhibits the bug is small. Look ~800 chars
    // around the dangerous access for both `this.onFinish` (preceding) and
    // `this.activeResponse = void 0` (following).
    const window = aiSource.slice(Math.max(0, accessIndex - 200), accessIndex + 800);
    const onFinishOffset = window.indexOf('this.onFinish');
    const clobberOffset = window.indexOf('this.activeResponse = void 0');

    expect(
      onFinishOffset,
      'AI SDK restructured the makeRequest finally block; re-audit the preempt-clobber workaround.',
    ).toBeGreaterThan(-1);
    expect(
      clobberOffset,
      'AI SDK moved the trailing `this.activeResponse = void 0` clobber out of the makeRequest finally block; the preempt-clobber bug is likely gone -- remove the queueMicrotask workaround in chat-session-store.ts.',
    ).toBeGreaterThan(-1);
    expect(
      clobberOffset > onFinishOffset,
      'AI SDK now resets `this.activeResponse` before invoking `onFinish`; the preempt-clobber re-entrancy bug is gone and the queueMicrotask wrapper in chat-session-store.ts can be removed.',
    ).toBe(true);
  });
});
