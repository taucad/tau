import { expectTypeOf, it } from 'vitest';
import { createThreeResourceDisposer } from '#resources.js';

it('preserves the complete resources type contracts', () => {
  expectTypeOf(createThreeResourceDisposer).returns.toEqualTypeOf<() => void>();
});
