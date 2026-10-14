import { expect, it } from 'vitest';

it('keeps exact browser text declarations narrower than matching declarations', () => {
  const element = document.createElement('div');
  expect(element).toMatchTextContent(/partial/u);
  expect(element).toHaveTextContent('complete');
  // @ts-expect-error -- Browser equality accepts literal text, not regular expressions.
  expect(element).toHaveTextContent(/partial/u);
});
