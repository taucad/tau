import { describe, expect, it } from 'vitest';

import { createLoopbackHandOff, handOffCodeLifetime, sessionOfSubprotocols } from '#hand-off.js';

const desktop = 'app://tau';

describe('createLoopbackHandOff', () => {
  it('should redeem a code once for a session bound to the redeeming origin', () => {
    const handOff = createLoopbackHandOff();
    const { code } = handOff.mint();

    const session = handOff.redeem(code, desktop);

    expect(session).toMatch(/^[\w-]{43}$/u);
    expect(handOff.admits(session!, desktop)).toBe(true);
    expect(handOff.admits(session!, 'https://tau.new')).toBe(false);
    expect(handOff.admits(session!, undefined)).toBe(false);
    expect(handOff.redeem(code, desktop)).toBeUndefined();
  });

  it('should refuse a code redeemed after its lifetime, and spend it', () => {
    let now = 1000;
    const handOff = createLoopbackHandOff({ now: () => now });
    const { code, expiresAt } = handOff.mint();

    expect(expiresAt).toBe(1000 + handOffCodeLifetime);
    now = expiresAt;
    expect(handOff.redeem(code, desktop)).toBeUndefined();
    now = 1000;
    expect(handOff.redeem(code, desktop)).toBeUndefined();
  });

  it('should refuse a code it never minted, and admit no session it never issued', () => {
    const handOff = createLoopbackHandOff();
    handOff.mint();

    expect(handOff.redeem('not-a-code', desktop)).toBeUndefined();
    expect(handOff.admits('not-a-session', desktop)).toBe(false);
  });

  it('should mint a distinct code each time', () => {
    const handOff = createLoopbackHandOff();

    expect(handOff.mint().code).not.toBe(handOff.mint().code);
  });
});

describe('sessionOfSubprotocols', () => {
  it('should read the session beside the agent subprotocol', () => {
    expect(sessionOfSubprotocols('tau-agent, tau-session.abc_-1')).toBe('abc_-1');
    expect(sessionOfSubprotocols('tau-agent')).toBe('');
    expect(sessionOfSubprotocols(undefined)).toBe('');
  });
});
