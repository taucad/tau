import type { RequestHandler } from 'express';

import { coiMiddleware } from '#cross-origin-isolation/express.js';

const expressHandler: RequestHandler = coiMiddleware();

void expressHandler;
