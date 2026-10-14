import { it } from 'vitest';
import type { RequestHandler } from 'express';

import { coiMiddleware } from '#cross-origin-isolation/express.js';

it('preserves the complete express type contracts', () => {
  const expressHandler: RequestHandler = coiMiddleware();

  void expressHandler;
});
