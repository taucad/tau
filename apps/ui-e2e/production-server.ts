import { createServer } from 'node:http';
import process from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createRequestHandler } from '@react-router/express';
import { coiMiddleware } from '@taucad/runtime/cross-origin-isolation/express';

const buildRoot = process.env['TAU_E2E_UI_BUILD_ROOT'];
if (buildRoot === undefined) {
  throw new Error('TAU_E2E_UI_BUILD_ROOT is required.');
}

const build = (await import(pathToFileURL(resolve(buildRoot, 'server/index.js')).href)) as Parameters<
  typeof createRequestHandler
>[0]['build'];
const app = express();
app.disable('x-powered-by');
app.use(coiMiddleware());
app.use('/assets', express.static(resolve(buildRoot, 'client/assets'), { immutable: true, maxAge: '1y' }));
app.use(express.static(resolve(buildRoot, 'client'), { maxAge: '1h' }));
app.all('*splat', createRequestHandler({ build }));
createServer(app).listen(Number(process.env['PORT'] ?? '3013'));
