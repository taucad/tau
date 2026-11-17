import { describe, expect, it } from 'vitest';
import { suggestEmailDomain } from '#components/auth/email-domain-suggestion.js';

describe('suggestEmailDomain', () => {
  it.each([
    ['ada@gmial.com', 'ada@gmail.com'],
    ['ada@gmail.con', 'ada@gmail.com'],
    ['Ada.Lovelace@HOTMIAL.COM', 'Ada.Lovelace@hotmail.com'],
    ['  ada@yahooo.com ', 'ada@yahoo.com'],
    ['ada@outlok.com', 'ada@outlook.com'],
    ['ada@iclod.com', 'ada@icloud.com'],
  ])('suggests %s -> %s', (typed, expected) => {
    expect(suggestEmailDomain(typed)).toBe(expected);
  });

  it.each(['ada@gmail.com', 'ada@mail.com', 'ada@gmx.com', 'ada@example.co', 'ada@', '@gmial.com', 'ada', ''])(
    'suggests nothing for %s',
    (typed) => {
      expect(suggestEmailDomain(typed)).toBeUndefined();
    },
  );
});
