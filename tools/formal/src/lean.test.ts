import { describe, expect, it } from 'vitest';
import { firstDifferingLine, leanOutputProblems, leanSourceProblems, unauditedTheorems } from '#lean.js';

const allowlist = ['propext', 'Quot.sound', 'Classical.choice'];

describe('leanOutputProblems', () => {
  it('should pass theorems whose axioms are within the allowlist', () => {
    const output = [
      "'ChatLedger.inv_init' depends on axioms: [propext, Quot.sound]",
      "'ChatLedger.t1' does not depend on any axioms",
    ].join('\n');

    expect(leanOutputProblems(output, allowlist)).toEqual([]);
  });

  it('should report sorryAx and an axiom outside the allowlist', () => {
    const output = [
      "'ChatLedger.t3' depends on axioms: [propext, sorryAx]",
      "'ChatLedger.t5' depends on axioms: [Lean.ofReduceBool]",
    ].join('\n');

    expect(leanOutputProblems(output, allowlist)).toEqual([
      "'ChatLedger.t3' depends on sorryAx",
      "'ChatLedger.t5' depends on Lean.ofReduceBool",
    ]);
  });

  it('should report a declaration that uses sorry and a compile error', () => {
    const output = [
      "ChatLedgerProofs.lean:12:8: warning: declaration uses 'sorry'",
      'ChatLedger.lean:40:2: error: unknown identifier',
    ].join('\n');

    expect(leanOutputProblems(output, allowlist)).toEqual([
      "ChatLedgerProofs.lean:12:8: warning: declaration uses 'sorry'",
      'ChatLedger.lean:40:2: error: unknown identifier',
    ]);
  });
});

describe('leanSourceProblems', () => {
  it('should allow Init, Std and the spec modules', () => {
    expect(
      leanSourceProblems('P.lean', 'import Std.Data\nimport ChatLedger\ntheorem x : True := trivial', ['ChatLedger']),
    ).toEqual([]);
  });

  it('should report Mathlib, sorry and native_decide (FM-R9)', () => {
    const text = 'import Mathlib.Data\ntheorem x : 1 = 1 := by native_decide\ntheorem y : True := sorry';

    expect(leanSourceProblems('P.lean', text, [])).toEqual([
      'P.lean imports Mathlib.Data',
      'P.lean uses native_decide',
      'P.lean uses sorry',
    ]);
  });

  it('should report a declared axiom', () => {
    expect(leanSourceProblems('P.lean', 'axiom cheat : False', [])).toEqual(['P.lean declares an axiom']);
  });
});

describe('unauditedTheorems', () => {
  it('should list a theorem that no #print axioms names', () => {
    const proofs = 'theorem inv_init : True := trivial\ntheorem t9 : True := trivial';
    const audit = '#print axioms Ledger.inv_init';

    expect(unauditedTheorems([proofs, audit], 'Ledger')).toEqual(['Ledger.t9']);
  });
});

describe('firstDifferingLine', () => {
  it('should name the first line where the goldens and the oracle differ', () => {
    expect(firstDifferingLine('T a\nA 0 appended\nX\n', 'T a\nA 0 duplicate\nX\n')).toBe(
      'line 2: expected "A 0 appended", got "A 0 duplicate"',
    );
    expect(firstDifferingLine('T a\n', 'T a\n')).toBeUndefined();
  });
});
