import { describe, expect, it } from 'vitest';
import { creditAtomsPerCredit } from '@taucad/billing';
import { cardCreditAtomsPerCredit } from '#routes/w.$workspace.$project/chat-error-credits-card.js';

describe('the credits card scale', () => {
  it("matches the billing package's credit atoms per credit", () => {
    expect(cardCreditAtomsPerCredit).toBe(creditAtomsPerCredit);
  });
});
