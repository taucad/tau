import { describe, expect, it } from 'vitest';

import { parseRevisionTagMessage, revisionTagMessage, tagTrailerPrefix } from '#revision-headers.js';

describe('the version tag trailer (B6)', () => {
  const actor = { kind: 'user', id: 'user_1', name: 'Ada' } as const;

  it('records the number beside the note and the actor, and reads it back', () => {
    const message = revisionTagMessage({ name: 'lid-fit', note: 'Lid fit', actor, number: 5 });
    expect(message).toBe(
      `Lid fit\n\n${tagTrailerPrefix}{"version":1,"note":"Lid fit","actor":{"kind":"user","id":"user_1","name":"Ada"},"number":5}\n`,
    );
    expect(parseRevisionTagMessage(message)).toStrictEqual({ note: 'Lid fit', actor, number: 5 });
  });

  it('reads a tag written before numbers with no number, so it is numbered when read', () => {
    const message = `Lid fit\n\n${tagTrailerPrefix}{"version":1,"note":"Lid fit"}\n`;
    expect(parseRevisionTagMessage(message)).toStrictEqual({ note: 'Lid fit', actor: undefined, number: undefined });
  });

  it('reads nothing from a tag Tau did not write, or a lightweight tag', () => {
    const empty = { note: undefined, actor: undefined, number: undefined };
    expect(parseRevisionTagMessage('v1.0.0\n')).toStrictEqual(empty);
    expect(parseRevisionTagMessage(undefined)).toStrictEqual(empty);
  });

  it.each([
    ['V1, which the Start entry holds', 1],
    ['a number that is not whole', 2.5],
    ['a number below one', 0],
    ['a number spelled as text', '3'],
  ])('refuses a trailer whose number is %s', (_label, number) => {
    const message = `Lid fit\n\n${tagTrailerPrefix}${JSON.stringify({ version: 1, note: 'Lid fit', number })}\n`;
    expect(parseRevisionTagMessage(message)).toStrictEqual({ note: undefined, actor: undefined, number: undefined });
  });

  it('reads the last Tau-Tag line, as the server does', () => {
    const message = `Lid fit\n\n${tagTrailerPrefix}{"version":1,"number":4}\n${tagTrailerPrefix}{"version":1,"number":7}\n`;
    expect(parseRevisionTagMessage(message).number).toBe(7);
  });
});
