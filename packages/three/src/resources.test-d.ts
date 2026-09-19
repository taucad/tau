import { expectTypeOf } from 'vitest';
import { createThreeResourceDisposer } from '#resources.js';

expectTypeOf(createThreeResourceDisposer).returns.toEqualTypeOf<() => void>();
